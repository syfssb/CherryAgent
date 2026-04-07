import { api } from './api'

// ============================================================
// 类型定义
// ============================================================

export interface PeriodCardPlan {
  id: string
  name: string
  description: string | null
  periodType: 'daily' | 'weekly' | 'monthly'
  periodDays: number
  dailyCredits: number
  quotaMode: 'daily' | 'total'
  totalCredits: number
  priceCents: number
  priceYuan: string
  currency: string
  isEnabled: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface PeriodCardRecord {
  id: string
  userId: string
  planId: string
  paymentId: string | null
  status: string
  startsAt: string
  expiresAt: string
  dailyCredits: number
  dailyQuotaRemaining: number
  quotaResetDate: string | null
  quotaMode: 'daily' | 'total'
  totalCredits: number
  totalRemaining: number
  expiryNotified: boolean
  upgradedToId: string | null
  createdAt: string
  updatedAt: string
  planName: string | null
  userEmail: string | null
}

export interface PlanFilters {
  page?: number
  limit?: number
  isEnabled?: boolean
}

export interface RecordFilters {
  page?: number
  limit?: number
  status?: string
  userId?: string
}

export interface CreatePlanRequest {
  name: string
  description?: string
  periodType: 'daily' | 'weekly' | 'monthly'
  periodDays: number
  dailyCredits: number
  quotaMode?: 'daily' | 'total'
  totalCredits?: number
  priceCents: number
  currency?: string
  isEnabled?: boolean
  sortOrder?: number
}

export interface UpdatePlanRequest {
  name?: string
  description?: string | null
  periodType?: 'daily' | 'weekly' | 'monthly'
  periodDays?: number
  dailyCredits?: number
  quotaMode?: 'daily' | 'total'
  totalCredits?: number
  priceCents?: number
  currency?: string
  isEnabled?: boolean
  sortOrder?: number
}

// ============================================================
// 服务实现
// ============================================================

export const periodCardsService = {
  async getPlans(filters?: PlanFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      isEnabled: filters?.isEnabled,
    }
    return api.get<{ plans: PeriodCardPlan[] }>('/admin/period-cards/plans', params)
  },

  async createPlan(data: CreatePlanRequest) {
    return api.post<{ message: string; id: string }>(
      '/admin/period-cards/plans',
      data
    )
  },

  async updatePlan(id: string, data: UpdatePlanRequest) {
    return api.patch<{ message: string }>(
      `/admin/period-cards/plans/${id}`,
      data
    )
  },

  async deletePlan(id: string) {
    return api.delete<{ message: string }>(
      `/admin/period-cards/plans/${id}`
    )
  },

  async getRecords(filters?: RecordFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      status: filters?.status,
      userId: filters?.userId,
    }
    return api.get<{ records: PeriodCardRecord[] }>('/admin/period-cards/records', params)
  },

  async getRecord(id: string) {
    return api.get<{ record: PeriodCardRecord }>(
      `/admin/period-cards/records/${id}`
    )
  },

  async cancelRecord(id: string) {
    return api.post<{ message: string }>(
      `/admin/period-cards/records/${id}/cancel`
    )
  },

  async grantRecord(userId: string, planId: string) {
    return api.post<{ message: string; id: string }>(
      '/admin/period-cards/records/grant',
      { userId, planId }
    )
  },

  async extendRecord(id: string, days: number) {
    return api.post<{ message: string; newExpiresAt: string }>(
      `/admin/period-cards/records/${id}/extend`,
      { days }
    )
  },
}

export default periodCardsService
