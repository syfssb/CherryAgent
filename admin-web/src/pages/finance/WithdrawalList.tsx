import { useState, useCallback } from 'react'
import { useAdminStore } from '@/store/useAdminStore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Banknote,
  Clock,
  DollarSign,
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
import { formatCurrency, formatDateTime } from '@/lib/utils'
import {
  referralService,
  type WithdrawalFilters,
  type WithdrawalDTO,
} from '@/services/referrals'

const PAGE_SIZE = 20

const COL_COUNT_WITH_ACTIONS = 9
const COL_COUNT_WITHOUT_ACTIONS = 8

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'paid', label: '已打款' },
]

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return '待审核'
    case 'approved':
      return '已通过'
    case 'rejected':
      return '已拒绝'
    case 'paid':
      return '已打款'
    default:
      return status
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'border-warning/30 text-warning bg-warning/5'
    case 'approved':
      return 'border-blue-500/30 text-blue-500 bg-blue-500/5'
    case 'rejected':
      return 'border-destructive/30 text-destructive bg-destructive/5'
    case 'paid':
      return 'border-success/30 text-success bg-success/5'
    default:
      return ''
  }
}

function parseAmount(amount: string | number): number {
  if (typeof amount === 'number') return amount
  const parsed = parseFloat(amount)
  return isNaN(parsed) ? 0 : parsed
}

export default function WithdrawalListPage() {
  const { hasPermission } = useAdminStore()
  const canWrite = hasPermission('finance:write')
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState<string | null>(null)

  const showMessageFn = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const buildFilters = useCallback((): WithdrawalFilters => {
    const filters: WithdrawalFilters = {
      page,
      limit: PAGE_SIZE,
    }

    if (statusFilter) {
      filters.status = statusFilter as WithdrawalFilters['status']
    }

    if (search.trim()) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (uuidRegex.test(search.trim())) {
        filters.userId = search.trim()
      }
    }

    return filters
  }, [page, statusFilter, search])

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['finance-withdrawals', page, statusFilter, search],
    queryFn: () => referralService.getWithdrawals(buildFilters()),
  })

  const processMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject' | 'pay'; note?: string }) =>
      referralService.processWithdrawal(id, action, note),
    onSuccess: (_data, variables) => {
      const actionLabel = variables.action === 'approve' ? '通过' : variables.action === 'reject' ? '拒绝' : '打款'
      showMessageFn('success', `提现申请已${actionLabel}`)
      queryClient.invalidateQueries({ queryKey: ['finance-withdrawals'] })
      setProcessingId(null)
      setShowRejectDialog(null)
      setRejectNote('')
    },
    onError: (err) => {
      showMessageFn('error', err instanceof Error ? err.message : '操作失败')
      setProcessingId(null)
    },
  })

  const withdrawals: WithdrawalDTO[] = response?.data?.withdrawals ?? []
  const meta = response?.meta
  const total = meta?.total ?? 0
  const totalPages = meta
    ? Math.max(1, Math.ceil(total / (meta.limit ?? PAGE_SIZE)))
    : 1

  const pendingCount = withdrawals.filter((w) => w.status === 'pending').length
  const totalAmount = withdrawals.reduce((sum, w) => sum + parseAmount(w.amount), 0)

  const handleSearch = useCallback(() => {
    setPage(1)
  }, [])

  const handleClearFilters = useCallback(() => {
    setStatusFilter('')
    setSearch('')
    setPage(1)
  }, [])

  const handleApprove = (id: string) => {
    setProcessingId(id)
    processMutation.mutate({ id, action: 'approve' })
  }

  const handleReject = (id: string) => {
    setShowRejectDialog(id)
  }

  const confirmReject = () => {
    if (!showRejectDialog) return
    setProcessingId(showRejectDialog)
    processMutation.mutate({
      id: showRejectDialog,
      action: 'reject',
      note: rejectNote || undefined,
    })
  }

  const handlePay = (id: string) => {
    setProcessingId(id)
    processMutation.mutate({ id, action: 'pay' })
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">提现管理</h1>
          <p className="text-[13px] text-muted-foreground mt-1">审核和管理用户的提现申请</p>
        </div>
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
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`flex items-center gap-3 p-4 rounded-lg text-[13px] ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-destructive/10 border border-destructive/20 text-destructive'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 错误提示 */}
      {isError && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle size={20} />
              <div className="flex-1">
                <p className="font-medium text-[13px]">加载失败</p>
                <p className="text-[13px] text-destructive/80 mt-0.5">
                  {error instanceof Error ? error.message : '请求提现记录时发生错误，请稍后重试'}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-muted-foreground">总记录数</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">{total}</p>
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
                <p className="text-[13px] text-muted-foreground">待审核</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">{pendingCount}</p>
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
                <p className="text-[13px] text-muted-foreground">当前页总金额</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                <Banknote className="text-muted-foreground" size={18} />
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
                <label className="block text-[13px] text-muted-foreground mb-1.5">状态</label>
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

              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                  清除筛选
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 拒绝对话框 */}
      {canWrite && showRejectDialog && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <p className="text-foreground font-medium text-[13px]">拒绝提现申请</p>
              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">
                  拒绝原因（可选）
                </label>
                <Input
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="请输入拒绝原因..."
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={confirmReject}
                  disabled={processingId === showRejectDialog}
                  className="gap-1.5"
                >
                  {processingId === showRejectDialog && <Loader2 size={14} className="animate-spin" />}
                  <XCircle size={14} />
                  确认拒绝
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowRejectDialog(null)
                    setRejectNote('')
                  }}
                >
                  取消
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 提现记录表格 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>提现金额</TableHead>
                <TableHead>收款方式</TableHead>
                <TableHead>收款账号</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>申请时间</TableHead>
                <TableHead>处理时间</TableHead>
                <TableHead>备注</TableHead>
                {canWrite && <TableHead>操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={canWrite ? COL_COUNT_WITH_ACTIONS : COL_COUNT_WITHOUT_ACTIONS} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : withdrawals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canWrite ? COL_COUNT_WITH_ACTIONS : COL_COUNT_WITHOUT_ACTIONS} className="h-32 text-center text-muted-foreground">
                    没有找到匹配的提现记录
                  </TableCell>
                </TableRow>
              ) : (
                withdrawals.map((record) => (
                  <TableRow key={record.id}>
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
                        {formatCurrency(parseAmount(record.amount))}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-[13px]">
                        {record.paymentMethod ?? '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-[13px] font-mono">
                        {record.paymentAccount ?? '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusBadgeClass(record.status)}>
                        {getStatusLabel(record.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-[13px] whitespace-nowrap">
                        {formatDateTime(record.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-[13px] whitespace-nowrap">
                        {record.processedAt ? formatDateTime(record.processedAt) : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-[13px]">
                        {record.note ?? '-'}
                      </span>
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {record.status === 'pending' && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleApprove(record.id)}
                                disabled={processingId === record.id}
                                className="gap-1.5"
                              >
                                {processingId === record.id && <Loader2 size={14} className="animate-spin" />}
                                <CheckCircle2 size={14} />
                                通过
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleReject(record.id)}
                                disabled={processingId === record.id}
                                className="gap-1.5"
                              >
                                <XCircle size={14} />
                                拒绝
                              </Button>
                            </>
                          )}
                          {record.status === 'approved' && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handlePay(record.id)}
                              disabled={processingId === record.id}
                              className="gap-1.5"
                            >
                              {processingId === record.id && <Loader2 size={14} className="animate-spin" />}
                              <Banknote size={14} />
                              确认打款
                            </Button>
                          )}
                          {(record.status === 'paid' || record.status === 'rejected') && (
                            <span className="text-muted-foreground text-[13px]">-</span>
                          )}
                        </div>
                      </TableCell>
                    )}
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
