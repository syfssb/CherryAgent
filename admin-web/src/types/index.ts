/**
 * API 响应基础类型
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string | { code: string; message: string; details?: unknown }
  message?: string
  meta?: {
    total: number
    page: number
    limit: number
    hasMore?: boolean
  }
}

/**
 * 分页请求参数
 */
export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * 用户类型
 */
export interface User {
  id: string
  email: string
  nickname: string
  avatar?: string
  balance: number
  totalSpent: number
  totalRequests: number
  status: 'active' | 'suspended' | 'banned'
  role: 'user' | 'vip' | 'enterprise'
  createdAt: string
  lastActiveAt: string
  invitedBy?: string
  inviteCode: string
  inviteCount: number
}

/**
 * 用户筛选参数
 */
export interface UserFilters extends PaginationParams {
  search?: string
  status?: User['status']
  role?: User['role']
  dateFrom?: string
  dateTo?: string
}

/**
 * 交易记录类型
 */
export interface Transaction {
  id: string
  userId: string
  type: 'recharge' | 'consumption' | 'refund' | 'bonus' | 'withdrawal'
  amount: number
  balance: number
  description: string
  metadata?: Record<string, unknown>
  createdAt: string
}

/**
 * API 密钥类型
 */
export interface ApiKey {
  id: string
  userId: string
  name: string
  key: string
  maskedKey: string
  totalRequests: number
  lastUsedAt?: string
  status: 'active' | 'disabled' | 'expired'
  expiresAt?: string
  createdAt: string
}

/**
 * 渠道类型
 */
export interface Channel {
  id: string
  name: string
  provider: string
  baseUrl: string
  status: 'active' | 'disabled' | 'error'
  priority: number
  weight: number
  models: string[]
  totalRequests: number
  successRate: number
  avgLatency: number
  createdAt: string
}

/**
 * 模型类型
 */
export interface Model {
  id: string
  name: string
  displayName: string
  provider: string
  category: 'chat' | 'completion' | 'embedding' | 'image' | 'audio'
  inputPrice: number
  outputPrice: number
  maxTokens: number
  status: 'active' | 'disabled' | 'beta'
  isPopular: boolean
  totalRequests: number
}

/**
 * 仪表盘统计数据（后端返回格式）
 */
export interface DashboardStatsResponse {
  users: {
    total: number
    active: number
    new: number
    newGrowth: string
    dau: number
    mau: number
  }
  revenue: {
    current: number
    previous: number
    total: number
    growth: string
  }
  api: {
    requests: number
    requestsGrowth: string
    totalRequests: number
    tokens: number
    totalTokens: number
    cost: number
    successRate: string
    errorCount: number
  }
  balance: {
    total: number
    totalDeposited: number
    totalSpent: number
  }
  period: {
    start: string
    end: string
    label: string
  }
}

/**
 * 仪表盘统计数据（前端展示格式）
 */
export interface DashboardStats {
  overview: {
    totalUsers: number
    activeUsers: number
    totalRevenue: number
    todayRevenue: number
    totalRequests: number
    todayRequests: number
    activeChannels: number
    activeModels: number
  }
  userGrowth: Array<{
    date: string
    newUsers: number
    activeUsers: number
  }>
  revenueChart: Array<{
    date: string
    revenue: number
    cost: number
    profit: number
  }>
  requestChart: Array<{
    date: string
    requests: number
    tokens: number
  }>
  topModels: Array<{
    name: string
    requests: number
    revenue: number
  }>
  recentTransactions: Transaction[]
}

/**
 * 增长指标响应（Dashboard v2）
 */
export interface GrowthStatsResponse {
  grossMargin: {
    monthRevenue: number
    prevMonthRevenue: number
    monthCost: number
    prevMonthCost: number
    revenueGrowth: string
  }
  conversion: {
    totalUsers: number
    paidUsers: number
    overallRate: string
    periodRate: string
    periodRateChange: string
  }
  wapu: {
    current: number
    previous: number
    change: string
  }
  retention: {
    day7: { retained: number; cohort: number; rate: string }
    day30: { retained: number; cohort: number; rate: string }
  }
  arpu: {
    value: number
    payingUsers: number
  }
  dailyPnl: Array<{
    day: string
    revenue: number
    cost: number
    newUsers: number
    paidUsers: number
  }>
  modelProfit: Array<{
    model: string
    provider: string
    requestCount: number
    totalTokens: number
    totalCost: number
    uniqueUsers: number
  }>
  topValueUsers: Array<{
    userId: string
    email: string | null
    name: string | null
    totalDeposited: number
    totalCost: number
    lastActive: string | null
  }>
  period: {
    start: string
    end: string
  }
}

/**
 * 系统设置类型
 */
export interface SystemSettings {
  siteName: string
  siteDescription: string
  maintenanceMode: boolean
  registrationEnabled: boolean
  emailVerificationRequired: boolean
  defaultBalance: number
  minRechargeAmount: number
  maxRechargeAmount: number
  inviteBonus: number
  rateLimitPerMinute: number
}

/**
 * 充值记录类型
 */
export interface RechargeRecord {
  id: string
  userId: string
  userEmail: string
  userNickname: string
  amount: number
  balance: number
  method: 'alipay' | 'wechat' | 'bank' | 'crypto' | 'manual'
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded'
  transactionId?: string
  description?: string
  metadata?: Record<string, unknown>
  createdAt: string
  completedAt?: string
}

/**
 * 充值记录筛选参数
 */
export interface RechargeRecordFilters extends PaginationParams {
  search?: string
  userId?: string
  method?: RechargeRecord['method']
  status?: RechargeRecord['status']
  amountFrom?: number
  amountTo?: number
  dateFrom?: string
  dateTo?: string
}

/**
 * 消费明细类型
 */
export interface UsageRecord {
  id: string
  userId: string
  userEmail: string
  userNickname: string
  modelId: string
  modelName: string
  channelId: string
  channelName: string
  type: 'chat' | 'completion' | 'embedding' | 'image' | 'audio'
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  duration: number
  status: 'success' | 'failed' | 'timeout'
  errorMessage?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

/**
 * 消费明细筛选参数
 */
export interface UsageRecordFilters extends PaginationParams {
  search?: string
  userId?: string
  modelId?: string
  channelId?: string
  type?: UsageRecord['type']
  status?: UsageRecord['status']
  costFrom?: number
  costTo?: number
  dateFrom?: string
  dateTo?: string
}

/**
 * 收入统计数据
 */
export interface RevenueStats {
  overview: {
    totalRevenue: number
    totalRecharge: number
    totalConsumption: number
    totalRefund: number
    netRevenue: number
    avgRechargeAmount: number
    rechargeCount: number
    consumptionCount: number
  }
  revenueByDay: Array<{
    date: string
    recharge: number
    consumption: number
    refund: number
    netRevenue: number
  }>
  revenueByMethod: Array<{
    method: RechargeRecord['method']
    amount: number
    count: number
    percentage: number
  }>
  revenueByModel: Array<{
    modelId: string
    modelName: string
    amount: number
    count: number
    percentage: number
  }>
  topUsers: Array<{
    userId: string
    userEmail: string
    userNickname: string
    rechargeAmount: number
    consumptionAmount: number
  }>
}

/**
 * 收入统计筛选参数
 */
export interface RevenueStatsFilters {
  dateFrom: string
  dateTo: string
  groupBy?: 'day' | 'week' | 'month'
}

// 导出设置相关类型
export type {
  SystemConfig,
  SystemConfigUpdate,
  EmailConfig,
  EmailConfigUpdate,
  PaymentChannel,
  PaymentConfigUpdate,
  ConfigTestResult,
} from './settings'
