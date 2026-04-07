/**
 * Task Queue 类型定义
 *
 * 定义任务队列系统的所有类型，包括任务优先级、状态、
 * 任务信息、事件类型和配置选项。
 */

// ==================== 枚举/联合类型 ====================

/** 任务优先级 - 数值越小优先级越高 */
export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

/** 优先级到数值的映射（p-queue 使用数值排序，越大越优先） */
export const PRIORITY_MAP: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
} as const;

/** 任务状态 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** 任务类型标识 */
export type TaskType = 'session.start' | 'session.continue' | 'session.stop' | string;

// ==================== 时间戳 ====================

/** 任务时间戳记录 */
export interface TaskTimestamps {
  readonly createdAt: number;
  readonly startedAt?: number;
  readonly completedAt?: number;
}

// ==================== 任务信息 ====================

/** 任务完整信息 */
export interface TaskInfo<T = unknown> {
  readonly id: string;
  readonly type: TaskType;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly timestamps: TaskTimestamps;
  readonly error?: string;
  readonly result?: T;
  readonly abortController: AbortController;
}

// ==================== 事件系统 ====================

/** 任务事件类型 */
export type TaskEventType =
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'queue.active'
  | 'queue.idle';

/** 任务事件 payload 映射 */
export interface TaskEventPayloadMap {
  'task.created': { readonly task: TaskInfo };
  'task.started': { readonly task: TaskInfo };
  'task.completed': { readonly task: TaskInfo };
  'task.failed': { readonly task: TaskInfo; readonly error: string };
  'task.cancelled': { readonly task: TaskInfo; readonly reason: string };
  'queue.active': { readonly pending: number; readonly running: number };
  'queue.idle': Record<string, never>;
}

/** 类型安全的事件 */
export type TaskEvent<T extends TaskEventType = TaskEventType> = {
  readonly type: T;
  readonly payload: TaskEventPayloadMap[T];
  readonly timestamp: number;
};

/** 事件监听器 */
export type TaskEventListener<T extends TaskEventType = TaskEventType> = (
  event: TaskEvent<T>,
) => void;

// ==================== 配置选项 ====================

/** 提交任务时的选项 */
export interface TaskOptions {
  /** 优先级，默认 'normal' */
  readonly priority?: TaskPriority;
  /** 外部 AbortSignal，用于链接取消 */
  readonly signal?: AbortSignal;
  /** 超时时间（毫秒），0 表示不超时 */
  readonly timeoutMs?: number;
}

/** TaskManager 配置 */
export interface TaskManagerConfig {
  /** 最大并发数，默认 3 */
  readonly concurrency?: number;
  /** 已完成任务最大保留数，默认 100 */
  readonly maxCompletedTasks?: number;
}

// ==================== 队列状态 ====================

/** 队列状态快照 */
export interface QueueStatus {
  readonly pending: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly isPaused: boolean;
  readonly concurrency: number;
}
