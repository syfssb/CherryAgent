import { useState, useEffect, useRef, memo, type ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';

export type ExecutionLogStatus = 'pending' | 'running' | 'success' | 'error';

export interface ExecutionLogItemProps {
  type: 'thinking' | 'tool_use';
  name: string;
  status: ExecutionLogStatus;
  summary?: string;
  /** 工具开始时间戳（ms），用于实时计时 */
  startTime?: number;
  elapsedSeconds?: number;
  durationMs?: number;
  expandedContent?: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
  /** 执行中显示的活动内容（完整命令/路径等） */
  liveActivity?: string;
  /** 工具专属前置图标 */
  icon?: ReactNode;
}

const STATUS_LINE: Record<ExecutionLogStatus, string> = {
  pending: 'bg-ink-900/10',
  running: 'bg-accent/50',
  success: 'bg-ink-400/20',
  error: 'bg-warning/25',
};

const STATUS_DOT: Record<ExecutionLogStatus, string> = {
  pending: 'bg-ink-400/40',
  running: 'bg-accent',
  success: 'bg-ink-400',
  error: 'bg-warning',
};

/** 实时计时 hook：status=running 时每 100ms 更新一次 */
function useLiveTimer(status: ExecutionLogStatus, startTime?: number): number | null {
  const [elapsed, setElapsed] = useState<number | null>(null);
  const baseRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status !== 'running') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    // 固定 base 时间，避免每次 render 重置
    if (baseRef.current === null) {
      baseRef.current = startTime ?? Date.now();
    }
    const tick = () => setElapsed(Date.now() - baseRef.current!);
    tick();
    timerRef.current = setInterval(tick, 100);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // startTime 变化时重置 base
  useEffect(() => {
    if (startTime !== undefined) {
      baseRef.current = startTime;
    }
  }, [startTime]);

  return elapsed;
}

function formatTime(ms: number | null | undefined, durationMs?: number, elapsedSeconds?: number): string | null {
  // 已完成：使用 durationMs / elapsedSeconds
  if (typeof elapsedSeconds === 'number' && Number.isFinite(elapsedSeconds)) {
    return `${elapsedSeconds.toFixed(1)}s`;
  }
  if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
    return durationMs < 1000 ? `${Math.round(durationMs)}ms` : `${(durationMs / 1000).toFixed(1)}s`;
  }
  // 实时计时
  if (typeof ms === 'number') {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return null;
}

/** 状态图标（右侧） */
function StatusIcon({ status, timeLabel }: { status: ExecutionLogStatus; timeLabel: string | null }) {
  if (status === 'running') {
    return (
      <div className="flex items-center gap-1.5">
        {timeLabel && (
          <span className="text-[10px] tabular-nums font-mono text-accent">{timeLabel}</span>
        )}
        {/* 旋转加载圈 */}
        <svg
          className="h-3 w-3 animate-spin shrink-0"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path
            className="opacity-90"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex items-center gap-1">
        {timeLabel && (
          <span className="text-[10px] tabular-nums font-mono text-muted/50">{timeLabel}</span>
        )}
        {/* 勾选图标 */}
        <svg className="h-3 w-3 text-ink-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-1">
        {timeLabel && (
          <span className="text-[10px] tabular-nums font-mono text-muted/50">{timeLabel}</span>
        )}
        {/* 信息圆圈图标（非 X，不让用户感觉出错了） */}
        <svg className="h-3 w-3 text-warning/80 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // pending：不显示任何内容
  return null;
}

/** 状态点（左侧） */
function StatusDot({ status }: { status: ExecutionLogStatus }) {
  const dotClass = STATUS_DOT[status];
  if (status === 'running') {
    return (
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', dotClass)} />
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', dotClass)} />
      </span>
    );
  }
  return <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotClass)} />;
}

/**
 * ExecutionLogItem — 执行日志行（含实时计时）
 *
 * memo 理由：
 * - ToolLogItem 是其唯一消费者；ToolLogItem 自身已 memo，但 expandedContent
 *   是每次渲染时内联创建的 <ToolCallCard> JSX，导致 ReactNode 引用每次不同。
 * - 自定义比较函数跳过 expandedContent 的引用比较（节点内容变化由 ToolCallCard 自身 memo 拦截），
 *   只比较驱动 UI 变化的标量 props，终态时直接短路。
 * - 注意：expandedContent 跳过比较是安全的，因为 ToolCallCard 已有自己的 memo 守卫。
 */
export const ExecutionLogItem = memo(function ExecutionLogItem({
  name,
  status,
  summary,
  startTime,
  elapsedSeconds,
  durationMs,
  expandedContent,
  defaultExpanded = false,
  className,
  liveActivity,
  icon,
}: ExecutionLogItemProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasExpandedContent = Boolean(expandedContent);

  const liveMs = useLiveTimer(status, startTime);
  const timeLabel = formatTime(
    status === 'running' ? liveMs : null,
    status !== 'running' ? durationMs : undefined,
    status !== 'running' ? elapsedSeconds : undefined,
  );

  const showLongHint = status === 'running' && liveMs !== null && liveMs > 30_000;

  const row = (
    <div className="flex min-w-0 items-center gap-2">
      <StatusDot status={status} />

      {/* 工具专属图标 */}
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}

      {/* 工具名 */}
      <span className="shrink-0 text-[11px] font-medium text-ink-700">{name}</span>

      {/* 摘要 */}
      {summary && (
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{summary}</span>
      )}

      {/* 右侧：状态图标（含时间） + 展开箭头 */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <StatusIcon status={status} timeLabel={timeLabel} />
        {hasExpandedContent && (
          <svg
            className={cn(
              'h-2.5 w-2.5 shrink-0 text-muted/40 transition-transform duration-150',
              expanded && 'rotate-90'
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn('group relative pl-3', className)}>
      {/* 左侧状态线，running 时加 pulse */}
      <div
        className={cn(
          'absolute left-0 top-0.5 bottom-0.5 w-[2px] rounded-full transition-colors duration-300',
          STATUS_LINE[status],
          status === 'running' && 'animate-pulse'
        )}
      />

      {hasExpandedContent ? (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full min-w-0 cursor-pointer rounded-sm py-0.5 text-left transition-colors hover:bg-ink-900/[0.03] -mx-0.5 px-0.5"
        >
          {row}
        </button>
      ) : (
        <div className="py-0.5">{row}</div>
      )}

      {/* 实时活动行：running 时在下方展示完整执行内容 */}
      {status === 'running' && liveActivity && (
        <div className="pb-0.5 flex items-center gap-1 min-w-0 overflow-hidden">
          <span className="text-[10px] font-mono text-muted/55 truncate leading-4 italic">
            {liveActivity}
          </span>
          {/* 闪烁光标 */}
          <span className="inline-block h-2.5 w-px bg-accent/50 animate-pulse shrink-0" />
        </div>
      )}

      {/* 长时间提示 */}
      {showLongHint && (
        <p className="pb-0.5 text-[10px] italic text-muted/50">
          {liveMs! > 60_000 ? '长时间任务执行中，请耐心等待...' : '这可能需要一些时间...'}
        </p>
      )}

      {hasExpandedContent && expanded && (
        <div className="mb-1 mt-1.5 min-w-0 max-w-full overflow-hidden">
          {expandedContent}
        </div>
      )}
    </div>
  );
},
/**
 * 自定义比较：
 * - expandedContent 是 ReactNode，每次父组件渲染都会创建新引用，跳过它的引用比较；
 *   其内部的 ToolCallCard 有自己的 memo，会在内容真正变化时更新。
 * - 终态（success/error）时只比较 name/status/durationMs，完全跳过动态字段。
 */
(prev, next) => {
  if (prev.status !== next.status) return false;
  if (prev.name !== next.name) return false;
  if (prev.className !== next.className) return false;

  const isTerminal = prev.status === 'success' || prev.status === 'error';
  if (isTerminal) {
    // 终态：durationMs/elapsedSeconds 稳定后不再变化
    return (
      prev.durationMs === next.durationMs &&
      prev.elapsedSeconds === next.elapsedSeconds
    );
  }

  // 运行态：summary/liveActivity 随工具输入变化
  return (
    prev.summary === next.summary &&
    prev.liveActivity === next.liveActivity &&
    prev.startTime === next.startTime &&
    prev.defaultExpanded === next.defaultExpanded
    // expandedContent 故意跳过——由 ToolCallCard 内部 memo 守卫
  );
});

export default ExecutionLogItem;
