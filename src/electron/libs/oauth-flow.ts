/**
 * OAuth 2.0 PKCE 流程实现
 * 遵循 RFC 7636 标准，用于 Electron 桌面应用的安全认证
 */
import { shell } from "electron";
import { createHash, randomBytes } from "crypto";
import { DEEP_LINK_PROTOCOL } from "./auth-handler.js";
import { loginWithCode } from "./auth-service.js";
import type { AuthCallbackData } from "./auth-handler.js";

/**
 * PKCE 认证状态
 */
interface PKCEState {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  redirectUri: string;
  startedAt: number;
}

/**
 * OAuth 提供商配置
 */
export interface OAuthProviderConfig {
  name: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  scopes: string[];
}

/**
 * OAuth 流程配置
 */
export interface OAuthFlowConfig {
  provider: OAuthProviderConfig;
}

/**
 * OAuth 流程结果
 */
export interface OAuthFlowResult {
  success: boolean;
  error?: string;
  errorDescription?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
    avatar?: string;
  };
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

// 存储当前的 PKCE 状态
let currentPKCEState: PKCEState | null = null;

// OAuth 流程超时时间（5 分钟）
const OAUTH_TIMEOUT = 5 * 60 * 1000;

/**
 * 生成 PKCE code_verifier
 * 使用 crypto 模块生成安全的随机数
 * RFC 7636: 43-128 个字符的随机字符串
 * @returns Base64URL 编码的随机字符串
 */
export function generateCodeVerifier(): string {
  const buffer = randomBytes(32); // 32 字节 = 256 位
  return base64UrlEncode(buffer);
}

/**
 * 生成 PKCE code_challenge
 * RFC 7636: code_challenge = BASE64URL(SHA256(code_verifier))
 * @param codeVerifier - Code verifier
 * @returns Base64URL 编码的 SHA256 哈希
 */
export function generateCodeChallenge(codeVerifier: string): string {
  const hash = createHash("sha256").update(codeVerifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Base64URL 编码
 * RFC 4648: Base64 URL-safe 编码，移除填充字符
 * @param buffer - 待编码的 buffer
 * @returns Base64URL 字符串
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * 生成随机 state 参数（防止 CSRF 攻击）
 * @returns 随机 state 字符串
 */
export function generateState(): string {
  const buffer = randomBytes(32);
  return base64UrlEncode(buffer);
}

/**
 * 验证 state 参数
 * @param receivedState - 收到的 state
 * @param expectedState - 期望的 state
 * @returns 是否匹配
 */
export function validateState(receivedState: string | undefined, expectedState: string): boolean {
  if (!receivedState || !expectedState) {
    return false;
  }
  return receivedState === expectedState;
}

/**
 * 构建 OAuth 2.0 授权 URL
 * @param config - OAuth 流程配置
 * @param pkceState - PKCE 状态
 * @returns 授权 URL
 */
function buildAuthorizationUrl(config: OAuthFlowConfig, pkceState: PKCEState): string {
  const { provider } = config;

  const url = new URL(provider.authorizationEndpoint);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("redirect_uri", pkceState.redirectUri);
  url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("code_challenge", pkceState.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", pkceState.state);

  return url.toString();
}

/**
 * 启动 OAuth PKCE 流程
 * @param config - OAuth 流程配置
 * @returns PKCE 状态
 */
export async function startOAuthFlow(config: OAuthFlowConfig): Promise<PKCEState> {
  // 生成 PKCE 参数
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  const redirectUri = `${DEEP_LINK_PROTOCOL}://auth`;

  // 保存当前状态
  currentPKCEState = {
    codeVerifier,
    codeChallenge,
    state,
    redirectUri,
    startedAt: Date.now()
  };

  // 构建授权 URL
  const authUrl = buildAuthorizationUrl(config, currentPKCEState);

  console.info("[oauth-flow] Starting OAuth flow:", {
    provider: config.provider.name,
    redirectUri,
    state
  });

  // 在系统默认浏览器中打开授权 URL
  await shell.openExternal(authUrl);

  return currentPKCEState;
}

/**
 * 处理 OAuth 回调
 * @param callbackData - 认证回调数据
 * @returns OAuth 流程结果
 */
export async function handleOAuthCallback(
  callbackData: AuthCallbackData
): Promise<OAuthFlowResult> {
  try {
    // 检查是否有当前的 PKCE 状态
    if (!currentPKCEState) {
      return {
        success: false,
        error: "no_pkce_state",
        errorDescription: "No active OAuth flow found. Please restart the login process."
      };
    }

    // 检查超时
    const elapsed = Date.now() - currentPKCEState.startedAt;
    if (elapsed > OAUTH_TIMEOUT) {
      currentPKCEState = null;
      return {
        success: false,
        error: "oauth_timeout",
        errorDescription: "OAuth flow timed out. Please try again."
      };
    }

    // 检查是否有错误
    if (callbackData.error) {
      currentPKCEState = null;
      return {
        success: false,
        error: callbackData.error,
        errorDescription: callbackData.errorDescription || "OAuth authorization failed"
      };
    }

    // 验证 state 参数（防止 CSRF 攻击）
    if (!validateState(callbackData.state, currentPKCEState.state)) {
      currentPKCEState = null;
      return {
        success: false,
        error: "invalid_state",
        errorDescription: "State parameter validation failed. Possible CSRF attack."
      };
    }

    // 检查是否有授权码
    if (!callbackData.code) {
      currentPKCEState = null;
      return {
        success: false,
        error: "missing_code",
        errorDescription: "Authorization code not found in callback"
      };
    }

    console.info("[oauth-flow] Exchanging authorization code for access token");

    // 使用授权码和 code_verifier 交换 access token
    const loginResult = await exchangeCodeForToken(
      callbackData.code,
      currentPKCEState.codeVerifier
    );

    // 清除 PKCE 状态
    currentPKCEState = null;

    if (!loginResult.success) {
      return {
        success: false,
        error: loginResult.error || "token_exchange_failed",
        errorDescription: "Failed to exchange authorization code for access token"
      };
    }

    // 返回完整的登录响应数据
    return {
      success: true,
      user: loginResult.user,
      accessToken: loginResult.accessToken,
      refreshToken: loginResult.refreshToken,
      expiresIn: loginResult.expiresIn
    };
  } catch (error) {
    console.error("[oauth-flow] OAuth callback handling failed:", error);
    currentPKCEState = null;

    return {
      success: false,
      error: "callback_error",
      errorDescription: error instanceof Error ? error.message : "Failed to handle OAuth callback"
    };
  }
}

/**
 * 用授权码交换 access token
 * @param code - 授权码
 * @param codeVerifier - Code verifier
 * @returns 登录结果（包含完整的 tokens 和 user 信息）
 */
async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<{
  success: boolean;
  user?: {
    id: string;
    email: string;
    name?: string;
    avatar?: string;
  };
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}> {
  try {
    // 调用后端服务交换 token
    // 注意: 这里使用 auth-service.ts 中的 loginWithCode 函数
    // 该函数会将 code 和 code_verifier 发送到后端服务器
    // 后端服务器负责与 OAuth 提供商完成 token 交换

    // 在实际实现中，后端 API 需要接收以下参数:
    // - code: 授权码
    // - code_verifier: PKCE code verifier
    // 后端会使用 code_verifier 与 OAuth 提供商完成 token 交换

    const result = await loginWithCode(code, codeVerifier);

    if (!result.success || !result.user) {
      return {
        success: false,
        error: result.error || "Token exchange failed"
      };
    }

    // 返回完整的登录响应数据
    return {
      success: true,
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn
    };
  } catch (error) {
    console.error("[oauth-flow] Token exchange failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Token exchange failed"
    };
  }
}

/**
 * 取消当前的 OAuth 流程
 */
export function cancelOAuthFlow(): void {
  currentPKCEState = null;
  console.info("[oauth-flow] OAuth flow cancelled");
}

/**
 * 获取当前的 PKCE 状态（用于调试）
 * @returns 当前的 PKCE 状态，如果没有则返回 null
 */
export function getCurrentPKCEState(): PKCEState | null {
  return currentPKCEState;
}

/**
 * 检查是否有活跃的 OAuth 流程
 * @returns 是否有活跃的流程
 */
export function hasActiveOAuthFlow(): boolean {
  if (!currentPKCEState) {
    return false;
  }

  // 检查是否超时
  const elapsed = Date.now() - currentPKCEState.startedAt;
  if (elapsed > OAUTH_TIMEOUT) {
    currentPKCEState = null;
    return false;
  }

  return true;
}

/**
 * 预定义的 OAuth 提供商配置
 */
export const OAUTH_PROVIDERS = {
  google: {
    name: "Google",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    clientId: "", // 需要从环境变量或配置中读取
    scopes: ["openid", "email", "profile"]
  },
  github: {
    name: "GitHub",
    authorizationEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    clientId: "", // 需要从环境变量或配置中读取
    scopes: ["read:user", "user:email"]
  }
} as const satisfies Record<string, Omit<OAuthProviderConfig, 'scopes'> & { scopes: readonly string[] }>;

/**
 * 创建 OAuth 配置
 * @param provider - 提供商名称 (google, github 等)
 * @returns OAuth 流程配置
 */
export function createOAuthConfig(
  provider: keyof typeof OAUTH_PROVIDERS
): OAuthFlowConfig {
  const providerConfig = OAUTH_PROVIDERS[provider];

  const CLIENT_ID_ENV_KEYS: Record<keyof typeof OAUTH_PROVIDERS, string> = {
    google: "GOOGLE_CLIENT_ID",
    github: "GITHUB_CLIENT_ID",
  };

  const envKey = CLIENT_ID_ENV_KEYS[provider];
  const clientId = process.env[envKey] ?? "";

  if (!clientId) {
    throw new Error(
      `OAuth ${providerConfig.name} clientId 未配置，请设置环境变量 ${envKey}`
    );
  }

  return {
    provider: {
      name: providerConfig.name,
      authorizationEndpoint: providerConfig.authorizationEndpoint,
      tokenEndpoint: providerConfig.tokenEndpoint,
      clientId,
      scopes: [...providerConfig.scopes]
    }
  };
}
