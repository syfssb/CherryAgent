import { FSWatcher, watch } from "fs";
import { stat, access } from "fs/promises";
import { constants } from "fs";
import { BrowserWindow } from "electron";
import { normalize, resolve } from "path";

export type WorkspaceEvent =
  | { type: "workspace:exists"; path: string; exists: boolean }
  | { type: "workspace:deleted"; path: string }
  | { type: "workspace:changed"; path: string; event: "rename" | "change"; filename?: string }
  | { type: "workspace:error"; path: string; error: string };

export type WorkspaceStatus = {
  path: string;
  exists: boolean;
  isWatching: boolean;
  lastChecked: number;
};

class WorkspaceWatcher {
  private watcher: FSWatcher | null = null;
  private watchedPath: string | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastStatus: WorkspaceStatus | null = null;

  /**
   * 开始监听工作目录
   */
  async watchWorkspace(targetPath: string): Promise<WorkspaceStatus> {
    const normalizedPath = normalize(resolve(targetPath));

    // 如果已经在监听相同路径，直接返回状态
    if (this.watchedPath === normalizedPath && this.watcher) {
      return this.getStatus();
    }

    // 停止之前的监听
    this.unwatchWorkspace();

    // 检查目录是否存在
    const exists = await this.checkExists(normalizedPath);

    this.watchedPath = normalizedPath;
    this.lastStatus = {
      path: normalizedPath,
      exists,
      isWatching: false,
      lastChecked: Date.now()
    };

    if (!exists) {
      this.broadcast({ type: "workspace:exists", path: normalizedPath, exists: false });
      // 启动定期检查，等待目录被创建
      this.startPeriodicCheck();
      return this.lastStatus;
    }

    try {
      // 使用 fs.watch 监听目录（支持递归的平台优先启用）
      this.watcher = this.createWatcher(normalizedPath);

      this.watcher.on("error", (error) => {
        console.error("[workspace-watcher] Watcher error:", error);
        this.broadcast({
          type: "workspace:error",
          path: normalizedPath,
          error: error.message
        });
        // 尝试重新监听
        this.restartWatcher();
      });

      this.watcher.on("close", () => {
        if (this.watchedPath) {
          // 目录可能被删除
          this.handlePossibleDeletion();
        }
      });

      this.lastStatus.isWatching = true;
      this.lastStatus.exists = true;

      // 启动定期检查（作为备份机制）
      this.startPeriodicCheck();

      this.broadcast({ type: "workspace:exists", path: normalizedPath, exists: true });

      return this.lastStatus;
    } catch (error) {
      console.error("[workspace-watcher] Failed to watch:", error);
      this.lastStatus.isWatching = false;
      this.broadcast({
        type: "workspace:error",
        path: normalizedPath,
        error: error instanceof Error ? error.message : "Failed to watch directory"
      });
      return this.lastStatus;
    }
  }

  /**
   * 停止监听工作目录
   */
  unwatchWorkspace(): void {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {
        // 忽略关闭错误
      }
      this.watcher = null;
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.watchedPath = null;
    this.lastStatus = null;
  }

  /**
   * 检查目录是否存在
   */
  async checkExists(targetPath?: string): Promise<boolean> {
    const pathToCheck = targetPath ?? this.watchedPath;
    if (!pathToCheck) return false;

    try {
      await access(pathToCheck, constants.R_OK);
      const stats = await stat(pathToCheck);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): WorkspaceStatus {
    if (!this.lastStatus) {
      return {
        path: "",
        exists: false,
        isWatching: false,
        lastChecked: 0
      };
    }
    return { ...this.lastStatus };
  }

  /**
   * 获取当前监听的路径
   */
  getWatchedPath(): string | null {
    return this.watchedPath;
  }

  /**
   * 处理文件系统事件
   */
  private handleFsEvent(eventType: string, filename: string | null): void {
    if (this.watchedPath) {
      const normalizedEvent = eventType === "rename" ? "rename" : "change";
      this.broadcast({
        type: "workspace:changed",
        path: this.watchedPath,
        event: normalizedEvent,
        filename: filename ?? undefined
      });
    }

    // rename 事件通常表示文件/目录被删除或重命名
    if (eventType === "rename" && this.watchedPath) {
      this.handlePossibleDeletion();
    }
  }

  /**
   * 创建文件系统监听器（递归优先）
   */
  private createWatcher(targetPath: string): FSWatcher {
    try {
      return watch(targetPath, { persistent: false, recursive: true }, (eventType, filename) => {
        this.handleFsEvent(eventType, filename);
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") {
        console.warn("[workspace-watcher] Recursive watch not available, falling back to non-recursive:", error);
      }
      return watch(targetPath, { persistent: false }, (eventType, filename) => {
        this.handleFsEvent(eventType, filename);
      });
    }
  }

  /**
   * 处理可能的目录删除
   */
  private async handlePossibleDeletion(): Promise<void> {
    if (!this.watchedPath) return;

    const exists = await this.checkExists();

    if (this.lastStatus) {
      this.lastStatus.exists = exists;
      this.lastStatus.lastChecked = Date.now();
    }

    if (!exists) {
      this.broadcast({ type: "workspace:deleted", path: this.watchedPath });

      // 停止当前 watcher，但保持路径以便定期检查
      if (this.watcher) {
        try {
          this.watcher.close();
        } catch {
          // 忽略
        }
        this.watcher = null;
      }

      if (this.lastStatus) {
        this.lastStatus.isWatching = false;
      }
    }
  }

  /**
   * 启动定期检查
   */
  private startPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // 每 5 秒检查一次目录状态
    this.checkInterval = setInterval(async () => {
      await this.periodicCheck();
    }, 5000);
  }

  /**
   * 定期检查目录状态
   */
  private async periodicCheck(): Promise<void> {
    if (!this.watchedPath) return;

    const exists = await this.checkExists();
    const wasExisting = this.lastStatus?.exists ?? false;

    if (this.lastStatus) {
      this.lastStatus.exists = exists;
      this.lastStatus.lastChecked = Date.now();
    }

    // 状态发生变化
    if (exists !== wasExisting) {
      if (!exists) {
        this.broadcast({ type: "workspace:deleted", path: this.watchedPath });

        // 停止 watcher
        if (this.watcher) {
          try {
            this.watcher.close();
          } catch {
            // 忽略
          }
          this.watcher = null;
        }

        if (this.lastStatus) {
          this.lastStatus.isWatching = false;
        }
      } else {
        // 目录恢复存在，重新开始监听
        this.broadcast({ type: "workspace:exists", path: this.watchedPath, exists: true });
        this.restartWatcher();
      }
    }
  }

  /**
   * 重新启动 watcher
   */
  private async restartWatcher(): Promise<void> {
    if (!this.watchedPath) return;

    const path = this.watchedPath;

    // 先关闭现有 watcher
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {
        // 忽略
      }
      this.watcher = null;
    }

    // 等待一小段时间再重新监听
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 确保路径没有变化
    if (this.watchedPath !== path) return;

    const exists = await this.checkExists();
    if (!exists) return;

    try {
      this.watcher = this.createWatcher(path);

      this.watcher.on("error", (error) => {
        console.error("[workspace-watcher] Watcher error:", error);
        this.restartWatcher();
      });

      if (this.lastStatus) {
        this.lastStatus.isWatching = true;
      }
    } catch (error) {
      console.error("[workspace-watcher] Failed to restart watcher:", error);
    }
  }

  /**
   * 广播事件到所有窗口
   */
  private broadcast(event: WorkspaceEvent): void {
    const payload = JSON.stringify(event);
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send("workspace-event", payload);
    }
  }
}

// 导出单例
export const workspaceWatcher = new WorkspaceWatcher();

// 导出辅助函数
export async function checkWorkspaceExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.R_OK);
    const stats = await stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export function normalizeWorkspacePath(targetPath: string): string {
  return normalize(resolve(targetPath));
}
