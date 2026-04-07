/**
 * 冲突列表组件
 *
 * 独立的、可复用的冲突管理组件，用于显示和解决同步冲突。
 *
 * @example
 * ```tsx
 * <ConflictList
 *   conflicts={conflicts}
 *   onResolve={handleResolve}
 *   onResolveAll={handleResolveAll}
 * />
 * ```
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/ui/components/ui/button'
import { Badge } from '@/ui/components/ui/badge'
import { ScrollArea } from '@/ui/components/ui/scroll-area'
import { cn } from '@/ui/lib/utils'
import type { SyncConflict } from '@/ui/store/useSyncStore'

/**
 * 冲突列表组件 Props
 */
export interface ConflictListProps {
  /** 冲突列表 */
  conflicts: SyncConflict[]
  /** 解决单个冲突的回调 */
  onResolve: (conflictId: string, resolution: 'local' | 'remote') => Promise<void> | void
  /** 批量解决所有冲突的回调 */
  onResolveAll?: (resolution: 'local' | 'remote') => Promise<void> | void
  /** 自定义类名 */
  className?: string
  /** 是否显示批量操作按钮 */
  showBatchActions?: boolean
  /** 是否显示空状态 */
  showEmptyState?: boolean
  /** 最大高度 */
  maxHeight?: string
}

/**
 * 冲突列表组件
 */
export function ConflictList({
  conflicts,
  onResolve,
  onResolveAll,
  className,
  showBatchActions = true,
  showEmptyState = true,
  maxHeight = '400px',
}: ConflictListProps) {
  const { t } = useTranslation()
  const [selectedConflict, setSelectedConflict] = useState<string | null>(null)
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set())

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

    if (diffMinutes < 1) return t('time.justNow', '刚刚')
    if (diffMinutes < 60) return t('time.minutesAgo', { count: diffMinutes, defaultValue: `${diffMinutes} 分钟前` })
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours, defaultValue: `${diffHours} 小时前` })
    if (diffDays < 7) return t('time.daysAgo', { count: diffDays, defaultValue: `${diffDays} 天前` })
    return date.toLocaleDateString()
  }, [t])

  /**
   * 处理解决冲突
   */
  const handleResolve = useCallback(async (conflictId: string, resolution: 'local' | 'remote') => {
    setResolvingIds(prev => new Set(prev).add(conflictId))
    try {
      await onResolve(conflictId, resolution)
    } finally {
      setResolvingIds(prev => {
        const next = new Set(prev)
        next.delete(conflictId)
        return next
      })
    }
  }, [onResolve])

  /**
   * 处理批量解决
   */
  const handleResolveAll = useCallback(async (resolution: 'local' | 'remote') => {
    if (!onResolveAll) return
    await onResolveAll(resolution)
  }, [onResolveAll])

  // 空状态
  if (conflicts.length === 0 && showEmptyState) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
        <div className="rounded-full bg-success/10 p-4 mb-4">
          <svg className="h-8 w-8 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h3 className="text-base font-medium text-ink-900 mb-1">
          {t('sync.noConflicts', '没有冲突')}
        </h3>
        <p className="text-sm text-muted">
          {t('sync.noConflictsDescription', '所有数据已成功同步')}
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* 批量操作按钮 */}
      {showBatchActions && conflicts.length > 0 && onResolveAll && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-secondary border border-ink-200 dark:border-ink-700">
          <div className="flex items-center gap-2">
            <WarningIcon className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium text-ink-900">
              {t('sync.conflictsCount', { count: conflicts.length, defaultValue: `${conflicts.length} 个冲突` })}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleResolveAll('local')}
            >
              {t('sync.keepAllLocal', '全部保留本地')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleResolveAll('remote')}
            >
              {t('sync.keepAllRemote', '全部保留远程')}
            </Button>
          </div>
        </div>
      )}

      {/* 冲突列表 */}
      <ScrollArea style={{ maxHeight }}>
        <div className="space-y-3">
          {conflicts.map((conflict) => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              onResolve={handleResolve}
              formatTime={formatTime}
              selected={selectedConflict === conflict.id}
              onSelect={() => setSelectedConflict(conflict.id)}
              isResolving={resolvingIds.has(conflict.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * 冲突卡片组件 Props
 */
interface ConflictCardProps {
  conflict: SyncConflict
  onResolve: (conflictId: string, resolution: 'local' | 'remote') => Promise<void>
  formatTime: (timestamp: number) => string
  selected?: boolean
  onSelect?: () => void
  isResolving?: boolean
}

/**
 * 冲突卡片组件
 */
function ConflictCard({
  conflict,
  onResolve,
  formatTime,
  selected,
  onSelect,
  isResolving,
}: ConflictCardProps) {
  const { t } = useTranslation()

  const conflictTypeText = {
    local_newer: t('sync.conflictLocalNewer', '本地较新'),
    remote_newer: t('sync.conflictRemoteNewer', '远程较新'),
    both_modified: t('sync.conflictBothModified', '双方都已修改'),
  }

  const dataTypeText = {
    session: t('sync.dataType.session', '会话'),
    memory: t('sync.dataType.memory', '记忆'),
    skill: t('sync.dataType.skill', '技能'),
    settings: t('sync.dataType.settings', '设置'),
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all duration-200 cursor-pointer',
        selected
          ? 'border-accent bg-accent/5 shadow-md'
          : 'border-ink-200 dark:border-ink-700 hover:border-ink-300 dark:hover:border-ink-600 hover:shadow-sm',
        isResolving && 'opacity-50 pointer-events-none'
      )}
      onClick={onSelect}
    >
      {/* 头部信息 */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-ink-900 truncate">
              {conflict.dataName}
            </h4>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {dataTypeText[conflict.dataType]}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                conflict.conflictType === 'both_modified' && 'border-error text-error',
                conflict.conflictType === 'local_newer' && 'border-accent text-accent',
                conflict.conflictType === 'remote_newer' && 'border-warning text-warning'
              )}
            >
              {conflictTypeText[conflict.conflictType]}
            </Badge>
            <span className="text-xs text-muted">
              {formatTime(conflict.createdAt)}
            </span>
          </div>
        </div>
        {isResolving && (
          <div className="shrink-0">
            <LoadingSpinner />
          </div>
        )}
      </div>

      {/* 数据对比 */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* 本地数据 */}
        <div className="rounded-md bg-surface-secondary dark:bg-surface-tertiary p-3 border border-ink-200 dark:border-ink-700">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-xs font-medium text-muted">
              {t('sync.local', '本地')}
            </span>
          </div>
          <p className="text-xs text-ink-700 dark:text-ink-700 line-clamp-3 mb-2">
            {conflict.localSummary}
          </p>
          <div className="text-xs text-muted">
            {formatTime(conflict.localModifiedAt)}
          </div>
        </div>

        {/* 远程数据 */}
        <div className="rounded-md bg-surface-secondary dark:bg-surface-tertiary p-3 border border-ink-200 dark:border-ink-700">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-warning" />
            <span className="text-xs font-medium text-muted">
              {t('sync.remote', '远程')}
            </span>
          </div>
          <p className="text-xs text-ink-700 dark:text-ink-700 line-clamp-3 mb-2">
            {conflict.remoteSummary}
          </p>
          <div className="text-xs text-muted">
            {formatTime(conflict.remoteModifiedAt)}
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation()
            onResolve(conflict.id, 'local')
          }}
          disabled={isResolving}
          className="flex-1"
        >
          <CheckIcon className="h-3.5 w-3.5 mr-1" />
          {t('sync.keepLocal', '保留本地')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation()
            onResolve(conflict.id, 'remote')
          }}
          disabled={isResolving}
          className="flex-1"
        >
          <DownloadIcon className="h-3.5 w-3.5 mr-1" />
          {t('sync.keepRemote', '保留远程')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Loading Spinner 组件
 */
function LoadingSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
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
 * Check Icon
 */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/**
 * Download Icon
 */
function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export default ConflictList
