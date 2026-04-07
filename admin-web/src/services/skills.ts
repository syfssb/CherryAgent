import { api } from './api'

// ============================================================
// 类型定义
// ============================================================

/**
 * Skill 分类
 */
export type SkillCategory =
  | 'general'
  | 'development'
  | 'writing'
  | 'analysis'
  | 'automation'
  | 'communication'
  | 'design'
  | 'data'
  | 'devops'
  | 'other'

/**
 * Skill 运行时类型
 */
export type SkillRuntime = 'claude' | 'codex'

/**
 * Skill 详情
 */
export interface SkillDetail {
  id: string
  name: string
  slug: string
  description: string | null
  category: SkillCategory
  skillContent: string
  icon: string | null
  isEnabled: boolean
  isDefault: boolean
  sortOrder: number
  version: string
  compatibleRuntimes: SkillRuntime[]
  i18n: Record<string, Record<string, string>> | null
  createdAt: string
  updatedAt: string
}

/**
 * Skill 列表汇总
 */
export interface SkillSummary {
  totalSkills: number
  enabledSkills: number
  defaultSkills: number
  categories: number
}

/**
 * Skill 列表响应
 */
export interface SkillListResponse {
  skills: SkillDetail[]
  summary: SkillSummary
}

/**
 * Skill 列表筛选参数
 */
export interface SkillFilters {
  page?: number
  limit?: number
  search?: string
  category?: SkillCategory | string
  isEnabled?: 'true' | 'false'
}

/**
 * 创建 Skill 请求参数
 */
export interface CreateSkillRequest {
  name: string
  slug: string
  description?: string | null
  category?: SkillCategory
  skillContent: string
  icon?: string | null
  isEnabled?: boolean
  isDefault?: boolean
  sortOrder?: number
  version?: string
  compatibleRuntimes?: SkillRuntime[]
  i18n?: Record<string, Record<string, string>>
}

/**
 * 更新 Skill 请求参数
 */
export interface UpdateSkillRequest {
  name?: string
  slug?: string
  description?: string | null
  category?: SkillCategory
  skillContent?: string
  icon?: string | null
  isEnabled?: boolean
  isDefault?: boolean
  sortOrder?: number
  version?: string
  compatibleRuntimes?: SkillRuntime[]
  i18n?: Record<string, Record<string, string>>
}

// ============================================================
// 常量
// ============================================================

/**
 * 分类选项
 */
export const SKILL_CATEGORY_OPTIONS: Array<{ value: SkillCategory; label: string }> = [
  { value: 'general', label: '通用' },
  { value: 'development', label: '开发' },
  { value: 'writing', label: '写作' },
  { value: 'analysis', label: '分析' },
  { value: 'automation', label: '自动化' },
  { value: 'communication', label: '沟通' },
  { value: 'design', label: '设计' },
  { value: 'data', label: '数据' },
  { value: 'devops', label: 'DevOps' },
  { value: 'other', label: '其他' },
]

/**
 * 兼容运行时选项
 */
export const SKILL_RUNTIME_OPTIONS: Array<{ value: SkillRuntime; label: string }> = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
]

// ============================================================
// 服务实现
// ============================================================

/**
 * Skill 管理服务
 */
export const skillsService = {
  /**
   * 获取 skill 列表
   */
  async getSkills(filters?: SkillFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      search: filters?.search,
      category: filters?.category,
      isEnabled: filters?.isEnabled,
    }

    return api.get<SkillListResponse>('/admin/skills', params)
  },

  /**
   * 创建 skill
   */
  async createSkill(data: CreateSkillRequest) {
    return api.post<{ message: string; skill: SkillDetail }>(
      '/admin/skills',
      data
    )
  },

  /**
   * 更新 skill
   */
  async updateSkill(id: string, data: UpdateSkillRequest) {
    return api.put<{ message: string; skill: SkillDetail }>(
      `/admin/skills/${encodeURIComponent(id)}`,
      data
    )
  },

  /**
   * 删除 skill
   */
  async deleteSkill(id: string) {
    return api.delete<{ message: string }>(
      `/admin/skills/${encodeURIComponent(id)}`
    )
  },

  /**
   * 启用/禁用 skill
   */
  async toggleSkill(id: string) {
    return api.patch<{ message: string; skill: SkillDetail }>(
      `/admin/skills/${encodeURIComponent(id)}/toggle`
    )
  },
}

export default skillsService
