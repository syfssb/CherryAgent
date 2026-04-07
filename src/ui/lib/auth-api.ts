import { apiClient, ApiError } from './api-client';
import type { User } from '@/ui/store/useAuthStore';

/**
 * 登录请求参数
 */
export interface LoginRequest {
  email: string;
  password: string;
  captchaTicket?: string;
  captchaRandstr?: string;
}

/**
 * 注册请求参数
 */
export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  referralCode?: string;
  captchaTicket?: string;
  captchaRandstr?: string;
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
 * 认证 API 服务
 */
export const authApi = {
  /**
   * 邮箱密码登录
   */
  async login(email: string, password: string, captchaTicket?: string, captchaRandstr?: string): Promise<LoginResponse> {
    try {
      const response = await apiClient.post<LoginResponse>(
        '/auth/login/password',
        { email, password, captchaTicket, captchaRandstr },
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        const msg = typeof response.error === 'string'
          ? response.error
          : response.error?.message || '登录失败';
        throw new ApiError(400, msg, response.error?.code);
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '登录请求失败');
    }
  },

  /**
   * 邮箱密码注册
   */
  async register(email: string, password: string, name?: string, referralCode?: string, captchaTicket?: string, captchaRandstr?: string): Promise<{ user: { id: string; email: string; name?: string }; isNewUser: boolean; emailVerificationSent: boolean; message: string }> {
    try {
      const response = await apiClient.post<{ user: { id: string; email: string; name?: string }; isNewUser: boolean; emailVerificationSent: boolean; message: string }>(
        '/auth/register',
        { email, password, name, referralCode, captchaTicket, captchaRandstr },
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        const msg = typeof response.error === 'string'
          ? response.error
          : response.error?.message || '注册失败';
        throw new ApiError(400, msg, response.error?.code);
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '注册请求失败');
    }
  },

  /**
   * OAuth 登录 - 获取授权 URL
   */
  async getOAuthUrl(provider: 'google' | 'github'): Promise<OAuthUrlResponse> {
    try {
      const response = await apiClient.get<OAuthUrlResponse>(
        `/auth/oauth/${provider}`,
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        throw new ApiError(400, response.error || '获取授权 URL 失败');
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '获取授权 URL 失败');
    }
  },

  /**
   * OAuth 回调处理
   */
  async handleOAuthCallback(
    provider: 'google' | 'github',
    code: string,
    state: string
  ): Promise<LoginResponse> {
    try {
      const response = await apiClient.post<LoginResponse>(
        `/auth/oauth/${provider}/callback`,
        { code, state },
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        throw new ApiError(400, response.error || 'OAuth 登录失败');
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, 'OAuth 登录失败');
    }
  },

  /**
   * 刷新访问令牌
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    try {
      const response = await apiClient.post<RefreshTokenResponse>(
        '/auth/refresh',
        { refreshToken },
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        throw new ApiError(401, response.error || '令牌刷新失败');
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '令牌刷新失败');
    }
  },

  /**
   * 获取当前用户信息
   */
  async getUserInfo(): Promise<User> {
    try {
      const response = await apiClient.get<UserInfoResponse>(
        '/auth/me',
        { requireAuth: true }
      );

      if (!response.success || !response.data) {
        throw new ApiError(400, response.error || '获取用户信息失败');
      }

      return response.data.user;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '获取用户信息失败');
    }
  },

  /**
   * 获取用户余额
   */
  async getBalance(): Promise<BalanceResponse> {
    try {
      const response = await apiClient.get<BalanceResponse>(
        '/billing/balance',
        { requireAuth: true }
      );

      if (!response.success || !response.data) {
        throw new ApiError(400, response.error || '获取余额失败');
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '获取余额失败');
    }
  },

  /**
   * 登出
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout', undefined, { requireAuth: true });
    } catch (error) {
      // 登出失败不抛出异常,本地状态已清除
      console.error('登出请求失败:', error);
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

  /**
   * 重新发送邮箱验证邮件
   */
  async sendVerificationEmail(): Promise<{ message: string }> {
    try {
      const response = await apiClient.post<{ message: string }>(
        '/auth/resend-verification',
        undefined,
        { requireAuth: true }
      );

      if (!response.success || !response.data) {
        throw new ApiError(400, response.error || '发送验证邮件失败');
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '发送验证邮件失败');
    }
  },

  /**
   * 通过邮箱重新发送验证邮件（无需认证）
   */
  async resendVerificationByEmail(email: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post<{ message: string }>(
        '/auth/resend-verification-by-email',
        { email },
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        throw new ApiError(400, response.error || '发送验证邮件失败');
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '发送验证邮件失败');
    }
  },

  /**
   * 忘记密码 - 发送重置邮件
   */
  async forgotPassword(email: string, captchaTicket?: string, captchaRandstr?: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post<{ message: string }>(
        '/auth/forgot-password',
        { email, captchaTicket, captchaRandstr },
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        throw new ApiError(400, response.error || '发送重置邮件失败');
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '发送重置邮件失败');
    }
  },

  /**
   * 重置密码
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post<{ message: string }>(
        '/auth/reset-password',
        { token, newPassword },
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        throw new ApiError(400, response.error || '重置密码失败');
      }

      return response.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, '重置密码失败');
    }
  },

  /**
   * 获取法律内容（服务条款 / 隐私政策）
   * 公开接口，无需认证
   */
  async getLegalContent(
    type: 'privacy_policy' | 'terms_of_service',
    lang: string
  ): Promise<string | null> {
    try {
      const response = await apiClient.get<{ content: string }>(
        `/legal/${type}?lang=${encodeURIComponent(lang)}`,
        { requireAuth: false }
      );

      if (!response.success || !response.data) {
        return null;
      }

      return response.data.content ?? null;
    } catch {
      return null;
    }
  },
};
