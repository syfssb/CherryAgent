import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import MDContent from '@/ui/render/markdown';
import { cn } from '@/ui/components/ui';
import type { Announcement } from '@/ui/lib/config-api';

interface NotificationPanelProps {
  announcements: Announcement[];
  dismissedIds: Set<string>;
  onDismiss: (id: string) => void;
  onClose: () => void;
}

/**
 * 格式化相对时间（国际化）
 */
function useRelativeTime() {
  const { t } = useTranslation();

  return useCallback(
    (dateStr: string | null): string => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      const diff = Date.now() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return t('notification.justNow', '刚刚');
      if (minutes < 60) return t('notification.minutesAgo', '{{count}}分钟前', { count: minutes });
      if (hours < 24) return t('notification.hoursAgo', '{{count}}小时前', { count: hours });
      if (days < 30) return t('notification.daysAgo', '{{count}}天前', { count: days });
      return date.toLocaleDateString();
    },
    [t],
  );
}

/**
 * 公告类型标签配色
 */
function getTypeBadgeStyle(type: Announcement['type']): string {
  switch (type) {
    case 'warning':
      return 'bg-[#FEF3C7] text-[#D97706]';
    case 'important':
      return 'bg-[#ae5630]/10 text-[#ae5630]';
    case 'critical':
      return 'bg-[#FEE2E2] text-[#DC2626]';
    case 'maintenance':
      return 'bg-[#DBEAFE] text-[#2563EB]';
    case 'promotion':
      return 'bg-[#DCFCE7] text-[#16A34A]';
    case 'info':
    default:
      return 'bg-[#DBEAFE] text-[#2563EB]';
  }
}

/**
 * 获取类型标签文本 key
 */
function getTypeLabel(type: Announcement['type']): string {
  const map: Record<string, string> = {
    info: 'notification.info',
    warning: 'notification.warning',
    important: 'notification.important',
    critical: 'notification.critical',
    maintenance: 'notification.maintenance',
    promotion: 'notification.promotion',
  };
  return map[type] ?? 'notification.info';
}

/**
 * 图钉 SVG 图标
 */
function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  );
}

/**
 * Markdown 渲染样式常量
 * 针对大面板优化的排版：标题层级清晰、代码块美观、列表缩进合理
 */
const MARKDOWN_PROSE_CLASSES = [
  // 基础排版
  'text-[13.5px] text-ink-700 leading-[1.75]',
  // 段落
  '[&_p]:mb-3 [&_p:last-child]:mb-0',
  // 链接
  '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-accent-hover',
  // 标题层级 - 更清晰的视觉区分
  '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-ink-900 [&_h1]:mt-5 [&_h1]:mb-3 [&_h1]:leading-tight',
  '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink-900 [&_h2]:mt-4 [&_h2]:mb-2.5 [&_h2]:leading-snug',
  '[&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-ink-800 [&_h3]:mt-3.5 [&_h3]:mb-2',
  '[&_h4]:text-[13.5px] [&_h4]:font-medium [&_h4]:text-ink-800 [&_h4]:mt-3 [&_h4]:mb-1.5',
  // 列表 - 合理缩进
  '[&_ul]:ml-5 [&_ul]:list-disc [&_ul]:mb-3 [&_ul]:space-y-1',
  '[&_ol]:ml-5 [&_ol]:list-decimal [&_ol]:mb-3 [&_ol]:space-y-1',
  '[&_li]:text-ink-700 [&_li]:leading-relaxed',
  '[&_li>ul]:mt-1 [&_li>ol]:mt-1',
  // 行内代码
  '[&_code]:bg-ink-900/8 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12.5px] [&_code]:font-mono',
  // 代码块 - 更好的视觉效果
  '[&_pre]:bg-ink-900/8 [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:overflow-x-auto [&_pre]:mb-3 [&_pre]:text-[12.5px] [&_pre]:leading-relaxed',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
  // 引用块 - 美观的左边框样式
  '[&_blockquote]:border-l-[3px] [&_blockquote]:border-accent/40 [&_blockquote]:pl-4 [&_blockquote]:py-1 [&_blockquote]:my-3',
  '[&_blockquote]:text-ink-500 [&_blockquote]:italic [&_blockquote]:bg-ink-900/3 [&_blockquote]:rounded-r-lg [&_blockquote]:pr-3',
  // 分隔线
  '[&_hr]:border-ink-900/10 [&_hr]:my-4',
  // 图片 - 自适应宽度
  '[&_img]:rounded-xl [&_img]:max-w-full [&_img]:h-auto [&_img]:my-3 [&_img]:shadow-soft',
  // 表格
  '[&_table]:w-full [&_table]:border-collapse [&_table]:mb-3 [&_table]:text-[12.5px]',
  '[&_th]:text-left [&_th]:font-semibold [&_th]:text-ink-800 [&_th]:border-b [&_th]:border-ink-900/10 [&_th]:pb-2 [&_th]:pr-3',
  '[&_td]:py-1.5 [&_td]:pr-3 [&_td]:border-b [&_td]:border-ink-900/5 [&_td]:text-ink-700',
  // 强调
  '[&_strong]:font-semibold [&_strong]:text-ink-900',
  '[&_em]:italic',
].join(' ');

/**
 * 主内容区 - 展示一条公告的完整内容（针对大面板优化）
 */
function AnnouncementDetail({
  announcement,
}: {
  announcement: Announcement;
}) {
  const { t } = useTranslation();
  const formatTime = useRelativeTime();

  return (
    <div className="animate-notif-content" key={announcement.id}>
      {/* 标题行 */}
      <div className="flex items-start gap-2.5 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {announcement.isPinned && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#D97706] bg-[#FEF3C7] px-1.5 py-0.5 rounded-full">
                <PinIcon className="h-2.5 w-2.5" />
                {t('notification.pinned', '置顶')}
              </span>
            )}
            <span
              className={cn(
                'inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                getTypeBadgeStyle(announcement.type),
              )}
            >
              {t(getTypeLabel(announcement.type))}
            </span>
            {announcement.publishedAt && (
              <span className="text-[11px] text-ink-400">
                {formatTime(announcement.publishedAt)}
              </span>
            )}
          </div>
          <h4 className="text-[16px] font-semibold text-ink-900 leading-snug">
            {announcement.title}
          </h4>
        </div>
      </div>

      {/* 正文内容 - 可滚动的阅读区域 */}
      {announcement.content && (
        <div className="mt-3 pt-3 border-t border-ink-900/6">
          <div className={MARKDOWN_PROSE_CLASSES}>
            <MDContent text={announcement.content} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 其他通知列表项
 */
function OtherNotificationItem({
  announcement,
  isActive,
  onClick,
}: {
  announcement: Announcement;
  isActive: boolean;
  onClick: () => void;
}) {
  const formatTime = useRelativeTime();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150',
        isActive
          ? 'bg-accent/10 ring-1 ring-accent/20'
          : 'hover:bg-ink-900/5',
      )}
    >
      {/* 类型色点 */}
      <span
        className={cn(
          'h-2 w-2 rounded-full shrink-0',
          announcement.type === 'warning' && 'bg-[#D97706]',
          announcement.type === 'important' && 'bg-[#ae5630]',
          announcement.type === 'critical' && 'bg-[#DC2626]',
          announcement.type === 'maintenance' && 'bg-[#2563EB]',
          announcement.type === 'promotion' && 'bg-[#16A34A]',
          announcement.type === 'info' && 'bg-[#2563EB]',
        )}
      />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-[13px] truncate transition-colors',
            isActive ? 'text-ink-900 font-medium' : 'text-ink-700',
          )}
        >
          {announcement.title}
        </p>
      </div>
      <span className="text-[10px] text-ink-400 shrink-0 whitespace-nowrap">
        {formatTime(announcement.publishedAt)}
      </span>
      {isActive && (
        <svg
          className="h-3 w-3 text-accent shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </button>
  );
}

/**
 * 空状态
 */
function EmptyState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="h-12 w-12 rounded-full bg-ink-900/5 flex items-center justify-center mb-4">
        <svg
          className="h-6 w-6 text-ink-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink-500 mb-1">
        {t('notification.empty', '暂无通知')}
      </p>
      <p className="text-xs text-ink-400">
        {t('notification.emptyDesc', '当有新公告时会在这里显示')}
      </p>
    </div>
  );
}

/**
 * 通知面板组件
 * 从铃铛下方弹出，展示公告详情 + 其他通知列表
 * 宽 520px，最大高度 70vh（最小 600px），内容区可滚动
 */
export function NotificationPanel({
  announcements,
  dismissedIds,
  onDismiss: _onDismiss,
  onClose,
}: NotificationPanelProps) {
  const { t } = useTranslation();

  // 过滤可见公告
  const visibleAnnouncements = useMemo(() => {
    return announcements.filter((a) => !dismissedIds.has(a.id));
  }, [announcements, dismissedIds]);

  // 确定默认展示的公告：优先第一个置顶公告，否则最新一条
  const defaultAnnouncement = useMemo(() => {
    if (visibleAnnouncements.length === 0) return null;
    const pinned = visibleAnnouncements.find((a) => a.isPinned);
    return pinned ?? visibleAnnouncements[0];
  }, [visibleAnnouncements]);

  const [selectedId, setSelectedId] = useState<string | null>(
    defaultAnnouncement?.id ?? null,
  );

  // 当前选中的公告
  const selectedAnnouncement = useMemo(() => {
    if (!selectedId) return defaultAnnouncement;
    return visibleAnnouncements.find((a) => a.id === selectedId) ?? defaultAnnouncement;
  }, [selectedId, visibleAnnouncements, defaultAnnouncement]);

  // 其他通知（排除当前展示的）
  const otherAnnouncements = useMemo(() => {
    return visibleAnnouncements.filter((a) => a.id !== selectedAnnouncement?.id);
  }, [visibleAnnouncements, selectedAnnouncement]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const isEmpty = visibleAnnouncements.length === 0;

  return (
    <div
      className="w-full max-h-[70vh] min-h-[200px] rounded-2xl border border-ink-900/8 bg-surface/98 backdrop-blur-2xl shadow-elevated overflow-hidden animate-notif-in flex flex-col"
      style={{ minHeight: isEmpty ? undefined : '600px' }}
      role="dialog"
      aria-label={t('notification.title', '通知')}
    >
      {/* 头部 - 固定 */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink-900/8 shrink-0">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-ink-900">
            {t('notification.title', '通知')}
          </h3>
          {visibleAnnouncements.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-ink-900/8 text-[10px] font-medium text-ink-500">
              {visibleAnnouncements.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-ink-400 hover:text-ink-600 hover:bg-ink-900/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={t('common.close', '关闭')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 内容区 - flex-1 占满剩余空间 */}
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* 主内容：当前选中公告的完整内容 - 可滚动 */}
          {selectedAnnouncement && (
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              <AnnouncementDetail announcement={selectedAnnouncement} />
            </div>
          )}

          {/* 其他通知区域 - 底部固定，紧凑 */}
          {otherAnnouncements.length > 0 && (
            <div className="shrink-0 border-t border-ink-900/8">
              <div className="px-5 pt-2.5 pb-1">
                <p className="text-[11px] font-medium text-ink-400 uppercase tracking-wider">
                  {t('notification.otherNotifications', '其他通知')}
                </p>
              </div>
              <div className="px-3 pb-2.5 space-y-0.5 max-h-[180px] overflow-y-auto">
                {otherAnnouncements.map((a) => (
                  <OtherNotificationItem
                    key={a.id}
                    announcement={a}
                    isActive={a.id === selectedAnnouncement?.id}
                    onClick={() => handleSelect(a.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationPanel;
