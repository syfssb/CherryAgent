import { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useSkillStore, getCategoryIcon, type Skill } from "../../store/useSkillStore";
import { useAppStore } from "../../store/useAppStore";
import { toast } from "../../hooks/use-toast";
import { useTranslation } from "react-i18next";
import { getSkillDisplayName, getSkillDescription } from "../../utils/skillI18n";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";

interface SkillSelectorProps {
  sessionId: string | null;
  disabled?: boolean;
}

/**
 * Skill 选择器组件
 * 用于在聊天界面选择要激活的技能
 */
export function SkillSelector({ sessionId, disabled = false }: SkillSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const retryTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const attemptRef = useRef(0);
  const warnedRef = useRef(false);

  const sessions = useAppStore((s) => s.sessions);
  const session = sessionId ? sessions[sessionId] : null;

  const skills = useSkillStore((s) => s.skills);
  const loading = useSkillStore((s) => s.loading);
  const fetchSkills = useSkillStore((s) => s.fetchSkills);
  const refreshSkills = useSkillStore((s) => s.refreshSkills);

  // 当前会话的技能配置
  const skillMode = session?.skillMode ?? "auto";
  const activeSkillIds = session?.activeSkillIds ?? [];
  const isAutoMode = skillMode === "auto";

  // 获取启用的技能（用于显示）
  const enabledSkills = skills.filter((s) => s.enabled);
  const selectedSkills = enabledSkills.filter((s) => activeSkillIds.includes(s.id));

  // 加载技能列表
  useEffect(() => {
    if (skills.length > 0) {
      attemptRef.current = 0;
      warnedRef.current = false;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      return;
    }

    if (loading) return;
    if (retryTimerRef.current !== null || inFlightRef.current) return;

    const runFetch = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      attemptRef.current += 1;
      try {
        await fetchSkills();
        attemptRef.current = 0;
        warnedRef.current = false;
      } catch (error) {
        if (!warnedRef.current) {
          toast({
            title: t("skillSelector.loadFailedTitle", "技能加载失败"),
            description: t("skillSelector.loadFailedDescription", "将自动重试，请稍后..."),
            variant: "error",
            duration: 4000,
          });
          warnedRef.current = true;
        }
        const baseDelay = 1000;
        const delay = Math.min(30000, baseDelay * 2 ** Math.max(0, attemptRef.current - 1));
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          runFetch();
        }, delay);
      } finally {
        inFlightRef.current = false;
      }
    };

    runFetch();

    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      inFlightRef.current = false;
    };
  }, [skills.length, loading, fetchSkills]);

  // 更新会话的技能配置
  const updateSessionSkills = useCallback(async (
    newSkillIds: string[],
    newMode: "manual" | "auto"
  ) => {
    if (!sessionId) return;

    try {
      await (window.electron.session as any).update(sessionId, {
        activeSkillIds: newSkillIds,
        skillMode: newMode,
      });

      // 更新本地状态（乐观更新）
      useAppStore.setState((state) => {
        const existing = state.sessions[sessionId];
        if (!existing) return state;
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...existing,
              activeSkillIds: newSkillIds,
              skillMode: newMode,
            },
          },
        };
      });
    } catch (error) {
      console.error("Failed to update session skills:", error);
    }
  }, [sessionId]);

  // 切换技能模式
  const toggleMode = useCallback(() => {
    const newMode = skillMode === "auto" ? "manual" : "auto";
    updateSessionSkills(activeSkillIds, newMode);
  }, [skillMode, activeSkillIds, updateSessionSkills]);

  // 切换单个技能的选中状态
  const toggleSkill = useCallback((skillId: string) => {
    const isSelected = activeSkillIds.includes(skillId);
    const newSkillIds = isSelected
      ? activeSkillIds.filter((id) => id !== skillId)
      : [...activeSkillIds, skillId];
    updateSessionSkills(newSkillIds, "manual");
  }, [activeSkillIds, updateSessionSkills]);

  // 全选/取消全选
  const toggleAll = useCallback(() => {
    if (activeSkillIds.length === enabledSkills.length) {
      updateSessionSkills([], "manual");
    } else {
      updateSessionSkills(enabledSkills.map((s) => s.id), "manual");
    }
  }, [activeSkillIds.length, enabledSkills, updateSessionSkills]);

  // 刷新技能列表
  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await refreshSkills();
      if (result.synced > 0) {
        toast({
          title: t("skillSelector.refreshSuccess", "刷新成功"),
          description: t("skillSelector.refreshSyncedCount", "同步了 {{count}} 个新技能", { count: result.synced }),
          variant: "success",
          duration: 3000,
        });
      } else {
        toast({
          title: t("skillSelector.refreshSuccess", "刷新成功"),
          description: t("skillSelector.refreshNoNew", "没有发现新技能"),
          duration: 2000,
        });
      }
    } catch (error) {
      toast({
        title: t("skillSelector.refreshFailed", "刷新失败"),
        description: error instanceof Error ? error.message : "未知错误",
        variant: "error",
        duration: 3000,
      });
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refreshSkills, t]);

  // 显示文本
  const displayText = isAutoMode
    ? t("skillSelector.auto", "自动")
    : selectedSkills.length === 0
      ? t("skillSelector.none", "无技能")
      : selectedSkills.length === 1
        ? selectedSkills[0].name
        : t("skillSelector.count", "{{count}} 个技能", { count: selectedSkills.length });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={400}>
        <Tooltip open={open ? false : undefined}>
          <TooltipTrigger asChild>
            <Popover.Trigger asChild>
              <button
                type="button"
                data-tour="skill-selector"
                disabled={disabled}
                className={`icon-hover-bounce flex items-center gap-1 rounded-lg p-1.5 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                  isAutoMode
                    ? "text-accent bg-accent/8 hover:bg-accent/12"
                    : selectedSkills.length > 0
                      ? "text-accent bg-accent/8 hover:bg-accent/12"
                      : "text-ink-500 hover:bg-ink-900/8 hover:text-ink-700"
                }`}
              >
                <SkillIcon className="h-3.5 w-3.5" />
                {!isAutoMode && selectedSkills.length > 0 && (
                  <span className="font-semibold tabular-nums leading-none">{selectedSkills.length}</span>
                )}
              </button>
            </Popover.Trigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isAutoMode
              ? t("skillSelector.tooltip.auto", "技能（自动选择）")
              : selectedSkills.length > 0
                ? t("skillSelector.tooltip.manual", "技能（已选 {{count}} 个）", { count: selectedSkills.length })
                : t("skillSelector.tooltip.none", "技能（未选择）")}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Popover.Portal>
        <Popover.Content
          align="start"
          side="top"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-72 rounded-xl border border-ink-900/10 bg-surface p-3 shadow-card animate-in fade-in-0 zoom-in-95"
        >
          {/* 模式切换 */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-700">
              {t("skillSelector.autoLabel", "自动技能")}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="flex h-6 w-6 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-900/5 hover:text-ink-700 disabled:opacity-50"
                title={t("skillSelector.refresh", "刷新技能列表")}
              >
                <RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={toggleMode}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  isAutoMode ? "bg-accent" : "bg-ink-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    isAutoMode ? "left-[22px]" : "left-0.5"
                  }`}
                />
                <span className="sr-only">
                  {isAutoMode
                    ? t("skillSelector.autoMode", "自动模式")
                    : t("skillSelector.manualMode", "手动模式")}
                </span>
              </button>
            </div>
          </div>

          <div className="mb-2 text-[10px] text-ink-500">
            {isAutoMode
              ? t("skills.autoModeDesc", "Auto mode: injects all enabled skill summaries, may increase token usage")
              : t("skills.manualModeDesc", "Manual mode: only uses selected skills, reduces context injection")}
          </div>
          {isAutoMode && (
            <div className="mb-2 text-[10px] text-warning">
              {t("skills.autoModeWarning", "Auto mode injects more context and increases credit usage")}
            </div>
          )}

          {/* 技能列表（仅手动模式显示） */}
          {!isAutoMode && (
            <>
              <div className="mb-2 flex items-center justify-between border-t border-ink-900/5 pt-3">
                <span className="text-xs text-ink-600">
                  {t("skillSelector.selectedCount", "已选 {{selected}} / {{total}}", {
                    selected: selectedSkills.length,
                    total: enabledSkills.length,
                  })}
                </span>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-accent hover:text-accent-hover"
                >
                  {activeSkillIds.length === enabledSkills.length
                    ? t("skillSelector.deselectAll", "取消全选")
                    : t("skillSelector.selectAll", "全选")}
                </button>
              </div>

              <div className="max-h-48 space-y-1 overflow-y-auto">
                {loading ? (
                  <div className="py-4 text-center text-xs text-ink-500">
                    {t("skillSelector.loading", "加载中...")}
                  </div>
                ) : enabledSkills.length === 0 ? (
                  <div className="py-4 text-center text-xs text-ink-500">
                    {t("skillSelector.emptyEnabled", "没有启用的技能")}
                  </div>
                ) : (
                  enabledSkills.map((skill) => (
                    <SkillItem
                      key={skill.id}
                      skill={skill}
                      selected={activeSkillIds.includes(skill.id)}
                      onToggle={() => toggleSkill(skill.id)}
                    />
                  ))
                )}
              </div>
            </>
          )}

          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface SkillItemProps {
  skill: Skill;
  selected: boolean;
  onToggle: () => void;
}

function SkillItem({ skill, selected, onToggle }: SkillItemProps) {
  const { t } = useTranslation();
  const iconName = skill.icon || getCategoryIcon(skill.category);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
        selected
          ? "bg-accent/10 text-accent"
          : "text-ink-700 hover:bg-ink-900/5"
      }`}
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
          selected ? "bg-accent/20" : "bg-ink-900/5"
        }`}
      >
        <SkillIconByName name={iconName} className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{getSkillDisplayName(skill.name, t)}</div>
        <div className="truncate text-[10px] text-ink-500">
          {getSkillDescription(skill.name, skill.description, t)}
        </div>
      </div>
      <div
        className={`h-4 w-4 shrink-0 rounded border transition-colors ${
          selected
            ? "border-accent bg-accent"
            : "border-ink-300 bg-transparent"
        }`}
      >
        {selected && (
          <CheckIcon className="h-4 w-4 text-white" />
        )}
      </div>
    </button>
  );
}

// Icons
function SkillIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function SkillIconByName({ name, className }: { name: string; className?: string }) {
  // 简化的图标映射
  const iconPaths: Record<string, React.ReactNode> = {
    code: (
      <>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </>
    ),
    "pen-tool": (
      <>
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
      </>
    ),
    "bar-chart-2": (
      <>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </>
    ),
    cpu: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
        <rect x="9" y="9" width="6" height="6" />
        <line x1="9" y1="1" x2="9" y2="4" />
        <line x1="15" y1="1" x2="15" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" />
        <line x1="15" y1="20" x2="15" y2="23" />
        <line x1="20" y1="9" x2="23" y2="9" />
        <line x1="20" y1="14" x2="23" y2="14" />
        <line x1="1" y1="9" x2="4" y2="9" />
        <line x1="1" y1="14" x2="4" y2="14" />
      </>
    ),
    "message-square": (
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    ),
    box: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {iconPaths[name] || iconPaths.box}
    </svg>
  );
}

export default SkillSelector;
