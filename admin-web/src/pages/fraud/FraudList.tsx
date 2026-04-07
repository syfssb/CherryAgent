import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Filter,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Scan,
  Snowflake,
  Undo2,
  Eye,
  Ban,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { cn, formatDateTime, formatRelativeTime } from '@/lib/utils'
import {
  fraudService,
  type SuspiciousAccount,
  type SuspiciousFilters,
} from '@/services/fraud'

const PAGE_SIZE = 20

const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待审核' },
  { value: 'reviewed', label: '已处理' },
  { value: 'dismissed', label: '已忽略' },
]

const reasonLabels: Record<string, string> = {
  same_ip_multiple_accounts: '同 IP 多账户',
  disposable_email: '一次性邮箱',
  rapid_credit_consumption: '快速消耗积分',
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '待审核', variant: 'destructive' },
  reviewed: { label: '已处理', variant: 'default' },
  dismissed: { label: '已忽略', variant: 'secondary' },
  banned: { label: '已封禁', variant: 'destructive' },
}

function getReasonLabel(reason: string): string {
  return reasonLabels[reason] || reason
}

function getStatusBadge(status: string) {
  const config = statusConfig[status] || { label: status, variant: 'secondary' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

function getRiskScoreColor(score: number): string {
  if (score >= 30) return 'text-destructive'
  if (score >= 20) return 'text-warning'
  return 'text-muted-foreground'
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="block text-[13px] text-muted-foreground mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function DetailCell({ details, reason }: { details: unknown; reason: string }) {
  const d = details as Record<string, unknown> | null
  if (!d) return <span className="text-muted-foreground">-</span>

  if (reason === 'same_ip_multiple_accounts') {
    return (
      <div className="text-[12px] text-muted-foreground space-y-0.5">
        <p>IP: <span className="text-foreground font-mono">{String(d.ip ?? '-')}</span></p>
        <p>关联账户: <span className="text-foreground">{String(d.totalAccounts ?? '-')}</span> 个</p>
      </div>
    )
  }

  if (reason === 'disposable_email') {
    return (
      <div className="text-[12px] text-muted-foreground">
        <p>邮箱: <span className="text-foreground font-mono">{String(d.email ?? '-')}</span></p>
      </div>
    )
  }

  if (reason === 'rapid_credit_consumption') {
    return (
      <div className="text-[12px] text-muted-foreground">
        <p>消耗时间: <span className="text-foreground">{Number(d.minutesDiff ?? 0).toFixed(1)}</span> 分钟</p>
      </div>
    )
  }

  return <span className="text-[12px] text-muted-foreground">-</span>
}

export default function FraudListPage() {
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)

  // 审核弹窗
  const [reviewingRecord, setReviewingRecord] = useState<SuspiciousAccount | null>(null)
  const [reviewAction, setReviewAction] = useState<'dismiss' | 'freeze' | 'freeze_and_clawback'>('dismiss')

  // 冻结弹窗
  const [freezingRecord, setFreezingRecord] = useState<SuspiciousAccount | null>(null)
  const [freezeReason, setFreezeReason] = useState('')

  const buildFilters = useCallback((): SuspiciousFilters => {
    const filters: SuspiciousFilters = { page, limit: PAGE_SIZE }
    if (statusFilter) filters.status = statusFilter as SuspiciousFilters['status']
    return filters
  }, [page, statusFilter])

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['fraud-suspicious', page, statusFilter],
    queryFn: () => fraudService.getSuspiciousAccounts(buildFilters()),
  })

  const items = response?.data?.items ?? []
  const meta = response?.meta
  const total = meta?.total ?? 0
  const totalPages = meta ? Math.max(1, Math.ceil(total / (meta.limit ?? PAGE_SIZE))) : 1

  // 审核 mutation
  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'dismiss' | 'freeze' | 'freeze_and_clawback' }) =>
      fraudService.reviewAccount(id, { action }),
    onSuccess: () => {
      setReviewingRecord(null)
      queryClient.invalidateQueries({ queryKey: ['fraud-suspicious'] })
    },
  })

  // 手动扫描 mutation
  const scanMutation = useMutation({
    mutationFn: () => fraudService.triggerScan(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fraud-suspicious'] })
    },
  })

  // 冻结 mutation
  const freezeMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      fraudService.freezeUser(userId, reason),
    onSuccess: () => {
      setFreezingRecord(null)
      setFreezeReason('')
      queryClient.invalidateQueries({ queryKey: ['fraud-suspicious'] })
    },
  })

  // 解冻 mutation
  const unfreezeMutation = useMutation({
    mutationFn: (userId: string) => fraudService.unfreezeUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fraud-suspicious'] })
    },
  })

  const pendingCount = items.filter((i) => i.status === 'pending').length
  const reviewedCount = items.filter((i) => i.status === 'reviewed' || i.status === 'dismissed').length
  const frozenCount = items.filter((i) => i.isFrozen).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">防刷管理</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">监控和处理可疑注册账户</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="h-8 gap-1.5"
          >
            {scanMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Scan size={14} />}
            手动扫描
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-8 gap-1.5">
            <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
            刷新
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[13px] text-muted-foreground">待审核</p>
                <p className="text-2xl font-semibold tracking-tight text-warning">
                  {pendingCount}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-warning/10 flex items-center justify-center text-warning">
                <ShieldAlert size={18} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[13px] text-muted-foreground">已处理</p>
                <p className="text-2xl font-semibold tracking-tight text-success">
                  {reviewedCount}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-success/10 flex items-center justify-center text-success">
                <ShieldCheck size={18} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-[13px] text-muted-foreground">已冻结</p>
                <p className="text-2xl font-semibold tracking-tight text-destructive">
                  {frozenCount}
                </p>
              </div>
              <div className="h-9 w-9 rounded-md bg-destructive/10 flex items-center justify-center text-destructive">
                <ShieldX size={18} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 text-[13px] text-muted-foreground flex items-center">
              共 {total} 条可疑记录
            </div>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="h-9 gap-1.5"
            >
              <Filter size={14} />
              筛选
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
              <SelectField
                label="状态"
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1) }}
                options={statusFilterOptions}
              />
              <div />
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setStatusFilter(''); setPage(1) }}
                  className="h-9"
                >
                  清除筛选
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {isError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-destructive flex-shrink-0 mt-0.5" size={18} />
            <div className="flex-1">
              <p className="text-sm text-destructive">
                加载失败: {error instanceof Error ? error.message : '未知错误'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 text-xs text-destructive hover:text-destructive">
              重试
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>可疑原因</TableHead>
                <TableHead className="hidden md:table-cell">详情</TableHead>
                <TableHead>风险分</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="hidden lg:table-cell">发现时间</TableHead>
                <TableHead className="w-28">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    暂无可疑记录
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'h-8 w-8 rounded-full flex items-center justify-center text-[13px] font-medium',
                          item.isFrozen
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-muted text-foreground'
                        )}>
                          {(item.userName || item.userEmail).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-foreground">
                            {item.userName || item.userEmail.split('@')[0]}
                          </p>
                          <p className="text-[12px] text-muted-foreground">{item.userEmail}</p>
                        </div>
                        {item.isFrozen && (
                          <Snowflake size={13} className="text-blue-500 flex-shrink-0" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[12px]">
                        {getReasonLabel(item.reason)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell max-w-[200px]">
                      <DetailCell details={item.details} reason={item.reason} />
                    </TableCell>
                    <TableCell>
                      <span className={cn('text-[13px] font-medium tabular-nums', getRiskScoreColor(item.riskScore))}>
                        {item.riskScore}
                      </span>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(item.status)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-[13px] text-muted-foreground" title={formatDateTime(item.createdAt)}>
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        {item.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:text-warning"
                            title="审核"
                            onClick={() => {
                              setReviewingRecord(item)
                              setReviewAction('dismiss')
                            }}
                          >
                            <Eye size={14} />
                          </Button>
                        )}
                        {!item.isFrozen ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:text-destructive"
                            title="冻结"
                            onClick={() => {
                              setFreezingRecord(item)
                              setFreezeReason('')
                            }}
                            disabled={freezeMutation.isPending}
                          >
                            <Ban size={14} />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-blue-500 hover:text-success"
                            title="解冻"
                            onClick={() => unfreezeMutation.mutate(item.userId)}
                            disabled={unfreezeMutation.isPending}
                          >
                            <Undo2 size={14} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-[13px] text-muted-foreground">
                共 {total} 条，第 {page}/{totalPages} 页
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="h-7 gap-1"
                >
                  <ChevronLeft size={14} />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="h-7 gap-1"
                >
                  下一页
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      {reviewingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setReviewingRecord(null)}>
          <div className="bg-background rounded-lg border border-border p-6 max-w-md w-full shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-warning/10 flex items-center justify-center">
                  <ShieldAlert size={18} className="text-warning" />
                </div>
                <h3 className="text-base font-semibold text-foreground">审核可疑账户</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setReviewingRecord(null)}>
                <X size={14} />
              </Button>
            </div>

            <div className="space-y-3 mb-5">
              <div className="rounded-md bg-muted/50 p-3 space-y-1.5">
                <p className="text-[13px]">
                  <span className="text-muted-foreground">用户: </span>
                  <span className="text-foreground font-medium">
                    {reviewingRecord.userName || reviewingRecord.userEmail.split('@')[0]}
                  </span>
                  <span className="text-muted-foreground"> ({reviewingRecord.userEmail})</span>
                </p>
                <p className="text-[13px]">
                  <span className="text-muted-foreground">原因: </span>
                  <span className="text-foreground">{getReasonLabel(reviewingRecord.reason)}</span>
                </p>
                <p className="text-[13px]">
                  <span className="text-muted-foreground">风险分: </span>
                  <span className={cn('font-medium', getRiskScoreColor(reviewingRecord.riskScore))}>
                    {reviewingRecord.riskScore}
                  </span>
                </p>
                {reviewingRecord.registrationIp && (
                  <p className="text-[13px]">
                    <span className="text-muted-foreground">注册 IP: </span>
                    <span className="text-foreground font-mono">{reviewingRecord.registrationIp}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[13px] text-muted-foreground mb-1.5">处理方式</label>
                <div className="space-y-2">
                  {[
                    { value: 'dismiss' as const, label: '忽略', desc: '标记为已审核，不做处理' },
                    { value: 'freeze' as const, label: '冻结账户', desc: '冻结该用户，禁止登录和使用' },
                    { value: 'freeze_and_clawback' as const, label: '冻结并回收积分', desc: '冻结账户并回收欢迎奖励积分' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors',
                        reviewAction === opt.value
                          ? 'border-foreground bg-accent'
                          : 'border-border hover:bg-accent/50'
                      )}
                    >
                      <input
                        type="radio"
                        name="reviewAction"
                        value={opt.value}
                        checked={reviewAction === opt.value}
                        onChange={() => setReviewAction(opt.value)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-[13px] font-medium text-foreground">{opt.label}</p>
                        <p className="text-[12px] text-muted-foreground">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setReviewingRecord(null)} disabled={reviewMutation.isPending}>
                取消
              </Button>
              <Button
                variant={reviewAction === 'dismiss' ? 'default' : 'destructive'}
                size="sm"
                onClick={() => {
                  if (reviewingRecord) {
                    reviewMutation.mutate({ id: reviewingRecord.id, action: reviewAction })
                  }
                }}
                disabled={reviewMutation.isPending}
                className="gap-1.5"
              >
                {reviewMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                确认处理
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Freeze Dialog */}
      {freezingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setFreezingRecord(null); setFreezeReason('') }}>
          <div className="bg-background rounded-lg border border-border p-6 max-w-md w-full shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-destructive/10 flex items-center justify-center">
                  <Ban size={18} className="text-destructive" />
                </div>
                <h3 className="text-base font-semibold text-foreground">冻结用户</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setFreezingRecord(null); setFreezeReason('') }}>
                <X size={14} />
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground mb-4">
              确定要冻结用户{' '}
              <span className="text-foreground font-medium">
                {freezingRecord.userName || freezingRecord.userEmail.split('@')[0]}（{freezingRecord.userEmail}）
              </span>
              {' '}吗？冻结后该用户将无法登录和使用服务。
            </p>
            <div className="mb-5">
              <label className="block text-[13px] text-muted-foreground mb-1.5">
                冻结原因 <span className="text-destructive">*</span>
              </label>
              <textarea
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                placeholder="请输入冻结原因..."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-24 resize-none"
                maxLength={500}
              />
              <p className="text-[12px] text-muted-foreground mt-1 tabular-nums">{freezeReason.length}/500</p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setFreezingRecord(null); setFreezeReason('') }} disabled={freezeMutation.isPending}>
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (freezingRecord && freezeReason.trim()) {
                    freezeMutation.mutate({ userId: freezingRecord.userId, reason: freezeReason.trim() })
                  }
                }}
                disabled={!freezeReason.trim() || freezeMutation.isPending}
                className="gap-1.5"
              >
                {freezeMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                <Ban size={14} />
                确认冻结
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
