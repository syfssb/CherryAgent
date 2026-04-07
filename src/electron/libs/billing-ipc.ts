import { ipcMain } from 'electron';
import { getApiOriginBaseUrl } from './runtime-config.js';
import type {
  UsageFilters,
  TransactionFilters,
  UsageRecord,
  Transaction,
  RechargeOrder,
  RechargeStatus,
  UsageSummary,
  Pagination,
} from '../types/billing.js';

function getBillingApiBaseUrl(): string {
  const configured = process.env.BILLING_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  return `${getApiOriginBaseUrl()}/api/v1`;
}

/**
 * 获取认证令牌
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const { getStoredCredentials } = await import('./auth-service.js');
    const creds = getStoredCredentials();
    return creds?.accessToken ?? null;
  } catch (error) {
    console.error('[billing-ipc] Failed to get auth token:', error);
    return null;
  }
}

/**
 * 发起 HTTP 请求
 */
async function fetchAPI<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const token = await getAuthToken();
    if (!token) {
      return {
        success: false,
        error: 'Not authenticated'
      };
    }

    const url = `${getBillingApiBaseUrl()}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: data as T
    };
  } catch (error) {
    console.error('[billing-ipc] API request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed'
    };
  }
}

/**
 * 注册计费相关的 IPC 处理器
 */
export function registerBillingHandlers(): void {
  /**
   * billing:getUsageRecords - 获取使用记录
   */
  ipcMain.handle('billing:getUsageRecords', async (_, filters?: UsageFilters) => {
    try {
      const params = new URLSearchParams();
      if (filters?.startTime) params.append('startTime', filters.startTime.toString());
      if (filters?.endTime) params.append('endTime', filters.endTime.toString());
      if (filters?.model) params.append('model', filters.model);
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.pageSize) params.append('pageSize', filters.pageSize.toString());

      const result = await fetchAPI<{
        records: UsageRecord[];
        summary: UsageSummary;
        pagination: Pagination;
      }>(`/usage?${params.toString()}`);

      return result;
    } catch (error) {
      console.error('[billing-ipc] billing:getUsageRecords failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get usage records'
      };
    }
  });

  /**
   * billing:getTransactions - 获取充值记录（改为查询 payments 表）
   */
  ipcMain.handle('billing:getTransactions', async (_, filters?: TransactionFilters) => {
    try {
      const params = new URLSearchParams();
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.pageSize) params.append('limit', filters.pageSize.toString());
      // type 参数映射为 status（payments 表使用 status 字段）
      if (filters?.type) params.append('status', filters.type);

      const result = await fetchAPI<{
        records: Transaction[];
        pagination: Pagination;
      }>(`/billing/recharges?${params.toString()}`);

      return result;
    } catch (error) {
      console.error('[billing-ipc] billing:getTransactions failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get transactions'
      };
    }
  });

  /**
   * billing:createRechargeOrder - 创建充值订单
   */
  ipcMain.handle(
    'billing:createRechargeOrder',
    async (_, payload: { amount: number; channel: 'stripe' | 'xunhu_wechat' | 'xunhu_alipay' }) => {
      try {
        const result = await fetchAPI<RechargeOrder>('/billing/recharge', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        return result;
      } catch (error) {
        console.error('[billing-ipc] billing:createRechargeOrder failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create recharge order'
        };
      }
    }
  );

  /**
   * billing:checkPaymentStatus - 检查支付状态
   */
  ipcMain.handle('billing:checkPaymentStatus', async (_, orderId: string) => {
    try {
      const result = await fetchAPI<{ status: RechargeStatus }>(`/billing/recharge/${orderId}/status`);

      return result;
    } catch (error) {
      console.error('[billing-ipc] billing:checkPaymentStatus failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check payment status'
      };
    }
  });

  /**
   * billing:getBalance - 获取当前余额
   */
  ipcMain.handle('billing:getBalance', async () => {
    try {
      const result = await fetchAPI<{
        balance: string;
        currency: string;
        totalDeposited: string;
        totalSpent: string;
      }>('/billing/balance');

      return result;
    } catch (error) {
      console.error('[billing-ipc] billing:getBalance failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get balance'
      };
    }
  });

  /**
   * billing:exportUsage - 导出使用记录
   */
  ipcMain.handle('billing:exportUsage', async (_, filters?: UsageFilters) => {
    try {
      const params = new URLSearchParams();
      if (filters?.startTime) params.append('startTime', filters.startTime.toString());
      if (filters?.endTime) params.append('endTime', filters.endTime.toString());
      if (filters?.model) params.append('model', filters.model);

      const result = await fetchAPI<{
        csv: string;
        filename: string;
      }>(`/usage/export?${params.toString()}`);

      return result;
    } catch (error) {
      console.error('[billing-ipc] billing:exportUsage failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export usage'
      };
    }
  });

  /**
   * billing:openExternalUrl - 打开外部链接（Stripe 支付页面等）
   */
  ipcMain.handle('billing:openExternalUrl', async (_, url: string) => {
    try {
      const { shell } = await import('electron');
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('[billing-ipc] billing:openExternalUrl failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open URL'
      };
    }
  });

  console.info('[billing-ipc] Billing handlers registered');
}
