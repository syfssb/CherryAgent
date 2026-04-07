/**
 * 认证系统使用示例
 * 展示如何在实际应用中使用登录态恢复和路由守卫功能
 */

import React from 'react';
import {
  ProtectedRoute,
  AuthGuard,
  AuthOnly,
  GuestOnly,
  withProtectedRoute,
} from '@/ui/components/auth';
import { useAuth } from '@/ui/hooks/useAuth';
import { useAuthStore } from '@/ui/store/useAuthStore';

// ============================================================================
// 示例 1: 受保护的页面
// ============================================================================

/**
 * Dashboard 页面 - 需要登录才能访问
 */
export function DashboardPage() {
  const { user, balance } = useAuth();

  return (
    <ProtectedRoute>
      <div className="p-8">
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <p className="mt-2 text-muted">欢迎回来, {user?.name || user?.email}</p>

        {balance && (
          <div className="mt-4 rounded-lg bg-accent/10 p-4">
            <p className="text-sm text-muted">账户余额</p>
            <p className="text-2xl font-semibold text-accent">
              {balance.amount.toFixed(2)} 积分
            </p>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

/**
 * Settings 页面 - 使用高阶组件保护
 */
function SettingsPageContent() {
  const { user } = useAuth();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">设置</h1>
      <div className="mt-4 space-y-4">
        <div>
          <label className="text-sm font-medium">邮箱</label>
          <p className="mt-1 text-muted">{user?.email}</p>
        </div>
        <div>
          <label className="text-sm font-medium">用户名</label>
          <p className="mt-1 text-muted">{user?.name || '未设置'}</p>
        </div>
      </div>
    </div>
  );
}

// 使用高阶组件保护
export const SettingsPage = withProtectedRoute(SettingsPageContent);

// ============================================================================
// 示例 2: 组件级保护
// ============================================================================

/**
 * 用户菜单组件 - 使用 AuthGuard 保护
 */
export function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <AuthGuard silent>
      <div className="flex items-center gap-2">
        <img
          src={user?.avatar || '/default-avatar.png'}
          alt={user?.name || 'User'}
          className="h-8 w-8 rounded-full"
        />
        <span className="text-sm font-medium">{user?.name || user?.email}</span>
        <button
          onClick={logout}
          className="ml-2 rounded px-3 py-1 text-sm text-error hover:bg-error/10"
        >
          登出
        </button>
      </div>
    </AuthGuard>
  );
}

/**
 * 功能区域 - 仅登录用户可见
 */
export function PremiumFeature() {
  return (
    <AuthGuard showLoginPrompt>
      <div className="rounded-lg border border-accent/20 bg-accent/5 p-6">
        <h3 className="text-lg font-semibold">高级功能</h3>
        <p className="mt-2 text-sm text-muted">
          此功能仅对已登录用户开放
        </p>
        <button className="mt-4 rounded bg-accent px-4 py-2 text-sm text-white">
          使用功能
        </button>
      </div>
    </AuthGuard>
  );
}

// ============================================================================
// 示例 3: 条件渲染
// ============================================================================

/**
 * 应用头部 - 根据登录状态显示不同内容
 */
export function AppHeader() {
  const { openLoginWindow } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-ink-900/10 px-6 py-4">
      <div className="flex items-center gap-8">
        <h1 className="text-xl font-bold">Cherry Agent</h1>

        {/* 导航链接 - 仅登录用户可见 */}
        <AuthOnly>
          <nav className="flex gap-4">
            <a href="/dashboard" className="text-sm hover:text-accent">仪表盘</a>
            <a href="/sessions" className="text-sm hover:text-accent">会话</a>
            <a href="/settings" className="text-sm hover:text-accent">设置</a>
          </nav>
        </AuthOnly>
      </div>

      {/* 右侧操作区 */}
      <div>
        {/* 已登录用户显示用户菜单 */}
        <AuthOnly>
          <UserMenu />
        </AuthOnly>

        {/* 未登录用户显示登录按钮 */}
        <GuestOnly>
          <button
            onClick={openLoginWindow}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            登录
          </button>
        </GuestOnly>
      </div>
    </header>
  );
}

// ============================================================================
// 示例 4: 手动控制登录流程
// ============================================================================

/**
 * 自定义登录页面
 */
export function CustomLoginPage() {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // 调用后端 API 登录
      const { authApi } = await import('@/ui/lib/auth-api');
      const result = await authApi.login(email, password);

      // 更新本地状态
      await login(result.accessToken, result.refreshToken, result.expiresIn);

      // 登录成功,跳转到首页
      window.location.href = '/dashboard';
    } catch (err) {
      console.error('登录失败:', err);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-xl border border-ink-900/10 bg-white p-8">
        <h2 className="text-2xl font-bold">登录</h2>

        {error && (
          <div className="rounded-lg border border-error/20 bg-error-light px-4 py-3">
            <p className="text-sm text-error">{error.message}</p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-900/20 px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-900/20 px-3 py-2"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {isLoading ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// 示例 5: 使用 API 客户端
// ============================================================================

/**
 * 会话列表页面 - 演示如何使用 API 客户端
 */
export function SessionsPage() {
  const [sessions, setSessions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchSessions = async () => {
      try {
        // 使用 API 客户端自动处理认证
        const { apiClient } = await import('@/ui/lib/api-client');
        const response = await apiClient.get('/sessions');

        if (response.success && response.data) {
          setSessions(response.data);
        }
      } catch (error) {
        console.error('获取会话列表失败:', error);
        // API 客户端会自动处理 401/403 错误
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, []);

  return (
    <ProtectedRoute>
      <div className="p-8">
        <h1 className="text-2xl font-bold">我的会话</h1>

        {loading ? (
          <p className="mt-4 text-muted">加载中...</p>
        ) : (
          <div className="mt-4 space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-lg border border-ink-900/10 p-4"
              >
                <h3 className="font-medium">{session.title}</h3>
                <p className="text-sm text-muted">
                  {new Date(session.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

// ============================================================================
// 示例 6: 检查认证状态
// ============================================================================

/**
 * 根据认证状态显示不同页面
 */
export function LandingOrDashboard() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>加载中...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <DashboardPage />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">欢迎使用 Cherry Agent</h1>
        <p className="mt-2 text-muted">开始你的 AI 协作之旅</p>
      </div>
    </div>
  );
}

// ============================================================================
// 示例 7: 自定义受保护路由
// ============================================================================

/**
 * 带自定义回退的受保护页面
 */
export function AdminPage() {
  return (
    <ProtectedRoute
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold">管理员访问</h2>
            <p className="mt-2 text-muted">需要管理员权限</p>
          </div>
        </div>
      }
      showLoginModal={false}
    >
      <div className="p-8">
        <h1 className="text-2xl font-bold">管理后台</h1>
        <p className="text-muted">管理员专属内容</p>
      </div>
    </ProtectedRoute>
  );
}
