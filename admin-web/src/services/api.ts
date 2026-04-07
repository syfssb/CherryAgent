import { useAdminStore } from '@/store/useAdminStore'
import type { ApiResponse } from '@/types'

/**
 * API 基础 URL
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

/**
 * API 错误类
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * 请求配置
 */
interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
}

/**
 * 构建带查询参数的 URL
 */
function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin)

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value))
      }
    })
  }

  return url.toString()
}

/**
 * 通用 API 请求函数
 */
async function request<T>(
  path: string,
  config: RequestConfig = {}
): Promise<ApiResponse<T>> {
  const { params, ...fetchConfig } = config
  const url = buildUrl(path, params)

  // 获取 token
  const { token, logout } = useAdminStore.getState()

  // 构建请求头
  const headers = new Headers(fetchConfig.headers)
  headers.set('Content-Type', 'application/json')

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  try {
    const response = await fetch(url, {
      ...fetchConfig,
      headers,
    })

    // 处理 401 未授权
    if (response.status === 401) {
      logout()
      throw new ApiError('登录已过期，请重新登录', 401, 'UNAUTHORIZED')
    }

    // 解析响应
    const data = await response.json()

    // 处理业务错误
    if (!response.ok) {
      // 后端 error 可能是对象 { code, message } 或字符串
      const errObj = data.error
      const errorMessage =
        typeof errObj === 'object' && errObj !== null
          ? errObj.message ?? '请求失败'
          : errObj ?? data.message ?? '请求失败'
      const errorCode =
        typeof errObj === 'object' && errObj !== null
          ? errObj.code
          : errObj

      throw new ApiError(
        errorMessage,
        response.status,
        errorCode
      )
    }

    return data as ApiResponse<T>
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    // 处理网络错误
    throw new ApiError(
      error instanceof Error ? error.message : '网络请求失败',
      0,
      'NETWORK_ERROR'
    )
  }
}

/**
 * API 客户端
 */
export const api = {
  /**
   * GET 请求
   */
  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>) {
    return request<T>(path, { method: 'GET', params })
  },

  /**
   * POST 请求
   */
  post<T>(path: string, body?: unknown) {
    return request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  },

  /**
   * PUT 请求
   */
  put<T>(path: string, body?: unknown) {
    return request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    })
  },

  /**
   * PATCH 请求
   */
  patch<T>(path: string, body?: unknown) {
    return request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    })
  },

  /**
   * DELETE 请求
   */
  delete<T>(path: string) {
    return request<T>(path, { method: 'DELETE' })
  },
}

export default api
