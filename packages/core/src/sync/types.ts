/**
 * 云同步类型定义
 * 从 src/electron/libs/cloud-sync.ts 提取
 */

export type SyncStatus =
  | "idle"
  | "syncing"
  | "pulling"
  | "pushing"
  | "resolving_conflicts"
  | "error"
  | "disabled";

export type SyncDirection = "push" | "pull" | "both";

export type SyncEntityType = "session" | "tag" | "memory_block" | "skill" | "setting";

export type ChangeType = "create" | "update" | "delete";

export interface ChangeRecord {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  changeType: ChangeType;
  timestamp: number;
  checksum: string;
  synced: boolean;
}

export interface SyncConflict {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  localData: unknown;
  remoteData: unknown;
  localTimestamp: number;
  remoteTimestamp: number;
  resolvedAt?: number;
  resolution?: ConflictResolutionType;
}

export type ConflictResolutionType = "keep_local" | "keep_remote" | "manual_merge";

export type AutoResolveStrategy = "manual" | "keep_latest" | "keep_local" | "keep_remote";

export interface SyncConfig {
  apiBaseUrl: string;
  deviceId: string;
  syncInterval: number;
  autoSync: boolean;
  enabledEntities: SyncEntityType[];
  conflictStrategy: ConflictResolutionType;
  autoResolveStrategy?: AutoResolveStrategy;
}

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  autoResolved?: number;
  error?: string;
  duration: number;
  timestamp: number;
}

export interface SyncStatusInfo {
  status: SyncStatus;
  lastSyncTime: number | null;
  lastSyncResult: SyncResult | null;
  pendingChanges: number;
  unresolvedConflicts: number;
  isEnabled: boolean;
  deviceId: string;
}

export interface RemoteChange {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  changeType: ChangeType;
  data: unknown;
  timestamp: number;
  checksum: string;
  deviceId: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export interface SyncProgress {
  stage: "preparing" | "pushing" | "pulling" | "resolving" | "finalizing" | "completed";
  progress: number;
  message?: string;
}
