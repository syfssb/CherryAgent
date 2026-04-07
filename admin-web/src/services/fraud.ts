import { api } from './api'

export interface SuspiciousAccount {
  id: string
  userId: string
  userEmail: string
  userName: string | null
  reason: string
  details: unknown
  status: string
  reviewedBy: string | null
  reviewedAt: string | null
  actionTaken: string | null
  isFrozen: boolean
  riskScore: number
  registrationIp: string | null
  userCreatedAt: string
  createdAt: string
  updatedAt: string
}

export interface SuspiciousFilters {
  page?: number
  limit?: number
  status?: 'pending' | 'reviewed' | 'dismissed' | 'banned'
}

export interface ReviewAction {
  action: 'dismiss' | 'freeze' | 'freeze_and_clawback'
}

export const fraudService = {
  async getSuspiciousAccounts(filters?: SuspiciousFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      status: filters?.status,
    }
    return api.get<{ items: SuspiciousAccount[] }>('/admin/fraud/suspicious', params)
  },

  async reviewAccount(id: string, data: ReviewAction) {
    return api.post<{ message: string; clawbackAmount?: number }>(
      `/admin/fraud/review/${id}`,
      data
    )
  },

  async freezeUser(userId: string, reason: string) {
    return api.post<{ message: string }>(`/admin/fraud/freeze/${userId}`, { reason })
  },

  async unfreezeUser(userId: string) {
    return api.post<{ message: string }>(`/admin/fraud/unfreeze/${userId}`)
  },

  async clawbackBonus(userId: string) {
    return api.post<{ message: string; clawbackAmount: number }>(
      `/admin/fraud/clawback/${userId}`
    )
  },

  async triggerScan() {
    return api.post<{ message: string }>('/admin/fraud/scan')
  },
}

export default fraudService
