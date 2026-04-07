import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse, paginationMeta } from '../../utils/response.js';
import { validateQuery } from '../../middleware/validate.js';
import {
  authenticateAdminAsync,
  requirePermission,
} from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';

export const adminFinanceRouter = Router();

// ==========================================
// Schema 定义
// ==========================================

/**
 * 充值记录查询 Schema
 */
const rechargesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().uuid().optional(),
  status: z.enum(['pending', 'succeeded', 'failed', 'refunded']).optional(),
  paymentMethod: z.enum(['stripe', 'xunhupay']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
});

/**
 * 消费记录查询 Schema
 */
const usageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().uuid().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  status: z.enum(['success', 'error']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

/**
 * 收入统计查询 Schema
 */
const revenueQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).default('day'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
});

/**
 * 交易流水查询 Schema
 */
const transactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().uuid().optional(),
  type: z.enum(['deposit', 'usage', 'bonus', 'refund', 'adjustment', 'compensation']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ==========================================
// 路由处理
// ==========================================

/**
 * 获取充值记录
 * GET /admin/finance/recharges
 */
adminFinanceRouter.get(
  '/recharges',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  validateQuery(rechargesQuerySchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof rechargesQuerySchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.userId) {
      conditions.push(`p.user_id = $${paramIndex++}`);
      params.push(query.userId);
    }

    if (query.status) {
      conditions.push(`p.status = $${paramIndex++}`);
      params.push(query.status);
    }

    if (query.paymentMethod) {
      conditions.push(`p.payment_method = $${paramIndex++}`);
      params.push(query.paymentMethod);
    }

    if (query.startDate) {
      conditions.push(`p.created_at >= $${paramIndex++}`);
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push(`p.created_at <= $${paramIndex++}`);
      params.push(query.endDate);
    }

    if (query.minAmount !== undefined) {
      conditions.push(`p.amount >= $${paramIndex++}`);
      params.push(query.minAmount);
    }

    if (query.maxAmount !== undefined) {
      conditions.push(`p.amount <= $${paramIndex++}`);
      params.push(query.maxAmount);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询充值记录
    const rechargesResult = await pool.query(
      `SELECT
         p.id,
         p.user_id,
         u.email as user_email,
         u.name as user_name,
         p.amount,
         p.currency,
         p.status,
         p.payment_method,
         p.stripe_payment_intent_id,
         p.xunhupay_order_id,
         p.description,
         p.paid_at,
         p.created_at
       FROM payments p
       LEFT JOIN users u ON p.user_id = u.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM payments p ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    // 统计汇总
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) as total_count,
         COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END), 0) as total_succeeded,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as total_pending,
         COALESCE(SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END), 0) as total_failed
       FROM payments p
       ${whereClause}`,
      params
    );

    const summary = summaryResult.rows[0] as {
      total_count: string;
      total_succeeded: string;
      total_pending: string;
      total_failed: string;
    };

    const recharges = (rechargesResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        user_id: string;
        user_email: string | null;
        user_name: string | null;
        amount: string;
        currency: string;
        status: string;
        payment_method: string;
        stripe_payment_intent_id: string | null;
        xunhupay_order_id: string | null;
        description: string | null;
        paid_at: Date | null;
        created_at: Date;
      };
      return {
        id: r.id,
        userId: r.user_id,
        userEmail: r.user_email,
        userName: r.user_name,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        paymentMethod: r.payment_method,
        stripePaymentIntentId: r.stripe_payment_intent_id,
        xunhupayOrderId: r.xunhupay_order_id,
        description: r.description,
        paidAt: r.paid_at,
        createdAt: r.created_at,
      };
    });

    res.json(
      successResponse(
        {
          recharges,
          summary: {
            totalCount: parseInt(summary.total_count, 10),
            totalSucceeded: parseFloat(summary.total_succeeded),
            totalPending: parseFloat(summary.total_pending),
            totalFailed: parseFloat(summary.total_failed),
          },
        },
        paginationMeta(total, page, limit)
      )
    );
  }
);

/**
 * 获取消费明细
 * GET /admin/finance/usage
 */
adminFinanceRouter.get(
  '/usage',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  validateQuery(usageQuerySchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof usageQuerySchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.userId) {
      conditions.push(`ul.user_id = $${paramIndex++}`);
      params.push(query.userId);
    }

    if (query.model) {
      const escapedModel = query.model.replace(/[%_\\]/g, '\\$&');
      conditions.push(`ul.model ILIKE $${paramIndex++}`);
      params.push(`%${escapedModel}%`);
    }

    if (query.provider) {
      conditions.push(`ul.provider = $${paramIndex++}`);
      params.push(query.provider);
    }

    if (query.status) {
      conditions.push(`ul.status = $${paramIndex++}`);
      params.push(query.status);
    }

    if (query.startDate) {
      conditions.push(`ul.created_at >= $${paramIndex++}`);
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push(`ul.created_at <= $${paramIndex++}`);
      params.push(query.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询使用记录
    const usageResult = await pool.query(
      `SELECT
         ul.id,
         ul.user_id,
         u.email as user_email,
         ul.request_id,
         ul.model,
         ul.provider,
         ul.prompt_tokens,
         ul.completion_tokens,
         ul.total_tokens,
         COALESCE((ul.metadata->>'cacheReadTokens')::int, 0) as cache_read_tokens,
         COALESCE((ul.metadata->>'cacheWriteTokens')::int, 0) as cache_write_tokens,
         ul.latency_ms,
         ul.status,
         ul.error_message,
         ul.cost,
         ul.credits_consumed,
         COALESCE(ul.quota_used, 0) as quota_used,
         ul.created_at
       FROM usage_logs ul
       LEFT JOIN users u ON ul.user_id = u.id
       ${whereClause}
       ORDER BY ul.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM usage_logs ul ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    // 统计汇总
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) as total_requests,
         COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(credits_consumed::numeric), 0) as total_cost,
         COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
         COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count
       FROM usage_logs ul
       ${whereClause}`,
      params
    );

    const summary = summaryResult.rows[0] as {
      total_requests: string;
      total_prompt_tokens: string;
      total_completion_tokens: string;
      total_tokens: string;
      total_cost: string;
      success_count: string;
      error_count: string;
    };

    const usage = (usageResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        user_id: string | null;
        user_email: string | null;
        request_id: string | null;
        model: string;
        provider: string;
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        cache_read_tokens: number;
        cache_write_tokens: number;
        latency_ms: number | null;
        status: string;
        error_message: string | null;
        cost: string | null;
        credits_consumed: string | null;
        quota_used: string;
        created_at: Date;
      };
      return {
        id: r.id,
        userId: r.user_id,
        userEmail: r.user_email,
        requestId: r.request_id,
        model: r.model,
        provider: r.provider,
        promptTokens: r.prompt_tokens,
        completionTokens: r.completion_tokens,
        totalTokens: r.total_tokens,
        cacheReadTokens: r.cache_read_tokens,
        cacheWriteTokens: r.cache_write_tokens,
        latencyMs: r.latency_ms,
        status: r.status,
        errorMessage: r.error_message,
        cost: r.cost,
        creditsConsumed: r.credits_consumed ?? '0',
        quotaUsed: r.quota_used ?? '0',
        createdAt: r.created_at,
      };
    });

    res.json(
      successResponse(
        {
          usage,
          summary: {
            totalRequests: parseInt(summary.total_requests, 10),
            totalPromptTokens: parseInt(summary.total_prompt_tokens, 10),
            totalCompletionTokens: parseInt(summary.total_completion_tokens, 10),
            totalTokens: parseInt(summary.total_tokens, 10),
            totalCost: parseFloat(summary.total_cost).toFixed(4),
            successCount: parseInt(summary.success_count, 10),
            errorCount: parseInt(summary.error_count, 10),
            successRate:
              parseInt(summary.total_requests, 10) > 0
                ? (
                    (parseInt(summary.success_count, 10) /
                      parseInt(summary.total_requests, 10)) *
                    100
                  ).toFixed(2)
                : '0.00',
          },
        },
        paginationMeta(total, page, limit)
      )
    );
  }
);

/**
 * 获取收入统计
 * GET /admin/finance/revenue
 */
adminFinanceRouter.get(
  '/revenue',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  validateQuery(revenueQuerySchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof revenueQuerySchema>;

    // 默认时间范围
    const endDate = query.endDate || new Date();
    let startDate = query.startDate;

    if (!startDate) {
      startDate = new Date();
      switch (query.period) {
        case 'day':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 12);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 5);
          break;
      }
    }

    // 时间分组格式
    let dateFormat: string;
    switch (query.groupBy) {
      case 'week':
        dateFormat = 'IYYY-IW'; // ISO 周
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
    }

    // 充值收入统计（虎皮椒按 metadata.paymentType 细分微信/支付宝）
    const revenueResult = await pool.query(
      `SELECT
         TO_CHAR(paid_at, '${dateFormat}') as period,
         COUNT(*) as count,
         COALESCE(SUM(amount::numeric), 0) as amount,
         CASE
           WHEN payment_method = 'xunhupay' AND metadata->>'paymentType' = 'alipay' THEN 'alipay'
           WHEN payment_method = 'xunhupay' THEN 'wechat'
           ELSE payment_method
         END as channel
       FROM payments
       WHERE status = 'succeeded'
         AND paid_at >= $1
         AND paid_at <= $2
       GROUP BY TO_CHAR(paid_at, '${dateFormat}'), channel
       ORDER BY period`,
      [startDate, endDate]
    );

    // 消费统计
    const usageCostResult = await pool.query(
      `SELECT
         TO_CHAR(created_at, '${dateFormat}') as period,
         COUNT(*) as count,
         COALESCE(SUM(credits_consumed::numeric), 0) as cost,
         COALESCE(SUM(total_tokens), 0) as tokens
       FROM usage_logs
       WHERE created_at >= $1
         AND created_at <= $2
         AND status = 'success'
       GROUP BY TO_CHAR(created_at, '${dateFormat}')
       ORDER BY period`,
      [startDate, endDate]
    );

    // 汇总统计
    const summaryResult = await pool.query(
      `SELECT
         (SELECT COALESCE(SUM(amount::numeric), 0) FROM payments WHERE status = 'succeeded' AND paid_at >= $1 AND paid_at <= $2) as total_revenue,
         (SELECT COALESCE(SUM(credits_consumed::numeric), 0) FROM usage_logs WHERE created_at >= $1 AND created_at <= $2 AND status = 'success') as total_cost,
         (SELECT COUNT(DISTINCT user_id) FROM payments WHERE status = 'succeeded' AND paid_at >= $1 AND paid_at <= $2) as paying_users,
         (SELECT COUNT(*) FROM payments WHERE status = 'succeeded' AND paid_at >= $1 AND paid_at <= $2) as payment_count`,
      [startDate, endDate]
    );

    const summary = summaryResult.rows[0] as {
      total_revenue: string;
      total_cost: string;
      paying_users: string;
      payment_count: string;
    };

    // 按周期整理数据
    const revenueByPeriod = new Map<
      string,
      { stripe: number; wechat: number; alipay: number; total: number }
    >();

    (revenueResult.rows || []).forEach((row: unknown) => {
      const r = row as {
        period: string;
        count: string;
        amount: string;
        channel: string;
      };
      if (!revenueByPeriod.has(r.period)) {
        revenueByPeriod.set(r.period, { stripe: 0, wechat: 0, alipay: 0, total: 0 });
      }
      const entry = revenueByPeriod.get(r.period)!;
      const amount = parseFloat(r.amount);
      if (r.channel === 'stripe') {
        entry.stripe += amount;
      } else if (r.channel === 'alipay') {
        entry.alipay += amount;
      } else {
        entry.wechat += amount;
      }
      entry.total += amount;
    });

    const costByPeriod = new Map<
      string,
      { cost: number; requests: number; tokens: number }
    >();

    (usageCostResult.rows || []).forEach((row: unknown) => {
      const r = row as {
        period: string;
        count: string;
        cost: string;
        tokens: string;
      };
      costByPeriod.set(r.period, {
        cost: parseFloat(r.cost),
        requests: parseInt(r.count, 10),
        tokens: parseInt(r.tokens, 10),
      });
    });

    // 合并数据
    const periods = new Set([
      ...revenueByPeriod.keys(),
      ...costByPeriod.keys(),
    ]);
    const sortedPeriods = Array.from(periods).sort();

    const chartData = sortedPeriods.map((period) => {
      const revenue = revenueByPeriod.get(period) || {
        stripe: 0,
        wechat: 0,
        alipay: 0,
        total: 0,
      };
      const cost = costByPeriod.get(period) || {
        cost: 0,
        requests: 0,
        tokens: 0,
      };
      return {
        period,
        revenue: {
          stripe: revenue.stripe,
          wechat: revenue.wechat,
          alipay: revenue.alipay,
          xunhupay: revenue.wechat + revenue.alipay, // 兼容旧前端
          total: revenue.total,
        },
        cost: cost.cost,
        requests: cost.requests,
        tokens: cost.tokens,
        profit: revenue.total - cost.cost,
      };
    });

    res.json(
      successResponse({
        summary: {
          totalRevenue: parseFloat(summary.total_revenue),
          totalCost: parseFloat(summary.total_cost),
          grossProfit: parseFloat(summary.total_revenue) - parseFloat(summary.total_cost),
          profitMargin:
            parseFloat(summary.total_revenue) > 0
              ? (
                  ((parseFloat(summary.total_revenue) -
                    parseFloat(summary.total_cost)) /
                    parseFloat(summary.total_revenue)) *
                  100
                ).toFixed(2)
              : '0.00',
          payingUsers: parseInt(summary.paying_users, 10),
          paymentCount: parseInt(summary.payment_count, 10),
          arpu:
            parseInt(summary.paying_users, 10) > 0
              ? (
                  parseFloat(summary.total_revenue) /
                  parseInt(summary.paying_users, 10)
                ).toFixed(2)
              : '0.00',
        },
        chartData,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          groupBy: query.groupBy,
        },
      })
    );
  }
);

/**
 * 获取交易流水
 * GET /admin/finance/transactions
 */
adminFinanceRouter.get(
  '/transactions',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  validateQuery(transactionsQuerySchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof transactionsQuerySchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = ["bt.type != 'precharge'"]; // 排除预扣记录
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.userId) {
      conditions.push(`bt.user_id = $${paramIndex++}`);
      params.push(query.userId);
    }

    if (query.type) {
      conditions.push(`bt.type = $${paramIndex++}`);
      params.push(query.type);
    }

    if (query.startDate) {
      conditions.push(`bt.created_at >= $${paramIndex++}`);
      params.push(query.startDate);
    }

    if (query.endDate) {
      conditions.push(`bt.created_at <= $${paramIndex++}`);
      params.push(query.endDate);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 查询交易记录
    const transactionsResult = await pool.query(
      `SELECT
         bt.id,
         bt.user_id,
         u.email as user_email,
         bt.type,
         bt.amount,
         bt.balance_before,
         bt.balance_after,
         bt.credits_amount,
         bt.credits_before,
         bt.credits_after,
         bt.description,
         bt.reference_type,
         bt.metadata,
         bt.created_at
       FROM balance_transactions bt
       LEFT JOIN users u ON bt.user_id = u.id
       ${whereClause}
       ORDER BY bt.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM balance_transactions bt ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    // 按类型统计
    const typeStatsResult = await pool.query(
      `SELECT
         type,
         COUNT(*) as count,
         COALESCE(SUM(amount::numeric), 0) as total_amount
       FROM balance_transactions bt
       ${whereClause}
       GROUP BY type`,
      params
    );

    const typeStats: Record<string, { count: number; totalAmount: number }> = {};
    (typeStatsResult.rows || []).forEach((row: unknown) => {
      const r = row as { type: string; count: string; total_amount: string };
      typeStats[r.type] = {
        count: parseInt(r.count, 10),
        totalAmount: parseFloat(r.total_amount),
      };
    });

    const transactions = (transactionsResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        user_id: string;
        user_email: string | null;
        type: string;
        amount: string;
        balance_before: string;
        balance_after: string;
        credits_amount: string | null;
        credits_before: string | null;
        credits_after: string | null;
        description: string | null;
        reference_type: string | null;
        metadata: Record<string, unknown> | null;
        created_at: Date;
      };
      return {
        id: r.id,
        userId: r.user_id,
        userEmail: r.user_email,
        type: r.type,
        amount: r.amount,
        balanceBefore: r.balance_before,
        balanceAfter: r.balance_after,
        creditsAmount: r.credits_amount ?? '0',
        creditsBefore: r.credits_before ?? '0',
        creditsAfter: r.credits_after ?? '0',
        description: r.description,
        referenceType: r.reference_type,
        metadata: r.metadata,
        createdAt: r.created_at,
      };
    });

    res.json(
      successResponse(
        {
          transactions,
          typeStats,
        },
        paginationMeta(total, page, limit)
      )
    );
  }
);

export default adminFinanceRouter;
