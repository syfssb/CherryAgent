import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  XCircle,
  CalendarPlus,
  Gift,
  Loader2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/ui/table'
import { cn, formatDateTime } from '@/lib/utils'
import {
  periodCardsService,
  type PeriodCardRecord,
  type PeriodCardPlan,
  type RecordFilters,
} from '@/services/period-cards'

const PAGE_SIZE = 20

const statusLabels: Record<string, string> = {
  active: '生效中',
  expired: '已过期',
  cancelled: '已取消',
}

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  expired: 'secondary',
  cancelled: 'destructive',
}

const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '生效中' },
  { value: 'expired', label: '已过期' },
  { value: 'cancelled', label: '已取消' },
]

export default function PeriodCardSubscriptions() {
  const queryClient = useQueryClient()

  const [filters, setFilters] = useState<RecordFilters>({
    page: 1,
    limit: PAGE_SIZE,
  })
  const [statusFilter, setStatusFilter] = useState('')
  const [userIdInput, setUserIdInput] = useState('')

  // 赠送期卡表单状态
  const [showGrantForm, setShowGrantForm] = useState(false)
  const [grantUserId, setGrantUserId] = useState('')
  const [grantPlanId, setGrantPlanId] = useState('')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['period-card-records', filters, statusFilter],
    queryFn: () =>
      periodCardsService.getRecords({
        ...filters,
        status: statusFilter || undefined,
      }),
    placeholderData: (prev) => prev,
  })

  // 获取启用的套餐列表（赠送表单用）
  const { data: plansData } = useQuery({
    queryKey: ['period-card-plans-enabled'],
    queryFn: () => periodCardsService.getPlans({ isEnabled: true }),
    enabled: showGrantForm,
  })

  const enabledPlans: PeriodCardPlan[] = plansData?.data?.plans ?? []

  const records: PeriodCardRecord[] = data?.data?.records ?? []
  const meta = data?.meta
  const total = meta?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1

  const cancelMutation = useMutation({
    mutationFn: (id: string) => periodCardsService.cancelRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['period-card-records'] })
    },
  })

  const grantMutation = useMutation({
    mutationFn: ({ userId, planId }: { userId: string; planId: string }) =>
      periodCardsService.grantRecord(userId, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['period-card-records'] })
      setShowGrantForm(false)
      setGrantUserId('')
      setGrantPlanId('')
    },
  })

  const extendMutation = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) =>
      periodCardsService.extendRecord(id, days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['period-card-records'] })
    },
  })

  const handleCancel = useCallback(
    (record: PeriodCardRecord) => {
      const label = record.planName || record.id
      if (window.confirm(`确定要取消期卡 "${label}" 吗？`)) {
        cancelMutation.mutate(record.id)
      }
    },
    [cancelMutation]
  )

  const handleGrant = useCallback(() => {
    if (!grantUserId.trim() || !grantPlanId) {
      window.alert('请填写用户 ID 并选择套餐')
      return
    }
    grantMutation.mutate({ userId: grantUserId.trim(), planId: grantPlanId })
  }, [grantUserId, grantPlanId, grantMutation])

  const handleExtend = useCallback(
    (record: PeriodCardRecord) => {
      const input = window.prompt(`请输入延期天数（1-365）：`, '30')
      if (input === null) return
      const days = parseInt(input, 10)
      if (isNaN(days) || days < 1 || days > 365) {
        window.alert('请输入 1-365 之间的整数')
        return
      }
      extendMutation.mutate({ id: record.id, days })
    },
    [extendMutation]
  )

  const handleSearchUser = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      page: 1,
      userId: userIdInput.trim() || undefined,
    }))
  }, [userIdInput])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">期卡订阅记录</h1>
          <p className="text-muted-foreground mt-1">查看和管理用户的期卡订阅记录</p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowGrantForm((v) => !v)}
        >
          <Gift className="h-4 w-4 mr-1" />
          赠送期卡
        </Button>
      </div>

      {/* 赠送期卡表单 */}
      {showGrantForm && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium mb-1 block">用户 ID</label>
                <Input
                  placeholder="输入用户 UUID..."
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                />
              </div>
              <div className="min-w-[200px]">
                <label className="text-sm font-medium mb-1 block">选择套餐</label>
                <select
                  value={grantPlanId}
                  onChange={(e) => setGrantPlanId(e.target.value)}
                  className={cn(
                    'h-9 w-full rounded-md border border-input bg-background px-3 text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                >
                  <option value="">请选择套餐</option>
                  {enabledPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ({plan.periodDays}天 / 每日{plan.dailyCredits}积分)
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                onClick={handleGrant}
                disabled={grantMutation.isPending}
              >
                {grantMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Gift className="h-4 w-4 mr-1" />
                )}
                确认赠送
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowGrantForm(false)
                  setGrantUserId('')
                  setGrantPlanId('')
                }}
              >
                取消
              </Button>
            </div>
            {grantMutation.isError && (
              <p className="text-sm text-red-600 mt-2">
                赠送失败: {(grantMutation.error as Error)?.message || '未知错误'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 筛选栏 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Input
                placeholder="按用户 ID 筛选..."
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setFilters((prev) => ({ ...prev, page: 1 }))
              }}
              className={cn(
                'h-9 rounded-md border border-input bg-background px-3 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              {statusFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['period-card-records'] })}
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 数据表格 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>套餐</TableHead>
                <TableHead className="text-right">每日积分</TableHead>
                <TableHead className="text-right">今日剩余</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>开始时间</TableHead>
                <TableHead>到期时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    暂无订阅记录
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <p className="text-sm">{record.userEmail || record.userId}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{record.planName || '-'}</p>
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {record.dailyCredits}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {record.dailyQuotaRemaining}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[record.status] ?? 'secondary'}>
                        {statusLabels[record.status] ?? record.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(record.startsAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(record.expiresAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {record.status === 'active' && (
                          <>
                            <button
                              onClick={() => handleExtend(record)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-blue-600"
                              title="延期期卡"
                            >
                              <CalendarPlus className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleCancel(record)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-600"
                              title="取消期卡"
                            >
                              <XCircle className="h-4 w-4" />
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

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                共 {total} 条，第 {filters.page} / {totalPages} 页
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page === 1}
                  onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page === totalPages}
                  onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
