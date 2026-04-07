import { ipcMain } from "electron";
import {
  login,
  loginWithCode,
  logout,
  refresh,
  getAuthStatus,
  getStoredCredentials,
  isAuthenticated,
  getUserInfo,
} from "../libs/auth-service.js";
import { handleDeepLink, notifyAuthResult, type AuthCallbackData } from "../libs/auth-handler.js";
import {
  handleOAuthCallback,
  startOAuthFlow,
  cancelOAuthFlow,
  hasActiveOAuthFlow,
  createOAuthConfig,
  type OAuthFlowConfig,
} from "../libs/oauth-flow.js";

/**
 * 注册认证相关的 IPC 处理器
 */
export function registerAuthHandlers(): void {
  // 防御性移除，避免重复注册导致异常
  const authChannels = [
    "auth:login", "auth:loginWithCode", "auth:logout", "auth:refresh",
    "auth:getStatus", "auth:syncTokens", "auth:getCredentials", "auth:isAuthenticated",
    "auth:getUser", "auth:startOAuthFlow", "auth:cancelOAuthFlow",
    "auth:hasActiveOAuthFlow", "auth:handleCallback", "auth:openOAuthWindow",
    "auth:createOAuthConfig",
  ];
  for (const ch of authChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  // auth:login - 使用访问令牌登录
  ipcMain.handle("auth:login", async (_, accessToken: string) => {
    try {
      const result = await login(accessToken);
      return result;
    } catch (error) {
      console.error("[ipc-handlers] auth:login failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Login failed"
      };
    }
  });

  // auth:loginWithCode - 使用认证码登录（OAuth 流程）
  ipcMain.handle("auth:loginWithCode", async (_, code: string, state?: string) => {
    try {
      const result = await loginWithCode(code, state);
      return result;
    } catch (error) {
      console.error("[ipc-handlers] auth:loginWithCode failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Login failed"
      };
    }
  });

  // auth:logout - 登出
  ipcMain.handle("auth:logout", async () => {
    try {
      const result = await logout();
      return result;
    } catch (error) {
      console.error("[ipc-handlers] auth:logout failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Logout failed"
      };
    }
  });

  // auth:refresh - 刷新令牌
  ipcMain.handle("auth:refresh", async () => {
    try {
      const result = await refresh();
      return result;
    } catch (error) {
      console.error("[ipc-handlers] auth:refresh failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Token refresh failed"
      };
    }
  });

  // auth:getStatus - 获取认证状态
  ipcMain.handle("auth:getStatus", () => {
    try {
      return getAuthStatus();
    } catch (error) {
      console.error("[ipc-handlers] auth:getStatus failed:", error);
      return {
        isAuthenticated: false,
        hasAccessToken: false,
        hasRefreshToken: false
      };
    }
  });

  // auth:syncTokens - 从渲染进程同步 token 到主进程 secure-storage
  // 用于前端登录后确保主进程也有认证凭据（IPC 调用如充值需要）
  ipcMain.handle("auth:syncTokens", async (_, tokens: { accessToken: string; refreshToken?: string }) => {
    try {
      // 安全校验：token 必须是非空字符串，长度在合理范围内，仅允许 JWT/base64url 字符集
      const JWT_PATTERN = /^[A-Za-z0-9\-_=+/]+(\.[A-Za-z0-9\-_=+/]+)*$/;
      const isValidToken = (t: unknown): boolean => {
        if (typeof t !== 'string') return false;
        if (t.length < 10 || t.length > 4096) return false;
        return JWT_PATTERN.test(t);
      };

      if (!isValidToken(tokens.accessToken)) {
        console.warn("[ipc-handlers] auth:syncTokens rejected: invalid accessToken format");
        return { success: false, error: "Invalid token format" };
      }
      if (tokens.refreshToken !== undefined && !isValidToken(tokens.refreshToken)) {
        console.warn("[ipc-handlers] auth:syncTokens rejected: invalid refreshToken format");
        return { success: false, error: "Invalid refresh token format" };
      }

      const { saveTokens_batch } = await import("../libs/secure-storage.js");
      const toSave: Record<string, string> = { accessToken: tokens.accessToken };
      if (tokens.refreshToken) {
        toSave.refreshToken = tokens.refreshToken;
      }
      saveTokens_batch(toSave as any);
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] auth:syncTokens failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync tokens"
      };
    }
  });

  // auth:getCredentials - 获取存储的凭证
  ipcMain.handle("auth:getCredentials", () => {
    try {
      return getStoredCredentials();
    } catch (error) {
      console.error("[ipc-handlers] auth:getCredentials failed:", error);
      return null;
    }
  });

  // auth:isAuthenticated - 检查是否已登录
  ipcMain.handle("auth:isAuthenticated", () => {
    try {
      return isAuthenticated();
    } catch (error) {
      console.error("[ipc-handlers] auth:isAuthenticated failed:", error);
      return false;
    }
  });

  // auth:getUser - 获取当前用户信息
  ipcMain.handle("auth:getUser", async () => {
    try {
      const result = await getUserInfo();
      return result;
    } catch (error) {
      console.error("[ipc-handlers] auth:getUser failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get user info"
      };
    }
  });

  // ============ OAuth PKCE 流程处理器 ============

  // auth:startOAuthFlow - 启动 OAuth PKCE 流程
  ipcMain.handle("auth:startOAuthFlow", async (_, config: OAuthFlowConfig) => {
    try {
      const pkceState = await startOAuthFlow(config);
      return {
        success: true,
        data: {
          state: pkceState.state,
          redirectUri: pkceState.redirectUri,
          startedAt: pkceState.startedAt
        }
      };
    } catch (error) {
      console.error("[ipc-handlers] auth:startOAuthFlow failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to start OAuth flow"
      };
    }
  });

  // auth:cancelOAuthFlow - 取消 OAuth 流程
  ipcMain.handle("auth:cancelOAuthFlow", () => {
    try {
      cancelOAuthFlow();
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] auth:cancelOAuthFlow failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to cancel OAuth flow"
      };
    }
  });

  // auth:hasActiveOAuthFlow - 检查是否有活跃的 OAuth 流程
  ipcMain.handle("auth:hasActiveOAuthFlow", () => {
    try {
      return { active: hasActiveOAuthFlow() };
    } catch (error) {
      console.error("[ipc-handlers] auth:hasActiveOAuthFlow failed:", error);
      return { active: false };
    }
  });

  // auth:createOAuthConfig - 创建 OAuth 配置
  ipcMain.handle(
    "auth:createOAuthConfig",
    (
      _,
      provider: "google" | "github"
    ) => {
      try {
        const config = createOAuthConfig(provider);
        return {
          success: true,
          data: config
        };
      } catch (error) {
        console.error("[ipc-handlers] auth:createOAuthConfig failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create OAuth config"
        };
      }
    }
  );

  // auth:openOAuthWindow - 打开 OAuth 授权窗口
  ipcMain.handle("auth:openOAuthWindow", async (_, provider: "google" | "github") => {
    try {
      // 创建 OAuth 配置
      const config = createOAuthConfig(provider);

      // 启动 OAuth PKCE 流程
      const pkceState = await startOAuthFlow(config);

      return {
        success: true,
        data: {
          state: pkceState.state,
          redirectUri: pkceState.redirectUri,
          startedAt: pkceState.startedAt,
          provider
        }
      };
    } catch (error) {
      console.error(`[ipc-handlers] auth:openOAuthWindow(${provider}) failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : `Failed to open ${provider} OAuth window`
      };
    }
  });

  console.info("[ipc-handlers] Auth handlers registered");
}

/**
 * 处理深度链接
 * @param url - 深度链接 URL
 */
/**
 * 处理深度链接（集成 OAuth PKCE 流程）
 * @param url - 深度链接 URL
 */
export function handleAuthDeepLink(url: string): void {
  const result = handleDeepLink(url);

  if (result.type === "auth") {
    const authData = result.data as AuthCallbackData;

    // 检查是否有活跃的 OAuth 流程
    if (hasActiveOAuthFlow()) {
      console.info("[ipc-handlers] Handling OAuth callback with PKCE flow");

      // 使用 OAuth PKCE 流程处理回调
      handleOAuthCallback(authData)
        .then((oauthResult) => {
          if (oauthResult.success && oauthResult.user) {
            // OAuth 登录成功 - 传递完整的登录响应数据
            notifyAuthResult({
              code: authData.code,
              state: authData.state,
              accessToken: oauthResult.accessToken,
              refreshToken: oauthResult.refreshToken,
              expiresIn: oauthResult.expiresIn,
              user: oauthResult.user
            });
            console.info("[ipc-handlers] OAuth login successful:", oauthResult.user.email);
          } else {
            // OAuth 登录失败
            notifyAuthResult({
              error: oauthResult.error || "oauth_failed",
              errorDescription: oauthResult.errorDescription || "OAuth login failed"
            });
            console.error("[ipc-handlers] OAuth login failed:", oauthResult.error);
          }
        })
        .catch((error) => {
          notifyAuthResult({
            error: "oauth_error",
            errorDescription: error instanceof Error ? error.message : "OAuth processing error"
          });
          console.error("[ipc-handlers] OAuth callback handling error:", error);
        });
    } else {
      // 没有活跃的 OAuth 流程，使用传统的登录方式
      console.info("[ipc-handlers] No active OAuth flow, using traditional login");
      notifyAuthResult(authData);

      // 如果有认证码，自动尝试登录
      if (authData.code && !authData.error) {
        loginWithCode(authData.code, authData.state)
          .then((loginResult) => {
            if (loginResult.success) {
              // 传统登录成功 - 传递完整的登录响应数据
              notifyAuthResult({
                code: authData.code,
                state: authData.state,
                accessToken: loginResult.accessToken,
                refreshToken: loginResult.refreshToken,
                expiresIn: loginResult.expiresIn,
                user: loginResult.user
              });
            } else {
              notifyAuthResult({
                error: "login_failed",
                errorDescription: loginResult.error || "Login failed"
              });
            }
          })
          .catch((error) => {
            notifyAuthResult({
              error: "login_error",
              errorDescription: error instanceof Error ? error.message : "Login error"
            });
          });
      }
    }
  }
}
