/**
 * 云同步服务 - 平台无关的核心逻辑
 *
 * 从 src/electron/libs/cloud-sync.ts 抽离
 * 路径通过 IPathResolver 注入，不依赖 Electron
 */

import { createHash } from "crypto";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import type * as BetterSqlite3 from "better-sqlite3";
import type { IPathResolver } from "@cherry-agent/shared";

// Re-export types from original module for backward compatibility
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
} from "./types.js";

import type {
  SyncStatus,
  SyncDirection,
  SyncEntityType,
  ChangeType,
  SyncConfig,
  SyncResult,
  SyncStatusInfo,
  RemoteChange,
  ChangeRecord,
  SyncConflict,
  ConflictResolutionType,
  SyncProgressCallback,
  SyncProgress,
} from "./types.js";

// ==================== 工具函数 ====================

function calculateChecksum(data: unknown): string {
  const content = JSON.stringify(data);
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

function generateDeviceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `device_${timestamp}_${random}`;
}

function getNumberValue(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function getStringValue(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function getBooleanValue(source: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
  }
  return undefined;
}

function unwrapApiData<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data?: unknown }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

const DEFAULT_SYNC_CONFIG: Partial<SyncConfig> = {
  syncInterval: 5 * 60 * 1000,
  autoSync: false,
  enabledEntities: ["session", "tag", "memory_block", "skill", "setting"],
  conflictStrategy: "keep_local",
  autoResolveStrategy: "manual",
};

const SYNC_CONFIG_FILE = "sync-config.json";
const SYNC_STATE_FILE = "sync-state.json";
const PUSH_BATCH_SIZE = 500;
const SQLITE_IN_BATCH_SIZE = 400;

function extractApiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const directMessage = source.message;
  if (typeof directMessage === "string" && directMessage.trim()) {
    return directMessage.trim();
  }

  const errorNode = source.error;
  if (typeof errorNode === "string" && errorNode.trim()) {
    return errorNode.trim();
  }
  if (errorNode && typeof errorNode === "object") {
    const errorObject = errorNode as Record<string, unknown>;
    const errorMessage = errorObject.message;
    if (typeof errorMessage === "string" && errorMessage.trim()) {
      return errorMessage.trim();
    }
  }

  return null;
}

function stripErrorPrefix(message: string, prefix: string): string {
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
}

// ==================== CloudSyncService 类 ====================

export interface CloudSyncServiceDeps {
  db: BetterSqlite3.Database;
  pathResolver: IPathResolver;
  apiBaseUrl?: string;
}

/**
 * 云同步服务 - 平台无关版本
 * 通过 IPathResolver 注入路径
 */
export class CloudSyncService {
  private db: BetterSqlite3.Database;
  private config: SyncConfig;
  private status: SyncStatus;
  private lastSyncTime: number | null;
  private lastSyncResult: SyncResult | null;
  private syncTimer: ReturnType<typeof setInterval> | null;
  private configPath: string;
  private statePath: string;
  private accessToken: string | null;
  private onProgressCallback: SyncProgressCallback | null;

  constructor(deps: CloudSyncServiceDeps) {
    this.db = deps.db;
    const userDataPath = deps.pathResolver.getUserDataPath();
    this.configPath = join(userDataPath, SYNC_CONFIG_FILE);
    this.statePath = join(userDataPath, SYNC_STATE_FILE);
    this.status = "idle";
    this.lastSyncTime = null;
    this.lastSyncResult = null;
    this.syncTimer = null;
    this.accessToken = null;
    this.onProgressCallback = null;

    this.config = this.loadConfig(deps.apiBaseUrl);
    this.loadState();
    this.ensureChangesTable();
  }

  private loadConfig(apiBaseUrl?: string): SyncConfig {
    let config: Partial<SyncConfig> = {};
    if (existsSync(this.configPath)) {
      try {
        config = JSON.parse(readFileSync(this.configPath, "utf8")) as Partial<SyncConfig>;
      } catch { /* ignore */ }
    }

    const allowedEntities: SyncEntityType[] = ["session", "tag", "memory_block", "skill", "setting"];
    const persistedEntities = Array.isArray(config.enabledEntities)
      ? config.enabledEntities.filter((entity): entity is SyncEntityType => allowedEntities.includes(entity))
      : [];
    const normalizedEntities: SyncEntityType[] = persistedEntities.length > 0
      ? Array.from(new Set<SyncEntityType>([...persistedEntities, "setting"]))
      : [...DEFAULT_SYNC_CONFIG.enabledEntities!];

    return {
      apiBaseUrl: apiBaseUrl ?? config.apiBaseUrl ?? process.env.VITE_API_BASE_URL ?? process.env.CHERRY_API_URL ?? "http://localhost:3000/api",
      deviceId: config.deviceId ?? generateDeviceId(),
      syncInterval: config.syncInterval ?? DEFAULT_SYNC_CONFIG.syncInterval!,
      autoSync: config.autoSync ?? DEFAULT_SYNC_CONFIG.autoSync!,
      enabledEntities: normalizedEntities,
      conflictStrategy: config.conflictStrategy ?? DEFAULT_SYNC_CONFIG.conflictStrategy!,
      autoResolveStrategy: config.autoResolveStrategy ?? DEFAULT_SYNC_CONFIG.autoResolveStrategy!,
    };
  }

  private saveConfig(): void {
    const dir = join(this.configPath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf8");
  }

  private loadState(): void {
    if (existsSync(this.statePath)) {
      try {
        const state = JSON.parse(readFileSync(this.statePath, "utf8"));
        this.lastSyncTime = state.lastSyncTime ?? null;
        this.lastSyncResult = state.lastSyncResult ?? null;
      } catch { /* ignore */ }
    }
  }

  private saveState(): void {
    const state = { lastSyncTime: this.lastSyncTime, lastSyncResult: this.lastSyncResult };
    writeFileSync(this.statePath, JSON.stringify(state, null, 2), "utf8");
  }

  private ensureChangesTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_changes (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        change_type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        synced INTEGER DEFAULT 0
      )
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS sync_changes_entity ON sync_changes(entity_type, entity_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS sync_changes_synced ON sync_changes(synced)`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_data TEXT,
        remote_data TEXT,
        local_timestamp INTEGER NOT NULL,
        remote_timestamp INTEGER NOT NULL,
        resolved_at INTEGER,
        resolution TEXT
      )
    `);
  }

  setAccessToken(token: string | null): void { this.accessToken = token; }
  setProgressCallback(callback: SyncProgressCallback | null): void { this.onProgressCallback = callback; }
  getLastSyncTime(): number | null { return this.lastSyncTime; }
  getConfig(): SyncConfig { return { ...this.config }; }

  getStatus(): SyncStatusInfo {
    return {
      status: this.status,
      lastSyncTime: this.lastSyncTime,
      lastSyncResult: this.lastSyncResult,
      pendingChanges: this.getPendingChangesCount(),
      unresolvedConflicts: this.getUnresolvedConflictsCount(),
      isEnabled: this.config.autoSync,
      deviceId: this.config.deviceId,
    };
  }

  private getPendingChangesCount(): number {
    const result = this.db.prepare("SELECT COUNT(*) as count FROM sync_changes WHERE synced = 0").get() as { count: number };
    return result.count;
  }

  private getUnresolvedConflictsCount(): number {
    const result = this.db.prepare("SELECT COUNT(*) as count FROM sync_conflicts WHERE resolved_at IS NULL").get() as { count: number };
    return result.count;
  }

  recordChange(entityType: SyncEntityType, entityId: string, changeType: ChangeType, data: unknown): void {
    if (!this.config.enabledEntities.includes(entityType)) return;
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const checksum = calculateChecksum(data);
    this.db.prepare(
      `INSERT INTO sync_changes (id, entity_type, entity_id, change_type, timestamp, checksum, synced) VALUES (?, ?, ?, ?, ?, ?, 0)`
    ).run(id, entityType, entityId, changeType, timestamp, checksum);
  }

  getPendingChanges(): ChangeRecord[] {
    const rows = this.db.prepare(
      `SELECT id, entity_type, entity_id, change_type, timestamp, checksum, synced FROM sync_changes WHERE synced = 0 ORDER BY timestamp ASC`
    ).all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      entityType: String(row.entity_type) as SyncEntityType,
      entityId: String(row.entity_id),
      changeType: String(row.change_type) as ChangeType,
      timestamp: Number(row.timestamp),
      checksum: String(row.checksum),
      synced: Boolean(row.synced),
    }));
  }

  private compactPendingChanges(pendingChanges: ChangeRecord[]): Array<ChangeRecord & { relatedIds: string[] }> {
    const latestByEntity = new Map<string, ChangeRecord & { relatedIds: string[] }>();

    for (const change of pendingChanges) {
      const entityKey = `${change.entityType}:${change.entityId}`;
      const existing = latestByEntity.get(entityKey);

      if (!existing) {
        latestByEntity.set(entityKey, {
          ...change,
          relatedIds: [change.id],
        });
        continue;
      }

      latestByEntity.set(entityKey, {
        ...change,
        relatedIds: [...existing.relatedIds, change.id],
      });
    }

    return Array.from(latestByEntity.values()).sort((left, right) => left.timestamp - right.timestamp);
  }

  private markChangesSynced(changeIds: string[]): void {
    if (changeIds.length === 0) return;
    for (let index = 0; index < changeIds.length; index += SQLITE_IN_BATCH_SIZE) {
      const batch = changeIds.slice(index, index + SQLITE_IN_BATCH_SIZE);
      const placeholders = batch.map(() => "?").join(",");
      this.db.prepare(`UPDATE sync_changes SET synced = 1 WHERE id IN (${placeholders})`).run(...batch);
    }
  }

  async sync(direction: SyncDirection = "both"): Promise<SyncResult> {
    if (this.status === "syncing") {
      return { success: false, pushed: 0, pulled: 0, conflicts: 0, autoResolved: 0, error: "Sync already in progress", duration: 0, timestamp: Date.now() };
    }
    if (!this.accessToken) {
      return { success: false, pushed: 0, pulled: 0, conflicts: 0, autoResolved: 0, error: "Not authenticated", duration: 0, timestamp: Date.now() };
    }

    const startTime = Date.now();
    this.status = "syncing";
    let pushed = 0, pulled = 0, conflicts = 0, autoResolved = 0;

    try {
      this.emitProgress("preparing", 0, "Preparing sync...");
      if (direction === "push" || direction === "both") {
        this.status = "pushing";
        this.emitProgress("pushing", 0, "Pushing local changes...");
        pushed = await this.pushChanges();
        this.emitProgress("pushing", 100, `Pushed ${pushed} changes`);
      }
      if (direction === "pull" || direction === "both") {
        this.status = "pulling";
        this.emitProgress("pulling", 0, "Pulling remote changes...");
        const pullResult = await this.pullChanges();
        pulled = pullResult.pulled;
        conflicts = pullResult.conflicts;
        autoResolved = pullResult.autoResolved;
        this.emitProgress("pulling", 100, `Pulled ${pulled} changes, ${conflicts} conflicts, ${autoResolved} auto-resolved`);
      }

      this.status = "idle";
      this.lastSyncTime = Date.now();
      this.lastSyncResult = { success: true, pushed, pulled, conflicts, autoResolved, duration: Date.now() - startTime, timestamp: Date.now() };
      this.saveState();
      this.emitProgress("completed", 100, "Sync completed");
      return this.lastSyncResult;
    } catch (error) {
      this.status = "error";
      const result: SyncResult = {
        success: false, pushed, pulled, conflicts, autoResolved,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime, timestamp: Date.now(),
      };
      this.lastSyncResult = result;
      this.saveState();
      return result;
    }
  }

  // NOTE: pushChanges, pullChanges, applyRemoteChange, entity CRUD methods
  // are identical to the original cloud-sync.ts implementation.
  // They only use this.db (better-sqlite3) and fetch() - no Electron APIs.

  private async pushChanges(): Promise<number> {
    const pendingChanges = this.getPendingChanges();
    console.log(`[CloudSyncService] getPendingChanges 返回 ${pendingChanges.length} 条记录`);

    if (pendingChanges.length === 0) {
      console.log('[CloudSyncService] 没有待同步的变更，直接返回 0');
      return 0;
    }

    const compactedChanges = this.compactPendingChanges(pendingChanges);
    console.log(
      `[CloudSyncService] 压缩待同步变更: ${pendingChanges.length} -> ${compactedChanges.length}`,
    );

    const relatedChangeIdsByLatestId = new Map<string, string[]>();

    const changes = compactedChanges.map((change) => {
      const data = this.getEntityData(change.entityType, change.entityId);
      console.log(`[CloudSyncService] 变更 ${change.id}: entityType=${change.entityType}, entityId=${change.entityId}, data=${data === null ? 'null' : 'exists'}`);
      relatedChangeIdsByLatestId.set(change.id, change.relatedIds);
      return {
        ...change, data, deviceId: this.config.deviceId,
      };
    });

    const totalBatches = Math.ceil(changes.length / PUSH_BATCH_SIZE);
    console.log(`[CloudSyncService] 准备推送 ${changes.length} 条变更到 ${this.config.apiBaseUrl}/sync/push（分 ${totalBatches} 批）`);
    console.log(`[CloudSyncService] accessToken: ${this.accessToken ? '已设置' : '未设置'}`);

    try {
      let totalSynced = 0;

      for (let index = 0; index < changes.length; index += PUSH_BATCH_SIZE) {
        const batch = changes.slice(index, index + PUSH_BATCH_SIZE);
        const batchNumber = Math.floor(index / PUSH_BATCH_SIZE) + 1;
        console.log(`[CloudSyncService] 推送批次 ${batchNumber}/${totalBatches}, 大小=${batch.length}`);

        const response = await fetch(`${this.config.apiBaseUrl}/sync/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.accessToken}` },
          body: JSON.stringify({ changes: batch }),
        });

        const responseText = await response.text();
        let responsePayload: unknown = null;
        if (responseText) {
          try {
            responsePayload = JSON.parse(responseText) as unknown;
          } catch {
            responsePayload = { message: responseText };
          }
        }

        console.log(`[CloudSyncService] 批次 ${batchNumber} API 响应状态: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const apiMessage = extractApiErrorMessage(responsePayload);
          throw new Error(
            apiMessage
              ? `HTTP ${response.status}: ${apiMessage}`
              : `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const result = unwrapApiData<Record<string, unknown>>(responsePayload ?? {});
        const isSuccess = typeof result.success === "boolean" ? result.success : true;
        if (!isSuccess) {
          const apiMessage = extractApiErrorMessage(result);
          throw new Error(apiMessage ?? "server rejected sync payload");
        }

        const syncedIds = Array.isArray(result.syncedIds)
          ? result.syncedIds.filter((id): id is string => typeof id === "string")
          : [];

        console.log(`[CloudSyncService] 批次 ${batchNumber} syncedIds: ${syncedIds.length} 条`);

        if (syncedIds.length > 0) {
          const expandedSyncedIds = syncedIds.flatMap((id) => relatedChangeIdsByLatestId.get(id) ?? [id]);
          this.markChangesSynced(Array.from(new Set(expandedSyncedIds)));
          totalSynced += expandedSyncedIds.length;
        }
      }

      console.log(`[CloudSyncService] 批量推送完成，总计已标记 ${totalSynced} 条变更为已同步`);
      return totalSynced;
    } catch (error) {
      console.error('[CloudSyncService] pushChanges 失败:', error);
      const normalizedMessage = stripErrorPrefix(
        error instanceof Error ? error.message : String(error),
        "Push failed: "
      );
      throw new Error(`Push failed: ${normalizedMessage}`);
    }
  }

  private async pullChanges(): Promise<{ pulled: number; conflicts: number; autoResolved: number }> {
    const since = this.lastSyncTime ?? 0;
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/sync/pull?since=${since}&deviceId=${this.config.deviceId}`,
        { method: "GET", headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      if (!response.ok) throw new Error(`Pull failed: ${response.statusText}`);
      const result = unwrapApiData<Record<string, unknown>>(await response.json() as unknown);
      const isSuccess = typeof result.success === "boolean" ? result.success : true;
      if (!isSuccess) {
        throw new Error("Pull failed: server rejected sync request");
      }
      const changes = Array.isArray(result.changes) ? result.changes as RemoteChange[] : [];
      let pulled = 0, conflicts = 0, autoResolved = 0;
      for (const change of changes) {
        const applyResult = this.applyRemoteChange(change);
        if (applyResult === "applied") pulled++;
        else if (applyResult === "conflict") conflicts++;
        else if (applyResult === "auto_resolved") autoResolved++;
      }
      return { pulled, conflicts, autoResolved };
    } catch (error) {
      throw new Error(`Pull failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private applyRemoteChange(change: RemoteChange): "applied" | "conflict" | "skipped" | "auto_resolved" {
    const localChange = this.db.prepare(
      `SELECT timestamp, checksum FROM sync_changes WHERE entity_type = ? AND entity_id = ? AND synced = 0 ORDER BY timestamp DESC LIMIT 1`
    ).get(change.entityType, change.entityId) as { timestamp: number; checksum: string } | undefined;

    // 检测到冲突
    if (localChange && localChange.timestamp > change.timestamp) {
      const strategy = this.config.autoResolveStrategy ?? "manual";

      switch (strategy) {
        case "manual":
          // 创建冲突记录，等待手动解决
          this.createConflict(change);
          return "conflict";

        case "keep_latest":
          // 比较时间戳，保留最新的（本地更新，忽略远程）
          console.log(`[CloudSyncService] Auto-resolve conflict (keep_latest): keeping local (${localChange.timestamp} > ${change.timestamp})`);
          return "auto_resolved";

        case "keep_local":
          // 保留本地数据，忽略远程变更
          console.log(`[CloudSyncService] Auto-resolve conflict (keep_local): keeping local`);
          return "auto_resolved";

        case "keep_remote":
          // 应用远程变更，覆盖本地数据
          console.log(`[CloudSyncService] Auto-resolve conflict (keep_remote): applying remote`);
          try {
            this.applyEntityChange(change.entityType, change.entityId, change.changeType, change.data);
            return "auto_resolved";
          } catch {
            return "skipped";
          }
      }
    }

    // 没有冲突，正常应用远程变更
    try {
      this.applyEntityChange(change.entityType, change.entityId, change.changeType, change.data);
      return "applied";
    } catch { return "skipped"; }
  }

  private createConflict(remoteChange: RemoteChange): void {
    const id = crypto.randomUUID();
    const localData = this.getEntityData(remoteChange.entityType, remoteChange.entityId);
    this.db.prepare(
      `INSERT INTO sync_conflicts (id, entity_type, entity_id, local_data, remote_data, local_timestamp, remote_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, remoteChange.entityType, remoteChange.entityId, JSON.stringify(localData), JSON.stringify(remoteChange.data), Date.now(), remoteChange.timestamp);
  }

  private getEntityData(entityType: SyncEntityType, entityId: string): unknown {
    switch (entityType) {
      case "session": {
        const row = this.db
          .prepare(
            `SELECT id, title, claude_session_id, status, cwd, allowed_tools, active_skill_ids, skill_mode, last_prompt, is_pinned, is_archived, created_at, updated_at
             FROM sessions
             WHERE id = ?`
          )
          .get(entityId) as Record<string, unknown> | undefined;
        if (!row) {
          return null;
        }

        let activeSkillIds: string[] | undefined;
        const rawActiveSkillIds = row.active_skill_ids;
        if (Array.isArray(rawActiveSkillIds)) {
          activeSkillIds = rawActiveSkillIds.map((item) => String(item));
        } else if (typeof rawActiveSkillIds === "string" && rawActiveSkillIds.trim()) {
          try {
            const parsed = JSON.parse(rawActiveSkillIds);
            if (Array.isArray(parsed)) {
              activeSkillIds = parsed.map((item) => String(item));
            }
          } catch {
            activeSkillIds = rawActiveSkillIds.split(",").map((item) => item.trim()).filter(Boolean);
          }
        }

        const tagRows = this.db
          .prepare("SELECT tag_id FROM session_tags WHERE session_id = ? ORDER BY tag_id ASC")
          .all(entityId) as Array<{ tag_id: string }>;
        const tagIds = tagRows.map((tagRow) => String(tagRow.tag_id));

        return {
          id: String(row.id),
          title: String(row.title ?? ""),
          claudeSessionId: getStringValue(row, "claude_session_id") ?? null,
          status: getStringValue(row, "status") ?? "idle",
          cwd: getStringValue(row, "cwd") ?? null,
          allowedTools: getStringValue(row, "allowed_tools") ?? null,
          activeSkillIds,
          tagIds,
          skillMode: getStringValue(row, "skill_mode") ?? "auto",
          lastPrompt: getStringValue(row, "last_prompt") ?? null,
          isPinned: Boolean(row.is_pinned),
          isArchived: Boolean(row.is_archived),
          createdAt: getNumberValue(row, "created_at") ?? Date.now(),
          updatedAt: getNumberValue(row, "updated_at") ?? Date.now(),
        };
      }
      case "tag": {
        const row = this.db
          .prepare("SELECT id, name, color, created_at FROM tags WHERE id = ?")
          .get(entityId) as Record<string, unknown> | undefined;
        if (!row) {
          return null;
        }
        return {
          id: String(row.id),
          name: String(row.name ?? ""),
          color: String(row.color ?? "#999999"),
          createdAt: getNumberValue(row, "created_at") ?? Date.now(),
        };
      }
      case "memory_block": {
        const row = this.db
          .prepare(
            `SELECT id, label, description, value, char_limit, created_at, updated_at
             FROM memory_blocks
             WHERE id = ?`
          )
          .get(entityId) as Record<string, unknown> | undefined;
        if (!row) {
          return null;
        }
        return {
          id: String(row.id),
          label: String(row.label ?? ""),
          description: String(row.description ?? ""),
          value: String(row.value ?? ""),
          charLimit: getNumberValue(row, "char_limit") ?? 2000,
          createdAt: getNumberValue(row, "created_at") ?? Date.now(),
          updatedAt: getNumberValue(row, "updated_at") ?? Date.now(),
        };
      }
      case "skill": {
        const row = this.db
          .prepare(
            `SELECT id, name, description, content, source, is_enabled, icon, category, created_at, updated_at
             FROM skills
             WHERE id = ?`
          )
          .get(entityId) as Record<string, unknown> | undefined;
        if (!row) {
          return null;
        }
        return {
          id: String(row.id),
          name: String(row.name ?? ""),
          description: String(row.description ?? ""),
          content: String(row.content ?? ""),
          source: String(row.source ?? "custom"),
          isEnabled: Boolean(row.is_enabled),
          icon: getStringValue(row, "icon") ?? null,
          category: String(row.category ?? "other"),
          createdAt: getNumberValue(row, "created_at") ?? Date.now(),
          updatedAt: getNumberValue(row, "updated_at") ?? Date.now(),
        };
      }
      case "setting": {
        const row = this.db
          .prepare("SELECT key, value, updated_at FROM local_settings WHERE key = ?")
          .get(entityId) as Record<string, unknown> | undefined;
        if (!row) {
          return null;
        }
        return {
          key: String(row.key),
          value: String(row.value ?? ""),
          updatedAt: getNumberValue(row, "updated_at") ?? Date.now(),
        };
      }
      default:
        return null;
    }
  }

  private applyEntityChange(entityType: SyncEntityType, entityId: string, changeType: ChangeType, data: unknown): void {
    if (changeType === "delete") {
      this.deleteEntity(entityType, entityId);
      return;
    }
    // For create/update, upsert the entity
    switch (entityType) {
      case "session":
        this.upsertSession(data);
        break;
      case "tag":
        this.upsertTag(data);
        break;
      case "memory_block":
        this.upsertMemoryBlock(data);
        break;
      case "skill":
        this.upsertSkill(data);
        break;
      case "setting":
        this.upsertSetting(data);
        break;
    }
  }

  private upsertSession(session: unknown): void {
    const source = (session && typeof session === "object") ? session as Record<string, unknown> : {};
    const sessionId = getStringValue(source, "id");
    if (!sessionId) {
      return;
    }

    const rawActiveSkillIds = source.activeSkillIds ?? source.active_skill_ids;
    const activeSkillIdsValue = Array.isArray(rawActiveSkillIds)
      ? JSON.stringify(rawActiveSkillIds)
      : typeof rawActiveSkillIds === "string"
        ? rawActiveSkillIds
        : null;

    const rawTagIds = source.tagIds ?? source.tag_ids;
    let tagIds: string[] | null = null;
    if (Array.isArray(rawTagIds)) {
      tagIds = rawTagIds.map((item) => String(item));
    } else if (typeof rawTagIds === "string" && rawTagIds.trim()) {
      try {
        const parsedTagIds = JSON.parse(rawTagIds);
        if (Array.isArray(parsedTagIds)) {
          tagIds = parsedTagIds.map((item) => String(item));
        } else {
          tagIds = rawTagIds.split(",").map((item) => item.trim()).filter(Boolean);
        }
      } catch {
        tagIds = rawTagIds.split(",").map((item) => item.trim()).filter(Boolean);
      }
    }

    const createdAt = getNumberValue(source, "createdAt", "created_at") ?? Date.now();
    const updatedAt = getNumberValue(source, "updatedAt", "updated_at") ?? createdAt;

    this.db
      .prepare(
        `INSERT OR REPLACE INTO sessions
          (id, title, claude_session_id, status, cwd, allowed_tools, active_skill_ids, skill_mode, last_prompt, is_pinned, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        sessionId,
        getStringValue(source, "title") ?? "",
        getStringValue(source, "claudeSessionId", "claude_session_id") ?? null,
        getStringValue(source, "status") ?? "idle",
        getStringValue(source, "cwd") ?? null,
        getStringValue(source, "allowedTools", "allowed_tools") ?? null,
        activeSkillIdsValue,
        getStringValue(source, "skillMode", "skill_mode") ?? "auto",
        getStringValue(source, "lastPrompt", "last_prompt") ?? null,
        (getBooleanValue(source, "isPinned", "is_pinned") ?? false) ? 1 : 0,
        (getBooleanValue(source, "isArchived", "is_archived") ?? false) ? 1 : 0,
        createdAt,
        updatedAt
      );

    if (Array.isArray(tagIds)) {
      this.db.prepare("DELETE FROM session_tags WHERE session_id = ?").run(sessionId);
      const insertSessionTag = this.db.prepare(
        `INSERT OR IGNORE INTO session_tags (session_id, tag_id, created_at)
         SELECT ?, id, ?
         FROM tags
         WHERE id = ?`
      );
      for (const tagId of tagIds) {
        insertSessionTag.run(sessionId, updatedAt, tagId);
      }
    }
  }

  private upsertTag(tag: unknown): void {
    const source = (tag && typeof tag === "object") ? tag as Record<string, unknown> : {};
    const tagId = getStringValue(source, "id");
    if (!tagId) {
      return;
    }

    this.db
      .prepare("INSERT OR REPLACE INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)")
      .run(
        tagId,
        getStringValue(source, "name") ?? "",
        getStringValue(source, "color") ?? "#999999",
        getNumberValue(source, "createdAt", "created_at") ?? Date.now()
      );
  }

  private upsertMemoryBlock(block: unknown): void {
    const source = (block && typeof block === "object") ? block as Record<string, unknown> : {};
    const blockId = getStringValue(source, "id");
    if (!blockId) {
      return;
    }

    const createdAt = getNumberValue(source, "createdAt", "created_at") ?? Date.now();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO memory_blocks
         (id, label, description, value, char_limit, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        blockId,
        getStringValue(source, "label") ?? "",
        getStringValue(source, "description") ?? "",
        getStringValue(source, "value") ?? "",
        getNumberValue(source, "charLimit", "char_limit") ?? 2000,
        createdAt,
        getNumberValue(source, "updatedAt", "updated_at") ?? createdAt
      );
  }

  private upsertSkill(skill: unknown): void {
    const source = (skill && typeof skill === "object") ? skill as Record<string, unknown> : {};
    const skillId = getStringValue(source, "id");
    if (!skillId) {
      return;
    }

    const createdAt = getNumberValue(source, "createdAt", "created_at") ?? Date.now();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO skills
         (id, name, description, content, source, is_enabled, icon, category, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        skillId,
        getStringValue(source, "name") ?? "",
        getStringValue(source, "description") ?? "",
        getStringValue(source, "content") ?? "",
        getStringValue(source, "source") ?? "custom",
        (getBooleanValue(source, "isEnabled", "is_enabled") ?? true) ? 1 : 0,
        getStringValue(source, "icon") ?? null,
        getStringValue(source, "category") ?? "other",
        createdAt,
        getNumberValue(source, "updatedAt", "updated_at") ?? createdAt
      );
  }

  private upsertSetting(setting: unknown): void {
    const source = (setting && typeof setting === "object") ? setting as Record<string, unknown> : {};
    const key = getStringValue(source, "key");
    if (!key) {
      return;
    }

    this.db
      .prepare("INSERT OR REPLACE INTO local_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run(
        key,
        getStringValue(source, "value") ?? "",
        getNumberValue(source, "updatedAt", "updated_at") ?? Date.now()
      );
  }

  private deleteEntity(entityType: SyncEntityType, entityId: string): void {
    switch (entityType) {
      case "session":
        this.db.prepare("DELETE FROM messages WHERE session_id = ?").run(entityId);
        this.db.prepare("DELETE FROM session_tags WHERE session_id = ?").run(entityId);
        this.db.prepare("DELETE FROM sessions WHERE id = ?").run(entityId);
        break;
      case "tag":
        this.db.prepare("DELETE FROM session_tags WHERE tag_id = ?").run(entityId);
        this.db.prepare("DELETE FROM tags WHERE id = ?").run(entityId);
        break;
      case "memory_block":
        this.db.prepare("DELETE FROM memory_blocks WHERE id = ?").run(entityId);
        break;
      case "skill":
        this.db.prepare("DELETE FROM skills WHERE id = ?").run(entityId);
        break;
      case "setting":
        this.db.prepare("DELETE FROM local_settings WHERE key = ?").run(entityId);
        break;
    }
  }

  getUnresolvedConflicts(): SyncConflict[] {
    const rows = this.db.prepare(
      `SELECT id, entity_type, entity_id, local_data, remote_data, local_timestamp, remote_timestamp FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY local_timestamp DESC`
    ).all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      entityType: String(row.entity_type) as SyncEntityType,
      entityId: String(row.entity_id),
      localData: JSON.parse(String(row.local_data)),
      remoteData: JSON.parse(String(row.remote_data)),
      localTimestamp: Number(row.local_timestamp),
      remoteTimestamp: Number(row.remote_timestamp),
    }));
  }

  resolveConflict(conflictId: string, resolution: ConflictResolutionType): boolean {
    const conflict = this.db.prepare(
      `SELECT id, entity_type, entity_id, local_data, remote_data FROM sync_conflicts WHERE id = ?`
    ).get(conflictId) as Record<string, unknown> | undefined;
    if (!conflict) return false;

    const entityType = String(conflict.entity_type) as SyncEntityType;
    const entityId = String(conflict.entity_id);
    const remoteData = JSON.parse(String(conflict.remote_data));

    if (resolution === "keep_remote") {
      this.applyEntityChange(entityType, entityId, "update", remoteData);
    }

    this.db.prepare("UPDATE sync_conflicts SET resolved_at = ?, resolution = ? WHERE id = ?").run(Date.now(), resolution, conflictId);
    return true;
  }

  enable(): void {
    this.config = { ...this.config, autoSync: true };
    this.saveConfig();
    this.startAutoSync();
    this.status = "idle";
  }

  disable(): void {
    this.config = { ...this.config, autoSync: false };
    this.saveConfig();
    this.stopAutoSync();
    this.status = "disabled";
  }

  private startAutoSync(): void {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      if (this.status === "idle" && this.accessToken) {
        this.sync("both").catch(() => { /* ignore auto-sync errors */ });
      }
    }, this.config.syncInterval);
  }

  private stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  updateConfig(updates: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    if (updates.syncInterval && this.config.autoSync) {
      this.stopAutoSync();
      this.startAutoSync();
    }
  }

  private emitProgress(stage: SyncProgress["stage"], progress: number, message?: string): void {
    if (this.onProgressCallback) {
      this.onProgressCallback({ stage, progress, message });
    }
  }

  cleanup(): void {
    this.stopAutoSync();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.db.prepare("DELETE FROM sync_changes WHERE synced = 1 AND timestamp < ?").run(sevenDaysAgo);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.db.prepare("DELETE FROM sync_conflicts WHERE resolved_at IS NOT NULL AND resolved_at < ?").run(thirtyDaysAgo);
  }
}
