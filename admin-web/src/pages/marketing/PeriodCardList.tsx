import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Save,
  Pencil,
  Loader2,
  Calculator,
  ChevronDown,
  ChevronUp,
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
  type PeriodCardPlan,
  type PlanFilters,
  type CreatePlanRequest,
  type UpdatePlanRequest,
} from '@/services/period-cards'

// ============================================================
// 常量
// ============================================================

const PAGE_SIZE = 20

const periodTypeLabels: Record<string, string> = {
  daily: '日卡',
  weekly: '周卡',
  monthly: '月卡',
}

const enabledFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'true', label: '已启用' },
  { value: 'false', label: '已禁用' },
]

// ============================================================
// 价格计算器组件
// ============================================================

function PriceCalculator() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [dailyUsdAmount, setDailyUsdAmount] = useState('50')
  const [customRate, setCustomRate] = useState('1')
  const [periodDays, setPeriodDays] = useState('30')

  // 计算结果
  const dailyUsd = parseFloat(dailyUsdAmount) || 0
  const rate = parseFloat(customRate) || 0
  const days = parseInt(periodDays) || 0

  // 每天给的积分额度 = 每日美元额度 × 7（官方汇率） × 10（1积分=0.1人民币）
  const dailyCredits = dailyUsd * 7 * 10

  // 人民币价格 = 每日美元额度 × 期卡天数 × 自定义汇率
  const priceRmb = dailyUsd * days * rate

  // 官方价格 = 每日美元额度 × 期卡天数 × 7（官方汇率）
  const officialPrice = dailyUsd * days * 7

  // 便宜百分比 = (官方价格 - 自定义价格) / 官方价格 × 100%
  const discountPercent = officialPrice > 0 ? ((officialPrice - priceRmb) / officialPrice * 100) : 0

  const hasValidInput = dailyUsd > 0 && rate > 0 && days > 0

  return (
    <Card>
      <CardContent className="p-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">期卡价格计算器</h3>
            <Badge variant="outline" className="ml-2">工具</Badge>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              快速计算期卡套餐的积分额度和价格，帮助你制定合理的定价策略
            </p>

            {/* 输入区域 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  每日美元额度 ($)
                </label>
                <Input
                  type="number"
                  value={dailyUsdAmount}
                  onChange={(e) => setDailyUsdAmount(e.target.value)}
                  placeholder="例如: 50"
                  min={0}
                  step={0.01}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  每天分给用户的美元额度
                </p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">
                  自定义汇率 (RMB/USD)
                </label>
                <Input
                  type="number"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  placeholder="例如: 1"
                  min={0}
                  step={0.01}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  每美元的人民币价格
                </p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">
                  期卡天数
                </label>
                <Input
                  type="number"
                  value={periodDays}
                  onChange={(e) => setPeriodDays(e.target.value)}
                  placeholder="例如: 30"
                  min={1}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  期卡有效天数
                </p>
              </div>
            </div>

            {/* 计算结果 */}
            {hasValidInput && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border-2 border-primary/20 rounded-lg bg-primary/5">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">每天给的积分额度</p>
                  <p className="text-2xl font-bold text-green-600">
                    {dailyCredits.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    积分 (1积分=0.1元)
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">人民币价格</p>
                  <p className="text-2xl font-bold text-blue-600">
                    ¥{priceRmb.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    期卡售价
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">相对官方汇率优惠</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {discountPercent.toFixed(2)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    官方价: ¥{officialPrice.toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {/* 计算说明 */}
            <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/30 rounded">
              <p className="font-medium mb-2">计算公式说明：</p>
              <p>• 每天积分 = 每日美元 × 7（官方汇率） × 10（1积分=0.1元）</p>
              <p>• 人民币价格 = 每日美元 × 期卡天数 × 自定义汇率</p>
              <p>• 官方价格 = 每日美元 × 期卡天数 × 7（官方汇率）</p>
              <p>• 优惠百分比 = (官方价格 - 自定义价格) / 官方价格 × 100%</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// 创建/编辑弹窗
// ============================================================

function PlanDialog({
  plan,
  onClose,
  onSubmit,
  loading,
  serverError,
}: {
  plan?: PeriodCardPlan | null
  onClose: () => void
  onSubmit: (data: CreatePlanRequest | UpdatePlanRequest) => void
  loading: boolean
  serverError?: string
}) {
  const isEdit = !!plan

  const [name, setName] = useState(plan?.name ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly'>(plan?.periodType ?? 'monthly')
  const [periodDays, setPeriodDays] = useState(String(plan?.periodDays ?? 30))
  const [quotaMode, setQuotaMode] = useState<'daily' | 'total'>(plan?.quotaMode ?? 'daily')
  const [dailyCredits, setDailyCredits] = useState(String(plan?.dailyCredits ?? 0))
  const [totalCredits, setTotalCredits] = useState(String(plan?.totalCredits ?? 0))
  const [priceYuan, setPriceYuan] = useState(plan ? plan.priceYuan : '')
  const [sortOrder, setSortOrder] = useState(String(plan?.sortOrder ?? 0))
  const [isEnabled, setIsEnabled] = useState(plan?.isEnabled ?? true)
  const [error, setError] = useState('')

  const handleSubmit = () => {
    setError('')
    if (!name.trim()) { setError('请填写套餐名称'); return }
    const days = parseInt(periodDays)
    if (!days || days < 1) { setError('请填写有效的天数'); return }

    if (quotaMode === 'daily') {
      const credits = parseFloat(dailyCredits)
      if (isNaN(credits) || credits <= 0) { setError('每日重置模式下，每日积分必须大于 0'); return }
    } else {
      const credits = parseFloat(totalCredits)
      if (isNaN(credits) || credits <= 0) { setError('总量池模式下，总积分必须大于 0'); return }
    }

    const price = parseFloat(priceYuan)
    if (!price || price <= 0) { setError('请填写有效的价格'); return }

    const priceCents = Math.round(price * 100)

    if (isEdit) {
      const updates: UpdatePlanRequest = {
        name: name.trim(),
        description: description.trim() || null,
        periodType,
        periodDays: days,
        quotaMode,
        dailyCredits: quotaMode === 'daily' ? parseFloat(dailyCredits) : 0,
        totalCredits: quotaMode === 'total' ? parseFloat(totalCredits) : 0,
        priceCents,
        isEnabled,
        sortOrder: parseInt(sortOrder) || 0,
      }
      onSubmit(updates)
    } else {
      const data: CreatePlanRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        periodType,
        periodDays: days,
        quotaMode,
        dailyCredits: quotaMode === 'daily' ? parseFloat(dailyCredits) : 0,
        totalCredits: quotaMode === 'total' ? parseFloat(totalCredits) : 0,
        priceCents,
        isEnabled,
        sortOrder: parseInt(sortOrder) || 0,
      }
      onSubmit(data)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">
            {isEdit ? '编辑期卡套餐' : '创建期卡套餐'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium">套餐名称 *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 月卡基础版"
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">周期类型 *</label>
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as 'daily' | 'weekly' | 'monthly')}
                className={cn(
                  'mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <option value="daily">日卡</option>
                <option value="weekly">周卡</option>
                <option value="monthly">月卡</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">有效天数 *</label>
              <Input
                type="number"
                value={periodDays}
                onChange={(e) => setPeriodDays(e.target.value)}
                min={1}
                className="mt-1"
              />
            </div>
          </div>

          {/* 额度模式 */}
          <div>
            <label className="text-sm font-medium">额度模式 *</label>
            <div className="mt-1.5 flex gap-3">
              <label
                className={cn(
                  'flex-1 flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-colors',
                  quotaMode === 'daily'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-input hover:bg-muted/50'
                )}
              >
                <input
                  type="radio"
                  name="quotaMode"
                  value="daily"
                  checked={quotaMode === 'daily'}
                  onChange={() => setQuotaMode('daily')}
                  className="accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">每日重置</p>
                  <p className="text-xs text-muted-foreground">每天固定额度，次日重置</p>
                </div>
              </label>
              <label
                className={cn(
                  'flex-1 flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-colors',
                  quotaMode === 'total'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-input hover:bg-muted/50'
                )}
              >
                <input
                  type="radio"
                  name="quotaMode"
                  value="total"
                  checked={quotaMode === 'total'}
                  onChange={() => setQuotaMode('total')}
                  className="accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">总量池</p>
                  <p className="text-xs text-muted-foreground">整个周期共享总额度，按总额度扣减</p>
                </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {quotaMode === 'daily' ? (
              <div>
                <label className="text-sm font-medium">每日积分 *</label>
                <Input
                  type="number"
                  value={dailyCredits}
                  onChange={(e) => setDailyCredits(e.target.value)}
                  min={0}
                  step={0.01}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">每天可用积分，次日重置</p>
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium">总积分 *</label>
                <Input
                  type="number"
                  value={totalCredits}
                  onChange={(e) => setTotalCredits(e.target.value)}
                  min={0}
                  step={0.01}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">整个周期的总积分，用完即止</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">价格（元） *</label>
              <Input
                type="number"
                value={priceYuan}
                onChange={(e) => setPriceYuan(e.target.value)}
                min={0.01}
                step={0.01}
                placeholder="例如: 29.90"
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">排序权重</label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="rounded"
                />
                启用套餐
              </label>
            </div>
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
                保存中...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                {isEdit ? '保存' : '创建'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 主页面
// ============================================================

export default function PeriodCardList() {
  const queryClient = useQueryClient()

  const [filters, setFilters] = useState<PlanFilters>({
    page: 1,
    limit: PAGE_SIZE,
  })
  const [enabledFilter, setEnabledFilter] = useState('')

  // 弹窗状态
  const [showCreate, setShowCreate] = useState(false)
  const [editPlan, setEditPlan] = useState<PeriodCardPlan | null>(null)

  // 查询
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['period-card-plans', filters, enabledFilter],
    queryFn: () =>
      periodCardsService.getPlans({
        ...filters,
        isEnabled: enabledFilter ? enabledFilter === 'true' : undefined,
      }),
    placeholderData: (prev) => prev,
  })

  const plans: PeriodCardPlan[] = data?.data?.plans ?? []
  const meta = data?.meta
  const total = meta?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1

  const [mutationError, setMutationError] = useState('')

  // 创建
  const createMutation = useMutation({
    mutationFn: (data: CreatePlanRequest) => periodCardsService.createPlan(data),
    onSuccess: () => {
      setMutationError('')
      queryClient.invalidateQueries({ queryKey: ['period-card-plans'] })
      setShowCreate(false)
    },
    onError: (err: Error) => {
      setMutationError(err.message || '创建失败')
    },
  })

  // 更新
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePlanRequest }) =>
      periodCardsService.updatePlan(id, data),
    onSuccess: () => {
      setMutationError('')
      queryClient.invalidateQueries({ queryKey: ['period-card-plans'] })
      setEditPlan(null)
    },
    onError: (err: Error) => {
      setMutationError(err.message || '更新失败')
    },
  })

  // 删除
  const deleteMutation = useMutation({
    mutationFn: (id: string) => periodCardsService.deletePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['period-card-plans'] })
    },
  })

  // 启用/禁用
  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      periodCardsService.updatePlan(id, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['period-card-plans'] })
    },
  })

  const handleCreateSubmit = useCallback(
    (data: CreatePlanRequest | UpdatePlanRequest) => {
      createMutation.mutate(data as CreatePlanRequest)
    },
    [createMutation]
  )

  const handleEditSubmit = useCallback(
    (data: CreatePlanRequest | UpdatePlanRequest) => {
      if (!editPlan) return
      updateMutation.mutate({ id: editPlan.id, data: data as UpdatePlanRequest })
    },
    [editPlan, updateMutation]
  )

  const handleDelete = useCallback(
    (plan: PeriodCardPlan) => {
      if (window.confirm(`确定要删除套餐 "${plan.name}" 吗？`)) {
        deleteMutation.mutate(plan.id)
      }
    },
    [deleteMutation]
  )

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">期卡套餐管理</h1>
          <p className="text-muted-foreground mt-1">创建和管理期卡套餐，用户可购买期卡获得每日积分额度</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setMutationError('') }}>
          <Plus className="h-4 w-4 mr-1.5" />
          创建套餐
        </Button>
      </div>

      {/* 价格计算器 */}
      <PriceCalculator />

      {/* 筛选栏 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={enabledFilter}
              onChange={(e) => {
                setEnabledFilter(e.target.value)
                setFilters((prev) => ({ ...prev, page: 1 }))
              }}
              className={cn(
                'h-9 rounded-md border border-input bg-background px-3 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            >
              {enabledFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['period-card-plans'] })}
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
                <TableHead>套餐名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>额度模式</TableHead>
                <TableHead className="text-right">天数</TableHead>
                <TableHead className="text-right">积分额度</TableHead>
                <TableHead className="text-right">价格</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>排序</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    暂无期卡套餐数据
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{plan.name}</p>
                        {plan.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {plan.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {periodTypeLabels[plan.periodType] ?? plan.periodType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.quotaMode === 'total' ? 'default' : 'outline'}>
                        {plan.quotaMode === 'total' ? '总量池' : '每日重置'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{plan.periodDays}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {plan.quotaMode === 'total' ? (
                        <span title="总积分">{plan.totalCredits} (总)</span>
                      ) : (
                        <span title="每日积分">{plan.dailyCredits} /天</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ¥{plan.priceYuan}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.isEnabled ? 'default' : 'secondary'}>
                        {plan.isEnabled ? '启用' : '禁用'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {plan.sortOrder}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(plan.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditPlan(plan); setMutationError('') }}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="编辑"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate({ id: plan.id, isEnabled: !plan.isEnabled })}
                          className={cn(
                            'p-1.5 rounded hover:bg-muted',
                            plan.isEnabled
                              ? 'text-green-600 hover:text-green-700'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                          title={plan.isEnabled ? '禁用' : '启用'}
                        >
                          {plan.isEnabled ? (
                            <ToggleRight className="h-4 w-4" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(plan)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-600"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
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
      {showCreate && (
        <PlanDialog
          onClose={() => { setShowCreate(false); setMutationError('') }}
          onSubmit={handleCreateSubmit}
          loading={createMutation.isPending}
          serverError={mutationError}
        />
      )}

      {/* 编辑弹窗 */}
      {editPlan && (
        <PlanDialog
          plan={editPlan}
          onClose={() => { setEditPlan(null); setMutationError('') }}
          onSubmit={handleEditSubmit}
          loading={updateMutation.isPending}
          serverError={mutationError}
        />
      )}
    </div>
  )
}
