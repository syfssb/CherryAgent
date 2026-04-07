const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
    ...options,
  });
  return res.json();
}

export interface RegisterData {
  user: { id: string; email: string; name: string; role: string };
  accessToken: string;
  refreshToken: string;
  apiKey: string;
  balance: string;
  welcomeBonus: string;
  isNewUser: boolean;
}

export async function register(
  email: string,
  password: string,
  name?: string,
  referralCode?: string,
  captchaTicket?: string,
  captchaRandstr?: string,
) {
  return request<RegisterData>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      ...(name ? { name } : {}),
      ...(referralCode ? { referralCode } : {}),
      ...(captchaTicket ? { captchaTicket, captchaRandstr } : {}),
    }),
  });
}

/** 获取验证码公开配置 */
export interface CaptchaConfig {
  captchaEnabled: boolean;
  captchaAppId: string;
}

export async function getCaptchaConfig() {
  return request<CaptchaConfig>('/api/configs/captcha');
}

export async function applyReferralCode(token: string, code: string) {
  return request<{ message: string }>('/api/referrals/apply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
  });
}

export interface VersionInfo {
  updateAvailable: boolean;
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  releaseDate: string;
}

export async function getLatestVersion(platform: string) {
  return request<VersionInfo>(`/api/admin/versions/latest/check?platform=${platform}&version=0.0.0`);
}

export interface WelcomeCredits {
  credits: number;
  amount: number;
}

export async function getWelcomeCredits() {
  return request<WelcomeCredits>('/api/configs/welcome-credits');
}
