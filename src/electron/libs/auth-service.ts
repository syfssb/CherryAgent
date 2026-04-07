/**
 * 认证服务模块
 * 处理登录、刷新令牌、登出等认证相关操作
 */
import {
  saveToken,
  getToken,
  deleteToken,
  clearAllTokens,
  hasToken,
  saveTokens_batch,
  type TokenKey
} from "./secure-storage.js";
import { getApiBaseUrl as getRuntimeApiBaseUrl } from "./runtime-config.js";

// API 基础 URL 优先使用环境变量，未配置时回退到内置生产地址

/**
 * 认证凭证
 */
export interface AuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/**
 * 用户信息
 */
export interface UserInfo {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
}

/**
 * 认证状态
 */
export interface AuthStatus {
  isAuthenticated: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  expiresAt?: number;
  isExpired?: boolean;
}

/**
 * API 响应
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 登录响应
 */
interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserInfo;
  balance?: string;
  isNewUser?: boolean;
  welcomeBonus?: string;
}

/**
 * 刷新令牌响应
 */
interface RefreshResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

// 内存中缓存过期时间
let tokenExpiresAt: number | null = null;
// 正在进行中的刷新请求（用于并发去重）
let pendingRefreshPromise: Promise<{ success: boolean; error?: string }> | null = null;

function parseJwtExpiresAt(accessToken: string): number | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2 || !parts[1]) {
      return null;
    }
    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8")) as { exp?: number };
    if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

function ensureTokenExpiresAt(accessToken: string): void {
  if (tokenExpiresAt) return;
  const parsedExpiresAt = parseJwtExpiresAt(accessToken);
  if (parsedExpiresAt) {
    tokenExpiresAt = parsedExpiresAt;
  }
}

function getApiBaseUrl(): string {
  return getRuntimeApiBaseUrl();
}

/**
 * 发送 HTTPS 请求
 */
async function fetchApi<T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    accessToken?: string;
  } = {}
): Promise<ApiResponse<T>> {
  const { method = "GET", body, headers = {}, accessToken } = options;

  const url = `${getApiBaseUrl()}${endpoint}`;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers
  };

  if (accessToken) {
    requestHeaders["Authorization"] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined
    });

    const json = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: json.error?.message || json.error || `HTTP ${response.status}`,
        message: json.error?.message || json.message || "Request failed"
      };
    }

    // 后端使用 successResponse 包装,返回格式为 { success: true, data: {...} }
    // 如果返回的是包装格式,提取 data 字段
    if (json.success && json.data !== undefined) {
      return {
        success: true,
        data: json.data as T
      };
    }

    // 如果不是包装格式,直接使用整个响应
    return {
      success: true,
      data: json as T
    };
  } catch (error) {
    console.error("[auth-service] API request failed:", error);
    return {
      success: false,
      error: "network_error",
      message: error instanceof Error ? error.message : "Network request failed"
    };
  }
}

/**
 * 使用访问令牌登录
 * @param accessToken - 访问令牌
 * @returns 登录结果
 */
export async function login(accessToken: string): Promise<{
  success: boolean;
  user?: UserInfo;
  error?: string;
}> {
  if (!accessToken || typeof accessToken !== "string") {
    return { success: false, error: "Invalid access token" };
  }

  try {
    // 验证令牌并获取用户信息
    const response = await fetchApi<LoginResponse>("/auth/verify", {
      method: "POST",
      body: { accessToken }
    });

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.message || "Login failed"
      };
    }

    const { accessToken: newAccessToken, refreshToken, expiresIn, user } = response.data;

    // 安全存储令牌
    saveTokens_batch({
      accessToken: newAccessToken || accessToken,
      refreshToken
    });

    // 计算过期时间
    if (expiresIn) {
      tokenExpiresAt = Date.now() + expiresIn * 1000;
    }

    console.info("[auth-service] Login successful");
    return { success: true, user };
  } catch (error) {
    console.error("[auth-service] Login failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed"
    };
  }
}

/**
 * 使用认证码登录（OAuth 流程）
 * @param code - 认证码
 * @param codeVerifierOrState - Code verifier (PKCE) 或 State 参数
 * @returns 登录结果（包含完整的 tokens 和 user 信息）
 */
export async function loginWithCode(code: string, codeVerifierOrState?: string): Promise<{
  success: boolean;
  user?: UserInfo;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}> {
  if (!code || typeof code !== "string") {
    return { success: false, error: "Invalid authorization code" };
  }

  try {
    const response = await fetchApi<LoginResponse>("/auth/token", {
      method: "POST",
      body: {
        code,
        code_verifier: codeVerifierOrState, // PKCE code verifier
        state: codeVerifierOrState // 也作为 state 传递(向后兼容)
      }
    });

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.message || "Token exchange failed"
      };
    }

    const { accessToken, refreshToken, expiresIn, user } = response.data;

    // 安全存储令牌
    saveTokens_batch({
      accessToken,
      refreshToken
    });

    // 计算过期时间
    if (expiresIn) {
      tokenExpiresAt = Date.now() + expiresIn * 1000;
    }

    console.info("[auth-service] Login with code successful");
    return {
      success: true,
      user,
      accessToken,
      refreshToken,
      expiresIn
    };
  } catch (error) {
    console.error("[auth-service] Login with code failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed"
    };
  }
}

/**
 * 刷新访问令牌
 * @returns 刷新结果
 */
export async function refresh(): Promise<{
  success: boolean;
  error?: string;
}> {
  // 并发去重：若已有刷新请求在飞行中，直接复用该 Promise
  if (pendingRefreshPromise) {
    return pendingRefreshPromise;
  }

  const refreshToken = getToken("refreshToken");

  if (!refreshToken) {
    return { success: false, error: "No refresh token available" };
  }

  pendingRefreshPromise = (async () => {
    try {
      const response = await fetchApi<RefreshResponse>("/auth/refresh", {
        method: "POST",
        body: { refreshToken }
      });

      if (!response.success || !response.data) {
        // 刷新失败，可能需要重新登录
        console.warn("[auth-service] Token refresh failed, clearing tokens");
        clearAllTokens();
        tokenExpiresAt = null;
        return {
          success: false,
          error: response.message || "Token refresh failed"
        };
      }

      const { accessToken, refreshToken: newRefreshToken, expiresIn } = response.data;

      // 更新令牌
      saveToken("accessToken", accessToken);
      if (newRefreshToken) {
        saveToken("refreshToken", newRefreshToken);
      }

      // 更新过期时间
      if (expiresIn) {
        tokenExpiresAt = Date.now() + expiresIn * 1000;
      }

      console.info("[auth-service] Token refreshed successfully");
      return { success: true };
    } catch (error) {
      console.error("[auth-service] Token refresh failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Token refresh failed"
      };
    } finally {
      pendingRefreshPromise = null;
    }
  })();

  return pendingRefreshPromise;
}

/**
 * 登出
 * @returns 登出结果
 */
export async function logout(): Promise<{
  success: boolean;
  error?: string;
}> {
  const accessToken = getToken("accessToken");

  try {
    // 通知服务器登出（可选，但推荐）
    if (accessToken) {
      await fetchApi("/auth/logout", {
        method: "POST",
        accessToken
      });
    }
  } catch (error) {
    // 即使服务器通知失败，也要清除本地令牌
    console.warn("[auth-service] Server logout notification failed:", error);
  }

  // 清除所有本地令牌
  clearAllTokens();
  tokenExpiresAt = null;

  console.info("[auth-service] Logged out successfully");
  return { success: true };
}

/**
 * 获取存储的凭证
 * @returns 凭证信息
 */
export function getStoredCredentials(): AuthCredentials | null {
  const accessToken = getToken("accessToken");

  if (!accessToken) {
    return null;
  }

  ensureTokenExpiresAt(accessToken);

  return {
    accessToken,
    refreshToken: getToken("refreshToken") || undefined,
    expiresAt: tokenExpiresAt || undefined
  };
}

/**
 * 检查是否已登录
 * @returns 是否已登录
 */
export function isAuthenticated(): boolean {
  const accessToken = getToken("accessToken");

  if (!accessToken) {
    return false;
  }

  ensureTokenExpiresAt(accessToken);

  // 检查是否过期
  if (tokenExpiresAt && Date.now() > tokenExpiresAt) {
    // 令牌已过期，但可能可以刷新
    return hasToken("refreshToken");
  }

  return true;
}

/**
 * 获取认证状态
 * @returns 认证状态
 */
export function getAuthStatus(): AuthStatus {
  const accessToken = getToken("accessToken");
  const hasAccessToken = !!accessToken;
  const hasRefreshToken = hasToken("refreshToken");

  if (accessToken) {
    ensureTokenExpiresAt(accessToken);
  }

  const isExpired = tokenExpiresAt ? Date.now() > tokenExpiresAt : false;

  return {
    isAuthenticated: hasAccessToken && !isExpired,
    hasAccessToken,
    hasRefreshToken,
    expiresAt: tokenExpiresAt || undefined,
    isExpired
  };
}

/**
 * 获取访问令牌（自动刷新）
 * @returns 访问令牌
 */
export async function getAccessToken(): Promise<string | null> {
  const accessToken = getToken("accessToken");

  if (!accessToken) {
    return null;
  }

  ensureTokenExpiresAt(accessToken);

  // 检查是否即将过期（提前 5 分钟刷新）
  const REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes
  if (tokenExpiresAt && Date.now() > tokenExpiresAt - REFRESH_BUFFER) {
    const refreshResult = await refresh();
    if (refreshResult.success) {
      return getToken("accessToken");
    }
    // 刷新失败但令牌可能还有效
    if (Date.now() < tokenExpiresAt) {
      return accessToken;
    }
    return null;
  }

  return accessToken;
}

/**
 * /auth/me 接口响应类型
 */
interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    name?: string;
    role: string;
    avatarUrl?: string;
    createdAt: string;
  };
  balance: string;
}

/**
 * 获取用户信息
 * @returns 用户信息
 */
export async function getUserInfo(): Promise<{
  success: boolean;
  user?: UserInfo;
  balance?: string;
  error?: string;
}> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return {
      success: false,
      error: "Not authenticated"
    };
  }

  try {
    const response = await fetchApi<AuthMeResponse>("/auth/me", {
      method: "GET",
      accessToken
    });

    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.message || "Failed to get user info"
      };
    }

    // 提取用户信息,将 avatarUrl 映射到 avatar
    const userInfo: UserInfo = {
      id: response.data.user.id,
      email: response.data.user.email,
      name: response.data.user.name,
      avatar: response.data.user.avatarUrl
    };

    return {
      success: true,
      user: userInfo,
      balance: response.data.balance
    };
  } catch (error) {
    console.error("[auth-service] Get user info failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get user info"
    };
  }
}
