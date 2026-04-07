import { api } from './api'

// ============================================================
// 类型定义
// ============================================================

/**
 * 同步概览统计数据
 */
export interface SyncOverviewData {
  totalChanges: number
  totalConflicts: number
  unresolvedConflicts: number
  activeDevices: number
  activeUsers: number
}

/**
 * 用户同步摘要（列表项）
 */
export interface SyncUserSummary {
  userId: string
  email: string
  username: string | null
  changeCount: number
  conflictCount: number
  unresolvedConflicts: number
  deviceCount: number
  lastSyncAt: string | null
}

/**
 * 用户同步列表响应
 */
export interface SyncUsersListData {
  users: SyncUserSummary[]
}

/**
 * 设备信息
 */
export interface SyncDevice {
  deviceId: string
  lastSyncAt: string | null
}

/**
 * 变更记录
 */
export interface SyncChange {
  id: string
  entityType: string
  entityId: string
  changeType: string
  timestamp: string
  deviceId: string
}

/**
 * 冲突记录
 */
export interface SyncConflict {
  id: string
  entityType: string
  entityId: string
  localTimestamp: string
  remoteTimestamp: string
  createdAt: string
}

/**
 * 用户同步详情
 */
export interface SyncUserDetailData {
  userId: string
  email: string
  username: string | null
  changeCount: number
  conflictCount: number
  unresolvedConflicts: number
  deviceCount: number
  lastSyncAt: string | null
  devices: SyncDevice[]
  recentChanges: SyncChange[]
  unresolvedConflictList: SyncConflict[]
}

/**
 * 清理结果
 */
export interface SyncCleanupResult {
  message: string
  deletedChanges: number
  deletedConflicts: number
}

// ============================================================
// 服务实现
// ============================================================

/**
 * 同步管理服务
 */
export const syncService = {
  /**
   * 获取同步概览统计
   */
  async getOverview() {
    return api.get<SyncOverviewData>('/admin/sync/overview')
  },

  /**
   * 获取用户同步列表
   */
  async getUsers(page = 1, limit = 20) {
    return api.get<SyncUsersListData>('/admin/sync/users', { page, limit })
  },

  /**
   * 获取用户同步详情
   */
  async getUserDetail(userId: string) {
    return api.get<SyncUserDetailData>(`/admin/sync/users/${userId}`)
  },

  /**
   * 清除用户同步数据
   */
  async deleteUserSyncData(userId: string) {
    return api.delete<{ message: string }>(`/admin/sync/users/${userId}`)
  },

  /**
   * 清理过期同步数据
   */
  async cleanup(days: number) {
    return api.post<SyncCleanupResult>('/admin/sync/cleanup', { days })
  },
}

export default syncService
