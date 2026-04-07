import { useEffect, useState } from 'react';
import { useAuthStore } from '@/ui/store/useAuthStore';

/**
 * 应用初始化器属性
 */
export interface AppInitializerProps {
  /** 子组件 */
  children: React.ReactNode;
  /** 初始化加载时显示的内容 */
  fallback?: React.ReactNode;
}

/**
 * 默认加载界面
 * 注意：不使用 useTranslation，因为此组件在 i18n 初始化完成前就会渲染
 */
function DefaultLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-4">
        <svg
          className="h-12 w-12 animate-spin text-accent"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" />
          <path
            className="opacity-75"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            fill="currentColor"
            stroke="none"
          />
        </svg>

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-semibold text-ink-900">Cherry Agent</h1>
          <p className="text-sm text-muted">正在初始化...</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 应用初始化器组件
 * 负责在应用启动时恢复登录状态
 *
 * 功能:
 * 1. 检查本地存储的认证令牌
 * 2. 验证令牌有效性
 * 3. 如果令牌过期但有 refresh token,自动刷新
 * 4. 如果无有效令牌,清除认证状态
 * 5. 初始化完成后渲染子组件
 *
 * @example
 * <AppInitializer>
 *   <App />
 * </AppInitializer>
 */
export function AppInitializer({ children, fallback }: AppInitializerProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const isTokenExpired = useAuthStore((s) => s.isTokenExpired);
  const refresh = useAuthStore((s) => s.refresh);
  const logout = useAuthStore((s) => s.logout);
  const fetchBalance = useAuthStore((s) => s.fetchBalance);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        let currentAccessToken = accessToken;
        let currentRefreshToken = refreshToken;

        if (!currentAccessToken) {
          try {
            const credentials = await window.electron?.auth?.getCredentials?.();
            if (credentials?.accessToken) {
              restoreSession({
                accessToken: credentials.accessToken,
                refreshToken: credentials.refreshToken ?? null,
                expiresAt: credentials.expiresAt ?? null,
              });
              await window.electron?.sync?.setAccessToken?.(credentials.accessToken);
              currentAccessToken = credentials.accessToken;
              currentRefreshToken = credentials.refreshToken ?? null;
            }
          } catch (error) {
            console.error('[AppInitializer] Failed to restore secure credentials:', error);
          }
        }

        if (!currentAccessToken) {
          if (mounted) {
            setIsInitialized(true);
          }
          return;
        }

        // 检查令牌是否过期
        const expired = isTokenExpired();

        if (expired) {
          // 令牌已过期,尝试刷新
          if (currentRefreshToken) {
            try {
              await refresh();

              // 刷新成功,获取余额
              if (mounted && useAuthStore.getState().isAuthenticated) {
                await fetchBalance();
              }
            } catch (error) {
              // 刷新失败,会在 refresh 方法中自动登出
              console.error('[AppInitializer] Token refresh failed:', error);
            }
          } else {
            // 无 refresh token,清除认证状态
            logout();
          }
        } else {
          // 令牌未过期,验证有效性
          try {
            // 尝试获取用户信息来验证令牌
            const { authApi } = await import('@/ui/lib/auth-api');
            const isValid = await authApi.verifyToken();

            if (!isValid) {
              // 令牌无效,尝试刷新
              if (refreshToken) {
                await refresh();
              } else {
                logout();
              }
            } else if (mounted && useAuthStore.getState().isAuthenticated) {
              // 令牌有效,获取余额
              await fetchBalance();
            }
          } catch (error) {
            // 验证失败,尝试刷新
            console.error('[AppInitializer] Token validation failed:', error);

            if (currentRefreshToken) {
              try {
                await refresh();
              } catch (refreshError) {
                console.error('[AppInitializer] Token refresh failed:', refreshError);
              }
            } else {
              logout();
            }
          }
        }
      } catch (error) {
        // 初始化失败,清除认证状态
        console.error('[AppInitializer] Initialization failed:', error);
        logout();
      } finally {
        // 标记初始化完成
        if (mounted) {
          setIsInitialized(true);
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
    };
  }, []); // 仅在组件挂载时执行一次

  // 初始化未完成,显示加载界面
  if (!isInitialized) {
    return <>{fallback ?? <DefaultLoadingScreen />}</>;
  }

  // 初始化完成,渲染子组件
  return <>{children}</>;
}

/**
 * 高阶组件: 为应用添加初始化逻辑
 *
 * @example
 * const InitializedApp = withAppInitializer(App);
 */
export function withAppInitializer<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  const WrappedComponent = (props: P) => {
    return (
      <AppInitializer fallback={fallback}>
        <Component {...props} />
      </AppInitializer>
    );
  };

  WrappedComponent.displayName = `withAppInitializer(${Component.displayName ?? Component.name ?? 'Component'})`;

  return WrappedComponent;
}

export default AppInitializer;
