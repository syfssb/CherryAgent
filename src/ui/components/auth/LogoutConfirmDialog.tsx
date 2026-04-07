import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * LogoutConfirmDialog 组件属性
 */
export interface LogoutConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 退出登录图标
 */
function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

/**
 * 精致的退出登录确认弹窗
 * 深色主题友好，毛玻璃遮罩，macOS 风格
 */
export function LogoutConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: LogoutConfirmDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Esc 键关闭
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  // 打开时聚焦取消按钮（安全默认）
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        cancelButtonRef.current?.focus();
      });
    }
  }, [open]);

  // 点击遮罩关闭
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onCancel();
      }
    },
    [onCancel]
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 modal-backdrop"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-dialog-title"
      aria-describedby="logout-dialog-desc"
    >
      <div
        ref={dialogRef}
        className="modal-shell w-full max-w-[360px] overflow-hidden rounded-2xl border border-ink-900/[0.06] bg-surface shadow-elevated"
        style={{
          boxShadow:
            '0 24px 48px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        {/* 顶部图标区域 */}
        <div className="flex flex-col items-center pt-7 pb-1 px-6">
          <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-error/[0.08] ring-1 ring-error/[0.12]">
            <LogOutIcon className="h-5.5 w-5.5 text-error/80" />
          </div>
        </div>

        {/* 文字内容 */}
        <div className="px-6 pt-4 pb-2 text-center">
          <h3
            id="logout-dialog-title"
            className="text-[15px] font-semibold text-ink-900"
          >
            {t('auth.logout')}
          </h3>
          <p
            id="logout-dialog-desc"
            className="mt-2 text-[13px] leading-relaxed text-muted"
          >
            {t(
              'auth.logoutConfirmMessage',
              '确定要退出登录吗？退出后需要重新登录才能使用服务。'
            )}
          </p>
        </div>

        {/* 分隔线 */}
        <div className="mx-6 mt-4 border-t border-ink-900/[0.06]" />

        {/* 按钮区域 */}
        <div className="flex gap-3 px-6 pt-4 pb-6">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-ink-900/[0.08] bg-transparent px-4 py-2.5 text-[13px] font-medium text-ink-700 transition-all duration-150 hover:bg-surface-secondary hover:border-ink-900/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface active:scale-[0.98]"
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-error/[0.12] px-4 py-2.5 text-[13px] font-medium text-error transition-all duration-150 hover:bg-error/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface active:scale-[0.98]"
          >
            {t('auth.logout')}
          </button>
        </div>

        {/* 键盘提示 */}
        <div className="flex items-center justify-center gap-3 border-t border-ink-900/[0.04] bg-surface-secondary/50 px-6 py-2.5">
          <span className="flex items-center gap-1.5 text-[10px] text-muted/60">
            <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-ink-900/[0.08] bg-surface px-1 font-mono text-[9px] leading-none">
              esc
            </kbd>
            <span>{t('common.cancel', '取消')}</span>
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default LogoutConfirmDialog;
