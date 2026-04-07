import { create } from 'zustand';
import i18n, { getLocaleFromLanguage } from '@/ui/i18n/config';
import { getCreditsLabel } from '@/ui/store/useAuthStore';

// 本地类型定义（与 vite-env.d.ts 全局声明保持一致）
export interface BillingUsageRecord {
  id: string;
  timestamp?: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cost: number;
  status: string;
  latencyMs: number | null;
  createdAt: string | Date;
  currency?: string;
  sessionId?: string;
  quotaUsed?: number;
  balanceCreditsConsumed?: number;
}

export interface BillingTransactionRecord {
  id: string;
  type: string;
  timestamp?: number;
  amount: number;
  balanceBefore: string;
  balanceAfter: number;
  description: string | null;
  createdAt: string | Date;
  currency?: string;
  channel?: 'stripe' | 'xunhu_wechat' | 'xunhu_alipay';
}

export interface RechargeResult {
  orderId: string;
  method: 'stripe' | 'xunhupay';
  url: string;
  qrcodeUrl?: string;
  paymentUrl?: string;
}

export type RechargeStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'paid'
  | 'expired'
  | 'refunded'
  | 'needs_review';

export type UsageRecord = BillingUsageRecord;
export type TransactionType = 'deposit' | 'usage' | 'refund' | 'bonus';
export type Transaction = BillingTransactionRecord;

export interface RechargeOrder {
  id: string;
  amount: number;
  currency: string;
  channel: 'stripe' | 'xunhu_wechat' | 'xunhu_alipay';
  status: RechargeStatus;
  createdAt: number;
  expiresAt: number;
  paymentUrl?: string;
  qrCodeUrl?: string;
}

/**
 * 期卡信息
 */
export interface PeriodCard {
  id: string;
  status: string;
  planName: string;
  periodType: string;
  periodDays: number;
  dailyCredits: number;
  dailyQuotaRemaining: number;
  quotaResetDate: string | null;
  startsAt: string;
  expiresAt: string;
  quotaMode: 'daily' | 'total';
  totalCredits: number;
  totalRemaining: number;
}

/**
 * 期卡套餐
 */
export interface PeriodCardPlan {
  id: string;
  name: string;
  description: string | null;
  periodType: string;
  periodDays: number;
  dailyCredits: number;
  priceCents: number;
  priceYuan: string;
  currency: string;
  quotaMode: 'daily' | 'total';
  totalCredits: number;
}

/**
 * 使用记录筛选条件
 */
export interface UsageFilters {
  /** 开始时间戳 */
  startTime?: number;
  /** 结束时间戳 */
  endTime?: number;
  /** 模型名称 */
  model?: string;
  /** 页码 */
  page?: number;
  /** 每页数量 */
  pageSize?: number;
}

/**
 * 交易记录筛选条件
 */
export interface TransactionFilters {
  /** 开始时间戳 */
  startTime?: number;
  /** 结束时间戳 */
  endTime?: number;
  /** 交易类型 */
  type?: TransactionType;
  /** 页码 */
  page?: number;
  /** 每页数量 */
  pageSize?: number;
}

/**
 * 使用统计摘要
 */
export interface UsageSummary {
  /** 总请求数 */
  totalRequests: number;
  /** 总 Token 数 */
  totalTokens: number;
  /** 总费用（单位：分） */
  totalCost: number;
  /** 货币类型 */
  currency: string;
}

/**
 * 分页信息
 */
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * 计费状态接口
 */
interface BillingState {
  // 使用记录状态
  usageRecords: BillingUsageRecord[];
  usageLoading: boolean;
  usageSummary: UsageSummary | null;
  usagePagination: Pagination | null;

  // 交易记录状态
  transactions: BillingTransactionRecord[];
  transactionsLoading: boolean;
  transactionsPagination: Pagination | null;

  // 充值状态
  currentOrder: (RechargeResult & { status?: RechargeStatus }) | null;
  rechargeLoading: boolean;
  rechargeError: string | null;

  // 期卡状态
  periodCards: PeriodCard[];
  periodCardLoading: boolean;
  periodCardPlans: PeriodCardPlan[];
  periodCardPlansLoading: boolean;

  // 操作
  fetchUsage: (filters?: UsageFilters) => Promise<void>;
  fetchTransactions: (filters?: TransactionFilters) => Promise<void>;
  createRecharge: (amount: number, channel: 'stripe' | 'xunhu_wechat' | 'xunhu_alipay', discountCode?: string) => Promise<RechargeResult & { status?: RechargeStatus }>;
  pollPaymentStatus: (orderId: string) => Promise<RechargeStatus>;
  cancelRecharge: () => void;
  clearRechargeError: () => void;
  fetchPeriodCards: () => Promise<void>;
  /** @deprecated 使用 fetchPeriodCards */
  fetchPeriodCard: () => Promise<void>;
  fetchPeriodCardPlans: () => Promise<void>;
  reset: () => void;
}

/**
 * 默认分页配置
 */
const DEFAULT_PAGE_SIZE = 20;

/**
 * 默认使用统计摘要
 */
const DEFAULT_USAGE_SUMMARY: UsageSummary = {
  totalRequests: 0,
  totalTokens: 0,
  totalCost: 0,
  currency: 'CNY',
};

/**
 * 创建计费状态管理 Store
 */
export const useBillingStore = create<BillingState>()((set, get) => ({
  // 初始状态
  usageRecords: [],
  usageLoading: false,
  usageSummary: null,
  usagePagination: null,

  transactions: [],
  transactionsLoading: false,
  transactionsPagination: null,

  currentOrder: null,
  rechargeLoading: false,
  rechargeError: null,

  periodCards: [],
  periodCardLoading: false,
  periodCardPlans: [],
  periodCardPlansLoading: false,

  /**
   * 获取使用记录
   */
  fetchUsage: async (filters?: UsageFilters) => {
    set({ usageLoading: true });

    try {
      const params = {
        startDate: filters?.startTime ? new Date(filters.startTime).toISOString() : undefined,
        endDate: filters?.endTime ? new Date(filters.endTime).toISOString() : undefined,
        model: filters?.model,
        page: filters?.page ?? 1,
        limit: filters?.pageSize ?? DEFAULT_PAGE_SIZE,
      };

      // 通过 IPC 获取使用记录
      const result = await window.electron?.billing?.getUsageHistory?.(params);

      if (result?.success && result.data) {
        set({
          usageRecords: (result.data.records ?? []) as BillingUsageRecord[],
          usageSummary: (result.data as any).summary ?? DEFAULT_USAGE_SUMMARY,
          usagePagination: (result.data as any).pagination ?? null,
          usageLoading: false,
        });
      } else {
        console.error('[useBillingStore] Failed to fetch usage records:', result?.error);
        set({
          usageRecords: [],
          usageSummary: DEFAULT_USAGE_SUMMARY,
          usagePagination: null,
          usageLoading: false,
        });
      }
    } catch (error) {
      console.error('[useBillingStore] Error fetching usage records:', error);
      set({
        usageRecords: [],
        usageSummary: DEFAULT_USAGE_SUMMARY,
        usagePagination: null,
        usageLoading: false,
      });
      throw error;
    }
  },

  /**
   * 获取交易记录
   */
  fetchTransactions: async (filters?: TransactionFilters) => {
    set({ transactionsLoading: true });

    try {
      const params = {
        startDate: filters?.startTime ? new Date(filters.startTime).toISOString() : undefined,
        endDate: filters?.endTime ? new Date(filters.endTime).toISOString() : undefined,
        type: filters?.type,
        page: filters?.page ?? 1,
        limit: filters?.pageSize ?? DEFAULT_PAGE_SIZE,
      };

      // 通过 IPC 获取交易记录
      const result = await window.electron?.billing?.getTransactionHistory?.(params);

      if (result?.success && result.data) {
        set({
          transactions: (result.data.records ?? []) as BillingTransactionRecord[],
          transactionsPagination: (result.data as any).pagination ?? null,
          transactionsLoading: false,
        });
      } else {
        console.error('[useBillingStore] Failed to fetch transactions:', result?.error);
        set({
          transactions: [],
          transactionsPagination: null,
          transactionsLoading: false,
        });
      }
    } catch (error) {
      console.error('[useBillingStore] Error fetching transactions:', error);
      set({
        transactions: [],
        transactionsPagination: null,
        transactionsLoading: false,
      });
      throw error;
    }
  },

  /**
   * 创建充值订单
   */
  createRecharge: async (amount: number, channel: 'stripe' | 'xunhu_wechat' | 'xunhu_alipay', discountCode?: string) => {
    set({ rechargeLoading: true, rechargeError: null });

    try {
      // 将 channel 映射到 method 和 options
      let method: 'stripe' | 'xunhupay';
      let options: { paymentType?: 'wechat' | 'alipay'; currency?: string; discountCode?: string } | undefined;

      if (channel === 'stripe') {
        method = 'stripe';
        options = discountCode ? { discountCode } : undefined;
      } else if (channel === 'xunhu_wechat') {
        method = 'xunhupay';
        options = { paymentType: 'wechat', ...(discountCode ? { discountCode } : {}) };
      } else if (channel === 'xunhu_alipay') {
        method = 'xunhupay';
        options = { paymentType: 'alipay', ...(discountCode ? { discountCode } : {}) };
      } else {
        throw new Error(`Unsupported channel: ${channel}`);
      }

      // 通过 IPC 创建充值订单
      const result = await window.electron?.billing?.recharge?.(amount, method, options);

      if (!result?.success || !result.data) {
        const rawError = result?.error;
        const errorMessage = typeof rawError === 'string'
          ? rawError
          : (rawError as any)?.message || 'Failed to create recharge order';
        set({
          rechargeLoading: false,
          rechargeError: errorMessage,
        });
        throw new Error(errorMessage);
      }

      const order = result.data;
      set({
        currentOrder: order as (RechargeResult & { status?: RechargeStatus }),
        rechargeLoading: false,
      });

      return order as (RechargeResult & { status?: RechargeStatus });
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : (typeof error === 'string' ? error : (error as any)?.message || '充值请求失败');
      set({
        rechargeLoading: false,
        rechargeError: errorMessage,
      });
      throw error;
    }
  },

  /**
   * 轮询支付状态
   */
  pollPaymentStatus: async (orderId: string) => {
    try {
      const result = await window.electron?.billing?.getRechargeStatus?.(orderId);

      if (!result?.success || !result.data) {
        return 'pending' as RechargeStatus;
      }

      const status = result.data.status;

      // 更新当前订单状态
      const currentOrder = get().currentOrder;
      if (currentOrder && currentOrder.orderId === orderId) {
        set({
          currentOrder: { ...currentOrder, status },
        });
      }

      return status as RechargeStatus;
    } catch (error) {
      console.error('[useBillingStore] Error polling payment status:', error);
      return 'pending' as RechargeStatus;
    }
  },

  /**
   * 获取当前用户所有期卡信息
   */
  fetchPeriodCards: async () => {
    set({ periodCardLoading: true });
    try {
      const result = await window.electron?.billing?.getPeriodCard?.();
      if (result?.success) {
        const data = result.data;
        // 后端现在返回数组，兼容旧版返回单对象/null
        const cards: PeriodCard[] = Array.isArray(data) ? data : (data ? [data] : []);
        set({ periodCards: cards, periodCardLoading: false });
      } else {
        console.error('[useBillingStore] Failed to fetch period cards:', result?.error);
        set({ periodCards: [], periodCardLoading: false });
      }
    } catch (error) {
      console.error('[useBillingStore] Error fetching period cards:', error);
      set({ periodCards: [], periodCardLoading: false });
    }
  },

  /** @deprecated 使用 fetchPeriodCards */
  fetchPeriodCard: async () => {
    return get().fetchPeriodCards();
  },

  /**
   * 获取可用期卡套餐列表
   */
  fetchPeriodCardPlans: async () => {
    set({ periodCardPlansLoading: true });
    try {
      const result = await window.electron?.billing?.getPeriodCardPlans?.();
      if (result?.success && result.data) {
        set({ periodCardPlans: result.data as PeriodCardPlan[], periodCardPlansLoading: false });
      } else {
        console.error('[useBillingStore] Failed to fetch period card plans:', result?.error);
        set({ periodCardPlans: [], periodCardPlansLoading: false });
      }
    } catch (error) {
      console.error('[useBillingStore] Error fetching period card plans:', error);
      set({ periodCardPlans: [], periodCardPlansLoading: false });
    }
  },

  /**
   * 取消充值
   */
  cancelRecharge: () => {
    set({
      currentOrder: null,
      rechargeError: null,
    });
  },

  /**
   * 清除充值错误
   */
  clearRechargeError: () => {
    set({ rechargeError: null });
  },

  /**
   * 重置状态
   */
  reset: () => {
    set({
      usageRecords: [],
      usageLoading: false,
      usageSummary: null,
      usagePagination: null,
      transactions: [],
      transactionsLoading: false,
      transactionsPagination: null,
      currentOrder: null,
      rechargeLoading: false,
      rechargeError: null,
      periodCards: [],
      periodCardLoading: false,
      periodCardPlans: [],
      periodCardPlansLoading: false,
    });
  },
}));

/**
 * 格式化金额显示（积分形式）
 * @param amount - 金额（单位：分）
 * @param _currency - 货币类型（已废弃，保留参数兼容性）
 * @returns 格式化后的字符串，如 "10.50 积分"
 */
export function formatAmount(amount: number, _currency: string = 'CNY'): string {
  const value = amount / 100; // 分转积分
  const formatter = new Intl.NumberFormat(getLocaleFromLanguage(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const label = getCreditsLabel();
  return `${formatter.format(value)} ${label}`;
}

/**
 * 格式化人民币金额
 * @param amountCents - 金额（单位：分）
 * @returns 格式化后的字符串，如 "¥10.50"
 */
export function formatRMB(amountCents: number): string {
  const yuan = amountCents / 100;
  return `¥${yuan.toFixed(2)}`;
}

/**
 * 格式化 Token 数量
 * @param tokens - Token 数量
 * @returns 格式化后的字符串
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * 格式化时间戳
 * @param timestamp - 时间戳（毫秒）
 * @param includeTime - 是否包含时间
 * @returns 格式化后的字符串
 */
export function formatTimestamp(timestamp: number, includeTime: boolean = true): string {
  const date = new Date(timestamp);
  const locale = getLocaleFromLanguage();
  const dateStr = date.toLocaleDateString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  if (!includeTime) {
    return dateStr;
  }

  const timeStr = date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return `${dateStr} ${timeStr}`;
}

/**
 * 获取交易类型的显示文本
 * @param type - 交易类型
 * @returns 显示文本
 */
export function getTransactionTypeLabel(type: TransactionType): string {
  const labels: Record<TransactionType, string> = {
    deposit: i18n.t('payment.transactionType.recharge', '充值'),
    usage: i18n.t('payment.transactionType.consumption', '消费'),
    refund: i18n.t('payment.transactionType.refund', '退款'),
    bonus: i18n.t('payment.transactionType.gift', '赠送'),
  };
  return labels[type] ?? type;
}

/**
 * 获取交易类型的颜色样式
 * @param type - 交易类型
 * @returns CSS 类名
 */
export function getTransactionTypeColor(type: TransactionType): string {
  const colors: Record<TransactionType, string> = {
    deposit: 'text-success',
    usage: 'text-error',
    refund: 'text-accent',
    bonus: 'text-warning',
  };
  return colors[type] ?? 'text-muted';
}
