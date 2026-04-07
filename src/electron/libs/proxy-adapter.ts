/**
 * Claude SDK 代理适配器
 *
 * 将 Claude SDK 的 API 调用重定向到云端代理服务
 * 保持 SDK 接口兼容性,对上层透明
 */

import { getProxyConfig, proxyRequest, type ProxyConfig } from './proxy-client.js';
import { ensureLocalProxy } from './local-proxy.js';

let resolvedRemoteBase: string | null = null;
let resolvingRemoteBase: Promise<string | null> | null = null;

async function detectRemoteBase(config: ProxyConfig): Promise<string | null> {
  const rawBase = config.baseURL?.replace(/\/+$/, "");
  if (!rawBase) {
    return null;
  }

  // baseURL 可能是 https://xxx/api（前端 API 基础路径）
  // 代理路由挂载在 /api/proxy，所以需要拼接 /proxy
  const baseUrl = new URL(rawBase);
  const basePath = baseUrl.pathname.replace(/\/+$/, "");

  let result: string;
  if (basePath.endsWith("/api")) {
    // VITE_API_BASE_URL = https://xxx/api → 代理在 /api/proxy
    result = `${rawBase}/proxy`;
  } else if (basePath.endsWith("/api/proxy") || basePath.endsWith("/proxy")) {
    // 已经包含 proxy 路径
    result = rawBase;
  } else {
    // 裸域名或其他路径，尝试 /api/proxy
    result = `${rawBase}/api/proxy`;
  }

  console.info(`[proxy-adapter] detectRemoteBase: ${rawBase} -> ${result}`);
  return result;
}

async function resolveRemoteBase(config: ProxyConfig): Promise<string | null> {
  const rawBase = config.baseURL?.replace(/\/+$/, "") || null;
  if (!rawBase) {
    resolvedRemoteBase = null;
    resolvingRemoteBase = null;
    return null;
  }

  if (resolvedRemoteBase && resolvedRemoteBase.startsWith(rawBase)) {
    return resolvedRemoteBase;
  }

  if (resolvingRemoteBase) {
    return resolvingRemoteBase;
  }

  resolvingRemoteBase = detectRemoteBase(config).then((base) => {
    resolvedRemoteBase = base;
    resolvingRemoteBase = null;
    return base;
  });

  return resolvingRemoteBase;
}

/**
 * 构建代理服务环境变量
 *
 * 这些环境变量将被 Claude SDK 使用
 */
export async function buildProxyEnv(): Promise<Record<string, string>> {
  const config = getProxyConfig();

  // 优先使用 apiKey，回退到 accessToken（OAuth 登录用户）
  let authToken = config.apiKey;
  if (!authToken) {
    const { getAccessToken } = await import('./auth-service.js');
    const accessToken = await getAccessToken();
    if (accessToken) {
      authToken = accessToken;
    } else {
      console.warn('[proxy-adapter] No API key or access token found, user may need to login');
    }
  }
  if (!config.baseURL) {
    console.warn('[proxy-adapter] No proxy base URL available for local adapter');
  }

  const remoteBase = await resolveRemoteBase(config);
  const localProxy = remoteBase ? await ensureLocalProxy(remoteBase) : undefined;
  const authForSdk = localProxy?.token || authToken || '';
  if (!authForSdk) {
    console.warn('[proxy-adapter] buildProxyEnv: no valid auth token available — SDK will fail with 401. User needs to log in or set an API key.');
  }

  // 构建环境变量
  // Claude SDK 会使用这些环境变量连接到代理服务
  return {
    // 保留其他环境变量
    ...process.env,

    // 代理服务的 baseURL (替换 Anthropic 官方 API)
    ANTHROPIC_BASE_URL: localProxy?.url || (remoteBase ?? `${config.baseURL}/proxy`),

    // 本地代理启用时仅暴露短期代理令牌，真实上游认证由主进程注入
    ANTHROPIC_AUTH_TOKEN: authForSdk,
  };
}

/**
 * 获取代理服务的 API 配置
 *
 * 用于替换 getCurrentApiConfig() 返回的配置
 */
export interface ProxyApiConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  apiType: 'anthropic';
  isProxy: true;
}

function getDefaultModel(): string | null {
  return (
    process.env.VITE_DEFAULT_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    null
  );
}

/**
 * 从代理服务获取第一个可用模型
 */
async function fetchFirstAvailableModel(baseURL: string, authKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseURL}/proxy/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`[proxy-adapter] fetchFirstAvailableModel failed: HTTP ${res.status} ${res.statusText}${res.status === 401 ? ' (auth token may be invalid or missing)' : ''}`);
      return null;
    }
    const data = await res.json();
    // 兼容两种格式：{ models: [...] } 和 { success: true, data: [...] }
    const models = data?.models || data?.data;
    if (Array.isArray(models) && models.length > 0) {
      return models[0].id || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 获取代理模式下的 API 配置
 */
export async function getProxyApiConfig(defaultModel?: string): Promise<ProxyApiConfig | null> {
  const config = getProxyConfig();

  // 优先使用 apiKey，回退到 accessToken（OAuth 登录用户）
  let authKey = config.apiKey;
  if (!authKey) {
    const { getAccessToken } = await import('./auth-service.js');
    const accessToken = await getAccessToken();
    if (accessToken) {
      authKey = accessToken;
    }
  }

  if (!authKey) {
    console.warn('[proxy-adapter] No API key or access token available for proxy mode');
    return null;
  }
  if (!config.baseURL) {
    console.warn('[proxy-adapter] No proxy base URL available');
    return null;
  }

  const model = defaultModel || getDefaultModel() || await fetchFirstAvailableModel(config.baseURL, authKey);
  if (!model) {
    console.warn('[proxy-adapter] No model available: not passed, not configured, and failed to fetch from API');
    return null;
  }

  return {
    apiKey: authKey,
    baseURL: `${config.baseURL}/proxy`,
    model,
    apiType: 'anthropic',
    isProxy: true,
  };
}

/**
 * 检查是否应该使用代理模式
 *
 * 判断依据:
 * 1. 用户已登录 (有 API Key 或 Access Token)
 * 2. 代理服务可用
 */
export async function shouldUseProxy(): Promise<boolean> {
  const config = getProxyConfig();

  // 检查是否有认证凭据
  if (!config.apiKey) {
    // 尝试获取 Access Token
    const { getAccessToken } = await import('./auth-service.js');
    const accessToken = await getAccessToken();

    if (!accessToken) {
      console.info('[proxy-adapter] No auth credentials, proxy mode disabled');
      return false;
    }
  }

  // TODO: 可选 - 检查代理服务健康状态
  // const { checkProxyHealth } = await import('./proxy-client.js');
  // const health = await checkProxyHealth(config);
  // return health.available;

  return true;
}

/**
 * 获取友好的错误提示消息
 */
function isInsufficientBalanceErrorText(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    message.includes('积分不足') ||
    message.includes('余额不足') ||
    message.includes('RATE_4002') ||
    normalized.includes('insufficient balance') ||
    normalized.includes('insufficient_balance') ||
    normalized.includes('api error: 402')
  );
}

export function getProxyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const errorName = error.name;
    const errorMessage = error.message;

    if (isInsufficientBalanceErrorText(errorMessage)) {
      return '账户余额不足,请前往充值后继续使用';
    }

    switch (errorName) {
      case 'UnauthenticatedError':
        return '未登录或登录已过期,请重新登录后继续使用';

      case 'InsufficientBalanceError':
        return '账户余额不足,请前往充值后继续使用';

      case 'RateLimitError':
        return '请求过于频繁,请稍后再试';

      case 'ServiceUnavailableError':
        return '代理服务暂时不可用,请检查网络连接或稍后重试';

      case 'ProxyError':
        return `代理服务错误: ${errorMessage}`;

      default:
        return errorMessage;
    }
  }

  return '未知错误';
}

/**
 * 代理模式的使用量信息提取
 *
 * 代理服务会在响应中附加 _usage 字段
 */
export interface ProxyUsageInfo {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_ms: number;
  model: string;
  provider: string;
  channel_id?: string;
  request_id?: string;
  // 售价信息 (代理返回的实际售价，已包含倍率)
  cost_usd?: number;
  input_cost_usd?: number;
  output_cost_usd?: number;
  price_multiplier?: number;
  // 旧版格式 (向后兼容)
  cost?: {
    input_cost_cents: number;
    output_cost_cents: number;
    total_cost_cents: number;
  };
}

/**
 * 从代理服务响应中提取使用量信息
 */
export function extractProxyUsage(response: {
  _usage?: ProxyUsageInfo;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}): ProxyUsageInfo | null {
  // 优先使用代理服务的增强使用量信息
  if (response._usage) {
    return response._usage;
  }

  // 回退到标准使用量信息
  if (response.usage) {
    const { input_tokens = 0, output_tokens = 0 } = response.usage;
    return {
      input_tokens,
      output_tokens,
      total_tokens: input_tokens + output_tokens,
      latency_ms: 0,
      model: 'unknown',
      provider: 'anthropic',
    };
  }

  return null;
}
