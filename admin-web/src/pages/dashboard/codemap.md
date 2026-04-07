# src/pages/dashboard/

## Responsibility

仪表板首页，展示平台关键业务指标的实时概览。包括用户增长、成本收入、请求量、支付方式分布等多维度可视化数据。

## Design

- **单文件组件**：`index.tsx` 包含所有仪表板逻辑，无子组件
- **数据获取**：
  - 依赖 `dashboardService` 的多个异步接口
  - 通过 `useQuery` 按时间范围（TimeRange: day/week/month/year）获取不同维度数据
  - 支持用户切换时间范围重新加载
- **图表库**：使用 recharts (AreaChart、BarChart、PieChart) 渲染时间序列和分布数据
- **统计卡片**：StatCard 组件展示关键指标（数值、同比变化、图标、加载态）

## Flow

1. 页面挂载 → 选择默认时间范围（如 'month'）
2. useQuery 并行加载 6 个数据源：
   - costData：成本趋势（AreaChart）
   - requestsData：请求数趋势（BarChart）
   - revenueData：收入趋势（AreaChart）
   - newUsersData：新增用户（BarChart）
   - paymentMethodData：支付方式分布（PieChart，含虎皮椒微信/支付宝、Stripe）
   - totalStats：汇总统计（用户数、成本、收入、请求数）
3. 用户点击时间范围按钮 → 重新调用 getQuery({ timeRange: 'week' }) → 图表动画更新
4. 点击"刷新"按钮 → queryClient.invalidateQueries → 强制重新加载所有数据
5. 加载中显示骨架屏，错误显示重试按钮

## Integration

- **Services**：
  - `dashboardService.getCostData(timeRange)`
  - `dashboardService.getRequestsData(timeRange)`
  - `dashboardService.getRevenueData(timeRange)`
  - `dashboardService.getNewUsersData(timeRange)`
  - `dashboardService.getPaymentMethodData(timeRange)`
  - `dashboardService.getTotalStats(timeRange)`

- **UI 组件**：
  - StatCard：展示单个指标（title、value、change、icon）
  - ChartContainer + ChartTooltip：Recharts 集成
  - Card + CardHeader + CardContent：卡片容器

- **数据源**：
  - 支付方式标签映射：xunhupay_wechat → '虎皮椒微信'、xunhupay_alipay → '虎皮椒支付宝'、stripe → 'Stripe'
  - 图表颜色使用 CSS 变量 `hsl(var(--chart-N))`

- **工具函数**：
  - `formatCurrency(value)`：金额格式化
  - `formatNumber(value)`：数字格式化
  - `cn()`：样式合并
