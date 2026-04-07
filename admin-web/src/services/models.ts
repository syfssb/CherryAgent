import { api } from './api'
import type { ChannelProvider } from '@/constants/providers'

// Re-export as ModelProvider for backward compatibility
export type ModelProvider = ChannelProvider

/**
 * 模型定价信息 - 匹配后端返回格式
 */
export interface ModelPricing {
  inputPricePerMtok: number
  outputPricePerMtok: number
  cacheReadPricePerMtok: number
  cacheWritePricePerMtok: number
  longContextInputPrice: number
  longContextOutputPrice: number
  longContextThreshold: number
}

/**
 * 模型积分定价信息
 */
export interface ModelCreditsPricing {
  inputCreditsPerMtok: number
  outputCreditsPerMtok: number
  cacheReadCreditsPerMtok: number
  cacheWriteCreditsPerMtok: number
}

/**
 * 模型限制信息 - 匹配后端返回格式
 */
export interface ModelLimits {
  maxTokens: number
  maxContextLength: number
}

/**
 * 模型使用统计 - 匹配后端返回格式
 */
export interface ModelUsage {
  last7Days: {
    requestCount: number
    totalTokens: number
  }
}

/**
 * 模型详情 - 匹配后端 GET /admin/models 列表项格式
 */
export interface ModelDetail {
  id: string
  displayName: string
  provider: ModelProvider
  pricing: ModelPricing
  creditsPricing?: ModelCreditsPricing
  limits: ModelLimits
  isEnabled: boolean
  isHidden: boolean
  sortOrder: number
  description?: string | null
  features?: string[]
  useCases?: string[]
  tags?: string[]
  usage: ModelUsage | null
  createdAt: string
  updatedAt: string
}

/**
 * 模型列表汇总信息 - 匹配后端返回格式
 */
export interface ModelSummary {
  totalModels: number
  enabledModels: number
  providers: number
}

/**
 * 模型列表响应
 */
export interface ModelListResponse {
  models: ModelDetail[]
  summary: ModelSummary
}

/**
 * 模型列表筛选参数
 */
export interface ModelFilters {
  page?: number
  limit?: number
  search?: string
  provider?: ModelProvider | string
  isEnabled?: 'true' | 'false'
  isHidden?: 'true' | 'false'
}

/**
 * 创建模型请求参数 - 匹配后端 createModelSchema
 */
export interface CreateModelRequest {
  id: string
  displayName: string
  provider: ModelProvider
  inputCreditsPerMtok?: number
  outputCreditsPerMtok?: number
  cacheReadCreditsPerMtok?: number
  cacheWriteCreditsPerMtok?: number
  longContextInputPrice?: number
  longContextOutputPrice?: number
  longContextThreshold?: number
  maxTokens?: number
  maxContextLength?: number
  isEnabled?: boolean
  isHidden?: boolean
  sortOrder?: number
  description?: string
  features?: string[]
  useCases?: string[]
  tags?: string[]
}

/**
 * 更新模型请求参数 - 匹配后端 updateModelSchema
 */
export interface UpdateModelRequest {
  displayName?: string
  inputCreditsPerMtok?: number
  outputCreditsPerMtok?: number
  cacheReadCreditsPerMtok?: number
  cacheWriteCreditsPerMtok?: number
  longContextInputPrice?: number
  longContextOutputPrice?: number
  longContextThreshold?: number
  maxTokens?: number
  maxContextLength?: number
  isEnabled?: boolean
  isHidden?: boolean
  sortOrder?: number
  description?: string
  features?: string[]
  useCases?: string[]
  tags?: string[]
}

/**
 * 批量更新请求参数 - 匹配后端 batch-update
 */
export interface BatchUpdateModelsRequest {
  ids: string[]
  updates: {
    isEnabled?: boolean
    isHidden?: boolean
  }
}

/**
 * 批量更新响应
 */
export interface BatchUpdateModelsResponse {
  message: string
  updatedCount: number
}

/**
 * 模型详情响应 - GET /admin/models/:id
 */
export interface ModelDetailResponse {
  model: ModelDetail
  usage: {
    last30Days: {
      totalRequests: number
      totalTokens: number
      totalCost: number
      avgLatencyMs: string
    }
    daily: Array<{
      day: string
      requestCount: number
      totalTokens: number
      totalCost: number
    }>
  }
}

// ============================================================
// 服务实现
// ============================================================

/**
 * 模型管理服务
 */
export const modelsService = {
  /**
   * 获取模型列表
   */
  async getModels(filters?: ModelFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      search: filters?.search,
      provider: filters?.provider,
      isEnabled: filters?.isEnabled,
      isHidden: filters?.isHidden,
    }

    return api.get<ModelListResponse>('/admin/models', params)
  },

  /**
   * 获取单个模型详情
   */
  async getModel(id: string) {
    return api.get<ModelDetailResponse>(`/admin/models/${encodeURIComponent(id)}`)
  },

  /**
   * 创建模型
   */
  async createModel(data: CreateModelRequest) {
    return api.post<{ message: string; model: { id: string; displayName: string; provider: string } }>(
      '/admin/models',
      data
    )
  },

  /**
   * 更新模型配置
   */
  async updateModel(id: string, data: UpdateModelRequest) {
    return api.patch<{ message: string }>(
      `/admin/models/${encodeURIComponent(id)}`,
      data
    )
  },

  /**
   * 启用/禁用模型（便捷方法）
   */
  async toggleModel(id: string, isEnabled: boolean) {
    return api.patch<{ message: string }>(
      `/admin/models/${encodeURIComponent(id)}`,
      { isEnabled }
    )
  },

  /**
   * 删除模型
   */
  async deleteModel(id: string) {
    return api.delete<{ message: string }>(
      `/admin/models/${encodeURIComponent(id)}`
    )
  },

  /**
   * 批量更新模型状态
   */
  async batchUpdateModels(data: BatchUpdateModelsRequest) {
    return api.post<BatchUpdateModelsResponse>(
      '/admin/models/batch-update',
      data
    )
  },

  /**
   * 批量删除模型
   */
  async batchDeleteModels(ids: string[]) {
    return api.post<{ message: string; deletedCount: number }>(
      '/admin/models/batch-delete',
      { ids }
    )
  },
}

export default modelsService
