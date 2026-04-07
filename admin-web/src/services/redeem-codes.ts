import { api } from './api'

// ============================================================
// 类型定义
// ============================================================

export interface RedeemCode {
  id: string
  code: string
  name: string
  description: string | null
  creditsAmount: number
  maxUses: number | null
  usedCount: number
  isActive: boolean
  expiresAt: string | null
  createdBy: string | null
  redeemType: string
  periodCardPlanId: string | null
  createdAt: string
  updatedAt: string
}

export interface RedeemUsage {
  id: string
  redeemCodeId: string
  userId: string
  userEmail: string | null
  userName: string | null
  creditsAwarded: number
  createdAt: string
}

export interface RedeemCodeListResponse {
  redeemCodes: RedeemCode[]
}

export interface RedeemUsageListResponse {
  usages: RedeemUsage[]
}

export interface RedeemCodeFilters {
  page?: number
  limit?: number
  status?: 'active' | 'inactive' | 'expired' | ''
  search?: string
}

export interface CreateRedeemCodeRequest {
  code: string
  name: string
  description?: string
  creditsAmount: number
  maxUses?: number | null
  isActive?: boolean
  expiresAt?: string | null
  redeemType?: string
  periodCardPlanId?: string
}

export interface UpdateRedeemCodeRequest {
  code?: string
  name?: string
  description?: string | null
  creditsAmount?: number
  maxUses?: number | null
  isActive?: boolean
  expiresAt?: string | null
}

export interface BatchCreateRedeemRequest {
  prefix?: string
  count: number
  name: string
  description?: string
  creditsAmount: number
  maxUses?: number | null
  isActive?: boolean
  expiresAt?: string | null
  redeemType?: string
  periodCardPlanId?: string
}

export interface BatchCreateRedeemResponse {
  message: string
  count: number
  codes: string[]
}

// ============================================================
// 服务实现
// ============================================================

export const redeemCodesService = {
  async getRedeemCodes(filters?: RedeemCodeFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      status: filters?.status || undefined,
      search: filters?.search,
    }
    return api.get<RedeemCodeListResponse>('/admin/redeem-codes', params)
  },

  async createRedeemCode(data: CreateRedeemCodeRequest) {
    return api.post<{ message: string; redeemCode: RedeemCode }>(
      '/admin/redeem-codes',
      data
    )
  },

  async updateRedeemCode(id: string, data: UpdateRedeemCodeRequest) {
    return api.put<{ message: string; redeemCode: RedeemCode }>(
      `/admin/redeem-codes/${id}`,
      data
    )
  },

  async deleteRedeemCode(id: string) {
    return api.delete<{ message: string }>(`/admin/redeem-codes/${id}`)
  },

  async toggleRedeemCode(id: string) {
    return api.patch<{ message: string; isActive: boolean }>(
      `/admin/redeem-codes/${id}/toggle`
    )
  },

  async getUsages(id: string, page = 1, limit = 20) {
    return api.get<RedeemUsageListResponse>(
      `/admin/redeem-codes/${id}/usages`,
      { page, limit }
    )
  },

  async batchCreate(data: BatchCreateRedeemRequest) {
    return api.post<BatchCreateRedeemResponse>(
      '/admin/redeem-codes/batch',
      data
    )
  },
}

export default redeemCodesService
