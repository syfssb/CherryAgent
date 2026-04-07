import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/ui/components/ui/dialog'
import { Checkbox } from '@/ui/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select'
import { cn } from '@/ui/lib/utils'
import { useSyncStore, type SyncHistoryItem } from '@/ui/store/useSyncStore'
import { ConflictList } from '@/ui/components/sync'

/**
 * 云同步组件 Props
 */
interface CloudSyncProps {
  className?: string
}

/**
 * 云同步组件
 *
 * 提供云同步功能，包括：
 * - 同步开关
 * - 上次同步时间
 * - 同步状态指示
 * - 手动同步按钮
 * - 同步历史
 * - 冲突解决 UI
 */
export function CloudSync({ className }: CloudSyncProps) {
  const { t } = useTranslation()

  // 从 store 获取状态
  const syncEnabled = useSyncStore((s) => s.syncEnabled)
  const syncStatus = useSyncStore((s) => s.syncStatus)
  const lastSyncTime = useSyncStore((s) => s.lastSyncTime)
  const lastSyncError = useSyncStore((s) => s.lastSyncError)
  const config = useSyncStore((s) => s.config)
  const conflicts = useSyncStore((s) => s.conflicts)
  const history = useSyncStore((s) => s.history)
  const syncProgress = useSyncStore((s) => s.syncProgress)

  // 从 store 获取 actions
  const enableSync = useSyncStore((s) => s.enableSync)
  const disableSync = useSyncStore((s) => s.disableSync)
  const initialize = useSyncStore((s) => s.initialize)
  const sync = useSyncStore((s) => s.sync)
  const cancelSync = useSyncStore((s) => s.cancelSync)
  const setConfig = useSyncStore((s) => s.setConfig)
  const resolveConflict = useSyncStore((s) => s.resolveConflict)
  const resolveAllConflicts = useSyncStore((s) => s.resolveAllConflicts)
  const clearHistory = useSyncStore((s) => s.clearHistory)

  // 本地状态
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)

  useEffect(() => {
    void initialize()
  }, [initialize])

  /**
   * 切换同步开关
   */
  const handleToggleSync = useCallback(() => {
    if (syncEnabled) {
      void disableSync()
    } else {
      void enableSync()
    }
  }, [syncEnabled, enableSync, disableSync])

  /**
   * 手动同步
   */
  const handleSync = useCallback(() => {
    void sync()
  }, [sync])

  /**
   * 解决单个冲突
   */
  const handleResolveConflict = useCallback(async (conflictId: string, resolution: 'local' | 'remote') => {
    await resolveConflict(conflictId, resolution)
  }, [resolveConflict])

  /**
   * 解决所有冲突
   */
  const handleResolveAllConflicts = useCallback(async (resolution: 'local' | 'remote') => {
    await resolveAllConflicts(resolution)
    setShowConflictDialog(false)
  }, [resolveAllConflicts])

  /**
   * 格式化时间
   */
  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMinutes < 1) return t('time.justNow')
    if (diffMinutes < 60) return t('time.minutesAgo', { count: diffMinutes })
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours })
    if (diffDays < 7) return t('time.daysAgo', { count: diffDays })
    return date.toLocaleDateString()
  }, [t])

  /**
   * 格式化持续时间
   */
  const formatDuration = useCallback((ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }, [])

  /**
   * 获取同步状态信息
   */
  const statusInfo = useMemo(() => {
    switch (syncStatus) {
      case 'idle':
        return { color: 'bg-ink-400', text: t('sync.status.idle') }
      case 'syncing':
        return { color: 'bg-accent animate-pulse', text: t('sync.status.syncing') }
      case 'success':
        return { color: 'bg-success', text: t('sync.status.success') }
      case 'error':
        return { color: 'bg-error', text: t('sync.status.error') }
      case 'conflict':
        return { color: 'bg-warning', text: t('sync.status.conflict') }
      default:
        return { color: 'bg-ink-400', text: t('sync.status.idle') }
    }
  }, [syncStatus, t])

  return (
    <div className={cn('space-y-6', className)}>
      {/* 同步开关 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-ink-900 dark:text-ink-900">
            {t('sync.enable')}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {t('sync.enableDescription')}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={syncEnabled}
          onClick={handleToggleSync}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            syncEnabled ? 'bg-accent' : 'bg-ink-300 dark:bg-ink-400'
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              syncEnabled ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </button>
      </div>

      {syncEnabled && (
        <>
          {/* 同步状态 */}
          <div className="rounded-lg border border-ink-200 dark:border-ink-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', statusInfo.color)} />
                <span className="text-sm text-ink-700 dark:text-ink-700">
                  {statusInfo.text}
                </span>
              </div>
              {syncStatus === 'syncing' && (
                <button
                  onClick={cancelSync}
                  className="text-xs text-muted hover:text-ink-700 dark:hover:text-ink-300"
                >
                  {t('common.cancel')}
                </button>
              )}
            </div>

            {/* 同步进度 */}
            {syncProgress && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{t(syncProgress.message)}</span>
                  <span>{syncProgress.current}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary dark:bg-surface-tertiary">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${syncProgress.current}%` }}
                  />
                </div>
              </div>
            )}

            {/* 错误信息 */}
            {syncStatus === 'error' && lastSyncError && (
              <div className="rounded-md bg-error/10 border border-error/20 p-2">
                <p className="text-xs text-error">{lastSyncError}</p>
              </div>
            )}

            {/* 上次同步时间 */}
            {lastSyncTime && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <ClockIcon className="h-3.5 w-3.5" />
                <span>
                  {t('sync.lastSync')}: {formatTime(lastSyncTime)}
                </span>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleSync}
              disabled={syncStatus === 'syncing'}
              className="flex-1"
            >
              {syncStatus === 'syncing' ? (
                <>
                  <LoadingSpinner />
                  {t('sync.syncing')}
                </>
              ) : (
                <>
                  <SyncIcon />
                  {t('sync.syncNow')}
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowHistoryDialog(true)}
              className="flex-1"
            >
              <HistoryIcon />
              {t('sync.history')}
            </Button>
          </div>

          {/* 同步错误提示 */}
          {lastSyncError && (
            <div className="rounded-lg bg-error/10 border border-error/20 p-3">
              <div className="flex items-start gap-2">
                <WarningIcon className="h-4 w-4 text-error shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-error">
                    同步失败
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {lastSyncError}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 冲突提示 */}
          {conflicts.length > 0 && (
            <div
              className="rounded-lg bg-warning/10 border border-warning/20 p-3 cursor-pointer hover:bg-warning/20 transition-colors"
              onClick={() => setShowConflictDialog(true)}
            >
              <div className="flex items-center gap-2">
                <WarningIcon className="h-4 w-4 text-warning shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-warning">
                    {t('sync.conflictsFound', { count: conflicts.length })}
                  </p>
                  <p className="text-xs text-warning/80 mt-0.5">
                    {t('sync.clickToResolve')}
                  </p>
                </div>
                <ChevronRightIcon className="h-4 w-4 text-warning" />
              </div>
            </div>
          )}

          {/* 同步设置 */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted uppercase tracking-wide">
              {t('sync.settings')}
            </h4>

            {/* 自动同步间隔 */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-700 dark:text-ink-700">
                {t('sync.autoSyncInterval')}
              </span>
              <Select
                value={String(config.autoSyncInterval)}
                onValueChange={(value) => {
                  void setConfig({ autoSyncInterval: Number(value) })
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 {t('sync.minutes')}</SelectItem>
                  <SelectItem value="5">5 {t('sync.minutes')}</SelectItem>
                  <SelectItem value="15">15 {t('sync.minutes')}</SelectItem>
                  <SelectItem value="30">30 {t('sync.minutes')}</SelectItem>
                  <SelectItem value="60">1 {t('sync.hour')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 同步内容选项 */}
            <div className="space-y-2">
              <SyncOptionItem
                label={t('sync.syncSessions')}
                checked={config.syncSessions}
                onChange={(checked) => {
                  void setConfig({ syncSessions: checked })
                }}
              />
              <SyncOptionItem
                label={t('sync.syncMemories')}
                checked={config.syncMemories}
                onChange={(checked) => {
                  void setConfig({ syncMemories: checked })
                }}
              />
              <SyncOptionItem
                label={t('sync.syncSkills')}
                checked={config.syncSkills}
                onChange={(checked) => {
                  void setConfig({ syncSkills: checked })
                }}
              />
              <SyncOptionItem
                label={t('sync.syncSettings')}
                checked={config.syncSettings}
                onChange={(checked) => {
                  void setConfig({ syncSettings: checked })
                }}
              />
            </div>

            {/* 冲突解决策略 */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-700 dark:text-ink-700">
                {t('sync.conflictResolution')}
              </span>
              <Select
                value={config.conflictResolution}
                onValueChange={(value) => {
                  void setConfig({ conflictResolution: value as 'ask' | 'local' | 'remote' | 'newest' })
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ask">{t('sync.resolutionAsk')}</SelectItem>
                  <SelectItem value="local">{t('sync.resolutionLocal')}</SelectItem>
                  <SelectItem value="remote">{t('sync.resolutionRemote')}</SelectItem>
                  <SelectItem value="newest">{t('sync.resolutionNewest')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {/* 冲突解决对话框 */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('sync.resolveConflicts', '解决冲突')}</DialogTitle>
            <DialogDescription>
              {t('sync.resolveConflictsDescription', '选择要保留的版本来解决同步冲突')}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <ConflictList
              conflicts={conflicts}
              onResolve={handleResolveConflict}
              onResolveAll={handleResolveAllConflicts}
              showBatchActions={true}
              showEmptyState={false}
              maxHeight="320px"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* 同步历史对话框 */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('sync.historyTitle')}</DialogTitle>
            <DialogDescription>
              {t('sync.historyDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto space-y-2 py-4">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted">
                <HistoryIcon className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">{t('sync.noHistory')}</p>
              </div>
            ) : (
              history.map((item) => (
                <HistoryCard
                  key={item.id}
                  item={item}
                  formatTime={formatTime}
                  formatDuration={formatDuration}
                />
              ))
            )}
          </div>

          {history.length > 0 && (
            <DialogFooter>
              <Button variant="outline" onClick={clearHistory}>
                {t('sync.clearHistory')}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * 同步选项项组件
 */
interface SyncOptionItemProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function SyncOptionItem({ label, checked, onChange }: SyncOptionItemProps) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-sm text-ink-700 dark:text-ink-700 group-hover:text-ink-900 dark:group-hover:text-ink-900 transition-colors">{label}</span>
      <Checkbox
        checked={checked}
        onCheckedChange={(val) => onChange(val === true)}
      />
    </label>
  )
}

/**
 * 历史卡片组件
 */
interface HistoryCardProps {
  item: SyncHistoryItem
  formatTime: (timestamp: number) => string
  formatDuration: (ms: number) => string
}

function HistoryCard({ item, formatTime, formatDuration }: HistoryCardProps) {
  const { t } = useTranslation()

  const statusConfig = {
    success: { icon: SuccessIcon, color: 'text-success', bg: 'bg-success/10' },
    partial: { icon: WarningIcon, color: 'text-warning', bg: 'bg-warning/10' },
    failed: { icon: ErrorIcon, color: 'text-error', bg: 'bg-error/10' },
  }

  const config = statusConfig[item.status]
  const StatusIcon = config.icon
  const hasNoChanges = item.status !== 'failed'
    && item.uploaded === 0
    && item.downloaded === 0
    && item.conflicts === 0

  return (
    <div className="rounded-lg border border-ink-200 dark:border-ink-700 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('rounded-full p-1', config.bg)}>
            <StatusIcon className={cn('h-3.5 w-3.5', config.color)} />
          </div>
          <span className="text-sm text-ink-900 dark:text-ink-900">
            {formatTime(item.syncedAt)}
          </span>
        </div>
        <span className="text-xs text-muted">
          {formatDuration(item.duration)}
        </span>
      </div>

      {hasNoChanges && (
        <div className="mt-2 text-xs text-muted">
          {t('sync.noChanges', '无变更')}
        </div>
      )}

      <div className="mt-2 flex items-center gap-4 text-xs text-muted">
        <span>{t('sync.uploaded')}: {item.uploaded}</span>
        <span>{t('sync.downloaded')}: {item.downloaded}</span>
        {item.conflicts > 0 && (
          <span className="text-warning">{t('sync.conflictsCount')}: {item.conflicts}</span>
        )}
      </div>

      {item.error && (
        <div className="mt-2 rounded-md bg-error/10 p-2">
          <p className="text-xs text-error">{item.error}</p>
        </div>
      )}
    </div>
  )
}

/**
 * Loading Spinner 组件
 */
function LoadingSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
  )
}

/**
 * Sync Icon
 */
function SyncIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
    </svg>
  )
}

/**
 * History Icon
 */
function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

/**
 * Clock Icon
 */
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

/**
 * Warning Icon
 */
function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

/**
 * Success Icon
 */
function SuccessIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

/**
 * Error Icon
 */
function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

/**
 * Chevron Right Icon
 */
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default CloudSync
