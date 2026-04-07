import { app } from "electron";
import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  accessSync, statSync, constants as fsConstants,
} from "fs";
import { promises as fsp } from "fs";
import { join, normalize, resolve } from "path";
import { tmpdir } from "os";
import { isReadableDirectory } from "./cwd-resolver.js";

export type RecentWorkspace = {
  path: string;
  lastUsed: number;
  usageCount: number;
  displayName?: string;
};

const MAX_RECENT_WORKSPACES = 10;
const CONFIG_FILENAME = "recent-workspaces.json";

class RecentWorkspacesStore {
  private configPath: string;
  private workspaces: RecentWorkspace[] = [];

  constructor() {
    const userDataPath = app.getPath("userData");
    this.configPath = join(userDataPath, CONFIG_FILENAME);
    this.load();
  }

  /**
   * 加载最近工作目录配置
   */
  private load(): void {
    try {
      if (existsSync(this.configPath)) {
        const data = readFileSync(this.configPath, "utf-8");
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          this.workspaces = parsed.filter(this.isValidWorkspace);
        }
      }
    } catch (error) {
      console.error("[recent-workspaces] Failed to load:", error);
      this.workspaces = [];
    }
  }

  /**
   * 保存配置到文件
   */
  private save(): void {
    try {
      const dir = app.getPath("userData");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.workspaces, null, 2));
    } catch (error) {
      console.error("[recent-workspaces] Failed to save:", error);
    }
  }

  /**
   * 验证工作区记录是否有效
   */
  private isValidWorkspace(item: unknown): item is RecentWorkspace {
    if (!item || typeof item !== "object") return false;
    const w = item as Record<string, unknown>;
    return (
      typeof w.path === "string" &&
      w.path.length > 0 &&
      typeof w.lastUsed === "number" &&
      typeof w.usageCount === "number"
    );
  }

  /**
   * 规范化路径
   */
  private normalizePath(path: string): string {
    return normalize(resolve(path));
  }

  /**
   * 获取路径的显示名称
   */
  private getDisplayName(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  }

  /**
   * 添加最近使用的工作目录
   */
  addRecent(path: string): RecentWorkspace {
    const normalizedPath = this.normalizePath(path);
    const now = Date.now();

    // 查找是否已存在
    const existingIndex = this.workspaces.findIndex(
      (w) => this.normalizePath(w.path) === normalizedPath
    );

    let workspace: RecentWorkspace;

    if (existingIndex >= 0) {
      // 更新现有记录
      workspace = {
        ...this.workspaces[existingIndex],
        lastUsed: now,
        usageCount: this.workspaces[existingIndex].usageCount + 1
      };
      // 移除旧位置
      this.workspaces.splice(existingIndex, 1);
    } else {
      // 创建新记录
      workspace = {
        path: normalizedPath,
        lastUsed: now,
        usageCount: 1,
        displayName: this.getDisplayName(normalizedPath)
      };
    }

    // 添加到开头
    this.workspaces.unshift(workspace);

    // 限制数量
    if (this.workspaces.length > MAX_RECENT_WORKSPACES) {
      this.workspaces = this.workspaces.slice(0, MAX_RECENT_WORKSPACES);
    }

    this.save();
    return workspace;
  }

  /**
   * 获取最近使用的工作目录列表
   */
  getRecent(limit?: number): RecentWorkspace[] {
    const count = limit ? Math.min(limit, MAX_RECENT_WORKSPACES) : MAX_RECENT_WORKSPACES;
    return this.workspaces.slice(0, count).map((w) => ({
      ...w,
      displayName: w.displayName || this.getDisplayName(w.path)
    }));
  }

  /**
   * 获取最近使用的工作目录路径列表（简化版）
   */
  getRecentPaths(limit?: number): string[] {
    return this.getRecent(limit).map((w) => w.path);
  }

  /**
   * 移除指定的工作目录
   */
  removeRecent(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    const index = this.workspaces.findIndex(
      (w) => this.normalizePath(w.path) === normalizedPath
    );

    if (index >= 0) {
      this.workspaces.splice(index, 1);
      this.save();
      return true;
    }

    return false;
  }

  /**
   * 清空所有最近工作目录
   */
  clearRecent(): void {
    this.workspaces = [];
    this.save();
  }

  /**
   * 检查路径是否在最近列表中
   */
  isRecent(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    return this.workspaces.some(
      (w) => this.normalizePath(w.path) === normalizedPath
    );
  }

  /**
   * 获取系统临时目录
   */
  getSystemTempDir(): string {
    return tmpdir();
  }

  /**
   * 获取用户主目录
   */
  getUserHomeDir(): string {
    return app.getPath("home");
  }

  /**
   * 获取用户文档目录
   */
  getUserDocumentsDir(): string {
    return app.getPath("documents");
  }

  /**
   * 获取用户桌面目录
   */
  getUserDesktopDir(): string {
    return app.getPath("desktop");
  }

  /**
   * 获取常用目录列表
   */
  getCommonDirs(): Array<{ path: string; name: string; type: string }> {
    return [
      { path: this.getUserHomeDir(), name: "Home", type: "home" },
      { path: this.getUserDocumentsDir(), name: "Documents", type: "documents" },
      { path: this.getUserDesktopDir(), name: "Desktop", type: "desktop" },
      { path: this.getSystemTempDir(), name: "Temp", type: "temp" }
    ];
  }
}

// 导出单例
export const recentWorkspacesStore = new RecentWorkspacesStore();

// 导出辅助函数
export function addRecentWorkspace(path: string): RecentWorkspace {
  return recentWorkspacesStore.addRecent(path);
}

export function getRecentWorkspaces(limit?: number): RecentWorkspace[] {
  return recentWorkspacesStore.getRecent(limit);
}

export function getRecentWorkspacePaths(limit?: number): string[] {
  return recentWorkspacesStore.getRecentPaths(limit);
}

export function removeRecentWorkspace(path: string): boolean {
  return recentWorkspacesStore.removeRecent(path);
}

export function getCommonDirs(): Array<{ path: string; name: string; type: string }> {
  return recentWorkspacesStore.getCommonDirs();
}

export function getSystemTempDir(): string {
  return recentWorkspacesStore.getSystemTempDir();
}

// ---------------------------------------------------------------------------
// 默认工作目录偏好 & 解析
// ---------------------------------------------------------------------------

const DEFAULT_CWD_CONFIG = "default-cwd.json";
const DEFAULT_CWD_DIR_NAME = "CherryAgent";

/**
 * 同步判断路径是否为可读目录（与 cwd-resolver.ts 的 isReadableDirectory 对齐）。
 * 供同步上下文（runner.ts）使用。
 */
export function isReadableDirectorySync(targetPath: string): boolean {
  const trimmed = targetPath.trim();
  if (!trimmed) return false;
  try {
    accessSync(trimmed, fsConstants.R_OK);
    const s = statSync(trimmed);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/** 读取用户设定的默认 cwd（主进程 userData 配置文件） */
function readDefaultCwdPreference(): string | null {
  try {
    const configPath = join(app.getPath("userData"), DEFAULT_CWD_CONFIG);
    if (existsSync(configPath)) {
      const data = JSON.parse(readFileSync(configPath, "utf-8"));
      return typeof data.defaultCwd === "string" && data.defaultCwd.length > 0
        ? data.defaultCwd
        : null;
    }
  } catch {
    // 配置损坏则忽略
  }
  return null;
}

/** 写入用户设定的默认 cwd（主进程 userData 配置文件） */
export function setDefaultCwdPreference(cwdPath: string): void {
  const configPath = join(app.getPath("userData"), DEFAULT_CWD_CONFIG);
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify({ defaultCwd: normalize(resolve(cwdPath)) }),
  );
}

/**
 * 异步解析默认工作目录（三级回退）。
 * 供 app:bootstrap 使用。目录校验使用 isReadableDirectory（R_OK + isDirectory）。
 *
 * 回退链：
 * 1. 用户手动设定 → {userData}/default-cwd.json
 * 2. 最近使用的第一条 → recent-workspaces.json[0]
 * 3. ~/CherryAgent（异步创建，创建失败回退 home）
 */
export async function resolveDefaultCwd(): Promise<string> {
  // 1. 用户手动设定
  const userPref = readDefaultCwdPreference();
  if (userPref && await isReadableDirectory(userPref)) {
    return userPref;
  }

  // 2. 最近使用
  const recent = recentWorkspacesStore.getRecent(1);
  if (recent.length > 0 && await isReadableDirectory(recent[0].path)) {
    return recent[0].path;
  }

  // 3. 兜底：~/CherryAgent
  const defaultDir = join(app.getPath("home"), DEFAULT_CWD_DIR_NAME);
  try {
    await fsp.mkdir(defaultDir, { recursive: true });
    if (await isReadableDirectory(defaultDir)) return defaultDir;
  } catch {
    // 创建失败（权限、TCC 等）
  }

  console.warn("[recent-workspaces] Cannot create ~/CherryAgent, falling back to home");
  return app.getPath("home");
}

/**
 * 同步版默认工作目录解析（三级回退）。
 * 供 runner.ts getDefaultCwd() 调用。
 * bootstrap 已异步创建 ~/CherryAgent，此处只做存在性检查。
 * 目录校验使用 isReadableDirectorySync（与 cwd-resolver 一致）。
 */
export function getDefaultCwdSync(): string {
  // 1. 用户手动设定
  const userPref = readDefaultCwdPreference();
  if (userPref && isReadableDirectorySync(userPref)) {
    return userPref;
  }

  // 2. 最近使用
  const recent = recentWorkspacesStore.getRecent(1);
  if (recent.length > 0 && isReadableDirectorySync(recent[0].path)) {
    return recent[0].path;
  }

  // 3. ~/CherryAgent（同步版不创建目录，依赖 bootstrap 已创建）
  const defaultDir = join(app.getPath("home"), DEFAULT_CWD_DIR_NAME);
  if (isReadableDirectorySync(defaultDir)) return defaultDir;

  return app.getPath("home");
}
