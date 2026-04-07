import { apiClient } from './client';
import { ApiError } from './error';
import type { PaginationParams, TimeRangeParams } from './types';
import type {
  UsageRecord,
  Transaction,
  RechargeOrder,
  RechargeStatus,
  UsageSummary,
  Pagination,
} from '@/ui/store/useBillingStore';

/**
 * 充值请求参数
 */
export interface CreateRechargeRequest {
  amount: number;
  channel: 'stripe' | 'xunhu_wechat' | 'xunhu_alipay';
  currency?: string;
}

/**
 * 充值响应
 */
export interface CreateRechargeResponse {
  order: RechargeOrder;
}

/**
 * 使用记录查询参数
 */
export interface GetUsageParams extends PaginationParams, TimeRangeParams {
  model?: string;
  sessionId?: string;
}

/**
 * 使用记录响应
 */
export interface GetUsageResponse {
  records: UsageRecord[];
  summary: UsageSummary;
  pagination: Pagination;
}

/**
 * 交易记录查询参数
 */
export interface GetTransactionsParams extends PaginationParams, TimeRangeParams {
  type?: 'deposit' | 'usage' | 'refund' | 'bonus';
}

/**
 * 交易记录响应
 */
export interface GetTransactionsResponse {
  records: Transaction[];
  pagination: Pagination;
}

/**
 * 支付状态查询响应
 */
export interface PaymentStatusResponse {
  status: RechargeStatus;
  order: RechargeOrder;
}

/**
 * 计费 API
 */
export const billingApi = {
  /**
   * 创建充值订单
   *
   * @example
   * ```ts
   * const order = await billingApi.createRecharge({
   *   amount: 5000, // 50 积分（单位：分）
   *   channel: 'xunhu_wechat'
   * });
   * console.log(order.qrCodeUrl);
   * ```
   */
  async createRecharge(params: CreateRechargeRequest): Promise<RechargeOrder> {
    const response = await apiClient.post<CreateRechargeResponse>(
      '/billing/recharge',
      params,
      { requireAuth: true }
    );

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '创建充值订单失败', 'CREATE_RECHARGE_FAILED');
    }

    return response.data.order;
  },

  /**
   * 查询支付状态
   *
   * @example
   * ```ts
   * const status = await billingApi.checkPaymentStatus('order_123');
   * if (status === 'paid') {
   *   console.log('支付成功');
   * }
   * ```
   */
  async checkPaymentStatus(orderId: string): Promise<RechargeStatus> {
    const response = await apiClient.get<PaymentStatusResponse>(
      `/billing/recharge/${orderId}/status`,
      { requireAuth: true }
    );

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '查询支付状态失败', 'CHECK_PAYMENT_FAILED');
    }

    return response.data.status;
  },

  /**
   * 获取用户余额
   */
  async getBalance(): Promise<{ amount: number; currency: string }> {
    const response = await apiClient.get<{ amount: number; currency: string }>(
      '/billing/balance',
      { requireAuth: true }
    );

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '获取余额失败', 'GET_BALANCE_FAILED');
    }

    return response.data;
  },

  /**
   * 获取使用记录
   *
   * @example
   * ```ts
   * const result = await billingApi.getUsage({
   *   page: 1,
   *   pageSize: 20,
   *   model: 'claude-sonnet-4-5',
   *   startTime: Date.now() - 30 * 24 * 60 * 60 * 1000 // 最近 30 天
   * });
   * console.log(result.summary.totalCost);
   * ```
   */
  async getUsage(_params?: GetUsageParams): Promise<GetUsageResponse> {
    const response = await apiClient.get<GetUsageResponse>('/billing/usage', {
      requireAuth: true,
      // 将参数转换为查询字符串
    });

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '获取使用记录失败', 'GET_USAGE_FAILED');
    }

    return response.data;
  },

  /**
   * 获取交易记录
   *
   * @example
   * ```ts
   * const result = await billingApi.getTransactions({
   *   page: 1,
   *   pageSize: 20,
   *   type: 'deposit'
   * });
   * console.log(result.records);
   * ```
   */
  async getTransactions(_params?: GetTransactionsParams): Promise<GetTransactionsResponse> {
    const response = await apiClient.get<GetTransactionsResponse>('/billing/transactions', {
      requireAuth: true,
    });

    if (!response.success || !response.data) {
      throw new ApiError(400, response.error || '获取交易记录失败', 'GET_TRANSACTIONS_FAILED');
    }

    return response.data;
  },

  /**
   * 取消充值订单
   */
  async cancelRecharge(orderId: string): Promise<void> {
    const response = await apiClient.post(
      `/billing/recharge/${orderId}/cancel`,
      undefined,
      { requireAuth: true }
    );

    if (!response.success) {
      throw new ApiError(400, response.error || '取消充值订单失败', 'CANCEL_RECHARGE_FAILED');
    }
  },
};
