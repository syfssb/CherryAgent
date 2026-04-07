import { apiClient } from './client';
import { ApiError } from './error';
import type { PaginationParams } from './types';

/**
 * 会话数据类型
 */
export interface SessionData {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
  isArchived?: boolean;
  tags?: string[];
  workspacePath?: string;
  messageCount?: number;
}

/**
 * 标签数据类型
 */
export interface TagData {
  id: string;
  name: string;
  color?: string;
  sessionCount: number;
}

/**
 * 会话列表查询参数
 */
export interface GetSessionsParams extends PaginationParams {
  search?: string;
  tags?: string[];
  isPinned?: boolean;
  isArchived?: boolean;
}

/**
 * 会话列表响应
 */
export interface GetSessionsResponse {
  sessions: SessionData[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 创建会话请求
 */
export interface CreateSessionRequest {
  title?: string;
  workspacePath?: string;
  tags?: string[];
}

/**
 * 更新会话请求
 */
export interface UpdateSessionRequest {
  title?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  tags?: string[];
}

/**
 * 会话 API
 */
export const sessionApi = {
  /**
   * 获取会话列表
   *
   * @example
   * ```ts
   * const result = await sessionApi.list({
   *   page: 1,
   *   pageSize: 20,
   *   search: 'react',
   *   tags: ['frontend'],
   *   isPinned: true
   * });
   * ```
   */
  async list(_params?: GetSessionsParams): Promise<GetSessionsResponse> {
    const response = await apiClient.get<GetSessionsResponse>('/sessions', {
      requireAuth: true,
      cache: {
        enabled: true,
        ttl: 30000, // 缓存 30 秒
      },
    });

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '获取会话列表失败', 'GET_SESSIONS_FAILED');
    }

    return response.data;
  },

  /**
   * 获取会话详情
   */
  async get(sessionId: string): Promise<SessionData> {
    const response = await apiClient.get<{ session: SessionData }>(
      `/sessions/${sessionId}`,
      {
        requireAuth: true,
        cache: {
          enabled: true,
          ttl: 60000, // 缓存 1 分钟
        },
      }
    );

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '获取会话详情失败', 'GET_SESSION_FAILED');
    }

    return response.data.session;
  },

  /**
   * 创建会话
   *
   * @example
   * ```ts
   * const session = await sessionApi.create({
   *   title: 'My New Session',
   *   workspacePath: '/path/to/workspace',
   *   tags: ['frontend', 'react']
   * });
   * ```
   */
  async create(data: CreateSessionRequest): Promise<SessionData> {
    const response = await apiClient.post<{ session: SessionData }>(
      '/sessions',
      data,
      { requireAuth: true }
    );

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '创建会话失败', 'CREATE_SESSION_FAILED');
    }

    // 清除列表缓存
    apiClient.clearCache();

    return response.data.session;
  },

  /**
   * 更新会话
   *
   * @example
   * ```ts
   * await sessionApi.update('session_123', {
   *   title: 'Updated Title',
   *   isPinned: true,
   *   tags: ['frontend', 'react', 'typescript']
   * });
   * ```
   */
  async update(sessionId: string, data: UpdateSessionRequest): Promise<SessionData> {
    const response = await apiClient.patch<{ session: SessionData }>(
      `/sessions/${sessionId}`,
      data,
      { requireAuth: true }
    );

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '更新会话失败', 'UPDATE_SESSION_FAILED');
    }

    // 清除缓存
    apiClient.clearCache();

    return response.data.session;
  },

  /**
   * 删除会话
   */
  async delete(sessionId: string): Promise<void> {
    const response = await apiClient.delete(`/sessions/${sessionId}`, {
      requireAuth: true,
    });

    if (!response.success) {
      throw new ApiError(400, response.error || '删除会话失败', 'DELETE_SESSION_FAILED');
    }

    // 清除缓存
    apiClient.clearCache();
  },

  /**
   * 搜索会话
   *
   * @example
   * ```ts
   * const results = await sessionApi.search({
   *   query: 'react components',
   *   tags: ['frontend']
   * });
   * ```
   */
  async search(_params: {
    query: string;
    tags?: string[];
    page?: number;
    pageSize?: number;
  }): Promise<GetSessionsResponse> {
    const response = await apiClient.get<GetSessionsResponse>('/sessions/search', {
      requireAuth: true,
    });

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '搜索会话失败', 'SEARCH_SESSIONS_FAILED');
    }

    return response.data;
  },

  /**
   * 获取所有标签
   */
  async getTags(): Promise<TagData[]> {
    const response = await apiClient.get<{ tags: TagData[] }>('/sessions/tags', {
      requireAuth: true,
      cache: {
        enabled: true,
        ttl: 120000, // 缓存 2 分钟
      },
    });

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '获取标签列表失败', 'GET_TAGS_FAILED');
    }

    return response.data.tags;
  },
};
