import { useCallback, useEffect, useRef } from 'react';
import { useAuthStore, type User, type Balance, type AuthError } from '@/ui/store/useAuthStore';

/**
 * OAuth 回调数据类型
 */
interface OAuthCallbackData {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: User;
  error?: string;
}

/**
 * useAuth hook 返回类型
 */
export interface UseAuthReturn {
  /** 当前用户 */
  user: User | null;
  /** 是否已认证 */
  isAuthenticated: boolean;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 余额 */
  balance: Balance | null;
  /** 错误信息 */
  error: AuthError | null;
  /** 登录 */
  login: (accessToken: string, refreshToken?: string, expiresIn?: number) => Promise<void>;
  /** 登出 */
  logout: () => void;
  /** 刷新认证状态 */
  refresh: () => Promise<void>;
  /** 获取余额 */
  fetchBalance: () => Promise<void>;
  /** 清除错误 */
  clearError: () => void;
  /** 打开登录窗口 */
  openLoginWindow: () => void;
  /** 打开注册窗口 */
  openRegisterWindow: () => void;
}

/**
 * 令牌刷新间隔（毫秒）
 * 默认为 50 分钟，留 10 分钟缓冲时间
 */
const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

/**
 * 余额刷新间隔（毫秒）
 * 默认为 5 分钟
 */
const BALANCE_REFRESH_INTERVAL = 5 * 60 * 1000;

/**
 * 认证 Hook
 * 封装认证相关操作，监听 IPC auth:callback 事件，自动刷新令牌
 */
export function useAuth(): UseAuthReturn {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const balance = useAuthStore((s) => s.balance);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const refresh = useAuthStore((s) => s.refresh);
  const fetchBalance = useAuthStore((s) => s.fetchBalance);
  const clearError = useAuthStore((s) => s.clearError);
  const isTokenExpired = useAuthStore((s) => s.isTokenExpired);

  // 用于跟踪定时器的 ref
  const tokenRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const balanceRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasInitializedRef = useRef(false);

  /**
   * 处理 OAuth 回调
   */
  const handleOAuthCallback = useCallback(async (data: OAuthCallbackData) => {
    if (data.error) {
      useAuthStore.getState().setError({
        code: 'OAUTH_ERROR',
        message: data.error,
      });
      return;
    }

    if (data.accessToken) {
      try {
        await login(data.accessToken, data.refreshToken, data.expiresIn);
      } catch (err) {
        // 错误已在 store 中处理
      }
    }
  }, [login]);

  /**
   * 监听 IPC auth:callback 事件
   */
  useEffect(() => {
    // 订阅 OAuth 回调事件
    const unsubscribe = window.electron?.auth?.onAuthCallback?.((data) => {
      handleOAuthCallback(data as unknown as OAuthCallbackData);
    });

    return () => {
      unsubscribe?.();
    };
  }, [handleOAuthCallback]);

  /**
   * 初始化时检查并恢复认证状态
   */
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const initAuth = async () => {
      // 如果有存储的令牌但已过期，尝试刷新
      if (isAuthenticated && isTokenExpired()) {
        try {
          await refresh();
        } catch (err) {
          // 刷新失败会自动登出
        }
      } else if (isAuthenticated) {
        // 已认证且令牌未过期，获取余额
        fetchBalance();
      }
    };

    initAuth();
  }, [isAuthenticated, isTokenExpired, refresh, fetchBalance]);

  /**
   * 设置自动令牌刷新
   */
  useEffect(() => {
    // 清除之前的定时器
    if (tokenRefreshTimerRef.current) {
      clearInterval(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }

    // 如果已认证，设置定时刷新
    if (isAuthenticated) {
      tokenRefreshTimerRef.current = setInterval(() => {
        if (isTokenExpired()) {
          refresh().catch(() => {
            // 刷新失败会自动登出
          });
        }
      }, TOKEN_REFRESH_INTERVAL);
    }

    return () => {
      if (tokenRefreshTimerRef.current) {
        clearInterval(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
    };
  }, [isAuthenticated, isTokenExpired, refresh]);

  /**
   * 设置自动余额刷新
   */
  useEffect(() => {
    // 清除之前的定时器
    if (balanceRefreshTimerRef.current) {
      clearInterval(balanceRefreshTimerRef.current);
      balanceRefreshTimerRef.current = null;
    }

    // 如果已认证，设置定时刷新余额
    if (isAuthenticated) {
      balanceRefreshTimerRef.current = setInterval(() => {
        fetchBalance();
      }, BALANCE_REFRESH_INTERVAL);
    }

    return () => {
      if (balanceRefreshTimerRef.current) {
        clearInterval(balanceRefreshTimerRef.current);
        balanceRefreshTimerRef.current = null;
      }
    };
  }, [isAuthenticated, fetchBalance]);

  /**
   * 打开登录窗口
   * TODO: 实现登录界面显示逻辑(模态框或路由跳转)
   */
  const openLoginWindow = useCallback(() => {
    console.log('[useAuth] openLoginWindow called - TODO: implement');
    // 在 Electron 环境中可以通过 IPC 打开窗口
    // 在 Web 环境中应该显示登录模态框或跳转到登录页面
  }, []);

  /**
   * 打开注册窗口
   * TODO: 实现注册界面显示逻辑(模态框或路由跳转)
   */
  const openRegisterWindow = useCallback(() => {
    console.log('[useAuth] openRegisterWindow called - TODO: implement');
    // 在 Electron 环境中可以通过 IPC 打开窗口
    // 在 Web 环境中应该显示注册模态框或跳转到注册页面
  }, []);

  return {
    user,
    isAuthenticated,
    isLoading,
    balance,
    error,
    login,
    logout,
    refresh,
    fetchBalance,
    clearError,
    openLoginWindow,
    openRegisterWindow,
  };
}

/**
 * 检查是否需要登录的 Hook
 * @param redirectToLogin - 如果未登录是否自动打开登录窗口
 */
export function useRequireAuth(redirectToLogin: boolean = false): {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
} {
  const { isAuthenticated, isLoading, user, openLoginWindow } = useAuth();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    // 只在加载完成且未认证时重定向
    if (!isLoading && !isAuthenticated && redirectToLogin && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      openLoginWindow();
    }
  }, [isLoading, isAuthenticated, redirectToLogin, openLoginWindow]);

  // 重置重定向标记
  useEffect(() => {
    if (isAuthenticated) {
      hasRedirectedRef.current = false;
    }
  }, [isAuthenticated]);

  return { isAuthenticated, isLoading, user };
}

export default useAuth;
