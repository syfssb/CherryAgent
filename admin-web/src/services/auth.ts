import { api } from './api'
import type { AdminUser } from '@/store/useAdminStore'

/**
 * 登录请求参数
 */
export interface LoginRequest {
  username: string
  password: string
}

/**
 * 登录 API 原始响应数据
 */
interface LoginApiResponse {
  admin: AdminUser
  accessToken: string
  expiresIn: number
}

/**
 * 登录响应数据
 */
export interface LoginResponse {
  admin: AdminUser
  token: string
  expiresIn: number
}

/**
 * 修改密码请求
 */
export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

/**
 * 认证服务
 */
export const authService = {
  /**
   * 管理员登录
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginApiResponse>('/admin/auth/login', credentials)

    if (!response.data) {
      throw new Error('登录失败')
    }

    // 后端返回 accessToken，前端统一用 token
    return {
      admin: response.data.admin,
      token: response.data.accessToken,
      expiresIn: response.data.expiresIn,
    }
  },

  /**
   * 登出
   */
  async logout(): Promise<void> {
    await api.post('/admin/auth/logout')
  },

  /**
   * 获取当前管理员信息
   */
  async getCurrentAdmin(): Promise<AdminUser> {
    const response = await api.get<{ admin: AdminUser }>('/admin/auth/me')

    if (!response.data) {
      throw new Error('获取用户信息失败')
    }

    return response.data.admin
  },

  /**
   * 刷新 token
   */
  async refreshToken(): Promise<{ token: string; expiresIn: number }> {
    const response = await api.post<{ accessToken: string; expiresIn: number }>('/admin/auth/refresh')

    if (!response.data) {
      throw new Error('刷新 token 失败')
    }

    return {
      token: response.data.accessToken,
      expiresIn: response.data.expiresIn,
    }
  },

  /**
   * 修改密码
   */
  async changePassword(data: ChangePasswordRequest): Promise<void> {
    await api.post('/admin/auth/change-password', data)
  },
}

export default authService
