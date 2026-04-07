import { useMemo } from 'react';
import MDContent from '@/ui/render/markdown';
import { cn } from '@/ui/components/ui';
import { useAnnouncements } from '@/ui/hooks/useRemoteConfig';
import type { Announcement } from '@/ui/lib/config-api';

/**
 * AnnouncementBanner 组件属性
 */
export interface AnnouncementBannerProps {
  className?: string;
  /** 最多显示几条公告，默认 3 */
  maxVisible?: number;
}

/**
 * 关闭图标
 */
function CloseIcon({ className }: { className?: string }) {
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
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * 信息图标
 */
function InfoIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/**
 * 警告图标
 */
function WarningIcon({ className }: { className?: string }) {
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
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/**
 * 重要图标
 */
function ImportantIcon({ className }: { className?: string }) {
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
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

/**
 * 公告类型样式映射
 */
function getAnnouncementStyles(type: Announcement['type']): {
  container: string;
  icon: string;
  text: string;
  closeBtn: string;
} {
  switch (type) {
    case 'warning':
      return {
        container: 'border-warning/30 bg-warning/5',
        icon: 'text-warning',
        text: 'text-warning-foreground',
        closeBtn: 'text-warning/60 hover:text-warning',
      };
    case 'important':
    case 'critical':
      return {
        container: 'border-error/30 bg-error/5',
        icon: 'text-error',
        text: 'text-error-foreground',
        closeBtn: 'text-error/60 hover:text-error',
      };
    case 'info':
    default:
      return {
        container: 'border-accent/30 bg-accent/5',
        icon: 'text-accent',
        text: 'text-ink-800',
        closeBtn: 'text-ink-400 hover:text-ink-600',
      };
  }
}

/**
 * 获取公告类型图标
 */
function AnnouncementIcon({ type, className }: { type: Announcement['type']; className?: string }) {
  switch (type) {
    case 'warning':
      return <WarningIcon className={className} />;
    case 'important':
    case 'critical':
      return <ImportantIcon className={className} />;
    case 'info':
    default:
      return <InfoIcon className={className} />;
  }
}

/**
 * 单条公告项
 */
function AnnouncementItem({
  announcement,
  onDismiss,
}: {
  announcement: Announcement;
  onDismiss: (id: string) => void;
}) {
  const styles = getAnnouncementStyles(announcement.type);

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3 transition-all',
        styles.container
      )}
      role="alert"
    >
      <AnnouncementIcon
        type={announcement.type}
        className={cn('h-5 w-5 shrink-0 mt-0.5', styles.icon)}
      />

      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium', styles.text)}>
          {announcement.title}
        </p>
        {announcement.content && (
          <div className={cn('text-xs mt-1 opacity-80 [&_p]:m-0 [&_a]:underline [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_code]:bg-black/10 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-black/10 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_blockquote]:opacity-70', styles.text)}>
            <MDContent text={announcement.content} />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(announcement.id)}
        className={cn(
          'shrink-0 rounded-md p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          styles.closeBtn
        )}
        aria-label="Dismiss"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * 公告横幅组件
 * 从 /api/announcements 获取公告并显示
 * 支持关闭/已读标记，根据公告类型显示不同样式
 */
export function AnnouncementBanner({
  className,
  maxVisible = 3,
}: AnnouncementBannerProps) {
  const { announcements, dismissAnnouncement, dismissedIds } = useAnnouncements();

  /**
   * 过滤掉已关闭的公告
   */
  const visibleAnnouncements = useMemo(() => {
    return announcements
      .filter((a) => !dismissedIds.has(a.id))
      .slice(0, maxVisible);
  }, [announcements, dismissedIds, maxVisible]);

  if (visibleAnnouncements.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {visibleAnnouncements.map((announcement) => (
        <AnnouncementItem
          key={announcement.id}
          announcement={announcement}
          onDismiss={dismissAnnouncement}
        />
      ))}
    </div>
  );
}

export default AnnouncementBanner;
