/**
 * 更新通知组件
 * 显示新版本信息、更新日志和下载进度
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocaleFromLanguage } from '@/ui/i18n/config';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';

// 更新状态类型
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

// 更新策略类型
export type UpdateStrategy = 'silent' | 'optional' | 'forced';

// 更新信息接口
export interface UpdateInfo {
  version: string;
  releaseNotes?: string | null;
  releaseDate?: string;
  changelog?: ChangelogEntry[];
}

// 更新日志条目
export interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'feature' | 'fix' | 'improvement' | 'breaking';
    description: string;
  }[];
}

// 下载进度接口
export interface DownloadProgress {
  total: number;
  transferred: number;
  percent: number;
  bytesPerSecond: number;
}

// 组件属性
interface UpdateNotificationProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 更新信息 */
  updateInfo?: UpdateInfo | null;
  /** 更新状态 */
  status: UpdateStatus;
  /** 更新策略 */
  strategy?: UpdateStrategy;
  /** 下载进度 */
  downloadProgress?: DownloadProgress | null;
  /** 错误信息 */
  error?: string | null;
  /** 检查更新回调 */
  onCheckUpdate?: () => void;
  /** 下载更新回调 */
  onDownloadUpdate?: () => void;
  /** 安装更新回调 */
  onInstallUpdate?: () => void;
  /** 稍后提醒回调 */
  onRemindLater?: () => void;
}

// 更新类型图标映射
const changeTypeIcons: Record<string, { icon: string; color: string }> = {
  feature: { icon: '✨', color: 'text-green-600' },
  fix: { icon: '🐛', color: 'text-red-500' },
  improvement: { icon: '🚀', color: 'text-blue-500' },
  breaking: { icon: '⚠️', color: 'text-yellow-600' },
};

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * 格式化下载速度
 */
function formatSpeed(bytesPerSecond: number): string {
  return `${formatSize(bytesPerSecond)}/s`;
}

/**
 * 格式化日期
 */
function formatDate(dateString?: string, locale: string = 'zh-CN'): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * 更新通知组件
 */
export function UpdateNotification({
  open,
  onClose,
  updateInfo,
  status,
  strategy = 'optional',
  downloadProgress,
  error,
  onCheckUpdate,
  onDownloadUpdate,
  onInstallUpdate,
  onRemindLater,
}: UpdateNotificationProps) {
  const { t, i18n } = useTranslation();
  const locale = getLocaleFromLanguage(i18n.language);
  const [showChangelog, setShowChangelog] = useState(false);

  // 是否为强制更新
  const isForced = strategy === 'forced';

  // 是否可以关闭
  const canClose = !isForced || status === 'error';

  // 处理关闭
  const handleClose = useCallback(() => {
    if (canClose) {
      onClose();
    }
  }, [canClose, onClose]);

  // 渲染状态图标
  const renderStatusIcon = () => {
    switch (status) {
      case 'checking':
        return (
          <div className="flex items-center justify-center">
            <svg
              className="h-12 w-12 animate-spin text-accent"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        );
      case 'available':
        return (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
            <svg
              className="h-6 w-6 text-accent"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
        );
      case 'downloaded':
        return (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <svg
              className="h-6 w-6 text-success"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
        );
      case 'error':
        return (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
            <svg
              className="h-6 w-6 text-error"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        );
      case 'not-available':
        return (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/10">
            <svg
              className="h-6 w-6 text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
        );
      default:
        return null;
    }
  };

  // 渲染下载进度
  const renderDownloadProgress = () => {
    if (status !== 'downloading' || !downloadProgress) return null;

    const { percent, transferred, total, bytesPerSecond } = downloadProgress;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{t('update.downloading', '正在下载...')}</span>
          <span>{Math.round(percent)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-tertiary">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {formatSize(transferred)} / {formatSize(total)}
          </span>
          <span>{formatSpeed(bytesPerSecond)}</span>
        </div>
      </div>
    );
  };

  // 渲染更新日志
  const renderChangelog = () => {
    if (!updateInfo?.changelog || updateInfo.changelog.length === 0) {
      return null;
    }

    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowChangelog(!showChangelog)}
          className="flex w-full items-center justify-between rounded-lg border border-ink-900/10 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-secondary transition-colors"
        >
          <span>{t('update.changelog', '更新日志')}</span>
          <svg
            className={`h-4 w-4 transition-transform ${
              showChangelog ? 'rotate-180' : ''
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showChangelog && (
          <ScrollArea className="mt-3 max-h-64 rounded-lg border border-ink-900/10 bg-surface-secondary">
            <div className="p-4 space-y-4">
              {updateInfo.changelog.map((entry) => (
                <div key={entry.version}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary">{entry.version}</Badge>
                    <span className="text-xs text-muted">
                      {formatDate(entry.date, locale)}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {entry.changes.map((change, idx) => {
                      const iconInfo =
                        changeTypeIcons[change.type] || changeTypeIcons.improvement;
                      return (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-sm text-ink-700"
                        >
                          <span className={iconInfo.color}>{iconInfo.icon}</span>
                          <span>{change.description}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    );
  };

  // 渲染操作按钮
  const renderActions = () => {
    switch (status) {
      case 'checking':
        return null;

      case 'available':
        return (
          <div className="flex gap-3">
            {!isForced && (
              <Button
                variant="outline"
                onClick={onRemindLater || handleClose}
                className="flex-1"
              >
                {t('update.remindLater', '稍后提醒')}
              </Button>
            )}
            <Button onClick={onDownloadUpdate} className="flex-1">
              {t('update.downloadNow', '立即更新')}
            </Button>
          </div>
        );

      case 'downloading':
        return (
          <Button variant="outline" disabled className="w-full">
            {t('update.downloading', '正在下载...')}
          </Button>
        );

      case 'downloaded':
        return (
          <div className="flex gap-3">
            {!isForced && (
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1"
              >
                {t('update.installLater', '稍后安装')}
              </Button>
            )}
            <Button onClick={onInstallUpdate} className="flex-1">
              {t('update.installNow', '立即安装')}
            </Button>
          </div>
        );

      case 'error':
        return (
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              {t('common.cancel', '取消')}
            </Button>
            <Button onClick={onCheckUpdate} className="flex-1">
              {t('update.retry', '重试')}
            </Button>
          </div>
        );

      case 'not-available':
        return (
          <Button onClick={handleClose} className="w-full">
            {t('common.ok', '确定')}
          </Button>
        );

      default:
        return null;
    }
  };

  // 获取标题
  const getTitle = () => {
    switch (status) {
      case 'checking':
        return t('update.checking', '正在检查更新');
      case 'available':
        return isForced
          ? t('update.forceUpdate', '需要更新')
          : t('update.available', '发现新版本');
      case 'downloading':
        return t('update.downloading', '正在下载');
      case 'downloaded':
        return t('update.readyToInstall', '准备安装');
      case 'error':
        return t('update.error', '更新失败');
      case 'not-available':
        return t('update.upToDate', '已是最新版本');
      default:
        return t('update.title', '软件更新');
    }
  };

  // 获取描述
  const getDescription = () => {
    switch (status) {
      case 'checking':
        return t('update.checkingDescription', '正在检查是否有可用更新...');
      case 'available':
        return isForced
          ? t(
              'update.forceUpdateDescription',
              '此更新是必需的，请立即安装以继续使用。'
            )
          : t(
              'update.availableDescription',
              `新版本 ${updateInfo?.version || ''} 已可用。`,
              { version: updateInfo?.version || '' }
            );
      case 'downloading':
        return t('update.downloadingDescription', '正在下载更新包...');
      case 'downloaded':
        return t(
          'update.downloadedDescription',
          '更新已下载完成，安装将在应用重启后生效。'
        );
      case 'error':
        return error || t('update.errorDescription', '检查或下载更新时出错。');
      case 'not-available':
        return t(
          'update.upToDateDescription',
          '您当前使用的是最新版本。'
        );
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={canClose ? handleClose : undefined}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={canClose ? undefined : (e) => e.preventDefault()}
        onEscapeKeyDown={canClose ? undefined : (e) => e.preventDefault()}
      >
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4">{renderStatusIcon()}</div>
          <DialogTitle className="text-center">{getTitle()}</DialogTitle>
          <DialogDescription className="text-center">
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 版本信息 */}
          {updateInfo && status === 'available' && (
            <div className="rounded-lg border border-ink-900/10 bg-surface-secondary p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink-700">
                  {t('update.version', '版本')}
                </span>
                <Badge variant="default">{updateInfo.version}</Badge>
              </div>
              {updateInfo.releaseDate && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-muted">
                    {t('update.releaseDate', '发布日期')}
                  </span>
                  <span className="text-sm text-ink-600">
                    {formatDate(updateInfo.releaseDate, locale)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 下载进度 */}
          {renderDownloadProgress()}

          {/* 更新日志 */}
          {status === 'available' && renderChangelog()}

          {/* 强制更新警告 */}
          {isForced && status === 'available' && (
            <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
              <div className="flex items-start gap-2">
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <p className="text-sm text-warning">
                  {t(
                    'update.forceWarning',
                    '此更新包含重要的安全修复或必要的功能更新。'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="pt-2">{renderActions()}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UpdateNotification;
