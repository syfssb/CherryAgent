import { api } from './api'
import type { DashboardStatsResponse, GrowthStatsResponse } from '@/types'

/**
 * 时间范围类型（对应后端 period 参数）
 */
export type TimeRange = 'today' | '7d' | '30d' | '90d'

/**
 * 后端时间范围类型
 */
export type BackendTimeRange = 'today' | '7d' | '30d' | '90d' | 'year'

/**
 * API 统计数据
 */
export interface ApiStatsResponse {
  byModel: Array<{
    model: string
    provider: string
    requestCount: number
    totalTokens: number
    totalCost: number
    successCount: number
    errorCount: number
    successRate: string
    avgLatencyMs: string | null
  }>
  hourly: Array<{
    hour: string
    requestCount: number
    successCount: number
    errorCount: number
  }>
  daily: Array<{
    day: string
    requestCount: number
    totalTokens: number
    totalCost: number
  }>
  errors: Array<{
    message: string
    count: number
  }>
  latencyDistribution: Array<{
    bucket: string
    count: number
  }>
  period: {
    start: string
    end: string
  }
}

/**
 * 时间范围转换
 */
function convertTimeRange(range: TimeRange): BackendTimeRange {
  return range
}

/**
 * 收入统计响应
 */
export interface RevenueStatsResponse {
  daily: Array<{
    day: string
    revenue: number
    transactionCount: number
  }>
  byMethod: Array<{
    paymentMethod: string
    revenue: number
    transactionCount: number
  }>
  todayRevenue: number
  monthRevenue: number
  period: {
    start: string
    end: string
  }
}

/**
 * 提现申请提醒响应
 */
export interface WithdrawalAlertsResponse {
  pendingCount: number
  pendingAmount: number
}

/**
 * 新增用户统计响应
 */
export interface NewUsersStatsResponse {
  daily: Array<{
    day: string
    newUsers: number
  }>
  period: {
    start: string
    end: string
  }
}

/**
 * Token 统计响应
 */
export interface TokenStatsResponse {
  summary: {
    totalPromptTokens: number
    totalCompletionTokens: number
    totalTokens: number
    totalCost: number
    totalRequests: number
    uniqueUsers: number
    avgTokensPerRequest: number
    avgCostPerRequest: string
  }
  byModel: Array<{
    model: string
    provider: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    totalCost: number
    requestCount: number
    avgTokensPerRequest: number
  }>
  daily: Array<{
    day: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    totalCost: number
  }>
  topUsers: Array<{
    userId: string
    email: string | null
    name: string | null
    totalTokens: number
    totalCost: number
    requestCount: number
  }>
  period: {
    start: string
    end: string
  }
}

/**
 * 仪表盘服务
 */
export const dashboardService = {
  /**
   * 获取仪表盘关键指标统计
   */
  async getStats(timeRange: TimeRange = '7d') {
    const period = convertTimeRange(timeRange)
    return api.get<DashboardStatsResponse>('/admin/dashboard/stats', { period })
  },

  /**
   * 获取 API 调用统计
   */
  async getApiStats(timeRange: TimeRange = '7d') {
    const period = convertTimeRange(timeRange)
    return api.get<ApiStatsResponse>('/admin/dashboard/api-stats', { period })
  },

  /**
   * 获取收入统计
   */
  async getRevenueStats(timeRange: TimeRange = '7d') {
    const period = convertTimeRange(timeRange)
    return api.get<RevenueStatsResponse>('/admin/dashboard/revenue-stats', { period })
  },

  /**
   * 获取提现申请提醒
   */
  async getWithdrawalAlerts() {
    return api.get<WithdrawalAlertsResponse>('/admin/dashboard/withdrawal-alerts')
  },

  /**
   * 获取新增用户统计
   */
  async getNewUsersStats(timeRange: TimeRange = '7d') {
    const period = convertTimeRange(timeRange)
    return api.get<NewUsersStatsResponse>('/admin/dashboard/new-users-stats', { period })
  },

  /**
   * 获取 Token 统计
   */
  async getTokenStats(timeRange: TimeRange = '7d') {
    const period = convertTimeRange(timeRange)
    return api.get<TokenStatsResponse>('/admin/dashboard/token-stats', { period })
  },

  /**
   * 获取增长指标（Dashboard v2 核心数据源）
   */
  async getGrowthStats(timeRange: TimeRange = '7d') {
    const period = convertTimeRange(timeRange)
    return api.get<GrowthStatsResponse>('/admin/dashboard/growth-stats', { period })
  },
}

export default dashboardService
