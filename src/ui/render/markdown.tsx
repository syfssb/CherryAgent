import { lazy, Suspense } from 'react';
import MDContentCoreStatic from './markdown-core';

const MDContentCoreLazy = lazy(() => import('./markdown-core'));

function MDContentShimmer() {
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

export default function MDContent({ text }: { text: string }) {
  if (import.meta.env.DEV) {
    return <MDContentCoreStatic text={text} />;
  }

  return (
    <Suspense fallback={<MDContentShimmer />}>
      <MDContentCoreLazy text={text} />
    </Suspense>
  );
}
