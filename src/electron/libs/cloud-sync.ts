/**
 * Cloud Sync Module - Electron 适配层
 *
 * 这是一个薄适配层，将 Electron 特有的路径解析注入到
 * @cherry-agent/core 的平台无关 CloudSyncService 中。
 *
 * 保持 `new CloudSyncService(db)` 的构造签名，
 * 以兼容 ipc-handlers.ts 中的现有调用方式。
 */

import { app } from "electron";
import type * as BetterSqlite3 from "better-sqlite3";
import type { IPathResolver } from "@cherry-agent/shared";
import {
  CloudSyncService as CoreCloudSyncService,
  type CloudSyncServiceDeps,
} from "@cherry-agent/core";

// ============================================================================
// 重新导出所有同步相关类型（保持向后兼容）
// ============================================================================

export type {
  SyncStatus,
  SyncDirection,
  SyncEntityType,
  ChangeType,
  ChangeRecord,
  SyncConflict,
  ConflictResolutionType,
  SyncConfig,
  SyncResult,
  SyncStatusInfo,
  RemoteChange,
  SyncProgressCallback,
  SyncProgress,
  CloudSyncServiceDeps,
} from "@cherry-agent/core";

// ============================================================================
// ElectronPathResolver - 实现 IPathResolver 接口
// ============================================================================

/**
 * Electron 平台的路径解析器
 * 将 IPathResolver 接口映射到 Electron 的 app API
 */
class ElectronPathResolver implements IPathResolver {
  getUserDataPath(): string {
    return app.getPath("userData");
  }

  getAppPath(): string {
    return app.getAppPath();
  }

  getTempPath(): string {
    return app.getPath("temp");
  }

  getDesktopPath(): string {
    return app.getPath("desktop");
  }

  getDocumentsPath(): string {
    return app.getPath("documents");
  }

  getDownloadsPath(): string {
    return app.getPath("downloads");
  }

  isPackaged(): boolean {
    return app.isPackaged;
  }

  getResourcesPath(): string {
    return process.resourcesPath;
  }
}

// ============================================================================
// CloudSyncService 包装类
// ============================================================================

/**
 * Electron 版 CloudSyncService 包装类
 *
 * 保持 `new CloudSyncService(db, apiBaseUrl?)` 的构造签名，
 * 内部创建 ElectronPathResolver 并委托给 core 的 CloudSyncService。
 *
 * ipc-handlers.ts 中的使用方式：
 * ```typescript
 * const { CloudSyncService } = await import("./libs/cloud-sync.js");
 * cloudSyncService = new CloudSyncService(db);
 * ```
 */
export class CloudSyncService {
  private readonly core: CoreCloudSyncService;

  constructor(db: BetterSqlite3.Database, apiBaseUrl?: string) {
    const deps: CloudSyncServiceDeps = {
      db,
      pathResolver: new ElectronPathResolver(),
      ...(apiBaseUrl !== undefined ? { apiBaseUrl } : {}),
    };
    this.core = new CoreCloudSyncService(deps);
  }

  // ========================================================================
  // 公共方法 - 全部委托给 core 实例
  // ========================================================================

  setAccessToken(token: string | null): void {
    this.core.setAccessToken(token);
  }

  setProgressCallback(callback: Parameters<CoreCloudSyncService["setProgressCallback"]>[0]): void {
    this.core.setProgressCallback(callback);
  }

  getLastSyncTime(): number | null {
    return this.core.getLastSyncTime();
  }

  getConfig(): ReturnType<CoreCloudSyncService["getConfig"]> {
    return this.core.getConfig();
  }

  getStatus(): ReturnType<CoreCloudSyncService["getStatus"]> {
    return this.core.getStatus();
  }

  recordChange(
    ...args: Parameters<CoreCloudSyncService["recordChange"]>
  ): void {
    this.core.recordChange(...args);
  }

  getPendingChanges(): ReturnType<CoreCloudSyncService["getPendingChanges"]> {
    return this.core.getPendingChanges();
  }

  async sync(
    ...args: Parameters<CoreCloudSyncService["sync"]>
  ): Promise<ReturnType<CoreCloudSyncService["sync"]> extends Promise<infer R> ? R : never> {
    return this.core.sync(...args);
  }

  getUnresolvedConflicts(): ReturnType<CoreCloudSyncService["getUnresolvedConflicts"]> {
    return this.core.getUnresolvedConflicts();
  }

  resolveConflict(
    ...args: Parameters<CoreCloudSyncService["resolveConflict"]>
  ): ReturnType<CoreCloudSyncService["resolveConflict"]> {
    return this.core.resolveConflict(...args);
  }

  enable(): void {
    this.core.enable();
  }

  disable(): void {
    this.core.disable();
  }

  updateConfig(
    ...args: Parameters<CoreCloudSyncService["updateConfig"]>
  ): void {
    this.core.updateConfig(...args);
  }

  cleanup(): void {
    this.core.cleanup();
  }
}

// ============================================================================
// 默认导出（保持向后兼容）
// ============================================================================

export default CloudSyncService;
