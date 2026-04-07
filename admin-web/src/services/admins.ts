import { api } from './api'

export type AdminRole = 'super_admin' | 'admin' | 'operator' | 'viewer'
export type AssignableAdminRole = Exclude<AdminRole, 'super_admin'>

export interface AdminListStats {
  total: number
  active: number
  inactive: number
  byRole: Record<AdminRole, number>
}

export interface AdminPermissionMeta {
  key: string
  label: string
  category: string
}

export interface AdminProfile {
  id: string
  username: string
  email: string | null
  role: AdminRole
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  customPermissions: string[]
  effectivePermissions: string[]
}

export interface AdminListData {
  admins: AdminProfile[]
  stats: AdminListStats
}

export interface AdminsListFilters {
  page?: number
  limit?: number
  search?: string
  role?: AdminRole
  isActive?: string
  sortBy?: 'createdAt' | 'username' | 'email' | 'lastLoginAt'
  sortOrder?: 'asc' | 'desc'
}

export interface AdminMetaData {
  assignableRoles: AssignableAdminRole[]
  permissions: AdminPermissionMeta[]
  rolePermissions: Record<AdminRole, string[]>
}

export interface CreateAdminRequest {
  username: string
  email?: string
  password: string
  role: AssignableAdminRole
  permissions?: string[]
  isActive?: boolean
}

export interface UpdateAdminRequest {
  email?: string
  role?: AssignableAdminRole
  permissions?: string[]
  isActive?: boolean
}

export interface ResetAdminPasswordRequest {
  newPassword: string
}

export const adminsService = {
  async getAdmins(filters?: AdminsListFilters) {
    const params: Record<string, string | number | boolean | undefined> = {
      page: filters?.page,
      limit: filters?.limit,
      search: filters?.search,
      role: filters?.role,
      isActive: filters?.isActive,
      sortBy: filters?.sortBy,
      sortOrder: filters?.sortOrder,
    }

    return api.get<AdminListData>('/admin/admins', params)
  },

  async getAdminsMeta() {
    return api.get<AdminMetaData>('/admin/admins/meta')
  },

  async getAdmin(id: string) {
    return api.get<{ admin: AdminProfile }>(`/admin/admins/${id}`)
  },

  async createAdmin(data: CreateAdminRequest) {
    return api.post<{ message: string; admin: AdminProfile }>('/admin/admins', data)
  },

  async updateAdmin(id: string, data: UpdateAdminRequest) {
    return api.patch<{ message: string; admin: AdminProfile }>(`/admin/admins/${id}`, data)
  },

  async deleteAdmin(id: string) {
    return api.delete<{ message: string; admin: { id: string; username: string } }>(`/admin/admins/${id}`)
  },

  async resetAdminPassword(id: string, newPassword: string) {
    const payload: ResetAdminPasswordRequest = { newPassword }
    return api.post<{ message: string }>(`/admin/admins/${id}/reset-password`, payload)
  },
}

export default adminsService
