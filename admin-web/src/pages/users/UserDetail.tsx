import { useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Mail,
  Calendar,
  Activity,
  CreditCard,
  Shield,
  Clock,
  Ban,
  KeyRound,
  RefreshCw,
  Download,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Crown,
  Gift,
  Zap,
} from 'lucide-react'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  formatNumber,
  formatDateTime,
  formatDate,
  exportToCSV,
} from '@/lib/utils'
import {
  usersService,
  type AdminUserDetail,
  type AdminUserTransaction,
} from '@/services/users'
import {
  periodCardsService,
  type PeriodCardRecord,
} from '@/services/period-cards'

const TX_PAGE_SIZE = 20

function getTransactionTypeLabel(type: string): string {
  const map: Record<string, string> = {
    deposit: '充值', usage: '消费', bonus: '奖励',
    refund: '退款', adjustment: '调整', compensation: '补偿',
  }
  return map[type] ?? type
}

function getTransactionBadgeVariant(type: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    deposit: 'default', usage: 'secondary', bonus: 'outline',
    refund: 'destructive', adjustment: 'secondary', compensation: 'secondary',
  }
  return map[type] ?? 'secondary'
}

function formatBalance(val: string, _currency?: string): string {
  const num = parseFloat(val)
  return `${num.toFixed(2)} 积分`
}

function getUserDisplayName(user: AdminUserDetail): string {
  return user.name ?? user.email.split('@')[0] ?? '未知'
}

/**
 * 期卡状态配置
 */
function getCardStatusConfig(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    active: { label: '生效中', variant: 'default' },
    expired: { label: '已过期', variant: 'secondary' },
    cancelled: { label: '已取消', variant: 'destructive' },
    upgraded: { label: '已升级', variant: 'outline' },
  }
  return map[status] ?? { label: status, variant: 'secondary' }
}

/**
 * 计算剩余天数
 */
function getRemainingDays(expiresAt: string): number {
  const now = new Date()
  const expiry = new Date(expiresAt)
  const diffMs = expiry.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

/**
 * 额度使用进度条
 */
function QuotaProgressBar({ used, total, className }: { used: number; total: number; className?: string }) {
  const percentage = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const remaining = total - used

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-muted-foreground">
          已用 <span className="font-medium text-foreground">{used.toFixed(2)}</span> / 总量 {total.toFixed(2)} 积分
        </span>
        <span className={cn(
          'font-medium tabular-nums',
          percentage > 90 ? 'text-destructive' : percentage > 70 ? 'text-warning' : 'text-success'
        )}>
          剩余 {remaining.toFixed(2)}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            percentage > 90 ? 'bg-destructive' : percentage > 70 ? 'bg-warning' : 'bg-success'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">
        {percentage.toFixed(1)}% 已使用
      </p>
    </div>
  )
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'periodCards'>('overview')
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [balanceAmount, setBalanceAmount] = useState('')
  const [balanceReason, setBalanceReason] = useState('')
  const [txPage, setTxPage] = useState(1)

  // 封禁/解封对话框
  const [showSuspendDialog, setShowSuspendDialog] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')

  // 获取用户详情
  const {
    data: userResponse,
    isLoading: userLoading,
    isError: userError,
    error: userErrorObj,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ['user-detail', id],
    queryFn: () => usersService.getUser(id!),
    enabled: !!id,
  })

  const user = userResponse?.data?.user

  // 获取交易记录
  const {
    data: txResponse,
    isLoading: txLoading,
  } = useQuery({
    queryKey: ['user-transactions', id, txPage],
    queryFn: () => usersService.getUserTransactions(id!, txPage, TX_PAGE_SIZE),
    enabled: !!id && activeTab === 'transactions',
  })

  const transactions: AdminUserTransaction[] = txResponse?.data?.transactions ?? []
  const txMeta = txResponse?.meta
  const txTotal = txMeta?.total ?? 0
  const txTotalPages = txMeta ? Math.max(1, Math.ceil(txTotal / (txMeta.limit ?? TX_PAGE_SIZE))) : 1

  // 获取用户期卡数据（期卡标签页）
  const {
    data: cardsResponse,
    isLoading: cardsLoading,
    isError: cardsError,
  } = useQuery({
    queryKey: ['user-period-cards', id],
    queryFn: () => periodCardsService.getRecords({ userId: id!, limit: 100 }),
    enabled: !!id && activeTab === 'periodCards',
  })

  const allCards: PeriodCardRecord[] = cardsResponse?.data?.records ?? []
  const allCardsTotal: number = cardsResponse?.meta?.total ?? allCards.length
  const allCardsTruncated = allCardsTotal > allCards.length
  const activeCards = useMemo(() => allCards.filter((c) => c.status === 'active'), [allCards])
  const historyCards = useMemo(() => allCards.filter((c) => c.status !== 'active'), [allCards])

  // 获取活跃期卡数（概览区摘要）
  const { data: activeCardsOverview } = useQuery({
    queryKey: ['user-active-cards-overview', id],
    queryFn: () => periodCardsService.getRecords({ userId: id!, status: 'active' }),
    enabled: !!id,
  })
  const activeCardCount = activeCardsOverview?.meta?.total ?? activeCardsOverview?.data?.records?.length ?? 0

  // 余额调整
  const balanceMutation = useMutation({
    mutationFn: ({ amount, reason }: { amount: number; reason: string }) =>
      usersService.adjustBalance(id!, { amount, reason, type: 'adjustment' }),
    onSuccess: () => {
      setShowBalanceModal(false)
      setBalanceAmount('')
      setBalanceReason('')
      queryClient.invalidateQueries({ queryKey: ['user-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['user-transactions', id] })
    },
  })

  // 封禁用户
  const suspendMutation = useMutation({
    mutationFn: (reason: string) => usersService.suspendUser(id!, reason),
    onSuccess: () => {
      setShowSuspendDialog(false)
      setSuspendReason('')
      queryClient.invalidateQueries({ queryKey: ['user-detail', id] })
    },
  })

  // 解封用户
  const unsuspendMutation = useMutation({
    mutationFn: () => usersService.unsuspendUser(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-detail', id] })
    },
  })

  // 发送密码重置邮件
  const passwordResetMutation = useMutation({
    mutationFn: () => usersService.sendPasswordReset(id!),
  })

  const handleAdjustBalance = useCallback(() => {
    const amount = parseFloat(balanceAmount)
    if (isNaN(amount) || !balanceReason.trim()) return
    balanceMutation.mutate({ amount, reason: balanceReason.trim() })
  }, [balanceAmount, balanceReason, balanceMutation])

  const handleSuspendConfirm = useCallback(() => {
    if (!suspendReason.trim()) return
    suspendMutation.mutate(suspendReason.trim())
  }, [suspendReason, suspendMutation])

  const handleExportTransactions = useCallback(() => {
    if (transactions.length === 0) return
    const data = transactions.map((tx) => ({
      ID: tx.id,
      '类型': getTransactionTypeLabel(tx.type),
      '金额': tx.amount,
      '变更前余额': tx.balanceBefore,
      '变更后余额': tx.balanceAfter,
      '描述': tx.description ?? '',
      '时间': formatDateTime(tx.createdAt),
    }))
    exportToCSV(data, `用户交易记录_${id}_${new Date().toISOString().slice(0, 10)}.csv`)
  }, [transactions, id])

  const handleRefresh = useCallback(() => {
    refetchUser()
  }, [refetchUser])

  const tabs = [
    { id: 'overview', label: '概览' },
    { id: 'transactions', label: '交易记录' },
    { id: 'periodCards', label: '期卡' },
  ] as const

  // 加载状态
  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // 错误状态
  if (userError || !user) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/users')}>
            <ArrowLeft size={18} />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">用户详情</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertCircle size={18} className="text-destructive" />
              <span className="text-sm text-destructive">加载用户详情失败: {userErrorObj instanceof Error ? userErrorObj.message : '用户不存在'}</span>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="ml-auto h-7">重试</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const displayName = getUserDisplayName(user)

  return (
    <div className="space-y-6">
      {/* 返回按钮和标题 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/users')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">用户详情</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">ID: {id}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8 gap-1.5">
          <RefreshCw size={14} />
          刷新
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => passwordResetMutation.mutate()}
          disabled={passwordResetMutation.isPending}
          className="h-8 gap-1.5"
        >
          {passwordResetMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
          发送密码重置邮件
        </Button>
        {user.isActive ? (
          <Button variant="destructive" size="sm" onClick={() => setShowSuspendDialog(true)} className="h-8 gap-1.5">
            <Ban size={14} />
            封禁用户
          </Button>
        ) : (
          <Button size="sm" onClick={() => unsuspendMutation.mutate()} disabled={unsuspendMutation.isPending} className="h-8 gap-1.5">
            {unsuspendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            解封用户
          </Button>
        )}
      </div>

      {/* 用户信息卡片 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-start gap-5">
              <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center text-xl font-semibold text-foreground">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">{displayName}</h2>
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                    {user.role === 'admin' ? '管理员' : '普通用户'}
                  </Badge>
                  {user.isActive ? (
                    <Badge variant="outline" className="border-success/30 text-success bg-success/5">正常</Badge>
                  ) : (
                    <Badge variant="destructive">已封禁</Badge>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Mail size={14} />
                    <span>{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Calendar size={14} />
                    <span>注册于 {formatDate(user.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Clock size={14} />
                    <span>更新于 {formatDateTime(user.updatedAt)}</span>
                  </div>
                  {user.emailVerifiedAt && (
                    <div className="flex items-center gap-2 text-[13px] text-success">
                      <Shield size={14} />
                      <span>邮箱已验证</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <p className="text-[13px] text-muted-foreground">账户余额</p>
              <p className="text-3xl font-semibold tracking-tight text-foreground mt-2">
                {formatBalance(user.balance.current, user.balance.currency)}
              </p>
              <div className="mt-4">
                <Button size="sm" className="w-full" onClick={() => setShowBalanceModal(true)}>
                  调整余额
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 text-center">
            <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <Activity size={18} />
            </div>
            <p className="text-2xl font-semibold tracking-tight text-foreground mt-3">
              {formatNumber(user.usageStats?.last30Days?.totalRequests ?? 0)}
            </p>
            <p className="text-[13px] text-muted-foreground mt-0.5">30天请求数</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <div className="h-9 w-9 rounded-md bg-success/10 flex items-center justify-center mx-auto text-success">
              <CreditCard size={18} />
            </div>
            <p className="text-2xl font-semibold tracking-tight text-foreground mt-3">
              {formatBalance(user.balance.totalSpent, user.balance.currency)}
            </p>
            <p className="text-[13px] text-muted-foreground mt-0.5">累计消费</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <div className="h-9 w-9 rounded-md bg-chart-4/10 flex items-center justify-center mx-auto text-chart-4">
              <CreditCard size={18} />
            </div>
            <p className="text-2xl font-semibold tracking-tight text-foreground mt-3">
              {formatBalance(user.balance.totalDeposited, user.balance.currency)}
            </p>
            <p className="text-[13px] text-muted-foreground mt-0.5">累计充值</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <div className={cn(
              'h-9 w-9 rounded-md flex items-center justify-center mx-auto',
              activeCardCount > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-muted text-muted-foreground'
            )}>
              <Crown size={18} />
            </div>
            <p className="text-2xl font-semibold tracking-tight text-foreground mt-3">
              {activeCardCount}
            </p>
            <p className="text-[13px] text-muted-foreground mt-0.5">活跃期卡</p>
          </CardContent>
        </Card>
      </div>

      {/* 密码重置反馈 */}
      {passwordResetMutation.isSuccess && (
        <div className="rounded-lg border border-success/20 bg-success/5 px-4 py-3 flex items-center gap-2">
          <ShieldCheck size={16} className="text-success" />
          <p className="text-sm text-success">密码重置邮件已发送至 {passwordResetMutation.data?.data?.email}</p>
        </div>
      )}
      {passwordResetMutation.isError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 flex items-center gap-2">
          <AlertCircle size={16} className="text-destructive" />
          <p className="text-sm text-destructive">
            发送失败: {passwordResetMutation.error instanceof Error ? passwordResetMutation.error.message : '未知错误'}
          </p>
        </div>
      )}

      {/* 标签页 */}
      <div className="border-b border-border">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'py-3 px-1 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 概览标签页 */}
      {activeTab === 'overview' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">30天使用统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-[13px] text-muted-foreground">请求数</p>
                <p className="text-xl font-semibold text-foreground mt-1">
                  {formatNumber(user.usageStats?.last30Days?.totalRequests ?? 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[13px] text-muted-foreground">Token 消耗</p>
                <p className="text-xl font-semibold text-foreground mt-1">
                  {formatNumber(user.usageStats?.last30Days?.totalTokens ?? 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[13px] text-muted-foreground">费用</p>
                <p className="text-xl font-semibold text-foreground mt-1">
                  {parseFloat(user.usageStats?.last30Days?.totalCost ?? '0').toFixed(2)} 积分
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 交易记录标签页 */}
      {activeTab === 'transactions' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">交易记录</CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportTransactions} disabled={transactions.length === 0} className="h-7 gap-1.5">
              <Download size={14} />
              导出
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类型</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>变更前</TableHead>
                  <TableHead>变更后</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      暂无交易记录
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx) => {
                    const amount = parseFloat(tx.amount)
                    return (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <Badge variant={getTransactionBadgeVariant(tx.type)}>
                            {getTransactionTypeLabel(tx.type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-[13px] text-muted-foreground">{tx.description ?? '-'}</span>
                        </TableCell>
                        <TableCell>
                          <span className={cn('text-[13px] font-medium tabular-nums', amount >= 0 ? 'text-success' : 'text-destructive')}>
                            {amount >= 0 ? '+' : ''}{amount.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-[13px] text-muted-foreground tabular-nums">{parseFloat(tx.balanceBefore).toFixed(2)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-[13px] text-muted-foreground tabular-nums">{parseFloat(tx.balanceAfter).toFixed(2)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-[13px] text-muted-foreground">{formatDateTime(tx.createdAt)}</span>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>

            {txTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-[13px] text-muted-foreground">
                  共 {txTotal} 条，第 {txPage}/{txTotalPages} 页
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setTxPage(txPage - 1)} disabled={txPage === 1} className="h-7 gap-1">
                    <ChevronLeft size={14} />
                    上一页
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setTxPage(txPage + 1)} disabled={txPage === txTotalPages} className="h-7 gap-1">
                    下一页
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* API 密钥标签页已移除 - SaaS 模式下不再使用 API Key */}

      {/* 期卡标签页 */}
      {activeTab === 'periodCards' && (
        <div className="space-y-6">
          {cardsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : cardsError ? (
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-destructive">加载期卡记录失败，请刷新重试</p>
                </div>
              </CardContent>
            </Card>
          ) : allCards.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                    <Crown size={24} className="text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">暂无期卡记录</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* 活跃期卡 */}
              {activeCards.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Zap size={14} className="text-amber-500" />
                    活跃期卡 ({activeCards.length})
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {activeCards.map((card) => {
                      const remainingDays = getRemainingDays(card.expiresAt)
                      const isTotal = card.quotaMode === 'total'
                      const used = isTotal
                        ? card.totalCredits - card.totalRemaining
                        : card.dailyCredits - card.dailyQuotaRemaining
                      const total = isTotal ? card.totalCredits : card.dailyCredits

                      return (
                        <Card key={card.id} className="border-amber-500/20">
                          <CardContent className="p-5 space-y-4">
                            {/* 头部：套餐名 + 状态 */}
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <Crown size={16} className="text-amber-500" />
                                <span className="text-sm font-medium text-foreground">
                                  {card.planName ?? '未知套餐'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {card.paymentId ? (
                                  <Badge variant="outline" className="text-xs">
                                    <CreditCard size={10} className="mr-1" />
                                    购买
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600">
                                    <Gift size={10} className="mr-1" />
                                    赠送
                                  </Badge>
                                )}
                                <Badge variant={getCardStatusConfig(card.status).variant}>
                                  {getCardStatusConfig(card.status).label}
                                </Badge>
                              </div>
                            </div>

                            {/* 额度模式标签 */}
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {isTotal ? '总量池模式' : '每日重置模式'}
                              </Badge>
                              <span className={cn(
                                'text-xs font-medium',
                                remainingDays <= 3 ? 'text-destructive' : remainingDays <= 7 ? 'text-warning' : 'text-muted-foreground'
                              )}>
                                剩余 {remainingDays} 天
                              </span>
                            </div>

                            {/* 额度进度条 */}
                            <QuotaProgressBar used={used} total={total} />

                            {/* 有效期 */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar size={12} />
                              <span>{formatDate(card.startsAt)} ~ {formatDate(card.expiresAt)}</span>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 历史期卡 */}
              {historyCards.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">历史期卡 ({historyCards.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>套餐</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>额度模式</TableHead>
                          <TableHead>总额度</TableHead>
                          <TableHead>已用</TableHead>
                          <TableHead>来源</TableHead>
                          <TableHead>有效期</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyCards.map((card) => {
                          const isTotal = card.quotaMode === 'total'
                          const total = isTotal ? card.totalCredits : card.dailyCredits
                          const remaining = isTotal ? card.totalRemaining : card.dailyQuotaRemaining
                          const used = total - remaining
                          const statusCfg = getCardStatusConfig(card.status)

                          return (
                            <TableRow key={card.id}>
                              <TableCell>
                                <span className="text-[13px] font-medium">{card.planName ?? '未知套餐'}</span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                              </TableCell>
                              <TableCell>
                                <span className="text-[13px] text-muted-foreground">
                                  {isTotal ? '总量池' : '每日重置'}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-[13px] tabular-nums">{total.toFixed(2)}</span>
                              </TableCell>
                              <TableCell>
                                <span className="text-[13px] tabular-nums">{used.toFixed(2)}</span>
                              </TableCell>
                              <TableCell>
                                <span className="text-[13px] text-muted-foreground">
                                  {card.paymentId ? '购买' : '赠送'}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-[13px] text-muted-foreground">
                                  {formatDate(card.startsAt)} ~ {formatDate(card.expiresAt)}
                                </span>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* 数据截断提示：当期卡总数超过当前加载量时显示 */}
          {allCardsTruncated && (
            <p className="text-xs text-muted-foreground text-center py-2">
              仅展示最近 {allCards.length} 条（共 {allCardsTotal} 条），如需查看更多请使用完整期卡管理页面
            </p>
          )}
        </div>
      )}

      {/* 余额调整弹窗 */}
      {showBalanceModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowBalanceModal(false)}>
          <div className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">调整用户余额</CardTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowBalanceModal(false)}>
                <X size={16} />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-[13px] text-warning">
                  余额调整将直接影响用户账户，请谨慎操作。正数为增加，负数为扣减。
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">调整金额</label>
                <Input
                  type="number"
                  placeholder="例如: 100 或 -50"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-foreground">调整原因</label>
                <Input
                  placeholder="请输入调整原因"
                  value={balanceReason}
                  onChange={(e) => setBalanceReason(e.target.value)}
                />
              </div>
              {balanceMutation.isError && (
                <p className="text-[13px] text-destructive">
                  调整失败: {balanceMutation.error instanceof Error ? balanceMutation.error.message : '未知错误'}
                </p>
              )}
            </CardContent>
            <div className="flex items-center justify-end gap-2 px-6 pb-6">
              <Button variant="outline" size="sm" onClick={() => setShowBalanceModal(false)} disabled={balanceMutation.isPending}>
                取消
              </Button>
              <Button size="sm" onClick={handleAdjustBalance} disabled={!balanceAmount || !balanceReason || balanceMutation.isPending}>
                {balanceMutation.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                确认调整
              </Button>
            </div>
          </Card>
          </div>
        </div>
      )}

      {/* 封禁确认对话框 */}
      {showSuspendDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowSuspendDialog(false); setSuspendReason('') }} role="dialog" aria-modal="true">
          <div className="bg-card rounded-lg border border-border p-6 max-w-md w-full mx-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <Ban size={18} className="text-destructive" />
              </div>
              <h3 className="text-base font-semibold text-foreground">确认封禁</h3>
            </div>
            <p className="text-[13px] text-muted-foreground mb-4">
              确定要封禁用户 <span className="text-foreground font-medium">{displayName}（{user.email}）</span> 吗？封禁后该用户将无法登录。
            </p>
            <div className="mb-6">
              <label className="block text-[13px] font-medium text-foreground mb-1.5">
                封禁原因 <span className="text-destructive">*</span>
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="请输入封禁原因..."
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring h-24 resize-none"
                maxLength={500}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowSuspendDialog(false); setSuspendReason('') }} disabled={suspendMutation.isPending}>
                取消
              </Button>
              <Button variant="destructive" size="sm" onClick={handleSuspendConfirm} disabled={!suspendReason.trim() || suspendMutation.isPending}>
                {suspendMutation.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                <Ban size={14} className="mr-1" />
                确认封禁
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
