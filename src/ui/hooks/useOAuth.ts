/**
 * OAuth 认证 Hook
 * 通过后端 API 发起 OAuth 流程
 */
import { useState, useEffect, useCallback } from "react";

/**
 * OAuth 提供商类型
 */
export type OAuthProvider = "google" | "github";

/**
 * OAuth 流程状态
 */
export interface OAuthState {
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

/**
 * OAuth 认证 Hook
 * @returns OAuth 状态和方法
 */
export function useOAuth() {
  const [state, setState] = useState<OAuthState>({
    isLoading: false,
    error: null,
    isAuthenticated: false
  });

  /**
   * 检查认证状态
   */
  const checkAuthStatus = useCallback(async () => {
    try {
      const isAuth = await window.electronAPI.auth.isAuthenticated();
      setState((prev) => ({ ...prev, isAuthenticated: isAuth }));
    } catch (error) {
      // 静默处理
    }
  }, []);

  /**
   * 启动 OAuth 登录流程
   * 通过后端 API 获取 OAuth 授权 URL，然后在 Electron 中打开
   */
  const login = useCallback(async (provider: OAuthProvider) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // 创建 OAuth 配置
      const configResult = await window.electronAPI.auth.createOAuthConfig(
        provider
      );

      if (!configResult.success || !configResult.data) {
        throw new Error(configResult.error || "Failed to create OAuth config");
      }

      // 启动 OAuth 流程
      const result = await window.electronAPI.auth.startOAuthFlow(configResult.data);

      if (!result.success) {
        throw new Error(result.error || "Failed to start OAuth flow");
      }

      console.info("[useOAuth] OAuth flow started successfully");

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "OAuth login failed";
      setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
      console.error("[useOAuth] OAuth login failed:", error);
      throw error;
    }
  }, []);

  /**
   * 登出
   */
  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await window.electronAPI.auth.logout();

      if (!result.success) {
        throw new Error(result.error || "登出失败");
      }

      setState({
        isLoading: false,
        error: null,
        isAuthenticated: false
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "登出失败";
      setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
      throw error;
    }
  }, []);

  /**
   * 取消 OAuth 流程
   */
  const cancelOAuth = useCallback(async () => {
    try {
      await window.electronAPI.auth.cancelOAuthFlow();
      setState((prev) => ({ ...prev, isLoading: false, error: null }));
    } catch (error) {
      // 静默处理
    }
  }, []);

  /**
   * 监听认证回调事件
   */
  useEffect(() => {
    const handleAuthCallback = (data: {
      code?: string;
      state?: string;
      error?: string;
      errorDescription?: string;
    }) => {
      if (data.error) {
        setState({
          isLoading: false,
          error: data.errorDescription || data.error,
          isAuthenticated: false
        });
      } else if (data.code) {
        setState({
          isLoading: false,
          error: null,
          isAuthenticated: true
        });
      }
    };

    window.electronAPI?.on?.("auth:callback", handleAuthCallback);
    checkAuthStatus();

    return () => {
      window.electronAPI?.removeListener?.("auth:callback", handleAuthCallback);
    };
  }, [checkAuthStatus]);

  return {
    ...state,
    login,
    logout,
    cancelOAuth,
    checkAuthStatus
  };
}
