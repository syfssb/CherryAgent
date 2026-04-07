import { useAuthStore } from '@/ui/store/useAuthStore';
import type { ApiResponse, RequestConfig } from './types';
import { ApiError } from './error';
import { RequestCache } from './cache';
import { InterceptorManager } from './interceptors';

/**
 * API 客户端配置
 */
export interface ApiClientConfig {
  /** API 基础 URL */
  baseURL?: string;
  /** 默认超时时间（毫秒） */
  timeout?: number;
  /** 默认请求头 */
  headers?: Record<string, string>;
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 是否启用日志 */
  enableLogging?: boolean;
  /** 是否在开发模式 */
  isDevelopment?: boolean;
}

/**
 * 统一 API 客户端
 *
 * 提供统一的 HTTP 请求接口，自动处理认证、错误、重试、缓存等
 *
 * 特性：
 * - 自动添加 Authorization 头
 * - Token 自动刷新
 * - 统一错误处理
 * - 请求重试机制
 * - 请求缓存
 * - 请求/响应拦截器
 * - 请求取消
 * - 开发模式日志
 */
export class ApiClient {
  private config: Required<ApiClientConfig>;
  private cache: RequestCache;
  private interceptors: InterceptorManager;
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  constructor(config: ApiClientConfig = {}) {
    // 合并默认配置
    this.config = {
      baseURL: config.baseURL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': import.meta.env.VITE_APP_VERSION || '1.0.0',
        ...config.headers,
      },
      enableCache: config.enableCache ?? true,
      enableLogging: config.enableLogging ?? import.meta.env.DEV,
      isDevelopment: config.isDevelopment ?? import.meta.env.DEV,
    };

    this.cache = new RequestCache();
    this.interceptors = new InterceptorManager();

    // 添加默认拦截器
    this.setupDefaultInterceptors();

    // 定期清理过期缓存
    if (this.config.enableCache) {
      setInterval(() => this.cache.clearExpired(), 60000); // 每分钟清理一次
    }
  }

  /**
   * 设置默认拦截器
   */
  private setupDefaultInterceptors(): void {
    // 请求拦截器：添加认证令牌
    this.interceptors.addRequestInterceptor(async (url, config) => {
      if (config.requireAuth !== false) {
        const token = this.getAccessToken();
        if (token) {
          config.headers = {
            ...config.headers,
            Authorization: `Bearer ${token}`,
          };
        }
      }
      return { url, config };
    });

    // 请求拦截器：开发模式日志
    if (this.config.enableLogging) {
      this.interceptors.addRequestInterceptor((url, config) => {
        console.log(`[API Request] ${config.method || 'GET'} ${url}`, {
          headers: config.headers,
          body: config.body,
        });
        return { url, config };
      });
    }

    // 响应拦截器：开发模式日志
    if (this.config.enableLogging) {
      this.interceptors.addResponseInterceptor((response, data) => {
        console.log(`[API Response] ${response.status} ${response.url}`, data);
        return data;
      });
    }

    // 错误拦截器：开发模式日志
    if (this.config.enableLogging) {
      this.interceptors.addErrorInterceptor((error) => {
        console.error('[API Error]', error.toJSON());
        return error;
      });
    }
  }

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
      // 如果正在刷新，等待刷新完成
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
      // 刷新失败，会在 refresh 方法中自动登出
      this.refreshSubscribers = [];
      return null;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 带重试的请求
   */
  private async requestWithRetry<T>(
    url: string,
    config: RequestConfig,
    retryCount = 0
  ): Promise<Response> {
    try {
      // 构建完整 URL
      const fullUrl = url.startsWith('http') ? url : `${this.config.baseURL}${url}`;

      // 构建请求配置
      const requestInit: RequestInit = {
        method: config.method || 'GET',
        headers: {
          ...this.config.headers,
          ...config.headers,
        } as HeadersInit,
        signal: config.signal,
      };

      if (config.body !== undefined) {
        requestInit.body = JSON.stringify(config.body);
      }

      // 设置超时
      const timeout = config.timeout || this.config.timeout;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(fullUrl, {
          ...requestInit,
          signal: config.signal || controller.signal,
        });

        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      // 检查是否需要重试
      const shouldRetry =
        config.retry &&
        retryCount < (config.retry?.maxRetries || 3) &&
        (config.retry?.retryOnAllErrors || error instanceof TypeError); // 网络错误

      if (shouldRetry) {
        const delay =
          (config.retry?.retryDelay || 1000) *
          Math.pow(config.retry?.retryDelayMultiplier || 2, retryCount);

        if (this.config.enableLogging) {
          console.log(`[API Retry] Attempt ${retryCount + 1} after ${delay}ms`);
        }

        await this.delay(delay);
        return this.requestWithRetry<T>(url, config, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * 发送 HTTP 请求
   */
  async request<T = any>(url: string, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    // 检查缓存
    if (this.config.enableCache && config.cache?.enabled && config.method === 'GET') {
      const cached = this.cache.get<ApiResponse<T>>(url, config);
      if (cached) {
        if (this.config.enableLogging) {
          console.log(`[API Cache] Cache hit for ${url}`);
        }
        return cached;
      }
    }

    // 检查令牌是否需要刷新
    if (config.requireAuth !== false && this.isTokenExpiringSoon()) {
      await this.refreshAccessToken();
    }

    try {
      // 执行请求拦截器
      const intercepted = await this.interceptors.runRequestInterceptors(url, config);

      // 发送请求
      const response = await this.requestWithRetry<T>(intercepted.url, intercepted.config);

      // 处理 401 未授权错误
      if (response.status === 401) {
        if (config.requireAuth !== false && !this.isRefreshing) {
          // 尝试刷新令牌
          const newToken = await this.refreshAccessToken();

          if (newToken) {
            // 刷新成功，重试请求
            const retryConfig = {
              ...config,
              headers: {
                ...config.headers,
                Authorization: `Bearer ${newToken}`,
              },
            };

            const retryResponse = await this.requestWithRetry<T>(url, retryConfig);

            if (retryResponse.ok) {
              const data = await retryResponse.json();
              const finalData = await this.interceptors.runResponseInterceptors(
                retryResponse,
                data
              );
              return finalData;
            }
          }
        }

        // 刷新失败或无法刷新，触发登出
        useAuthStore.getState().logout();
        const error = new ApiError(401, '登录已过期，请重新登录', 'UNAUTHORIZED');
        throw await this.interceptors.runErrorInterceptors(error);
      }

      // 处理 403 禁止访问错误
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        const error = new ApiError(
          403,
          errorData.error?.message || errorData.message || '无权访问此资源',
          errorData.error?.code || 'FORBIDDEN',
          errorData
        );
        throw await this.interceptors.runErrorInterceptors(error);
      }

      // 处理 500 错误
      if (response.status >= 500) {
        const errorData = await response.json().catch(() => ({}));
        const error = new ApiError(
          response.status,
          errorData.message || errorData.error || '服务器错误，请稍后重试',
          errorData.code || 'SERVER_ERROR',
          errorData
        );
        throw await this.interceptors.runErrorInterceptors(error);
      }

      // 处理其他错误状态
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.message
          || (typeof errorData.error === 'string' ? errorData.error : errorData.error?.message)
          || `请求失败: ${response.statusText}`;
        const errCode = errorData.code || errorData.error?.code || 'REQUEST_FAILED';
        const error = new ApiError(
          response.status,
          errMsg,
          errCode,
          errorData
        );
        throw await this.interceptors.runErrorInterceptors(error);
      }

      // 解析响应数据
      const data = await response.json();

      // 执行响应拦截器
      const finalData = await this.interceptors.runResponseInterceptors(response, data);

      // 保存到缓存
      if (this.config.enableCache && config.cache?.enabled && config.method === 'GET') {
        this.cache.set(url, finalData, config);
      }

      return finalData;
    } catch (error) {
      // 网络错误或其他异常
      if (error instanceof ApiError) {
        throw error;
      }

      const apiError = new ApiError(
        0,
        error instanceof Error ? error.message : '网络请求失败',
        'NETWORK_ERROR',
        error
      );

      throw await this.interceptors.runErrorInterceptors(apiError);
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

  /**
   * 获取拦截器管理器
   */
  get interceptor(): InterceptorManager {
    return this.interceptors;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  get cacheSize(): number {
    return this.cache.size;
  }
}

/**
 * 创建默认 API 客户端实例
 */
export const apiClient = new ApiClient();

/**
 * 导出便捷方法
 */
export const { get, post, put, delete: del, patch } = apiClient;
