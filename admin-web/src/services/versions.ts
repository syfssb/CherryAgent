import { api } from './api'

// ============================================================
// 类型定义
// ============================================================

/**
 * 更新策略
 */
export type UpdateStrategy = 'none' | 'optional' | 'recommended' | 'forced'

/**
 * 下载链接集合
 */
export interface VersionDownloadUrls {
  macArm64: string | null
  macX64: string | null
  winX64: string | null
  linuxX64: string | null
}

/**
 * 下载计数集合
 */
export interface VersionDownloadCounts {
  mac: number
  win: number
  linux: number
  total: number
}

/**
 * 版本详情 - 匹配后端返回的完整数据格式
 */
export interface VersionDetail {
  id: string
  version: string
  downloadUrls: VersionDownloadUrls
  releaseNotes: string | null
  releaseDate: string
  updateStrategy: UpdateStrategy
  minVersion: string | null
  stagingPercentage: number
  downloadCounts: VersionDownloadCounts
  isPublished: boolean
  isLatest: boolean
  createdAt: string
}

/**
 * 版本列表筛选参数
 */
export interface VersionFilters {
  page?: number
  limit?: number
  isPublished?: boolean
  updateStrategy?: UpdateStrategy
}

/**
 * 版本列表响应
 */
export interface VersionListResponse {
  versions: VersionDetail[]
  latestVersion: string | null
}

/**
 * 创建版本请求参数
 */
export interface CreateVersionRequest {
  version: string
  downloadUrlMacArm64?: string
  downloadUrlMacX64?: string
  downloadUrlWinX64?: string
  downloadUrlLinuxX64?: string
  releaseNotes?: string
  releaseDate?: string
  updateStrategy?: UpdateStrategy
  minVersion?: string
  stagingPercentage?: number
  isPublished?: boolean
}

/**
 * 更新版本请求参数
 */
export interface UpdateVersionRequest {
  downloadUrlMacArm64?: string | null
  downloadUrlMacX64?: string | null
  downloadUrlWinX64?: string | null
  downloadUrlLinuxX64?: string | null
  releaseNotes?: string
  releaseDate?: string
  updateStrategy?: UpdateStrategy
  minVersion?: string | null
  stagingPercentage?: number
  isPublished?: boolean
}

/**
 * 发布/取消发布响应
 */
export interface VersionPublishResponse {
  message: string
  version: {
    id: string
    version: string
  }
}

/**
 * 删除版本响应
 */
export interface VersionDeleteResponse {
  message: string
  version: {
    id: string
    version: string
  }
}

/**
 * 创建版本响应
 */
export interface VersionCreateResponse {
  message: string
  version: {
    id: string
    version: string
    isPublished: boolean
    createdAt: string
  }
}

// ============================================================
// 服务实现
// ============================================================

/**
 * 版本管理服务
 */
export const versionsService = {
  /**
   * 获取版本列表
   */
  async getVersions(filters?: VersionFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
    }

    if (filters?.isPublished !== undefined) {
      params.isPublished = String(filters.isPublished)
    }

    if (filters?.updateStrategy) {
      params.updateStrategy = filters.updateStrategy
    }

    return api.get<VersionListResponse>('/admin/versions', params)
  },

  /**
   * 获取单个版本详情
   */
  async getVersion(id: string) {
    return api.get<{ version: VersionDetail }>(`/admin/versions/${id}`)
  },

  /**
   * 创建版本
   */
  async createVersion(data: CreateVersionRequest) {
    return api.post<VersionCreateResponse>('/admin/versions', data)
  },

  /**
   * 更新版本
   */
  async updateVersion(id: string, data: UpdateVersionRequest) {
    return api.patch<{ message: string }>(`/admin/versions/${id}`, data)
  },

  /**
   * 发布版本
   */
  async publishVersion(id: string) {
    return api.post<VersionPublishResponse>(`/admin/versions/${id}/publish`)
  },

  /**
   * 取消发布版本
   */
  async unpublishVersion(id: string) {
    return api.post<VersionPublishResponse>(`/admin/versions/${id}/unpublish`)
  },

  /**
   * 删除版本
   */
  async deleteVersion(id: string) {
    return api.delete<VersionDeleteResponse>(`/admin/versions/${id}`)
  },
}

export default versionsService
