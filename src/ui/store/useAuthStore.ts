import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getLocaleFromLanguage } from '@/ui/i18n/config';

/**
 * 认证提供者类型
 */
export type AuthProvider = 'email' | 'google' | 'github';

/**
 * 用户信息类型
 */
export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  provider?: AuthProvider;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 余额信息类型
 */
export interface Balance {
  amount: number;
  currency: string;
  updatedAt: number;
}

/**
 * 新手奖励信息
 */
export interface WelcomeBonus {
  amount: number;
  currency: string;
  label: string;
  grantedAt: number;
}

/**
 * 认证错误类型
 */
export interface AuthError {
  code: string;
  message: string;
}

/**
 * 认证状态接口
 */
interface AuthState {
  // 状态
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  balance: Balance | null;
  welcomeBonus: WelcomeBonus | null;
  error: AuthError | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;

  // 操作
  restoreSession: (payload: { accessToken: string; refreshToken?: string | null; expiresAt?: number | null; user?: User | null }) => void;
  login: (accessToken: string, refreshToken?: string, expiresIn?: number) => Promise<void>;

  logout: () => void;
  refresh: () => Promise<void>;
  fetchBalance: (forceRefresh?: boolean) => Promise<void>;
  setWelcomeBonus: (bonus: WelcomeBonus | null) => void;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: AuthError | null) => void;
  clearError: () => void;
  updateBalance: (balance: Balance) => void;
  isTokenExpired: () => boolean;
}

/**
 * 默认余额
 */
const DEFAULT_BALANCE: Balance = {
  amount: 0,
  currency: 'CNY',
  updatedAt: Date.now(),
};

/**
 * 创建认证状态管理 Store
 * 使用 zustand 的 persist 中间件持久化部分状态
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // 初始状态
      user: null,
      isAuthenticated: false,
      isLoading: false,
      balance: null,
      welcomeBonus: null,
      error: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,

      restoreSession: ({ accessToken, refreshToken, expiresAt, user }) => {
        set({
          isAuthenticated: true,
          isLoading: false,
          error: null,
          accessToken,
          refreshToken: refreshToken ?? null,
          tokenExpiresAt: expiresAt ?? null,
          ...(user !== undefined ? { user } : {}),
        });
      },

      /**
       * 登录操作
       * @param accessToken - 访问令牌
       * @param refreshToken - 刷新令牌（可选）
       * @param expiresIn - 令牌过期时间（秒，可选，默认 1 小时）
       */
      login: async (accessToken: string, refreshToken?: string, expiresIn: number = 3600) => {
        set({ isLoading: true, error: null });

        try {
          // 计算令牌过期时间
          const tokenExpiresAt = Date.now() + expiresIn * 1000;

          // 先保存令牌
          set({
            isAuthenticated: true,
            accessToken,
            refreshToken: refreshToken ?? null,
            tokenExpiresAt,
          });

          // 同步 token 到 Electron 主进程 secure-storage
          // 这样 IPC 调用（如充值）才能在主进程中获取到认证凭据
          try {
            await window.electron?.auth?.syncTokens?.({ accessToken, refreshToken: refreshToken ?? undefined });
            await window.electron?.sync?.setAccessToken?.(accessToken);
          } catch {
            // Electron IPC 不可用时忽略（如 web 环境）
          }

          // 通过 API 获取用户信息
          try {
            const { authApi } = await import('@/ui/lib/auth-api');
            const userInfo = await authApi.getUserInfo();

            set({
              user: userInfo,
              isLoading: false,
              error: null,
            });

            // 登录成功后获取余额
            get().fetchBalance();
          } catch (error) {
            // 如果无法获取用户信息，仅保存令牌
            console.warn('[useAuthStore] Failed to fetch user info:', error);
            set({
              isLoading: false,
              error: null,
            });
          }
        } catch (error) {
          const authError: AuthError = {
            code: 'LOGIN_FAILED',
            message: error instanceof Error ? error.message : 'Login failed',
          };
          set({
            isLoading: false,
            error: authError,
            isAuthenticated: false,
            user: null,
            accessToken: null,
            refreshToken: null,
            tokenExpiresAt: null,
          });
          throw error;
        }
      },

      /**
       * 登出操作
       */
      logout: () => {
        // 清除所有认证状态
        set({
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

        // 通知主进程清除令牌(如果 IPC 可用)
        window.electron?.auth?.logout?.();
        window.electron?.sync?.setAccessToken?.(null);
      },

      /**
       * 刷新认证状态
       * 尝试使用 refreshToken 获取新的 accessToken
       */
      refresh: async () => {
        const state = get();

        // 如果没有刷新令牌，无法刷新
        if (!state.refreshToken) {
          return;
        }

        set({ isLoading: true });

        try {
          // 使用 API 刷新令牌
          const { authApi } = await import('@/ui/lib/auth-api');
          const result = await authApi.refreshToken(state.refreshToken);

          if (result?.accessToken) {
            const tokenExpiresAt = Date.now() + (result.expiresIn ?? 3600) * 1000;

            set({
              accessToken: result.accessToken,
              refreshToken: result.refreshToken ?? state.refreshToken,
              tokenExpiresAt,
              isLoading: false,
              error: null,
            });

            // 同步刷新后的 token 到 Electron 主进程
            try {
              await window.electron?.auth?.syncTokens?.({
                accessToken: result.accessToken,
                refreshToken: result.refreshToken ?? state.refreshToken ?? undefined,
              });
              await window.electron?.sync?.setAccessToken?.(result.accessToken);
            } catch {
              // Electron IPC 不可用时忽略
            }

            // 刷新用户信息
            try {
              const userInfo = await authApi.getUserInfo();
              if (userInfo) {
                set({ user: userInfo });
              }
            } catch {
              // 获取用户信息失败不影响令牌刷新
            }
          } else {
            // 刷新失败，执行登出
            get().logout();
          }
        } catch (error) {
          const authError: AuthError = {
            code: 'REFRESH_FAILED',
            message: error instanceof Error ? error.message : 'Token refresh failed',
          };
          set({ isLoading: false, error: authError });
          // 刷新失败，执行登出
          get().logout();
        }
      },

      /**
       * 获取余额信息
       */
      fetchBalance: async (forceRefresh?: boolean) => {
        const state = get();

        // 未认证时不获取余额
        if (!state.isAuthenticated || !state.accessToken) {
          return;
        }

        try {
          // 通过计费 API 获取余额
          const result = await window.electron?.billing?.getBalance?.(forceRefresh);

          if (result?.success && result.data) {
            // API 返回的 balance 是字符串类型,需要转换为数字
            const balanceAmount = parseFloat(result.data.balance || '0');
            set({
              balance: {
                amount: balanceAmount,
                currency: result.data.currency || 'CNY',
                updatedAt: Date.now(),
              },
            });
          } else {
            console.error('[useAuthStore] Failed to fetch balance:', result?.error);
            // 使用默认值
            set({
              balance: { ...DEFAULT_BALANCE, updatedAt: Date.now() },
            });
          }
        } catch (error) {
          console.error('[useAuthStore] Error fetching balance:', error);
          // 余额获取失败不影响认证状态，仅使用默认值
          set({
            balance: { ...DEFAULT_BALANCE, updatedAt: Date.now() },
          });
        }
      },

      /**
       * 设置用户信息
       */
      setUser: (user: User | null) => {
        set({ user, isAuthenticated: user !== null });
      },

      /**
       * 设置加载状态
       */
      setLoading: (isLoading: boolean) => {
        set({ isLoading });
      },

      /**
       * 设置错误信息
       */
      setError: (error: AuthError | null) => {
        set({ error });
      },

      /**
       * 清除错误信息
       */
      clearError: () => {
        set({ error: null });
      },

      /**
       * 更新余额
       */
      updateBalance: (balance: Balance) => {
        set({ balance });
      },

      /**
       * 设置新手奖励信息
       */
      setWelcomeBonus: (welcomeBonus: WelcomeBonus | null) => {
        set({ welcomeBonus });
      },

      /**
       * 检查令牌是否过期
       */
      isTokenExpired: () => {
        const { tokenExpiresAt } = get();
        if (!tokenExpiresAt) return true;
        // 提前 5 分钟认为过期，以便有时间刷新
        return Date.now() > tokenExpiresAt - 5 * 60 * 1000;
      },
    }),
    {
      name: 'auth-storage',
      version: 2,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<AuthState>;
        return {
          user: state.user ?? null,
          welcomeBonus: state.welcomeBonus ?? null,
        };
      },
      partialize: (state) => ({
        user: state.user,
        welcomeBonus: state.welcomeBonus,
      }),
    }
  )
);

/**
 * 格式化余额显示（积分形式）
 * @param balance - 余额对象
 * @returns 格式化后的字符串，如 "10.50 积分"
 */
export function formatBalance(balance: Balance | null): string {
  if (!balance) return '--';

  const formatter = new Intl.NumberFormat(getLocaleFromLanguage(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const label = getCreditsLabel();
  return `${formatter.format(balance.amount)} ${label}`;
}

/**
 * 根据当前语言获取"积分"标签
 */
export function getCreditsLabel(): string {
  const lang = getLocaleFromLanguage();
  if (lang.startsWith('ja')) return 'クレジット';
  if (lang.startsWith('zh-TW') || lang.startsWith('zh-Hant')) return '積分';
  if (lang.startsWith('zh')) return '积分';
  return 'credits';
}
