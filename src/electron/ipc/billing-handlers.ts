import { ipcMain, shell } from "electron";
import { getApiBaseUrl } from "../libs/runtime-config.js";

/**
 * 注册计费相关的 IPC 处理器
 */
export function registerBillingHandlers(): void {
  // 防御性移除，避免重复注册导致异常
  const billingChannels = [
    "billing:getBalance",
    "billing:recharge",
    "billing:getRechargeStatus",
    "billing:getPricing",
    "billing:openExternalUrl",
    "billing:getPeriodCard",
    "billing:getPeriodCardPlans",
    "billing:purchasePeriodCard",
  ];
  for (const ch of billingChannels) {
    try { ipcMain.removeHandler(ch); } catch { /* ignore */ }
  }

  // billing:getBalance - 获取用户余额
  ipcMain.handle("billing:getBalance", async (_, forceRefresh?: boolean) => {
    try {
      const { getBalance } = await import("../libs/billing-handler.js");
      return await getBalance(forceRefresh);
    } catch (error) {
      console.error("[ipc-handlers] billing:getBalance failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get balance"
      };
    }
  });

  // billing:recharge - 发起充值
  ipcMain.handle(
    "billing:recharge",
    async (
      _,
      amount: number,
      method: 'stripe' | 'xunhupay',
      options?: {
        currency?: string;
        paymentType?: 'wechat' | 'alipay';
        returnUrl?: string;
        discountCode?: string;
      }
    ) => {
      try {
        const { recharge } = await import("../libs/billing-handler.js");
        return await recharge(amount, method, options);
      } catch (error) {
        console.error("[ipc-handlers] billing:recharge failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create recharge"
        };
      }
    }
  );

  // billing:getRechargeStatus - 查询充值状态
  ipcMain.handle("billing:getRechargeStatus", async (_, orderId: string) => {
    try {
      const { getRechargeStatus } = await import("../libs/billing-handler.js");
      return await getRechargeStatus(orderId);
    } catch (error) {
      console.error("[ipc-handlers] billing:getRechargeStatus failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get recharge status"
      };
    }
  });

  // billing:getUsageHistory - 获取使用记录
  ipcMain.handle(
    "billing:getUsageHistory",
    async (
      _,
      params?: {
        page?: number;
        limit?: number;
        startDate?: string;
        endDate?: string;
        model?: string;
      }
    ) => {
      try {
        const { getUsageHistory } = await import("../libs/billing-handler.js");
        return await getUsageHistory(params);
      } catch (error) {
        console.error("[ipc-handlers] billing:getUsageHistory failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get usage history"
        };
      }
    }
  );

  // billing:getUsageStats - 获取使用统计
  ipcMain.handle(
    "billing:getUsageStats",
    async (
      _,
      params?: {
        startDate?: string;
        endDate?: string;
      }
    ) => {
      try {
        const { getUsageStats } = await import("../libs/billing-handler.js");
        return await getUsageStats(params);
      } catch (error) {
        console.error("[ipc-handlers] billing:getUsageStats failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get usage stats"
        };
      }
    }
  );

  // billing:getTransactionHistory - 获取余额变动记录
  ipcMain.handle(
    "billing:getTransactionHistory",
    async (
      _,
      params?: {
        page?: number;
        limit?: number;
        type?: string;
      }
    ) => {
      try {
        const { getTransactionHistory } = await import("../libs/billing-handler.js");
        return await getTransactionHistory(params);
      } catch (error) {
        console.error("[ipc-handlers] billing:getTransactionHistory failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get transaction history"
        };
      }
    }
  );

  // billing:getPricing - 获取定价信息
  ipcMain.handle("billing:getPricing", async () => {
    try {
      const { getPricing } = await import("../libs/billing-handler.js");
      return await getPricing();
    } catch (error) {
      console.error("[ipc-handlers] billing:getPricing failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get pricing"
      };
    }
  });

  // billing:exportUsage - 导出使用记录
  ipcMain.handle(
    "billing:exportUsage",
    async (
      _,
      params: {
        format: 'csv' | 'json';
        fileName?: string;
        startDate?: string;
        endDate?: string;
        model?: string;
      }
    ) => {
      try {
        const { exportUsage } = await import("../libs/billing-handler.js");
        return await exportUsage(params);
      } catch (error) {
        console.error("[ipc-handlers] billing:exportUsage failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to export usage"
        };
      }
    }
  );

  // billing:getPeriodCard - 获取当前用户期卡信息
  ipcMain.handle("billing:getPeriodCard", async () => {
    try {
      const { getStoredCredentials } = await import("../libs/auth-service.js");
      const creds = getStoredCredentials();
      if (!creds?.accessToken) {
        return { success: false, error: "Not authenticated" };
      }
      const apiBase = getApiBaseUrl();
      const resp = await fetch(`${apiBase}/billing/period-card`, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      });
      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}` };
      }
      const json = await resp.json();
      return { success: true, data: json.data ?? [] };
    } catch (error) {
      console.error("[ipc-handlers] billing:getPeriodCard failed:", error);
      return { success: false, error: error instanceof Error ? error.message : "Failed to get period card" };
    }
  });

  // billing:getPeriodCardPlans - 获取可用期卡套餐列表
  ipcMain.handle("billing:getPeriodCardPlans", async () => {
    try {
      const { getStoredCredentials } = await import("../libs/auth-service.js");
      const creds = getStoredCredentials();
      if (!creds?.accessToken) {
        return { success: false, error: "Not authenticated" };
      }
      const apiBase = getApiBaseUrl();
      const resp = await fetch(`${apiBase}/billing/period-card-plans`, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      });
      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}` };
      }
      const json = await resp.json();
      return { success: true, data: json.data ?? [] };
    } catch (error) {
      console.error("[ipc-handlers] billing:getPeriodCardPlans failed:", error);
      return { success: false, error: error instanceof Error ? error.message : "Failed to get period card plans" };
    }
  });

  // billing:purchasePeriodCard - 购买期卡
  ipcMain.handle(
    "billing:purchasePeriodCard",
    async (_, planId: string, paymentType: 'wechat' | 'alipay') => {
      try {
        const { getStoredCredentials } = await import("../libs/auth-service.js");
        const creds = getStoredCredentials();
        if (!creds?.accessToken) {
          return { success: false, error: "Not authenticated" };
        }
        const apiBase = getApiBaseUrl();
        const resp = await fetch(`${apiBase}/billing/purchase-period-card`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${creds.accessToken}`,
          },
          body: JSON.stringify({ planId, paymentType }),
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          return { success: false, error: errData.message || errData.error || `HTTP ${resp.status}` };
        }
        const json = await resp.json();
        return { success: true, data: json.data };
      } catch (error) {
        console.error("[ipc-handlers] billing:purchasePeriodCard failed:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to purchase period card" };
      }
    }
  );

  // billing:openExternalUrl - 在系统默认浏览器打开链接（仅允许 HTTPS 白名单域名）
  ipcMain.handle("billing:openExternalUrl", async (_, url: string) => {
    try {
      // 安全校验：只允许 https:// 协议的可信域名
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { success: false, error: "Invalid URL" };
      }

      if (parsed.protocol !== 'https:') {
        console.warn(`[ipc-handlers] billing:openExternalUrl blocked non-https URL: ${parsed.protocol}`);
        return { success: false, error: "Only HTTPS URLs are allowed" };
      }

      // Additional allowed domains can be added via CHERRY_ALLOWED_PAYMENT_DOMAINS (comma-separated)
      const extraDomains = process.env.CHERRY_ALLOWED_PAYMENT_DOMAINS
        ? process.env.CHERRY_ALLOWED_PAYMENT_DOMAINS.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const ALLOWED_DOMAINS = [
        'stripe.com',
        'checkout.stripe.com',
        'pay.stripe.com',
        'github.com',
        ...extraDomains,
      ];

      const hostname = parsed.hostname.toLowerCase();
      const isAllowed = ALLOWED_DOMAINS.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      );

      if (!isAllowed) {
        console.warn(`[ipc-handlers] billing:openExternalUrl blocked domain: ${hostname}`);
        return { success: false, error: "Domain not allowed" };
      }

      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error("[ipc-handlers] billing:openExternalUrl failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to open external URL"
      };
    }
  });

  console.info("[ipc-handlers] Billing handlers registered");
}
