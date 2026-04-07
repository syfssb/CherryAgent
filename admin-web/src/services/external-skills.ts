import { api } from './api'

// ============================================================
// 类型定义
// ============================================================

/**
 * 外部 Skill 详情
 */
export interface ExternalSkill {
  id: string
  source: string
  repoUrl: string
  skillSlug: string
  name: string
  description: string | null
  category: string | null
  skillContent: string
  icon: string | null
  version: string | null
  status: 'pending' | 'approved' | 'rejected' | 'imported'
  importedToPresetId: string | null
  metadata: Record<string, unknown> | null
  fetchedAt: string
  createdAt: string
  updatedAt: string
}

/**
 * 外部 Skill 列表响应
 */
export interface ExternalSkillListResponse {
  skills: ExternalSkill[]
}

/**
 * 外部 Skill 列表筛选参数
 */
export interface ExternalSkillFilters {
  page?: number
  limit?: number
  status?: string
  source?: string
}

/**
 * 抓取请求参数
 */
export interface FetchSkillsRequest {
  repos?: Array<{
    owner: string
    repo: string
    skillsPath?: string
  }>
}

/**
 * 导入请求参数
 */
export interface ImportSkillRequest {
  isDefault?: boolean
}

// ============================================================
// 服务实现
// ============================================================

/**
 * 外部 Skill 管理服务
 */
export const externalSkillsService = {
  /**
   * 获取外部 skill 列表
   */
  async getExternalSkills(filters?: ExternalSkillFilters) {
    const params: Record<string, string | number | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      status: filters?.status,
      source: filters?.source,
    }

    return api.get<ExternalSkillListResponse>('/admin/external-skills', params)
  },

  /**
   * 从 GitHub 抓取外部 skills
   */
  async fetchSkills(data?: FetchSkillsRequest) {
    return api.post<{
      message: string
      inserted: number
      skipped: number
      total: number
    }>('/admin/external-skills/fetch', data || {})
  },

  /**
   * 导入外部 skill 到 preset_skills
   */
  async importSkill(id: string, data?: ImportSkillRequest) {
    return api.post<{ message: string; presetSkillId: string }>(
      `/admin/external-skills/${encodeURIComponent(id)}/import`,
      data || {}
    )
  },

  /**
   * 更新外部 skill 状态
   */
  async updateStatus(id: string, status: 'pending' | 'approved' | 'rejected') {
    return api.patch<{ message: string; skill: ExternalSkill }>(
      `/admin/external-skills/${encodeURIComponent(id)}/status`,
      { status }
    )
  },

  /**
   * 删除外部 skill
   */
  async deleteSkill(id: string) {
    return api.delete<{ message: string }>(
      `/admin/external-skills/${encodeURIComponent(id)}`
    )
  },
}

export default externalSkillsService
