import { create } from 'zustand';
import type { StreamMessage } from '../types';

/**
 * 工具执行状态
 */
export interface ToolExecutionState {
  toolUseId: string;
  sessionId?: string;
  toolName: string;
  status: 'pending' | 'running' | 'success' | 'error';
  input?: Record<string, unknown>;
  /** 工具输入的增量 JSON（用于 stream_event 累积） */
  inputJson?: string;
  output?: string;
  /** 工具执行时长（秒，来自 tool_progress） */
  elapsedSeconds?: number;
  startTime?: number;
  endTime?: number;
}

/**
 * 工具执行 Store 接口
 */
interface ToolExecutionStore {
  executions: Record<string, ToolExecutionState>;
  updateExecution: (toolUseId: string, updates: Partial<ToolExecutionState>) => void;
  getExecution: (toolUseId: string) => ToolExecutionState | undefined;
  clearExecutions: () => void;
  clearSessionExecutions: (sessionId: string) => void;
  finalizeSessionExecutions: (sessionId: string, status?: "error" | "success") => void;
  hydrateFromMessages: (
    messages: StreamMessage[],
    sessionId?: string,
    options?: { preserveRunningState?: boolean },
  ) => void;
}

export function listExecutionsForSession(
  executions: Record<string, ToolExecutionState>,
  sessionId: string | null | undefined,
): ToolExecutionState[] {
  if (!sessionId) return [];
  return Object.values(executions).filter((execution) => execution.sessionId === sessionId);
}

export function buildExecutionMapFromMessages(
  messages: StreamMessage[],
  sessionId?: string,
  options?: { preserveRunningState?: boolean },
  previousExecutions: Record<string, ToolExecutionState> = {},
): Record<string, ToolExecutionState> {
  const executions: Record<string, ToolExecutionState> = {};
  const preserveRunningState = options?.preserveRunningState === true;

  const extractOutput = (content: any): string => {
    try {
      if (Array.isArray(content)) {
        return content.map((item: any) => item.text || '').join('\n');
      }
      return String(content ?? '');
    } catch {
      return '';
    }
  };

  for (const message of messages) {
    const msgType = (message as any).type;

    if (msgType === 'assistant' && (message as any).message?.content) {
      const contents = (message as any).message.content;
      for (const block of contents) {
        if (block.type === 'tool_use') {
          const existing = executions[block.id] ?? previousExecutions[block.id];
          executions[block.id] = {
            ...existing,
            toolUseId: block.id,
            sessionId: existing?.sessionId ?? sessionId,
            toolName: block.name ?? existing?.toolName ?? 'Tool',
            status: existing?.status ?? 'running',
            input: block.input ?? existing?.input,
          };
        }
      }
    }

    if (msgType === 'user' && (message as any).message?.content) {
      const contents = (message as any).message.content;
      for (const block of contents) {
        if (block.type === 'tool_result') {
          const existing = executions[block.tool_use_id] ?? previousExecutions[block.tool_use_id];
          executions[block.tool_use_id] = {
            ...existing,
            toolUseId: block.tool_use_id,
            sessionId: existing?.sessionId ?? sessionId,
            toolName: existing?.toolName ?? 'Tool',
            status: block.is_error ? 'error' : 'success',
            output: extractOutput(block.content),
          };
        }
      }
    }
  }

  // 历史消息加载完毕：若某工具仍处于 running/pending 状态，
  // 说明会话中途中断，将其标记为 error，避免 UI 永久显示"执行中"
  if (!preserveRunningState) {
    for (const id of Object.keys(executions)) {
      if (executions[id].status === 'running' || executions[id].status === 'pending') {
        executions[id] = { ...executions[id], status: 'error' };
      }
    }
  }

  return executions;
}

/**
 * 工具执行状态管理 Store
 *
 * 用于跟踪和管理工具调用的执行状态
 *
 * 注意事项:
 * 1. 使用 Record 而不是 Map，因为 Zustand 对 Record 的响应式处理更好
 * 2. updateExecution 支持部分更新
 * 3. toolUseId 始终存在于 state 中
 */
export const useToolExecutionStore = create<ToolExecutionStore>((set, get) => ({
  executions: {},

  updateExecution: (toolUseId, updates) => set((state) => ({
    executions: {
      ...state.executions,
      [toolUseId]: {
        ...state.executions[toolUseId],
        toolUseId,  // 确保 toolUseId 始终存在
        ...updates
      } as ToolExecutionState
    }
  })),

  getExecution: (toolUseId) => get().executions[toolUseId],

  clearExecutions: () => set({ executions: {} }),

  clearSessionExecutions: (sessionId) => set((state) => ({
    executions: Object.fromEntries(
      Object.entries(state.executions).filter(([, execution]) => execution.sessionId !== sessionId),
    ),
  })),

  finalizeSessionExecutions: (sessionId, status = "error") => set((state) => {
    const now = Date.now();
    const nextExecutions: Record<string, ToolExecutionState> = {};
    let changed = false;

    for (const [toolUseId, execution] of Object.entries(state.executions)) {
      if (
        execution.sessionId === sessionId &&
        (execution.status === "running" || execution.status === "pending")
      ) {
        nextExecutions[toolUseId] = {
          ...execution,
          status,
          endTime: execution.endTime ?? now,
        };
        changed = true;
      } else {
        nextExecutions[toolUseId] = execution;
      }
    }

    if (!changed) {
      return {};
    }

    return { executions: nextExecutions };
  }),

  hydrateFromMessages: (messages, sessionId, options) => {
    const previousExecutions = sessionId
      ? Object.fromEntries(
          Object.entries(get().executions).filter(([, execution]) => execution.sessionId === sessionId),
        )
      : get().executions;
    const nextExecutions = buildExecutionMapFromMessages(
      messages,
      sessionId,
      options,
      previousExecutions,
    );
    if (!sessionId) {
      set({ executions: nextExecutions });
      return;
    }

    set((state) => ({
      executions: {
        ...Object.fromEntries(
          Object.entries(state.executions).filter(([, execution]) => execution.sessionId !== sessionId),
        ),
        ...nextExecutions,
      },
    }));
  }
}));
