import * as React from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cn } from '@/ui/components/ui';
import { useAuth } from '@/ui/hooks/useAuth';
import { LoginModal } from './LoginModal';

/**
 * AuthGuard 模式
 */
export type AuthGuardMode = 'optional' | 'redirect' | 'silent';

/**
 * AuthGuard 组件属性
 */
export interface AuthGuardProps {
  /** 子组件 */
  children: React.ReactNode;
  /** 未登录时的回退内容 */
  fallback?: React.ReactNode;
  /** 是否显示登录提示（而非直接显示 fallback） */
  showLoginPrompt?: boolean;
  /** 是否静默模式（不显示任何内容，仅阻止渲染） */
  silent?: boolean;
  /** 额外的 CSS 类名 */
  className?: string;
  /** 加载状态下的内容 */
  loadingContent?: React.ReactNode;
  /** 保护模式 */
  mode?: AuthGuardMode;
  /** 功能标识（用于日志和统计） */
  feature?: string;
}

/**
 * 加载 Spinner 组件
 */
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
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
  );
}

/**
 * 锁定图标 SVG
 */
function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

/**
 * 默认加载内容
 */
function DefaultLoadingContent() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <LoadingSpinner className="h-8 w-8 text-accent" />
      <p className="mt-4 text-sm text-muted">{t('common.loading')}</p>
    </div>
  );
}

/**
 * 默认登录提示内容
 */
function DefaultLoginPrompt({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {/* 锁定图标 */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
        <LockIcon className="h-8 w-8 text-accent" />
      </div>

      {/* 标题 */}
      <h3 className="mt-6 text-lg font-semibold text-ink-900">
        {t('auth.loginRequired')}
      </h3>

      {/* 描述 */}
      <p className="mt-2 text-center text-sm text-muted max-w-sm">
        {t('auth.loginRequiredDescription')}
      </p>

      {/* 登录按钮 */}
      <Button className="mt-6" onClick={onLogin}>
        {t('auth.login')}
      </Button>
    </div>
  );
}

/**
 * 重定向模式子组件（避免条件渲染中使用 useEffect）
 */
function AuthGuardRedirect({
  isAuthenticated,
  isLoading,
  onOpenLogin,
  className,
  showLoginModal,
  onCloseLogin,
}: {
  isAuthenticated: boolean;
  isLoading: boolean;
  onOpenLogin: () => void;
  className?: string;
  showLoginModal: boolean;
  onCloseLogin: () => void;
}) {
  React.useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      onOpenLogin();
    }
  }, [isAuthenticated, isLoading, onOpenLogin]);

  return (
    <div className={className}>
      <DefaultLoginPrompt onLogin={onOpenLogin} />
      <LoginModal
        open={showLoginModal}
        onClose={onCloseLogin}
      />
    </div>
  );
}

/**
 * 认证守卫组件
 * 保护需要登录的路由/组件，未登录时显示登录提示
 *
 * @example
 * // 基本用法 - 显示默认登录提示
 * <AuthGuard>
 *   <ProtectedContent />
 * </AuthGuard>
 *
 * @example
 * // 自定义回退内容
 * <AuthGuard fallback={<CustomFallback />}>
 *   <ProtectedContent />
 * </AuthGuard>
 *
 * @example
 * // 静默模式 - 不渲染任何内容
 * <AuthGuard silent>
 *   <ProtectedContent />
 * </AuthGuard>
 *
 * @example
 * // 可选模式 - 显示内容但提示登录
 * <AuthGuard mode="optional" feature="memory">
 *   <MemoryManager />
 * </AuthGuard>
 *
 * @example
 * // 重定向模式 - 自动弹出登录框
 * <AuthGuard mode="redirect" feature="usage">
 *   <UsagePage />
 * </AuthGuard>
 */
export function AuthGuard({
  children,
  fallback,
  showLoginPrompt = true,
  silent = false,
  className,
  loadingContent,
  mode,
  feature,
}: AuthGuardProps) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);

  /**
   * 打开登录模态框
   */
  const handleOpenLogin = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  /**
   * 关闭登录模态框
   */
  const handleCloseLogin = useCallback(() => {
    setShowLoginModal(false);
  }, []);

  // 记录功能访问（用于统计）
  React.useEffect(() => {
    if (feature && !isLoading && !isAuthenticated) {
      console.log(`[AuthGuard] Unauthenticated access to feature: ${feature}`);
    }
  }, [feature, isLoading, isAuthenticated]);

  // 加载中
  if (isLoading) {
    if (silent || mode === 'silent') return null;

    return (
      <div className={className}>
        {loadingContent ?? <DefaultLoadingContent />}
      </div>
    );
  }

  // 已认证 - 渲染子组件
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // 处理不同的模式
  if (mode === 'optional') {
    // 可选模式：显示内容和登录提示横幅
    return (
      <div className={className}>
        {/* 登录提示横幅 */}
        <div className="mb-4 rounded-lg bg-accent/10 border border-accent/20 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LockIcon className="h-5 w-5 text-accent flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-ink-900">
                  {t('auth.optionalLoginTitle', '登录以使用完整功能')}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {t('auth.optionalLoginSubtitle', '浏览功能不受限制，登录后可使用高级特性')}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={handleOpenLogin}>
              {t('auth.login')}
            </Button>
          </div>
        </div>
        {/* 渲染子组件 */}
        {children}
        {/* 登录模态框 */}
        <LoginModal
          open={showLoginModal}
          onClose={handleCloseLogin}
        />
      </div>
    );
  }

  if (mode === 'redirect') {
    // 重定向模式：自动打开登录框
    return (
      <AuthGuardRedirect
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
        onOpenLogin={handleOpenLogin}
        className={className}
        showLoginModal={showLoginModal}
        onCloseLogin={handleCloseLogin}
      />
    );
  }

  if (mode === 'silent' || silent) {
    // 静默模式 - 不渲染任何内容
    return null;
  }

  // 有自定义回退内容
  if (fallback) {
    return <div className={className}>{fallback}</div>;
  }

  // 显示登录提示
  if (showLoginPrompt) {
    return (
      <div className={className}>
        <DefaultLoginPrompt onLogin={handleOpenLogin} />
        <LoginModal
          open={showLoginModal}
          onClose={handleCloseLogin}
        />
      </div>
    );
  }

  // 默认不渲染
  return null;
}

/**
 * 高阶组件：为组件添加认证守卫
 *
 * @example
 * const ProtectedPage = withAuthGuard(MyPage);
 * // 或带配置
 * const ProtectedPage = withAuthGuard(MyPage, { showLoginPrompt: false });
 */
export function withAuthGuard<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<AuthGuardProps, 'children'>
) {
  const WrappedComponent = (props: P) => {
    return (
      <AuthGuard {...options}>
        <Component {...props} />
      </AuthGuard>
    );
  };

  WrappedComponent.displayName = `withAuthGuard(${Component.displayName ?? Component.name ?? 'Component'})`;

  return WrappedComponent;
}

/**
 * 条件渲染：仅在已认证时渲染内容
 *
 * @example
 * <AuthOnly>
 *   <UserSpecificContent />
 * </AuthOnly>
 */
export function AuthOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

/**
 * 条件渲染：仅在未认证时渲染内容
 *
 * @example
 * <GuestOnly>
 *   <LoginButton />
 * </GuestOnly>
 */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

export default AuthGuard;
