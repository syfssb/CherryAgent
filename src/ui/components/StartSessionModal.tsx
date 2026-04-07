import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSkillDisplayName, getSkillDescription } from "../utils/skillI18n";
import { WorkspaceSelector } from "./sessions/WorkspaceSelector";
import { PermissionModeSelector } from "./chat/PermissionModeSelector";
import { useSkillStore, getCategoryIcon, type Skill } from "../store/useSkillStore";
import { useModelStore, type Model } from "../hooks/useModels";
import { ProviderIcon } from "@/ui/components/ProviderIcon";
import type { PermissionMode } from "../types";

interface StartSessionModalProps {
  cwd: string;
  permissionMode: PermissionMode;
  skillMode: "manual" | "auto";
  activeSkillIds: string[];
  pendingStart: boolean;
  onCwdChange: (value: string) => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  onSkillModeChange: (mode: "manual" | "auto") => void;
  onActiveSkillIdsChange: (ids: string[]) => void;
  onStart: () => void;
  onClose: () => void;
}

export function StartSessionModal({
  cwd,
  permissionMode,
  skillMode,
  activeSkillIds,
  pendingStart,
  onCwdChange,
  onPermissionModeChange,
  onSkillModeChange,
  onActiveSkillIdsChange,
  onStart,
  onClose
}: StartSessionModalProps) {
  const { t } = useTranslation();
  const [cwdError, setCwdError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isValidatingCwd, setIsValidatingCwd] = useState(false);
  const [cwdValidated, setCwdValidated] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const skills = useSkillStore((s) => s.skills);
  const loadingSkills = useSkillStore((s) => s.loading);
  const fetchSkills = useSkillStore((s) => s.fetchSkills);
  const models = useModelStore((s) => s.models);
  const modelsLoading = useModelStore((s) => s.loading);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const selectModel = useModelStore((s) => s.selectModel);
  const fetchModels = useModelStore((s) => s.fetchModels);

  // 验证工作目录
  const validateCwd = useCallback(async (path: string): Promise<boolean> => {
    if (!path.trim()) {
      setCwdError(t("error.workingDirectoryRequired", "需要工作目录"));
      return false;
    }

    setIsValidatingCwd(true);
    try {
      const result = await window.electron.workspace.exists(path);
      if (result.success && result.data?.exists) {
        setCwdError(null);
        setCwdValidated(true);
        return true;
      } else {
        setCwdError(t("error.directoryNotFound", "目录不存在"));
        setCwdValidated(false);
        return false;
      }
    } catch (error) {
      setCwdError(t("error.directoryValidateFailed", "验证目录失败"));
      setCwdValidated(false);
      return false;
    } finally {
      setIsValidatingCwd(false);
    }
  }, [t]);

  // 当 cwd 变化时重置验证状态
  useEffect(() => {
    setCwdValidated(false);
    setCwdError(null);
  }, [cwd]);

  // 用 ref 追踪最新 cwd，防止 bootstrap 异步回调覆盖用户已输入的值
  const latestCwdRef = useRef(cwd);
  useEffect(() => {
    latestCwdRef.current = cwd;
  }, [cwd]);

  // 打开时若 cwd 为空，自动填充默认工作目录
  useEffect(() => {
    if (!cwd.trim()) {
      window.electron.app.bootstrap().then((data: any) => {
        // 再次检查 cwd 是否仍为空（用户可能在 bootstrap 返回前已手动输入）
        if (data?.defaultCwd && !latestCwdRef.current.trim()) {
          onCwdChange(data.defaultCwd);
        }
      }).catch(() => {
        // 自动填充失败不阻塞，用户可以手动选择
      });
    }
  }, []); // 仅首次挂载时执行

  // 处理开始会话
  const handleStart = useCallback(async () => {
    if (pendingStart || isValidatingCwd) return;
    setSubmitAttempted(true);

    let hasError = false;
    if (!cwd.trim()) {
      setCwdError(t("error.workingDirectoryRequiredFriendly", "先选择一个工作目录，Agent 才能开始执行"));
      setCwdValidated(false);
      hasError = true;
    }
    if (hasError) {
      return;
    }

    // 先验证工作目录
    const isValid = await validateCwd(cwd);
    if (!isValid) {
      return;
    }

    // 添加到最近使用列表
    try {
      await window.electron.workspace.addRecent(cwd);
    } catch (error) {
      console.error("Failed to add to recent workspaces:", error);
    }

    // 开始会话
    onStart();
  }, [cwd, validateCwd, onStart, pendingStart, isValidatingCwd, t]);

  // 判断是否可直接开始
  const hasCwd = Boolean(cwd.trim());
  const canStart = hasCwd;
  const isAutoMode = skillMode === "auto";
  const enabledSkills = useMemo(() => skills.filter((s) => s.enabled), [skills]);
  const selectedSkills = useMemo(
    () => enabledSkills.filter((s) => activeSkillIds.includes(s.id)),
    [enabledSkills, activeSkillIds]
  );

  useEffect(() => {
    if (skills.length > 0 || loadingSkills) return;
    void fetchSkills();
  }, [skills.length, loadingSkills, fetchSkills]);

  useEffect(() => {
    if (models.length > 0 || modelsLoading) return;
    void fetchModels();
  }, [models.length, modelsLoading, fetchModels]);

  const toggleSkillMode = useCallback(() => {
    onSkillModeChange(isAutoMode ? "manual" : "auto");
  }, [isAutoMode, onSkillModeChange]);

  const toggleSkill = useCallback((skillId: string) => {
    const nextIds = activeSkillIds.includes(skillId)
      ? activeSkillIds.filter((id) => id !== skillId)
      : [...activeSkillIds, skillId];
    onActiveSkillIdsChange(nextIds);
  }, [activeSkillIds, onActiveSkillIdsChange]);

  const toggleAllSkills = useCallback(() => {
    if (activeSkillIds.length === enabledSkills.length) {
      onActiveSkillIdsChange([]);
    } else {
      onActiveSkillIdsChange(enabledSkills.map((s) => s.id));
    }
  }, [activeSkillIds.length, enabledSkills, onActiveSkillIdsChange]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 px-4 py-8 backdrop-blur-sm modal-backdrop">
      <div className="w-full max-w-lg rounded-2xl border border-ink-900/5 bg-surface shadow-elevated max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden modal-shell">
        {/* 标题栏 */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-surface px-6 pt-6 pb-4 border-b border-ink-900/5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-accent/10">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <div className="text-base font-semibold text-ink-800">
                {t("session.start", "开始会话")}
              </div>
              <div className="text-xs text-muted">
                {t("session.startDescription", "创建新的 Agent 会话")}
              </div>
            </div>
          </div>
          <button
            className="rounded-full p-1.5 text-muted hover:bg-surface-tertiary hover:text-ink-700 transition-colors"
            onClick={onClose}
            aria-label={t("common.close", "关闭")}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 modal-body">
          <div className="mt-5 grid gap-5">
            {/* 工作目录选择 */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  {t("session.workingDirectory", "工作目录")}
                </label>
                {cwdValidated && (
                  <span className="flex items-center gap-1 text-[10px] text-success">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {t("session.workingDirectoryValidated", "已验证")}
                  </span>
                )}
              </div>
              <WorkspaceSelector
                value={cwd}
                onChange={onCwdChange}
                disabled={pendingStart}
                error={cwdError || undefined}
              />
            </div>

            {/* 模型选择 */}
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                {t("session.model", "模型")}
              </label>
              {modelsLoading && models.length === 0 ? (
                <div className="flex items-center gap-1.5 rounded-xl border border-ink-900/10 bg-surface-secondary p-3 text-xs text-muted">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t("common.loading", "加载中...")}
                </div>
              ) : (
                <StartModelSelect
                  models={models}
                  selectedModelId={selectedModelId}
                  onSelect={selectModel}
                  disabled={pendingStart || models.length === 0}
                />
              )}
            </div>

            {/* 提示信息 */}
            {submitAttempted && !canStart && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
                <div className="text-xs font-medium text-ink-700">
                  {t("session.stepsHintTitle", "开始前还需完成以下内容：")}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <span className={`rounded-full px-2.5 py-1 ${hasCwd ? "bg-success/15 text-success" : "bg-surface-secondary text-ink-600"}`}>
                    {hasCwd ? t("session.stepCwdDone", "已选择工作目录") : t("session.stepCwdTodo", "选择工作目录")}
                  </span>
                </div>
              </div>
            )}

            {/* 高级设置 */}
            <div className="grid gap-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-light">
                {t("session.advancedTitle", "高级设置")}
              </div>
              <div className="rounded-xl border border-ink-900/10 bg-surface-secondary p-3">
              <button
                type="button"
                onClick={() => setAdvancedOpen((prev) => !prev)}
                className="flex w-full items-center justify-between text-sm font-medium text-ink-800"
              >
                <span className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-500" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v2M12 19v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M3 12h2M19 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                  {t("session.advanced", "高级设置")}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {advancedOpen && (
                <div className="mt-4 grid gap-4">
                  {/* 权限模式选择 */}
                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-muted flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      {t("session.permissionMode", "权限模式")}
                    </label>
                    <PermissionModeSelector
                      value={permissionMode}
                      onChange={onPermissionModeChange}
                      disabled={pendingStart}
                    />
                  </div>

                  {/* 技能模式选择 */}
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                        {t("skillSelector.mode", "技能模式")}
                      </label>
                      <button
                        type="button"
                        onClick={toggleSkillMode}
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
                    <div className="text-[10px] text-ink-500">
                      {isAutoMode
                        ? t("skills.autoModeDesc", "Auto mode: injects all enabled skill summaries, may increase token usage")
                        : t("skills.manualModeDesc", "Manual mode: only uses selected skills, reduces context injection")}
                    </div>
                    {isAutoMode && (
                      <div className="text-[10px] text-warning">
                        {t("skills.autoModeWarning", "Auto mode injects more context and increases credit usage")}
                      </div>
                    )}
                    {!isAutoMode && (
                      <div className="rounded-xl border border-ink-900/10 bg-surface-secondary/60 p-2 overflow-hidden">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] text-ink-600">
                            {t("skillSelector.selectedCount", "已选 {{selected}} / {{total}}", {
                              selected: selectedSkills.length,
                              total: enabledSkills.length,
                            })}
                          </span>
                          <button
                            type="button"
                            onClick={toggleAllSkills}
                            className="text-[10px] text-accent hover:text-accent-hover"
                          >
                            {activeSkillIds.length === enabledSkills.length
                              ? t("skillSelector.deselectAll", "取消全选")
                              : t("skillSelector.selectAll", "全选")}
                          </button>
                        </div>
                        <div className="max-h-28 space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                          {loadingSkills ? (
                            <div className="py-4 text-center text-xs text-ink-500">
                              {t("skillSelector.loading", "加载中...")}
                            </div>
                          ) : enabledSkills.length === 0 ? (
                            <div className="py-4 text-center text-xs text-ink-500">
                              {t("skillSelector.emptyEnabled", "没有启用的技能")}
                            </div>
                          ) : (
                            enabledSkills.map((skill) => (
                              <StartSkillItem
                                key={skill.id}
                                skill={skill}
                                selected={activeSkillIds.includes(skill.id)}
                                onToggle={() => toggleSkill(skill.id)}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* 提示 */}
            <div className="flex items-start gap-2 rounded-xl bg-info/5 border border-info/20 p-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 text-info mt-0.5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <p className="text-xs text-info leading-relaxed">
                {t(
                  "session.workingDirectoryHint",
                  "会话开始后工作目录将被锁定，Agent 将在该目录内操作。"
                )}
              </p>
            </div>

          </div>
        </div>
        <div className="sticky bottom-0 border-t border-ink-900/5 bg-surface px-6 py-4">
          {/* 开始按钮 */}
          <button
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-medium text-white shadow-soft transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleStart}
            disabled={pendingStart || isValidatingCwd}
          >
            {pendingStart || isValidatingCwd ? (
              <>
                <svg aria-hidden="true" className="w-5 h-5 animate-spin" viewBox="0 0 100 101" fill="none">
                  <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" opacity="0.3" />
                  <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="white" />
                </svg>
                <span>
                  {isValidatingCwd
                    ? t("session.validating", "验证中...")
                    : t("session.starting", "启动中...")}
                </span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>{t("session.start", "开始会话")}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StartModelSelect({
  models,
  selectedModelId,
  onSelect,
  disabled,
}: {
  models: Model[];
  selectedModelId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = models.find((m) => m.id === selectedModelId);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-xl border border-ink-900/10 bg-surface-secondary px-3 py-2.5 text-sm text-ink-800 transition-colors hover:border-ink-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {selected ? (
          <span className="flex items-center gap-1.5 min-w-0 truncate">
            <ProviderIcon provider={selected.provider} size="xs" />
            <span className="truncate font-medium">{selected.displayName}</span>
            <span className="shrink-0 text-[10px] text-muted">({selected.provider})</span>
            {selected.tags.map((tag) => (
              <span key={tag} className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-accent font-medium">
                <span className="h-1 w-1 rounded-full bg-accent/60" />
                {tag}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-muted">{t("models.noModels", "暂无可用模型")}</span>
        )}
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-ink-900/10 bg-surface p-1 shadow-lg">
          {models.map((m) => {
            const isActive = m.id === selectedModelId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => { onSelect(m.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                  isActive ? "bg-accent/10 text-accent" : "text-ink-800 hover:bg-ink-900/5"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ProviderIcon provider={m.provider} size="xs" />
                    <span className="text-sm font-medium truncate">{m.displayName}</span>
                    <span className="shrink-0 text-[10px] text-muted">({m.provider})</span>
                    {m.tags.map((tag) => (
                      <span key={tag} className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-accent font-medium">
                        <span className="h-1 w-1 rounded-full bg-accent/60" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                {isActive && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StartSkillItem({
  skill,
  selected,
  onToggle
}: {
  skill: Skill;
  selected: boolean;
  onToggle: () => void;
}) {
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
        <StartSkillIconByName name={iconName} className="h-3.5 w-3.5" />
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
          <StartCheckIcon className="h-4 w-4 text-white" />
        )}
      </div>
    </button>
  );
}

function StartCheckIcon({ className }: { className?: string }) {
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

function StartSkillIconByName({ name, className }: { name: string; className?: string }) {
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
