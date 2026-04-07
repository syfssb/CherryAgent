/**
 * 计费系统 IPC 处理器
 *
 * 功能：
 * 1. 获取用户余额
 * 2. 发起充值（Stripe 和虎皮椒）
 * 3. 查询充值状态
 * 4. 获取使用记录和统计
 * 5. 导出消费记录
 *
 * 实现方式：
 * 委托给 @cherry-agent/core 的 BillingService，
 * 通过 DI 适配器注入 Electron 平台依赖。
 */

import { shell, dialog } from 'electron';
import { BillingService } from '@cherry-agent/core';
import { getApiBaseUrl } from './runtime-config.js';
import type {
  BillingHandlerDeps,
} from '@cherry-agent/core';
import type {
  IShellAdapter,
  IDialogAdapter,
  IAuthCredentialProvider,
  BillingBalance,
  RechargeResult,
  RechargeStatusResult,
  UsageRecord,
  UsageHistoryParams,
  UsageStatsParams,
  UsageStats,
  TransactionRecord,
  PricingInfo,
  ExportUsageParams,
} from '@cherry-agent/shared';

// ==================== Electron 平台 DI 适配器 ====================

/**
 * Electron Shell 适配器
 * 将 IShellAdapter 接口委托给 Electron 的 shell 模块
 */
class ElectronShellAdapter implements IShellAdapter {
  async openExternal(url: string): Promise<void> {
    await shell.openExternal(url);
  }

  showItemInFolder(fullPath: string): void {
    shell.showItemInFolder(fullPath);
  }
}

/**
 * Electron Dialog 适配器
 * 将 IDialogAdapter 接口委托给 Electron 的 dialog 模块
 */
class ElectronDialogAdapter implements IDialogAdapter {
  async showSaveDialog(options: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePath?: string }> {
    return dialog.showSaveDialog(options);
  }

  async showOpenDialog(options: {
    title?: string;
    defaultPath?: string;
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }> {
    return dialog.showOpenDialog(options);
  }

  async showMessageBox(options: {
    type?: 'none' | 'info' | 'error' | 'question' | 'warning';
    title?: string;
    message: string;
    detail?: string;
    buttons?: string[];
  }): Promise<{ response: number }> {
    return dialog.showMessageBox(options);
  }
}

/**
 * Electron 认证凭据提供者
 * 将 IAuthCredentialProvider 接口委托给 auth-service 模块
 */
class ElectronAuthCredentialProvider implements IAuthCredentialProvider {
  async getAccessToken(): Promise<string | null> {
    try {
      const { getStoredCredentials } = await import('./auth-service.js');
      const credentials = getStoredCredentials();
      return credentials?.accessToken || null;
    } catch (error) {
      console.error('[Billing] Failed to get access token:', error);
      return null;
    }
  }

  async getStoredCredentials(): Promise<{ accessToken: string; refreshToken?: string } | null> {
    try {
      const { getStoredCredentials } = await import('./auth-service.js');
      const credentials = getStoredCredentials();
      if (!credentials) {
        return null;
      }
      return {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
      };
    } catch (error) {
      console.error('[Billing] Failed to get stored credentials:', error);
      return null;
    }
  }
}

// ==================== 单例 BillingService 实例 ====================

let billingServiceInstance: BillingService | null = null;

/**
 * 获取或创建 BillingService 单例
 * 使用懒初始化，确保 Electron 模块在调用时已就绪
 */
function getBillingService(): BillingService {
  if (!billingServiceInstance) {
    const deps: BillingHandlerDeps = {
      authProvider: new ElectronAuthCredentialProvider(),
      shellAdapter: new ElectronShellAdapter(),
      dialogAdapter: new ElectronDialogAdapter(),
      apiBaseUrl: getApiBaseUrl(),
    };
    billingServiceInstance = new BillingService(deps);
  }
  return billingServiceInstance;
}

// ==================== 导出函数（保持原有签名） ====================

/**
 * 清除余额缓存
 */
export function clearBalanceCache(): void {
  getBillingService().clearBalanceCache();
}

/**
 * 获取用户余额
 */
export async function getBalance(
  forceRefresh = false
): Promise<{ success: boolean; data?: BillingBalance; error?: string }> {
  return getBillingService().getBalance(forceRefresh);
}

/**
 * 发起充值
 */
export async function recharge(
  amount: number,
  method: 'stripe' | 'xunhupay',
  options?: {
    currency?: string;
    paymentType?: 'wechat' | 'alipay';
    returnUrl?: string;
    discountCode?: string;
  }
): Promise<{ success: boolean; data?: RechargeResult; error?: string }> {
  return getBillingService().recharge(amount, method, options);
}

/**
 * 查询充值状态
 */
export async function getRechargeStatus(
  orderId: string
): Promise<{ success: boolean; data?: RechargeStatusResult; error?: string }> {
  return getBillingService().getRechargeStatus(orderId);
}

/**
 * 获取使用记录
 */
export async function getUsageHistory(
  params: UsageHistoryParams = {}
): Promise<{ success: boolean; data?: {
  records: UsageRecord[];
  total: number;
  meta?: unknown;
  summary?: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    currency: string;
  };
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}; error?: string }> {
  return getBillingService().getUsageHistory(params);
}

/**
 * 获取使用统计
 */
export async function getUsageStats(
  params: UsageStatsParams = {}
): Promise<{ success: boolean; data?: UsageStats; error?: string }> {
  return getBillingService().getUsageStats(params);
}

/**
 * 获取余额变动记录
 */
export async function getTransactionHistory(
  params: { page?: number; limit?: number; type?: string } = {}
): Promise<{ success: boolean; data?: {
  records: TransactionRecord[];
  total: number;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}; error?: string }> {
  return getBillingService().getTransactionHistory(params);
}

/**
 * 获取定价信息
 */
export async function getPricing(): Promise<{ success: boolean; data?: PricingInfo; error?: string }> {
  return getBillingService().getPricing();
}

/**
 * 导出使用记录
 */
export async function exportUsage(
  params: ExportUsageParams
): Promise<{ success: boolean; data?: { filePath: string }; error?: string }> {
  return getBillingService().exportUsage(params);
}

/**
 * 轮询充值状态
 * 返回一个清理函数
 */
export function pollRechargeStatus(
  orderId: string,
  onStatusChange: (status: RechargeStatusResult) => void,
  options: {
    interval?: number;
    maxAttempts?: number;
  } = {}
): () => void {
  return getBillingService().pollRechargeStatus(orderId, onStatusChange, options);
}
