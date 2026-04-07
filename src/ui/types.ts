import type { SDKMessage, PermissionResult } from "@anthropic-ai/claude-agent-sdk";

/** 支持的 Agent Provider */
export type AgentProvider = "claude" | "codex";

/**
 * 图片内容类型
 * 用于支持图片粘贴功能
 */
export type ImageContent = {
  /** Base64 编码的图片数据 */
  data: string;
  /** 媒体类型 */
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
};

/**
 * 消息使用量信息
 * 附加到每条消息上用于费用显示
 */
export type MessageUsageInfo = {
  /** 输入 Token 数量 */
  inputTokens: number;
  /** 输出 Token 数量 */
  outputTokens: number;
  /** 总 Token 数量 */
  totalTokens: number;
  /** 缓存读取 Token 数量 */
  cacheReadTokens?: number;
  /** 缓存写入 Token 数量 */
  cacheWriteTokens?: number;
  /** 费用 (积分) */
  cost: number;
  /** 费用明细 */
  costBreakdown?: {
    inputCost: number;
    outputCost: number;
  };
  /** 延迟 (毫秒) */
  latencyMs: number;
  /** 首个 Token 延迟 (毫秒) */
  firstTokenLatencyMs?: number | null;
  /** 模型名称 */
  model: string;
  /** 提供商 */
  provider: string;
  /** 渠道 ID */
  channelId?: string;
  /** 请求 ID */
  requestId?: string;
};

export type UserPromptMessage = {
  type: "user_prompt";
  prompt: string;
  images?: ImageContent[];
  _createdAt?: number;
};

export type ToolProgressMessage = {
  type: "tool_progress";
  tool_use_id: string;
  tool_name: string;
  elapsed_time_seconds: number;
  _createdAt?: number;
};

/**
 * 扩展的消息类型，可以附加使用量信息
 */
export type ExtendedStreamMessage = (SDKMessage | UserPromptMessage | ToolProgressMessage) & {
  _usage?: MessageUsageInfo;
  _createdAt?: number;
};

export type StreamMessage = ExtendedStreamMessage;

export type SessionStatus = "idle" | "running" | "completed" | "error";

export type CompactTrigger = "manual" | "auto";

/**
 * 权限模式类型
 * - bypassPermissions: 跳过所有权限检查，完全自动化
 * - acceptEdits: 自动批准文件编辑，Bash 等需确认
 * - default: 所有工具操作都需要确认
 */
export type PermissionMode = "bypassPermissions" | "acceptEdits" | "default";

export type SessionInfo = {
  id: string;
  title: string;
  status: SessionStatus;
  claudeSessionId?: string;
  provider?: AgentProvider;
  providerThreadId?: string;
  runtime?: string;
  cwd?: string;
  createdAt: number;
  updatedAt: number;
  activeSkillIds?: string[];
  skillMode?: "manual" | "auto";
  permissionMode?: PermissionMode;
  tags?: Array<{
    id: string;
    name: string;
    color: string;
    createdAt: number;
  }>;
};

/** 渐进式等待阶段（静默超时，非真正 API 重试） */
export type WaitingPhase = 'thinking' | 'long' | 'timeout';

export type SessionStatusMetadata = {
  needsAuth?: boolean;
  errorType?: string;
  /** 真正的 API 重试（stderr 检测到 429/529/overloaded 等） */
  isRetrying?: boolean;
  retryAttempt?: number;
  /** 渐进式等待阶段（静默超时触发，与 isRetrying 互斥） */
  waitingPhase?: WaitingPhase | null;
  clientRequestId?: string;
};

// Server -> Client events
export type ServerEvent =
  | { type: "stream.message"; payload: { sessionId: string; message: StreamMessage } }
  | { type: "stream.user_prompt"; payload: { sessionId: string; prompt: string; timestamp?: number; images?: ImageContent[] } }
  | { type: "session.status"; payload: { sessionId: string; status: SessionStatus; title?: string; cwd?: string; modelId?: string; permissionMode?: PermissionMode; skillMode?: "manual" | "auto"; activeSkillIds?: string[]; provider?: AgentProvider; error?: string; metadata?: SessionStatusMetadata } }
  | { type: "session.compacting"; payload: { sessionId: string; isCompacting: boolean } }
  | { type: "session.compact"; payload: { sessionId: string; trigger: CompactTrigger; preTokens: number } }
  | { type: "session.list"; payload: { sessions: SessionInfo[] } }
  | { type: "session.history"; payload: { sessionId: string; status: SessionStatus; messages: StreamMessage[]; modelId?: string; mode?: "replace" | "prepend"; hasMore?: boolean; oldestCreatedAt?: number; oldestRowid?: number; totalMessageCount?: number } }
  | { type: "session.deleted"; payload: { sessionId: string } }
  | { type: "session.titleUpdated"; payload: { sessionId: string; title: string; isGenerating?: boolean } }
  | { type: "permission.request"; payload: { sessionId: string; toolUseId: string; toolName: string; input: unknown } }
  | { type: "runner.error"; payload: { sessionId?: string; message: string } };

// Client -> Server events
export type ClientEvent =
  | { type: "session.start"; payload: { title: string; prompt: string; cwd?: string; allowedTools?: string; activeSkillIds?: string[]; skillMode?: "manual" | "auto"; permissionMode?: PermissionMode; images?: ImageContent[]; modelId?: string; provider?: AgentProvider; thinkingEffort?: "off" | "low" | "medium" | "high"; clientRequestId?: string } }
  | { type: "session.continue"; payload: { sessionId: string; prompt: string; permissionMode?: PermissionMode; images?: ImageContent[]; modelId?: string; provider?: AgentProvider; thinkingEffort?: "off" | "low" | "medium" | "high" } }
  | { type: "session.stop"; payload: { sessionId: string } }
  | { type: "session.delete"; payload: { sessionId: string } }
  | { type: "session.list" }
  | { type: "session.history"; payload: { sessionId: string; beforeCreatedAt?: number; beforeRowid?: number } }
  | { type: "session.generateTitle"; payload: { sessionId: string } }
  | { type: "session.updateTitle"; payload: { sessionId: string; title: string } }
  | { type: "permission.response"; payload: { sessionId: string; toolUseId: string; result: PermissionResult } };
