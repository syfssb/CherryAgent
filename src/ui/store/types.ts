import type { SessionStatus, StreamMessage, PermissionMode, ServerEvent, AgentProvider } from "../types";

export type PermissionRequest = {
  toolUseId: string;
  toolName: string;
  input: unknown;
};

/**
 * 工具进度信息（来自 SDK tool_progress 消息）
 */
export interface ToolProgressInfo {
  toolUseId: string;
  toolName: string;
  elapsedSeconds: number;
}

/**
 * Hook 日志条目（来自 SDK system 消息的 hook 子类型）
 */
export interface HookLogEntry {
  hookId: string;
  hookName: string;
  hookEvent: string;
  status: 'started' | 'running' | 'completed';
  output?: string;
  timestamp: number;
}

/**
 * 系统可观测事件（来自 SDK system 消息的各种子类型）
 */
export type SystemObservableEvent =
  | { kind: 'hook'; entry: HookLogEntry }
  | { kind: 'task_notification'; message: string; sessionId?: string; timestamp: number }
  | { kind: 'files_persisted'; files: string[]; timestamp: number }
  | { kind: 'tool_use_summary'; toolName: string; toolUseId: string; summary: string; timestamp: number };

export type SessionView = {
  id: string;
  title: string;
  status: SessionStatus;
  /** 用户已点击停止，等待服务端状态落地 */
  isStopping?: boolean;
  cwd?: string;
  provider?: AgentProvider;
  modelId?: string;
  activeSkillIds?: string[];
  skillMode?: "manual" | "auto";
  permissionMode?: PermissionMode;
  messages: StreamMessage[];
  permissionRequests: PermissionRequest[];
  lastPrompt?: string;
  createdAt?: number;
  updatedAt?: number;
  isCompacting?: boolean;
  lastCompact?: {
    trigger: "manual" | "auto";
    preTokens: number;
    at: number;
  };
  hydrated: boolean;
  /** 是否还有更早的服务端消息可加载 */
  hasMoreServerHistory?: boolean;
  /** 已加载的最早消息时间戳（分页游标） */
  oldestLoadedCreatedAt?: number;
  /** 已加载的最早消息 rowid（分页游标，同 created_at 去歧义用单调整数） */
  oldestLoadedRowid?: number;
  /** 正在从服务端加载历史 */
  isLoadingServerHistory?: boolean;
  /** 总消息数（来自服务端，仅首页返回） */
  totalMessageCount?: number;
  isPinned?: boolean;
  isArchived?: boolean;
  tags?: Array<{
    id: string;
    name: string;
    color: string;
    createdAt: number;
  }>;
  /** Hook 日志（可观测层） */
  hookLogs?: HookLogEntry[];
  /** 系统可观测事件（可观测层） */
  observableEvents?: SystemObservableEvent[];
  /** SDK 正在重试 API 请求（仅 stderr 检测到 429/529/overloaded 时为 true） */
  isRetrying?: boolean;
  /** 当前重试次数（从 1 开始） */
  retryAttempt?: number;
  /** 渐进式等待阶段（静默超时触发，与 isRetrying 互斥） */
  waitingPhase?: 'thinking' | 'long' | 'timeout' | null;
  /** 后台会话已完成，但用户尚未查看 */
  hasUnreadCompletion?: boolean;
  /** 自动清除脚本：任务完成后自动删除代码/脚本类工作文件 */
  autoCleanScripts?: boolean;
};

/** 标题生成状态 */
export type TitleState = {
  isGenerating: boolean;
};

/** 页面类型 */
export type PageType = 'chat' | 'usage' | 'pricing' | 'transactions' | 'memory' | 'skills' | 'settings';

export interface AppState {
  sessions: Record<string, SessionView>;
  activeSessionId: string | null;
  prompt: string;
  cwd: string;
  pendingStart: boolean;
  pendingStartRequestId?: string | null;
  globalError: string | null;
  sessionsLoaded: boolean;
  showStartModal: boolean;
  showSettingsModal: boolean;
  historyRequested: Set<string>;
  apiConfigChecked: boolean;
  /** 标题生成状态（按会话 ID 索引） */
  titleStates: Record<string, TitleState>;
  /** 当前活动页面 */
  activePage: PageType;

  setPrompt: (prompt: string) => void;
  setCwd: (cwd: string) => void;
  setPendingStart: (pending: boolean) => void;
  setPendingStartRequestId: (requestId: string | null) => void;
  setGlobalError: (error: string | null) => void;
  setShowStartModal: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  setActiveSessionId: (id: string | null) => void;
  clearUnreadCompletion: (sessionId: string) => void;
  setApiConfigChecked: (checked: boolean) => void;
  setActivePage: (page: PageType) => void;
  markHistoryRequested: (sessionId: string) => void;
  setSessionLoadingHistory: (sessionId: string, loading: boolean) => void;
  setSessionStopping: (sessionId: string, stopping: boolean) => void;
  resolvePermissionRequest: (sessionId: string, toolUseId: string) => void;
  handleServerEvent: (event: ServerEvent) => void;
  /** 批量处理服务器事件（性能优化） */
  handleServerEventBatch: (events: ServerEvent[]) => void;
}

export type { ServerEvent };
