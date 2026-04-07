import { clipboard, dialog, ipcMain, nativeImage, shell } from "electron";
import { resolve, normalize, isAbsolute, relative, dirname, basename, extname } from "path";
import { readdir, rm, stat, mkdir, copyFile } from "fs/promises";
import { tDesktop } from "../libs/desktop-i18n.js";
import { workspaceWatcher, checkWorkspaceExists, normalizeWorkspacePath } from "../libs/workspace-watcher.js";
import { addRecentWorkspace, getRecentWorkspaces, removeRecentWorkspace, getCommonDirs, getSystemTempDir, resolveDefaultCwd, setDefaultCwdPreference } from "../libs/recent-workspaces.js";

let workspaceClipboardSource: string | null = null;

/**
 * 注册工作区相关的 IPC 处理器
 */
export function registerWorkspaceHandlers(): void {
  // 防御性移除，避免重复注册导致异常
  const workspaceChannels = [
    "workspace:watch", "workspace:unwatch", "workspace:exists", "workspace:getStatus",
    "workspace:getRecent", "workspace:addRecent", "workspace:removeRecent",
    "workspace:getCommonDirs", "workspace:getTempDir", "workspace:listDir",
    "workspace:searchFiles", "workspace:copyEntry", "workspace:pasteEntry",
    "workspace:deleteEntry", "workspace:deleteFile", "workspace:setDefaultCwd",
    "shell:showItemInFolder", "shell:openPath", "clipboard:writeImage",
  ];
  for (const ch of workspaceChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  const resolveWorkspaceRoot = (): string | null => {
    const watchedRoot = workspaceWatcher.getWatchedPath();
    if (!watchedRoot) return null;
    return normalize(resolve(watchedRoot));
  };

  const isInsideWorkspace = (workspaceRoot: string, targetPath: string): boolean => {
    const relPath = relative(workspaceRoot, targetPath);
    return relPath === "" || (!relPath.startsWith("..") && !isAbsolute(relPath));
  };

  const resolveWorkspaceTarget = (
    workspaceRoot: string,
    inputPath?: string,
  ): string => {
    if (!inputPath) return workspaceRoot;
    const normalizedTarget = isAbsolute(inputPath)
      ? normalize(resolve(inputPath))
      : normalize(resolve(workspaceRoot, inputPath));

    if (!isInsideWorkspace(workspaceRoot, normalizedTarget)) {
      throw new Error(tDesktop("workspace.pathOutsideWorkspace"));
    }

    return normalizedTarget;
  };

  const pathExists = async (targetPath: string): Promise<boolean> => {
    try {
      await stat(targetPath);
      return true;
    } catch {
      return false;
    }
  };

  const copyPathRecursive = async (sourcePath: string, destinationPath: string): Promise<void> => {
    const sourceStat = await stat(sourcePath);
    if (sourceStat.isDirectory()) {
      await mkdir(destinationPath, { recursive: true });
      const entries = await readdir(sourcePath, { withFileTypes: true });
      for (const entry of entries) {
        const childSource = resolve(sourcePath, entry.name);
        const childDest = resolve(destinationPath, entry.name);
        await copyPathRecursive(childSource, childDest);
      }
      return;
    }

    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  };

  const resolveAvailableDestination = async (
    targetDir: string,
    sourceName: string,
  ): Promise<string> => {
    const sourceExt = extname(sourceName);
    const sourceBase = sourceExt ? sourceName.slice(0, -sourceExt.length) : sourceName;

    for (let index = 0; index < 1000; index += 1) {
      const candidateName =
        index === 0
          ? sourceName
          : index === 1
            ? `${sourceBase} copy${sourceExt}`
            : `${sourceBase} copy ${index}${sourceExt}`;
      const candidatePath = resolve(targetDir, candidateName);
      if (!(await pathExists(candidatePath))) {
        return candidatePath;
      }
    }

    throw new Error("Unable to generate available destination path");
  };

  // workspace:watch - 开始监听工作目录
  ipcMain.handle("workspace:watch", async (_, path: string) => {
    try {
      const status = await workspaceWatcher.watchWorkspace(path);
      // 同时添加到最近使用列表
      if (status.exists) {
        addRecentWorkspace(path);
      }
      return {
        success: true,
        data: status
      };
    } catch (error) {
      console.error("[ipc-handlers] workspace:watch failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.watchFailed")
      };
    }
  });

  // workspace:unwatch - 停止监听工作目录
  ipcMain.handle("workspace:unwatch", () => {
    try {
      workspaceWatcher.unwatchWorkspace();
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] workspace:unwatch failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.unwatchFailed")
      };
    }
  });

  // workspace:exists - 检查目录是否存在
  ipcMain.handle("workspace:exists", async (_, path: string) => {
    try {
      const exists = await checkWorkspaceExists(path);
      return {
        success: true,
        data: { path: normalizeWorkspacePath(path), exists }
      };
    } catch (error) {
      console.error("[ipc-handlers] workspace:exists failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.checkFailed")
      };
    }
  });

  // workspace:getStatus - 获取当前监听状态
  ipcMain.handle("workspace:getStatus", () => {
    try {
      const status = workspaceWatcher.getStatus();
      return {
        success: true,
        data: status
      };
    } catch (error) {
      console.error("[ipc-handlers] workspace:getStatus failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.getStatusFailed")
      };
    }
  });

  // workspace:getRecent - 获取最近使用的工作目录（自动过滤已删除的目录）
  ipcMain.handle("workspace:getRecent", async (_, limit?: number) => {
    try {
      const recent = getRecentWorkspaces(limit);
      // 并发检查所有路径是否仍然存在，过滤已删除的目录并自动清理 store
      const existsResults = await Promise.all(
        recent.map((w) => checkWorkspaceExists(w.path).catch(() => false))
      );
      const valid = recent.filter((_, i) => existsResults[i]);
      const removed = recent.filter((_, i) => !existsResults[i]);
      for (const w of removed) {
        removeRecentWorkspace(w.path);
      }
      return {
        success: true,
        data: valid
      };
    } catch (error) {
      console.error("[ipc-handlers] workspace:getRecent failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.getRecentFailed")
      };
    }
  });

  // workspace:addRecent - 添加到最近使用
  ipcMain.handle("workspace:addRecent", (_, path: string) => {
    try {
      const workspace = addRecentWorkspace(path);
      return {
        success: true,
        data: workspace
      };
    } catch (error) {
      console.error("[ipc-handlers] workspace:addRecent failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.addRecentFailed")
      };
    }
  });

  // workspace:removeRecent - 从最近使用中移除
  ipcMain.handle("workspace:removeRecent", (_, path: string) => {
    try {
      const removed = removeRecentWorkspace(path);
      return {
        success: true,
        data: { removed }
      };
    } catch (error) {
      console.error("[ipc-handlers] workspace:removeRecent failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.removeRecentFailed")
      };
    }
  });

  // workspace:getCommonDirs - 获取常用目录
  ipcMain.handle("workspace:getCommonDirs", () => {
    try {
      const dirs = getCommonDirs();
      return {
        success: true,
        data: dirs
      };
    } catch (error) {
      console.error("[ipc-handlers] workspace:getCommonDirs failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.getCommonDirsFailed")
      };
    }
  });

  // workspace:getTempDir - 获取系统临时目录
  ipcMain.handle("workspace:getTempDir", () => {
    try {
      const tempDir = getSystemTempDir();
      return {
        success: true,
        data: { path: tempDir }
      };
    } catch (error) {
      console.error("[ipc-handlers] workspace:getTempDir failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.getTempDirFailed")
      };
    }
  });

  // workspace:listDir - 列出目录内容（仅限当前工作目录内）
  ipcMain.handle(
    "workspace:listDir",
    async (_: any, dirPath?: string, options?: { ignorePatterns?: string[]; limit?: number }) => {
      try {
        const watchedRoot = workspaceWatcher.getWatchedPath();
        if (!watchedRoot) {
          return {
            success: false,
            error: tDesktop("workspace.noWorkspaceWatched")
          };
        }

        const normalizedRoot = normalize(resolve(watchedRoot));
        const targetPath = dirPath
          ? isAbsolute(dirPath)
            ? normalize(resolve(dirPath))
            : normalize(resolve(normalizedRoot, dirPath))
          : normalizedRoot;

        if (!targetPath.startsWith(normalizedRoot)) {
          return {
            success: false,
            error: tDesktop("workspace.pathOutsideWorkspace")
          };
        }

        const ignorePatterns = options?.ignorePatterns ?? [];
        const defaultIgnore = ["node_modules", ".git"];
        const patterns = [...defaultIgnore, ...ignorePatterns];

        const shouldIgnore = (name: string): boolean => {
          if (name.startsWith(".env")) return true;
          if (patterns.includes(name)) return true;
          return patterns.some((pattern) => {
            if (!pattern.includes("*") && !pattern.includes("?")) return false;
            const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
            return regex.test(name);
          });
        };

        const entries = await readdir(targetPath, { withFileTypes: true });
        const limit = options?.limit && options.limit > 0 ? options.limit : 100;

        const mapped = entries
          .filter((entry) => !shouldIgnore(entry.name))
          .slice(0, limit)
          .map((entry) => {
            const fullPath = resolve(targetPath, entry.name);
            return {
              name: entry.name,
              path: fullPath,
              relativePath: relative(normalizedRoot, fullPath),
              type: entry.isDirectory() ? "directory" : "file"
            };
          });

        return {
          success: true,
          data: {
            path: targetPath,
            items: mapped
          }
        };
      } catch (error) {
        console.error("[ipc-handlers] workspace:listDir failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : tDesktop("workspace.listDirFailed")
        };
      }
    }
  );

  // workspace:searchFiles - 递归搜索文件名
  ipcMain.handle(
    "workspace:searchFiles",
    async (_: any, query: string, options?: { ignorePatterns?: string[]; limit?: number }) => {
      try {
        const watchedRoot = workspaceWatcher.getWatchedPath();
        if (!watchedRoot) {
          return { success: false, error: tDesktop("workspace.noWorkspaceWatched") };
        }

        const normalizedRoot = normalize(resolve(watchedRoot));
        const ignorePatterns = options?.ignorePatterns ?? [];
        const defaultIgnore = ["node_modules", ".git", ".next", "dist", "build", ".cache", "__pycache__", ".venv", "venv"];
        const patterns = [...defaultIgnore, ...ignorePatterns];
        const maxResults = options?.limit && options.limit > 0 ? options.limit : 50;
        const normalizedQuery = query.trim().toLowerCase();

        if (!normalizedQuery) {
          return { success: true, data: { items: [] } };
        }

        const shouldIgnore = (name: string): boolean => {
          if (name.startsWith(".env")) return true;
          if (patterns.includes(name)) return true;
          return false;
        };

        const results: { name: string; path: string; relativePath: string; type: "file" | "directory" }[] = [];

        const walk = async (dir: string, depth: number): Promise<void> => {
          if (results.length >= maxResults || depth > 10) return;
          let entries;
          try {
            entries = await readdir(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const entry of entries) {
            if (results.length >= maxResults) break;
            if (shouldIgnore(entry.name)) continue;
            const fullPath = resolve(dir, entry.name);
            const isDir = entry.isDirectory();

            if (entry.name.toLowerCase().includes(normalizedQuery)) {
              results.push({
                name: entry.name,
                path: fullPath,
                relativePath: relative(normalizedRoot, fullPath),
                type: isDir ? "directory" : "file",
              });
            }

            if (isDir) {
              await walk(fullPath, depth + 1);
            }
          }
        };

        await walk(normalizedRoot, 0);

        return { success: true, data: { items: results } };
      } catch (error) {
        console.error("[ipc-handlers] workspace:searchFiles failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : tDesktop("workspace.searchFilesFailed"),
        };
      }
    }
  );

  // workspace:copyEntry - 复制文件或文件夹到工作区剪贴板
  ipcMain.handle("workspace:copyEntry", async (_: any, sourcePath: string) => {
    try {
      const workspaceRoot = resolveWorkspaceRoot();
      if (!workspaceRoot) {
        return { success: false, error: tDesktop("workspace.noWorkspaceWatched") };
      }

      const normalizedSource = resolveWorkspaceTarget(workspaceRoot, sourcePath);
      if (!(await pathExists(normalizedSource))) {
        return { success: false, error: tDesktop("workspace.sourceDoesNotExist") };
      }
      if (normalizedSource === workspaceRoot) {
        return { success: false, error: tDesktop("workspace.cannotCopyWorkspaceRoot") };
      }

      workspaceClipboardSource = normalizedSource;
      return {
        success: true,
        data: {
          sourcePath: normalizedSource,
          relativePath: relative(workspaceRoot, normalizedSource),
          name: basename(normalizedSource),
        },
      };
    } catch (error) {
      console.error("[ipc-handlers] workspace:copyEntry failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.copyEntryFailed"),
      };
    }
  });

  // workspace:pasteEntry - 粘贴工作区剪贴板中的文件或文件夹
  ipcMain.handle("workspace:pasteEntry", async (_: any, targetDirPath?: string) => {
    try {
      const workspaceRoot = resolveWorkspaceRoot();
      if (!workspaceRoot) {
        return { success: false, error: tDesktop("workspace.noWorkspaceWatched") };
      }
      if (!workspaceClipboardSource) {
        return { success: false, error: tDesktop("workspace.clipboardEmpty") };
      }
      if (!isInsideWorkspace(workspaceRoot, workspaceClipboardSource)) {
        return { success: false, error: tDesktop("workspace.clipboardSourceOutsideWorkspace") };
      }
      if (!(await pathExists(workspaceClipboardSource))) {
        return { success: false, error: tDesktop("workspace.clipboardSourceMissing") };
      }

      const normalizedTargetDir = resolveWorkspaceTarget(workspaceRoot, targetDirPath);
      const targetStat = await stat(normalizedTargetDir).catch(() => null);
      if (!targetStat || !targetStat.isDirectory()) {
        return { success: false, error: tDesktop("workspace.targetDirectoryMissing") };
      }

      const sourceName = basename(workspaceClipboardSource);
      const destinationPath = await resolveAvailableDestination(normalizedTargetDir, sourceName);
      await copyPathRecursive(workspaceClipboardSource, destinationPath);

      return {
        success: true,
        data: {
          path: destinationPath,
          relativePath: relative(workspaceRoot, destinationPath),
          name: basename(destinationPath),
        },
      };
    } catch (error) {
      console.error("[ipc-handlers] workspace:pasteEntry failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.pasteEntryFailed"),
      };
    }
  });

  // workspace:deleteEntry - 删除文件或文件夹
  ipcMain.handle("workspace:deleteEntry", async (_: any, targetPath: string) => {
    try {
      const workspaceRoot = resolveWorkspaceRoot();
      if (!workspaceRoot) {
        return { success: false, error: tDesktop("workspace.noWorkspaceWatched") };
      }

      const normalizedTarget = resolveWorkspaceTarget(workspaceRoot, targetPath);
      if (normalizedTarget === workspaceRoot) {
        return { success: false, error: tDesktop("workspace.cannotDeleteWorkspaceRoot") };
      }
      if (!(await pathExists(normalizedTarget))) {
        return { success: false, error: tDesktop("workspace.targetDoesNotExist") };
      }

      await rm(normalizedTarget, { recursive: true, force: false });
      return {
        success: true,
        data: { path: normalizedTarget, relativePath: relative(workspaceRoot, normalizedTarget) },
      };
    } catch (error) {
      console.error("[ipc-handlers] workspace:deleteEntry failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.deleteEntryFailed"),
      };
    }
  });

  // workspace:deleteFile - 删除任意路径文件（不受 workspace 边界限制，用于清除 Claude 写入的脚本）
  ipcMain.handle("workspace:deleteFile", async (_: any, targetPath: string) => {
    try {
      if (!targetPath || typeof targetPath !== 'string') {
        return { success: false, error: tDesktop("workspace.invalidPath") };
      }
      const normalizedTarget = normalize(resolve(targetPath));
      if (!(await pathExists(normalizedTarget))) {
        return { success: true }; // 已不存在，视为成功
      }
      await rm(normalizedTarget, { recursive: false, force: false });
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] workspace:deleteFile failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.deleteFileFailed"),
      };
    }
  });

  // workspace:setDefaultCwd - 设置默认工作目录
  ipcMain.handle("workspace:setDefaultCwd", async (_: any, path: string) => {
    try {
      if (!path || typeof path !== "string" || !path.trim()) {
        return { success: false, error: tDesktop("workspace.invalidDirectory") };
      }
      const { isReadableDirectory } = await import("../libs/cwd-resolver.js");
      if (!await isReadableDirectory(path)) {
        return { success: false, error: tDesktop("workspace.invalidDirectory") };
      }
      setDefaultCwdPreference(path);
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] workspace:setDefaultCwd failed:", error);
      return { success: false, error: tDesktop("workspace.persistDefaultCwdFailed") };
    }
  });

  // shell:showItemInFolder - 在系统文件管理器中显示文件
  // 绝对路径直接放行；仅对相对路径做工作区校验（防止路径遍历）
  ipcMain.handle("shell:showItemInFolder", async (_: any, filePath: string, cwd: string) => {
    try {
      let resolvedPath: string;
      if (isAbsolute(filePath)) {
        resolvedPath = normalize(filePath);
      } else {
        const normalizedCwd = normalize(resolve(cwd));
        resolvedPath = normalize(resolve(normalizedCwd, filePath));
        if (!resolvedPath.startsWith(normalizedCwd)) {
          return { success: false, error: tDesktop("workspace.pathOutsideWorkspace") };
        }
      }
      shell.showItemInFolder(resolvedPath);
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] shell:showItemInFolder failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.showInFolderFailed")
      };
    }
  });

  // shell:openPath - 使用系统默认应用打开文件
  // 绝对路径直接放行；仅对相对路径做工作区校验（防止路径遍历）
  ipcMain.handle("shell:openPath", async (_: any, filePath: string, cwd?: string) => {
    try {
      let resolvedPath: string;
      if (isAbsolute(filePath)) {
        resolvedPath = normalize(filePath);
      } else if (cwd) {
        const baseDir = normalize(resolve(cwd));
        resolvedPath = normalize(resolve(baseDir, filePath));
        if (!resolvedPath.startsWith(baseDir)) {
          return { success: false, error: tDesktop("workspace.pathOutsideWorkspace") };
        }
      } else {
        resolvedPath = normalize(resolve(filePath));
      }
      const result = await shell.openPath(resolvedPath);
      if (result) {
        return { success: false, error: result };
      }
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] shell:openPath failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : tDesktop("workspace.openPathFailed")
      };
    }
  });

  // clipboard:writeImage - 将 base64 图片写入系统剪贴板（渲染进程 ClipboardItem 在 Electron 中受限）
  ipcMain.handle("clipboard:writeImage", (_: any, base64Data: string, mediaType: string) => {
    try {
      const dataUrl = base64Data.startsWith("data:")
        ? base64Data
        : `data:${mediaType};base64,${base64Data}`;
      const img = nativeImage.createFromDataURL(dataUrl);
      clipboard.writeImage(img);
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] clipboard:writeImage failed:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  console.info("[ipc-handlers] Workspace handlers registered");
}
