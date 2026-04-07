import { api } from './api'

// ============================================================
// 类型定义
// ============================================================

export type AnnouncementType = 'info' | 'warning' | 'important' | 'critical' | 'maintenance' | 'promotion'

export interface Announcement {
  id: string
  title: string
  content: string
  type: AnnouncementType
  isPublished: boolean
  isPinned: boolean
  pinnedAt: string | null
  publishedAt: string | null
  expiresAt: string | null
  sortOrder: number
  i18n: Record<string, Record<string, string>> | null
  createdAt: string
  updatedAt: string
}

export interface AnnouncementListResponse {
  announcements: Announcement[]
}

export interface AnnouncementFilters {
  page?: number
  limit?: number
  type?: AnnouncementType
  isPublished?: 'true' | 'false'
  search?: string
}

export interface CreateAnnouncementRequest {
  title: string
  content: string
  type?: AnnouncementType
  isPublished?: boolean
  isPinned?: boolean
  expiresAt?: string | null
  sortOrder?: number
  i18n?: Record<string, Record<string, string>>
}

export interface UpdateAnnouncementRequest {
  title?: string
  content?: string
  type?: AnnouncementType
  isPublished?: boolean
  isPinned?: boolean
  expiresAt?: string | null
  sortOrder?: number
  i18n?: Record<string, Record<string, string>>
}

// ============================================================
// 服务实现
// ============================================================

export const announcementsService = {
  async getAnnouncements(filters?: AnnouncementFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      type: filters?.type,
      isPublished: filters?.isPublished,
      search: filters?.search,
    }
    return api.get<AnnouncementListResponse>('/admin/announcements', params)
  },

  async createAnnouncement(data: CreateAnnouncementRequest) {
    return api.post<{ message: string; announcement: Announcement }>(
      '/admin/announcements',
      data
    )
  },

  async updateAnnouncement(id: string, data: UpdateAnnouncementRequest) {
    return api.put<{ message: string; announcement: Announcement }>(
      `/admin/announcements/${id}`,
      data
    )
  },

  async deleteAnnouncement(id: string) {
    return api.delete<{ message: string }>(`/admin/announcements/${id}`)
  },

  async pinAnnouncement(id: string) {
    return api.put<{ message: string; announcement: Announcement }>(
      `/admin/announcements/${id}/pin`
    )
  },

  async unpinAnnouncement(id: string) {
    return api.put<{ message: string; announcement: Announcement }>(
      `/admin/announcements/${id}/unpin`
    )
  },
}

export default announcementsService
