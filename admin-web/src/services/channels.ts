import { api } from './api'
import type { Channel } from '@/types'
import type { ChannelProvider } from '@/constants/providers'

// Re-export for convenience
export type { ChannelProvider } from '@/constants/providers'

// ============================================================
// 类型定义
// ============================================================

/**
 * 渠道健康状态
 */
export type ChannelHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

/**
 * 渠道详情 - 匹配后端返回的完整数据格式
 * 扩展基础 Channel 接口，增加后端特有字段
 */
export interface ChannelDetail extends Omit<Channel, 'status' | 'models' | 'totalRequests' | 'successRate' | 'avgLatency'> {
  /** 脱敏后的 API Key（仅详情接口返回） */
  apiKeyMasked?: string
  /** 模型映射配置 */
  modelMapping: Record<string, string>
  /** 每分钟请求限制 */
  rpmLimit: number
  /** 每分钟 Token 限制 */
  tpmLimit: number
  /** 每日请求限制 */
  dailyLimit: number
  /** 价格倍率 */
  priceMultiplier: number
  /** 是否启用 */
  isEnabled: boolean
  /** 健康状态 */
  healthStatus: ChannelHealthStatus
  /** 最后健康检查时间 */
  lastHealthCheck: string | null
  /** 连续失败次数 */
  consecutiveFailures: number
  /** 更新时间 */
  updatedAt: string
}

/**
 * 创建渠道请求参数
 */
export interface CreateChannelRequest {
  /** 渠道名称 */
  name: string
  /** 供应商 */
  provider: ChannelProvider | string
  /** 基础 URL */
  baseUrl: string
  /** API 密钥 */
  apiKey: string
  /** 模型映射 */
  modelMapping?: Record<string, string>
  /** 权重 (0-100) */
  weight?: number
  /** 优先级 (0-100, 越大越优先) */
  priority?: number
  /** 每分钟请求限制 */
  rpmLimit?: number
  /** 每分钟 Token 限制 */
  tpmLimit?: number
  /** 每日请求限制 */
  dailyLimit?: number
  /** 价格倍率 */
  priceMultiplier?: number
  /** 是否启用 */
  isEnabled?: boolean
}

/**
 * 更新渠道请求参数 - 所有字段可选
 */
export interface UpdateChannelRequest {
  name?: string
  provider?: ChannelProvider | string
  baseUrl?: string
  apiKey?: string
  modelMapping?: Record<string, string>
  weight?: number
  priority?: number
  rpmLimit?: number
  tpmLimit?: number
  dailyLimit?: number
  priceMultiplier?: number
  isEnabled?: boolean
}

/**
 * 渠道列表筛选参数
 */
export interface ChannelFilters {
  page?: number
  limit?: number
  search?: string
  provider?: ChannelProvider | string
  status?: 'enabled' | 'disabled' | 'healthy' | 'unhealthy' | 'degraded'
}

/**
 * 渠道列表汇总信息（匹配后端返回格式）
 */
export interface ChannelSummary {
  totalChannels: number
  enabledChannels: number
  healthyChannels: number
  degradedChannels: number
  unhealthyChannels: number
}

/**
 * 渠道列表响应
 */
export interface ChannelListResponse {
  channels: ChannelDetail[]
  summary: ChannelSummary
}

/**
 * 渠道连接测试结果（匹配后端返回格式）
 */
export interface ChannelTestResult {
  success: boolean
  message?: string
  latencyMs?: number
  model?: string
}

/**
 * 渠道健康重置结果（匹配后端返回格式）
 */
export interface ChannelHealthResetResult {
  message: string
}

// ============================================================
// 服务实现
// ============================================================

/**
 * 渠道管理服务
 */
export const channelsService = {
  /**
   * 获取渠道列表
   * 将前端 status 筛选映射为后端 isEnabled / healthStatus 参数
   */
  async getChannels(filters?: ChannelFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      search: filters?.search,
      provider: filters?.provider,
    }

    if (filters?.status === 'enabled') {
      params.isEnabled = 'true'
    } else if (filters?.status === 'disabled') {
      params.isEnabled = 'false'
    } else if (filters?.status === 'healthy' || filters?.status === 'unhealthy' || filters?.status === 'degraded') {
      params.healthStatus = filters.status
    }

    return api.get<ChannelListResponse>('/admin/channels', params)
  },

  /**
   * 获取单个渠道详情
   */
  async getChannel(id: string) {
    return api.get<ChannelDetail>(`/admin/channels/${id}`)
  },

  /**
   * 创建渠道
   */
  async createChannel(data: CreateChannelRequest) {
    return api.post<ChannelDetail>('/admin/channels', data)
  },

  /**
   * 更新渠道
   */
  async updateChannel(id: string, data: UpdateChannelRequest) {
    return api.patch<ChannelDetail>(`/admin/channels/${id}`, data)
  },

  /**
   * 删除渠道
   */
  async deleteChannel(id: string) {
    return api.delete<void>(`/admin/channels/${id}`)
  },

  /**
   * 测试渠道连接
   */
  async testChannel(id: string, model?: string) {
    return api.post<ChannelTestResult>(`/admin/channels/${id}/test`, model ? { model } : {})
  },

  /**
   * 重置渠道健康状态
   */
  async resetChannelHealth(id: string) {
    return api.post<ChannelHealthResetResult>(`/admin/channels/${id}/reset-health`)
  },

  /**
   * 批量启用/禁用渠道 (便捷方法)
   */
  async toggleChannel(id: string, isEnabled: boolean) {
    return api.patch<ChannelDetail>(`/admin/channels/${id}`, { isEnabled })
  },
}

export default channelsService
