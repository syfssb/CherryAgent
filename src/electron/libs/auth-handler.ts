/**
 * 认证处理器模块
 * 处理 Deep Link 认证回调
 */
import { BrowserWindow } from "electron";

// Deep Link 协议
export const DEEP_LINK_PROTOCOL = "cherry-agent";

// 认证回调 URL 格式: cherry-agent://auth?code=xxx
const AUTH_PATH = "/auth";

/**
 * 认证回调数据
 */
export interface AuthCallbackData {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
  // OAuth 登录成功后的完整响应
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: {
    id: string;
    email: string;
    name?: string;
    avatar?: string;
  };
  apiKey?: string;
  balance?: number;
}

/**
 * 深度链接数据
 */
export interface DeepLinkData {
  path: string;
  params: Record<string, string>;
  rawUrl: string;
}

/**
 * 从 URL 提取认证码
 * @param url - 回调 URL，格式: cherry-agent://auth?code=xxx&state=yyy
 * @returns 认证回调数据
 */
export function extractAuthCode(url: string): AuthCallbackData {
  try {
    // 验证 URL 格式
    if (!url || typeof url !== "string") {
      return { error: "invalid_url", errorDescription: "URL is empty or invalid" };
    }

    // 解析 URL
    const parsedUrl = new URL(url);

    // 验证协议
    if (parsedUrl.protocol !== `${DEEP_LINK_PROTOCOL}:`) {
      return { error: "invalid_protocol", errorDescription: `Expected protocol: ${DEEP_LINK_PROTOCOL}` };
    }

    // 验证路径
    const pathname = parsedUrl.hostname + parsedUrl.pathname;
    if (!pathname.startsWith("auth")) {
      return { error: "invalid_path", errorDescription: `Expected path: ${AUTH_PATH}` };
    }

    // 提取参数
    const params = parsedUrl.searchParams;

    // 检查是否有错误
    const error = params.get("error");
    if (error) {
      return {
        error,
        errorDescription: params.get("error_description") || "Authentication failed"
      };
    }

    // 提取认证码
    const code = params.get("code");
    const state = params.get("state");

    if (!code) {
      return { error: "missing_code", errorDescription: "Authorization code not found in URL" };
    }

    return {
      code,
      state: state || undefined
    };
  } catch (error) {
    console.error("[auth-handler] Failed to extract auth code:", error);
    return {
      error: "parse_error",
      errorDescription: error instanceof Error ? error.message : "Failed to parse URL"
    };
  }
}

/**
 * 解析深度链接 URL
 * @param url - 深度链接 URL
 * @returns 深度链接数据
 */
export function parseDeepLink(url: string): DeepLinkData | null {
  try {
    if (!url || typeof url !== "string") {
      return null;
    }

    const parsedUrl = new URL(url);

    // 验证协议
    if (parsedUrl.protocol !== `${DEEP_LINK_PROTOCOL}:`) {
      return null;
    }

    // 提取路径和参数
    const path = parsedUrl.hostname + parsedUrl.pathname;
    const params: Record<string, string> = {};

    parsedUrl.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return {
      path,
      params,
      rawUrl: url
    };
  } catch (error) {
    console.error("[auth-handler] Failed to parse deep link:", error);
    return null;
  }
}

/**
 * 处理深度链接
 * @param url - 深度链接 URL
 * @returns 处理结果
 */
export function handleDeepLink(url: string): {
  type: "auth" | "unknown";
  data: AuthCallbackData | DeepLinkData | null;
} {
  const deepLinkData = parseDeepLink(url);

  if (!deepLinkData) {
    return { type: "unknown", data: null };
  }

  // 检查是否是认证回调
  if (deepLinkData.path.startsWith("auth")) {
    const authData = extractAuthCode(url);
    return { type: "auth", data: authData };
  }

  return { type: "unknown", data: deepLinkData };
}

/**
 * 通知渲染进程
 * @param event - 事件名称
 * @param data - 事件数据
 */
export function notifyRenderer(event: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows();

  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(event, data);
    }
  }
}

/**
 * 通知渲染进程认证结果
 * @param data - 认证回调数据
 */
export function notifyAuthResult(data: AuthCallbackData): void {
  notifyRenderer("auth:callback", data);

  // 如果成功，聚焦主窗口
  if (data.code && !data.error) {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  }
}

/**
 * 创建深度链接 URL
 * @param path - 路径
 * @param params - 参数
 * @returns 深度链接 URL
 */
export function createDeepLinkUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(`${DEEP_LINK_PROTOCOL}://${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

/**
 * 验证 state 参数（防止 CSRF 攻击）
 * @param receivedState - 收到的 state
 * @param expectedState - 期望的 state
 */
export function validateState(receivedState: string | undefined, expectedState: string): boolean {
  if (!receivedState || !expectedState) {
    return false;
  }
  return receivedState === expectedState;
}

/**
 * 生成随机 state
 * @returns 随机 state 字符串
 */
export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("");
}
