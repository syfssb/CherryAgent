/**
 * 代理服务客户端
 *
 * 负责与云端代理服务通信,处理:
 * - API Key 管理
 * - 请求转发
 * - 错误处理
 * - 离线检测
 * - 余额不足等特殊错误
 */

import { getAccessToken } from './auth-service.js';
import { getToken } from './secure-storage.js';
import { getProxyBaseUrl } from "./runtime-config.js";
import { existsSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";

function loadLocalEnv(): void {
  if (process.env.NODE_ENV !== "development") return;
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
}

loadLocalEnv();

/**
 * 代理服务配置
 */
export interface ProxyConfig {
  /** 代理服务基础 URL */
  baseURL: string | undefined;
  /** 用户的云端 API Key */
  apiKey?: string;
  /** 超时时间 (毫秒) */
  timeout?: number;
}

/**
 * 代理服务错误类型
 */
export class ProxyError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ProxyError';
  }
}

/**
 * 余额不足错误
 */
export class InsufficientBalanceError extends ProxyError {
  constructor(
    message: string,
    public currentBalance: number,
    public requiredAmount: number
  ) {
    super(message, 'insufficient_balance', 402, { currentBalance, requiredAmount });
    this.name = 'InsufficientBalanceError';
  }
}

/**
 * 速率限制错误
 */
export class RateLimitError extends ProxyError {
  constructor(
    message: string,
    public retryAfter: number
  ) {
    super(message, 'rate_limit_exceeded', 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}

/**
 * 未认证错误
 */
export class UnauthenticatedError extends ProxyError {
  constructor(message: string = '未登录或登录已过期,请重新登录') {
    super(message, 'unauthenticated', 401);
    this.name = 'UnauthenticatedError';
  }
}

/**
 * 服务不可用错误
 */
export class ServiceUnavailableError extends ProxyError {
  constructor(message: string = '代理服务暂时不可用,请稍后重试') {
    super(message, 'service_unavailable', 503);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * 获取代理服务配置
 */
export function getProxyConfig(): ProxyConfig {
  const baseURL = getProxyBaseUrl();

  // 尝试从 secure storage 获取用户的云端 API Key
  const apiKey =
    getToken('apiKey') ||
    process.env.VITE_PROXY_API_KEY ||
    process.env.PROXY_API_KEY ||
    undefined;

  return {
    baseURL,
    apiKey: apiKey || undefined,
    timeout: 120000, // 120 秒超时
  };
}

/**
 * 设置云端 API Key
 */
export async function setProxyApiKey(apiKey: string): Promise<void> {
  const { saveToken } = await import('./secure-storage.js');
  saveToken('apiKey', apiKey);
}

/**
 * 检查代理服务是否可用
 */
export async function checkProxyHealth(config?: ProxyConfig): Promise<{
  available: boolean;
  latency?: number;
  error?: string;
}> {
  const proxyConfig = config || getProxyConfig();
  const startTime = Date.now();

  try {
    const response = await fetch(`${proxyConfig.baseURL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 秒健康检查超时
    });

    const latency = Date.now() - startTime;

    if (response.ok) {
      return { available: true, latency };
    } else {
      return {
        available: false,
        error: `服务返回错误: ${response.status}`,
      };
    }
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : '网络连接失败',
    };
  }
}

/**
 * 获取认证 Token
 * 优先使用云端 API Key,回退到 Access Token
 */
async function getAuthToken(config: ProxyConfig): Promise<string | null> {
  // 优先使用 API Key
  if (config.apiKey) {
    return config.apiKey;
  }

  // 回退到 Access Token (OAuth 登录后获取)
  const accessToken = await getAccessToken();
  return accessToken;
}

/**
 * 发送代理请求
 */
export async function proxyRequest<T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    stream?: boolean;
    signal?: AbortSignal;
    config?: ProxyConfig;
  } = {}
): Promise<T> {
  const {
    method = 'POST',
    body,
    headers = {},
    stream = false,
    signal,
    config,
  } = options;

  const proxyConfig = config || getProxyConfig();
  const authToken = await getAuthToken(proxyConfig);

  if (!authToken) {
    throw new UnauthenticatedError();
  }

  const url = `${proxyConfig.baseURL}${endpoint}`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
    ...headers,
  };

  const requestOptions: RequestInit = {
    method,
    headers: requestHeaders,
    signal,
  };

  if (body) {
    requestOptions.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, requestOptions);

    // 处理特殊错误状态码
    if (!response.ok) {
      await handleErrorResponse(response);
    }

    // 流式响应直接返回 Response 对象
    if (stream) {
      return response as unknown as T;
    }

    // 非流式响应解析 JSON
    const json = await response.json();

    // 后端使用 successResponse 包装,返回格式为 { success: true, data: {...} }
    // 如果返回的是包装格式,提取 data 字段
    if (json.success && json.data !== undefined) {
      return json.data as T;
    }

    // 如果不是包装格式,直接使用整个响应
    return json as T;

  } catch (error) {
    // 网络错误或超时
    if (error instanceof ProxyError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new ProxyError('请求被取消', 'request_aborted');
      }
      if (error.message.includes('network') || error.message.includes('fetch')) {
        throw new ServiceUnavailableError('无法连接到代理服务,请检查网络连接');
      }
    }

    throw new ProxyError(
      error instanceof Error ? error.message : '未知错误',
      'unknown_error'
    );
  }
}

/**
 * 处理错误响应
 */
async function handleErrorResponse(response: Response): Promise<never> {
  const statusCode = response.status;

  let errorData: {
    error?: {
      code?: string;
      type?: string;
      message?: string;
      current_balance?: number;
      required_amount?: number;
      retry_after?: number;
    };
    message?: string;
  };

  try {
    errorData = await response.json();
  } catch {
    errorData = { message: response.statusText };
  }

  const errorMessage = errorData.error?.message || errorData.message || '请求失败';
  const errorType = errorData.error?.code || errorData.error?.type || 'unknown_error';

  // 401: 未认证
  if (statusCode === 401) {
    throw new UnauthenticatedError(errorMessage);
  }

  // 402: 余额不足
  if (statusCode === 402) {
    const currentBalance = errorData.error?.current_balance ?? 0;
    const requiredAmount = errorData.error?.required_amount ?? 0;
    throw new InsufficientBalanceError(errorMessage, currentBalance, requiredAmount);
  }

  // 429: 速率限制
  if (statusCode === 429) {
    const retryAfter = errorData.error?.retry_after ?? 60;
    throw new RateLimitError(errorMessage, retryAfter);
  }

  // 503: 服务不可用
  if (statusCode === 503) {
    throw new ServiceUnavailableError(errorMessage);
  }

  // 其他错误
  throw new ProxyError(errorMessage, errorType, statusCode, errorData);
}

/**
 * 获取用户余额
 */
export async function getUserBalance(config?: ProxyConfig): Promise<{
  balance_cents: number;
  frozen_cents: number;
  total_consumed_cents: number;
}> {
  return proxyRequest('/api/user/balance', {
    method: 'GET',
    config,
  });
}

/**
 * 获取用户信息
 */
export async function getUserInfo(config?: ProxyConfig): Promise<{
  id: string;
  email: string;
  name?: string;
  role: string;
  avatarUrl?: string;
  createdAt: string;
}> {
  const response = await proxyRequest<{
    user: {
      id: string;
      email: string;
      name?: string;
      role: string;
      avatarUrl?: string;
      createdAt: string;
    };
  }>('/api/auth/me', {
    method: 'GET',
    config,
  });

  return response.user;
}
