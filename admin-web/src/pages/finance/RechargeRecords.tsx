import { useState, useCallback, useMemo } from 'react'
import { useAdminStore } from '@/store/useAdminStore'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Calendar,
  DollarSign,
  AlertCircle,
  Clock,
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
import { formatDateTime, exportToCSV } from '@/lib/utils'
import {
  financeService,
  type RechargeFilters,
  type RechargeRecordDTO,
} from '@/services/finance'

// ============================================================
// 常量
// ============================================================

const PAGE_SIZE = 20

const COL_COUNT = 9

/**
 * 支付方式筛选选项 - 匹配后端 paymentMethod 枚举
 */
const methodOptions = [
  { value: '', label: '全部方式' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'xunhupay', label: '虎皮椒' },
]

/**
 * 状态筛选选项 - 匹配后端 status 枚举
 */
const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '处理中' },
  { value: 'succeeded', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'refunded', label: '已退款' },
]

// ============================================================
// 辅助函数
// ============================================================

function getPaymentMethodLabel(method: string): string {
  switch (method) {
    case 'stripe':
      return 'Stripe'
    case 'xunhupay':
      return '虎皮椒'
    default:
      return method
  }
}

function getRechargeStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return '处理中'
    case 'succeeded':
      return '已完成'
    case 'failed':
      return '失败'
    case 'refunded':
      return '已退款'
    default:
      return status
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'border-success/30 text-success bg-success/5'
    case 'pending':
      return 'border-warning/30 text-warning bg-warning/5'
    case 'failed':
      return 'border-destructive/30 text-destructive bg-destructive/5'
    case 'refunded':
      return 'border-blue-500/30 text-blue-500 bg-blue-500/5'
    default:
      return ''
  }
}

function getTransactionId(record: RechargeRecordDTO): string {
  return record.stripePaymentIntentId || record.xunhupayOrderId || '-'
}

function parseAmount(amount: string | number): number {
  if (typeof amount === 'number') return amount
  const parsed = parseFloat(amount)
  return isNaN(parsed) ? 0 : parsed
}

function formatRechargeAmount(amount: number, currency: string = 'CNY'): string {
  if (!Number.isFinite(amount)) {
    return currency === 'CNY' ? '¥0.00' : `0.00 ${currency}`
  }

  const normalized = (currency || '').toUpperCase()
  if (normalized === 'CNY') {
    return `¥${amount.toFixed(2)}`
  }

  return `${amount.toFixed(2)} ${normalized || 'CNY'}`
}

// ============================================================
// 组件
// ============================================================

export default function RechargeRecordsPage() {
  const { hasPermission } = useAdminStore()
  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [amountFrom, setAmountFrom] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  const buildFilters = useCallback((): RechargeFilters => {
    const filters: RechargeFilters = {
      page,
      limit: PAGE_SIZE,
    }

    if (statusFilter) {
      filters.status = statusFilter as RechargeFilters['status']
    }

    if (methodFilter) {
      filters.paymentMethod = methodFilter as RechargeFilters['paymentMethod']
    }

    if (dateFrom) {
      filters.startDate = new Date(dateFrom).toISOString()
    }

    if (dateTo) {
      const endDate = new Date(dateTo)
      endDate.setHours(23, 59, 59, 999)
      filters.endDate = endDate.toISOString()
    }

    if (amountFrom) {
      const minAmount = parseFloat(amountFrom)
      if (!isNaN(minAmount)) {
        filters.minAmount = minAmount
      }
    }

    if (amountTo) {
      const maxAmount = parseFloat(amountTo)
      if (!isNaN(maxAmount)) {
        filters.maxAmount = maxAmount
      }
    }

    if (search.trim()) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (uuidRegex.test(search.trim())) {
        filters.userId = search.trim()
      }
    }

    return filters
  }, [page, statusFilter, methodFilter, dateFrom, dateTo, amountFrom, amountTo, search])

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['finance-recharges', page, statusFilter, methodFilter, dateFrom, dateTo, amountFrom, amountTo, search],
    queryFn: () => financeService.getRechargeRecords(buildFilters()),
  })

  const recharges = useMemo(() => response?.data?.recharges ?? [], [response?.data?.recharges])
  const summary = response?.data?.summary
  const meta = response?.meta
  const total = meta?.total ?? 0
  const totalPages = meta
    ? Math.max(1, Math.ceil(total / (meta.limit ?? PAGE_SIZE)))
    : 1

  const handleSearch = useCallback(() => {
    setPage(1)
  }, [])

  const handleClearFilters = useCallback(() => {
    setMethodFilter('')
    setStatusFilter('')
    setAmountFrom('')
    setAmountTo('')
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setPage(1)
  }, [])

  const handleExport = useCallback(() => {
    if (recharges.length === 0) {
      return
    }

    const exportData = recharges.map((record) => ({
      '充值ID': record.id,
      '用户ID': record.userId,
      '用户邮箱': record.userEmail ?? '',
      '用户名': record.userName ?? '',
      '充值金额': parseAmount(record.amount),
      '货币': record.currency,
      '支付方式': getPaymentMethodLabel(record.paymentMethod),
      '状态': getRechargeStatusLabel(record.status),
      '交易单号': getTransactionId(record),
      '描述': record.description ?? '',
      '创建时间': record.createdAt ? formatDateTime(record.createdAt) : '',
      '支付时间': record.paidAt ? formatDateTime(record.paidAt) : '',
    }))

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    exportToCSV(exportData, `充值记录_${timestamp}.csv`)
  }, [recharges])

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">充值记录</h1>
          <p className="text-[13px] text-muted-foreground mt-1">查看和管理所有用户的充值记录</p>
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
              disabled={recharges.length === 0}
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
              <div className="flex-1">
                <p className="font-medium text-[13px]">加载失败</p>
                <p className="text-[13px] text-destructive/80 mt-0.5">
                  {error instanceof Error ? error.message : '请求充值记录时发生错误，请稍后重试'}
                </p>
              </div>
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-muted-foreground">成功充值总额</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">
                  {summary ? formatRechargeAmount(summary.totalSucceeded, 'CNY') : '-'}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                <DollarSign className="text-muted-foreground" size={18} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-muted-foreground">总记录数</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">
                  {summary?.totalCount ?? '-'}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                <Calendar className="text-muted-foreground" size={18} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-muted-foreground">处理中金额</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">
                  {summary ? formatRechargeAmount(summary.totalPending, 'CNY') : '-'}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                <Clock className="text-muted-foreground" size={18} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-muted-foreground">失败金额</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">
                  {summary ? formatRechargeAmount(summary.totalFailed, 'CNY') : '-'}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                <AlertCircle className="text-muted-foreground" size={18} />
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
                placeholder="搜索用户ID（UUID格式）..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch()
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
                  支付方式
                </label>
                <select
                  value={methodFilter}
                  onChange={(e) => {
                    setMethodFilter(e.target.value)
                    setPage(1)
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {methodOptions.map((option) => (
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
                  金额范围
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="最小金额"
                    value={amountFrom}
                    onChange={(e) => {
                      setAmountFrom(e.target.value)
                      setPage(1)
                    }}
                  />
                  <span className="text-muted-foreground">-</span>
                  <Input
                    type="number"
                    placeholder="最大金额"
                    value={amountTo}
                    onChange={(e) => {
                      setAmountTo(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>
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

      {/* 充值记录表格 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>充值ID</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>充值金额</TableHead>
                <TableHead>货币</TableHead>
                <TableHead>支付方式</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>交易单号</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>支付时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={COL_COUNT} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : recharges.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COL_COUNT} className="h-32 text-center text-muted-foreground">
                    没有找到匹配的充值记录
                  </TableCell>
                </TableRow>
              ) : (
                recharges.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-[13px]">
                        {record.id.slice(0, 8)}...
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-foreground font-medium text-[13px]">
                          {record.userName ?? '-'}
                        </p>
                        <p className="text-muted-foreground text-[13px]">
                          {record.userEmail ?? '-'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-foreground font-semibold tabular-nums">
                        {formatRechargeAmount(parseAmount(record.amount), record.currency)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-[13px] uppercase">
                        {record.currency}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {getPaymentMethodLabel(record.paymentMethod)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusBadgeClass(record.status)}>
                        {getRechargeStatusLabel(record.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-[13px] font-mono">
                        {getTransactionId(record) !== '-'
                          ? getTransactionId(record).slice(0, 16) + '...'
                          : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-[13px] whitespace-nowrap">
                        {formatDateTime(record.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-[13px] whitespace-nowrap">
                        {record.paidAt
                          ? formatDateTime(record.paidAt)
                          : '-'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

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
