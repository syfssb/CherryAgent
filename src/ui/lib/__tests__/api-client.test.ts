import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiError } from '../api-client';

const { mockRefresh, mockLogout, mockGetState } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockLogout: vi.fn(),
  mockGetState: vi.fn(),
}));

vi.mock('@/ui/store/useAuthStore', () => ({
  useAuthStore: {
    getState: mockGetState,
  },
}));

describe('apiClient 403 error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockImplementation(() => ({
      accessToken: null,
      tokenExpiresAt: Date.now() + 60 * 60 * 1000,
      refresh: mockRefresh,
      logout: mockLogout,
    }));
  });

  it('should preserve backend EMAIL_NOT_VERIFIED message for 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 403,
      ok: false,
      json: vi.fn().mockResolvedValue({
        success: false,
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: '请先验证邮箱，验证邮件已重新发送到您的邮箱',
        },
      }),
    }));

    await expect(apiClient.post('/auth/login/password', {
      email: 'unverified@example.com',
      password: 'Password123',
    }, { requireAuth: false })).rejects.toMatchObject({
      status: 403,
      message: '请先验证邮箱，验证邮件已重新发送到您的邮箱',
    });
  });

  it('should fallback to default 403 message when body is not parseable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 403,
      ok: false,
      json: vi.fn().mockRejectedValue(new Error('invalid json')),
    }));

    let captured: ApiError | null = null;
    try {
      await apiClient.get('/auth/me');
    } catch (error) {
      captured = error as ApiError;
    }

    expect(captured).toBeTruthy();
    expect(captured).toBeInstanceOf(ApiError);
    expect(captured?.status).toBe(403);
    expect(captured?.message).toBe('无权访问此资源');
  });
});

describe('apiClient 401 error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockImplementation(() => ({
      accessToken: null,
      tokenExpiresAt: Date.now() + 60 * 60 * 1000,
      refresh: mockRefresh,
      logout: mockLogout,
    }));
  });

  it('should preserve backend message for 401 on non-auth requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: vi.fn().mockResolvedValue({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: '邮箱或密码错误',
        },
      }),
    }));

    await expect(apiClient.post('/auth/login/password', {
      email: 'wrong@example.com',
      password: 'wrong-password',
    }, { requireAuth: false })).rejects.toMatchObject({
      status: 401,
      message: '邮箱或密码错误',
    });

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should fallback to default 401 message when body is not parseable on non-auth requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: vi.fn().mockRejectedValue(new Error('invalid json')),
    }));

    let captured: ApiError | null = null;
    try {
      await apiClient.post('/auth/login/password', {
        email: 'wrong@example.com',
        password: 'wrong-password',
      }, { requireAuth: false });
    } catch (error) {
      captured = error as ApiError;
    }

    expect(captured).toBeTruthy();
    expect(captured).toBeInstanceOf(ApiError);
    expect(captured?.status).toBe(401);
    expect(captured?.message).toBe('认证失败');
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('should logout and show session expired message for 401 on auth requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: vi.fn().mockResolvedValue({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'token expired',
        },
      }),
    }));

    await expect(apiClient.get('/auth/me')).rejects.toMatchObject({
      status: 401,
      message: '登录已过期,请重新登录',
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
