/**
 * 登录/注册流程集成测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/ui/lib/auth-api', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    getOAuthUrl: vi.fn(),
  },
}));

import { authApi } from '@/ui/lib/auth-api';
import { LoginModal } from '@/ui/components/auth/LoginModal';
import { useAuthStore } from '@/ui/store/useAuthStore';

describe('Auth flow', () => {
  const mockOpenExternalUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ data: { pending: true } }),
    }));

    vi.stubGlobal('open', vi.fn());

    (window as any).electron = {
      billing: {
        openExternalUrl: mockOpenExternalUrl,
      },
    };

    mockOpenExternalUrl.mockResolvedValue({ success: true });

    useAuthStore.setState({
      ...useAuthStore.getState(),
      isLoading: false,
      error: null,
      login: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
      setError: vi.fn(),
      setWelcomeBonus: vi.fn(),
      updateBalance: vi.fn(),
    });
  });

  it('should login with email/password', async () => {
    const user = userEvent.setup();
    const loginSpy = useAuthStore.getState().login as unknown as ReturnType<typeof vi.fn>;

    (authApi.login as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 3600,
      balance: { amount: '10.00', currency: 'USD' },
      user: { id: '1', email: 'test@example.com' },
    });

    render(<LoginModal open onClose={() => {}} />);

    await screen.findByRole('dialog');
    const emailInput = document.querySelector<HTMLInputElement>('input#email');
    const passwordInput = document.querySelector<HTMLInputElement>('input#password');
    const submitButton = document.querySelector<HTMLButtonElement>('button[type="submit"]');

    expect(emailInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();
    expect(submitButton).toBeTruthy();

    await user.type(emailInput!, 'test@example.com');
    await user.type(passwordInput!, 'Password123');
    await user.click(submitButton!);

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalled();
    });

    expect(loginSpy).toHaveBeenCalledWith('token', 'refresh', 3600);
  });

  it('should register and call login', async () => {
    const user = userEvent.setup();
    const loginSpy = useAuthStore.getState().login as unknown as ReturnType<typeof vi.fn>;

    (authApi.register as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 3600,
      balance: { amount: '1.00', currency: 'USD' },
      isNewUser: true,
      welcomeBonus: '1.00',
      user: { id: '2', email: 'new@example.com' },
    });

    render(<LoginModal open onClose={() => {}} />);

    await screen.findByRole('dialog');
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
    const activeDialog = dialogs.find(
      (dialog) => dialog.getAttribute('aria-hidden') !== 'true' && dialog.style.pointerEvents !== 'none'
    ) || dialogs[0];

    const registerToggle = Array.from(activeDialog.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('auth.register'));
    expect(registerToggle).toBeTruthy();
    await user.click(registerToggle!);

    await waitFor(() => {
      expect(activeDialog.querySelector('input#confirmPassword')).toBeTruthy();
    });

    const nameInput = activeDialog.querySelector<HTMLInputElement>('input#name');
    const emailInput = activeDialog.querySelector<HTMLInputElement>('input#email');
    const passwordInput = activeDialog.querySelector<HTMLInputElement>('input#password');
    const confirmPasswordInput = activeDialog.querySelector<HTMLInputElement>('input#confirmPassword');
    const registerSubmit = Array.from(activeDialog.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('auth.register') && button.type === 'submit');

    expect(nameInput).toBeTruthy();
    expect(emailInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();
    expect(confirmPasswordInput).toBeTruthy();
    expect(registerSubmit).toBeTruthy();

    await user.type(nameInput!, 'NewUser');
    await user.type(emailInput!, 'new@example.com');
    await user.type(passwordInput!, 'Password123');
    await user.type(confirmPasswordInput!, 'Password123');
    await user.click(registerSubmit!);

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalled();
    });

    expect(loginSpy).toHaveBeenCalledWith('token', 'refresh', 3600);
  });

  it('should use system browser for Google OAuth in Electron', async () => {
    const onClose = vi.fn();
    (authApi.getOAuthUrl as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
      state: 'test-state',
    });

    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        data: {
          accessToken: 'google-token',
          refreshToken: 'google-refresh',
          expiresIn: 3600,
          balance: { amount: '9.90', currency: 'USD' },
        },
      }),
    });

    render(<LoginModal open onClose={onClose} />);

    const googleButtonTexts = await screen.findAllByText('auth.continueWithGoogle');
    const googleButton = googleButtonTexts
      .map((node) => node.closest('button') as HTMLButtonElement | null)
      .find((button) => !!button && !button.disabled) as HTMLButtonElement | undefined;
    expect(googleButton).toBeTruthy();
    googleButton!.click();

    await waitFor(() => {
      expect(authApi.getOAuthUrl).toHaveBeenCalledWith('google');
      expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?client_id=test');
    });

    expect(window.open).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should not fallback to window.open when Electron external open fails', async () => {
    const setErrorSpy = useAuthStore.getState().setError as unknown as ReturnType<typeof vi.fn>;
    const clearErrorSpy = useAuthStore.getState().clearError as unknown as ReturnType<typeof vi.fn>;

    (authApi.getOAuthUrl as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
      state: 'test-state',
    });

    mockOpenExternalUrl.mockResolvedValue({ success: false, error: 'ipc unavailable' });

    render(<LoginModal open onClose={() => {}} />);

    const googleButtonTexts = await screen.findAllByText('auth.continueWithGoogle');
    const googleButton = googleButtonTexts
      .map((node) => node.closest('button') as HTMLButtonElement | null)
      .find((button) => !!button && !button.disabled) as HTMLButtonElement | undefined;
    expect(googleButton).toBeTruthy();
    googleButton!.click();

    await waitFor(() => {
      expect(clearErrorSpy).toHaveBeenCalled();
      expect(mockOpenExternalUrl).toHaveBeenCalled();
    });

    expect(window.open).not.toHaveBeenCalled();
    expect(setErrorSpy).toHaveBeenCalledWith({
      code: 'OAUTH_FAILED',
      message: '无法打开系统浏览器，请重启应用后重试',
    });
  });
});
