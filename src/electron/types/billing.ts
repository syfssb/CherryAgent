/**
 * 计费系统类型定义
 * 与 API 服务器返回的格式匹配
 */

/**
 * 用户余额信息
 */
export interface BillingBalance {
  balance: string;
  currency: string;
  totalDeposited: string;
  totalSpent: string;
}

/**
 * 充值选项
 */
export interface RechargeOptions {
  amount: number;
  method: 'stripe' | 'xunhupay';
  currency?: string;
  paymentType?: 'wechat' | 'alipay';
  returnUrl?: string;
}

/**
 * 充值结果
 */
export interface RechargeResult {
  orderId: string;
  method: 'stripe' | 'xunhupay';
  url: string;
  qrcodeUrl?: string;
}

/**
 * 充值状态
 */
export type RechargeStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'needs_review';

/**
 * 充值状态查询结果
 */
export interface RechargeStatusResult {
  orderId: string;
  status: RechargeStatus;
  amount?: number;
  currency?: string;
  paidAt?: string;
  paymentMethod: 'stripe' | 'xunhupay';
  transactionId?: string;
}

/**
 * 使用记录
 */
export interface UsageRecord {
  id: string;
  timestamp?: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  status: string;
  latencyMs: number | null;
  createdAt: string | Date;
  currency?: string;
  quotaUsed?: number;
  balanceCreditsConsumed?: number;
}

/**
 * 使用记录查询参数
 */
export interface UsageHistoryParams {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  model?: string;
}

/**
 * 使用统计
 */
export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: string;
  currency: string;
  byModel: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
  byProvider: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
  period: {
    start: string;
    end: string;
  };
}

/**
 * 使用统计查询参数
 */
export interface UsageStatsParams {
  startDate?: string;
  endDate?: string;
}

/**
 * 余额变动记录
 */
export interface TransactionRecord {
  id: string;
  type: string;
  timestamp?: number;
  amount: number;
  balanceBefore: string;
  balanceAfter: number;
  description: string | null;
  createdAt: string | Date;
  currency?: string;
}

/**
 * 定价信息
 */
export interface PricingInfo {
  multiplier: number;
  models: Record<string, {
    inputPerMillion: number;
    outputPerMillion: number;
  }>;
  currency: string;
  note: string;
}

/**
 * 导出使用记录参数
 */
export interface ExportUsageParams {
  format: 'csv' | 'json';
  fileName?: string;
  startDate?: string;
  endDate?: string;
  model?: string;
}

// ===== 向后兼容的旧类型定义 =====

/**
 * @deprecated 使用 TransactionRecord 替代
 */
export type TransactionType = 'deposit' | 'usage' | 'refund' | 'bonus';

/**
 * @deprecated 使用 TransactionRecord 替代
 */
export interface Transaction {
  id: string;
  timestamp: number;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  currency: string;
  description?: string;
  orderId?: string;
  channel?: 'stripe' | 'xunhu_wechat' | 'xunhu_alipay';
}

/**
 * @deprecated 使用 RechargeResult 替代
 */
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
 * @deprecated 使用 UsageHistoryParams 替代
 */
export interface UsageFilters {
  startTime?: number;
  endTime?: number;
  model?: string;
  page?: number;
  pageSize?: number;
}

/**
 * @deprecated
 */
export interface TransactionFilters {
  startTime?: number;
  endTime?: number;
  type?: TransactionType;
  page?: number;
  pageSize?: number;
}

/**
 * @deprecated 使用 UsageStats 替代
 */
export interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
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
 * @deprecated 使用 BillingBalance 替代
 */
export interface Balance {
  amount: number;
  currency: string;
  updatedAt: number;
}
