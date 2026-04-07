import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { cn } from '@/ui/lib/utils';
import { useTranslation } from 'react-i18next';

/**
 * ThinkingBlock 组件属性
 */
export interface ThinkingBlockProps {
  /** 思考内容 */
  content: string;
  /** 思考时长（毫秒） */
  durationMs?: number;
  /** 是否正在思考中 */
  isThinking?: boolean;
  /** 初始展开状态，默认展开 */
  defaultExpanded?: boolean;
  /** 摘要最大字符数 */
  summaryMaxLength?: number;
  /** 额外的 CSS 类名 */
  className?: string;
}

/**
 * 格式化时长显示
 * @param ms - 毫秒数
 * @returns 格式化后的字符串
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

/**
 * 生成摘要文本
 * @param content - 完整内容
 * @param maxLength - 最大长度
 * @returns 摘要文本
 */
function generateSummary(content: string, maxLength: number): string {
  const plainText = content
    .replace(/```[\s\S]*?```/g, ' [代码块] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~>#-]+/g, ' ')
    .trim();
  const trimmed = plainText.replace(/\s+/g, ' ');
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength).trimEnd() + '...';
}

/**
 * 展开图标
 */
function ChevronIcon({ isExpanded, className }: { isExpanded: boolean; className?: string }) {
  return (
    <svg
      className={cn(
        'h-3 w-3 transition-transform duration-200',
        isExpanded && 'rotate-90',
        className
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * 思考块组件
 * 可折叠的思考过程显示，支持展开/折叠动画
 *
 * @example
 * // 基础用法
 * <ThinkingBlock content="这是AI的思考过程..." durationMs={1500} />
 *
 * @example
 * // 正在思考中
 * <ThinkingBlock content="正在分析问题..." isThinking={true} />
 *
 * @example
 * // 默认展开
 * <ThinkingBlock content="完整的思考内容..." defaultExpanded={true} />
 */
export const ThinkingBlock = React.memo(function ThinkingBlock({
  content,
  durationMs,
  isThinking = false,
  defaultExpanded = true,
  summaryMaxLength = 100,
  className,
}: ThinkingBlockProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const durationDisplayRef = useRef<HTMLSpanElement>(null);

  /**
   * 切换展开状态
   */
  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  /**
   * 摘要文本
   */
  const summary = useMemo(() => {
    return generateSummary(content, summaryMaxLength);
  }, [content, summaryMaxLength]);

  /**
   * 是否需要展开/折叠功能
   */
  const needsExpansion = useMemo(() => {
    return content.length > summaryMaxLength;
  }, [content, summaryMaxLength]);

  /**
   * 使用 ResizeObserver 监听内容高度变化，替代 useEffect + scrollHeight
   */
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContentHeight(entry.target.scrollHeight);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * 计时器：用 requestAnimationFrame + DOM 直接更新，避免每秒 setState 触发重渲染
   */
  useEffect(() => {
    if (!isThinking) {
      // 思考结束，显示最终时长
      if (durationDisplayRef.current && typeof durationMs === 'number') {
        durationDisplayRef.current.textContent = formatDuration(durationMs);
      }
      return;
    }

    const start = Date.now();
    let rafId: number;

    const tick = () => {
      if (durationDisplayRef.current) {
        durationDisplayRef.current.textContent = formatDuration(Date.now() - start);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [isThinking, durationMs]);

  /**
   * 静态时长显示（非思考中状态，初始渲染）
   */
  const initialDurationDisplay = useMemo(() => {
    if (isThinking) return '0ms';
    if (typeof durationMs !== 'number') return null;
    return formatDuration(durationMs);
  }, [durationMs, isThinking]);

  return (
    <div
      className={cn(
        'rounded-md border border-ink-900/8 bg-ink-900/[0.03]',
        'transition-all duration-300 ease-in-out',
        className
      )}
    >
      {/* 头部：标题、时长、展开按钮 */}
      <button
        type="button"
        onClick={needsExpansion ? handleToggle : undefined}
        disabled={!needsExpansion}
        className={cn(
          'flex w-full items-center gap-1.5 px-3 py-2 text-left',
          'transition-colors duration-200',
          needsExpansion && 'cursor-pointer hover:bg-ink-900/[0.03]',
          !needsExpansion && 'cursor-default'
        )}
        aria-expanded={isExpanded}
        aria-controls="thinking-content"
      >
        {/* 标题 */}
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400">
          {isThinking ? t('chat.thinking') : t('chat.thinkingProcess')}
        </span>

        {/* 时长 */}
        {(isThinking || initialDurationDisplay) && (
          <span ref={durationDisplayRef} className="ml-auto text-[11px] text-ink-300 tabular-nums font-mono">
            {initialDurationDisplay}
          </span>
        )}

        {/* 展开图标 */}
        {needsExpansion && (
          <ChevronIcon isExpanded={isExpanded} className="text-ink-300 flex-shrink-0" />
        )}
      </button>

      {/* 内容区域 */}
      <div
        id="thinking-content"
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isExpanded ? contentHeight + 32 : needsExpansion ? 0 : 'auto',
        }}
      >
        <div ref={contentRef} className="px-3 pb-3">
          {/* 分隔线 */}
          <div className="mb-2 border-t border-ink-900/6" />

          {/* 完整内容 */}
          <div className="text-[12px] text-ink-400 leading-relaxed whitespace-pre-wrap break-words">
            {content}
          </div>
        </div>
      </div>

      {/* 折叠时显示摘要 */}
      {!isExpanded && needsExpansion && (
        <div className="px-3 pb-2">
          <div className="text-[12px] text-ink-400 truncate">{summary}</div>
        </div>
      )}

      {/* 正在思考时的动画指示器 */}
      {isThinking && (
        <div className="px-3 pb-2.5">
          <div className="flex items-center gap-1">
            <span className="h-1 w-1 rounded-full bg-ink-400/50 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-1 w-1 rounded-full bg-ink-400/50 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="h-1 w-1 rounded-full bg-ink-400/50 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      )}
    </div>
  );
});

export default ThinkingBlock;
