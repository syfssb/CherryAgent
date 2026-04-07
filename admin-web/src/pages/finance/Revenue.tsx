import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Download,
  RefreshCw,
  DollarSign,
  Users,
  BarChart3,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import {
  formatCurrency,
  formatDateTime,
  getPaymentMethodLabel,
  exportToCSV,
} from '@/lib/utils'
import {
  financeService,
  type RevenueResponse,
  type RevenueChartItem,
} from '@/services/finance'

const revenueTrendConfig = {
  recharge: {
    label: '充值收入',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig

const paymentMethodConfig = {
  stripe: {
    label: 'Stripe',
    color: 'hsl(var(--chart-1))',
  },
  wechat: {
    label: '微信支付',
    color: '#07C160',
  },
  alipay: {
    label: '支付宝',
    color: '#1677FF',
  },
} satisfies ChartConfig

/** ISO datetime string 用于 API 请求 */
function toISOString(d: Date): string {
  return d.toISOString()
}

/** 快捷日期范围选项 */
const DATE_PRESETS: Array<{ label: string; days: number | 'all' }> = [
  { label: '近7天', days: 7 },
  { label: '近30天', days: 30 },
  { label: '近90天', days: 90 },
  { label: '近半年', days: 180 },
  { label: '近1年', days: 365 },
  { label: '全部', days: 'all' },
]

/** 项目上线日期 */
const PROJECT_START = new Date('2026-01-01T00:00:00')

function getPresetFrom(days: number | 'all'): Date {
  if (days === 'all') return PROJECT_START
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

function getDefaultDateRange(): { from: Date; to: Date } {
  return { from: getPresetFrom(30), to: new Date() }
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="h-4 bg-muted rounded w-16 mb-2" />
              <div className="h-8 bg-muted rounded w-28 mb-2" />
              <div className="h-3 bg-muted rounded w-20" />
            </div>
            <div className="w-10 h-10 bg-muted rounded-lg" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ChartSkeleton({ height = 350 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ height }}
    >
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function ErrorAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="text-destructive flex-shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
          <h3 className="text-destructive font-medium text-[13px] mb-1">数据加载失败</h3>
          <p className="text-destructive/80 text-[13px]">{message}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="mt-2 text-destructive hover:text-destructive/80"
          >
            重试
          </Button>
        </div>
      </div>
    </div>
  )
}

function EmptyPlaceholder({ height = 350, message = '暂无数据' }: { height?: number; message?: string }) {
  return (
    <div
      className="flex items-center justify-center text-muted-foreground text-[13px]"
      style={{ height }}
    >
      {message}
    </div>
  )
}

function transformChartDataForRevenueTrend(chartData: RevenueChartItem[]) {
  return chartData.map((item) => ({
    date: item.period,
    recharge: item.revenue.total,
  }))
}

function transformChartDataForPaymentMethods(chartData: RevenueChartItem[]) {
  const stripeTotal = chartData.reduce((sum, item) => sum + item.revenue.stripe, 0)
  const wechatTotal = chartData.reduce((sum, item) => sum + (item.revenue.wechat ?? 0), 0)
  const alipayTotal = chartData.reduce((sum, item) => sum + (item.revenue.alipay ?? 0), 0)
  const grandTotal = stripeTotal + wechatTotal + alipayTotal

  const methods: Array<{ method: string; amount: number; percentage: number }> = []
  const addIfPositive = (method: string, amount: number) => {
    if (amount > 0) {
      methods.push({ method, amount, percentage: grandTotal > 0 ? parseFloat(((amount / grandTotal) * 100).toFixed(1)) : 0 })
    }
  }

  addIfPositive('wechat', wechatTotal)
  addIfPositive('alipay', alipayTotal)
  addIfPositive('stripe', stripeTotal)

  return methods
}

function getPaymentLabel(method: string): string {
  switch (method) {
    case 'stripe':
      return 'Stripe'
    case 'wechat':
      return '微信支付'
    case 'alipay':
      return '支付宝'
    case 'xunhupay':
      return '虎皮椒支付'
    default:
      return getPaymentMethodLabel(method)
  }
}

export default function RevenuePage() {
  const defaultRange = useMemo(() => getDefaultDateRange(), [])
  const [dateFrom, setDateFrom] = useState<Date>(defaultRange.from)
  const [dateTo, setDateTo] = useState<Date>(defaultRange.to)
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')

  const {
    data: revenueResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['finance-revenue', dateFrom.getTime(), dateTo.getTime(), groupBy],
    queryFn: () =>
      financeService.getRevenue({
        startDate: toISOString(dateFrom),
        endDate: toISOString(dateTo),
        groupBy,
      }),
    retry: 2,
    staleTime: 1000 * 60 * 2,
  })

  const revenueData = revenueResponse?.data as RevenueResponse | undefined

  const revenueTrendData = useMemo(() => {
    if (!revenueData?.chartData) return []
    return transformChartDataForRevenueTrend(revenueData.chartData)
  }, [revenueData?.chartData])

  const paymentMethodsData = useMemo(() => {
    if (!revenueData?.chartData) return []
    return transformChartDataForPaymentMethods(revenueData.chartData)
  }, [revenueData?.chartData])

  const handleRefresh = () => {
    refetch()
  }

  const handleExportRevenue = () => {
    if (!revenueData?.chartData || revenueData.chartData.length === 0) return

    const exportData = revenueData.chartData.map((item) => ({
      '周期': item.period,
      '总收入': item.revenue.total,
      'Stripe收入': item.revenue.stripe,
      '虎皮椒收入': item.revenue.xunhupay,
    }))

    exportToCSV(exportData, `收入报表_${formatDateTime(new Date())}.csv`)
  }

  const handleExportMethods = () => {
    if (paymentMethodsData.length === 0) return

    const exportData = paymentMethodsData.map((method) => ({
      '支付方式': getPaymentLabel(method.method),
      '金额': method.amount,
      '占比': `${method.percentage}%`,
    }))

    exportToCSV(
      exportData,
      `支付方式统计_${formatDateTime(new Date())}.csv`
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">收入统计</h1>
          <p className="text-[13px] text-muted-foreground mt-1">查看平台的收入分析和统计数据</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-1.5"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </Button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <ErrorAlert
          message={error instanceof Error ? error.message : '未知错误'}
          onRetry={handleRefresh}
        />
      )}

      {/* 日期筛选 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* 快捷选择 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted-foreground mr-1">快捷：</span>
            {DATE_PRESETS.map((preset) => {
              const presetFrom = getPresetFrom(preset.days)
              // 比较日期部分（忽略精确时间）
              const isActive = dateFrom.toDateString() === presetFrom.toDateString()
              return (
                <Button
                  key={preset.label}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    setDateFrom(presetFrom)
                    setDateTo(new Date())
                  }}
                >
                  {preset.label}
                </Button>
              )
            })}
          </div>

          {/* 自定义日期时间 + 分组 */}
          <div className="flex flex-col lg:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-[13px] text-muted-foreground mb-1.5">
                开始时间
              </label>
              <DateTimePicker
                value={dateFrom}
                onChange={(d) => d && setDateFrom(d)}
                maxDate={dateTo}
                placeholder="选择开始时间"
              />
            </div>

            <div className="flex-1">
              <label className="block text-[13px] text-muted-foreground mb-1.5">
                截止时间
              </label>
              <DateTimePicker
                value={dateTo}
                onChange={(d) => d && setDateTo(d)}
                maxDate={new Date()}
                minDate={dateFrom}
                placeholder="选择截止时间"
              />
            </div>

            <div className="flex-1">
              <label className="block text-[13px] text-muted-foreground mb-1.5">
                分组方式
              </label>
              <select
                value={groupBy}
                onChange={(e) =>
                  setGroupBy(e.target.value as 'day' | 'week' | 'month')
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="day">按天</option>
                <option value="week">按周</option>
                <option value="month">按月</option>
              </select>
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
              应用筛选
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总收入</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">
                  {formatCurrency(revenueData?.summary.totalRevenue ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {revenueData?.summary.paymentCount ?? 0} 笔充值
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">付费用户</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">
                  {revenueData?.summary.payingUsers ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  ARPU {formatCurrency(parseFloat(revenueData?.summary.arpu ?? '0'))}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">日均收入</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">
                  {formatCurrency(
                    revenueTrendData.length > 0
                      ? (revenueData?.summary.totalRevenue ?? 0) / revenueTrendData.length
                      : 0
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  共 {revenueTrendData.length} 个统计周期
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* 收入趋势图 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>收入趋势</CardTitle>
              <CardDescription>充值收入的趋势变化</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportRevenue}
              disabled={isLoading || revenueTrendData.length === 0}
              className="gap-1.5"
            >
              <Download size={14} />
              导出
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ChartSkeleton height={350} />
          ) : revenueTrendData.length > 0 ? (
            <ChartContainer config={revenueTrendConfig} className="h-[350px] w-full">
              <LineChart data={revenueTrendData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(value as number)}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="monotone"
                  dataKey="recharge"
                  stroke="var(--color-recharge)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <EmptyPlaceholder height={350} />
          )}
        </CardContent>
      </Card>

      {/* 支付方式分布 */}
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>支付方式分布</CardTitle>
                <CardDescription>不同支付方式的充值占比</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportMethods}
                disabled={isLoading || paymentMethodsData.length === 0}
                className="gap-1.5"
              >
                <Download size={14} />
                导出
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ChartSkeleton height={220} />
            ) : paymentMethodsData.length > 0 ? (
              <div className="flex items-center gap-6">
                <ChartContainer config={paymentMethodConfig} className="h-[220px] w-1/2">
                  <PieChart>
                    <Pie
                      data={paymentMethodsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="amount"
                      nameKey="method"
                    >
                      {paymentMethodsData.map((entry) => (
                        <Cell
                          key={`cell-${entry.method}`}
                          fill={`var(--color-${entry.method})`}
                        />
                      ))}
                    </Pie>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => formatCurrency(value as number)}
                          nameKey="method"
                        />
                      }
                    />
                  </PieChart>
                </ChartContainer>

                <div className="flex-1 space-y-2">
                  {paymentMethodsData.map((method) => (
                    <div
                      key={method.method}
                      className="flex items-center justify-between text-[13px]"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: `var(--color-${method.method})`,
                          }}
                        />
                        <span className="text-muted-foreground">
                          {getPaymentLabel(method.method)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-foreground font-medium tabular-nums">
                          {formatCurrency(method.amount)}
                        </span>
                        <span className="text-muted-foreground text-[11px] tabular-nums">
                          {method.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyPlaceholder height={220} />
            )}
          </CardContent>
        </Card>

      </div>

      {/* 汇总信息 */}
      {revenueData?.summary && (
        <Card>
          <CardHeader>
            <CardTitle>汇总信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <p className="text-[13px] text-muted-foreground">总收入</p>
                <p className="text-foreground text-lg font-semibold tabular-nums mt-1">
                  {formatCurrency(revenueData.summary.totalRevenue)}
                </p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground">付费用户数</p>
                <p className="text-foreground text-lg font-semibold tabular-nums mt-1">
                  {revenueData.summary.payingUsers}
                </p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground">充值笔数</p>
                <p className="text-foreground text-lg font-semibold tabular-nums mt-1">
                  {revenueData.summary.paymentCount}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 数据时间范围 */}
      {revenueData?.period && (
        <div className="text-center text-muted-foreground text-[13px]">
          数据时间范围: {new Date(revenueData.period.start).toLocaleDateString('zh-CN')} - {new Date(revenueData.period.end).toLocaleDateString('zh-CN')}
          {' | '}分组方式: {revenueData.period.groupBy === 'day' ? '按天' : revenueData.period.groupBy === 'week' ? '按周' : '按月'}
        </div>
      )}
    </div>
  )
}
