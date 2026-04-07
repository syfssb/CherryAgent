import * as React from 'react';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/ui/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/components/ui';

/**
 * 消息类型
 */
export type MessageType = 'user' | 'assistant' | 'system';

/**
 * MessageActions 组件属性
 */
export interface MessageActionsProps {
  /** 消息类型 */
  messageType: MessageType;
  /** 消息内容（用于复制） */
  content: string;
  /** 是否正在生成中 */
  isGenerating?: boolean;
  /** 复制成功回调 */
  onCopy?: () => void;
  /** 重新生成回调 */
  onRegenerate?: () => void;
  /** 编辑回调（仅用户消息） */
  onEdit?: () => void;
  /** 删除回调 */
  onDelete?: () => void;
  /** 是否显示在悬停时 */
  showOnHover?: boolean;
  /** 额外的 CSS 类名 */
  className?: string;
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
 * 复制成功图标
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
 * 重新生成图标
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
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
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
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
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
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

/**
 * 操作按钮组件
 */
interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}

function ActionButton({ icon, label, onClick, disabled = false, variant = 'default' }: ActionButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
              'flex items-center justify-center p-1.5 rounded-md',
              'transition-colors duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              variant === 'danger'
                ? 'hover:bg-destructive/10 hover:text-destructive text-muted'
                : 'hover:bg-surface-tertiary hover:text-ink-700 text-muted'
            )}
            aria-label={label}
          >
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * 消息操作组件
 * 提供复制、重新生成、编辑、删除等操作
 *
 * @example
 * // 助手消息操作
 * <MessageActions
 *   messageType="assistant"
 *   content="这是助手的回复..."
 *   onCopy={() => console.log('已复制')}
 *   onRegenerate={() => console.log('重新生成')}
 * />
 *
 * @example
 * // 用户消息操作
 * <MessageActions
 *   messageType="user"
 *   content="用户的问题..."
 *   onEdit={() => console.log('编辑')}
 *   onDelete={() => console.log('删除')}
 * />
 *
 * @example
 * // 悬停时显示
 * <MessageActions
 *   messageType="assistant"
 *   content="..."
 *   showOnHover={true}
 * />
 */
export function MessageActions({
  messageType,
  content,
  isGenerating = false,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
  showOnHover = false,
  className,
}: MessageActionsProps) {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);

  /**
   * 复制消息内容
   */
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      onCopy?.();
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      // 静默失败
    }
  }, [content, onCopy]);

  /**
   * 重新生成
   */
  const handleRegenerate = useCallback(() => {
    if (!isGenerating) {
      onRegenerate?.();
    }
  }, [isGenerating, onRegenerate]);

  /**
   * 编辑
   */
  const handleEdit = useCallback(() => {
    onEdit?.();
  }, [onEdit]);

  /**
   * 删除
   */
  const handleDelete = useCallback(() => {
    onDelete?.();
  }, [onDelete]);

  // 系统消息不显示操作
  if (messageType === 'system') {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-0.5',
        'transition-opacity duration-200',
        showOnHover && 'opacity-0 group-hover:opacity-100',
        className
      )}
    >
      {/* 复制按钮 */}
      <ActionButton
        icon={
          isCopied ? (
            <CheckIcon className="h-3.5 w-3.5 text-chart-2" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )
        }
        label={isCopied ? t('chat.copied') : t('chat.copy')}
        onClick={handleCopy}
      />

      {/* 重新生成按钮（仅助手消息） */}
      {messageType === 'assistant' && onRegenerate && (
        <ActionButton
          icon={
            <RefreshIcon
              className={cn('h-3.5 w-3.5', isGenerating && 'animate-spin')}
            />
          }
          label={t('chat.regenerate')}
          onClick={handleRegenerate}
          disabled={isGenerating}
        />
      )}

      {/* 编辑按钮（仅用户消息） */}
      {messageType === 'user' && onEdit && (
        <ActionButton
          icon={<EditIcon className="h-3.5 w-3.5" />}
          label={t('chat.edit')}
          onClick={handleEdit}
        />
      )}

      {/* 删除按钮 */}
      {onDelete && (
        <ActionButton
          icon={<TrashIcon className="h-3.5 w-3.5" />}
          label={t('chat.delete')}
          onClick={handleDelete}
          variant="danger"
        />
      )}
    </div>
  );
}

export default MessageActions;
