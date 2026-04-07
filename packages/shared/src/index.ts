/**
 * @cherry-agent/shared
 *
 * 纯类型层 - 不包含任何运行时代码
 * 所有 packages 共享的类型定义
 */

// ==================== 事件类型 ====================
export type { SessionStatus, PermissionMode, StreamMessage, ServerEvent, ClientEvent, SessionInfo, CompactTrigger, ImageContent, MessageUsageInfo, ExtendedStreamMessage } from './events.js';

// ==================== 会话类型 ====================
export type { StoredSession, SessionListOptions, SessionHistory, PendingPermission, Tag } from './session.js';

// ==================== 计费类型 ====================
export type { BillingBalance, RechargeOptions, RechargeResult, RechargeStatus, RechargeStatusResult, UsageRecord, UsageHistoryParams, UsageStats, UsageStatsParams, TransactionRecord, PricingInfo, ExportUsageParams } from './billing.js';

// ==================== DI 接口 ====================
export type { IPathResolver, IShellAdapter, IDialogAdapter, ITokenStorage, IAuthCredentialProvider, TokenKey } from './di.js';
