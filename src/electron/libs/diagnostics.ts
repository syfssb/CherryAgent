/**
 * diagnostics.ts — 会话诊断系统
 *
 * 架构：
 *   DiagnosticsRegistry（单例）
 *     └─ SessionDiagnostics（per-session）
 *          ├─ RingBuffer<DiagnosticEvent>   容量 500 条
 *          └─ StderrRingBuffer              容量 32 KB
 */

// ─── 事件类型枚举 ─────────────────────────────────────────────────────────────

/** 诊断事件的所有类型 */
export enum DiagnosticEventKind {
  /** 子进程启动 */
  spawn              = "spawn",
  /** SDK 初始化完成 */
  sdk_init           = "sdk_init",
  /** SDK 会话恢复 */
  sdk_resume         = "sdk_resume",
  /** SDK 自动重试 */
  sdk_retry          = "sdk_retry",

  /** 权限请求弹出 */
  permission_request  = "permission_request",
  /** 权限已被用户决策（允许/拒绝） */
  permission_resolve  = "permission_resolve",
  /** 权限等待超时 */
  permission_timeout  = "permission_timeout",

  /** 工具输入校验通过 */
  tool_validation_ok     = "tool_validation_ok",
  /** 工具输入校验拒绝 */
  tool_validation_reject = "tool_validation_reject",

  /** 工具执行结果 */
  tool_result        = "tool_result",

  /** 子进程提前退出 */
  early_exit         = "early_exit",
  /** 本轮对话被暂停 */
  pause_turn         = "pause_turn",

  /** 会话状态流转（idle/running/paused 等） */
  status_transition  = "status_transition",

  /** 消息写入持久化层 */
  message_persist    = "message_persist",
  /** 消息广播到渲染进程 */
  renderer_broadcast = "renderer_broadcast",

  /** 检测到会话停滞 */
  stall_detected     = "stall_detected",
  /** 停滞已恢复 */
  stall_recovered    = "stall_recovered",

  /** 周期性性能采样 */
  performance_sample = "performance_sample",
}

// ─── 核心数据类型 ──────────────────────────────────────────────────────────────

/** 单条诊断事件 */
export interface DiagnosticEvent {
  /** 事件发生时间（Unix ms） */
  timestamp: number;
  /** 所属会话 ID */
  sessionId: string;
  /** 事件类型 */
  kind: DiagnosticEventKind;
  /** 附加数据（任意 JSON 可序列化对象） */
  data?: Record<string, unknown>;
}

/** 导出用的完整快照 */
export interface DiagnosticSnapshot {
  sessionId: string;
  /** 本次快照的去重关联 ID（UUIDv4-lite） */
  diagCorrelationId: string;
  events: DiagnosticEvent[];
  /** 最近捕获的 stderr 文本（最多 32 KB） */
  recentStderr: string;
  metrics: {
    messageCount: number;
    broadcastCount: number;
    /** 平均广播耗时（ms） */
    avgBroadcastMs: number;
    eventLoopLagMs?: number;
    queueDepth?: number;
    sqliteWriteAvgMs?: number;
  };
  /** 当前待决权限请求的 toolUseId 列表 */
  pendingPermissions: string[];
  stallDetected: boolean;
  stallReason?: string;
  /** 最后一个事件的时间戳（Unix ms） */
  lastEventAt?: number;
  /** 快照导出时间（Unix ms） */
  exportedAt: number;
}

// ─── Ring Buffer ──────────────────────────────────────────────────────────────

/**
 * 固定容量环形缓冲区（覆盖写，不抛出异常）
 *
 * 满时写入会覆盖最旧的元素，保证始终保留最新 `capacity` 条记录。
 */
export class RingBuffer<T> {
  private readonly buf: (T | undefined)[];
  private head = 0;   // 下一次写入位置
  private size = 0;   // 当前有效元素数

  constructor(private readonly capacity: number) {
    this.buf = new Array(capacity);
  }

  /** 写入一条记录（满时丢弃最旧的） */
  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  /** 按时间顺序（旧→新）返回全部有效记录 */
  toArray(): T[] {
    if (this.size === 0) return [];
    if (this.size < this.capacity) {
      return this.buf.slice(0, this.size) as T[];
    }
    // 满环：head 指向最旧
    return [
      ...this.buf.slice(this.head) as T[],
      ...this.buf.slice(0, this.head) as T[],
    ];
  }

  /** 清空缓冲区 */
  clear(): void {
    this.buf.fill(undefined);
    this.head = 0;
    this.size = 0;
  }

  get length(): number { return this.size; }
}

// ─── 每会话诊断实例 ────────────────────────────────────────────────────────────

/** 32 KB 上限（字符数，UTF-16 编码） */
const STDERR_MAX_CHARS = 32 * 1024;

/** 单个会话的诊断容器 */
export class SessionDiagnostics {
  /** 事件环形缓冲（最多 500 条） */
  readonly events = new RingBuffer<DiagnosticEvent>(500);

  /** 待决权限 toolUseId 集合 */
  readonly pendingPermissions = new Set<string>();

  /** 统计指标（可直接写入，snapshot 时读取） */
  metrics = {
    messageCount: 0,
    broadcastCount: 0,
    broadcastTotalMs: 0,
    eventLoopLagMs: undefined as number | undefined,
    queueDepth: undefined as number | undefined,
    sqliteWriteAvgMs: undefined as number | undefined,
  };

  stallDetected = false;
  stallReason?: string;

  private stderrChunks: string[] = [];
  private stderrLen = 0;

  constructor(readonly sessionId: string) {}

  /** 追加 stderr 文本（超出 32KB 自动截头保尾） */
  appendStderr(chunk: string): void {
    this.stderrChunks.push(chunk);
    this.stderrLen += chunk.length;

    // 超限时从头丢弃，保留最新数据
    while (this.stderrLen > STDERR_MAX_CHARS && this.stderrChunks.length > 0) {
      const oldest = this.stderrChunks.shift()!;
      this.stderrLen -= oldest.length;
    }
  }

  /** 记录一条诊断事件 */
  record(kind: DiagnosticEventKind, data?: Record<string, unknown>): void {
    this.events.push({ timestamp: Date.now(), sessionId: this.sessionId, kind, data });
  }

  /** 导出完整快照（不可变副本） */
  snapshot(): DiagnosticSnapshot {
    const allEvents = this.events.toArray();
    const lastEventAt = allEvents.length > 0
      ? allEvents[allEvents.length - 1].timestamp
      : undefined;

    const { messageCount, broadcastCount, broadcastTotalMs,
            eventLoopLagMs, queueDepth, sqliteWriteAvgMs } = this.metrics;

    return {
      sessionId: this.sessionId,
      diagCorrelationId: genCorrelationId(),
      events: allEvents,
      recentStderr: this.stderrChunks.join(""),
      metrics: {
        messageCount,
        broadcastCount,
        avgBroadcastMs: broadcastCount > 0 ? broadcastTotalMs / broadcastCount : 0,
        eventLoopLagMs,
        queueDepth,
        sqliteWriteAvgMs,
      },
      pendingPermissions: [...this.pendingPermissions],
      stallDetected: this.stallDetected,
      stallReason: this.stallReason,
      lastEventAt,
      exportedAt: Date.now(),
    };
  }
}

// ─── Registry 单例 ────────────────────────────────────────────────────────────

/** 管理所有会话的诊断实例 */
export class DiagnosticsRegistry {
  private readonly sessions = new Map<string, SessionDiagnostics>();

  /** 获取（不存在则创建）指定会话的诊断实例 */
  getOrCreate(sessionId: string): SessionDiagnostics {
    let diag = this.sessions.get(sessionId);
    if (!diag) {
      diag = new SessionDiagnostics(sessionId);
      this.sessions.set(sessionId, diag);
    }
    return diag;
  }

  /** 获取已存在的诊断实例（不存在返回 undefined） */
  get(sessionId: string): SessionDiagnostics | undefined {
    return this.sessions.get(sessionId);
  }

  /** 删除并清理一个会话的诊断数据 */
  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** 导出指定会话的快照（不存在返回 null） */
  snapshot(sessionId: string): DiagnosticSnapshot | null {
    return this.sessions.get(sessionId)?.snapshot() ?? null;
  }

  /** 当前被追踪的会话数量 */
  get size(): number { return this.sessions.size; }
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/** 生成轻量级关联 ID（非加密，仅用于日志去重） */
function genCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── 导出单例 ─────────────────────────────────────────────────────────────────

/** 全局诊断注册表单例 */
export const diagnosticsRegistry = new DiagnosticsRegistry();
