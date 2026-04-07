import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { getLocaleFromLanguage } from '@/ui/i18n/config';
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  ScrollArea,
  cn,
} from '@/ui/components/ui';
import {
  type Skill,
  getCategoryLabel,
  getSourceLabel,
  getSourceColor,
} from '@/ui/store/useSkillStore';
import { getSkillIcon } from './SkillCard';
import { getSkillDisplayName, getSkillDescription } from '../../utils/skillI18n';

/**
 * SkillDetail 组件属性
 */
export interface SkillDetailProps {
  /** 是否打开 */
  open: boolean;
  /** 技能数据 */
  skill: Skill | null;
  /** 关闭对话框 */
  onClose: () => void;
  /** 编辑技能 */
  onEdit?: () => void;
  /** 删除技能 */
  onDelete?: () => void;
  /** 切换启用状态 */
  onToggle?: () => void;
  /** 是否正在处理 */
  processing?: boolean;
}

/**
 * 编辑图标
 */
function EditIcon({ className }: { className?: string }) {
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
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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
 * 用户图标
 */
function UserIcon({ className }: { className?: string }) {
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/**
 * 日历图标
 */
function CalendarIcon({ className }: { className?: string }) {
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
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

/**
 * 开关组件
 */
function Switch({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onCheckedChange}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        checked ? 'bg-accent' : 'bg-ink-400/30',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0',
          'transition duration-200 ease-in-out',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  );
}

/**
 * 格式化日期
 */
function formatDate(timestamp: number, locale: string): string {
  return new Date(timestamp).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * 展开/收起箭头图标
 */
function ChevronIcon({ className, expanded }: { className?: string; expanded: boolean }) {
  return (
    <svg
      className={cn(className, 'transition-transform duration-200', expanded && 'rotate-90')}
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
 * 技能详情对话框组件
 */
export function SkillDetail({
  open,
  skill,
  onClose,
  onEdit,
  onDelete,
  onToggle,
  processing,
}: SkillDetailProps) {
  const { t, i18n } = useTranslation();
  const locale = getLocaleFromLanguage(i18n.language);
  const [copied, setCopied] = React.useState(false);
  const [contentExpanded, setContentExpanded] = React.useState(false);

  // 对话框关闭时重置收起状态
  React.useEffect(() => {
    if (!open) {
      setContentExpanded(false);
      setCopied(false);
    }
  }, [open]);

  if (!skill) return null;

  const IconComponent = getSkillIcon(skill.icon ?? 'box');
  const isCustom = skill.source === 'custom';

  // 复制内容到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(skill.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 复制失败，静默处理
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0 pr-10">
          <div className="flex items-start gap-4">
            {/* 图标 */}
            <div
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                skill.enabled ? 'bg-accent/10' : 'bg-ink-400/10'
              )}
            >
              <IconComponent
                className={cn(
                  'h-6 w-6',
                  skill.enabled ? 'text-accent' : 'text-muted'
                )}
              />
            </div>

            {/* 标题区 */}
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg">{getSkillDisplayName(skill.name, t)}</DialogTitle>
              <DialogDescription className="mt-1 line-clamp-2">
                {getSkillDescription(skill.name, skill.description, t)}
              </DialogDescription>
            </div>
          </div>

          {/* 元信息行：标签 + 启用开关 */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-ink-400/8">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={cn('text-xs', getSourceColor(skill.source))}
              >
                {getSourceLabel(skill.source, t)}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {getCategoryLabel(skill.category, t)}
              </Badge>
              {skill.version && (
                <span className="text-xs text-muted">v{skill.version}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">
                {skill.enabled ? t('skill.enabled') : t('skill.disabled')}
              </span>
              <Switch
                checked={skill.enabled}
                onCheckedChange={() => onToggle?.()}
                disabled={processing}
              />
            </div>
          </div>
        </DialogHeader>

        {/* 内容区 */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-3 pr-4">
              {/* 详细说明 */}
              {skill.longDescription && (
                <div className="space-y-1.5">
                  <h4 className="text-sm font-medium">{t('skill.aboutTitle')}</h4>
                  <p className="text-sm text-muted">{getSkillDescription(skill.name, skill.longDescription, t)}</p>
                </div>
              )}

              {/* 元信息 */}
              <div className="flex items-center gap-4 flex-wrap text-[13px] text-muted">
                {skill.author && (
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5" />
                    <span>{skill.author}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span>{formatDate(skill.createdAt, locale)}</span>
                </div>
              </div>

              {/* 标签 */}
              {skill.tags && skill.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {skill.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* 技能内容（默认收起） */}
              <div className="border-t border-ink-400/8 pt-3">
                <button
                  onClick={() => setContentExpanded((prev) => !prev)}
                  className="flex items-center gap-1.5 w-full group"
                >
                  <ChevronIcon className="h-4 w-4 text-muted" expanded={contentExpanded} />
                  <h4 className="text-sm font-medium">{t('skill.contentTitle')}</h4>
                  <span className="text-[11px] text-ink-400 ml-1">
                    {skill.content.length.toLocaleString()} {t('skill.characters')}
                  </span>
                  <span className="flex-1" />
                  {contentExpanded && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy();
                      }}
                      className="text-xs text-muted hover:text-ink-700 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      {copied ? (
                        <>
                          <CheckIcon className="h-3.5 w-3.5 text-success" />
                          {t('common.copied')}
                        </>
                      ) : (
                        <>
                          <CopyIcon className="h-3.5 w-3.5" />
                          {t('common.copy')}
                        </>
                      )}
                    </span>
                  )}
                </button>

                {contentExpanded && (
                  <div className="mt-2">
                    <pre
                      className={cn(
                        'p-3 rounded-lg bg-surface-secondary border',
                        'text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words',
                        'max-h-[300px] overflow-y-auto overflow-x-auto'
                      )}
                    >
                      {skill.content}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* 底部按钮 */}
        <DialogFooter className="flex-shrink-0 border-t pt-3">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {isCustom && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onEdit}
                    disabled={processing}
                  >
                    <EditIcon className="h-4 w-4 mr-1" />
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onDelete}
                    disabled={processing}
                    className="text-error hover:text-error hover:bg-error/10"
                  >
                    <TrashIcon className="h-4 w-4 mr-1" />
                    {t('common.delete')}
                  </Button>
                </>
              )}
            </div>
            <Button variant="outline" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SkillDetail;
