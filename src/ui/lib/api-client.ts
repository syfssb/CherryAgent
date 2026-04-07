import { useAuthStore } from '@/ui/store/useAuthStore';

/**
 * API 基础 URL
 * 从环境变量读取,默认为本地开发服务器
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

/**
 * HTTP 响应类型
 */
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 请求配置
 */
interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  requireAuth?: boolean;
}

/**
 * 请求错误类
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * API 客户端类
 * 提供统一的 HTTP 请求接口,自动处理认证和错误
 */
class ApiClient {
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  /**
   * 获取当前访问令牌
   */
  private getAccessToken(): string | null {
    return useAuthStore.getState().accessToken;
  }

  /**
   * 检查令牌是否即将过期
   */
  private isTokenExpiringSoon(): boolean {
    const { tokenExpiresAt } = useAuthStore.getState();
    if (!tokenExpiresAt) return true;

    // 提前 5 分钟刷新
    const bufferTime = 5 * 60 * 1000;
    return Date.now() > tokenExpiresAt - bufferTime;
  }

  /**
   * 刷新访问令牌
   */
  private async refreshAccessToken(): Promise<string | null> {
    if (this.isRefreshing) {
      // 如果正在刷新,等待刷新完成
      return new Promise((resolve) => {
        this.refreshSubscribers.push((token) => {
          resolve(token);
        });
      });
    }

    this.isRefreshing = true;

    try {
      await useAuthStore.getState().refresh();
      const newToken = this.getAccessToken();

      // 通知所有等待的请求
      this.refreshSubscribers.forEach((callback) => {
        callback(newToken || '');
      });
      this.refreshSubscribers = [];

      return newToken;
    } catch (error) {
      // 刷新失败,会在 refresh 方法中自动登出
      this.refreshSubscribers = [];
      return null;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * 发送 HTTP 请求
   */
  async request<T = any>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      requireAuth = true,
    } = config;

    // 构建完整 URL
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${API_BASE_URL}${endpoint}`;

    // 检查令牌是否需要刷新
    if (requireAuth && this.isTokenExpiringSoon()) {
      await this.refreshAccessToken();
    }

    // 构建请求头
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    // 添加认证令牌
    if (requireAuth) {
      const token = this.getAccessToken();
      if (token) {
        requestHeaders.Authorization = `Bearer ${token}`;
      }
    }

    // 构建请求配置
    const requestInit: RequestInit = {
      method,
      headers: requestHeaders,
      credentials: 'include',
    };

    if (body !== undefined) {
      requestInit.body = JSON.stringify(body);
    }

    try {
      // 发送请求
      const response = await fetch(url, requestInit);

      // 处理 401 未授权错误
      if (response.status === 401) {
        if (requireAuth) {
          if (!this.isRefreshing) {
            // 尝试刷新令牌
            const newToken = await this.refreshAccessToken();

            if (newToken) {
              // 刷新成功,重试请求
              requestHeaders.Authorization = `Bearer ${newToken}`;
              const retryResponse = await fetch(url, {
                ...requestInit,
                headers: requestHeaders,
              });

              if (retryResponse.ok) {
                const data = await retryResponse.json();
                return data;
              }
            }
          }

          // 刷新失败或无法刷新,触发登出
          useAuthStore.getState().logout();
          throw new ApiError(401, '登录已过期,请重新登录');
        }

        // 非鉴权请求(例如登录)应保留后端原始错误,不触发登出
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message
          || errorData.message
          || (typeof errorData.error === 'string' ? errorData.error : '认证失败');
        throw new ApiError(401, errorMessage, errorData);
      }

      // 处理 403 禁止访问错误
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message
          || errorData.message
          || (typeof errorData.error === 'string' ? errorData.error : '无权访问此资源');
        throw new ApiError(403, errorMessage, errorData);
      }

      // 处理其他错误状态
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.message
          || (typeof errorData.error === 'string' ? errorData.error : errorData.error?.message)
          || `请求失败: ${response.statusText}`;
        throw new ApiError(
          response.status,
          errMsg,
          errorData
        );
      }

      // 解析响应数据
      const data = await response.json();
      return data;
    } catch (error) {
      // 网络错误或其他异常
      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError(
        0,
        error instanceof Error ? error.message : '网络请求失败',
        error
      );
    }
  }

  /**
   * GET 请求
   */
  async get<T = any>(
    endpoint: string,
    config?: Omit<RequestConfig, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'GET' });
  }

  /**
   * POST 请求
   */
  async post<T = any>(
    endpoint: string,
    body?: any,
    config?: Omit<RequestConfig, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'POST', body });
  }

  /**
   * PUT 请求
   */
  async put<T = any>(
    endpoint: string,
    body?: any,
    config?: Omit<RequestConfig, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'PUT', body });
  }

  /**
   * DELETE 请求
   */
  async delete<T = any>(
    endpoint: string,
    config?: Omit<RequestConfig, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  }

  /**
   * PATCH 请求
   */
  async patch<T = any>(
    endpoint: string,
    body?: any,
    config?: Omit<RequestConfig, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'PATCH', body });
  }
}

/**
 * 导出单例实例
 */
export const apiClient = new ApiClient();

/**
 * 导出便捷方法
 */
export const { get, post, put, delete: del, patch } = apiClient;
