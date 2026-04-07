import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { usageLogs } from '../db/schema.js';
import { getSystemConfigNumber } from './config.js';

// ==========================================
// 类型定义
// ==========================================

export interface UsageQueryOptions {
  page?: number;
  limit?: number;
  startDate?: Date;
  endDate?: Date;
  model?: string;
  provider?: string;
  status?: 'success' | 'error';
  sessionId?: string;
}

export interface UsageRecord {
  id: string;
  requestId: string | null;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number | null;
  status: string;
  cost: string | null;
  errorMessage: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}

export interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  currency: string;
  byModel: Record<string, ModelStats>;
  byProvider: Record<string, ProviderStats>;
  period: {
    start: string;
    end: string;
  };
}

export interface ModelStats {
  requests: number;
  tokens: number;
  cost: number;
}

export interface ProviderStats {
  requests: number;
  tokens: number;
  cost: number;
}

export interface TimeSeriesData {
  date: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

export interface QuotaInfo {
  plan: string;
  monthlyQuota: {
    requests: { used: number; limit: number; remaining: number };
    tokens: { used: number; limit: number; remaining: number };
  };
  dailyQuota: {
    requests: { used: number; limit: number; remaining: number };
    tokens: { used: number; limit: number; remaining: number };
  };
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  resetAt: {
    monthly: string;
    daily: string;
  };
}

// ==========================================
// Usage 服务
// ==========================================

export const usageService = {
  /**
   * 获取用户使用记录
   * @param userId - 用户 ID
   * @param options - 查询选项
   * @returns 使用记录列表和总数
   */
  async getUsageRecords(
    userId: string,
    options: UsageQueryOptions = {}
  ): Promise<{ records: UsageRecord[]; total: number }> {
    const { page = 1, limit = 20, startDate, endDate, model, provider, status, sessionId } = options;
    const offset = (page - 1) * limit;

    // 构建查询条件
    const conditions = [eq(usageLogs.userId, userId)];

    if (startDate) {
      conditions.push(gte(usageLogs.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(usageLogs.createdAt, endDate));
    }

    if (model) {
      conditions.push(eq(usageLogs.model, model));
    }

    if (provider) {
      conditions.push(eq(usageLogs.provider, provider));
    }

    if (status) {
      conditions.push(eq(usageLogs.status, status));
    }

    if (sessionId) {
      conditions.push(sql`${usageLogs.metadata}->>'sessionId' = ${sessionId}`);
    }

    // 查询记录
    const records = await db
      .select()
      .from(usageLogs)
      .where(and(...conditions))
      .orderBy(desc(usageLogs.createdAt))
      .limit(limit)
      .offset(offset);

    // 查询总数
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usageLogs)
      .where(and(...conditions));

    const total = countResult[0]?.count ?? 0;

    return {
      records: records.map((r) => ({
        id: r.id,
        requestId: r.requestId,
        model: r.model,
        provider: r.provider,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        totalTokens: r.totalTokens,
        latencyMs: r.latencyMs,
        status: r.status,
        cost: r.cost,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt,
        metadata: r.metadata as Record<string, unknown> | null,
      })),
      total,
    };
  },

  /**
   * 获取使用量摘要
   * @param userId - 用户 ID
   * @param startDate - 开始日期
   * @param endDate - 结束日期
   * @returns 使用量摘要
   */
  async getUsageSummary(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageSummary> {
    const conditions = [eq(usageLogs.userId, userId)];

    const effectiveStartDate = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const effectiveEndDate = endDate ?? new Date();

    conditions.push(gte(usageLogs.createdAt, effectiveStartDate));
    conditions.push(lte(usageLogs.createdAt, effectiveEndDate));

    // 查询总计
    const totalResult = await db
      .select({
        totalRequests: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::int`,
        totalInputTokens: sql<number>`coalesce(sum(${usageLogs.promptTokens}), 0)::int`,
        totalOutputTokens: sql<number>`coalesce(sum(${usageLogs.completionTokens}), 0)::int`,
        totalCost: sql<string>`coalesce(sum(${usageLogs.cost}::decimal), 0)::decimal`,
      })
      .from(usageLogs)
      .where(and(...conditions));

    const totals = totalResult[0] ?? {
      totalRequests: 0,
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: '0',
    };

    // 按模型分组统计
    const byModelResult = await db
      .select({
        model: usageLogs.model,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::int`,
        cost: sql<string>`coalesce(sum(${usageLogs.cost}::decimal), 0)::decimal`,
      })
      .from(usageLogs)
      .where(and(...conditions))
      .groupBy(usageLogs.model);

    const byModel: Record<string, ModelStats> = {};
    for (const row of byModelResult) {
      byModel[row.model] = {
        requests: row.requests,
        tokens: row.tokens,
        cost: parseFloat(row.cost),
      };
    }

    // 按提供商分组统计
    const byProviderResult = await db
      .select({
        provider: usageLogs.provider,
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::int`,
        cost: sql<string>`coalesce(sum(${usageLogs.cost}::decimal), 0)::decimal`,
      })
      .from(usageLogs)
      .where(and(...conditions))
      .groupBy(usageLogs.provider);

    const byProvider: Record<string, ProviderStats> = {};
    for (const row of byProviderResult) {
      byProvider[row.provider] = {
        requests: row.requests,
        tokens: row.tokens,
        cost: parseFloat(row.cost),
      };
    }

    return {
      totalRequests: totals.totalRequests,
      totalTokens: totals.totalTokens,
      totalInputTokens: totals.totalInputTokens,
      totalOutputTokens: totals.totalOutputTokens,
      totalCost: parseFloat(totals.totalCost),
      currency: 'USD',
      byModel,
      byProvider,
      period: {
        start: effectiveStartDate.toISOString(),
        end: effectiveEndDate.toISOString(),
      },
    };
  },

  /**
   * 获取时间序列数据
   * @param userId - 用户 ID
   * @param granularity - 时间粒度 (hour, day, week, month)
   * @param startDate - 开始日期
   * @param endDate - 结束日期
   * @returns 时间序列数据
   */
  async getTimeSeriesData(
    userId: string,
    granularity: 'hour' | 'day' | 'week' | 'month' = 'day',
    startDate?: Date,
    endDate?: Date
  ): Promise<TimeSeriesData[]> {
    const effectiveStartDate = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const effectiveEndDate = endDate ?? new Date();

    // 根据粒度选择时间截断函数
    let truncFunc: string;
    switch (granularity) {
      case 'hour':
        truncFunc = 'hour';
        break;
      case 'week':
        truncFunc = 'week';
        break;
      case 'month':
        truncFunc = 'month';
        break;
      default:
        truncFunc = 'day';
    }

    const result = await db
      .select({
        date: sql<string>`date_trunc(${truncFunc}, ${usageLogs.createdAt})::text`,
        requests: sql<number>`count(*)::int`,
        promptTokens: sql<number>`coalesce(sum(${usageLogs.promptTokens}), 0)::int`,
        completionTokens: sql<number>`coalesce(sum(${usageLogs.completionTokens}), 0)::int`,
        totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)::int`,
        cost: sql<string>`coalesce(sum(${usageLogs.cost}::decimal), 0)::decimal`,
      })
      .from(usageLogs)
      .where(
        and(
          eq(usageLogs.userId, userId),
          gte(usageLogs.createdAt, effectiveStartDate),
          lte(usageLogs.createdAt, effectiveEndDate)
        )
      )
      .groupBy(sql`date_trunc(${truncFunc}, ${usageLogs.createdAt})`)
      .orderBy(sql`date_trunc(${truncFunc}, ${usageLogs.createdAt})`);

    return result.map((r) => ({
      date: r.date,
      requests: r.requests,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      totalTokens: r.totalTokens,
      cost: parseFloat(r.cost),
    }));
  },

  /**
   * 获取配额信息
   * TODO: 从订阅计划中读取真实配额
   * @param userId - 用户 ID
   * @returns 配额信息
   */
  async getQuotaInfo(userId: string): Promise<QuotaInfo> {
    // 获取当月使用量
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlySummary = await this.getUsageSummary(userId, monthStart, now);

    // 获取今日使用量
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dailySummary = await this.getUsageSummary(userId, dayStart, now);

    // 从 system_configs 读取配额限制，硬编码值作为 fallback
    const [
      monthlyRequestLimit,
      monthlyTokenLimit,
      dailyRequestLimit,
      dailyTokenLimit,
      rpm,
      tpm,
    ] = await Promise.all([
      getSystemConfigNumber('default_monthly_request_limit', 10000),
      getSystemConfigNumber('default_monthly_token_limit', 2000000),
      getSystemConfigNumber('default_daily_request_limit', 500),
      getSystemConfigNumber('default_daily_token_limit', 100000),
      getSystemConfigNumber('default_rpm_limit', 60),
      getSystemConfigNumber('default_tpm_limit', 40000),
    ]);

    const monthlyLimit = {
      requests: monthlyRequestLimit,
      tokens: monthlyTokenLimit,
    };

    const dailyLimit = {
      requests: dailyRequestLimit,
      tokens: dailyTokenLimit,
    };

    const rateLimits = {
      requestsPerMinute: rpm,
      tokensPerMinute: tpm,
    };

    // 计算下次重置时间
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    return {
      plan: 'pro',
      monthlyQuota: {
        requests: {
          used: monthlySummary.totalRequests,
          limit: monthlyLimit.requests,
          remaining: Math.max(0, monthlyLimit.requests - monthlySummary.totalRequests),
        },
        tokens: {
          used: monthlySummary.totalTokens,
          limit: monthlyLimit.tokens,
          remaining: Math.max(0, monthlyLimit.tokens - monthlySummary.totalTokens),
        },
      },
      dailyQuota: {
        requests: {
          used: dailySummary.totalRequests,
          limit: dailyLimit.requests,
          remaining: Math.max(0, dailyLimit.requests - dailySummary.totalRequests),
        },
        tokens: {
          used: dailySummary.totalTokens,
          limit: dailyLimit.tokens,
          remaining: Math.max(0, dailyLimit.tokens - dailySummary.totalTokens),
        },
      },
      rateLimits,
      resetAt: {
        monthly: nextMonth.toISOString(),
        daily: nextDay.toISOString(),
      },
    };
  },

  /**
   * 导出使用量数据
   * @param userId - 用户 ID
   * @param startDate - 开始日期
   * @param endDate - 结束日期
   * @param format - 导出格式
   * @returns 导出数据
   */
  async exportUsageData(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageRecord[]> {
    const conditions = [eq(usageLogs.userId, userId)];

    if (startDate) {
      conditions.push(gte(usageLogs.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(usageLogs.createdAt, endDate));
    }

    // 查询所有记录 (限制最多 10000 条,避免内存溢出)
    const records = await db
      .select()
      .from(usageLogs)
      .where(and(...conditions))
      .orderBy(desc(usageLogs.createdAt))
      .limit(10000);

    return records.map((r) => ({
      id: r.id,
      requestId: r.requestId,
      model: r.model,
      provider: r.provider,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      totalTokens: r.totalTokens,
      latencyMs: r.latencyMs,
      status: r.status,
      cost: r.cost,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt,
      metadata: r.metadata as Record<string, unknown> | null,
    }));
  },

  /**
   * 格式化为 CSV
   * @param records - 使用记录
   * @returns CSV 字符串
   */
  formatAsCSV(records: UsageRecord[]): string {
    const header =
      'id,request_id,timestamp,model,provider,prompt_tokens,completion_tokens,total_tokens,latency_ms,status,cost,error_message\n';

    const rows = records.map((r) => {
      const timestamp = r.createdAt.toISOString();
      const cost = r.cost ?? '0';
      const errorMessage = (r.errorMessage ?? '').replace(/"/g, '""'); // 转义双引号
      const requestId = r.requestId ?? '';

      return `${r.id},${requestId},${timestamp},${r.model},${r.provider},${r.promptTokens},${r.completionTokens},${r.totalTokens},${r.latencyMs ?? ''},${r.status},${cost},"${errorMessage}"`;
    });

    return header + rows.join('\n');
  },

  /**
   * 获取模型列表
   * @param userId - 用户 ID
   * @returns 模型列表
   */
  async getModelList(userId: string): Promise<string[]> {
    const result = await db
      .selectDistinct({ model: usageLogs.model })
      .from(usageLogs)
      .where(eq(usageLogs.userId, userId))
      .orderBy(usageLogs.model);

    return result.map((r) => r.model);
  },

  /**
   * 获取提供商列表
   * @param userId - 用户 ID
   * @returns 提供商列表
   */
  async getProviderList(userId: string): Promise<string[]> {
    const result = await db
      .selectDistinct({ provider: usageLogs.provider })
      .from(usageLogs)
      .where(eq(usageLogs.userId, userId))
      .orderBy(usageLogs.provider);

    return result.map((r) => r.provider);
  },
};

export default usageService;
