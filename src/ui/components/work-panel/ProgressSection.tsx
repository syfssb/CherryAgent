import { useEffect, useState, memo } from 'react';
import { ChevronDown, ChevronRight, Terminal, FileText, FilePen, Search, Globe, MessageCircle, Bot, BookOpen, FolderSearch, FileSearch, Puzzle, Brain, CheckCircle, ListChecks, XCircle, SquareTerminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/ui/lib/utils';
import { useProgressSteps } from '@/ui/hooks/useProgressSteps';
import { SectionTooltip } from './SectionTooltip';

const MAX_VISIBLE = 5;

/**
 * ToolIcon — 纯展示组件，只依赖 toolName
 * memo 原因：步骤列表渲染时每行都会创建 ToolIcon 实例，streaming 期间 ProgressSection
 * 频繁重渲染，但已完成步骤的图标永远不变，memo 可完全跳过它们。
 */
const ToolIcon = memo(function ToolIcon({ toolName }: { toolName?: string }) {
  const cls = 'h-3.5 w-3.5 shrink-0 text-[#87867f]';
  switch (toolName) {
    case 'Bash':            return <Terminal className={cls} />;
    case 'Read':            return <FileSearch className={cls} />;
    case 'Write':           return <FileText className={cls} />;
    case 'Edit':            return <FilePen className={cls} />;
    case 'NotebookEdit':    return <BookOpen className={cls} />;
    case 'Glob':            return <FolderSearch className={cls} />;
    case 'Grep':            return <Search className={cls} />;
    case 'WebFetch':        return <Globe className={cls} />;
    case 'WebSearch':       return <Globe className={cls} />;
    case 'Task':            return <Bot className={cls} />;
    case 'TaskOutput':      return <SquareTerminal className={cls} />;
    case 'AskUserQuestion': return <MessageCircle className={cls} />;
    case 'Skill':           return <Puzzle className={cls} />;
    case 'EnterPlanMode':   return <Brain className={cls} />;
    case 'ExitPlanMode':    return <CheckCircle className={cls} />;
    case 'TodoWrite':       return <ListChecks className={cls} />;
    case 'KillShell':       return <XCircle className={cls} />;
    default:                return null;
  }
});

export function ProgressSection() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const { steps, isRunning } = useProgressSteps();
  const displaySteps = steps;

  useEffect(() => {
    if (isRunning) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 任务开始时自动展开是显式的交互要求
      setCollapsed(false);
    }
  }, [isRunning]);

  if (displaySteps.length === 0 && !isRunning) return null;

  const visibleSteps = displaySteps.length > MAX_VISIBLE ? displaySteps.slice(-MAX_VISIBLE) : displaySteps;
  const hiddenCount = displaySteps.length - visibleSteps.length;

  return (
    <section className="border-b border-[#1414130d] dark:border-[#faf9f50d]">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-[#1414130a] dark:hover:bg-[#faf9f50a]"
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[#87867f]">
            {t('workspace.progress', '进度')}
          </span>
          {displaySteps.length > 0 && (
            <span className="rounded-full bg-[#1414130d] dark:bg-[#faf9f50d] px-2 py-0.5 text-[11px] text-[#87867f]">
              {displaySteps.length}
            </span>
          )}
          <SectionTooltip text={t('workspace.tooltipProgress', 'AI is completing your task step by step. Watch in real time as it works — like a live feed.')} />
        </div>
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-[#b0aea5]" />
        ) : (
          <ChevronDown className="h-3 w-3 text-[#b0aea5]" />
        )}
      </button>

      {!collapsed && (
        <div className="space-y-0.5 px-3 pb-3">
          {displaySteps.length === 0 ? (
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <div className="flex w-4 shrink-0 items-center justify-center">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ae5630] animate-pulse" />
              </div>
              <span className="text-[12px] italic text-[#87867f]">
                {t('workspace.planningSteps', 'AI正在规划任务步骤...')}
              </span>
            </div>
          ) : (
            <>
              {hiddenCount > 0 && (
                <div className="flex items-center gap-2 px-2 py-1">
                  <div className="h-px flex-1 bg-[#1414130d] dark:bg-[#faf9f50d]" />
                  <span className="text-[11px] text-[#b0aea5]">
                    {t('workspace.hiddenCompleted', '已完成 {{count}} 步', { count: hiddenCount })}
                  </span>
                  <div className="h-px flex-1 bg-[#1414130d] dark:bg-[#faf9f50d]" />
                </div>
              )}

              {visibleSteps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150"
                >
                  <div className="flex w-4 shrink-0 items-center justify-center">
                    {step.status === 'completed' ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#787873]" />
                    ) : step.status === 'active' ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#ae5630] animate-pulse" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#d1cfc5] dark:bg-[#3d3d3a]" />
                    )}
                  </div>
                  {step.toolName && (
                    <div className="w-4 shrink-0 flex items-center justify-center">
                      <ToolIcon toolName={step.toolName} />
                    </div>
                  )}
                  <span
                    className={cn(
                      'flex-1 truncate text-[12px] leading-tight',
                      step.status === 'completed'
                        ? 'text-[#b0aea5] line-through decoration-[#b0aea5]/50'
                        : step.status === 'active'
                          ? 'font-medium text-[#141413] dark:text-[#faf9f5]'
                          : 'text-[#87867f]',
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
              {/* 当最后一步已完成但任务仍在运行时，显示"准备下一步"指示行 */}
              {isRunning && visibleSteps.length > 0 && visibleSteps[visibleSteps.length - 1]?.status === 'completed' && (
                <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                  <div className="flex w-4 shrink-0 items-center justify-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#ae5630] animate-pulse" />
                  </div>
                  <span className="text-[12px] italic text-[#87867f]">
                    {t('workspace.preparingNextStep', '正在处理结果...')}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
