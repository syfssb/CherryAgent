import * as React from 'react';
import { useDeferredValue, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { rehypeHighlightLanguages } from '@/ui/lib/rehype-highlight-languages';
import remarkGfm from 'remark-gfm';
import { cn } from '@/ui/lib/utils';
import { CodeBlock } from './CodeBlock';
import { WidgetRenderer } from './WidgetRenderer';
import {
  parseAllShowWidgets,
  extractPartialWidgetCode,
  computePartialWidgetKey,
  type WidgetSegment,
} from '@/ui/lib/widget-sanitizer';

/**
 * MarkdownRenderer 组件属性
 */
export interface MarkdownRendererProps {
  /** Markdown 内容 */
  content: string;
  /** 是否启用代码块增强（使用 CodeBlock 组件） */
  enhancedCodeBlocks?: boolean;
  /** 额外的 CSS 类名 */
  className?: string;
  /** 是否处于流式传输状态（用于 widget 流式渲染） */
  isStreaming?: boolean;
}

/**
 * 提取代码块语言与文件名
 * 支持格式: language:filename (如 typescript:src/utils/helper.ts)
 */
function extractLanguageInfo(className?: string): { language: string; filename?: string } {
  if (!className) return { language: 'plaintext' };
  const match = /language-(\S+)/.exec(className);
  if (!match) return { language: 'plaintext' };

  const info = match[1];
  const colonIndex = info.indexOf(':');
  if (colonIndex > 0) {
    return {
      language: info.slice(0, colonIndex),
      filename: info.slice(colonIndex + 1),
    };
  }

  return { language: info };
}

/**
 * 检查是否为内联代码
 */
function isInlineCode(children: React.ReactNode, className?: string): boolean {
  // 如果有语言类名，说明是代码块
  if (className && /language-/.test(className)) {
    return false;
  }
  // 如果内容包含换行符，说明是代码块
  if (typeof children === 'string' && children.includes('\n')) {
    return false;
  }
  return true;
}

/**
 * Markdown 渲染器组件
 * 完整支持 GFM 语法，包括表格、任务列表、删除线等
 *
 * @example
 * // 基础用法
 * <MarkdownRenderer content="# Hello World" />
 *
 * @example
 * // 启用增强代码块
 * <MarkdownRenderer
 *   content={markdownString}
 *   enhancedCodeBlocks={true}
 * />
 */
function MarkdownRenderer({
  content,
  enhancedCodeBlocks = true,
  className,
  isStreaming = false,
}: MarkdownRendererProps) {
  const deferredContent = useDeferredValue(content);
  const isStale = deferredContent !== content;

  // ── Widget 检测：show-widget 围栏优先于 markdown 渲染 ──────────────────
  const hasWidgetFence = /```show-widget/.test(deferredContent);

  // 如果包含 widget 围栏，按分段渲染（文本段走 markdown，widget 段走 WidgetRenderer）
  const widgetResult = useMemo<{ segments: WidgetSegment[]; hasPartial: boolean } | null>(() => {
    if (!hasWidgetFence) return null;

    // 检查是否有已闭合的围栏
    const segments = parseAllShowWidgets(deferredContent);
    if (segments.length > 0) {
      // 所有围栏已闭合 — 检查末尾是否还有未闭合的围栏
      const lastIdx = deferredContent.lastIndexOf('```show-widget');
      const closedFences = [...deferredContent.matchAll(/```show-widget[\s\S]*?```/g)];
      const lastClosedEnd = closedFences.length > 0
        ? closedFences[closedFences.length - 1].index! + closedFences[closedFences.length - 1][0].length
        : 0;
      const remaining = deferredContent.slice(lastClosedEnd);
      const hasTrailingPartial = /```show-widget/.test(remaining);

      if (hasTrailingPartial) {
        // 已闭合围栏后面还跟了一个未闭合围栏
        const trailingFenceStart = remaining.indexOf('```show-widget');
        const beforePartial = remaining.slice(0, trailingFenceStart).trim();
        if (beforePartial) segments.push({ type: 'text', content: beforePartial });
        const fenceBody = remaining.slice(trailingFenceStart + '```show-widget'.length).trim();
        const { code, title } = extractPartialWidgetCode(fenceBody);
        if (code) {
          segments.push({ type: 'widget', data: { title, widget_code: code } });
        }
        return { segments, hasPartial: true };
      }
      return { segments, hasPartial: false };
    }

    // 有 fence 开头但未闭合 — 可能还在流式传输
    const lastFenceStart = deferredContent.lastIndexOf('```show-widget');
    if (lastFenceStart === -1) return null;

    const beforeText = deferredContent.slice(0, lastFenceStart).trim();
    const fenceBody = deferredContent.slice(lastFenceStart + '```show-widget'.length).trim();
    const { code, title } = extractPartialWidgetCode(fenceBody);

    const result: WidgetSegment[] = [];
    if (beforeText) {
      const beforeSegments = parseAllShowWidgets(beforeText);
      if (beforeSegments.length > 0) {
        result.push(...beforeSegments);
      } else {
        result.push({ type: 'text', content: beforeText });
      }
    }
    if (code) {
      result.push({ type: 'widget', data: { title, widget_code: code } });
    }
    return result.length > 0 ? { segments: result, hasPartial: true } : null;
  }, [deferredContent, hasWidgetFence]);

  /**
   * 自定义组件映射
   */
  const components = useMemo(
    () => ({
      // 标题 — 相对于 --chat-font-size 做倍率缩放
      h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h1
          className="mt-8 mb-4 font-bold text-ink-900 tracking-tight border-b border-ink-400/15 pb-2.5"
          style={{ fontSize: 'calc(var(--chat-font-size, 0.938rem) * 1.6)' }}
          {...props}
        >
          {children}
        </h1>
      ),
      h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h2
          className="mt-7 mb-3 font-semibold text-ink-900 tracking-tight border-b border-ink-400/10 pb-2"
          style={{ fontSize: 'calc(var(--chat-font-size, 0.938rem) * 1.35)' }}
          {...props}
        >
          {children}
        </h2>
      ),
      h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h3
          className="mt-6 mb-2.5 font-semibold text-ink-800 tracking-tight"
          style={{ fontSize: 'calc(var(--chat-font-size, 0.938rem) * 1.17)' }}
          {...props}
        >
          {children}
        </h3>
      ),
      h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h4
          className="mt-5 mb-2 font-semibold text-ink-800"
          style={{ fontSize: 'var(--chat-font-size, 0.938rem)' }}
          {...props}
        >
          {children}
        </h4>
      ),
      h5: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h5 className="mt-4 mb-1.5 text-sm font-semibold text-ink-700" {...props}>
          {children}
        </h5>
      ),
      h6: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h6 className="mt-3 mb-1.5 text-sm font-medium text-ink-600" {...props}>
          {children}
        </h6>
      ),

      // 段落 — 核心阅读体验，用 CSS 变量驱动
      p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
        <p
          className="tracking-[0.01em] text-ink-700 break-words [overflow-wrap:anywhere]"
          style={{
            fontSize: 'var(--chat-font-size, 0.938rem)',
            lineHeight: 'var(--chat-line-height, 1.8)',
            margin: 'var(--chat-paragraph-spacing, 0.75em) 0',
          }}
          {...props}
        >
          {children}
        </p>
      ),

      // 列表 — 间距跟随段落变量
      ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
        <ul
          className="ml-5 list-disc space-y-1.5"
          style={{ margin: 'var(--chat-paragraph-spacing, 0.75em) 0' }}
          {...props}
        >
          {children}
        </ul>
      ),
      ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
        <ol
          className="ml-5 list-decimal space-y-1.5"
          style={{ margin: 'var(--chat-paragraph-spacing, 0.75em) 0' }}
          {...props}
        >
          {children}
        </ol>
      ),
      li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
        <li
          className="text-ink-700 tracking-[0.01em]"
          style={{
            fontSize: 'var(--chat-font-size, 0.938rem)',
            lineHeight: 'var(--chat-line-height, 1.8)',
          }}
          {...props}
        >
          {children}
        </li>
      ),

      // 强调
      strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <strong className="font-semibold text-ink-900" {...props}>
          {children}
        </strong>
      ),
      em: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <em className="italic text-ink-800" {...props}>
          {children}
        </em>
      ),
      del: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <del className="line-through text-muted" {...props}>
          {children}
        </del>
      ),

      // 链接
      a: ({
        href,
        children,
        ...props
      }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a
          href={href}
          className="text-accent hover:text-accent/80 underline underline-offset-2 transition-colors"
          target="_blank"
          rel="noopener noreferrer"
          {...props}
        >
          {children}
        </a>
      ),

      // 图片
      img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
        <span className="block my-4">
          <img
            src={src}
            alt={alt ?? ''}
            className="max-w-full h-auto rounded-lg border border-ink-400/20 shadow-sm"
            loading="lazy"
            {...props}
          />
          {alt && (
            <span className="block mt-2 text-center text-sm text-muted">{alt}</span>
          )}
        </span>
      ),

      // 引用块 — 加大内边距，柔和背景，跟随排版变量
      blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
        <blockquote
          className="my-5 border-l-4 border-accent/40 bg-surface-secondary/40 pl-4 pr-3 py-3 italic text-ink-600"
          style={{
            fontSize: 'var(--chat-font-size, 0.938rem)',
            lineHeight: 'var(--chat-line-height, 1.8)',
          }}
          {...props}
        >
          {children}
        </blockquote>
      ),

      // 水平分割线
      hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
        <hr className="my-6 border-ink-400/20" {...props} />
      ),

      // 表格
      table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
        <div className="my-4 overflow-x-auto">
          <table
            className="min-w-full border-collapse border border-ink-400/20 rounded-lg overflow-hidden"
            {...props}
          >
            {children}
          </table>
        </div>
      ),
      thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
        <thead className="bg-surface-secondary" {...props}>
          {children}
        </thead>
      ),
      tbody: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
        <tbody className="divide-y divide-ink-400/10" {...props}>
          {children}
        </tbody>
      ),
      tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
        <tr className="hover:bg-surface-secondary/50 transition-colors" {...props}>
          {children}
        </tr>
      ),
      th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
        <th
          className="px-4 py-2.5 text-left text-[0.8125rem] font-semibold text-ink-800 border-b border-ink-400/20"
          {...props}
        >
          {children}
        </th>
      ),
      td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
        <td className="px-4 py-2.5 text-[0.8125rem] text-ink-700 leading-relaxed" {...props}>
          {children}
        </td>
      ),

      // 代码
      pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => {
        // 如果启用增强代码块，直接返回 children（CodeBlock 在 code 组件中处理）
        if (enhancedCodeBlocks) {
          return <>{children}</>;
        }
        return (
          <pre
            className="my-4 overflow-x-auto rounded-xl bg-surface-tertiary p-4 text-sm text-ink-700 font-mono"
            {...props}
          >
            {children}
          </pre>
        );
      },
      code: ({
        children,
        className: codeClassName,
        ...props
      }: React.HTMLAttributes<HTMLElement>) => {
        const { language, filename } = extractLanguageInfo(codeClassName);
        const isInline = isInlineCode(children, codeClassName);

        // 内联代码
        if (isInline) {
          return (
            <code
              className="inline-block max-w-full align-middle rounded-md bg-surface-tertiary px-1.5 py-0.5 text-accent font-mono text-[0.85em] whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
              {...props}
            >
              {children}
            </code>
          );
        }

        // 代码块
        const codeString = String(children).replace(/\n$/, '');

        if (enhancedCodeBlocks) {
          return (
            <div className="my-4">
              <CodeBlock
                code={codeString}
                language={language}
                filename={filename}
                showLineNumbers={true}
              />
            </div>
          );
        }

        return (
          <code className={cn(codeClassName, 'font-mono')} {...props}>
            {children}
          </code>
        );
      },

      // 任务列表复选框
      input: ({ type, checked, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => {
        if (type === 'checkbox') {
          return (
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="mr-2 h-4 w-4 rounded border-ink-400/30 text-accent focus-visible:ring-accent"
              {...props}
            />
          );
        }
        return <input type={type} {...props} />;
      },
    }),
    [enhancedCodeBlocks]
  );

  // ── Widget 分段渲染 ──────────────────────────────────────────────────────
  if (widgetResult && widgetResult.segments.length > 0) {
    const { segments: segs, hasPartial } = widgetResult;
    return (
      <div
        className={cn('markdown-content transition-opacity duration-100', className)}
        style={{ opacity: isStale ? 0.85 : 1 }}
      >
        {segs.map((seg, i) => {
          if (seg.type === 'widget' && seg.data) {
            // 只有最后一个 segment 且确实是 partial 时才标记为 streaming
            const isLast = i === segs.length - 1;
            const isPartialWidget = isStreaming && hasPartial && isLast;
            // partial widget 用 computePartialWidgetKey 保证 key 稳定
            const key = isPartialWidget
              ? computePartialWidgetKey(deferredContent)
              : `w-${i}`;
            return (
              <WidgetRenderer
                key={key}
                widgetCode={seg.data.widget_code}
                isStreaming={isPartialWidget}
                title={seg.data.title}
              />
            );
          }
          return (
            <ReactMarkdown
              key={`t-${i}`}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={enhancedCodeBlocks ? [] : [[rehypeHighlight, { languages: rehypeHighlightLanguages }]]}
              components={components as any}
            >
              {seg.content || ''}
            </ReactMarkdown>
          );
        })}
      </div>
    );
  }

  // ── 标准 markdown 渲染（无 widget）────────────────────────────────────────
  return (
    <div
      className={cn('markdown-content transition-opacity duration-100', className)}
      style={{ opacity: isStale ? 0.85 : 1 }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={enhancedCodeBlocks ? [] : [[rehypeHighlight, { languages: rehypeHighlightLanguages }]]}
        components={components as any}
      >
        {deferredContent}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;
export type { MarkdownRendererProps };
