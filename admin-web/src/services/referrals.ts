import { api } from './api'

// ============================================================
// 类型定义
// ============================================================

export interface ReferralConfigDTO {
  id?: string
  commissionRate: number
  commissionType: 'percentage' | 'fixed'
  fixedAmount: number
  minWithdrawal: number
  maxLevels: number
  level2Rate: number
  isEnabled: boolean
  updatedAt?: string
}

export interface ReferralConfigUpdateDTO {
  commissionRate?: number
  commissionType?: 'percentage' | 'fixed'
  fixedAmount?: number
  minWithdrawal?: number
  maxLevels?: number
  level2Rate?: number
  isEnabled?: boolean
}

export interface ReferralOverviewStats {
  totalCodes: number
  totalReferrals: number
  totalCommission: number
  pendingCommission: number
  paidCommission: number
  pendingWithdrawals: number
  pendingWithdrawalAmount: number
  paidWithdrawalAmount: number
}

export interface RecentReferral {
  id: string
  referrerEmail: string
  referrerName: string | null
  referredEmail: string
  referredName: string | null
  referralCode: string | null
  createdAt: string
}

export interface TopReferrer {
  userId: string
  email: string
  name: string | null
  referralCount: number
  totalEarned: number
}

export interface ReferralOverviewResponse {
  stats: ReferralOverviewStats
  recentReferrals: RecentReferral[]
  topReferrers: TopReferrer[]
}

export interface CommissionDTO {
  id: string
  referrerId: string
  referrerEmail: string
  referrerName: string | null
  referredId: string
  referredEmail: string
  orderId: string | null
  orderAmount: string
  commissionRate: string
  commissionAmount: string
  level: number
  status: 'pending' | 'approved' | 'paid' | 'rejected'
  createdAt: string
  settledAt: string | null
}

export interface CommissionFilters {
  page?: number
  limit?: number
  status?: 'pending' | 'approved' | 'paid' | 'rejected'
  referrerId?: string
  startDate?: string
  endDate?: string
}

export interface WithdrawalDTO {
  id: string
  userId: string
  userEmail: string
  userName: string | null
  amount: string
  status: 'pending' | 'approved' | 'paid' | 'rejected'
  paymentMethod: string | null
  paymentAccount: string | null
  note: string | null
  createdAt: string
  processedAt: string | null
}

export interface WithdrawalFilters {
  page?: number
  limit?: number
  status?: 'pending' | 'approved' | 'paid' | 'rejected'
  userId?: string
  email?: string
}

// ============================================================
// 服务实现
// ============================================================

export const referralService = {
  async getConfig() {
    return api.get<ReferralConfigDTO>('/admin/referrals/config')
  },

  async updateConfig(data: ReferralConfigUpdateDTO) {
    return api.put<{ message: string }>('/admin/referrals/config', data)
  },

  async getOverview() {
    return api.get<ReferralOverviewResponse>('/admin/referrals/overview')
  },

  async getCommissions(filters?: CommissionFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      status: filters?.status,
      referrerId: filters?.referrerId,
      startDate: filters?.startDate,
      endDate: filters?.endDate,
    }
    return api.get<{ commissions: CommissionDTO[] }>('/admin/referrals/commissions', params)
  },

  async reviewCommission(id: string, action: 'approve' | 'reject', note?: string) {
    return api.patch<{ message: string }>(`/admin/referrals/commissions/${id}`, { action, note })
  },

  async getWithdrawals(filters?: WithdrawalFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      status: filters?.status,
      userId: filters?.userId,
      email: filters?.email,
    }
    return api.get<{ withdrawals: WithdrawalDTO[] }>('/admin/referrals/withdrawals', params)
  },

  async processWithdrawal(id: string, action: 'approve' | 'reject' | 'pay', note?: string) {
    return api.patch<{ message: string }>(`/admin/referrals/withdrawals/${id}`, { action, note })
  },
}

export default referralService
