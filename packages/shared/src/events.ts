/**
 * 事件与消息类型定义
 * 从 src/electron/types.ts 提取
 */

export type ImageContent = {
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
};

export type MessageUsageInfo = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  costBreakdown?: {
    inputCost: number;
    outputCost: number;
  };
  latencyMs: number;
  firstTokenLatencyMs?: number | null;
  model: string;
  provider: string;
  channelId?: string;
  requestId?: string;
};

export type SessionStatus = "idle" | "running" | "completed" | "error";

export type PermissionMode = 'bypassPermissions' | 'acceptEdits' | 'default';

export type CompactTrigger = "manual" | "auto";

/**
 * SDK 消息基础类型
 * 注意：实际运行时依赖 @anthropic-ai/claude-agent-sdk
 * 这里定义最小接口以避免 shared 包依赖 SDK
 */
export type SDKMessageBase = {
  type: string;
  uuid?: string;
  [key: string]: unknown;
};

export type UserPromptMessage = {
  type: "user_prompt";
  prompt: string;
};

export type ToolProgressMessage = {
  type: "tool_progress";
  tool_use_id: string;
  tool_name: string;
  elapsed_time_seconds: number;
};

export type StreamMessage = SDKMessageBase | UserPromptMessage | ToolProgressMessage;

export type ExtendedStreamMessage = StreamMessage & {
  _usage?: MessageUsageInfo;
};

export type SessionInfo = {
  id: string;
  title: string;
  status: SessionStatus;
  claudeSessionId?: string;
  cwd?: string;
  createdAt: number;
  updatedAt: number;
  activeSkillIds?: string[];
  skillMode?: "manual" | "auto";
  isPinned?: boolean;
  isArchived?: boolean;
  permissionMode?: PermissionMode;
  tags?: Array<{
    id: string;
    name: string;
    color: string;
    createdAt: number;
  }>;
};

export type SessionStatusMetadata = {
  needsAuth?: boolean;
  errorType?: string;
  clientRequestId?: string;
};

// Server -> Client events
export type ServerEvent =
  | { type: "stream.message"; payload: { sessionId: string; message: StreamMessage } }
  | { type: "stream.user_prompt"; payload: { sessionId: string; prompt: string } }
  | { type: "session.status"; payload: { sessionId: string; status: SessionStatus; title?: string; cwd?: string; permissionMode?: PermissionMode; skillMode?: "manual" | "auto"; activeSkillIds?: string[]; error?: string; metadata?: SessionStatusMetadata } }
  | { type: "session.compacting"; payload: { sessionId: string; isCompacting: boolean } }
  | { type: "session.compact"; payload: { sessionId: string; trigger: CompactTrigger; preTokens: number } }
  | { type: "session.list"; payload: { sessions: SessionInfo[] } }
  | { type: "session.history"; payload: { sessionId: string; status: SessionStatus; messages: StreamMessage[] } }
  | { type: "session.deleted"; payload: { sessionId: string } }
  | { type: "session.titleUpdated"; payload: { sessionId: string; title: string; isGenerating?: boolean } }
  | { type: "permission.request"; payload: { sessionId: string; toolUseId: string; toolName: string; input: unknown } }
  | { type: "runner.error"; payload: { sessionId?: string; message: string } };

// Client -> Server events
export type ClientEvent =
  | { type: "session.start"; payload: { title: string; prompt: string; cwd?: string; allowedTools?: string; activeSkillIds?: string[]; skillMode?: "manual" | "auto"; permissionMode?: PermissionMode; images?: ImageContent[]; clientRequestId?: string } }
  | { type: "session.continue"; payload: { sessionId: string; prompt: string; permissionMode?: PermissionMode; images?: ImageContent[] } }
  | { type: "session.stop"; payload: { sessionId: string } }
  | { type: "session.delete"; payload: { sessionId: string } }
  | { type: "session.list" }
  | { type: "session.history"; payload: { sessionId: string } }
  | { type: "session.generateTitle"; payload: { sessionId: string } }
  | { type: "session.updateTitle"; payload: { sessionId: string; title: string } }
  | { type: "permission.response"; payload: { sessionId: string; toolUseId: string; result: { behavior: "allow" | "deny"; updatedInput?: unknown; message?: string } } };
