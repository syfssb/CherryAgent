import { api } from './api'

// ============================================================
// 类型定义
// ============================================================

export type LegalContentType = 'privacy_policy' | 'terms_of_service' | 'about_us'

export interface LegalContent {
  id: string
  type: LegalContentType
  content: string
  i18n: Record<string, Record<string, string>> | null
  version: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  updatedBy: string | null
}

export interface UpdateLegalContentRequest {
  content?: string
  i18n?: Record<string, Record<string, string>>
  version?: string
  isActive?: boolean
}

// ============================================================
// 服务实现
// ============================================================

export const legalContentsService = {
  async getLegalContents() {
    return api.get<{ legalContents: LegalContent[] }>('/admin/legal-contents')
  },

  async getLegalContent(type: LegalContentType) {
    return api.get<{ legalContent: LegalContent }>(`/admin/legal-contents/${type}`)
  },

  async updateLegalContent(type: LegalContentType, data: UpdateLegalContentRequest) {
    return api.put<{ legalContent: LegalContent }>(
      `/admin/legal-contents/${type}`,
      data
    )
  },
}

export default legalContentsService
