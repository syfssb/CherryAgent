import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Badge,
  cn,
} from '@/ui/components/ui';
import {
  type Skill,
  type SkillCategory,
  type CreateSkillData,
  type UpdateSkillData,
  getCategoryOptions,
  availableIcons,
} from '@/ui/store/useSkillStore';
import { getSkillIcon } from './SkillCard';

/**
 * SkillEditor 组件属性
 */
export interface SkillEditorProps {
  /** 是否打开 */
  open: boolean;
  /** 编辑的技能（null 表示创建新技能） */
  skill?: Skill | null;
  /** 关闭对话框 */
  onClose: () => void;
  /** 保存（创建或更新） */
  onSave: (data: CreateSkillData | UpdateSkillData) => Promise<void>;
  /** 是否正在保存 */
  saving?: boolean;
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
 * 保存图标
 */
function SaveIcon({ className }: { className?: string }) {
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
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17,21 17,13 7,13 7,21" />
      <polyline points="7,3 7,8 15,8" />
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
 * 警告图标
 */
function AlertTriangleIcon({ className }: { className?: string }) {
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
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/**
 * 验证技能内容语法
 */
function validateSkillContent(
  content: string,
  t: any
): { valid: boolean; error?: string } {
  if (!content.trim()) {
    return { valid: false, error: t('skill.validation.contentRequired', '内容不能为空') };
  }

  if (content.length < 20) {
    return { valid: false, error: t('skill.validation.contentTooShort', '内容太短，请至少输入 20 个字符') };
  }

  if (content.length > 10000) {
    return { valid: false, error: t('skill.validation.contentTooLong', '内容太长，最多 10000 个字符') };
  }

  return { valid: true };
}

/**
 * 技能编辑器组件
 */
export function SkillEditor({
  open,
  skill,
  onClose,
  onSave,
  saving,
}: SkillEditorProps) {
  const { t } = useTranslation();
  const isEditing = !!skill;

  // 表单状态
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [longDescription, setLongDescription] = useState('');
  const [icon, setIcon] = useState('code');
  const [category, setCategory] = useState<SkillCategory>('development');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');

  // 验证状态
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showIconPicker, setShowIconPicker] = useState(false);

  // 初始化表单
  useEffect(() => {
    if (skill) {
      setName(skill.name);
      setDescription(skill.description);
      setLongDescription(skill.longDescription ?? '');
      setIcon(skill.icon ?? 'code');
      setCategory(skill.category);
      setContent(skill.content);
      setTags(skill.tags?.join(', ') ?? '');
    } else {
      setName('');
      setDescription('');
      setLongDescription('');
      setIcon('code');
      setCategory('development');
      setContent('');
      setTags('');
    }
    setErrors({});
  }, [skill, open]);

  // 验证表单
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = t('skill.validation.nameRequired', '请输入技能名称');
    }

    if (!description.trim()) {
      newErrors.description = t('skill.validation.descriptionRequired', '请输入技能描述');
    }

    const contentValidation = validateSkillContent(content, t);
    if (!contentValidation.valid) {
      newErrors.content = contentValidation.error ?? t('skill.validation.contentInvalid', '内容无效');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, description, content, t]);

  // 保存
  const handleSave = useCallback(async () => {
    if (!validate()) return;

    const parsedTags = tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const data: CreateSkillData | UpdateSkillData = {
      name: name.trim(),
      description: description.trim(),
      longDescription: longDescription.trim() || undefined,
      icon,
      category,
      content: content.trim(),
      tags: parsedTags.length > 0 ? parsedTags : undefined,
    };

    await onSave(data);
  }, [validate, name, description, longDescription, icon, category, content, tags, onSave]);

  // 关闭
  const handleClose = useCallback(() => {
    setErrors({});
    onClose();
  }, [onClose]);

  // 获取图标组件
  const IconComponent = getSkillIcon(icon);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? (
              <SaveIcon className="h-5 w-5 text-accent" />
            ) : (
              <PlusIcon className="h-5 w-5 text-accent" />
            )}
            {isEditing ? t('skill.editTitle') : t('skill.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? t('skill.editDescription') : t('skill.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 名称 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('skill.name')} <span className="text-error">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('skill.namePlaceholder')}
              className={errors.name ? 'border-error' : ''}
            />
            {errors.name && (
              <p className="text-xs text-error">{errors.name}</p>
            )}
          </div>

          {/* 描述 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('skill.description')} <span className="text-error">*</span>
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('skill.descriptionPlaceholder')}
              className={errors.description ? 'border-error' : ''}
            />
            {errors.description && (
              <p className="text-xs text-error">{errors.description}</p>
            )}
          </div>

          {/* 详细说明 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('skill.longDescription')}
            </label>
            <textarea
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              placeholder={t('skill.longDescriptionPlaceholder')}
              className={cn(
                'w-full h-20 px-3 py-2 rounded-lg border resize-none',
                'bg-surface text-ink-900 placeholder:text-muted',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'
              )}
            />
          </div>

          {/* 图标和类别 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 图标选择 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('skill.icon')}</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowIconPicker(!showIconPicker)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg border',
                    'bg-surface hover:bg-surface-secondary transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'
                  )}
                >
                  <div className="w-8 h-8 rounded bg-accent/10 flex items-center justify-center">
                    <IconComponent className="h-4 w-4 text-accent" />
                  </div>
                  <span className="text-sm">{icon}</span>
                </button>

                {/* 图标选择器 */}
                {showIconPicker && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 p-3 bg-surface rounded-lg border shadow-lg">
                    <div className="grid grid-cols-6 gap-2">
                      {availableIcons.map((iconName) => {
                        const Icon = getSkillIcon(iconName);
                        return (
                          <button
                            key={iconName}
                            type="button"
                            onClick={() => {
                              setIcon(iconName);
                              setShowIconPicker(false);
                            }}
                            className={cn(
                              'w-8 h-8 rounded flex items-center justify-center transition-colors',
                              icon === iconName
                                ? 'bg-accent text-white'
                                : 'hover:bg-surface-secondary'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 类别选择 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('skill.category')}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SkillCategory)}
                className={cn(
                  'w-full px-3 py-2 rounded-lg border',
                  'bg-surface text-ink-900',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'
                )}
              >
                {getCategoryOptions(t).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 标签 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('skill.tags')}</label>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('skill.tagsPlaceholder')}
            />
            <p className="text-xs text-muted">{t('skill.tagsHint')}</p>
            {tags && (
              <div className="flex flex-wrap gap-1">
                {tags.split(',').map((tag, index) => {
                  const trimmed = tag.trim();
                  if (!trimmed) return null;
                  return (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {trimmed}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          {/* 技能内容 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('skill.content')} <span className="text-error">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('skill.contentPlaceholder')}
              className={cn(
                'w-full h-48 px-3 py-2 rounded-lg border resize-none font-mono text-sm',
                'bg-surface text-ink-900 placeholder:text-muted',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                errors.content && 'border-error'
              )}
            />
            <div className="flex items-center justify-between">
              {errors.content ? (
                <p className="text-xs text-error flex items-center gap-1">
                  <AlertTriangleIcon className="h-3 w-3" />
                  {errors.content}
                </p>
              ) : (
                <p className="text-xs text-muted">
                  {t('skill.contentHint')}
                </p>
              )}
              <span className={cn(
                'text-xs',
                content.length > 10000 ? 'text-error' :
                content.length > 8000 ? 'text-warning' : 'text-muted'
              )}>
                {content.length.toLocaleString()} / 10,000
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <LoadingSpinner className="h-4 w-4 mr-2" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <SaveIcon className="h-4 w-4 mr-2" />
                {isEditing ? t('common.save') : t('common.create')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SkillEditor;
