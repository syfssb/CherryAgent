import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Eye,
  Copy,
  ToggleLeft,
  ToggleRight,
  X,
  Save,
  Layers,
  Clock,
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
  redeemCodesService,
  type RedeemCode,
  type RedeemUsage,
  type RedeemCodeFilters,
  type CreateRedeemCodeRequest,
  type BatchCreateRedeemRequest,
} from '@/services/redeem-codes'
import {
  periodCardsService,
  type PeriodCardPlan,
} from '@/services/period-cards'

// ============================================================
// 常量
// ============================================================

const PAGE_SIZE = 20

const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '启用中' },
  { value: 'inactive', label: '已禁用' },
  { value: 'expired', label: '已过期' },
]

// ============================================================
// 辅助函数
// ============================================================

function getStatusBadge(code: RedeemCode): { variant: 'outline' | 'secondary' | 'default' | 'destructive'; label: string } {
  if (!code.isActive) {
    return { variant: 'secondary', label: '已禁用' }
  }
  if (code.expiresAt && new Date(code.expiresAt) <= new Date()) {
    return { variant: 'destructive', label: '已过期' }
  }
  if (code.maxUses && code.usedCount >= code.maxUses) {
    return { variant: 'secondary', label: '已用完' }
  }
  return { variant: 'default', label: '启用中' }
}

function formatCredits(amount: number): string {
  return amount.toFixed(2)
}

// ============================================================
// 创建/批量创建弹窗
// ============================================================

function CreateDialog({
  mode,
  onClose,
  onSubmit,
  loading,
  serverError,
  plans,
}: {
  mode: 'single' | 'batch'
  onClose: () => void
  onSubmit: (data: CreateRedeemCodeRequest | BatchCreateRedeemRequest, mode: 'single' | 'batch') => void
  loading: boolean
  serverError?: string
  plans: PeriodCardPlan[]
}) {
  const [code, setCode] = useState('')
  const [prefix, setPrefix] = useState('REDEEM')
  const [count, setCount] = useState(10)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creditsAmount, setCreditsAmount] = useState('')
  const [maxUses, setMaxUses] = useState('1')
  const [expiresAt, setExpiresAt] = useState('')
  const [redeemType, setRedeemType] = useState<'credits' | 'period_card'>('credits')
  const [periodCardPlanId, setPeriodCardPlanId] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    setError('')
    const credits = parseFloat(creditsAmount)
    if (!name.trim()) { setError('请填写名称'); return }

    if (redeemType === 'credits') {
      if (!credits || credits <= 0) { setError('请填写有效的积分数量'); return }
    } else {
      if (!periodCardPlanId) { setError('请选择期卡套餐'); return }
    }

    // datetime-local 格式转 ISO 8601
    const isoExpires = expiresAt ? new Date(expiresAt).toISOString() : null

    const base = {
      name: name.trim(),
      description: description.trim() || undefined,
      creditsAmount: redeemType === 'credits' ? credits : 0,
      maxUses: maxUses ? parseInt(maxUses) || null : null,
      expiresAt: isoExpires,
      isActive: true,
      redeemType,
      ...(redeemType === 'period_card' ? { periodCardPlanId } : {}),
    }

    if (mode === 'single') {
      if (!code.trim()) { setError('请填写兑换码'); return }
      onSubmit({ ...base, code: code.trim().toUpperCase() }, 'single')
    } else {
      if (count < 1) { setError('数量至少为 1'); return }
      onSubmit({ ...base, prefix: prefix.trim().toUpperCase() || 'REDEEM', count }, 'batch')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">
            {mode === 'single' ? '创建兑换码' : '批量生成兑换码'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {mode === 'single' ? (
            <div>
              <label className="text-sm font-medium">兑换码 *</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="例如: GIFT2024"
                className="mt-1"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">前缀</label>
                <Input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                  placeholder="REDEEM"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">数量 *</label>
                <Input
                  type="number"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 0)}
                  min={1}
                  max={1000}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">名称 *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 新用户礼包"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">描述</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选描述"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">兑换类型 *</label>
            <select
              value={redeemType}
              onChange={(e) => {
                const val = e.target.value as 'credits' | 'period_card'
                setRedeemType(val)
                if (val === 'credits') setPeriodCardPlanId('')
                if (val === 'period_card') setCreditsAmount('0')
              }}
              className={cn(
                'h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              <option value="credits">积分充值</option>
              <option value="period_card">期卡套餐</option>
            </select>
          </div>

          {redeemType === 'period_card' && (
            <div>
              <label className="text-sm font-medium">期卡套餐 *</label>
              <select
                value={periodCardPlanId}
                onChange={(e) => setPeriodCardPlanId(e.target.value)}
                className={cn(
                  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm mt-1',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="">请选择套餐</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} ({plan.periodDays}天 / 每日{plan.dailyCredits}积分)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {redeemType === 'credits' && (
              <div>
                <label className="text-sm font-medium">积分数量 *</label>
                <Input
                  type="number"
                  value={creditsAmount}
                  onChange={(e) => setCreditsAmount(e.target.value)}
                  placeholder="例如: 10.00"
                  min={0.01}
                  step={0.01}
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">最大使用次数</label>
              <Input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="留空为无限"
                min={1}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">过期时间</label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="px-4">
          {(error || serverError) && (
            <p className="text-sm text-red-500">{error || serverError}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                创建中...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                {mode === 'single' ? '创建' : `生成 ${count} 个`}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 使用记录弹窗
// ============================================================

function UsageDialog({
  codeId,
  codeName,
  onClose,
}: {
  codeId: string
  codeName: string
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['redeem-code-usages', codeId],
    queryFn: () => redeemCodesService.getUsages(codeId),
  })

  const usages: RedeemUsage[] = data?.data?.usages ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">使用记录 - {codeName}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : usages.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">暂无使用记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>获得积分</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usages.map((usage) => (
                  <TableRow key={usage.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{usage.userName || '-'}</p>
                        <p className="text-xs text-muted-foreground">{usage.userEmail || usage.userId}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-green-600">
                      +{formatCredits(usage.creditsAwarded)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(usage.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 批量生成结果弹窗
// ============================================================

function BatchResultDialog({
  codes,
  onClose,
}: {
  codes: string[]
  onClose: () => void
}) {
  const handleCopyAll = () => {
    navigator.clipboard.writeText(codes.join('\n'))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">生成成功 - {codes.length} 个兑换码</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="bg-muted rounded-lg p-3 max-h-60 overflow-y-auto font-mono text-sm space-y-1">
            {codes.map((code, i) => (
              <div key={i} className="flex items-center justify-between">
                <span>{code}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(code)}
                  className="text-muted-foreground hover:text-foreground ml-2"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={handleCopyAll}>
            <Copy className="h-4 w-4 mr-1.5" />
            复制全部
          </Button>
          <Button onClick={onClose}>关闭</Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 主页面
// ============================================================

export default function RedeemCodeList() {
  const queryClient = useQueryClient()

  // 筛选状态
  const [filters, setFilters] = useState<RedeemCodeFilters>({
    page: 1,
    limit: PAGE_SIZE,
    status: '',
    search: '',
  })
  const [searchInput, setSearchInput] = useState('')

  // 弹窗状态
  const [createMode, setCreateMode] = useState<'single' | 'batch' | null>(null)
  const [viewUsageCode, setViewUsageCode] = useState<RedeemCode | null>(null)
  const [batchResult, setBatchResult] = useState<string[] | null>(null)

  // 查询
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['redeem-codes', filters],
    queryFn: () => redeemCodesService.getRedeemCodes(filters),
    placeholderData: (prev) => prev,
  })

  // 获取套餐列表（创建表单 + 列表展示用）
  const { data: plansData } = useQuery({
    queryKey: ['period-card-plans-all'],
    queryFn: () => periodCardsService.getPlans(),
  })

  const allPlans: PeriodCardPlan[] = plansData?.data?.plans ?? []
  const enabledPlans = allPlans.filter((p) => p.isEnabled)
  const planNameMap = new Map(allPlans.map((p) => [p.id, p.name]))

  const redeemCodes: RedeemCode[] = data?.data?.redeemCodes ?? []
  const meta = data?.meta
  const total = meta?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1

  // 创建错误信息
  const [mutationError, setMutationError] = useState('')

  // 创建
  const createMutation = useMutation({
    mutationFn: (data: CreateRedeemCodeRequest) => redeemCodesService.createRedeemCode(data),
    onSuccess: () => {
      setMutationError('')
      queryClient.invalidateQueries({ queryKey: ['redeem-codes'] })
      setCreateMode(null)
    },
    onError: (err: Error) => {
      setMutationError(err.message || '创建失败')
    },
  })

  // 批量创建
  const batchMutation = useMutation({
    mutationFn: (data: BatchCreateRedeemRequest) => redeemCodesService.batchCreate(data),
    onSuccess: (res) => {
      setMutationError('')
      queryClient.invalidateQueries({ queryKey: ['redeem-codes'] })
      setCreateMode(null)
      setBatchResult(res?.data?.codes ?? [])
    },
    onError: (err: Error) => {
      setMutationError(err.message || '批量创建失败')
    },
  })

  // 删除
  const deleteMutation = useMutation({
    mutationFn: (id: string) => redeemCodesService.deleteRedeemCode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redeem-codes'] })
    },
  })

  // 启用/禁用
  const toggleMutation = useMutation({
    mutationFn: (id: string) => redeemCodesService.toggleRedeemCode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['redeem-codes'] })
    },
  })

  // 搜索
  const handleSearch = useCallback(() => {
    setFilters((prev) => ({ ...prev, page: 1, search: searchInput.trim() }))
  }, [searchInput])

  // 创建提交
  const handleCreateSubmit = useCallback(
    (data: CreateRedeemCodeRequest | BatchCreateRedeemRequest, mode: 'single' | 'batch') => {
      if (mode === 'single') {
        createMutation.mutate(data as CreateRedeemCodeRequest)
      } else {
        batchMutation.mutate(data as BatchCreateRedeemRequest)
      }
    },
    [createMutation, batchMutation]
  )

  // 删除确认
  const handleDelete = useCallback(
    (code: RedeemCode) => {
      if (window.confirm(`确定要删除兑换码 "${code.code}" 吗？`)) {
        deleteMutation.mutate(code.id)
      }
    },
    [deleteMutation]
  )

  // 复制兑换码
  const handleCopy = useCallback((code: string) => {
    navigator.clipboard.writeText(code)
  }, [])

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">兑换码管理</h1>
          <p className="text-muted-foreground mt-1">创建和管理兑换码，支持积分充值和期卡套餐两种兑换类型</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCreateMode('batch')}>
            <Layers className="h-4 w-4 mr-1.5" />
            批量生成
          </Button>
          <Button onClick={() => setCreateMode('single')}>
            <Plus className="h-4 w-4 mr-1.5" />
            创建兑换码
          </Button>
        </div>
      </div>

      {/* 筛选栏 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索兑换码或名称..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9"
              />
            </div>

            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  page: 1,
                  status: e.target.value as RedeemCodeFilters['status'],
                }))
              }
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
              onClick={() => queryClient.invalidateQueries({ queryKey: ['redeem-codes'] })}
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
                <TableHead>兑换码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead className="text-right">积分</TableHead>
                <TableHead className="text-center">使用次数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>过期时间</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : redeemCodes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    暂无兑换码数据
                  </TableCell>
                </TableRow>
              ) : (
                redeemCodes.map((code) => {
                  const status = getStatusBadge(code)
                  return (
                    <TableRow key={code.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-sm font-medium">{code.code}</code>
                          <button
                            onClick={() => handleCopy(code.code)}
                            className="text-muted-foreground hover:text-foreground"
                            title="复制"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{code.name}</p>
                          {code.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {code.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {code.redeemType === 'period_card' ? (
                          <div>
                            <Badge variant="outline" className="text-blue-600 border-blue-300">
                              期卡
                            </Badge>
                            {code.periodCardPlanId && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {planNameMap.get(code.periodCardPlanId) || '未知套餐'}
                              </p>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-green-600 border-green-300">
                            积分
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {code.redeemType === 'period_card' ? '-' : formatCredits(code.creditsAmount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm">
                          {code.usedCount}
                          {code.maxUses ? ` / ${code.maxUses}` : ''}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {code.expiresAt ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDateTime(code.expiresAt)}
                          </span>
                        ) : (
                          '永不过期'
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(code.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewUsageCode(code)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="查看使用记录"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toggleMutation.mutate(code.id)}
                            className={cn(
                              'p-1.5 rounded hover:bg-muted',
                              code.isActive
                                ? 'text-green-600 hover:text-green-700'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                            title={code.isActive ? '禁用' : '启用'}
                          >
                            {code.isActive ? (
                              <ToggleRight className="h-4 w-4" />
                            ) : (
                              <ToggleLeft className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(code)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-600"
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* 分页 */}
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

      {/* 创建弹窗 */}
      {createMode && (
        <CreateDialog
          mode={createMode}
          onClose={() => { setCreateMode(null); setMutationError('') }}
          onSubmit={handleCreateSubmit}
          loading={createMutation.isPending || batchMutation.isPending}
          serverError={mutationError}
          plans={enabledPlans}
        />
      )}

      {/* 使用记录弹窗 */}
      {viewUsageCode && (
        <UsageDialog
          codeId={viewUsageCode.id}
          codeName={viewUsageCode.code}
          onClose={() => setViewUsageCode(null)}
        />
      )}

      {/* 批量生成结果弹窗 */}
      {batchResult && (
        <BatchResultDialog
          codes={batchResult}
          onClose={() => setBatchResult(null)}
        />
      )}
    </div>
  )
}
