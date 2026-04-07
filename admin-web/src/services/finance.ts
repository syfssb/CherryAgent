import { api } from './api'

// ============================================================
// 类型定义 - 匹配后端 /admin/finance/* 返回格式
// ============================================================

// --- 消费记录 ---

/**
 * 消费记录 - 匹配后端 usage_logs 表返回格式
 */
export interface UsageRecordDTO {
  id: string
  userId: string | null
  userEmail: string | null
  requestId: string | null
  model: string
  provider: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  latencyMs: number | null
  status: 'success' | 'error'
  errorMessage: string | null
  cost: string | null
  creditsConsumed: string | null
  quotaUsed: string | null
  createdAt: string
}

/**
 * 消费记录汇总 - 匹配后端 summary 返回格式
 */
export interface UsageSummaryDTO {
  totalRequests: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  totalCost: string
  successCount: number
  errorCount: number
  successRate: string
}

/**
 * 消费记录列表响应
 */
export interface UsageListResponse {
  usage: UsageRecordDTO[]
  summary: UsageSummaryDTO
}

/**
 * 消费记录筛选参数 - 匹配后端 usageQuerySchema
 */
export interface UsageFilters {
  page?: number
  limit?: number
  userId?: string
  model?: string
  provider?: string
  status?: 'success' | 'error'
  startDate?: string
  endDate?: string
}

// --- 充值记录 ---

/**
 * 充值记录 - 匹配后端 payments 表返回格式
 */
export interface RechargeRecordDTO {
  id: string
  userId: string
  userEmail: string | null
  userName: string | null
  amount: string
  currency: string
  status: string
  paymentMethod: string
  stripePaymentIntentId: string | null
  xunhupayOrderId: string | null
  description: string | null
  paidAt: string | null
  createdAt: string
}

/**
 * 充值记录汇总
 */
export interface RechargeSummaryDTO {
  totalCount: number
  totalSucceeded: number
  totalPending: number
  totalFailed: number
}

/**
 * 充值记录列表响应
 */
export interface RechargeListResponse {
  recharges: RechargeRecordDTO[]
  summary: RechargeSummaryDTO
}

/**
 * 充值记录筛选参数 - 匹配后端 rechargesQuerySchema
 */
export interface RechargeFilters {
  page?: number
  limit?: number
  userId?: string
  status?: 'pending' | 'succeeded' | 'failed' | 'refunded'
  paymentMethod?: 'stripe' | 'xunhupay'
  startDate?: string
  endDate?: string
  minAmount?: number
  maxAmount?: number
}

// --- 收入统计 ---

/**
 * 收入统计汇总
 */
export interface RevenueSummaryDTO {
  totalRevenue: number
  totalCost: number
  grossProfit: number
  profitMargin: string
  payingUsers: number
  paymentCount: number
  arpu: string
}

/**
 * 收入图表数据项
 */
export interface RevenueChartItem {
  period: string
  revenue: {
    stripe: number
    wechat?: number
    alipay?: number
    xunhupay: number
    total: number
  }
  cost: number
  requests: number
  tokens: number
  profit: number
}

/**
 * 收入统计响应
 */
export interface RevenueResponse {
  summary: RevenueSummaryDTO
  chartData: RevenueChartItem[]
  period: {
    start: string
    end: string
    groupBy: string
  }
}

/**
 * 收入统计筛选参数 - 匹配后端 revenueQuerySchema
 */
export interface RevenueFilters {
  period?: 'day' | 'week' | 'month' | 'year'
  startDate?: string
  endDate?: string
  groupBy?: 'day' | 'week' | 'month'
}

// --- 交易流水 ---

/**
 * 交易类型
 */
export type TransactionType = 'deposit' | 'usage' | 'bonus' | 'refund' | 'adjustment' | 'compensation'

/**
 * 交易记录 - 匹配后端返回格式
 */
export interface TransactionRecordDTO {
  id: string
  userId: string
  userEmail: string | null
  type: TransactionType
  amount: string
  balanceBefore: string
  balanceAfter: string
  description: string | null
  referenceType: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

/**
 * 交易类型统计
 */
export interface TransactionTypeStats {
  [type: string]: {
    count: number
    totalAmount: number
  }
}

/**
 * 交易流水列表响应
 */
export interface TransactionListResponse {
  transactions: TransactionRecordDTO[]
  typeStats: TransactionTypeStats
}

/**
 * 交易流水筛选参数 - 匹配后端 transactionsQuerySchema
 */
export interface TransactionFilters {
  page?: number
  limit?: number
  userId?: string
  type?: TransactionType
  startDate?: string
  endDate?: string
}

// ============================================================
// 服务实现
// ============================================================

/**
 * 财务管理服务
 */
export const financeService = {
  /**
   * 获取消费明细
   * GET /admin/finance/usage
   */
  async getUsageRecords(filters?: UsageFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      userId: filters?.userId,
      model: filters?.model,
      provider: filters?.provider,
      status: filters?.status,
      startDate: filters?.startDate,
      endDate: filters?.endDate,
    }

    return api.get<UsageListResponse>('/admin/finance/usage', params)
  },

  /**
   * 获取充值记录
   * GET /admin/finance/recharges
   */
  async getRechargeRecords(filters?: RechargeFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      userId: filters?.userId,
      status: filters?.status,
      paymentMethod: filters?.paymentMethod,
      startDate: filters?.startDate,
      endDate: filters?.endDate,
      minAmount: filters?.minAmount,
      maxAmount: filters?.maxAmount,
    }

    return api.get<RechargeListResponse>('/admin/finance/recharges', params)
  },

  /**
   * 获取收入统计
   * GET /admin/finance/revenue
   */
  async getRevenue(filters?: RevenueFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      period: filters?.period,
      startDate: filters?.startDate,
      endDate: filters?.endDate,
      groupBy: filters?.groupBy,
    }

    return api.get<RevenueResponse>('/admin/finance/revenue', params)
  },

  /**
   * 获取交易流水
   * GET /admin/finance/transactions
   */
  async getTransactions(filters?: TransactionFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      userId: filters?.userId,
      type: filters?.type,
      startDate: filters?.startDate,
      endDate: filters?.endDate,
    }

    return api.get<TransactionListResponse>('/admin/finance/transactions', params)
  },
}

export default financeService
