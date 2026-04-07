import { api } from './api'

// ============================================================
// 类型定义 - 匹配后端实际返回的数据格式
// ============================================================

/**
 * 用户余额信息（后端返回格式）
 */
export interface UserBalance {
  current: string
  currency: string
  totalDeposited: string
  totalSpent: string
}

/**
 * 后端返回的用户数据格式
 * 注意：与前端 types/index.ts 中的 User 类型有差异
 * 后端使用 name 而非 nickname，使用 isActive 而非 status 枚举
 */
export interface AdminUser {
  id: string
  email: string
  name: string | null
  role: 'user' | 'admin'
  avatarUrl: string | null
  isActive: boolean
  emailVerifiedAt: string | null
  createdAt: string
  updatedAt: string
  balance: UserBalance
}

/**
 * 用户列表响应数据
 */
export interface UsersListData {
  users: AdminUser[]
}

/**
 * 用户列表筛选参数（匹配后端 Schema）
 */
export interface AdminUserFilters {
  page?: number
  limit?: number
  search?: string
  role?: 'user' | 'admin'
  isActive?: string
  sortBy?: 'createdAt' | 'email' | 'name' | 'balance'
  sortOrder?: 'asc' | 'desc'
  startDate?: string
  endDate?: string
}

/**
 * 更新用户请求（匹配后端 Schema）
 */
export interface UpdateUserRequest {
  name?: string
  role?: 'user' | 'admin'
  isActive?: boolean
}

/**
 * 调整余额请求（匹配后端 Schema）
 */
export interface AdjustBalanceRequest {
  amount: number
  reason: string
  type?: 'bonus' | 'refund' | 'adjustment' | 'compensation'
}

/**
 * 调整余额响应
 */
export interface AdjustBalanceResponse {
  message: string
  balance: {
    before: string
    after: string
    adjustment: string
  }
}

/**
 * 封禁用户请求
 */
export interface SuspendUserRequest {
  reason: string
}

/**
 * 封禁/解封响应
 */
export interface SuspendUserResponse {
  message: string
  user: {
    id: string
    email: string
    suspendReason?: string
  }
}

/**
 * 用户详情响应（包含额外统计信息）
 */
export interface AdminUserDetail extends AdminUser {
  supabaseId: string | null
  stripeCustomerId: string | null
  usageStats: {
    last30Days: {
      totalRequests: number
      totalTokens: number
      totalCost: string
    }
  }
}

/**
 * 用户交易记录
 */
export interface AdminUserTransaction {
  id: string
  type: string
  amount: string
  balanceBefore: string
  balanceAfter: string
  description: string | null
  createdAt: string
}

// ============================================================
// 服务实现
// ============================================================

/**
 * 用户管理服务
 */
export const usersService = {
  /**
   * 获取用户列表
   * 将前端筛选参数映射为后端接受的查询参数
   */
  async getUsers(filters?: AdminUserFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      search: filters?.search,
      role: filters?.role,
      isActive: filters?.isActive,
      sortBy: filters?.sortBy,
      sortOrder: filters?.sortOrder,
      startDate: filters?.startDate,
      endDate: filters?.endDate,
    }

    return api.get<UsersListData>('/admin/users', params)
  },

  /**
   * 获取单个用户详情
   */
  async getUser(id: string) {
    return api.get<{ user: AdminUserDetail }>(`/admin/users/${id}`)
  },

  /**
   * 更新用户信息
   */
  async updateUser(id: string, data: UpdateUserRequest) {
    return api.patch<{ message: string }>(`/admin/users/${id}`, data)
  },

  /**
   * 调整用户余额
   */
  async adjustBalance(id: string, data: AdjustBalanceRequest) {
    return api.post<AdjustBalanceResponse>(`/admin/users/${id}/balance`, data)
  },

  /**
   * 封禁用户
   */
  async suspendUser(id: string, reason: string) {
    return api.post<SuspendUserResponse>(`/admin/users/${id}/suspend`, { reason })
  },

  /**
   * 解封用户
   */
  async unsuspendUser(id: string) {
    return api.post<SuspendUserResponse>(`/admin/users/${id}/unsuspend`)
  },

  /**
   * 获取用户交易记录
   */
  async getUserTransactions(id: string, page = 1, limit = 20) {
    return api.get<{ transactions: AdminUserTransaction[] }>(
      `/admin/users/${id}/transactions`,
      { page, limit }
    )
  },

  /**
   * 发送密码重置邮件
   */
  async sendPasswordReset(id: string) {
    return api.post<{ message: string; email: string }>(`/admin/users/${id}/reset-password`)
  },

  /**
   * 删除用户（彻底删除）
   */
  async deleteUser(id: string) {
    return api.delete<{ message: string; user: { id: string; email: string } }>(
      `/admin/users/${id}`
    )
  },

  /**
   * 导出用户数据
   */
  async exportUsers(filters?: AdminUserFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      search: filters?.search,
      role: filters?.role,
      isActive: filters?.isActive,
      sortBy: filters?.sortBy,
      sortOrder: filters?.sortOrder,
      startDate: filters?.startDate,
      endDate: filters?.endDate,
    }

    return api.get<{ url: string }>('/admin/users/export', params)
  },
}

export default usersService
