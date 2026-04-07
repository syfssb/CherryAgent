/**
 * 计费系统核心逻辑 - 平台无关
 *
 * 从 src/electron/libs/billing-handler.ts 抽离
 * Electron 特有的 shell.openExternal / dialog 通过 DI 注入
 */
import { writeFileSync } from "fs";
// ==================== 内部工具 ====================
const DEFAULT_PAGE_SIZE = 20;
const BALANCE_CACHE_TTL = 30 * 1000; // 30 秒
function parseDecimal(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
// ==================== BillingService 类 ====================
export class BillingService {
    deps;
    balanceCache = null;
    constructor(deps) {
        this.deps = deps;
    }
    getApiBaseUrl() {
        const raw = this.deps.apiBaseUrl || process.env.VITE_API_BASE_URL || process.env.CHERRY_API_URL || "http://localhost:3000";
        // endpoint 已经包含 /api/ 前缀，所以 base URL 不应该带 /api 后缀
        // 例如 VITE_API_BASE_URL=https://example.com/api 需要去掉尾部的 /api
        return raw.replace(/\/api\/?$/, "");
    }
    async getAuthToken() {
        try {
            const credentials = await this.deps.authProvider.getStoredCredentials();
            return credentials?.accessToken || null;
        }
        catch (error) {
            console.error("[Billing] Failed to get auth token:", error);
            return null;
        }
    }
    async apiRequest(endpoint, options = {}) {
        try {
            const token = await this.getAuthToken();
            if (!token) {
                return { success: false, error: "未登录，请先登录" };
            }
            const url = `${this.getApiBaseUrl()}${endpoint}`;
            const headers = {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                ...options.headers,
            };
            const response = await fetch(url, { ...options, headers });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const rawError = errorData.error;
                const errorMsg = errorData.message
                    || (typeof rawError === 'string' ? rawError : rawError?.message)
                    || `HTTP ${response.status}: ${response.statusText}`;
                return {
                    success: false,
                    error: errorMsg,
                };
            }
            const result = await response.json();
            return {
                success: true,
                data: result.data,
                ...(result.meta ? { meta: result.meta } : {}),
            };
        }
        catch (error) {
            console.error(`[Billing] API request failed for ${endpoint}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    /** 清除余额缓存 */
    clearBalanceCache() {
        this.balanceCache = null;
    }
    /** 获取用户余额 */
    async getBalance(forceRefresh = false) {
        if (!forceRefresh && this.balanceCache && Date.now() - this.balanceCache.timestamp < BALANCE_CACHE_TTL) {
            return { success: true, data: this.balanceCache.data };
        }
        const result = await this.apiRequest("/api/billing/balance");
        if (result.success && result.data) {
            this.balanceCache = { data: result.data, timestamp: Date.now() };
        }
        return result;
    }
    /** 发起充值 */
    async recharge(amount, method, options) {
        try {
            let endpoint;
            let body;
            if (method === "stripe") {
                endpoint = "/api/billing/recharge/stripe";
                body = {
                    amount,
                    ...(options?.currency ? { currency: options.currency } : {}),
                    ...(options?.discountCode ? { discountCode: options.discountCode } : {}),
                };
            }
            else {
                endpoint = "/api/billing/recharge/xunhupay";
                body = {
                    amount,
                    paymentType: options?.paymentType || "wechat",
                    returnUrl: options?.returnUrl,
                    ...(options?.discountCode ? { discountCode: options.discountCode } : {}),
                };
            }
            const result = await this.apiRequest(endpoint, {
                method: "POST",
                body: JSON.stringify(body),
            });
            if (!result.success || !result.data) {
                return result;
            }
            const rechargeResult = {
                orderId: String(result.data.orderId),
                method,
                url: method === "stripe" ? String(result.data.checkoutUrl) : String(result.data.payUrl),
                qrcodeUrl: method === "xunhupay" ? String(result.data.qrcodeUrl) : undefined,
            };
            // 只有 Stripe 需要在系统浏览器中打开支付页面
            // 虎皮椒桌面端使用二维码弹窗，不需要打开浏览器
            if (method === "stripe") {
                await this.deps.shellAdapter.openExternal(rechargeResult.url);
            }
            return { success: true, data: rechargeResult };
        }
        catch (error) {
            console.error("[Billing] Recharge failed:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    /** 查询充值状态 */
    async getRechargeStatus(orderId) {
        return this.apiRequest(`/api/billing/recharge/${orderId}/status`);
    }
    /** 获取使用记录 */
    async getUsageHistory(params = {}) {
        try {
            const queryParams = new URLSearchParams();
            if (params.page)
                queryParams.set("page", String(params.page));
            if (params.limit)
                queryParams.set("limit", String(params.limit));
            if (params.startDate)
                queryParams.set("startDate", params.startDate);
            if (params.endDate)
                queryParams.set("endDate", params.endDate);
            if (params.model)
                queryParams.set("model", params.model);
            const endpoint = `/api/billing/usage?${queryParams.toString()}`;
            const result = await this.apiRequest(endpoint);
            if (!result.success) {
                return result;
            }
            const rawRecords = (result.data ?? []);
            const records = rawRecords.map((record) => {
                const creditsConsumed = parseDecimal(record.creditsConsumed);
                const costRaw = parseDecimal(record.cost);
                const creditsValue = creditsConsumed ?? costRaw ?? 0;
                const balanceCreditsConsumed = parseDecimal(record.balanceCreditsConsumed);
                // 解析 quotaUsed 并转换为分（前端期望的单位）
                const quotaUsedRaw = parseDecimal(record.quotaUsed);
                const quotaUsedInCents = quotaUsedRaw ? Math.round(quotaUsedRaw * 100) : 0;
                const balanceCreditsConsumedInCents = balanceCreditsConsumed != null
                    ? Math.round(balanceCreditsConsumed * 100)
                    : undefined;
                return {
                    id: String(record.id),
                    timestamp: record.timestamp ?? (record.createdAt ? new Date(String(record.createdAt)).getTime() : Date.now()),
                    model: String(record.model),
                    provider: String(record.provider),
                    inputTokens: Number(record.inputTokens) || 0,
                    outputTokens: Number(record.outputTokens) || 0,
                    totalTokens: Number(record.totalTokens) || 0,
                    cacheReadTokens: Number(record.cacheReadTokens) || 0,
                    cacheWriteTokens: Number(record.cacheWriteTokens) || 0,
                    // 前端 formatAmount 期望的是"分"，数据库记录是"积分"，需要 *100
                    cost: Math.round(creditsValue * 100),
                    balanceCreditsConsumed: balanceCreditsConsumedInCents,
                    status: String(record.status),
                    latencyMs: record.latencyMs != null ? Number(record.latencyMs) : null,
                    createdAt: record.createdAt,
                    currency: record.currency || "CNY",
                    quotaUsed: quotaUsedInCents,
                };
            });
            const meta = result.meta;
            const total = meta?.total ?? records.length;
            const pageSize = meta?.limit ?? params.limit ?? DEFAULT_PAGE_SIZE;
            const page = meta?.page ?? params.page ?? 1;
            const totalPages = meta?.totalPages ?? Math.max(1, Math.ceil(total / pageSize));
            // 优先使用后端返回的全量 summary（含所有筛选条件下的聚合统计）
            const serverSummary = meta?.summary;
            const summary = serverSummary
                ? {
                    totalRequests: serverSummary.totalRequests ?? total,
                    totalTokens: serverSummary.totalTokens ?? 0,
                    // 后端返回积分（decimal），前端 formatAmount 期望"分"，需 *100
                    totalCost: Math.round(parseFloat(serverSummary.totalCreditsConsumed ?? '0') * 100),
                    currency: records.find((r) => r.currency)?.currency || "CNY",
                }
                : {
                    // 降级：后端未返回 summary 时仍用当前页累加
                    totalRequests: total,
                    totalTokens: records.reduce((sum, r) => sum + (r.totalTokens || 0), 0),
                    totalCost: records.reduce((sum, r) => sum + (r.cost || 0), 0),
                    currency: records.find((r) => r.currency)?.currency || "CNY",
                };
            return {
                success: true,
                data: { records, total, meta, summary, pagination: { page, pageSize, total, totalPages } },
            };
        }
        catch (error) {
            console.error("[Billing] Get usage history failed:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    /** 获取使用统计 */
    async getUsageStats(params = {}) {
        try {
            const queryParams = new URLSearchParams();
            if (params.startDate)
                queryParams.set("startDate", params.startDate);
            if (params.endDate)
                queryParams.set("endDate", params.endDate);
            const endpoint = `/api/billing/usage/summary?${queryParams.toString()}`;
            return this.apiRequest(endpoint);
        }
        catch (error) {
            console.error("[Billing] Get usage stats failed:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    /** 获取余额变动记录 */
    async getTransactionHistory(params = {}) {
        try {
            const queryParams = new URLSearchParams();
            if (params.page)
                queryParams.set("page", String(params.page));
            if (params.limit)
                queryParams.set("limit", String(params.limit));
            if (params.type)
                queryParams.set("type", params.type);
            const endpoint = `/api/billing/transactions?${queryParams.toString()}`;
            const result = await this.apiRequest(endpoint);
            if (!result.success) {
                return result;
            }
            const rawRecords = (result.data ?? []);
            const records = rawRecords.map((record) => {
                const creditsAmount = parseDecimal(record.creditsAmount) ?? 0;
                const creditsAfter = parseDecimal(record.creditsAfter) ?? 0;
                return {
                    ...record,
                    timestamp: record.timestamp ?? (record.createdAt ? new Date(String(record.createdAt)).getTime() : Date.now()),
                    // 前端 formatAmount 期望的是“分”，数据库记录是“积分”，需要 *100
                    amount: Math.round(creditsAmount * 100),
                    balanceAfter: Math.round(creditsAfter * 100),
                    currency: record.currency || "CNY",
                };
            });
            const meta = result.meta;
            const total = meta?.total ?? records.length;
            const pageSize = meta?.limit ?? params.limit ?? DEFAULT_PAGE_SIZE;
            const page = meta?.page ?? params.page ?? 1;
            const totalPages = meta?.totalPages ?? Math.max(1, Math.ceil(total / pageSize));
            return {
                success: true,
                data: { records, total, pagination: { page, pageSize, total, totalPages } },
            };
        }
        catch (error) {
            console.error("[Billing] Get transaction history failed:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    /** 获取定价信息 */
    async getPricing() {
        return this.apiRequest("/api/billing/pricing");
    }
    /** 导出使用记录 */
    async exportUsage(params) {
        try {
            const usageResult = await this.getUsageHistory({
                startDate: params.startDate,
                endDate: params.endDate,
                model: params.model,
                limit: 10000,
            });
            if (!usageResult.success || !usageResult.data) {
                return { success: false, error: usageResult.error || "获取使用记录失败" };
            }
            const records = usageResult.data.records;
            let content;
            let extension;
            if (params.format === "csv") {
                extension = "csv";
                const headers = ["时间", "模型", "提供商", "输入 Tokens", "输出 Tokens", "总 Tokens", "费用 (USD)", "状态", "延迟 (ms)"];
                const rows = records.map((record) => [
                    new Date(record.createdAt).toLocaleString("zh-CN"),
                    record.model, record.provider, record.inputTokens, record.outputTokens,
                    record.totalTokens, record.cost, record.status, record.latencyMs || "N/A",
                ]);
                content = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");
            }
            else {
                extension = "json";
                content = JSON.stringify({
                    exportDate: new Date().toISOString(),
                    filters: { startDate: params.startDate, endDate: params.endDate, model: params.model },
                    totalRecords: records.length,
                    records,
                }, null, 2);
            }
            const result = await this.deps.dialogAdapter.showSaveDialog({
                title: "导出使用记录",
                defaultPath: params.fileName || `usage-export-${Date.now()}.${extension}`,
                filters: [
                    params.format === "csv"
                        ? { name: "CSV 文件", extensions: ["csv"] }
                        : { name: "JSON 文件", extensions: ["json"] },
                ],
            });
            if (result.canceled || !result.filePath) {
                return { success: false, error: "用户取消导出" };
            }
            writeFileSync(result.filePath, content, "utf-8");
            return { success: true, data: { filePath: result.filePath } };
        }
        catch (error) {
            console.error("[Billing] Export usage failed:", error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    /** 轮询充值状态 */
    pollRechargeStatus(orderId, onStatusChange, options = {}) {
        const interval = options.interval || 3000;
        const maxAttempts = options.maxAttempts || 100;
        let attempts = 0;
        let timer = null;
        const poll = async () => {
            attempts++;
            const result = await this.getRechargeStatus(orderId);
            if (result.success && result.data) {
                onStatusChange(result.data);
                // 终止状态列表
                const terminalStatuses = [
                    "succeeded",
                    "paid",
                    "failed",
                    "cancelled",
                    "expired",
                    "refunded",
                    "needs_review"
                ];
                const status = result.data.status;
                if (terminalStatuses.includes(status)) {
                    cleanup();
                    // 成功状态需要清除余额缓存
                    const successStatuses = ["succeeded", "paid"];
                    if (successStatuses.includes(status)) {
                        this.clearBalanceCache();
                    }
                    return;
                }
            }
            if (attempts >= maxAttempts) {
                cleanup();
                return;
            }
            timer = setTimeout(poll, interval);
        };
        const cleanup = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };
        poll();
        return cleanup;
    }
}
