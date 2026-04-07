import { lazy, Suspense } from 'react';
import type { MarkdownRendererProps } from './MarkdownRendererCore';

const MarkdownRendererCore = lazy(() => import('./MarkdownRendererCore'));

/**
 * Shimmer 占位符 — Markdown 渲染器加载中
 */
function MarkdownShimmer() {
  return (
    <div className="space-y-2 py-1" aria-busy="true" aria-label="Loading content">
      <div className="relative h-4 w-3/4 rounded bg-ink-900/[0.06] overflow-hidden">
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/20 to-transparent animate-shimmer" />
      </div>
      <div className="relative h-4 w-full rounded bg-ink-900/[0.06] overflow-hidden">
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/20 to-transparent animate-shimmer" />
      </div>
      <div className="relative h-4 w-5/6 rounded bg-ink-900/[0.06] overflow-hidden">
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/20 to-transparent animate-shimmer" />
      </div>
    </div>
  );
}

/**
 * 懒加载 Markdown 渲染器
 * react-markdown + rehype-highlight (~1.5MB) 仅在首次渲染时动态加载
 */
export function MarkdownRenderer(props: MarkdownRendererProps) {
  return (
    <Suspense fallback={<MarkdownShimmer />}>
      <MarkdownRendererCore {...props} />
    </Suspense>
  );
}

export type { MarkdownRendererProps };
export default MarkdownRenderer;
