import { api } from './api'
import type { ApiResponse } from '@/types'
import type {
  SystemConfig,
  SystemConfigUpdate,
  EmailConfig,
  EmailConfigUpdate,
  PaymentChannel,
  PaymentConfigUpdate,
  ConfigTestResult,
} from '@/types/settings'

/**
 * 系统配置服务
 */
export const systemConfigService = {
  /**
   * 获取系统全局配置
   */
  async getConfig(): Promise<ApiResponse<SystemConfig>> {
    return api.get<SystemConfig>('/admin/settings/system')
  },

  /**
   * 更新系统全局配置
   */
  async updateConfig(data: SystemConfigUpdate): Promise<ApiResponse<SystemConfig>> {
    return api.put<SystemConfig>('/admin/settings/system', data)
  },

  /**
   * 重置系统配置为默认值
   */
  async resetConfig(): Promise<ApiResponse<SystemConfig>> {
    return api.post<SystemConfig>('/admin/settings/system/reset')
  },
}

/**
 * 邮件配置服务
 */
export const emailConfigService = {
  /**
   * 获取邮件配置
   */
  async getConfig(): Promise<ApiResponse<EmailConfig>> {
    return api.get<EmailConfig>('/admin/settings/email')
  },

  /**
   * 更新邮件配置
   */
  async updateConfig(data: EmailConfigUpdate): Promise<ApiResponse<EmailConfig>> {
    return api.put<EmailConfig>('/admin/settings/email', data)
  },

  /**
   * 测试邮件配置
   */
  async testConfig(testEmail: string): Promise<ApiResponse<ConfigTestResult>> {
    return api.post<ConfigTestResult>('/admin/settings/email/test', { testEmail })
  },

  /**
   * 发送测试邮件
   */
  async sendTestEmail(to: string, subject?: string): Promise<ApiResponse<ConfigTestResult>> {
    return api.post<ConfigTestResult>('/admin/settings/email/send-test', {
      to,
      subject: subject || '系统测试邮件',
    })
  },
}

/**
 * 支付配置服务
 */
export const paymentConfigService = {
  /**
   * 获取所有支付渠道
   */
  async getChannels(): Promise<ApiResponse<PaymentChannel[]>> {
    return api.get<PaymentChannel[]>('/admin/settings/payment/channels')
  },

  /**
   * 获取单个支付渠道
   */
  async getChannel(id: string): Promise<ApiResponse<PaymentChannel>> {
    return api.get<PaymentChannel>(`/admin/settings/payment/channels/${id}`)
  },

  /**
   * 创建支付渠道
   */
  async createChannel(data: Partial<PaymentChannel>): Promise<ApiResponse<PaymentChannel>> {
    return api.post<PaymentChannel>('/admin/settings/payment/channels', data)
  },

  /**
   * 更新支付渠道
   */
  async updateChannel(id: string, data: PaymentConfigUpdate): Promise<ApiResponse<PaymentChannel>> {
    return api.put<PaymentChannel>(`/admin/settings/payment/channels/${id}`, data)
  },

  /**
   * 删除支付渠道
   */
  async deleteChannel(id: string): Promise<ApiResponse<void>> {
    return api.delete<void>(`/admin/settings/payment/channels/${id}`)
  },

  /**
   * 启用/禁用支付渠道
   */
  async toggleChannel(id: string, enabled: boolean): Promise<ApiResponse<PaymentChannel>> {
    return api.patch<PaymentChannel>(`/admin/settings/payment/channels/${id}/toggle`, { enabled })
  },

  /**
   * 设置默认支付渠道
   */
  async setDefaultChannel(id: string): Promise<ApiResponse<PaymentChannel>> {
    return api.post<PaymentChannel>(`/admin/settings/payment/channels/${id}/set-default`)
  },

  /**
   * 测试支付渠道配置
   */
  async testChannel(id: string, amount?: number): Promise<ApiResponse<ConfigTestResult>> {
    return api.post<ConfigTestResult>(`/admin/settings/payment/channels/${id}/test`, {
      amount: amount || 0.01,
    })
  },

  /**
   * 批量更新渠道优先级
   */
  async updatePriorities(priorities: Array<{ id: string; priority: number }>): Promise<ApiResponse<PaymentChannel[]>> {
    return api.put<PaymentChannel[]>('/admin/settings/payment/channels/priorities', { priorities })
  },
}

export default {
  system: systemConfigService,
  email: emailConfigService,
  payment: paymentConfigService,
}
