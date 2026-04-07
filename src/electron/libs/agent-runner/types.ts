/**
 * Agent Runner 抽象层 — 中性类型定义
 *
 * 所有类型不依赖任何具体 SDK（Claude / Codex），
 * 作为桌面端双栈运行时的统一契约。
 */

// ─── Provider & Runtime ───────────────────────────────────

/** 支持的 Agent Provider */
export type AgentProvider = "claude" | "codex";

/** 运行时标识（用于统计和计费区分） */
export type AgentRuntime = "claude-sdk" | "codex-sdk";

// ─── 中性消息类型 ──────────────────────────────────────────

/** 消息角色 */
export type AgentMessageRole = "user" | "assistant" | "system";

/** 工具调用请求 */
export type AgentToolUse = {
  type: "tool_use";
  toolUseId: string;
  toolName: string;
  input: unknown;
};

/** 工具调用结果 */
export type AgentToolResult = {
  type: "tool_result";
  toolUseId: string;
  output: string;
  isError?: boolean;
};

/** 文本内容 */
export type AgentTextContent = {
  type: "text";
  text: string;
};

/** 流式文本增量（用于打字机效果） */
export type AgentTextDeltaStart = { type: "text_delta_start" };
export type AgentTextDelta = { type: "text_delta"; text: string };
export type AgentTextDeltaStop = { type: "text_delta_stop" };

/** 思考内容（reasoning / thinking） */
export type AgentThinkingContent = {
  type: "thinking";
  thinking: string;
};

/** 系统消息（初始化、状态变更等） */
export type AgentSystemMessage = {
  type: "system";
  subtype:
    | "init"
    | "status"
    | "compact_boundary"
    | "compacting"
    | "error";
  sessionId?: string;
  data?: unknown;
};

/** 中性消息联合类型 */
export type AgentMessage =
  | AgentTextContent
  | AgentTextDeltaStart
  | AgentTextDelta
  | AgentTextDeltaStop
  | AgentThinkingContent
  | AgentToolUse
  | AgentToolResult
  | AgentSystemMessage;

// ─── 权限 ─────────────────────────────────────────────────

/** 权限模式 */
export type AgentPermissionMode = "bypassPermissions" | "acceptEdits" | "default";

/** 权限请求 */
export type AgentPermissionRequest = {
  toolUseId: string;
  toolName: string;
  input: unknown;
};

/** 权限决策 */
export type AgentPermissionDecision = {
  behavior: "allow" | "deny";
  updatedInput?: unknown;
  message?: string;
};

/** 权限处理器：由调用方提供，runner 内部调用 */
export type AgentPermissionHandler = (
  request: AgentPermissionRequest,
) => Promise<AgentPermissionDecision>;

// ─── Runner 接口 ──────────────────────────────────────────

/** 上下文注入选项 */
export type AgentContextInjection = {
  memoryContext?: string;
  /** 技能摘要（仅名称+描述，用于 Claude SDK 的 Skill tool 按需加载） */
  skillContext?: string;
  /** 技能完整内容（用于 Codex SDK 等无 Skill tool 的 runner，直接注入 prompt） */
  fullSkillContext?: string;
  customSystemPrompt?: string;
  /**
   * 历史对话文本（当 SDK 会话 ID 失效时从 SQLite 重建）。
   * 已格式化为 [User]/[Assistant] 对话，仅作参考上下文，不含当前轮次 prompt。
   */
  historyContext?: string;
};

/** 使用量信息 */
export type AgentUsageInfo = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
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

/** Runner 启动选项 */
export type AgentRunnerOptions = {
  /** 用户输入 */
  prompt: string;
  /** 图片内容 */
  images?: Array<{ data: string; mediaType: string }>;
  /** 模型 ID */
  model?: string;
  /** 工作目录 */
  cwd?: string;
  /** 恢复会话 ID（provider 原生 ID） */
  resumeSessionId?: string;
  /** 权限模式 */
  permissionMode?: AgentPermissionMode;
  /** 权限处理器 */
  permissionHandler?: AgentPermissionHandler;
  /** 上下文注入 */
  contextInjection?: AgentContextInjection;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 插件路径列表 */
  pluginPaths?: string[];
  /** AbortController */
  abortController?: AbortController;
  /** 思考强度 */
  thinkingEffort?: "off" | "low" | "medium" | "high";
};

/** 事件回调 */
export type AgentEventCallback = (event: AgentRunnerEvent) => void;

/** Runner 事件（统一事件总线） */
export type AgentRunnerEvent =
  | { type: "message"; message: AgentMessage; usage?: AgentUsageInfo }
  | { type: "permission_request"; request: AgentPermissionRequest }
  | { type: "session_id"; sessionId: string }
  | { type: "status"; status: "running" | "idle" | "error" | "compacting"; error?: string }
  | { type: "title_hint"; title: string };

/** Runner 句柄 */
export type AgentRunnerHandle = {
  abort: () => void;
};

/**
 * IAgentRunner — 统一 Agent 运行时接口
 *
 * 每个 provider（Claude / Codex）实现此接口。
 */
export interface IAgentRunner {
  /** Provider 标识 */
  readonly provider: AgentProvider;
  /** Runtime 标识 */
  readonly runtime: AgentRuntime;

  /**
   * 启动或继续一个 Agent 会话
   * @returns 句柄，可用于 abort
   */
  run(
    options: AgentRunnerOptions,
    onEvent: AgentEventCallback,
  ): Promise<AgentRunnerHandle>;
}
