import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Activity,
  TrendingUp,
  Zap,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Heart,
  AlertTriangle,
  TestTube,
  Loader2,
  ShieldAlert,
  MessageSquare,
  X,
  Copy,
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
import { cn, formatDateTime } from '@/lib/utils'
import {
  channelsService,
  type ChannelDetail,
  type ChannelFilters,
} from '@/services/channels'
import ChannelForm from './ChannelForm'
import { useProviders } from '@/constants/providers'
import { useAdminStore } from '@/store/useAdminStore'

// ============================================================
// 常量
// ============================================================

const PAGE_SIZE = 20

const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已禁用' },
  { value: 'healthy', label: '健康' },
  { value: 'unhealthy', label: '不健康' },
  { value: 'degraded', label: '降级' },
]

// ============================================================
// 辅助函数
// ============================================================

function getHealthBadge(channel: ChannelDetail): { variant: 'outline' | 'destructive' | 'secondary'; className?: string; label: string } {
  if (!channel.isEnabled) {
    return { variant: 'secondary', label: '已禁用' }
  }
  switch (channel.healthStatus) {
    case 'healthy':
      return { variant: 'outline', className: 'border-success/30 text-success bg-success/5', label: '健康' }
    case 'degraded':
      return { variant: 'outline', className: 'border-warning/30 text-warning bg-warning/5', label: '降级' }
    case 'unhealthy':
      return { variant: 'destructive', label: '不健康' }
    default:
      return { variant: 'secondary', label: '未知' }
  }
}

function getModelCount(modelMapping: Record<string, string> | null | undefined): number {
  if (!modelMapping || typeof modelMapping !== 'object') return 0
  return Object.keys(modelMapping).length
}

// ============================================================
// InlineNumberEdit 组件
// ============================================================

function InlineNumberEdit({
  value,
  onSave,
  min,
  max,
  suffix,
}: {
  value: number
  onSave: (value: number) => void
  min: number
  max: number
  suffix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) {
      setDraft(String(value))
    }
  }, [value, editing])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleSave = () => {
    setEditing(false)
    const parsed = parseInt(draft, 10)
    if (isNaN(parsed)) return
    const clamped = Math.max(min, Math.min(max, parsed))
    if (clamped === value) return
    setSaving(true)
    onSave(clamped)
    // saving 状态由父组件通过 value 变化间接重置
    setTimeout(() => setSaving(false), 600)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setDraft(String(value))
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-[60px] px-1.5 py-0.5 text-sm bg-background border border-ring rounded text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-0.5 cursor-pointer border-b border-dashed border-muted-foreground/40 hover:border-foreground transition-colors"
      title={`点击编辑${suffix ?? ''}`}
    >
      {saving ? (
        <Loader2 size={12} className="animate-spin text-muted-foreground" />
      ) : (
        <span className="text-sm">{suffix}{value}</span>
      )}
    </button>
  )
}

// ============================================================
// 组件
// ============================================================

export default function ChannelListPage() {
  const queryClient = useQueryClient()
  const { filterOptions } = useProviders()
  const { hasPermission } = useAdminStore()
  const canWrite = hasPermission('channels:write')

  // 筛选状态
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  // 表单对话框状态
  const [formOpen, setFormOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<ChannelDetail | null>(null)
  const [duplicateSource, setDuplicateSource] = useState<ChannelDetail | null>(null)

  // 正在测试中的渠道 ID
  const [testingId, setTestingId] = useState<string | null>(null)

  // 测试对话框状态
  const [testDialogChannel, setTestDialogChannel] = useState<ChannelDetail | null>(null)
  const [testModel, setTestModel] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; latencyMs?: number; model?: string } | null>(null)

  // 删除确认状态
  const [deletingChannel, setDeletingChannel] = useState<ChannelDetail | null>(null)

  // 构建筛选参数
  const buildFilters = useCallback((): ChannelFilters => {
    const filters: ChannelFilters = {
      page,
      limit: PAGE_SIZE,
    }
    if (search.trim()) {
      filters.search = search.trim()
    }
    if (providerFilter) {
      filters.provider = providerFilter
    }
    if (statusFilter) {
      filters.status = statusFilter as ChannelFilters['status']
    }
    return filters
  }, [page, search, providerFilter, statusFilter])

  // 查询渠道列表
  const {
    data: response,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['channels', page, search, statusFilter, providerFilter],
    queryFn: () => channelsService.getChannels(buildFilters()),
  })

  const channels = response?.data?.channels ?? []
  const summary = response?.data?.summary
  const meta = response?.meta
  const total = meta?.total ?? 0
  const totalPages = meta
    ? Math.max(1, Math.ceil(total / (meta.limit ?? PAGE_SIZE)))
    : 1

  // 测试渠道连接
  const testMutation = useMutation({
    mutationFn: ({ id, model }: { id: string; model?: string }) =>
      channelsService.testChannel(id, model),
    onSuccess: (res) => {
      const result = res.data
      setTestResult(result ?? null)
      setTestingId(null)
      queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
    onError: (error: Error) => {
      setTestResult({ success: false, message: error.message })
      setTestingId(null)
    },
  })

  // 启用/禁用渠道
  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      channelsService.toggleChannel(id, isEnabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
    onError: (error: Error) => {
      alert(`操作失败: ${error.message}`)
    },
  })

  // 删除渠道
  const deleteMutation = useMutation({
    mutationFn: (id: string) => channelsService.deleteChannel(id),
    onSuccess: () => {
      setDeletingChannel(null)
      queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
    onError: (error: Error) => {
      alert(`删除失败: ${error.message}`)
    },
  })

  // 重置健康状态
  const resetHealthMutation = useMutation({
    mutationFn: (id: string) => channelsService.resetChannelHealth(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
    onError: (error: Error) => {
      alert(`重置失败: ${error.message}`)
    },
  })

  // 行内编辑优先级/权重
  const inlineUpdateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { priority?: number; weight?: number } }) =>
      channelsService.updateChannel(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['channels'] })
      const previousData = queryClient.getQueryData(['channels', page, search, statusFilter, providerFilter])
      queryClient.setQueryData(
        ['channels', page, search, statusFilter, providerFilter],
        (old: typeof response) => {
          if (!old?.data?.channels) return old
          return {
            ...old,
            data: {
              ...old.data,
              channels: old.data.channels.map((ch: ChannelDetail) =>
                ch.id === id ? { ...ch, ...data } : ch
              ),
            },
          }
        }
      )
      return { previousData }
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ['channels', page, search, statusFilter, providerFilter],
          context.previousData
        )
      }
      alert(`更新失败: ${error.message}`)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
  })

  // 事件处理
  const handleSearch = useCallback(() => {
    setPage(1)
  }, [])

  const handleClearFilters = useCallback(() => {
    setStatusFilter('')
    setProviderFilter('')
    setSearch('')
    setPage(1)
  }, [])

  const handleOpenCreate = useCallback(() => {
    setEditingChannel(null)
    setDuplicateSource(null)
    setFormOpen(true)
  }, [])

  const handleOpenEdit = useCallback((channel: ChannelDetail) => {
    setEditingChannel(channel)
    setDuplicateSource(null)
    setFormOpen(true)
  }, [])

  const handleDuplicate = useCallback((channel: ChannelDetail) => {
    setEditingChannel(null)
    setDuplicateSource(channel)
    setFormOpen(true)
  }, [])

  const handleFormSuccess = useCallback(() => {
    setFormOpen(false)
    setEditingChannel(null)
    setDuplicateSource(null)
    queryClient.invalidateQueries({ queryKey: ['channels'] })
  }, [queryClient])

  const handleTestChannel = useCallback((channel: ChannelDetail) => {
    const models = Object.keys(channel.modelMapping ?? {})
    setTestDialogChannel(channel)
    setTestModel(models.length > 0 ? (models[0] ?? '') : '')
    setTestResult(null)
  }, [])

  const handleRunTest = useCallback((model?: string) => {
    if (!testDialogChannel) return
    setTestingId(testDialogChannel.id)
    setTestResult(null)
    testMutation.mutate({ id: testDialogChannel.id, model: model || undefined })
  }, [testDialogChannel, testMutation])

  const handleToggleChannel = useCallback((channel: ChannelDetail) => {
    toggleMutation.mutate({ id: channel.id, isEnabled: !channel.isEnabled })
  }, [toggleMutation])

  const handleDeleteConfirm = useCallback(() => {
    if (deletingChannel) {
      deleteMutation.mutate(deletingChannel.id)
    }
  }, [deletingChannel, deleteMutation])

  const handleResetHealth = useCallback((id: string) => {
    resetHealthMutation.mutate(id)
  }, [resetHealthMutation])

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">渠道管理</h1>
          <p className="text-muted-foreground mt-1">管理和监控 API 渠道</p>
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
          {canWrite && (
            <Button
              onClick={handleOpenCreate}
            >
              <Plus size={16} className="mr-1.5" />
              添加渠道
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
                <p className="text-muted-foreground text-sm">总渠道数</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {summary?.totalChannels ?? '-'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap size={24} className="text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">已启用</p>
                <p className="text-2xl font-bold text-success mt-1">
                  {summary?.enabledChannels ?? '-'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <Activity size={24} className="text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">健康渠道</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {summary?.healthyChannels ?? '-'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <TrendingUp size={24} className="text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">不健康/降级</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {summary
                    ? (summary.unhealthyChannels ?? 0) + (summary.degradedChannels ?? 0)
                    : '-'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle size={24} className="text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索渠道名称..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch()
                  }}
                  className="pl-9"
                />
              </div>
            </div>
            <Button
              variant={showFilters ? 'default' : 'secondary'}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={16} className="mr-1.5" />
              筛选
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">状态</label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value)
                    setPage(1)
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {statusFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">提供商</label>
                <select
                  value={providerFilter}
                  onChange={(e) => {
                    setProviderFilter(e.target.value)
                    setPage(1)
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {filterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <Button variant="ghost" onClick={handleClearFilters}>
                  清除筛选
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 渠道表格 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>渠道信息</TableHead>
                <TableHead>提供商</TableHead>
                <TableHead>优先级/权重</TableHead>
                <TableHead>模型数</TableHead>
                <TableHead>限流</TableHead>
                <TableHead>价格倍率</TableHead>
                <TableHead>健康状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-36">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="h-32 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : channels.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="h-32 text-center text-muted-foreground">没有找到匹配的渠道</TableCell></TableRow>
              ) : (
                channels.map((channel) => {
                  const healthBadge = getHealthBadge(channel)
                  const modelCount = getModelCount(channel.modelMapping)
                  const isTesting = testingId === channel.id

                  return (
                    <TableRow key={channel.id}>
                      <TableCell>
                        <div>
                          <p className="text-foreground font-medium">{channel.name}</p>
                          <p className="text-muted-foreground text-sm truncate max-w-xs">
                            {channel.baseUrl}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {channel.provider}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <InlineNumberEdit
                            value={channel.priority}
                            onSave={(v) => inlineUpdateMutation.mutate({ id: channel.id, data: { priority: v } })}
                            min={0}
                            max={100}
                            suffix="P"
                          />
                          <span className="text-muted-foreground">/</span>
                          <InlineNumberEdit
                            value={channel.weight}
                            onSave={(v) => inlineUpdateMutation.mutate({ id: channel.id, data: { weight: v } })}
                            min={0}
                            max={100}
                            suffix="W"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-sm">
                          {modelCount > 0 ? `${modelCount} 个` : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-muted-foreground text-xs space-y-0.5">
                          {channel.rpmLimit > 0 && <div>RPM: {channel.rpmLimit}</div>}
                          {channel.tpmLimit > 0 && <div>TPM: {channel.tpmLimit}</div>}
                          {channel.dailyLimit > 0 && <div>日限: {channel.dailyLimit}</div>}
                          {channel.rpmLimit === 0 && channel.tpmLimit === 0 && channel.dailyLimit === 0 && (
                            <span className="text-muted-foreground">无限制</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-sm">
                          {channel.priceMultiplier}x
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={healthBadge.variant} className={healthBadge.className}>
                          {healthBadge.label}
                        </Badge>
                        {channel.consecutiveFailures > 0 && (
                          <span className="text-destructive text-xs ml-1">
                            ({channel.consecutiveFailures} 次失败)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-sm">
                          {formatDateTime(channel.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {/* 测试连接 */}
                          <button
                            onClick={() => handleTestChannel(channel)}
                            disabled={isTesting}
                            className={cn(
                              'p-1.5 rounded transition-colors',
                              isTesting
                                ? 'text-warning animate-pulse'
                                : 'text-muted-foreground hover:text-success hover:bg-muted'
                            )}
                            title="测试连接"
                          >
                            {isTesting ? <Loader2 size={16} className="animate-spin" /> : <TestTube size={16} />}
                          </button>

                          {/* 启用/禁用 */}
                          {canWrite && (
                            <button
                              onClick={() => handleToggleChannel(channel)}
                              disabled={toggleMutation.isPending}
                              className={cn(
                                'p-1.5 rounded transition-colors',
                                channel.isEnabled
                                  ? 'text-success hover:text-warning hover:bg-muted'
                                  : 'text-muted-foreground hover:text-success hover:bg-muted'
                              )}
                              title={channel.isEnabled ? '禁用渠道' : '启用渠道'}
                            >
                              {channel.isEnabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            </button>
                          )}

                          {/* 重置健康 */}
                          {canWrite && (channel.healthStatus === 'unhealthy' || channel.healthStatus === 'degraded') ? (
                            <button
                              onClick={() => handleResetHealth(channel.id)}
                              disabled={resetHealthMutation.isPending}
                              className="p-1.5 text-muted-foreground hover:text-blue-400 hover:bg-muted rounded transition-colors"
                              title="重置健康状态"
                            >
                              <Heart size={16} />
                            </button>
                          ) : null}

                          {/* 复制渠道 */}
                          {canWrite && (
                            <button
                              onClick={() => handleDuplicate(channel)}
                              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                              title="复制渠道"
                            >
                              <Copy size={16} />
                            </button>
                          )}

                          {/* 编辑 */}
                          {canWrite && (
                            <button
                              onClick={() => handleOpenEdit(channel)}
                              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                              title="编辑渠道"
                            >
                              <Edit2 size={16} />
                            </button>
                          )}

                          {/* 删除 */}
                          {canWrite && (
                            <button
                              onClick={() => setDeletingChannel(channel)}
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors"
                              title="删除渠道"
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

      {/* 创建/编辑渠道对话框 */}
      <ChannelForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingChannel(null)
          setDuplicateSource(null)
        }}
        onSuccess={handleFormSuccess}
        channel={editingChannel}
        duplicateFrom={duplicateSource}
      />

      {/* 删除确认对话框 */}
      {deletingChannel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeletingChannel(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-card rounded-xl border border-border p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert size={20} className="text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">确认删除</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              确定要删除渠道 <span className="text-foreground font-medium">「{deletingChannel.name}」</span> 吗？此操作不可恢复。
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setDeletingChannel(null)}
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

      {/* 测试渠道对话框 */}
      {testDialogChannel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { if (!testMutation.isPending) setTestDialogChannel(null) }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-card rounded-xl border border-border p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                测试渠道: {testDialogChannel.name}
              </h3>
              <button
                onClick={() => { if (!testMutation.isPending) setTestDialogChannel(null) }}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              基础测试检查 API 连通性，对话测试会发送一条消息验证模型可用性。
            </p>

            {/* 模型选择 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-1.5">
                测试模型
              </label>
              {(() => {
                const models = Object.keys(testDialogChannel.modelMapping ?? {})
                if (models.length > 0) {
                  return (
                    <>
                      <select
                        value={testModel}
                        onChange={(e) => setTestModel(e.target.value)}
                        disabled={testMutation.isPending}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {models.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        从渠道已配置的 {models.length} 个模型中选择
                      </p>
                    </>
                  )
                }
                return (
                  <>
                    <Input
                      placeholder="例如: claude-3-5-sonnet-20241022"
                      value={testModel}
                      onChange={(e) => setTestModel(e.target.value)}
                      disabled={testMutation.isPending}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleRunTest(testModel)
                        }
                      }}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      该渠道未配置模型映射，请手动输入模型名称
                    </p>
                  </>
                )
              })()}
            </div>

            {/* 测试结果 */}
            {testResult && (
              <div className={cn(
                'mb-4 p-3 rounded-lg border text-sm',
                testResult.success
                  ? 'bg-success/5 border-success/20 text-success'
                  : 'bg-destructive/5 border-destructive/20 text-destructive'
              )}>
                <p className="font-medium">
                  {testResult.success ? '测试通过' : '测试失败'}
                </p>
                {testResult.message && (
                  <p className="mt-1 text-xs opacity-80">{testResult.message}</p>
                )}
                {testResult.latencyMs != null && (
                  <p className="mt-1 text-xs opacity-80">延迟: {testResult.latencyMs}ms</p>
                )}
                {testResult.model && (
                  <p className="mt-1 text-xs opacity-80">模型: {testResult.model}</p>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleRunTest(testModel || undefined)}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending && !testModel.trim() && (
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                )}
                <TestTube size={16} className="mr-1.5" />
                基础测试
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleRunTest(testModel)}
                disabled={testMutation.isPending || !testModel.trim()}
              >
                {testMutation.isPending && testModel.trim() && (
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                )}
                <MessageSquare size={16} className="mr-1.5" />
                对话测试
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
