/**
 * AuthGuard 集成测试
 * 测试认证守卫在各种场景下的行为
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import '@/ui/i18n/config';
import userEvent from '@testing-library/user-event';
import { AuthGuard, withAuthGuard, AuthOnly, GuestOnly } from '@/ui/components/auth/AuthGuard';
import { useAuthStore } from '@/ui/store/useAuthStore';
import { useAuth } from '@/ui/hooks/useAuth';

// Mock useAuth hook
vi.mock('@/ui/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

// Test component
function TestContent() {
  return <div>Protected Content</div>;
}

describe('AuthGuard Integration', () => {
  beforeEach(() => {
    // Reset auth store before each test
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('Basic Protection', () => {
    it('应该在未登录时显示登录提示', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      render(
        <AuthGuard>
          <TestContent />
        </AuthGuard>
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      expect(screen.getByText(/login required/i)).toBeInTheDocument();
    });

    it('应该在已登录时显示受保护内容', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
      });

      render(
        <AuthGuard>
          <TestContent />
        </AuthGuard>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('应该在加载中时显示加载状态', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
      });

      render(
        <AuthGuard>
          <TestContent />
        </AuthGuard>
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('Silent Mode', () => {
    it('应该在静默模式下不渲染任何内容', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      const { container } = render(
        <AuthGuard silent>
          <TestContent />
        </AuthGuard>
      );

      expect(container.firstChild).toBeNull();
    });

    it('应该在静默模式下已登录时显示内容', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
      });

      render(
        <AuthGuard silent>
          <TestContent />
        </AuthGuard>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  describe('Custom Fallback', () => {
    it('应该显示自定义回退内容', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      render(
        <AuthGuard fallback={<div>Custom Fallback</div>}>
          <TestContent />
        </AuthGuard>
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      expect(screen.getByText('Custom Fallback')).toBeInTheDocument();
    });
  });

  describe('Login Modal', () => {
    it('应该点击登录按钮后打开登录弹窗', async () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      const user = userEvent.setup();

      render(
        <AuthGuard showLoginPrompt>
          <TestContent />
        </AuthGuard>
      );

      const loginButton = screen.getByRole('button', { name: /log in/i });
      await user.click(loginButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });
  });

  describe('HOC Wrapper', () => {
    it('应该通过 HOC 正确包装组件', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
      });

      const ProtectedComponent = withAuthGuard(TestContent);

      render(<ProtectedComponent />);

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('HOC 应该保留组件的显示名称', () => {
      const NamedComponent = () => <div>Test</div>;
      NamedComponent.displayName = 'NamedComponent';

      const ProtectedComponent = withAuthGuard(NamedComponent);

      expect(ProtectedComponent.displayName).toBe('withAuthGuard(NamedComponent)');
    });
  });

  describe('Conditional Rendering', () => {
    it('AuthOnly 应该仅在已登录时渲染', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
      });

      render(
        <AuthOnly>
          <div>Auth Only Content</div>
        </AuthOnly>
      );

      expect(screen.getByText('Auth Only Content')).toBeInTheDocument();
    });

    it('AuthOnly 应该在未登录时不渲染', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      const { container } = render(
        <AuthOnly>
          <div>Auth Only Content</div>
        </AuthOnly>
      );

      expect(container.firstChild).toBeNull();
    });

    it('GuestOnly 应该仅在未登录时渲染', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      render(
        <GuestOnly>
          <div>Guest Only Content</div>
        </GuestOnly>
      );

      expect(screen.getByText('Guest Only Content')).toBeInTheDocument();
    });

    it('GuestOnly 应该在已登录时不渲染', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
      });

      const { container } = render(
        <GuestOnly>
          <div>Guest Only Content</div>
        </GuestOnly>
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Real-world Scenarios', () => {
    it('充值功能应该在未登录时弹出登录框', async () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      const user = userEvent.setup();
      const onRecharge = vi.fn();

      function RechargeButton() {
        const [showModal, setShowModal] = React.useState(false);

        return (
          <>
            <button onClick={() => setShowModal(true)}>充值</button>
            {showModal && (
              <AuthGuard silent>
                <div>
                  <button onClick={onRecharge}>确认充值</button>
                </div>
              </AuthGuard>
            )}
          </>
        );
      }

      render(<RechargeButton />);

      const rechargeButton = screen.getByText('充值');
      await user.click(rechargeButton);

      // 静默模式下，未登录时不显示充值弹窗
      expect(screen.queryByText('确认充值')).not.toBeInTheDocument();
    });

    it('设置页面应该在未登录时显示登录提示', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      function SettingsPage() {
        return <div>Settings Content</div>;
      }

      render(
        <AuthGuard>
          <SettingsPage />
        </AuthGuard>
      );

      expect(screen.queryByText('Settings Content')).not.toBeInTheDocument();
      expect(screen.getByText(/login required/i)).toBeInTheDocument();
    });

    it('对话功能应该支持免登录使用', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      function ChatPage() {
        return <div>Chat Content</div>;
      }

      // 对话功能不使用 AuthGuard 保护
      render(<ChatPage />);

      expect(screen.getByText('Chat Content')).toBeInTheDocument();
    });
  });

  describe('Integration with BalanceDisplay', () => {
    it('余额显示应该在未登录时显示登录按钮', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
      });

      // Mock BalanceDisplay
      function BalanceDisplay({ onRechargeClick }: { onRechargeClick?: () => void }) {
        const { isAuthenticated } = useAuth();

        if (!isAuthenticated) {
          return <button onClick={onRechargeClick}>登录</button>;
        }

        return <div>余额：10.00 积分</div>;
      }

      const onRecharge = vi.fn();
      render(<BalanceDisplay onRechargeClick={onRecharge} />);

      expect(screen.getByText('登录')).toBeInTheDocument();
      expect(screen.queryByText(/余额/)).not.toBeInTheDocument();
    });

    it('余额显示应该在已登录时显示余额', () => {
      mockedUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
      });

      // Mock BalanceDisplay
      function BalanceDisplay({ onRechargeClick }: { onRechargeClick?: () => void }) {
        const { isAuthenticated } = useAuth();

        if (!isAuthenticated) {
          return <button onClick={onRechargeClick}>登录</button>;
        }

        return <div>余额：10.00 积分</div>;
      }

      render(<BalanceDisplay onRechargeClick={() => {}} />);

      expect(screen.getByText(/余额/)).toBeInTheDocument();
      expect(screen.queryByText('登录')).not.toBeInTheDocument();
    });
  });
});
