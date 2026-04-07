import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/ui/store/useAuthStore';

describe('useAuthStore security persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      ...useAuthStore.getState(),
      user: null,
      isAuthenticated: false,
      isLoading: false,
      balance: null,
      welcomeBonus: null,
      error: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    });
  });

  it('restoreSession 只恢复内存态，不把 token 持久化到 localStorage', async () => {
    useAuthStore.getState().restoreSession({
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
      expiresAt: Date.now() + 60_000,
    });

    expect(useAuthStore.getState().accessToken).toBe('stored-access-token');
    expect(useAuthStore.getState().refreshToken).toBe('stored-refresh-token');

    const persistedAuthState = localStorage.getItem('auth-storage') ?? '';
    expect(persistedAuthState).not.toContain('stored-access-token');
    expect(persistedAuthState).not.toContain('stored-refresh-token');
  });
});
