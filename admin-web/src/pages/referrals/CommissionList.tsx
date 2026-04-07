import { useState, useEffect, useCallback } from 'react'
import {
  Check,
  X,
  DollarSign,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  RotateCcw,
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
import { cn } from '@/lib/utils'
import {
  referralService,
  type CommissionDTO,
  type CommissionFilters,
  type WithdrawalDTO,
  type WithdrawalFilters,
} from '@/services/referrals'

// ============================================================
// 常量
// ============================================================

const PAGE_SIZE = 20

// ============================================================
// 辅助函数
// ============================================================

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

type StatusVariant = 'default' | 'secondary' | 'destructive' | 'outline'

interface StatusConfig {
  label: string
  variant: StatusVariant
  className?: string
}

function getCommissionStatusConfig(status: string): StatusConfig {
  const map: Record<string, StatusConfig> = {
    pending: { label: '待审核', variant: 'outline', className: 'border-amber-500/30 text-amber-500 bg-amber-500/5' },
    approved: { label: '已通过', variant: 'outline', className: 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5' },
    paid: { label: '已支付', variant: 'outline', className: 'border-blue-500/30 text-blue-500 bg-blue-500/5' },
    rejected: { label: '已拒绝', variant: 'destructive' },
  }
  return map[status] ?? { label: status, variant: 'secondary' }
}

function getWithdrawalStatusConfig(status: string): StatusConfig {
  const map: Record<string, StatusConfig> = {
    pending: { label: '待审核', variant: 'outline', className: 'border-amber-500/30 text-amber-500 bg-amber-500/5' },
    approved: { label: '已审批', variant: 'outline', className: 'border-blue-500/30 text-blue-500 bg-blue-500/5' },
    paid: { label: '已打款', variant: 'outline', className: 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5' },
    rejected: { label: '已拒绝', variant: 'destructive' },
  }
  return map[status] ?? { label: status, variant: 'secondary' }
}

// ============================================================
// 主组件
// ============================================================

type TabType = 'commissions' | 'withdrawals'

export default function CommissionList() {
  const [activeTab, setActiveTab] = useState<TabType>('commissions')

  const tabItems: Array<{ key: TabType; label: string }> = [
    { key: 'commissions', label: '佣金记录' },
    { key: 'withdrawals', label: '提现管理' },
  ]

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">佣金管理</h1>
        <p className="text-[13px] text-muted-foreground mt-1">管理推荐佣金记录和提现申请</p>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b border-border">
        {tabItems.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'commissions' ? <CommissionsTab /> : <WithdrawalsTab />}
    </div>
  )
}

// ============================================================
// 佣金记录 Tab
// ============================================================

function CommissionsTab() {
  const [commissions, setCommissions] = useState<CommissionDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<CommissionFilters>({ page: 1, limit: PAGE_SIZE })
  const [total, setTotal] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const loadCommissions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await referralService.getCommissions(filters)
      if (res.success && res.data) {
        setCommissions(res.data.commissions)
        setTotal(res.meta?.total ?? 0)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadCommissions()
  }, [loadCommissions])

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      setActionLoading(id)
      await referralService.reviewCommission(id, action)
      await loadCommissions()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActionLoading(null)
    }
  }

  const currentPage = filters.page ?? 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex items-center gap-3">
        <select
          value={filters.status || ''}
          onChange={(e) =>
            setFilters({
              ...filters,
              status: (e.target.value || undefined) as CommissionFilters['status'],
              page: 1,
            })
          }
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="paid">已支付</option>
          <option value="rejected">已拒绝</option>
        </select>
        <Button variant="outline" size="sm" onClick={loadCommissions}>
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* 表格 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>推荐人</TableHead>
                <TableHead>被推荐人</TableHead>
                <TableHead className="text-right">订单金额</TableHead>
                <TableHead className="text-right">佣金比例</TableHead>
                <TableHead className="text-right">佣金金额</TableHead>
                <TableHead className="text-center">层级</TableHead>
                <TableHead className="text-center">状态</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : commissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    暂无佣金记录
                  </TableCell>
                </TableRow>
              ) : (
                commissions.map((c) => {
                  const statusCfg = getCommissionStatusConfig(c.status)
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{c.referrerName || '-'}</p>
                          <p className="text-xs text-muted-foreground">{c.referrerEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{c.referredEmail}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm text-foreground tabular-nums">¥{c.orderAmount}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm text-muted-foreground tabular-nums">{c.commissionRate}%</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-medium text-foreground tabular-nums">¥{c.commissionAmount}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-muted-foreground">L{c.level}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={statusCfg.variant} className={statusCfg.className}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-[13px] text-muted-foreground">{formatDate(c.createdAt)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {c.status === 'pending' && (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                              onClick={() => handleAction(c.id, 'approve')}
                              disabled={actionLoading === c.id}
                              title="通过"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleAction(c.id, 'reject')}
                              disabled={actionLoading === c.id}
                              title="拒绝"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-muted-foreground tabular-nums">
            共 {total} 条记录，第 {currentPage}/{totalPages} 页
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setFilters({ ...filters, page: currentPage - 1 })}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setFilters({ ...filters, page: currentPage + 1 })}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// 提现管理 Tab
// ============================================================

function WithdrawalsTab() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<WithdrawalFilters>({ page: 1, limit: PAGE_SIZE })
  const [total, setTotal] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [emailInput, setEmailInput] = useState('')

  const loadWithdrawals = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await referralService.getWithdrawals(filters)
      if (res.success && res.data) {
        setWithdrawals(res.data.withdrawals)
        setTotal(res.meta?.total ?? 0)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadWithdrawals()
  }, [loadWithdrawals])

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'pay') => {
    try {
      setActionLoading(id)
      await referralService.processWithdrawal(id, action)
      await loadWithdrawals()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSearch = () => {
    setFilters({
      ...filters,
      email: emailInput.trim() || undefined,
      page: 1,
    })
  }

  const handleReset = () => {
    setEmailInput('')
    setFilters({ page: 1, limit: PAGE_SIZE })
  }

  const currentPage = filters.page ?? 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="用户邮箱"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearch()
            }
          }}
          className="h-9 w-64 rounded-md border border-input bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          value={filters.status || ''}
          onChange={(e) =>
            setFilters({
              ...filters,
              status: (e.target.value || undefined) as WithdrawalFilters['status'],
              page: 1,
            })
          }
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          <option value="approved">已审批</option>
          <option value="paid">已打款</option>
          <option value="rejected">已拒绝</option>
        </select>
        <Button variant="default" size="sm" onClick={handleSearch}>
          <Search className="w-3.5 h-3.5" />
          搜索
        </Button>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RotateCcw className="w-3.5 h-3.5" />
          重置
        </Button>
        <Button variant="outline" size="sm" onClick={loadWithdrawals}>
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </Button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* 表格 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead className="text-right">提现金额</TableHead>
                <TableHead>收款方式</TableHead>
                <TableHead>收款账号</TableHead>
                <TableHead className="text-center">状态</TableHead>
                <TableHead>备注</TableHead>
                <TableHead>申请时间</TableHead>
                <TableHead className="text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : withdrawals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    暂无提现记录
                  </TableCell>
                </TableRow>
              ) : (
                withdrawals.map((w) => {
                  const statusCfg = getWithdrawalStatusConfig(w.status)
                  return (
                    <TableRow key={w.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{w.userName || '-'}</p>
                          <p className="text-xs text-muted-foreground">{w.userEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-medium text-foreground tabular-nums">¥{w.amount}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{w.paymentMethod || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
                          {w.paymentAccount || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={statusCfg.variant} className={statusCfg.className}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground max-w-[150px] truncate block">
                          {w.note || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[13px] text-muted-foreground">{formatDate(w.createdAt)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {w.status === 'pending' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                                onClick={() => handleAction(w.id, 'approve')}
                                disabled={actionLoading === w.id}
                                title="审批通过"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleAction(w.id, 'reject')}
                                disabled={actionLoading === w.id}
                                title="拒绝"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {w.status === 'approved' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                              onClick={() => handleAction(w.id, 'pay')}
                              disabled={actionLoading === w.id}
                              title="确认打款"
                            >
                              <DollarSign className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-muted-foreground tabular-nums">
            共 {total} 条记录，第 {currentPage}/{totalPages} 页
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setFilters({ ...filters, page: currentPage - 1 })}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setFilters({ ...filters, page: currentPage + 1 })}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
