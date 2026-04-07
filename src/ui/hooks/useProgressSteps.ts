import { useMemo } from 'react';
import { useAppStore } from '@/ui/store/useAppStore';
import {
  buildExecutionMapFromMessages,
  listExecutionsForSession,
  useToolExecutionStore,
} from '@/ui/hooks/useToolExecutionStore';
import type { SystemObservableEvent } from '@/ui/store/types';
import type { ToolExecutionState } from '@/ui/hooks/useToolExecutionStore';
import type { StreamMessage } from '@/ui/types';

export interface ProgressStep {
  id: number;
  label: string;
  status: 'completed' | 'active' | 'pending';
  /** 工具名称（仅工具执行降级模式下有值） */
  toolName?: string;
}

export interface ProgressStepsState {
  steps: ProgressStep[];
  isRunning: boolean;
}

const EMPTY_EVENTS: SystemObservableEvent[] = [];
const EMPTY_MESSAGES: StreamMessage[] = [];

type StepStatus = ProgressStep['status'];

function mapStepStatus(value: unknown): StepStatus {
  if (value === true) return 'completed';
  if (typeof value !== 'string') return 'pending';

  const normalized = value.trim().toLowerCase();
  if (['completed', 'complete', 'done', 'success', 'finished'].includes(normalized)) {
    return 'completed';
  }
  if (['active', 'running', 'in_progress', 'in-progress', 'current', 'doing'].includes(normalized)) {
    return 'active';
  }
  return 'pending';
}

function normalizeSteps(steps: ProgressStep[]): ProgressStep[] {
  const nextSteps = steps
    .filter((step) => step.label.trim().length > 0)
    .map((step, index) => ({ ...step, id: step.id || index + 1 }));

  if (nextSteps.some((step) => step.status === 'active')) {
    return nextSteps;
  }

  const firstPendingIndex = nextSteps.findIndex((step) => step.status === 'pending');
  if (firstPendingIndex < 0) {
    return nextSteps;
  }

  return nextSteps.map((step, index) => (
    index === firstPendingIndex ? { ...step, status: 'active' } : step
  ));
}

function parseStepArray(items: unknown[]): ProgressStep[] {
  return normalizeSteps(
    items.map((item, index) => {
      if (typeof item === 'string') {
        return { id: index + 1, label: item, status: 'pending' as const };
      }

      if (!item || typeof item !== 'object') {
        return { id: index + 1, label: String(item ?? ''), status: 'pending' as const };
      }

      const candidate = item as Record<string, unknown>;
      const label = [candidate.content, candidate.label, candidate.title, candidate.text, candidate.name]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? '';
      const status = candidate.checked === true
        ? 'completed'
        : mapStepStatus(candidate.status ?? candidate.state);

      return {
        id: typeof candidate.id === 'number' ? candidate.id : index + 1,
        label,
        status,
      };
    }),
  );
}

export function parseProgressSteps(message: string): ProgressStep[] {
  const trimmed = message.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parseStepArray(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const listCandidate = [record.steps, record.todos, record.items, record.tasks].find(Array.isArray);
      if (Array.isArray(listCandidate)) {
        return parseStepArray(listCandidate);
      }
    }
  } catch {
    // ignore JSON parse failure and continue with text fallbacks
  }

  const checklistLines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^[-*]\s*\[(x|X|\s)\]\s*(.+)$/);
      if (!match) return null;
      return {
        id: index + 1,
        label: match[2].trim(),
        status: (match[1].toLowerCase() === 'x' ? 'completed' : 'pending') as StepStatus,
      };
    })
    .filter((step): step is ProgressStep => step !== null);

  if (checklistLines.length > 0) {
    return normalizeSteps(checklistLines);
  }

  const numberedLines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+[.)、]\s*/.test(line))
    .map((line, index) => ({
      id: index + 1,
      label: line.replace(/^\d+[.)、]\s*/, '').trim(),
      status: 'pending' as const,
    }));

  if (numberedLines.length > 0) {
    return normalizeSteps(numberedLines);
  }

  return [];
}

// ─── 工具执行降级进度 ─────────────────────────────────────────────────────────

/** 工具名称 → 中文标签 */
const TOOL_LABELS: Record<string, string> = {
  Bash: 'Bash',
  Read: '读取',
  Write: '写入',
  Edit: '编辑',
  Glob: '查找文件',
  Grep: '搜索内容',
  Task: '子任务',
  WebFetch: '网页获取',
  WebSearch: '网络搜索',
  NotebookEdit: '编辑笔记',
  AskUserQuestion: '询问用户',
};

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function getFileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function getToolStepLabel(toolName: string, input?: Record<string, unknown>): string {
  const base = TOOL_LABELS[toolName] ?? toolName;
  if (!input) return base;

  let detail = '';
  switch (toolName) {
    case 'Bash': {
      const cmd = typeof input.command === 'string'
        ? (input.command.split('\n')[0]?.trim() ?? '')
        : '';
      detail = truncate(cmd, 40);
      break;
    }
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit': {
      const path = typeof input.file_path === 'string' ? input.file_path : '';
      detail = truncate(getFileName(path), 40);
      break;
    }
    case 'Glob':
    case 'Grep': {
      detail = truncate(typeof input.pattern === 'string' ? input.pattern : '', 40);
      break;
    }
    case 'Task': {
      detail = truncate(typeof input.description === 'string' ? input.description : '', 40);
      break;
    }
    case 'WebSearch': {
      detail = truncate(typeof input.query === 'string' ? input.query : '', 40);
      break;
    }
    case 'WebFetch': {
      detail = truncate(typeof input.url === 'string' ? input.url : '', 40);
      break;
    }
  }

  return detail ? `${base}: ${detail}` : base;
}

/**
 * 当会话没有 task_notification 时，从工具执行记录自动推导进度步骤。
 * 按 startTime 排序，保持与实际执行顺序一致。
 */
function generateFromToolExecutions(
  executions: ToolExecutionState[],
): ProgressStep[] {
  const sorted = executions
    .filter((exec) => exec.status !== 'error')
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

  if (sorted.length === 0) return [];

  return sorted.map((exec, index) => ({
    id: index + 1,
    label: getToolStepLabel(exec.toolName, exec.input),
    toolName: exec.toolName,
    status: (
      exec.status === 'success' ? 'completed'
      : exec.status === 'running' ? 'active'
      : 'pending'
    ) as StepStatus,
  }));
}

function getCurrentTurnStartTimestamp(messages: StreamMessage[]): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as Partial<StreamMessage>;
    if (message.type === 'user_prompt') {
      return typeof message._createdAt === 'number' ? message._createdAt : null;
    }
  }
  return null;
}

function getCurrentTurnMessages(messages: StreamMessage[]): StreamMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if ((messages[index] as Partial<StreamMessage>).type === 'user_prompt') {
      return messages.slice(index + 1);
    }
  }
  return messages;
}

export function selectCurrentTurnExecutions(
  messages: StreamMessage[],
  executions: ToolExecutionState[],
  sessionId: string | null | undefined,
): ToolExecutionState[] {
  const persistedMap = buildExecutionMapFromMessages(
    getCurrentTurnMessages(messages),
    sessionId ?? undefined,
  );
  const turnStart = getCurrentTurnStartTimestamp(messages);
  const merged = new Map<string, ToolExecutionState>(Object.entries(persistedMap));

  for (const execution of executions) {
    if (sessionId && execution.sessionId && execution.sessionId !== sessionId) {
      continue;
    }

    const executionTime = execution.startTime ?? execution.endTime;

    if (turnStart !== null) {
      if (executionTime !== undefined && executionTime < turnStart) {
        continue;
      }
      if (executionTime === undefined && !merged.has(execution.toolUseId)) {
        continue;
      }
    }

    const existing = merged.get(execution.toolUseId);
    merged.set(execution.toolUseId, existing
      ? {
          ...existing,
          ...execution,
          input: execution.input ?? existing.input,
          output: execution.output ?? existing.output,
        }
      : execution);
  }

  return Array.from(merged.values());
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProgressSteps(): ProgressStepsState {
  const executions = useToolExecutionStore((state) => state.executions);
  const session = useAppStore((state) => {
    const sessionId = state.activeSessionId;
    return sessionId ? state.sessions[sessionId] : null;
  });
  const isRunning = useAppStore((state) => {
    const sessionId = state.activeSessionId;
    return sessionId ? state.sessions[sessionId]?.status === 'running' : false;
  });
  const observableEvents = session?.observableEvents ?? EMPTY_EVENTS;
  const messages = session?.messages ?? EMPTY_MESSAGES;
  const sessionExecutions = useMemo(
    () => listExecutionsForSession(executions, session?.id ?? null),
    [executions, session?.id],
  );
  const currentTurnStart = useMemo(
    () => getCurrentTurnStartTimestamp(messages),
    [messages],
  );
  const currentTurnExecutions = useMemo(
    () => selectCurrentTurnExecutions(messages, sessionExecutions, session?.id ?? null),
    [messages, session?.id, sessionExecutions],
  );

  const steps = useMemo(() => {
    // 优先级 1：task_notification（AI 显式声明的业务步骤）
    const lastNotification = [...observableEvents]
      .reverse()
      .find((event) =>
        event.kind === 'task_notification' &&
        (currentTurnStart === null || event.timestamp >= currentTurnStart),
      );

    if (lastNotification?.kind === 'task_notification') {
      return parseProgressSteps(lastNotification.message);
    }

    // 优先级 2：从工具执行序列自动推导（降级兜底）
    return generateFromToolExecutions(currentTurnExecutions);
  }, [currentTurnExecutions, currentTurnStart, observableEvents]);

  return { steps, isRunning };
}
