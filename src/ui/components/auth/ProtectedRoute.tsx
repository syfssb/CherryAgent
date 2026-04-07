import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/ui/hooks/useAuth';
import { LoginModal } from './LoginModal';

/**
 * 受保护路由的属性
 */
export interface ProtectedRouteProps {
  /** 子组件 */
  children: React.ReactNode;
  /** 是否需要认证(默认 true) */
  requireAuth?: boolean;
  /** 是否自动显示登录模态框(默认 true) */
  showLoginModal?: boolean;
  /** 未认证时的回退内容 */
  fallback?: React.ReactNode;
  /** 加载时的内容 */
  loadingContent?: React.ReactNode;
}

/**
 * 受保护路由组件
 * 用于需要登录才能访问的路由/页面
 *
 * 功能:
 * 1. 检查用户是否已认证
 * 2. 未认证时显示登录模态框或自定义回退内容
 * 3. 已认证时渲染子组件
 *
 * @example
 * // 基本用法 - 自动显示登录模态框
 * <ProtectedRoute>
 *   <DashboardPage />
 * </ProtectedRoute>
 *
 * @example
 * // 自定义回退内容
 * <ProtectedRoute fallback={<CustomLoginPage />} showLoginModal={false}>
 *   <SettingsPage />
 * </ProtectedRoute>
 */
export function ProtectedRoute({
  children,
  requireAuth = true,
  showLoginModal = true,
  fallback,
  loadingContent,
}: ProtectedRouteProps) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = React.useState(false);

  // 加载中
  if (isLoading) {
    if (loadingContent) {
      return <>{loadingContent}</>;
    }

    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-8 w-8 animate-spin text-accent"
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
          <p className="text-sm text-muted">{t('common.loading', '加载中...')}</p>
        </div>
      </div>
    );
  }

  // 不需要认证,直接渲染子组件
  if (!requireAuth) {
    return <>{children}</>;
  }

  // 已认证,渲染子组件
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // 未认证,显示回退内容或登录模态框
  if (fallback) {
    return <>{fallback}</>;
  }

  // 自动打开登录模态框
  React.useEffect(() => {
    if (showLoginModal && !isAuthenticated && !isLoading) {
      setIsLoginModalOpen(true);
    }
  }, [showLoginModal, isAuthenticated, isLoading]);

  return (
    <>
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
            <svg
              className="h-8 w-8 text-accent"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-ink-900">
              {t('auth.loginRequired', '需要登录')}
            </h2>
            <p className="mt-2 text-sm text-muted max-w-sm">
              {t('auth.loginRequiredDescription', '此页面需要登录后才能访问')}
            </p>
          </div>

          <button
            onClick={() => setIsLoginModalOpen(true)}
            className="mt-2 rounded-lg bg-accent px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {t('auth.login', '登录')}
          </button>
        </div>
      </div>

      {showLoginModal && (
        <LoginModal
          open={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onSuccess={() => setIsLoginModalOpen(false)}
        />
      )}
    </>
  );
}

/**
 * 高阶组件: 为页面添加认证保护
 *
 * @example
 * const ProtectedDashboard = withProtectedRoute(DashboardPage);
 *
 * @example
 * // 带配置
 * const ProtectedSettings = withProtectedRoute(SettingsPage, {
 *   showLoginModal: false,
 *   fallback: <CustomLoginPage />
 * });
 */
export function withProtectedRoute<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<ProtectedRouteProps, 'children'>
) {
  const WrappedComponent = (props: P) => {
    return (
      <ProtectedRoute {...options}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };

  WrappedComponent.displayName = `withProtectedRoute(${Component.displayName ?? Component.name ?? 'Component'})`;

  return WrappedComponent;
}

export default ProtectedRoute;
