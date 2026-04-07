/**
 * 计费系统类型定义
 * 从 src/electron/types/billing.ts 提取
 */

export interface BillingBalance {
  balance: string;
  currency: string;
  totalDeposited: string;
  totalSpent: string;
}

export interface RechargeOptions {
  amount: number;
  method: 'stripe' | 'xunhupay';
  currency?: string;
  paymentType?: 'wechat' | 'alipay';
  returnUrl?: string;
}

export interface RechargeResult {
  orderId: string;
  method: 'stripe' | 'xunhupay';
  url: string;
  qrcodeUrl?: string;
}

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

export interface RechargeStatusResult {
  orderId: string;
  status: RechargeStatus;
  amount?: number;
  currency?: string;
  paidAt?: string;
  paymentMethod: 'stripe' | 'xunhupay';
  transactionId?: string;
}

export interface UsageRecord {
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
  quotaUsed?: number;
  balanceCreditsConsumed?: number;
}

export interface UsageHistoryParams {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  model?: string;
}

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

export interface UsageStatsParams {
  startDate?: string;
  endDate?: string;
}

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

export interface PricingInfo {
  multiplier: number;
  models: Record<string, {
    inputPerMillion: number;
    outputPerMillion: number;
  }>;
  currency: string;
  note: string;
}

export interface ExportUsageParams {
  format: 'csv' | 'json';
  fileName?: string;
  startDate?: string;
  endDate?: string;
  model?: string;
}
