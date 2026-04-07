/**
 * @cherry-agent/core
 *
 * 业务逻辑层 - 不依赖 Electron
 * 通过 DI 接口与平台层交互
 */

// Re-export shared types
export type {
  SessionStatus,
  PermissionMode,
  StreamMessage,
  ServerEvent,
  ClientEvent,
  SessionInfo,
  ImageContent,
  MessageUsageInfo,
  StoredSession,
  SessionListOptions,
  SessionHistory,
  PendingPermission,
  Tag,
  BillingBalance,
  RechargeOptions,
  RechargeResult,
  RechargeStatus,
  RechargeStatusResult,
  UsageRecord,
  UsageHistoryParams,
  UsageStats,
  TransactionRecord,
  PricingInfo,
  ExportUsageParams,
  IPathResolver,
  IShellAdapter,
  IDialogAdapter,
  ITokenStorage,
  IAuthCredentialProvider,
  TokenKey,
} from '@cherry-agent/shared';

// ==================== Skills 模块 ====================
export { SkillFileManager, parseFrontmatter, buildFrontmatter } from './skills/files.js';
export type { SkillFrontmatter, SkillData } from './skills/files.js';

// ==================== Billing 模块 ====================
export { BillingService } from './billing/handler.js';
export type { BillingHandlerDeps } from './billing/handler.js';

// ==================== Sync 模块 ====================
export { CloudSyncService } from './sync/service.js';
export type { CloudSyncServiceDeps } from './sync/service.js';
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
} from './sync/types.js';

// ==================== DB Version Guard 模块 ====================
export { VersionGuard } from './db/version-guard.js';
export type {
  VersionCheckResult,
  VersionGuardOptions,
  VersionAction,
} from './db/version-guard.js';

// ==================== Task Queue 模块 ====================
export { TaskManager } from './task/task-manager.js';
export type {
  TaskPriority,
  TaskStatus,
  TaskType,
  TaskInfo,
  TaskTimestamps,
  TaskOptions,
  TaskManagerConfig,
  QueueStatus,
  TaskEventType,
  TaskEventPayloadMap,
  TaskEvent,
  TaskEventListener,
} from './task/types.js';
export { PRIORITY_MAP } from './task/types.js';
