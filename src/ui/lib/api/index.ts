/**
 * 统一 API 客户端入口
 *
 * 导出所有 API 模块和工具
 */

// 核心客户端
export { ApiClient, apiClient, get, post, put, del, patch } from './client';

// 类型定义
export type {
  ApiResponse,
  RequestConfig,
  HttpMethod,
  PaginationParams,
  TimeRangeParams,
  RetryConfig,
  CacheConfig,
} from './types';

// 错误处理
export { ApiError } from './error';

// 缓存管理
export { RequestCache } from './cache';

// 拦截器
export {
  InterceptorManager,
  type RequestInterceptor,
  type ResponseInterceptor,
  type ErrorInterceptor,
} from './interceptors';

// 业务 API
export { authApi } from './auth';
export type {
  LoginRequest,
  LoginResponse,
  RefreshTokenResponse,
  UserInfoResponse,
  BalanceResponse,
  OAuthUrlResponse,
} from './auth';

export { billingApi } from './billing';
export type {
  CreateRechargeRequest,
  CreateRechargeResponse,
  GetUsageParams,
  GetUsageResponse,
  GetTransactionsParams,
  GetTransactionsResponse,
  PaymentStatusResponse,
} from './billing';

export { sessionApi } from './session';
export type {
  SessionData,
  TagData,
  GetSessionsParams,
  GetSessionsResponse,
  CreateSessionRequest,
  UpdateSessionRequest,
} from './session';

/**
 * 环境配置
 */
export const config = {
  /** API 基础 URL */
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  /** 是否为开发环境 */
  isDevelopment: import.meta.env.DEV,
  /** 是否为生产环境 */
  isProduction: import.meta.env.PROD,
  /** 应用版本 */
  version: import.meta.env.VITE_APP_VERSION || '1.0.0',
};

/**
 * 使用示例
 *
 * @example 基础使用
 * ```ts
 * import { authApi, billingApi, sessionApi } from '@/ui/lib/api';
 *
 * // 登录
 * const loginResult = await authApi.login('user@example.com', 'password');
 *
 * // 获取余额
 * const balance = await authApi.getBalance();
 *
 * // 创建充值订单
 * const order = await billingApi.createRecharge({
 *   amount: 5000,
 *   channel: 'xunhu_wechat'
 * });
 *
 * // 获取会话列表
 * const sessions = await sessionApi.list({ page: 1, pageSize: 20 });
 * ```
 *
 * @example 使用拦截器
 * ```ts
 * import { apiClient } from '@/ui/lib/api';
 *
 * // 添加自定义请求头
 * apiClient.interceptor.addRequestInterceptor((url, config) => {
 *   config.headers = {
 *     ...config.headers,
 *     'X-Custom-Header': 'value'
 *   };
 *   return { url, config };
 * });
 *
 * // 添加响应处理
 * apiClient.interceptor.addResponseInterceptor((response, data) => {
 *   console.log('Response received:', data);
 *   return data;
 * });
 * ```
 *
 * @example 使用重试和缓存
 * ```ts
 * import { apiClient } from '@/ui/lib/api';
 *
 * const response = await apiClient.get('/some-endpoint', {
 *   retry: {
 *     maxRetries: 3,
 *     retryDelay: 1000,
 *     retryDelayMultiplier: 2
 *   },
 *   cache: {
 *     enabled: true,
 *     ttl: 60000 // 缓存 1 分钟
 *   }
 * });
 * ```
 *
 * @example 使用 AbortController 取消请求
 * ```ts
 * import { apiClient } from '@/ui/lib/api';
 *
 * const controller = new AbortController();
 *
 * // 发起请求
 * const promise = apiClient.get('/some-endpoint', {
 *   signal: controller.signal
 * });
 *
 * // 取消请求
 * controller.abort();
 * ```
 */
