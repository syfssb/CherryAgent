import { useState, useCallback } from 'react'
import { useAdminStore } from '@/store/useAdminStore'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Activity,
  Zap,
  TrendingUp,
  AlertCircle,
  Loader2,
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
  formatCurrency,
  formatDateTime,
  formatNumber,
  exportToCSV,
} from '@/lib/utils'
import {
  financeService,
  type UsageFilters,
  type UsageRecordDTO,
} from '@/services/finance'
import { useProviders } from '@/constants/providers'

// ============================================================
// 常量
// ============================================================

const PAGE_SIZE = 20

const COL_COUNT = 14

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'success', label: '成功' },
  { value: 'error', label: '失败' },
]

// ============================================================
// 辅助函数
// ============================================================

function getStatusLabel(status: string): string {
  switch (status) {
    case 'success':
      return '成功'
    case 'error':
      return '失败'
    default:
      return status
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'success':
      return 'border-success/30 text-success bg-success/5'
    case 'error':
      return 'border-destructive/30 text-destructive bg-destructive/5'
    default:
      return ''
  }
}

function formatCost(cost: string | null, creditsConsumed?: string | null): string {
  // 优先使用 creditsConsumed
  const raw = creditsConsumed && creditsConsumed !== '0' ? creditsConsumed : cost;
  if (raw === null || raw === undefined) {
    return '0.00 积分'
  }
  const num = parseFloat(raw)
  if (isNaN(num)) {
    return '0.00 积分'
  }
  return formatCurrency(num)
}

function parseCost(cost: string | null): number {
  if (cost === null || cost === undefined) {
    return 0
  }
  const num = parseFloat(cost)
  return isNaN(num) ? 0 : num
}

// ============================================================
// 组件
// ============================================================

export default function UsageRecordsPage() {
  const { hasPermission } = useAdminStore()
  const { filterOptions, getProviderLabel } = useProviders()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  const buildFilters = useCallback((): UsageFilters => {
    const filters: UsageFilters = {
      page,
      limit: PAGE_SIZE,
    }

    if (search.trim()) {
      filters.model = search.trim()
    }

    if (providerFilter) {
      filters.provider = providerFilter
    }

    if (statusFilter) {
      filters.status = statusFilter as UsageFilters['status']
    }

    if (dateFrom) {
      filters.startDate = dateFrom
    }

    if (dateTo) {
      filters.endDate = dateTo
    }

    return filters
  }, [page, search, providerFilter, statusFilter, dateFrom, dateTo])

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['finance-usage', page, search, statusFilter, providerFilter, dateFrom, dateTo],
    queryFn: () => financeService.getUsageRecords(buildFilters()),
  })

  const records: UsageRecordDTO[] = response?.data?.usage ?? []
  const summary = response?.data?.summary
  const meta = response?.meta
  const total = meta?.total ?? 0
  const totalPages = meta
    ? Math.max(1, Math.ceil(total / (meta.limit ?? PAGE_SIZE)))
    : 1

  const handleExport = useCallback(() => {
    if (records.length === 0) {
      return
    }

    const exportData = records.map((record) => ({
      ID: record.id,
      '用户ID': record.userId ?? '',
      '用户邮箱': record.userEmail ?? '',
      '请求ID': record.requestId ?? '',
      '模型': record.model,
      '供应商': getProviderLabel(record.provider),
      '输入Tokens': record.promptTokens,
      '输出Tokens': record.completionTokens,
      '总Tokens': record.totalTokens,
      '缓存读取Tokens': record.cacheReadTokens ?? 0,
      '缓存写入Tokens': record.cacheWriteTokens ?? 0,
      '费用': parseCost(record.cost),
      '期卡消耗': parseCost(record.quotaUsed ?? null),
      '耗时(ms)': record.latencyMs ?? '',
      '状态': getStatusLabel(record.status),
      '错误信息': record.errorMessage ?? '',
      '创建时间': formatDateTime(record.createdAt),
    }))

    exportToCSV(exportData, `消费明细_${formatDateTime(new Date())}.csv`)
  }, [records])

  const handleClearFilters = useCallback(() => {
    setStatusFilter('')
    setProviderFilter('')
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setPage(1)
  }, [])

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">消费明细</h1>
          <p className="text-[13px] text-muted-foreground mt-1">查看所有用户的API消费详情</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </Button>
          {hasPermission('finance:export') && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={records.length === 0}
              className="gap-1.5"
            >
              <Download size={14} />
              导出
            </Button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {isError && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle size={20} />
              <span className="flex-1 text-[13px]">
                加载消费明细失败：{error instanceof Error ? error.message : '未知错误'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
              >
                重试
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-muted-foreground">总消费</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">
                  {summary ? formatCurrency(parseFloat(summary.totalCost)) : '-'}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                <TrendingUp className="text-muted-foreground" size={18} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div>
              <p className="text-[13px] text-muted-foreground">请求次数</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">
                {summary ? formatNumber(summary.totalRequests) : '-'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-muted-foreground">总Tokens</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">
                  {summary ? formatNumber(summary.totalTokens) : '-'}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                <Zap className="text-muted-foreground" size={18} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div>
              <p className="text-[13px] text-muted-foreground">失败次数</p>
              <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">
                {summary ? formatNumber(summary.errorCount) : '-'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-muted-foreground">成功率</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">
                  {summary ? `${summary.successRate}%` : '-'}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                <Activity className="text-muted-foreground" size={18} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索模型名称..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9"
              />
            </div>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1.5"
            >
              <Filter size={14} />
              筛选
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">
                  供应商
                </label>
                <select
                  value={providerFilter}
                  onChange={(e) => {
                    setProviderFilter(e.target.value)
                    setPage(1)
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {filterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">
                  状态
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value)
                    setPage(1)
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">
                  开始日期
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setPage(1)
                  }}
                />
              </div>

              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">
                  结束日期
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setPage(1)
                  }}
                />
              </div>

              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                  清除筛选
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 消费记录表格 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead className="text-right">输入Token</TableHead>
                  <TableHead className="text-right">输出Token</TableHead>
                  <TableHead className="text-right">总Token</TableHead>
                  <TableHead className="text-right">缓存读取</TableHead>
                  <TableHead className="text-right">缓存写入</TableHead>
                  <TableHead className="text-right">费用</TableHead>
                  <TableHead className="text-right">期卡消耗</TableHead>
                  <TableHead className="text-right">耗时</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={COL_COUNT} className="h-32 text-center">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COL_COUNT} className="h-32 text-center text-muted-foreground">
                      没有找到匹配的消费记录
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <span className="text-muted-foreground font-mono text-[13px]">
                          {record.id.slice(0, 8)}...
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-foreground font-medium text-[13px]">
                            {record.userEmail ?? '-'}
                          </p>
                          {record.userId && (
                            <p className="text-muted-foreground text-[13px]">
                              {record.userId.slice(0, 8)}...
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-foreground text-[13px]">
                          {record.model}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {getProviderLabel(record.provider)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground text-[13px] tabular-nums">
                          {formatNumber(record.promptTokens)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground text-[13px] tabular-nums">
                          {formatNumber(record.completionTokens)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-foreground font-medium text-[13px] tabular-nums">
                          {formatNumber(record.totalTokens)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground text-[13px] tabular-nums">
                          {formatNumber(record.cacheReadTokens ?? 0)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground text-[13px] tabular-nums">
                          {formatNumber(record.cacheWriteTokens ?? 0)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-foreground font-medium tabular-nums">
                          {formatCost(record.cost, record.creditsConsumed)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground text-[13px] tabular-nums">
                          {record.quotaUsed && parseFloat(record.quotaUsed) > 0
                            ? formatCurrency(parseFloat(record.quotaUsed))
                            : '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground text-[13px] tabular-nums">
                          {record.latencyMs !== null ? `${record.latencyMs}ms` : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusBadgeClass(record.status)}>
                          {getStatusLabel(record.status)}
                        </Badge>
                        {record.errorMessage && (
                          <p className="text-destructive text-[11px] mt-0.5 max-w-[120px] truncate" title={record.errorMessage}>
                            {record.errorMessage}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-[13px] whitespace-nowrap">
                          {formatDateTime(record.createdAt)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <div className="text-[13px] text-muted-foreground tabular-nums">
                共 {total} 条记录，第 {page}/{totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="gap-1.5"
                >
                  <ChevronLeft size={14} />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="gap-1.5"
                >
                  下一页
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
