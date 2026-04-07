import * as React from 'react';
import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/ui/lib/utils';
import { useAppStore } from '@/ui/store/useAppStore';

/**
 * 工具调用状态
 */
export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

/**
 * ToolCallCard 组件属性
 */
export interface ToolCallCardProps {
  /** 工具名称 */
  toolName: string;
  /** 工具调用 ID */
  toolUseId?: string;
  /** 调用状态 */
  status: ToolCallStatus;
  /** 输入参数 */
  input?: Record<string, unknown>;
  /** 输出结果 */
  output?: string | Record<string, unknown>;
  /** 是否输出为错误 */
  isError?: boolean;
  /** 执行时间（毫秒） */
  executionTimeMs?: number;
  /** 额外的 CSS 类名 */
  className?: string;
  /** 输入面板默认展开 */
  defaultInputExpanded?: boolean;
  /** 输出面板默认展开 */
  defaultOutputExpanded?: boolean;
}

/**
 * 格式化执行时间
 */
function formatExecutionTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

/**
 * 状态配置
 */
const STATUS_CONFIG: Record<
  ToolCallStatus,
  {
    labelKey: string;
    labelDefault: string;
    bgClass: string;
    textClass: string;
    dotClass: string;
    isAnimated: boolean;
  }
> = {
  pending: {
    labelKey: 'toolCall.status.pending',
    labelDefault: '等待中',
    bgClass: 'bg-[#1414130a]',
    textClass: 'text-[#87867f]',
    dotClass: 'bg-[#b0aea5]',
    isAnimated: false,
  },
  running: {
    labelKey: 'toolCall.status.running',
    labelDefault: '执行中',
    bgClass: 'bg-[#ae56300a]',
    textClass: 'text-[#ae5630]',
    dotClass: 'bg-[#ae5630]',
    isAnimated: true,
  },
  success: {
    labelKey: 'toolCall.status.success',
    labelDefault: '成功',
    bgClass: 'bg-[#7878730a]',
    textClass: 'text-[#87867f]',
    dotClass: 'bg-[#787873]',
    isAnimated: false,
  },
  error: {
    labelKey: 'toolCall.status.error',
    labelDefault: '失败',
    bgClass: 'bg-[#DC262608]',
    textClass: 'text-[#DC2626]',
    dotClass: 'bg-[#DC2626]',
    isAnimated: false,
  },
};

/**
 * 工具图标映射
 */
const TOOL_ICONS: Record<string, React.ReactNode> = {
  Bash: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m7 11 2-2-2-2" />
      <path d="M11 13h4" />
    </svg>
  ),
  Read: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  ),
  Write: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Edit: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  Glob: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  Grep: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
      <path d="M8 11h6" />
    </svg>
  ),
  Task: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </svg>
  ),
  WebFetch: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
};

/**
 * 默认工具图标
 */
function DefaultToolIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

/**
 * 状态指示点
 */
function StatusDot({ status }: { status: ToolCallStatus }) {
  const config = STATUS_CONFIG[status];

  return (
    <span className="relative flex h-2 w-2">
      {config.isAnimated && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
            config.dotClass
          )}
        />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', config.dotClass)} />
    </span>
  );
}

/**
 * 展开/折叠按钮
 */
function ExpandButton({
  isExpanded,
  onClick,
  label,
}: {
  isExpanded: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs text-muted hover:text-ink-700 transition-colors"
    >
      <svg
        className={cn('h-3 w-3 transition-transform duration-200', isExpanded && 'rotate-90')}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

/**
 * 获取工具简要信息
 */
function getToolInfo(toolName: string, input?: Record<string, unknown>): string | null {
  if (!input) return null;

  switch (toolName) {
    case 'Bash':
      return typeof input.command === 'string' ? input.command : null;
    case 'Read':
    case 'Write':
    case 'Edit':
      return typeof input.file_path === 'string' ? input.file_path : null;
    case 'Glob':
    case 'Grep':
      return typeof input.pattern === 'string' ? input.pattern : null;
    case 'Task':
      return typeof input.description === 'string' ? input.description : null;
    case 'WebFetch':
      return typeof input.url === 'string' ? input.url : null;
    case 'WebSearch':
      return typeof input.query === 'string' ? input.query : null;
    case 'NotebookEdit':
      return typeof input.notebook_path === 'string' ? input.notebook_path : null;
    case 'Agent':
      return typeof input.task === 'string' ? input.task : (typeof input.description === 'string' ? input.description : null);
    case 'Skill':
      return typeof input.name === 'string' ? input.name : null;
    default:
      return null;
  }
}

/**
 * 工具调用卡片组件
 * 显示工具名称、状态、输入参数和输出结果
 *
 * 使用 React.memo 包裹原因：
 * - 工具卡片在 status=success/error 后不再发生变化
 * - ToolLogItem 订阅 zustand store，store 任意 key 更新都会触发 ToolLogItem 重渲染
 *   进而触发本组件重渲染——自定义比较函数在 status 稳定后可完全拦截
 *
 * @example
 * // 执行中的工具调用
 * <ToolCallCard
 *   toolName="Bash"
 *   status="running"
 *   input={{ command: "ls -la" }}
 * />
 *
 * @example
 * // 完成的工具调用
 * <ToolCallCard
 *   toolName="Read"
 *   status="success"
 *   input={{ file_path: "/src/App.tsx" }}
 *   output="文件内容..."
 *   executionTimeMs={150}
 * />
 */
export const ToolCallCard = React.memo(function ToolCallCard({
  toolName,
  toolUseId: _toolUseId,
  status,
  input,
  output,
  isError = false,
  executionTimeMs,
  className,
  defaultInputExpanded = false,
  defaultOutputExpanded = false,
}: ToolCallCardProps) {
  const { t } = useTranslation();
  const [isInputExpanded, setIsInputExpanded] = useState(defaultInputExpanded);
  const [isOutputExpanded, setIsOutputExpanded] = useState(defaultOutputExpanded);
  const cwd = useAppStore((state) => {
    const sessionId = state.activeSessionId;
    return sessionId ? state.sessions[sessionId]?.cwd : undefined;
  });

  const statusConfig = STATUS_CONFIG[status];
  const toolIcon = TOOL_ICONS[toolName] ?? <DefaultToolIcon />;
  const toolInfo = useMemo(() => getToolInfo(toolName, input), [toolName, input]);
  const filePath = useMemo(() => {
    if (!input) return null;
    const candidate =
      typeof (input as any).file_path === 'string'
        ? (input as any).file_path
        : typeof (input as any).path === 'string'
          ? (input as any).path
          : null;
    return candidate || null;
  }, [input]);
  const showOpenFolder =
    Boolean(cwd) && ['Write', 'Edit'].includes(toolName) && status === 'success' && Boolean(filePath);
  const statusLabel = t(statusConfig.labelKey, statusConfig.labelDefault);

  const handleOpenInFolder = useCallback(async () => {
    if (!filePath || !cwd) return;
    try {
      await window.electron.shell.showItemInFolder(filePath, cwd);
    } catch (error) {
      console.error('[ToolCallCard] showItemInFolder failed:', error);
    }
  }, [cwd, filePath]);

  /**
   * 切换输入面板展开状态
   */
  const handleToggleInput = useCallback(() => {
    setIsInputExpanded((prev) => !prev);
  }, []);

  /**
   * 切换输出面板展开状态
   */
  const handleToggleOutput = useCallback(() => {
    setIsOutputExpanded((prev) => !prev);
  }, []);

  /**
   * 格式化输入参数显示
   */
  const formattedInput = useMemo(() => {
    if (!input) return null;
    try {
      if (toolName === 'Bash') {
        const { description: _d, timeout: _t, ...rest } = input as Record<string, unknown>;
        void _d; void _t;
        return typeof rest.command === 'string' ? rest.command : JSON.stringify(rest, null, 2);
      }
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  }, [input, toolName]);

  /**
   * 格式化输出结果显示
   */
  const formattedOutput = useMemo(() => {
    if (!output) return null;
    // Strip ANSI escape codes so terminal color/cursor sequences don't render as raw text
    const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[mGKHFJSTDACBsu]|\x1B\([AB]/g, '');
    if (typeof output === 'string') return stripAnsi(output);
    try {
      return stripAnsi(JSON.stringify(output, null, 2));
    } catch {
      return stripAnsi(String(output));
    }
  }, [output]);

  /**
   * 执行时间显示
   */
  const executionTimeDisplay = useMemo(() => {
    if (typeof executionTimeMs !== 'number') return null;
    return formatExecutionTime(executionTimeMs);
  }, [executionTimeMs]);

  return (
    <div
      className={cn(
        'animate-[cardIn_0.2s_ease-out_forwards]',
        'w-full min-w-0 max-w-full rounded-xl border border-[#1414130d] bg-[#1414130a] dark:bg-[#faf9f50a] dark:border-[#faf9f50d] overflow-hidden',
        'transition-all duration-200',
        className
      )}
    >
      {/* 头部 */}
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
        {/* 状态指示点 */}
        <StatusDot status={status} />

        {/* 工具图标 */}
        <span className="shrink-0 text-[#ae5630]">{toolIcon}</span>

        {/* 工具名称 */}
        <span className="shrink-0 text-sm font-medium text-[#ae5630]">{toolName}</span>

        {/* 工具简要信息 */}
        {toolInfo && (
          <span className="min-w-0 flex-1 truncate text-sm text-muted" title={toolInfo}>
            {toolInfo}
          </span>
        )}

        {/* 右侧状态区 */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {executionTimeDisplay && (
            <span className="text-xs text-muted tabular-nums">{executionTimeDisplay}</span>
          )}

          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              statusConfig.bgClass,
              statusConfig.textClass
            )}
          >
            {statusLabel}
          </span>

          {showOpenFolder && (
            <button
              type="button"
              onClick={handleOpenInFolder}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-ink-700 hover:bg-surface-tertiary"
            >
              {t('toolCall.openInFolder', '在文件夹中打开')}
            </button>
          )}
        </div>
      </div>

      {/* 输入参数区域 */}
      {formattedInput && (
        <div className="border-t border-ink-400/10">
          <div className="px-3 py-1.5">
            <ExpandButton
              isExpanded={isInputExpanded}
              onClick={handleToggleInput}
              label={t('toolCall.inputParameters', '输入参数')}
            />
          </div>
          {isInputExpanded && (
            <div className="px-3 pb-2">
              <pre className="w-full max-w-full max-h-48 overflow-y-auto overflow-x-hidden rounded-lg bg-[#f0eee6] dark:bg-[#1a1918] p-2 text-[11px] text-[#141413] dark:text-[#faf9f5] font-mono whitespace-pre-wrap [overflow-wrap:anywhere]">
                {formattedInput}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 输出结果区域 */}
      {formattedOutput && (
        <div className="border-t border-ink-400/10">
          <div className="px-3 py-1.5">
            <ExpandButton
              isExpanded={isOutputExpanded}
              onClick={handleToggleOutput}
              label={t('toolCall.outputResult', '输出结果')}
            />
          </div>
          {isOutputExpanded && (
            <div className="px-3 pb-2">
              <pre
                className={cn(
                  'w-full max-w-full max-h-64 overflow-y-auto overflow-x-hidden rounded-lg p-2 text-[11px] font-mono whitespace-pre-wrap [overflow-wrap:anywhere]',
                  isError
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-[#f0eee6] dark:bg-[#1a1918] text-[#141413] dark:text-[#faf9f5]'
                )}
              >
                {formattedOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
},
/**
 * 自定义比较函数：status 为终态（success/error）后，output/input 不会再变化，
 * 直接跳过重渲染；running/pending 时允许所有 props 触发更新
 */
(prevProps, nextProps) => {
  // status 有变化时必须重渲染
  if (prevProps.status !== nextProps.status) return false;
  // 处于终态时，只要 toolName 和 status 未变，其余 props 可全部跳过
  const isTerminal = prevProps.status === 'success' || prevProps.status === 'error';
  if (isTerminal) {
    return (
      prevProps.toolName === nextProps.toolName &&
      prevProps.isError === nextProps.isError &&
      prevProps.className === nextProps.className
    );
  }
  // running/pending：回退到默认的浅比较（不提供第二参数等价）
  return (
    prevProps.toolName === nextProps.toolName &&
    prevProps.toolUseId === nextProps.toolUseId &&
    prevProps.input === nextProps.input &&
    prevProps.output === nextProps.output &&
    prevProps.isError === nextProps.isError &&
    prevProps.executionTimeMs === nextProps.executionTimeMs &&
    prevProps.className === nextProps.className
  );
});

export default ToolCallCard;
