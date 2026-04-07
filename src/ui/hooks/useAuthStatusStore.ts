import { create } from 'zustand';

/**
 * 认证状态
 */
export interface AuthStatusState {
  /** 是否正在认证 */
  isAuthenticating: boolean;
  /** 认证输出信息 */
  output: string[];
  /** 错误信息 */
  error?: string;
  /** 最后更新时间 */
  lastUpdated?: number;
}

/**
 * 认证状态 Store 接口
 */
interface AuthStatusStore {
  /** 当前认证状态 */
  status: AuthStatusState;
  /** 更新认证状态 */
  updateStatus: (updates: Partial<AuthStatusState>) => void;
  /** 重置认证状态 */
  resetStatus: () => void;
  /** 添加输出信息 */
  addOutput: (message: string) => void;
}

const initialState: AuthStatusState = {
  isAuthenticating: false,
  output: [],
  error: undefined,
  lastUpdated: undefined,
};

/**
 * 认证状态管理 Store
 *
 * 用于跟踪和管理 SDK 认证过程的状态
 */
export const useAuthStatusStore = create<AuthStatusStore>((set) => ({
  status: initialState,

  updateStatus: (updates) => set((state) => ({
    status: {
      ...state.status,
      ...updates,
      lastUpdated: Date.now(),
    }
  })),

  resetStatus: () => set({ status: { ...initialState } }),

  addOutput: (message) => set((state) => ({
    status: {
      ...state.status,
      output: [...state.status.output, message],
      lastUpdated: Date.now(),
    }
  })),
}));
