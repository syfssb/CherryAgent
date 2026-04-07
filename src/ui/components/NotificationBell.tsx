import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/ui/components/ui';
import { useAnnouncements } from '@/ui/hooks/useRemoteConfig';
import { NotificationPanel } from './NotificationPanel';

interface NotificationBellProps {
  className?: string;
}

/** 面板与视窗边缘的最小间距 */
const PANEL_MARGIN = 12;
/** 面板期望宽度 */
const PANEL_WIDTH = 520;
/** 铃铛与面板之间的间距 */
const PANEL_GAP = 8;

/**
 * 通知铃铛组件
 * 显示在 TopBar 右上角，点击弹出通知面板
 * 支持未读角标、ESC 关闭、点击外部关闭、出入动画
 */
export function NotificationBell({ className }: NotificationBellProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const { announcements, dismissAnnouncement, dismissedIds, readIds, markAllAsRead } = useAnnouncements();

  // 未读数 = 未被已读标记 且 未被关闭的公告数量
  const unreadCount = useMemo(() => {
    return announcements.filter((a) => !readIds.has(a.id) && !dismissedIds.has(a.id)).length;
  }, [announcements, readIds, dismissedIds]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  }, []);

  const handleToggle = useCallback(() => {
    if (open) {
      handleClose();
    } else {
      setOpen(true);
      markAllAsRead();
    }
  }, [open, handleClose, markAllAsRead]);

  /**
   * 计算面板的 fixed 定位坐标
   * 面板右边缘对齐铃铛右边缘，但确保不超出视窗
   */
  const computePanelPosition = useCallback(() => {
    if (!bellRef.current) return;
    const rect = bellRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    const maxWidth = viewportWidth - PANEL_MARGIN * 2;
    const actualWidth = Math.min(PANEL_WIDTH, maxWidth);

    // 面板右边缘对齐铃铛右边缘
    let right = viewportWidth - rect.right;

    // 确保左边缘不超出视窗
    if (right + actualWidth > viewportWidth - PANEL_MARGIN) {
      right = viewportWidth - PANEL_MARGIN - actualWidth;
    }
    if (right < PANEL_MARGIN) {
      right = PANEL_MARGIN;
    }

    setPanelStyle({
      position: 'fixed',
      top: rect.bottom + PANEL_GAP,
      right,
      width: actualWidth,
      zIndex: 9999,
    });
  }, []);

  // 打开面板时计算位置，窗口 resize 时重新计算
  useEffect(() => {
    if (!open) return;
    computePanelPosition();

    const handleResize = () => computePanelPosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open, computePanelPosition]);

  // 点击面板和铃铛外部关闭
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      // 点击铃铛按钮由 handleToggle 处理
      if (bellRef.current?.contains(target)) return;
      // 点击面板内部不关闭
      if (panelRef.current?.contains(target)) return;
      handleClose();
    }

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, handleClose]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleClose]);

  // 监听主进程发来的 open-notification-panel 事件（用户点击系统通知时触发）
  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.on) return;

    const cleanup = electron.on("open-notification-panel", () => {
      setOpen(true);
      setClosing(false);
      markAllAsRead();
    });

    return cleanup;
  }, [markAllAsRead]);

  return (
    <>
      <button
        ref={bellRef}
        type="button"
        onClick={handleToggle}
        className={cn(
          'relative flex items-center justify-center h-8 w-8 rounded-full transition-all duration-150 icon-hover-ring',
          'hover:bg-ink-900/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
          open && 'bg-ink-900/8',
          className,
        )}
        aria-label={t('notification.title', '通知')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {/* 铃铛 SVG */}
        <svg
          className={cn(
            'h-[18px] w-[18px] transition-colors',
            open ? 'text-ink-900' : 'text-ink-600',
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>

        {/* 未读角标 */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#DC2626] text-white text-[10px] font-bold leading-none shadow-sm animate-fade-in">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 面板通过 portal 渲染到 body，避免被父容器裁切 */}
      {open && createPortal(
        <div
          ref={panelRef}
          className={cn(closing && 'animate-notif-out')}
          style={panelStyle}
        >
          <NotificationPanel
            announcements={announcements}
            dismissedIds={dismissedIds}
            onDismiss={dismissAnnouncement}
            onClose={handleClose}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

export default NotificationBell;