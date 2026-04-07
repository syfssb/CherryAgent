import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/ui/lib/utils';
import { useProgressSteps } from '@/ui/hooks/useProgressSteps';
import { isWindows } from '@/ui/utils/platform';
import { ProgressSection } from './ProgressSection';
import { ArtifactsSection } from './ArtifactsSection';
import { ContextSection } from './ContextSection';

interface WorkPanelProps {
  collapsed?: boolean;
  overlay?: boolean;
  width?: number;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function WorkPanel({
  collapsed = false,
  overlay = false,
  width = 256,
  onCollapsedChange,
}: WorkPanelProps) {
  const { t } = useTranslation();
  const { isRunning } = useProgressSteps();

  // Windows titleBarOverlay 高度 36px，overlay 模式需要偏移避免被窗口控件遮挡
  const winTitleBarHeight = isWindows() ? 36 : 0;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onCollapsedChange?.(false)}
        className={cn(
          'flex flex-col items-center justify-center border-l border-[#1414130d] bg-[#faf9f5]/50 text-[#b0aea5] transition-colors duration-150 hover:bg-[#faf9f5] hover:text-[#87867f] dark:border-[#faf9f50d] dark:bg-[#1a1918]/50 dark:hover:bg-[#1a1918] dark:hover:text-[#87867f]',
          overlay
            ? 'fixed right-0 z-40 h-24 w-10 rounded-l-xl border-y shadow-[0_12px_32px_rgba(0,0,0,0.14)]'
            : 'h-full w-10',
        )}
        style={overlay ? { top: `calc(50% + ${winTitleBarHeight / 2}px)`, transform: 'translateY(-50%)' } : undefined}
        title={t('workspace.showWorkPanel', '展开工作面板')}
        aria-label={t('workspace.showWorkPanel', '展开工作面板')}
      >
        <PanelRightOpen className="h-4 w-4" />
      </button>
    );
  }

  return (
    <>
      {overlay && (
        <button
          type="button"
          className="fixed inset-x-0 bottom-0 z-30 bg-black/10 backdrop-blur-[1px]"
          style={{ top: winTitleBarHeight }}
          aria-label={t('workspace.hideWorkPanel', '收起工作面板')}
          onClick={() => onCollapsedChange?.(true)}
        />
      )}
      <aside
        className={cn(
          'flex h-full shrink-0 flex-col border-l border-[#1414130d] bg-[#faf9f5] dark:border-[#faf9f50d] dark:bg-[#1a1918]',
          'transition-[width] duration-200 ease-in-out overflow-hidden',
          overlay
            ? 'fixed right-0 z-40 shadow-[0_24px_60px_rgba(0,0,0,0.18)]'
            : 'relative',
        )}
        style={{
          width,
          minWidth: width,
          ...(overlay && {
            top: winTitleBarHeight,
            height: `calc(100vh - ${winTitleBarHeight}px)`,
          }),
        }}
      >
        <div
          className="flex items-center justify-between border-b border-[#1414130d] px-4 py-2.5 dark:border-[#faf9f50d]"
          style={{ paddingTop: !overlay && winTitleBarHeight ? winTitleBarHeight + 4 : undefined }}
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#b0aea5]">
            {t('workspace.workPanel', '工作面板')}
          </span>
          <button
            type="button"
            onClick={() => onCollapsedChange?.(true)}
            className="rounded-lg p-1 text-[#b0aea5] transition-colors duration-150 hover:bg-[#1414130a] hover:text-[#87867f] dark:hover:bg-[#faf9f50a]"
            title={t('workspace.hideWorkPanel', '收起工作面板')}
            aria-label={t('workspace.hideWorkPanel', '收起工作面板')}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>

        {/* 任务运行时的不定进度条 */}
        {isRunning && (
          <div className="relative h-[2px] w-full overflow-hidden bg-[#1414130a] dark:bg-[#faf9f50a]">
            <div
              className="absolute h-full bg-[#ae5630]"
              style={{
                width: '40%',
                animation: 'workpanel-indeterminate 1.6s ease-in-out infinite',
              }}
            />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <ProgressSection />
          <ArtifactsSection />
          <ContextSection />
        </div>
      </aside>
    </>
  );
}
