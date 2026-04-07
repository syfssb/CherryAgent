import { apiClient } from './client';
import { ApiError } from './error';
import type { User } from '@/ui/store/useAuthStore';

/**
 * 登录请求参数
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * 注册请求参数
 */
export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

/**
 * 余额信息
 */
export interface BalanceInfo {
  amount: string;
  currency: string;
}

/**
 * 登录响应
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
  balance: BalanceInfo;
  isNewUser?: boolean;
  welcomeBonus?: string;
}

/**
 * 刷新令牌响应
 */
export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

/**
 * 用户信息响应
 */
export interface UserInfoResponse {
  user: User;
}

/**
 * 余额响应
 */
export interface BalanceResponse {
  amount: number;
  currency: string;
}

/**
 * OAuth 授权 URL 响应
 */
export interface OAuthUrlResponse {
  authUrl: string;
  state: string;
}

/**
 * 认证 API
 */
export const authApi = {
  /**
   * 邮箱密码登录
   *
   * @example
   * ```ts
   * const result = await authApi.login('user@example.com', 'password123');
   * console.log(result.accessToken);
   * ```
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>(
      '/auth/login/password',
      { email, password },
      { requireAuth: false }
    );

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '登录失败', 'LOGIN_FAILED');
    }

    return response.data;
  },

  /**
   * 邮箱密码注册
   *
   * @example
   * ```ts
   * const result = await authApi.register('user@example.com', 'Password123', 'User');
   * console.log(result.accessToken);
   * ```
   */
  async register(email: string, password: string, name?: string): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>(
      '/auth/register',
      { email, password, name },
      { requireAuth: false }
    );

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '注册失败', 'REGISTER_FAILED');
    }

    return response.data;
  },

  /**
   * OAuth 登录 - 获取授权 URL
   *
   * @example
   * ```ts
   * const { authUrl } = await authApi.getOAuthUrl('google');
   * window.location.href = authUrl;
   * ```
   */
  async getOAuthUrl(provider: 'google' | 'github'): Promise<OAuthUrlResponse> {
    const response = await apiClient.get<OAuthUrlResponse>(`/auth/oauth/${provider}`, {
      requireAuth: false,
    });

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '获取授权 URL 失败', 'OAUTH_URL_FAILED');
    }

    return response.data;
  },

  /**
   * OAuth 回调处理
   */
  async handleOAuthCallback(
    provider: 'google' | 'github',
    code: string,
    state: string
  ): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>(
      `/auth/oauth/${provider}/callback`,
      { code, state },
      { requireAuth: false }
    );

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || 'OAuth 登录失败', 'OAUTH_LOGIN_FAILED');
    }

    return response.data;
  },

  /**
   * 刷新访问令牌
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    const response = await apiClient.post<RefreshTokenResponse>(
      '/auth/refresh',
      { refreshToken },
      { requireAuth: false }
    );

    if (!response.success || !response.data) {
      throw new ApiError(401, response.error || '令牌刷新失败', 'TOKEN_REFRESH_FAILED');
    }

    return response.data;
  },

  /**
   * 获取当前用户信息
   *
   * @example
   * ```ts
   * const user = await authApi.getUserInfo();
   * console.log(user.email);
   * ```
   */
  async getUserInfo(): Promise<User> {
    const response = await apiClient.get<UserInfoResponse>('/auth/me', {
      requireAuth: true,
      cache: {
        enabled: true,
        ttl: 60000, // 缓存 1 分钟
      },
    });

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '获取用户信息失败', 'USER_INFO_FAILED');
    }

    return response.data.user;
  },

  /**
   * 获取用户余额
   *
   * @example
   * ```ts
   * const balance = await authApi.getBalance();
   * console.log(`余额: ${balance.amount} 积分`);
   * ```
   */
  async getBalance(): Promise<BalanceResponse> {
    const response = await apiClient.get<BalanceResponse>('/billing/balance', {
      requireAuth: true,
    });

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '获取余额失败', 'BALANCE_FETCH_FAILED');
    }

    return response.data;
  },

  /**
   * 登出
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout', undefined, { requireAuth: true });
    } catch (error) {
      // 登出失败不抛出异常，本地状态已清除
      if (apiClient.interceptor) {
        console.error('登出请求失败:', error);
      }
    }
  },

  /**
   * 验证令牌有效性
   */
  async verifyToken(): Promise<boolean> {
    try {
      const response = await apiClient.get('/auth/verify', { requireAuth: true });
      return response.success;
    } catch (error) {
      return false;
    }
  },
};
