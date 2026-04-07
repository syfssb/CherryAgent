import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  ScrollArea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  cn,
} from '@/ui/components/ui';
import { useSkillStore, type Skill, type CreateSkillData, type UpdateSkillData, getCategoryOptions, getSourceOptions } from '@/ui/store/useSkillStore';
import { useAppStore } from '@/ui/store/useAppStore';
import { getSkillDisplayName } from '@/ui/utils/skillI18n';
import { SkillCard } from '@/ui/components/skills/SkillCard';
import { SkillEditor } from '@/ui/components/skills/SkillEditor';
import { SkillDetail } from '@/ui/components/skills/SkillDetail';
import { useRouter } from '@/ui/hooks/useRouter';

/**
 * SkillMarket 页面属性
 */
export interface SkillMarketProps {
  /** 额外的 CSS 类名 */
  className?: string;
}

/**
 * 创建技能引导对话框
 */
function CreateSkillGuideDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = React.useState(false);

  const exampleText = t('skill.createGuideExample');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exampleText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 复制失败，静默处理
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ZapIcon className="h-5 w-5 text-accent" />
            {t('skill.createGuideTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('skill.createGuideDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm text-ink-700">
              {t('skill.createGuideInstruction')}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-surface-secondary border border-ink-400/10">
            <p className="text-sm font-mono text-ink-900 break-words">
              {exampleText}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="w-full"
          >
            {copied ? (
              <>
                <CheckIcon className="h-4 w-4 mr-2 text-success" />
                {t('common.copied')}
              </>
            ) : (
              <>
                <CopyIcon className="h-4 w-4 mr-2" />
                {t('common.copy')}
              </>
            )}
          </Button>

          <div className="space-y-2">
            <p className="text-xs text-muted">
              {t('skill.createGuideTip')}
            </p>
            <ul className="space-y-1 text-xs text-muted pl-4">
              <li>• {t('skill.createGuideExample1')}</li>
              <li>• {t('skill.createGuideExample2')}</li>
              <li>• {t('skill.createGuideExample3')}</li>
              <li>• {t('skill.createGuideExample4')}</li>
            </ul>
          </div>

          <p className="text-xs text-amber-500">
            {t('skill.createGuideClaudeOnly')}
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>
            {t('skill.createGuideGotIt')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 加载 Spinner 组件
 */
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/**
 * 刷新图标
 */
function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

/**
 * 加号图标
 */
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

/**
 * 搜索图标
 */
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/**
 * 闪电图标
 */
function ZapIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

/**
 * 删除图标
 */
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

/**
 * 关闭图标
 */
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="M6 6 18 18" />
    </svg>
  );
}

/**
 * 复制图标
 */
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

/**
 * 检查图标
 */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * 筛选器标签组件
 */
function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  allLabel,
}: {
  options: { value: T; label: string }[];
  value: T | '';
  onChange: (value: T | '') => void;
  allLabel: string;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        onClick={() => onChange('')}
        className={cn(
          'px-2.5 py-1 text-[12px] rounded-lg transition-colors',
          value === ''
            ? 'bg-accent/10 text-accent font-medium'
            : 'text-muted hover:text-ink-700 hover:bg-surface-secondary'
        )}
      >
        {allLabel}
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'px-2.5 py-1 text-[12px] rounded-lg transition-colors',
            value === option.value
              ? 'bg-accent/10 text-accent font-medium'
              : 'text-muted hover:text-ink-700 hover:bg-surface-secondary'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 删除确认对话框
 */
function DeleteConfirmDialog({
  open,
  skill,
  onClose,
  onConfirm,
  processing,
}: {
  open: boolean;
  skill: Skill | null;
  onClose: () => void;
  onConfirm: () => void;
  processing: boolean;
}) {
  const { t } = useTranslation();

  if (!skill) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-error">
            <TrashIcon className="h-5 w-5" />
            {t('skill.deleteTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('skill.deleteConfirm', { name: skill.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="p-3 bg-error/5 rounded-lg border border-error/20">
          <p className="text-sm text-error">
            {t('skill.deleteWarning')}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={processing}
          >
            {processing ? (
              <>
                <LoadingSpinner className="h-4 w-4 mr-2" />
                {t('common.deleting')}
              </>
            ) : (
              <>
                <TrashIcon className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 技能市场页面
 */
export function SkillMarket({ className }: SkillMarketProps) {
  const { t } = useTranslation();
  const { navigate } = useRouter();
  const skills = useSkillStore((s) => s.skills);
  const loading = useSkillStore((s) => s.loading);
  const saving = useSkillStore((s) => s.saving);
  const error = useSkillStore((s) => s.error);
  const searchQuery = useSkillStore((s) => s.searchQuery);
  const filterCategory = useSkillStore((s) => s.filterCategory);
  const filterSource = useSkillStore((s) => s.filterSource);
  const fetchSkills = useSkillStore((s) => s.fetchSkills);
  const toggleSkill = useSkillStore((s) => s.toggleSkill);
  const updateSkill = useSkillStore((s) => s.updateSkill);
  const deleteSkill = useSkillStore((s) => s.deleteSkill);
  const setSearchQuery = useSkillStore((s) => s.setSearchQuery);
  const setFilterCategory = useSkillStore((s) => s.setFilterCategory);
  const setFilterSource = useSkillStore((s) => s.setFilterSource);
  const getFilteredSkills = useSkillStore((s) => s.getFilteredSkills);
  const clearError = useSkillStore((s) => s.clearError);

  // 对话框状态
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [deletingSkill, setDeletingSkill] = useState<Skill | null>(null);

  // 初始加载
  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  // 刷新数据
  const handleRefresh = useCallback(() => {
    fetchSkills();
  }, [fetchSkills]);

  // 切换技能状态
  const handleToggle = useCallback(async (id: string) => {
    await toggleSkill(id);
  }, [toggleSkill]);

  // 更新技能
  const handleUpdate = useCallback(async (data: CreateSkillData | UpdateSkillData) => {
    if (editingSkill) {
      await updateSkill(editingSkill.id, data);
      setEditingSkill(null);
    }
  }, [editingSkill, updateSkill]);

  // 删除技能
  const handleDelete = useCallback(async () => {
    if (deletingSkill) {
      await deleteSkill(deletingSkill.id);
      setDeletingSkill(null);
      setSelectedSkill(null);
    }
  }, [deletingSkill, deleteSkill]);

  // 查看技能详情
  const handleViewDetail = useCallback((skill: Skill) => {
    setSelectedSkill(skill);
  }, []);

  // 从详情页编辑
  const handleEditFromDetail = useCallback(() => {
    if (selectedSkill) {
      setEditingSkill(selectedSkill);
      setSelectedSkill(null);
    }
  }, [selectedSkill]);

  // 从详情页删除
  const handleDeleteFromDetail = useCallback(() => {
    if (selectedSkill) {
      setDeletingSkill(selectedSkill);
      setSelectedSkill(null);
    }
  }, [selectedSkill]);

  // 从详情页切换状态
  const handleToggleFromDetail = useCallback(async () => {
    if (selectedSkill) {
      await toggleSkill(selectedSkill.id);
      // 更新选中的技能状态
      const updated = skills.find(s => s.id === selectedSkill.id);
      if (updated) {
        setSelectedSkill(updated);
      }
    }
  }, [selectedSkill, toggleSkill, skills]);

  const setPrompt = useAppStore((s) => s.setPrompt);
  const setActiveSessionId = useAppStore((s) => s.setActiveSessionId);

  // 应用技能：新建对话并预填"使用 xxx skill，帮我"
  const handleApplySkill = useCallback((skill: Skill) => {
    const displayName = getSkillDisplayName(skill.name, t);
    setActiveSessionId(null);
    setPrompt(t('skill.applySkillPrompt', '使用 {{name}} skill，帮我', { name: displayName }));
    navigate('/chat');
  }, [t, setPrompt, setActiveSessionId, navigate]);

  // 新建技能：直接新建对话并预填 Skill Creator 指令，无需弹出引导
  const handleCreateSkillChat = useCallback(() => {
    setActiveSessionId(null);
    setPrompt(t('skill.createSkillPrompt', '用 Skill Creator skill 帮我创建一个【  】的技能'));
    navigate('/chat');
  }, [t, setPrompt, setActiveSessionId, navigate]);

  // 获取筛选后的技能
  const filteredSkills = getFilteredSkills();

  // 统计信息
  const stats = React.useMemo(() => {
    const total = skills.length;
    const enabled = skills.filter(s => s.enabled).length;
    const builtin = skills.filter(s => s.source === 'builtin').length;
    const custom = skills.filter(s => s.source === 'custom').length;
    return { total, enabled, builtin, custom };
  }, [skills]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header: title + stats + actions */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1414130d] dark:border-[#faf9f50d]">
        <div className="flex items-center gap-4">
          {/* 返回按钮 */}
          <button
            onClick={() => navigate('/chat')}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-[#87867f] hover:bg-[#1414130a] hover:text-[#141413] dark:text-[#9a9893] dark:hover:bg-[#faf9f50a] dark:hover:text-[#faf9f5] transition-colors duration-150"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            {t('common.back', '返回')}
          </button>
          <div className="w-px h-5 bg-[#1414131a] dark:bg-[#faf9f51a]" />
          <div>
            <h1 className="text-lg font-semibold text-ink-900">
              {t('skill.marketTitle')}
            </h1>
            <div className="flex items-center gap-3 mt-0.5 text-[13px] text-muted">
              <span>{stats.enabled}/{stats.total} {t('skill.enabledSkills')}</span>
              <span className="text-ink-400/30">|</span>
              <span>{stats.builtin} {t('skill.builtinSkills')}</span>
              {stats.custom > 0 && (
                <>
                  <span className="text-ink-400/30">|</span>
                  <span>{stats.custom} {t('skill.customSkills')}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 rounded-lg text-muted hover:text-ink-700 hover:bg-surface-secondary transition-colors"
          >
            <RefreshIcon className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
          <Button
            size="sm"
            onClick={handleCreateSkillChat}
          >
            <PlusIcon className="h-4 w-4 mr-1.5" />
            {t('skill.addSkill')}
          </Button>
        </div>
      </div>

      <div className="px-6 pt-3">
        <div className="rounded-xl border border-ink-900/10 bg-surface-secondary p-4">
          <div className="text-sm font-medium text-ink-900">
            {t('skill.onboardingTitle', '新手上手：Skill 是做什么的？')}
          </div>
          <p className="mt-1 text-xs text-muted">
            {t('skill.onboardingDescription', 'Skill 就像给 AI 的“专用能力包”，开启后会在合适场景自动生效。')}
          </p>
          <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
            <div className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2">
              <span className="font-medium text-ink-800">1.</span>{" "}
              {t('skill.onboardingStep1', '先保留 3-5 个你最常用的技能，避免一次开启太多。')}
            </div>
            <div className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2">
              <span className="font-medium text-ink-800">2.</span>{" "}
              {t('skill.onboardingStep2', '正常发任务即可，AI 会自动选择匹配技能，也可手动筛选。')}
            </div>
            <div className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2">
              <span className="font-medium text-ink-800">3.</span>{" "}
              {t('skill.onboardingStep3', '流程有个性需求时，点“添加技能”按引导创建自己的技能。')}
            </div>
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="px-6 py-3 space-y-2.5 border-b border-ink-400/10">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('skill.searchPlaceholder')}
            className="pl-10 h-9 text-[13px]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink-700"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <FilterTabs
            options={getCategoryOptions(t)}
            value={filterCategory}
            onChange={setFilterCategory}
            allLabel={t('skill.allCategories')}
          />
          <span className="text-ink-400/20">|</span>
          <FilterTabs
            options={getSourceOptions(t)}
            value={filterSource}
            onChange={setFilterSource}
            allLabel={t('skill.allSources')}
          />
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="px-6 py-3">
          <div className="flex items-center justify-between p-3 bg-error/5 rounded-lg border border-error/20">
            <span className="text-sm text-error">{error}</span>
            <button
              onClick={clearError}
              className="text-error hover:text-error/80"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 技能列表 */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <LoadingSpinner className="h-8 w-8 text-accent" />
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <ZapIcon className="h-16 w-16 mb-4" />
            <p className="text-lg font-medium">
              {searchQuery || filterCategory || filterSource
                ? t('skill.noResults')
                : t('skill.empty')}
            </p>
            <p className="text-sm mt-1">
              {searchQuery || filterCategory || filterSource
                ? t('skill.noResultsHint')
                : t('skill.emptyHint')}
            </p>
            {!searchQuery && !filterCategory && !filterSource && (
              <Button
                className="mt-4"
                onClick={() => setShowGuideDialog(true)}
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                {t('skill.addSkill')}
              </Button>
            )}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
              {filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onClick={() => handleViewDetail(skill)}
                  onToggle={() => handleToggle(skill.id)}
                  onApply={() => handleApplySkill(skill)}
                  toggling={saving}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* 结果计数 */}
      {!loading && filteredSkills.length > 0 && (
        <div className="px-6 py-2 border-t border-ink-400/8 text-center">
          <span className="text-[11px] text-ink-400">
            {t('skill.resultCount', { count: filteredSkills.length, total: skills.length })}
          </span>
        </div>
      )}

      {/* 技能详情对话框 */}
      <SkillDetail
        open={!!selectedSkill}
        skill={selectedSkill}
        onClose={() => setSelectedSkill(null)}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteFromDetail}
        onToggle={handleToggleFromDetail}
        processing={saving}
      />

      {/* 编辑技能对话框 */}
      <SkillEditor
        open={!!editingSkill}
        skill={editingSkill}
        onClose={() => setEditingSkill(null)}
        onSave={handleUpdate}
        saving={saving}
      />

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={!!deletingSkill}
        skill={deletingSkill}
        onClose={() => setDeletingSkill(null)}
        onConfirm={handleDelete}
        processing={saving}
      />
    </div>
  );
}

export default SkillMarket;
