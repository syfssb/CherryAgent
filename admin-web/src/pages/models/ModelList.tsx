import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Cpu,
  TrendingUp,
  DollarSign,
  Layers,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Loader2,
  ShieldAlert,
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
import { cn, formatNumber } from '@/lib/utils'
import {
  modelsService,
  type ModelDetail,
  type ModelFilters,
} from '@/services/models'
import ModelForm from './ModelForm'
import { useProviders } from '@/constants/providers'
import { useAdminStore } from '@/store/useAdminStore'

// ============================================================
// 常量
// ============================================================

const PAGE_SIZE = 20

/**
 * 状态筛选选项
 * 后端 isEnabled 字段：true = 已启用, false = 已禁用
 */
const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'true', label: '已启用' },
  { value: 'false', label: '已禁用' },
]

// ============================================================
// 辅助函数
// ============================================================

/**
 * 格式化价格（每百万 Token 的价格，单位：分 -> 元/MTok）
 * 后端存储的是整数分，前端展示转为元
 */
function formatCreditsPerMtok(credits: number): string {
  if (credits === 0) return '免费'
  if (credits < 0.01) return `${credits} 积分`
  if (credits < 1) return `${credits.toFixed(2)} 积分`
  if (credits < 10) return `${credits.toFixed(1)} 积分`
  return `${Math.round(credits)} 积分`
}

/**
 * 从 model 中获取积分价格（优先 creditsPricing，fallback 到 pricing）
 */
function getCredits(model: ModelDetail) {
  const c = model.creditsPricing
  const p = model.pricing
  return {
    input: c?.inputCreditsPerMtok || p.inputPricePerMtok || 0,
    output: c?.outputCreditsPerMtok || p.outputPricePerMtok || 0,
    cacheRead: c?.cacheReadCreditsPerMtok || p.cacheReadPricePerMtok || 0,
    cacheWrite: c?.cacheWriteCreditsPerMtok || p.cacheWritePricePerMtok || 0,
  }
}

/**
 * 格式化 Token 数量
 */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(0)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`
  }
  return tokens.toString()
}

// ============================================================
// 组件
// ============================================================

export default function ModelListPage() {
  const queryClient = useQueryClient()
  const { filterOptions, getProviderLabel } = useProviders()
  const { hasPermission } = useAdminStore()
  const canWrite = hasPermission('models:write')

  // 筛选状态
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  // 批量选择状态
  const [selectedModels, setSelectedModels] = useState<string[]>([])

  // 表单对话框状态
  const [formOpen, setFormOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelDetail | null>(null)

  // 构建筛选参数
  const buildFilters = useCallback((): ModelFilters => {
    const filters: ModelFilters = {
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
      filters.isEnabled = statusFilter as 'true' | 'false'
    }
    return filters
  }, [page, search, providerFilter, statusFilter])

  // 查询模型列表
  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['models', page, search, statusFilter, providerFilter],
    queryFn: () => modelsService.getModels(buildFilters()),
  })

  const models = useMemo(() => response?.data?.models ?? [], [response?.data?.models])
  const summary = response?.data?.summary
  const meta = response?.meta
  const total = meta?.total ?? 0
  const totalPages = meta
    ? Math.max(1, Math.ceil(total / (meta.limit ?? PAGE_SIZE)))
    : 1

  // 启用/禁用模型
  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      modelsService.toggleModel(id, isEnabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
    onError: (err: Error) => {
      alert(`操作失败: ${err.message}`)
    },
  })

  const toggleHiddenMutation = useMutation({
    mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) =>
      modelsService.updateModel(id, { isHidden }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
    onError: (err: Error) => {
      alert(`操作失败: ${err.message}`)
    },
  })

  // 批量更新模型状态
  const batchUpdateMutation = useMutation({
    mutationFn: ({ ids, isEnabled }: { ids: string[]; isEnabled: boolean }) =>
      modelsService.batchUpdateModels({ ids, updates: { isEnabled } }),
    onSuccess: (res) => {
      const msg = res.data?.message ?? '批量更新成功'
      alert(msg)
      setSelectedModels([])
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
    onError: (err: Error) => {
      alert(`批量操作失败: ${err.message}`)
    },
  })

  // 删除模型
  const deleteMutation = useMutation({
    mutationFn: (id: string) => modelsService.deleteModel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
    onError: (err: Error) => {
      alert(`删除失败: ${err.message}`)
    },
  })

  // 批量删除模型
  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => modelsService.batchDeleteModels(ids),
    onSuccess: (res) => {
      const msg = res.data?.message ?? '批量删除成功'
      alert(msg)
      setSelectedModels([])
      setShowBatchDeleteConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['models'] })
    },
    onError: (err: Error) => {
      alert(`批量删除失败: ${err.message}`)
    },
  })

  // 批量删除确认对话框状态
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)

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

  const handleToggleModel = useCallback(
    (model: ModelDetail) => {
      toggleMutation.mutate({ id: model.id, isEnabled: !model.isEnabled })
    },
    [toggleMutation]
  )

  const handleBatchEnable = useCallback(() => {
    if (selectedModels.length === 0) return
    batchUpdateMutation.mutate({ ids: selectedModels, isEnabled: true })
  }, [selectedModels, batchUpdateMutation])

  const handleBatchDisable = useCallback(() => {
    if (selectedModels.length === 0) return
    batchUpdateMutation.mutate({ ids: selectedModels, isEnabled: false })
  }, [selectedModels, batchUpdateMutation])

  const handleBatchDelete = useCallback(() => {
    if (selectedModels.length === 0) return
    setShowBatchDeleteConfirm(true)
  }, [selectedModels, setShowBatchDeleteConfirm])

  const handleBatchDeleteConfirm = useCallback(() => {
    if (selectedModels.length === 0) return
    batchDeleteMutation.mutate(selectedModels)
  }, [selectedModels, batchDeleteMutation])

  const handleToggleModelHidden = useCallback(
    (model: ModelDetail) => {
      toggleHiddenMutation.mutate({ id: model.id, isHidden: !model.isHidden })
    },
    [toggleHiddenMutation]
  )

  // 全选/取消全选
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedModels(models.map((m) => m.id))
      } else {
        setSelectedModels([])
      }
    },
    [models]
  )

  // 单选
  const handleSelectModel = useCallback(
    (modelId: string, checked: boolean) => {
      if (checked) {
        setSelectedModels((prev) => [...prev, modelId])
      } else {
        setSelectedModels((prev) => prev.filter((id) => id !== modelId))
      }
    },
    []
  )

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">模型管理</h1>
          <p className="text-muted-foreground mt-1">管理和配置 AI 模型</p>
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
              onClick={() => {
                setEditingModel(null)
                setFormOpen(true)
              }}
            >
              <Plus size={16} className="mr-1.5" />
              添加模型
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
                <p className="text-muted-foreground text-sm">总模型数</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {summary?.totalModels ?? '-'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Cpu size={24} className="text-primary" />
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
                  {summary?.enabledModels ?? '-'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp size={24} className="text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">已禁用</p>
                <p className="text-2xl font-bold text-muted-foreground mt-1">
                  {summary
                    ? summary.totalModels - summary.enabledModels
                    : '-'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <DollarSign size={24} className="text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">提供商数</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {summary?.providers ?? '-'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Layers size={24} className="text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* 搜索框 */}
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索模型 ID 或显示名称..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch()
                }}
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

          {/* 展开的筛选器 */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 状态筛选 */}
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

              {/* 提供商筛选 */}
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

      {/* 批量操作栏 */}
      {canWrite && selectedModels.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                已选择 <span className="text-primary font-medium">{selectedModels.length}</span> 个模型
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleBatchEnable}
                  disabled={batchUpdateMutation.isPending}
                >
                  {batchUpdateMutation.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                  <ToggleRight size={14} className="mr-1.5" />
                  批量启用
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleBatchDisable}
                  disabled={batchUpdateMutation.isPending}
                >
                  {batchUpdateMutation.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                  <ToggleLeft size={14} className="mr-1.5" />
                  批量禁用
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBatchDelete}
                  disabled={batchDeleteMutation.isPending}
                >
                  {batchDeleteMutation.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                  <Trash2 size={14} className="mr-1.5" />
                  批量删除
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedModels([])}
                >
                  取消选择
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 错误提示 */}
      {isError && (
        <Card>
          <CardContent className="p-4">
            <div className="text-destructive text-sm">
              加载失败: {error instanceof Error ? error.message : '未知错误'}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 模型表格 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <SelectAllCheckbox
                    models={models}
                    selectedModels={selectedModels}
                    onSelectAll={handleSelectAll}
                  />
                </TableHead>
                <TableHead>模型信息</TableHead>
                <TableHead>提供商</TableHead>
                <TableHead>输入价格</TableHead>
                <TableHead>输出价格</TableHead>
                <TableHead>缓存价格</TableHead>
                <TableHead>上下文长度</TableHead>
                <TableHead>排序</TableHead>
                <TableHead>7日请求</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>用户侧可见</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : models.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center text-muted-foreground">
                    没有找到匹配的模型
                  </TableCell>
                </TableRow>
              ) : (
                models.map((model) => (
                  <TableRow
                    key={model.id}
                    className={cn(
                      selectedModels.includes(model.id) && 'bg-primary/5'
                    )}
                  >
                    {/* 选择框 */}
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(model.id)}
                        onChange={(e) => handleSelectModel(model.id, e.target.checked)}
                        className="w-4 h-4 rounded border-border bg-card text-primary focus:ring-primary"
                      />
                    </TableCell>

                    {/* 模型信息 */}
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-foreground font-medium">{model.displayName}</p>
                          {model.isHidden && (
                            <Badge variant="secondary" className="text-xs">
                              已隐藏
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm font-mono">{model.id}</p>
                      </div>
                    </TableCell>

                    {/* 提供商 */}
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {getProviderLabel(model.provider)}
                      </Badge>
                    </TableCell>

                    {/* 输入价格 */}
                    <TableCell>
                      {(() => { const c = getCredits(model); return (<>
                      <span className="text-muted-foreground text-sm">
                        {formatCreditsPerMtok(c.input)}
                      </span>
                      {c.input > 0 && (
                        <span className="text-muted-foreground text-xs ml-1">/MTok</span>
                      )}
                      </>); })()}
                    </TableCell>

                    {/* 输出价格 */}
                    <TableCell>
                      {(() => { const c = getCredits(model); return (<>
                      <span className="text-muted-foreground text-sm">
                        {formatCreditsPerMtok(c.output)}
                      </span>
                      {c.output > 0 && (
                        <span className="text-muted-foreground text-xs ml-1">/MTok</span>
                      )}
                      </>); })()}
                    </TableCell>

                    {/* 缓存价格 */}
                    <TableCell>
                      {(() => { const c = getCredits(model); return (
                      <div className="text-muted-foreground text-xs space-y-0.5">
                        {c.cacheRead > 0 && (
                          <div>读: {formatCreditsPerMtok(c.cacheRead)}</div>
                        )}
                        {c.cacheWrite > 0 && (
                          <div>写: {formatCreditsPerMtok(c.cacheWrite)}</div>
                        )}
                        {c.cacheRead === 0 && c.cacheWrite === 0 && (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                      ); })()}
                    </TableCell>

                    {/* 上下文长度 */}
                    <TableCell>
                      <div className="text-muted-foreground text-sm">
                        <span>{formatTokenCount(model.limits.maxContextLength)}</span>
                        <p className="text-muted-foreground text-xs">
                          出: {formatTokenCount(model.limits.maxTokens)}
                        </p>
                      </div>
                    </TableCell>

                    {/* 排序 */}
                    <TableCell>
                      <span className="text-muted-foreground text-sm">{model.sortOrder}</span>
                    </TableCell>

                    {/* 7日请求数 */}
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {model.usage
                          ? formatNumber(model.usage.last7Days.requestCount)
                          : '-'}
                      </span>
                      {model.usage && model.usage.last7Days.totalTokens > 0 && (
                        <p className="text-muted-foreground text-xs">
                          {formatTokenCount(model.usage.last7Days.totalTokens)} tokens
                        </p>
                      )}
                    </TableCell>

                    {/* 状态 */}
                    <TableCell>
                      {model.isEnabled ? (
                        <Badge variant="outline" className="border-success/30 text-success bg-success/5">
                          已启用
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          已禁用
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      {model.isHidden ? (
                        <Badge variant="secondary">
                          用户不可选
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5">
                          用户可选
                        </Badge>
                      )}
                    </TableCell>

                    {/* 操作 */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {canWrite && (
                          <>
                            {/* 启用/禁用 */}
                            <button
                              onClick={() => handleToggleModel(model)}
                              disabled={toggleMutation.isPending}
                              className={cn(
                                'p-1.5 rounded transition-colors',
                                model.isEnabled
                                  ? 'text-success hover:text-warning hover:bg-muted'
                                  : 'text-muted-foreground hover:text-success hover:bg-muted'
                              )}
                              title={model.isEnabled ? '禁用模型' : '启用模型'}
                            >
                              {toggleMutation.isPending ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : model.isEnabled ? (
                                <ToggleRight size={16} />
                              ) : (
                                <ToggleLeft size={16} />
                              )}
                            </button>

                            <button
                              onClick={() => handleToggleModelHidden(model)}
                              disabled={toggleHiddenMutation.isPending}
                              className={cn(
                                'p-1.5 rounded transition-colors',
                                model.isHidden
                                  ? 'text-muted-foreground hover:text-primary hover:bg-muted'
                                  : 'text-primary hover:text-warning hover:bg-muted'
                              )}
                              title={model.isHidden ? '取消隐藏' : '隐藏模型'}
                            >
                              {toggleHiddenMutation.isPending ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : model.isHidden ? (
                                <Eye size={16} />
                              ) : (
                                <EyeOff size={16} />
                              )}
                            </button>

                            {/* 编辑 */}
                            <button
                              onClick={() => {
                                setEditingModel(model)
                                setFormOpen(true)
                              }}
                              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                              title="编辑模型"
                            >
                              <Edit2 size={16} />
                            </button>

                            {/* 删除 */}
                            <button
                              onClick={() => {
                                if (confirm(`确定要删除模型「${model.displayName}」(${model.id}) 吗？此操作不可撤销。`)) {
                                  deleteMutation.mutate(model.id)
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                              title="删除模型"
                            >
                              {deleteMutation.isPending ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
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
      {/* 创建/编辑模型对话框 */}
      <ModelForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingModel(null)
        }}
        onSuccess={() => {
          setFormOpen(false)
          setEditingModel(null)
          queryClient.invalidateQueries({ queryKey: ['models'] })
        }}
        model={editingModel}
      />

      {/* 批量删除确认对话框 */}
      {showBatchDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { if (!batchDeleteMutation.isPending) setShowBatchDeleteConfirm(false) }}
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
              <h3 className="text-lg font-semibold text-foreground">确认批量删除</h3>
            </div>
            <p className="text-muted-foreground mb-3">
              确定要删除选中的 <span className="text-foreground font-medium">{selectedModels.length}</span> 个模型吗？此操作不可恢复。
            </p>
            {(() => {
              const selectedDetails = models.filter((m) => selectedModels.includes(m.id))
              const displayCount = Math.min(selectedDetails.length, 5)
              const remaining = selectedDetails.length - displayCount
              return selectedDetails.length > 0 ? (
                <div className="mb-6 max-h-32 overflow-y-auto rounded-lg bg-muted/50 p-3 text-sm">
                  {selectedDetails.slice(0, displayCount).map((m) => (
                    <div key={m.id} className="text-muted-foreground py-0.5">
                      <span className="text-foreground font-medium">{m.displayName}</span>
                      <span className="text-muted-foreground ml-1.5 font-mono text-xs">({m.id})</span>
                    </div>
                  ))}
                  {remaining > 0 && (
                    <div className="text-muted-foreground py-0.5 text-xs">
                      ...还有 {remaining} 个模型
                    </div>
                  )}
                </div>
              ) : null
            })()}
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
                onClick={handleBatchDeleteConfirm}
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

/**
 * 全选 checkbox 组件，支持 indeterminate 状态
 */
function SelectAllCheckbox({
  models,
  selectedModels,
  onSelectAll,
}: {
  models: ModelDetail[]
  selectedModels: string[]
  onSelectAll: (checked: boolean) => void
}) {
  const checkboxRef = useRef<HTMLInputElement>(null)
  const allSelected = selectedModels.length === models.length && models.length > 0
  const someSelected = selectedModels.length > 0 && selectedModels.length < models.length

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={allSelected}
      onChange={(e) => onSelectAll(e.target.checked)}
      className="w-4 h-4 rounded border-border bg-card text-primary focus:ring-primary"
    />
  )
}
