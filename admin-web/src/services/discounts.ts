import { api } from './api'

// ============================================================
// 类型定义
// ============================================================

export type DiscountType = 'percentage' | 'fixed_amount' | 'bonus_credits'

export interface DiscountCode {
  id: string
  code: string
  name: string
  description: string | null
  discountType: DiscountType
  discountValue: number
  minAmount: number
  maxDiscount: number | null
  usageLimit: number | null
  perUserLimit: number
  usedCount: number
  isActive: boolean
  startsAt: string
  expiresAt: string | null
  applicablePackages: string[] | null
  createdAt: string
  updatedAt: string
}

export interface DiscountUsage {
  id: string
  discountCodeId: string
  userId: string
  userEmail: string | null
  userName: string | null
  orderId: string | null
  originalAmount: number
  discountAmount: number
  finalAmount: number
  bonusCredits: number
  createdAt: string
}

export interface DiscountListResponse {
  discounts: DiscountCode[]
}

export interface DiscountUsageListResponse {
  usages: DiscountUsage[]
}

export interface DiscountFilters {
  page?: number
  limit?: number
  status?: 'active' | 'inactive' | 'expired' | ''
  discountType?: DiscountType | ''
  search?: string
}

export interface CreateDiscountRequest {
  code: string
  name: string
  description?: string
  discountType?: DiscountType
  discountValue: number
  minAmount?: number
  maxDiscount?: number | null
  usageLimit?: number | null
  perUserLimit?: number
  isActive?: boolean
  startsAt?: string
  expiresAt?: string | null
  applicablePackages?: string[] | null
}

export interface UpdateDiscountRequest {
  code?: string
  name?: string
  description?: string | null
  discountType?: DiscountType
  discountValue?: number
  minAmount?: number
  maxDiscount?: number | null
  usageLimit?: number | null
  perUserLimit?: number
  isActive?: boolean
  startsAt?: string
  expiresAt?: string | null
  applicablePackages?: string[] | null
}

export interface BatchCreateRequest {
  prefix?: string
  count: number
  name: string
  description?: string
  discountType?: DiscountType
  discountValue: number
  minAmount?: number
  maxDiscount?: number | null
  usageLimit?: number | null
  perUserLimit?: number
  isActive?: boolean
  startsAt?: string
  expiresAt?: string | null
  applicablePackages?: string[] | null
}

export interface BatchCreateResponse {
  message: string
  count: number
  codes: string[]
}

// ============================================================
// 服务实现
// ============================================================

export const discountsService = {
  async getDiscounts(filters?: DiscountFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      status: filters?.status || undefined,
      discountType: filters?.discountType || undefined,
      search: filters?.search,
    }
    return api.get<DiscountListResponse>('/admin/discounts', params)
  },

  async createDiscount(data: CreateDiscountRequest) {
    return api.post<{ message: string; discount: DiscountCode }>(
      '/admin/discounts',
      data
    )
  },

  async updateDiscount(id: string, data: UpdateDiscountRequest) {
    return api.put<{ message: string; discount: DiscountCode }>(
      `/admin/discounts/${id}`,
      data
    )
  },

  async deleteDiscount(id: string) {
    return api.delete<{ message: string }>(`/admin/discounts/${id}`)
  },

  async toggleDiscount(id: string) {
    return api.patch<{ message: string; isActive: boolean }>(
      `/admin/discounts/${id}/toggle`
    )
  },

  async getUsages(id: string, page = 1, limit = 20) {
    return api.get<DiscountUsageListResponse>(
      `/admin/discounts/${id}/usages`,
      { page, limit }
    )
  },

  async batchCreate(data: BatchCreateRequest) {
    return api.post<BatchCreateResponse>(
      '/admin/discounts/batch',
      data
    )
  },
}

export default discountsService
