/**
 * API 类型定义
 *
 * 统一所有 API 接口的类型定义
 */

/**
 * API 响应基础格式
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string | { code?: string; message?: string };
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    [key: string]: any;
  };
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * 时间范围参数
 */
export interface TimeRangeParams {
  startTime?: number;
  endTime?: number;
}

/**
 * HTTP 方法类型
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * 请求配置选项
 */
export interface RequestConfig {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
  requireAuth?: boolean;
  timeout?: number;
  retry?: RetryConfig;
  cache?: CacheConfig;
  signal?: AbortSignal;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  /** 重试延迟倍数（指数退避） */
  retryDelayMultiplier?: number;
  /** 是否对所有错误重试（默认仅网络错误） */
  retryOnAllErrors?: boolean;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 是否启用缓存 */
  enabled?: boolean;
  /** 缓存时间（毫秒） */
  ttl?: number;
  /** 缓存键 */
  key?: string;
}

/**
 * API 错误类型
 */
export interface ApiErrorData {
  code: string;
  message: string;
  details?: any;
  timestamp?: number;
}
