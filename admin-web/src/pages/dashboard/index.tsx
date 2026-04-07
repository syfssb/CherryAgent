import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertCircle,
  Bell,
  Percent,
  DollarSign,
  UserCheck,
  BarChart3,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'
import { dashboardService, type TimeRange } from '@/services/dashboard'

// ────────── 常量 ──────────

/** 积分 → USD 转换系数（数据库 cost 字段 / 此值 = USD） */
const COST_POINTS_PER_USD = 70
/** 近似汇率，用于毛利率计算 */
const USD_TO_CNY = 7.2

// ────────── Chart Configs ──────────

const pnlChartConfig = {
  revenue: { label: '收入 (¥)', color: 'hsl(var(--chart-2))' },
  costCNY: { label: '成本 (¥ 等值)', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig

const userChartConfig = {
  newUsers: { label: '新注册', color: 'hsl(var(--chart-3))' },
  paidUsers: { label: '首次付费', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

const modelChartConfig = {
  cost: { label: '成本 ($)', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig

// ────────── 子组件 ──────────

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  change?: number
  changeLabel?: string
  icon: React.ReactNode
  loading?: boolean
  highlight?: boolean
}

function StatCard({
  title, value, subtitle, change, changeLabel = '较上期',
  icon, loading = false, highlight = false,
}: StatCardProps) {
  return (
    <Card className={highlight ? 'ring-1 ring-primary/20' : undefined}>
      {loading ? (
        <CardContent className="p-6">
          <div className="space-y-3">
            <div className="h-3 w-16 rounded shimmer" />
            <div className="h-7 w-24 rounded shimmer" />
            <div className="h-3 w-20 rounded shimmer" />
          </div>
        </CardContent>
      ) : (
        <>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <span className="h-4 w-4 text-muted-foreground">{icon}</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
            )}
            {change !== undefined && (
              <p className="text-xs text-muted-foreground mt-1">
                <span className={cn(
                  'inline-flex items-center gap-0.5',
                  change >= 0 ? 'text-emerald-500' : 'text-red-500',
                )}>
                  {change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {Math.abs(change).toFixed(1)}%
                </span>
                {' '}{changeLabel}
              </p>
            )}
          </CardContent>
        </>
      )}
    </Card>
  )
}

function ErrorAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="text-destructive flex-shrink-0 mt-0.5" size={18} />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-destructive">数据加载失败</h3>
          <p className="text-[13px] text-muted-foreground mt-1">{message}</p>
          <Button
            variant="ghost" size="sm" onClick={onRetry}
            className="mt-2 h-7 text-xs text-destructive hover:text-destructive"
          >
            重试
          </Button>
        </div>
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="h-[300px] space-y-3 p-4">
      <div className="h-4 w-24 rounded shimmer" />
      <div className="flex-1 flex items-end gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t shimmer"
            style={{ height: `${30 + ((i * 17 + 11) % 60)}%` }}
          />
        ))}
      </div>
      <div className="h-3 w-full rounded shimmer" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
      <BarChart3 size={40} strokeWidth={1} className="mb-3 text-muted-foreground/40" />
      <p className="text-sm">暂无数据</p>
      <p className="text-xs mt-1">选择其他时间范围试试</p>
    </div>
  )
}

// ────────── 主页面 ──────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')

  const {
    data: growthResponse,
    isLoading: growthLoading,
    error: growthError,
    refetch: refetchGrowth,
  } = useQuery({
    queryKey: ['dashboard-growth-stats', timeRange],
    queryFn: () => dashboardService.getGrowthStats(timeRange),
    retry: 2,
    staleTime: 1000 * 60,
  })

  const {
    data: withdrawalAlertsResponse,
    refetch: refetchWithdrawalAlerts,
  } = useQuery({
    queryKey: ['dashboard-withdrawal-alerts'],
    queryFn: () => dashboardService.getWithdrawalAlerts(),
    retry: 2,
    staleTime: 1000 * 30,
  })

  const growth = growthResponse?.data
  const withdrawalAlerts = withdrawalAlertsResponse?.data

  const handleRefresh = () => {
    refetchGrowth()
    refetchWithdrawalAlerts()
  }

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: 'today', label: '今日' },
    { value: '7d', label: '7天' },
    { value: '30d', label: '30天' },
    { value: '90d', label: '90天' },
  ]
  const timeRangeLabel = timeRanges.find((r) => r.value === timeRange)?.label ?? timeRange

  // ── 毛利率计算 ──
  const calcMargin = (revenue: number, costPoints: number) => {
    const costCNY = (costPoints / COST_POINTS_PER_USD) * USD_TO_CNY
    return revenue > 0 ? ((revenue - costCNY) / revenue * 100) : 0
  }

  const marginPct = growth
    ? calcMargin(growth.grossMargin.monthRevenue, growth.grossMargin.monthCost)
    : 0

  const marginChange = (() => {
    if (!growth) return undefined
    const prev = calcMargin(growth.grossMargin.prevMonthRevenue, growth.grossMargin.prevMonthCost)
    return marginPct - prev // 百分点差值
  })()

  // ── 图表数据 ──
  const pnlChartData = (growth?.dailyPnl ?? []).map((d) => ({
    date: new Date(d.day).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
    revenue: d.revenue,
    costCNY: parseFloat(((d.cost / COST_POINTS_PER_USD) * USD_TO_CNY).toFixed(2)),
  }))

  const userChartData = (growth?.dailyPnl ?? []).map((d) => ({
    date: new Date(d.day).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
    newUsers: d.newUsers,
    paidUsers: d.paidUsers,
  }))

  const modelChartData = (growth?.modelProfit ?? []).map((m) => ({
    name: m.model.length > 20 ? m.model.slice(0, 18) + '…' : m.model,
    cost: parseFloat((m.totalCost / COST_POINTS_PER_USD).toFixed(4)),
    users: m.uniqueUsers,
    requests: m.requestCount,
  }))

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">增长仪表盘</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">核心产品指标一览</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-input bg-background p-0.5">
            {timeRanges.map((range) => (
              <button
                key={range.value}
                onClick={() => setTimeRange(range.value)}
                disabled={growthLoading}
                className={cn(
                  'px-3 py-1 text-[13px] rounded-[5px] transition-colors',
                  timeRange === range.value
                    ? 'bg-foreground text-background font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                  growthLoading && 'opacity-50 cursor-not-allowed',
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={growthLoading} className="h-8 gap-1.5">
            <RefreshCw size={14} className={cn(growthLoading && 'animate-spin')} />
            刷新
          </Button>
        </div>
      </div>

      {/* ── Error ── */}
      {growthError && (
        <ErrorAlert
          message={growthError instanceof Error ? growthError.message : '未知错误'}
          onRetry={handleRefresh}
        />
      )}

      {/* ── 4 核心指标卡 ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="毛利率"
          value={growth ? `${marginPct.toFixed(1)}%` : '-'}
          subtitle={
            growth
              ? `月收入 ${formatCurrency(growth.grossMargin.monthRevenue)} · 成本 $${(growth.grossMargin.monthCost / COST_POINTS_PER_USD).toFixed(2)}`
              : undefined
          }
          change={marginChange}
          changeLabel="较上月 (pp)"
          icon={<Percent size={16} />}
          loading={growthLoading}
          highlight
        />
        <StatCard
          title="月充值收入"
          value={growth ? formatCurrency(growth.grossMargin.monthRevenue) : '-'}
          change={growth ? parseFloat(growth.grossMargin.revenueGrowth) : undefined}
          changeLabel="较上月"
          icon={<DollarSign size={16} />}
          loading={growthLoading}
        />
        <StatCard
          title="周活付费用户"
          value={growth ? formatNumber(growth.wapu.current) : '-'}
          subtitle={growth ? `付费用户占比 ${growth.conversion.overallRate}%` : undefined}
          change={growth ? parseFloat(growth.wapu.change) : undefined}
          changeLabel="较上周"
          icon={<UserCheck size={16} />}
          loading={growthLoading}
        />
        <StatCard
          title="首充转化率"
          value={growth ? `${growth.conversion.periodRate}%` : '-'}
          subtitle={
            growth
              ? `${growth.conversion.paidUsers}/${growth.conversion.totalUsers} 总付费率 ${growth.conversion.overallRate}%`
              : undefined
          }
          change={growth ? parseFloat(growth.conversion.periodRateChange) : undefined}
          changeLabel={`${timeRangeLabel}内新用户`}
          icon={<TrendingUp size={16} />}
          loading={growthLoading}
        />
      </div>

      {/* ── 提现提醒 ── */}
      {withdrawalAlerts && withdrawalAlerts.pendingCount > 0 && (
        <Card
          className="border-warning/50 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors"
          onClick={() => navigate('/referrals/withdrawals')}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-warning/15 flex items-center justify-center">
                <Bell className="text-warning" size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-foreground">
                  有 {withdrawalAlerts.pendingCount} 笔提现申请待审核
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  总金额: ¥{withdrawalAlerts.pendingAmount.toFixed(2)}
                </p>
              </div>
              <ArrowUpRight size={16} className="text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Row 2: 收入 vs 成本 + 用户获取 ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 收入 vs 成本趋势（双色面积图） */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">收入 vs 成本趋势</CardTitle>
            <CardDescription>过去 {timeRangeLabel} · 绿色 = 收入，红色 = 成本（¥ 等值）</CardDescription>
          </CardHeader>
          <CardContent>
            {growthLoading ? (
              <ChartSkeleton />
            ) : pnlChartData.length > 0 ? (
              <ChartContainer config={pnlChartConfig} className="h-[300px] w-full">
                <AreaChart data={pnlChartData}>
                  <defs>
                    <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gCostCNY" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-costCNY)" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="var(--color-costCNY)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone" dataKey="revenue"
                    stroke="var(--color-revenue)" strokeWidth={2}
                    fillOpacity={1} fill="url(#gRevenue)"
                  />
                  <Area
                    type="monotone" dataKey="costCNY"
                    stroke="var(--color-costCNY)" strokeWidth={2}
                    fillOpacity={1} fill="url(#gCostCNY)"
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>

        {/* 新增用户 & 首次付费 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">新增用户 & 首次付费</CardTitle>
            <CardDescription>过去 {timeRangeLabel} 的用户获取与转化</CardDescription>
          </CardHeader>
          <CardContent>
            {growthLoading ? (
              <ChartSkeleton />
            ) : userChartData.length > 0 ? (
              <ChartContainer config={userChartConfig} className="h-[300px] w-full">
                <BarChart data={userChartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="newUsers" fill="var(--color-newUsers)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paidUsers" fill="var(--color-paidUsers)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: 模型成本 + 留存 & ARPU ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* 模型成本分布 */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium">模型成本分布 ($)</CardTitle>
            <CardDescription>过去 {timeRangeLabel} 各模型 API 成本排行</CardDescription>
          </CardHeader>
          <CardContent>
            {growthLoading ? (
              <ChartSkeleton />
            ) : modelChartData.length > 0 ? (
              <ChartContainer config={modelChartConfig} className="h-[300px] w-full">
                <BarChart data={modelChartData} layout="vertical">
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis
                    type="category" dataKey="name"
                    tickLine={false} axisLine={false} tickMargin={8}
                    width={140}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="cost" fill="var(--color-cost)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>

        {/* 留存 & ARPU */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-medium">留存 & 单用户价值</CardTitle>
            <CardDescription>用户粘性与商业效率</CardDescription>
          </CardHeader>
          <CardContent>
            {growthLoading ? (
              <ChartSkeleton />
            ) : growth ? (
              <div className="space-y-6">
                {/* 7 日留存 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-foreground">7 日留存率</span>
                    <span className="text-lg font-bold tabular-nums">
                      {growth.retention.day7.rate}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(parseFloat(growth.retention.day7.rate) || 0, 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {growth.retention.day7.retained} / {growth.retention.day7.cohort} 用户回访
                  </p>
                </div>

                {/* 30 日留存 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-foreground">30 日留存率</span>
                    <span className="text-lg font-bold tabular-nums">
                      {growth.retention.day30.rate}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(parseFloat(growth.retention.day30.rate) || 0, 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {growth.retention.day30.retained} / {growth.retention.day30.cohort} 用户回访
                  </p>
                </div>

                {/* ARPU */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] text-foreground">ARPU（月均付费用户收入）</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        本月 {growth.arpu.payingUsers} 位付费用户
                      </p>
                    </div>
                    <span className="text-xl font-bold tabular-nums">
                      {formatCurrency(growth.arpu.value)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4: 高价值用户排行 ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">高价值用户排行</CardTitle>
          <CardDescription>
            累计充值 vs 消耗成本 · 红色高亮 = 成本超过充值的亏损用户
          </CardDescription>
        </CardHeader>
        <CardContent>
          {growthLoading ? (
            <ChartSkeleton />
          ) : growth?.topValueUsers && growth.topValueUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">#</th>
                    <th className="text-left py-2 pr-4 font-medium">用户</th>
                    <th className="text-right py-2 pr-4 font-medium">累计充值 (¥)</th>
                    <th className="text-right py-2 pr-4 font-medium">消耗成本 ($)</th>
                    <th className="text-right py-2 pr-4 font-medium">成本 (¥ 等值)</th>
                    <th className="text-right py-2 font-medium">最后活跃</th>
                  </tr>
                </thead>
                <tbody>
                  {growth.topValueUsers.map((user, i) => {
                    const costUSD = user.totalCost / COST_POINTS_PER_USD
                    const costCNY = costUSD * USD_TO_CNY
                    const isLoss = costCNY > user.totalDeposited
                    return (
                      <tr
                        key={user.userId}
                        className={cn(
                          'border-b last:border-0',
                          isLoss && 'bg-red-50 dark:bg-red-950/20',
                        )}
                      >
                        <td className="py-2.5 pr-4 tabular-nums">{i + 1}</td>
                        <td className="py-2.5 pr-4">
                          <p className="font-medium text-foreground">
                            {user.name || user.email || '未知'}
                          </p>
                          {user.name && user.email && (
                            <p className="text-[11px] text-muted-foreground">{user.email}</p>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">
                          ¥{user.totalDeposited.toFixed(2)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                          ${costUSD.toFixed(4)}
                        </td>
                        <td
                          className={cn(
                            'py-2.5 pr-4 text-right tabular-nums',
                            isLoss ? 'text-red-500 font-medium' : 'text-foreground',
                          )}
                        >
                          ¥{costCNY.toFixed(2)}
                          {isLoss && <span className="ml-1 text-[10px]">亏</span>}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {user.lastActive
                            ? new Date(user.lastActive).toLocaleDateString('zh-CN', {
                                month: '2-digit',
                                day: '2-digit',
                              })
                            : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>

      {/* ── Footer ── */}
      {growth?.period && (
        <p className="text-center text-[12px] text-muted-foreground">
          数据时间范围: {new Date(growth.period.start).toLocaleDateString('zh-CN')} –{' '}
          {new Date(growth.period.end).toLocaleDateString('zh-CN')}
          <span className="ml-2">· 汇率假设: $1 ≈ ¥{USD_TO_CNY}</span>
        </p>
      )}
    </div>
  )
}
