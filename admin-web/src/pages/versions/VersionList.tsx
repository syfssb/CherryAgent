import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Package,
  CheckCircle,
  AlertCircle,
  Eye,
  Trash2,
  Edit2,
  Globe,
  ShieldAlert,
  Loader2,
  X,
  ExternalLink,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  cn,
  formatDateTime,
  formatRelativeTime,
} from '@/lib/utils'
import {
  versionsService,
  type VersionDetail,
  type VersionFilters,
  type UpdateStrategy,
} from '@/services/versions'
import VersionForm from './VersionForm'
import { useAdminStore } from '@/store/useAdminStore'

// ============================================================
// 常量
// ============================================================

const PAGE_SIZE = 20

/**
 * 发布状态筛选选项
 */
const publishedFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'true', label: '已发布' },
  { value: 'false', label: '未发布' },
]

/**
 * 更新策略筛选选项
 */
const strategyFilterOptions = [
  { value: '', label: '全部策略' },
  { value: 'none', label: '不更新' },
  { value: 'optional', label: '可选更新' },
  { value: 'recommended', label: '推荐更新' },
  { value: 'forced', label: '强制更新' },
]

// ============================================================
// 辅助函数
// ============================================================

/**
 * 获取更新策略的徽章样式
 */
function getStrategyBadge(strategy: UpdateStrategy): { variant: 'outline' | 'secondary' | 'destructive' | 'default'; label: string; className?: string } {
  switch (strategy) {
    case 'forced':
      return { variant: 'destructive', label: '强制更新' }
    case 'recommended':
      return { variant: 'outline', label: '推荐更新', className: 'border-warning/30 text-warning bg-warning/5' }
    case 'optional':
      return { variant: 'outline', label: '可选更新', className: 'border-info/30 text-info bg-info/5' }
    case 'none':
      return { variant: 'secondary', label: '不更新' }
    default:
      return { variant: 'secondary', label: strategy }
  }
}

/**
 * 获取可用平台数量
 */
function getAvailablePlatforms(version: VersionDetail): string[] {
  const platforms: string[] = []
  if (version.downloadUrls.macArm64) platforms.push('Mac ARM64')
  if (version.downloadUrls.macX64) platforms.push('Mac x64')
  if (version.downloadUrls.winX64) platforms.push('Win x64')
  if (version.downloadUrls.linuxX64) platforms.push('Linux x64')
  return platforms
}

/**
 * 格式化灰度百分比
 */
function formatStagingPercentage(percentage: number): string {
  if (percentage === 100) return '全量'
  if (percentage === 0) return '暂停'
  return `${percentage}%`
}

// ============================================================
// 组件
// ============================================================

export default function VersionListPage() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAdminStore()
  const canWrite = hasPermission('versions:write')
  const canPublish = hasPermission('versions:publish')

  // 筛选状态
  const [search, setSearch] = useState('')
  const [publishedFilter, setPublishedFilter] = useState('')
  const [strategyFilter, setStrategyFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  // 选择状态
  const [selectedVersions, setSelectedVersions] = useState<string[]>([])

  // 删除确认状态
  const [deletingVersion, setDeletingVersion] = useState<VersionDetail | null>(null)

  // 表单对话框状态
  const [showForm, setShowForm] = useState(false)
  const [editingVersion, setEditingVersion] = useState<VersionDetail | null>(null)

  // 详情弹窗状态
  const [viewingVersion, setViewingVersion] = useState<VersionDetail | null>(null)

  // 批量删除确认状态
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)

  // 构建筛选参数
  const buildFilters = useCallback((): VersionFilters => {
    const filters: VersionFilters = {
      page,
      limit: PAGE_SIZE,
    }

    if (publishedFilter === 'true') {
      filters.isPublished = true
    } else if (publishedFilter === 'false') {
      filters.isPublished = false
    }

    if (strategyFilter) {
      filters.updateStrategy = strategyFilter as UpdateStrategy
    }

    return filters
  }, [page, publishedFilter, strategyFilter])

  // 查询版本列表
  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['versions', page, publishedFilter, strategyFilter],
    queryFn: () => versionsService.getVersions(buildFilters()),
  })

  const versions = response?.data?.versions ?? []
  const latestVersion = response?.data?.latestVersion ?? null
  const meta = response?.meta
  const total = meta?.total ?? 0
  const totalPages = meta
    ? Math.max(1, Math.ceil(total / (meta.limit ?? PAGE_SIZE)))
    : 1

  // 前端搜索过滤（后端不支持 search 参数，在前端做）
  const filteredVersions = search.trim()
    ? versions.filter((v) => {
        const searchLower = search.toLowerCase()
        return (
          v.version.toLowerCase().includes(searchLower) ||
          (v.releaseNotes && v.releaseNotes.toLowerCase().includes(searchLower))
        )
      })
    : versions

  // 统计数据（从当前列表数据计算）
  const totalCount = total
  const publishedCount = versions.filter((v) => v.isPublished).length
  const unpublishedCount = versions.filter((v) => !v.isPublished).length
  const totalDownloads = versions.reduce((sum, v) => sum + v.downloadCounts.total, 0)

  // 发布版本
  const publishMutation = useMutation({
    mutationFn: (id: string) => versionsService.publishVersion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['versions'] })
    },
    onError: (err: Error) => {
      alert(`发布失败: ${err.message}`)
    },
  })

  // 取消发布版本
  const unpublishMutation = useMutation({
    mutationFn: (id: string) => versionsService.unpublishVersion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['versions'] })
    },
    onError: (err: Error) => {
      alert(`取消发布失败: ${err.message}`)
    },
  })

  // 删除版本
  const deleteMutation = useMutation({
    mutationFn: (id: string) => versionsService.deleteVersion(id),
    onSuccess: () => {
      setDeletingVersion(null)
      setSelectedVersions([])
      queryClient.invalidateQueries({ queryKey: ['versions'] })
    },
    onError: (err: Error) => {
      alert(`删除失败: ${err.message}`)
    },
  })

  // 批量发布
  const batchPublishMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map(id => versionsService.publishVersion(id)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed > 0) throw new Error(`${ids.length - failed} 个成功，${failed} 个失败`)
      return results
    },
    onSuccess: () => {
      setSelectedVersions([])
      queryClient.invalidateQueries({ queryKey: ['versions'] })
    },
    onError: (err: Error) => alert(`批量发布: ${err.message}`),
  })

  // 批量删除
  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map(id => versionsService.deleteVersion(id)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed > 0) throw new Error(`${ids.length - failed} 个成功，${failed} 个失败`)
      return results
    },
    onSuccess: () => {
      setSelectedVersions([])
      setShowBatchDeleteConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['versions'] })
    },
    onError: (err: Error) => alert(`批量删除: ${err.message}`),
  })

  // 处理全选
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedVersions(filteredVersions.map((v) => v.id))
      } else {
        setSelectedVersions([])
      }
    },
    [filteredVersions]
  )

  // 处理单选
  const handleSelectVersion = useCallback(
    (versionId: string, checked: boolean) => {
      if (checked) {
        setSelectedVersions((prev) => [...prev, versionId])
      } else {
        setSelectedVersions((prev) => prev.filter((id) => id !== versionId))
      }
    },
    []
  )

  // 清除筛选
  const handleClearFilters = useCallback(() => {
    setPublishedFilter('')
    setStrategyFilter('')
    setSearch('')
    setPage(1)
  }, [])

  // 发布/取消发布
  const handleTogglePublish = useCallback(
    (version: VersionDetail) => {
      if (version.isPublished) {
        unpublishMutation.mutate(version.id)
      } else {
        publishMutation.mutate(version.id)
      }
    },
    [publishMutation, unpublishMutation]
  )

  // 确认删除
  const handleDeleteConfirm = useCallback(() => {
    if (deletingVersion) {
      deleteMutation.mutate(deletingVersion.id)
    }
  }, [deletingVersion, deleteMutation])

  // 导出数据
  const handleExport = useCallback(() => {
    if (filteredVersions.length === 0) {
      alert('没有可导出的数据')
      return
    }

    const BOM = '\uFEFF'
    const headers = ['版本号', '发布状态', '更新策略', '灰度百分比', 'Mac下载量', 'Win下载量', 'Linux下载量', '总下载量', '发布时间', '更新说明']

    const rows = filteredVersions.map(v => [
      v.version,
      v.isPublished ? '已发布' : '未发布',
      v.updateStrategy,
      `${v.stagingPercentage}%`,
      v.downloadCounts.mac,
      v.downloadCounts.win,
      v.downloadCounts.linux,
      v.downloadCounts.total,
      v.releaseDate,
      (v.releaseNotes || '').replace(/"/g, '""'),
    ])

    const csvContent = BOM + [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `versions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredVersions])

  const isToggling = publishMutation.isPending || unpublishMutation.isPending

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">版本管理</h1>
          <p className="text-muted-foreground mt-1">
            管理应用发布版本
            {latestVersion && (
              <span className="ml-2 text-primary">
                (最新版本: v{latestVersion})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching && <Loader2 size={14} className="animate-spin mr-1.5" />}
            <RefreshCw size={16} className="mr-1.5" />
            刷新
          </Button>
          <Button
            variant="secondary"
            onClick={handleExport}
          >
            <Download size={16} className="mr-1.5" />
            导出
          </Button>
          {canWrite && (
            <Button onClick={() => { setEditingVersion(null); setShowForm(true) }}>
              <Plus size={16} className="mr-1.5" />
              发布新版本
            </Button>
          )}
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">总版本数</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {isLoading ? '-' : totalCount}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Package size={24} className="text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">已发布</p>
                <p className="text-2xl font-bold text-success mt-1">
                  {isLoading ? '-' : publishedCount}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle size={24} className="text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">未发布</p>
                <p className="text-2xl font-bold text-info mt-1">
                  {isLoading ? '-' : unpublishedCount}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-info/10 flex items-center justify-center">
                <AlertCircle size={24} className="text-info" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">总下载量</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {isLoading ? '-' : totalDownloads.toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Download size={24} className="text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 错误提示 */}
      {isError && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle size={20} />
              <span>加载版本列表失败: {error instanceof Error ? error.message : '未知错误'}</span>
              <Button variant="secondary" size="sm" onClick={() => refetch()}>
                重试
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 搜索和筛选 / 批量操作栏 */}
      <Card>
        <CardContent className="p-4">
          {selectedVersions.length > 0 ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-foreground">
                  已选择 {selectedVersions.length} 项
                </span>
                {canPublish && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const unpublishedIds = selectedVersions.filter(id => {
                        const v = filteredVersions.find(ver => ver.id === id)
                        return v && !v.isPublished
                      })
                      if (unpublishedIds.length === 0) {
                        alert('所选版本均已发布')
                        return
                      }
                      batchPublishMutation.mutate(unpublishedIds)
                    }}
                    disabled={batchPublishMutation.isPending}
                  >
                    {batchPublishMutation.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                    批量发布
                  </Button>
                )}
                {canWrite && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowBatchDeleteConfirm(true)}
                    disabled={batchDeleteMutation.isPending}
                  >
                    批量删除
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedVersions([])}
              >
                取消选择
              </Button>
            </div>
          ) : (
          <div className="flex flex-col lg:flex-row gap-4">
            {/* 搜索框 */}
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索版本号或更新说明..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* 筛选按钮 */}
            <Button
              variant={showFilters ? 'default' : 'secondary'}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={16} className="mr-1.5" />
              筛选
            </Button>
          </div>
          )}

          {/* 展开的筛选器 */}
          {selectedVersions.length === 0 && showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 发布状态筛选 */}
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">发布状态</label>
                <select
                  value={publishedFilter}
                  onChange={(e) => {
                    setPublishedFilter(e.target.value)
                    setPage(1)
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {publishedFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 更新策略筛选 */}
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">更新策略</label>
                <select
                  value={strategyFilter}
                  onChange={(e) => {
                    setStrategyFilter(e.target.value)
                    setPage(1)
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {strategyFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 清除筛选 */}
              <div className="flex items-end">
                <Button variant="ghost" onClick={handleClearFilters}>
                  清除筛选
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 版本表格 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={
                      selectedVersions.length === filteredVersions.length &&
                      filteredVersions.length > 0
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded border-border bg-card text-primary focus:ring-primary"
                  />
                </TableHead>
                <TableHead>版本信息</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>下载量</TableHead>
                <TableHead>更新策略</TableHead>
                <TableHead>灰度</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>发布时间</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredVersions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    没有找到匹配的版本
                  </TableCell>
                </TableRow>
              ) : (
                filteredVersions.map((version) => {
                  const platforms = getAvailablePlatforms(version)
                  const strategyBadge = getStrategyBadge(version.updateStrategy)

                  return (
                    <TableRow
                      key={version.id}
                      className={cn(
                        selectedVersions.includes(version.id) && 'bg-primary/5'
                      )}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedVersions.includes(version.id)}
                          onChange={(e) =>
                            handleSelectVersion(version.id, e.target.checked)
                          }
                          className="w-4 h-4 rounded border-border bg-card text-primary focus:ring-primary"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-foreground font-medium font-mono">
                                v{version.version}
                              </p>
                              {version.isLatest && (
                                <Badge variant="outline" className="text-xs border-success/30 text-success bg-success/5">
                                  最新
                                </Badge>
                              )}
                            </div>
                            {version.releaseNotes && (
                              <p className="text-muted-foreground text-sm mt-0.5 max-w-xs truncate">
                                {version.releaseNotes}
                              </p>
                            )}
                            {version.minVersion && (
                              <p className="text-muted-foreground/60 text-xs mt-0.5">
                                最低版本: v{version.minVersion}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {platforms.length > 0 ? (
                            platforms.map((p) => (
                              <div
                                key={p}
                                className="flex items-center gap-1 text-muted-foreground text-xs"
                              >
                                <Package size={12} />
                                <span>{p}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-muted-foreground/60 text-xs">无下载链接</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm space-y-0.5">
                          <div className="text-muted-foreground font-medium">
                            {version.downloadCounts.total.toLocaleString()}
                          </div>
                          <div className="text-muted-foreground/60 text-xs space-x-2">
                            {version.downloadCounts.mac > 0 && (
                              <span>Mac: {version.downloadCounts.mac.toLocaleString()}</span>
                            )}
                            {version.downloadCounts.win > 0 && (
                              <span>Win: {version.downloadCounts.win.toLocaleString()}</span>
                            )}
                            {version.downloadCounts.linux > 0 && (
                              <span>Linux: {version.downloadCounts.linux.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={strategyBadge.variant} className={strategyBadge.className}>
                          {strategyBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'text-sm font-medium',
                            version.stagingPercentage === 100
                              ? 'text-success'
                              : version.stagingPercentage === 0
                                ? 'text-muted-foreground/60'
                                : 'text-warning'
                          )}
                        >
                          {formatStagingPercentage(version.stagingPercentage)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {version.isPublished ? (
                          <Badge variant="outline" className="border-success/30 text-success bg-success/5">
                            已发布
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            未发布
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="text-muted-foreground">
                            {formatRelativeTime(version.releaseDate)}
                          </p>
                          <p className="text-muted-foreground/60 text-xs mt-0.5">
                            {formatDateTime(version.releaseDate)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {/* 发布/取消发布 */}
                          {canPublish && (
                            <button
                              onClick={() => handleTogglePublish(version)}
                              disabled={isToggling}
                              className={cn(
                                'p-1.5 rounded transition-colors',
                                version.isPublished
                                  ? 'text-success hover:text-warning hover:bg-muted'
                                  : 'text-muted-foreground hover:text-success hover:bg-muted'
                              )}
                              title={
                                version.isPublished ? '取消发布' : '发布版本'
                              }
                            >
                              {isToggling ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Globe size={16} />
                              )}
                            </button>
                          )}

                          {/* 查看详情 */}
                          <button
                            onClick={() => setViewingVersion(version)}
                            className="p-1.5 text-muted-foreground hover:text-info hover:bg-muted rounded transition-colors"
                            title="查看详情"
                          >
                            <Eye size={16} />
                          </button>

                          {/* 编辑 */}
                          {canWrite && (
                            <button
                              onClick={() => { setEditingVersion(version); setShowForm(true) }}
                              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                              title="编辑版本"
                            >
                              <Edit2 size={16} />
                            </button>
                          )}

                          {/* 删除 - 仅未发布版本可删除 */}
                          {canWrite && !version.isPublished && (
                            <button
                              onClick={() => setDeletingVersion(version)}
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors"
                              title="删除版本"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <div className="text-sm text-muted-foreground">
                共 {total} 条记录，第 {page}/{totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  <ChevronLeft size={16} className="mr-1.5" />
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                >
                  下一页
                  <ChevronRight size={16} className="ml-1.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      {deletingVersion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeletingVersion(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-background rounded-xl border border-border p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert size={20} className="text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">确认删除</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              确定要删除版本{' '}
              <span className="text-foreground font-medium font-mono">
                v{deletingVersion.version}
              </span>{' '}
              吗？此操作不可恢复。
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setDeletingVersion(null)}
                disabled={deleteMutation.isPending}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                <Trash2 size={16} className="mr-1.5" />
                删除
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 创建/编辑版本表单 */}
      <VersionForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingVersion(null) }}
        onSuccess={() => {
          setShowForm(false)
          setEditingVersion(null)
          queryClient.invalidateQueries({ queryKey: ['versions'] })
        }}
        version={editingVersion}
      />

      {/* 版本详情弹窗 */}
      {viewingVersion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setViewingVersion(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-background rounded-xl border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题 */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">
                版本详情 - v{viewingVersion.version}
              </h3>
              <button
                onClick={() => setViewingVersion(null)}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* 基本信息 */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-foreground mb-3">基本信息</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">版本号：</span>
                  <span className="text-foreground font-mono">v{viewingVersion.version}</span>
                  {viewingVersion.isLatest && (
                    <Badge variant="outline" className="ml-2 text-xs border-success/30 text-success bg-success/5">最新</Badge>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">发布状态：</span>
                  {viewingVersion.isPublished ? (
                    <Badge variant="outline" className="border-success/30 text-success bg-success/5">已发布</Badge>
                  ) : (
                    <Badge variant="secondary">未发布</Badge>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">更新策略：</span>
                  <Badge variant={getStrategyBadge(viewingVersion.updateStrategy).variant} className={getStrategyBadge(viewingVersion.updateStrategy).className}>
                    {getStrategyBadge(viewingVersion.updateStrategy).label}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">灰度百分比：</span>
                  <span className="text-foreground">{formatStagingPercentage(viewingVersion.stagingPercentage)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">最低版本：</span>
                  <span className="text-foreground">{viewingVersion.minVersion ? `v${viewingVersion.minVersion}` : '未设置'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">创建时间：</span>
                  <span className="text-foreground">{formatDateTime(viewingVersion.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* 下载链接 */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-foreground mb-3">下载链接</h4>
              <div className="grid grid-cols-1 gap-2 text-sm">
                {([
                  { label: 'Mac ARM64', url: viewingVersion.downloadUrls.macArm64 },
                  { label: 'Mac x64', url: viewingVersion.downloadUrls.macX64 },
                  { label: 'Windows x64', url: viewingVersion.downloadUrls.winX64 },
                  { label: 'Linux x64', url: viewingVersion.downloadUrls.linuxX64 },
                ] as const).map(({ label, url }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">{label}：</span>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate flex items-center gap-1"
                      >
                        {url}
                        <ExternalLink size={12} className="shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground/60">未配置</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 下载统计 */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-foreground mb-3">下载统计</h4>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground text-xs">Mac</p>
                  <p className="text-foreground font-medium mt-1">{viewingVersion.downloadCounts.mac.toLocaleString()}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground text-xs">Windows</p>
                  <p className="text-foreground font-medium mt-1">{viewingVersion.downloadCounts.win.toLocaleString()}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-muted-foreground text-xs">Linux</p>
                  <p className="text-foreground font-medium mt-1">{viewingVersion.downloadCounts.linux.toLocaleString()}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-muted-foreground text-xs">总计</p>
                  <p className="text-primary font-bold mt-1">{viewingVersion.downloadCounts.total.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* 更新说明 */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-foreground mb-3">更新说明</h4>
              {viewingVersion.releaseNotes ? (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-lg p-4 border border-border">
                  {viewingVersion.releaseNotes}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60">暂无更新说明</p>
              )}
            </div>

            {/* 关闭按钮 */}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setViewingVersion(null)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 批量删除确认弹窗 */}
      {showBatchDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { if (!batchDeleteMutation.isPending) setShowBatchDeleteConfirm(false) }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-background rounded-xl border border-border p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert size={20} className="text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">确认批量删除</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              确定要删除选中的 <span className="text-foreground font-medium">{selectedVersions.length}</span> 个未发布版本吗？已发布版本将被跳过。
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowBatchDeleteConfirm(false)}
                disabled={batchDeleteMutation.isPending}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const unpublishedIds = selectedVersions.filter(id => {
                    const v = filteredVersions.find(ver => ver.id === id)
                    return v && !v.isPublished
                  })
                  if (unpublishedIds.length === 0) {
                    alert('所选版本均已发布，无法删除')
                    setShowBatchDeleteConfirm(false)
                    return
                  }
                  batchDeleteMutation.mutate(unpublishedIds)
                }}
                disabled={batchDeleteMutation.isPending}
              >
                {batchDeleteMutation.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                <Trash2 size={16} className="mr-1.5" />
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
