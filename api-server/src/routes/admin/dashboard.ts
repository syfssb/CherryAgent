import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse } from '../../utils/response.js';
import { validateQuery } from '../../middleware/validate.js';
import {
  authenticateAdminAsync,
  requirePermission,
} from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';

export const adminDashboardRouter = Router();

// ==========================================
// Schema 定义
// ==========================================

/**
 * 时间范围查询 Schema
 */
const timeRangeSchema = z.object({
  period: z.enum(['today', '7d', '30d', '90d', 'year']).default('30d'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ==========================================
// 辅助函数
// ==========================================

/**
 * 获取时间范围
 */
function getDateRange(
  period: string,
  customStart?: Date,
  customEnd?: Date
): { start: Date; end: Date } {
  const end = customEnd || new Date();
  let start = customStart;

  if (!start) {
    start = new Date();
    switch (period) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        break;
    }
  }

  return { start, end };
}

// ==========================================
// 路由处理
// ==========================================

/**
 * 获取关键指标统计
 * GET /admin/dashboard/stats
 */
adminDashboardRouter.get(
  '/stats',
  authenticateAdminAsync,
  requirePermission('dashboard:read'),
  validateQuery(timeRangeSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof timeRangeSchema>;
    const { start, end } = getDateRange(query.period, query.startDate, query.endDate);

    // 获取前一个时间段用于对比
    const duration = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - duration);
    const prevEnd = new Date(start.getTime());

    // 计算 DAU 和 MAU 的时间范围
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date();

    // 用户统计
    const userStatsResult = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users) as total_users,
         (SELECT COUNT(*) FROM users WHERE created_at >= $1 AND created_at <= $2) as new_users,
         (SELECT COUNT(*) FROM users WHERE created_at >= $3 AND created_at <= $4) as prev_new_users,
         (SELECT COUNT(DISTINCT user_id) FROM usage_logs WHERE created_at >= $1 AND created_at <= $2) as active_users,
         (SELECT COUNT(DISTINCT user_id) FROM usage_logs WHERE created_at >= $5 AND created_at <= $6) as dau_approx,
         (SELECT COUNT(DISTINCT user_id) FROM usage_logs WHERE created_at >= $7 AND created_at <= $8) as mau_approx`,
      [start, end, prevStart, prevEnd, today, todayEnd, monthStart, monthEnd]
    );

    const userStats = userStatsResult.rows[0] as {
      total_users: string;
      new_users: string;
      prev_new_users: string;
      active_users: string;
      dau_approx: string;
      mau_approx: string;
    };

    // 收入统计
    const revenueStatsResult = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN paid_at >= $1 AND paid_at <= $2 THEN amount::numeric ELSE 0 END), 0) as current_revenue,
         COALESCE(SUM(CASE WHEN paid_at >= $3 AND paid_at <= $4 THEN amount::numeric ELSE 0 END), 0) as prev_revenue,
         COALESCE(SUM(amount::numeric), 0) as total_revenue
       FROM payments
       WHERE status = 'succeeded'`,
      [start, end, prevStart, prevEnd]
    );

    const revenueStats = revenueStatsResult.rows[0] as {
      current_revenue: string;
      prev_revenue: string;
      total_revenue: string;
    };

    // API 调用统计
    const apiStatsResult = await pool.query(
      `SELECT
         COUNT(CASE WHEN created_at >= $1 AND created_at <= $2 THEN 1 END) as current_requests,
         COUNT(CASE WHEN created_at >= $3 AND created_at <= $4 THEN 1 END) as prev_requests,
         COUNT(*) as total_requests,
         COALESCE(SUM(CASE WHEN created_at >= $1 AND created_at <= $2 THEN total_tokens ELSE 0 END), 0) as current_tokens,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(CASE WHEN created_at >= $1 AND created_at <= $2 THEN cost::numeric ELSE 0 END), 0) as current_cost,
         COUNT(CASE WHEN created_at >= $1 AND created_at <= $2 AND status = 'success' THEN 1 END) as current_success,
         COUNT(CASE WHEN created_at >= $1 AND created_at <= $2 AND status = 'error' THEN 1 END) as current_errors
       FROM usage_logs`,
      [start, end, prevStart, prevEnd]
    );

    const apiStats = apiStatsResult.rows[0] as {
      current_requests: string;
      prev_requests: string;
      total_requests: string;
      current_tokens: string;
      total_tokens: string;
      current_cost: string;
      current_success: string;
      current_errors: string;
    };

    // 余额统计
    const balanceStatsResult = await pool.query(
      `SELECT
         COALESCE(SUM(balance::numeric), 0) as total_balance,
         COALESCE(SUM(total_deposited::numeric), 0) as total_deposited,
         COALESCE(SUM(total_spent::numeric), 0) as total_spent
       FROM user_balances`
    );

    const balanceStats = balanceStatsResult.rows[0] as {
      total_balance: string;
      total_deposited: string;
      total_spent: string;
    };

    // 计算增长率
    const calcGrowth = (current: number, prev: number): string => {
      if (prev === 0) return current > 0 ? '+100.00' : '0.00';
      return ((current - prev) / prev * 100).toFixed(2);
    };

    const currentRevenue = parseFloat(revenueStats.current_revenue);
    const prevRevenue = parseFloat(revenueStats.prev_revenue);
    const currentRequests = parseInt(apiStats.current_requests, 10);
    const prevRequests = parseInt(apiStats.prev_requests, 10);
    const newUsers = parseInt(userStats.new_users, 10);
    const prevNewUsers = parseInt(userStats.prev_new_users, 10);

      res.json(
        successResponse({
          users: {
            total: parseInt(userStats.total_users, 10),
            active: parseInt(userStats.active_users, 10),
            new: newUsers,
            newGrowth: calcGrowth(newUsers, prevNewUsers),
            dau: parseInt(userStats.dau_approx, 10),
            mau: parseInt(userStats.mau_approx, 10),
          },
          revenue: {
            current: currentRevenue,
            previous: prevRevenue,
            total: parseFloat(revenueStats.total_revenue),
            growth: calcGrowth(currentRevenue, prevRevenue),
          },
          api: {
            requests: currentRequests,
            requestsGrowth: calcGrowth(currentRequests, prevRequests),
            totalRequests: parseInt(apiStats.total_requests, 10),
            tokens: parseInt(apiStats.current_tokens, 10),
            totalTokens: parseInt(apiStats.total_tokens, 10),
            cost: parseFloat(apiStats.current_cost),
            successRate:
              currentRequests > 0
                ? (
                    (parseInt(apiStats.current_success, 10) / currentRequests) *
                    100
                  ).toFixed(2)
                : '0.00',
            errorCount: parseInt(apiStats.current_errors, 10),
          },
          balance: {
            total: parseFloat(balanceStats.total_balance),
            totalDeposited: parseFloat(balanceStats.total_deposited),
            totalSpent: parseFloat(balanceStats.total_spent),
          },
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
            label: query.period,
          },
        })
      );
  }
);

/**
 * 获取 API 调用统计
 * GET /admin/dashboard/api-stats
 */
adminDashboardRouter.get(
  '/api-stats',
  authenticateAdminAsync,
  requirePermission('dashboard:read'),
  validateQuery(timeRangeSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof timeRangeSchema>;
    const { start, end } = getDateRange(query.period, query.startDate, query.endDate);

    // 按模型统计
    const byModelResult = await pool.query(
      `SELECT
         model,
         provider,
         COUNT(*) as request_count,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost::numeric), 0) as total_cost,
         COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
         COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
         AVG(latency_ms) as avg_latency
       FROM usage_logs
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY model, provider
       ORDER BY request_count DESC`,
      [start, end]
    );

    // 按小时统计
    const hourlyResult = await pool.query(
      `SELECT
         DATE_TRUNC('hour', created_at) as hour,
         COUNT(*) as request_count,
         COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
         COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count
       FROM usage_logs
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY DATE_TRUNC('hour', created_at)
       ORDER BY hour`,
      [start, end]
    );

    // 按天统计
    const dailyResult = await pool.query(
      `SELECT
         DATE_TRUNC('day', created_at) as day,
         COUNT(*) as request_count,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost::numeric), 0) as total_cost
       FROM usage_logs
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY DATE_TRUNC('day', created_at)
       ORDER BY day`,
      [start, end]
    );

    // 错误类型统计
    const errorsResult = await pool.query(
      `SELECT
         error_message,
         COUNT(*) as count
       FROM usage_logs
       WHERE created_at >= $1 AND created_at <= $2
         AND status = 'error'
         AND error_message IS NOT NULL
       GROUP BY error_message
       ORDER BY count DESC
       LIMIT 10`,
      [start, end]
    );

    // 按 provider 聚合
    const byProviderResult = await pool.query(
      `SELECT
         provider,
         COUNT(*) as request_count,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost::numeric), 0) as total_cost,
         COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
         COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
         AVG(latency_ms) as avg_latency
       FROM usage_logs
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY provider
       ORDER BY request_count DESC`,
      [start, end]
    );

    // 延迟分布
    const latencyResult = await pool.query(
      `SELECT
         CASE
           WHEN latency_ms < 1000 THEN '<1s'
           WHEN latency_ms < 3000 THEN '1-3s'
           WHEN latency_ms < 5000 THEN '3-5s'
           WHEN latency_ms < 10000 THEN '5-10s'
           ELSE '>10s'
         END as latency_bucket,
         COUNT(*) as count
       FROM usage_logs
       WHERE created_at >= $1 AND created_at <= $2
         AND latency_ms IS NOT NULL
       GROUP BY 1
       ORDER BY
         MIN(latency_ms) ASC`,
      [start, end]
    );

    const byModel = (byModelResult.rows || []).map((row: unknown) => {
      const r = row as {
        model: string;
        provider: string;
        request_count: string;
        total_tokens: string;
        total_cost: string;
        success_count: string;
        error_count: string;
        avg_latency: string | null;
      };
      return {
        model: r.model,
        provider: r.provider,
        requestCount: parseInt(r.request_count, 10),
        totalTokens: parseInt(r.total_tokens, 10),
        totalCost: parseFloat(r.total_cost),
        successCount: parseInt(r.success_count, 10),
        errorCount: parseInt(r.error_count, 10),
        successRate:
          parseInt(r.request_count, 10) > 0
            ? (
                (parseInt(r.success_count, 10) /
                  parseInt(r.request_count, 10)) *
                100
              ).toFixed(2)
            : '0.00',
        avgLatencyMs: r.avg_latency ? parseFloat(r.avg_latency).toFixed(0) : null,
      };
    });

    const byProvider = (byProviderResult.rows || []).map((row: unknown) => {
      const r = row as {
        provider: string;
        request_count: string;
        total_tokens: string;
        total_cost: string;
        success_count: string;
        error_count: string;
        avg_latency: string | null;
      };
      return {
        provider: r.provider,
        requestCount: parseInt(r.request_count, 10),
        totalTokens: parseInt(r.total_tokens, 10),
        totalCost: parseFloat(r.total_cost),
        successCount: parseInt(r.success_count, 10),
        errorCount: parseInt(r.error_count, 10),
        successRate:
          parseInt(r.request_count, 10) > 0
            ? (
                (parseInt(r.success_count, 10) /
                  parseInt(r.request_count, 10)) *
                100
              ).toFixed(2)
            : '0.00',
        avgLatencyMs: r.avg_latency ? parseFloat(r.avg_latency).toFixed(0) : null,
      };
    });

    const hourly = (hourlyResult.rows || []).map((row: unknown) => {
      const r = row as {
        hour: Date;
        request_count: string;
        success_count: string;
        error_count: string;
      };
      return {
        hour: r.hour,
        requestCount: parseInt(r.request_count, 10),
        successCount: parseInt(r.success_count, 10),
        errorCount: parseInt(r.error_count, 10),
      };
    });

    const daily = (dailyResult.rows || []).map((row: unknown) => {
      const r = row as {
        day: Date;
        request_count: string;
        total_tokens: string;
        total_cost: string;
      };
      return {
        day: r.day,
        requestCount: parseInt(r.request_count, 10),
        totalTokens: parseInt(r.total_tokens, 10),
        totalCost: parseFloat(r.total_cost),
      };
    });

    const errors = (errorsResult.rows || []).map((row: unknown) => {
      const r = row as { error_message: string; count: string };
      return {
        message: r.error_message,
        count: parseInt(r.count, 10),
      };
    });

    const latencyDistribution = (latencyResult.rows || []).map((row: unknown) => {
      const r = row as { latency_bucket: string; count: string };
      return {
        bucket: r.latency_bucket,
        count: parseInt(r.count, 10),
      };
    });

      res.json(
        successResponse({
          byModel,
          byProvider,
          hourly,
          daily,
          errors,
          latencyDistribution,
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
        })
      );
  }
);

/**
 * 获取 Token 消耗统计
 * GET /admin/dashboard/token-stats
 */
adminDashboardRouter.get(
  '/token-stats',
  authenticateAdminAsync,
  requirePermission('dashboard:read'),
  validateQuery(timeRangeSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof timeRangeSchema>;
    const { start, end } = getDateRange(query.period, query.startDate, query.endDate);

    // 按模型的 Token 消耗
    const byModelResult = await pool.query(
      `SELECT
         model,
         provider,
         COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) as completion_tokens,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost::numeric), 0) as total_cost,
         COUNT(*) as request_count
       FROM usage_logs
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY model, provider
       ORDER BY total_tokens DESC`,
      [start, end]
    );

    // 按天的 Token 消耗趋势
    const dailyResult = await pool.query(
      `SELECT
         DATE_TRUNC('day', created_at) as day,
         COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) as completion_tokens,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost::numeric), 0) as total_cost
       FROM usage_logs
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY DATE_TRUNC('day', created_at)
       ORDER BY day`,
      [start, end]
    );

    // Top 10 用户 Token 消耗
    const topUsersResult = await pool.query(
      `SELECT
         ul.user_id,
         u.email,
         u.name,
         COALESCE(SUM(ul.total_tokens), 0) as total_tokens,
         COALESCE(SUM(ul.cost::numeric), 0) as total_cost,
         COUNT(*) as request_count
       FROM usage_logs ul
       LEFT JOIN users u ON ul.user_id = u.id
       WHERE ul.created_at >= $1 AND ul.created_at <= $2
         AND ul.user_id IS NOT NULL
       GROUP BY ul.user_id, u.email, u.name
       ORDER BY total_tokens DESC
       LIMIT 10`,
      [start, end]
    );

    // 按 provider 的 Token 消耗
    const byProviderResult = await pool.query(
      `SELECT
         provider,
         COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) as completion_tokens,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost::numeric), 0) as total_cost,
         COUNT(*) as request_count
       FROM usage_logs
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY provider
       ORDER BY total_tokens DESC`,
      [start, end]
    );

    // 汇总统计
    const summaryResult = await pool.query(
      `SELECT
         COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
         COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost::numeric), 0) as total_cost,
         COUNT(*) as total_requests,
         COUNT(DISTINCT user_id) as unique_users
       FROM usage_logs
       WHERE created_at >= $1 AND created_at <= $2`,
      [start, end]
    );

    const summary = summaryResult.rows[0] as {
      total_prompt_tokens: string;
      total_completion_tokens: string;
      total_tokens: string;
      total_cost: string;
      total_requests: string;
      unique_users: string;
    };

    const byModel = (byModelResult.rows || []).map((row: unknown) => {
      const r = row as {
        model: string;
        provider: string;
        prompt_tokens: string;
        completion_tokens: string;
        total_tokens: string;
        total_cost: string;
        request_count: string;
      };
      return {
        model: r.model,
        provider: r.provider,
        promptTokens: parseInt(r.prompt_tokens, 10),
        completionTokens: parseInt(r.completion_tokens, 10),
        totalTokens: parseInt(r.total_tokens, 10),
        totalCost: parseFloat(r.total_cost),
        requestCount: parseInt(r.request_count, 10),
        avgTokensPerRequest:
          parseInt(r.request_count, 10) > 0
            ? Math.round(
                parseInt(r.total_tokens, 10) / parseInt(r.request_count, 10)
              )
            : 0,
      };
    });

    const byProvider = (byProviderResult.rows || []).map((row: unknown) => {
      const r = row as {
        provider: string;
        prompt_tokens: string;
        completion_tokens: string;
        total_tokens: string;
        total_cost: string;
        request_count: string;
      };
      return {
        provider: r.provider,
        promptTokens: parseInt(r.prompt_tokens, 10),
        completionTokens: parseInt(r.completion_tokens, 10),
        totalTokens: parseInt(r.total_tokens, 10),
        totalCost: parseFloat(r.total_cost),
        requestCount: parseInt(r.request_count, 10),
        avgTokensPerRequest:
          parseInt(r.request_count, 10) > 0
            ? Math.round(
                parseInt(r.total_tokens, 10) / parseInt(r.request_count, 10)
              )
            : 0,
      };
    });

    const daily = (dailyResult.rows || []).map((row: unknown) => {
      const r = row as {
        day: Date;
        prompt_tokens: string;
        completion_tokens: string;
        total_tokens: string;
        total_cost: string;
      };
      return {
        day: r.day,
        promptTokens: parseInt(r.prompt_tokens, 10),
        completionTokens: parseInt(r.completion_tokens, 10),
        totalTokens: parseInt(r.total_tokens, 10),
        totalCost: parseFloat(r.total_cost),
      };
    });

    const topUsers = (topUsersResult.rows || []).map((row: unknown) => {
      const r = row as {
        user_id: string;
        email: string | null;
        name: string | null;
        total_tokens: string;
        total_cost: string;
        request_count: string;
      };
      return {
        userId: r.user_id,
        email: r.email,
        name: r.name,
        totalTokens: parseInt(r.total_tokens, 10),
        totalCost: parseFloat(r.total_cost),
        requestCount: parseInt(r.request_count, 10),
      };
    });

      res.json(
        successResponse({
          summary: {
            totalPromptTokens: parseInt(summary.total_prompt_tokens, 10),
            totalCompletionTokens: parseInt(summary.total_completion_tokens, 10),
            totalTokens: parseInt(summary.total_tokens, 10),
            totalCost: parseFloat(summary.total_cost),
            totalRequests: parseInt(summary.total_requests, 10),
            uniqueUsers: parseInt(summary.unique_users, 10),
            avgTokensPerRequest:
              parseInt(summary.total_requests, 10) > 0
                ? Math.round(
                    parseInt(summary.total_tokens, 10) /
                      parseInt(summary.total_requests, 10)
                  )
                : 0,
            avgCostPerRequest:
              parseInt(summary.total_requests, 10) > 0
                ? (
                    parseFloat(summary.total_cost) /
                    parseInt(summary.total_requests, 10)
                  ).toFixed(6)
                : '0.000000',
          },
          byModel,
          byProvider,
          daily,
          topUsers,
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
        })
      );
  }
);

/**
 * 获取每日收入统计
 * GET /admin/dashboard/revenue-stats
 */
adminDashboardRouter.get(
  '/revenue-stats',
  authenticateAdminAsync,
  requirePermission('dashboard:read'),
  validateQuery(timeRangeSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof timeRangeSchema>;
    const { start, end } = getDateRange(query.period, query.startDate, query.endDate);

    // 按天统计收入
    const dailyResult = await pool.query(
      `SELECT
         DATE_TRUNC('day', paid_at) as day,
         COALESCE(SUM(amount::numeric), 0) as revenue,
         COUNT(*) as transaction_count
       FROM payments
       WHERE status = 'succeeded'
         AND paid_at >= $1 AND paid_at <= $2
       GROUP BY DATE_TRUNC('day', paid_at)
       ORDER BY day`,
      [start, end]
    );

    // 按支付方式统计
    const byMethodResult = await pool.query(
      `SELECT
         payment_method,
         COALESCE(SUM(amount::numeric), 0) as revenue,
         COUNT(*) as transaction_count
       FROM payments
       WHERE status = 'succeeded'
         AND paid_at >= $1 AND paid_at <= $2
       GROUP BY payment_method
       ORDER BY revenue DESC`,
      [start, end]
    );

    // 今日入账
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayResult = await pool.query(
      `SELECT COALESCE(SUM(amount::numeric), 0) as today_revenue
       FROM payments
       WHERE status = 'succeeded'
         AND paid_at >= $1 AND paid_at <= $2`,
      [todayStart, todayEnd]
    );

    // 本月入账
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date();

    const monthResult = await pool.query(
      `SELECT COALESCE(SUM(amount::numeric), 0) as month_revenue
       FROM payments
       WHERE status = 'succeeded'
         AND paid_at >= $1 AND paid_at <= $2`,
      [monthStart, monthEnd]
    );

    const daily = (dailyResult.rows || []).map((row: unknown) => {
      const r = row as {
        day: Date;
        revenue: string;
        transaction_count: string;
      };
      return {
        day: r.day,
        revenue: parseFloat(r.revenue),
        transactionCount: parseInt(r.transaction_count, 10),
      };
    });

    const byMethod = (byMethodResult.rows || []).map((row: unknown) => {
      const r = row as {
        payment_method: string;
        revenue: string;
        transaction_count: string;
      };
      return {
        paymentMethod: r.payment_method,
        revenue: parseFloat(r.revenue),
        transactionCount: parseInt(r.transaction_count, 10),
      };
    });

    const todayRevenue = parseFloat((todayResult.rows[0] as { today_revenue: string }).today_revenue);
    const monthRevenue = parseFloat((monthResult.rows[0] as { month_revenue: string }).month_revenue);

      res.json(
        successResponse({
          daily,
          byMethod,
          todayRevenue,
          monthRevenue,
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
        })
      );
  }
);

/**
 * 获取提现申请提醒
 * GET /admin/dashboard/withdrawal-alerts
 */
adminDashboardRouter.get(
  '/withdrawal-alerts',
  authenticateAdminAsync,
  requirePermission('dashboard:read'),
  async (_req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT
         COUNT(*) as pending_count,
         COALESCE(SUM(amount::numeric), 0) as pending_amount
       FROM referral_withdrawals
       WHERE status = 'pending'`
    );

    const stats = result.rows[0] as {
      pending_count: string;
      pending_amount: string;
    };

    res.json(
      successResponse({
        pendingCount: parseInt(stats.pending_count, 10),
        pendingAmount: parseFloat(stats.pending_amount),
      })
    );
  }
);

/**
 * 获取新增用户统计
 * GET /admin/dashboard/new-users-stats
 */
adminDashboardRouter.get(
  '/new-users-stats',
  authenticateAdminAsync,
  requirePermission('dashboard:read'),
  validateQuery(timeRangeSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof timeRangeSchema>;
    const { start, end } = getDateRange(query.period, query.startDate, query.endDate);

    // 按天统计新增用户
    const dailyResult = await pool.query(
        `SELECT
           DATE_TRUNC('day', created_at) as day,
           COUNT(*) as new_users
         FROM users
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY DATE_TRUNC('day', created_at)
         ORDER BY day`,
        [start, end]
      );

      const daily = (dailyResult.rows || []).map((row: unknown) => {
        const r = row as {
          day: Date;
          new_users: string;
        };
        return {
          day: r.day,
          newUsers: parseInt(r.new_users, 10),
        };
      });

      res.json(
        successResponse({
          daily,
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
        })
      );
  }
);

/**
 * 增长指标统计（Dashboard v2 核心数据源）
 * GET /admin/dashboard/growth-stats
 *
 * 一次请求返回 Dashboard 所需全部增长指标：
 * - 毛利率、月收入、WAPU、首充转化率
 * - 收入 vs 成本日趋势（双轴图）
 * - 模型成本分布
 * - 留存率 & ARPU
 * - 高价值用户排行
 */
adminDashboardRouter.get(
  '/growth-stats',
  authenticateAdminAsync,
  requirePermission('dashboard:read'),
  validateQuery(timeRangeSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof timeRangeSchema>;
    const { start, end } = getDateRange(query.period, query.startDate, query.endDate);

    const duration = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - duration);
    const prevEnd = new Date(start.getTime());

    // 本月 & 上月边界
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date();
    const prevMonthStart = new Date(monthStart);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
    const prevMonthEnd = new Date(monthStart.getTime() - 1);

    // ── SQL 结果行类型 ──
    interface MarginRow {
      month_revenue: string;
      prev_month_revenue: string;
      month_cost: string;
      prev_month_cost: string;
    }
    interface ConversionRow {
      total_users: string;
      paid_users: string;
      new_paid_in_period: string;
      new_users_in_period: string;
      prev_new_paid: string;
      prev_new_users: string;
    }
    interface WapuRow { current_wapu: string; prev_wapu: string }
    interface RetentionRow {
      retained_7d: string; cohort_7d: string;
      retained_30d: string; cohort_30d: string;
    }
    interface ArpuRow { month_revenue: string; paying_users: string }
    interface DailyPnlRow {
      day: Date; revenue: string; cost: string;
      new_users: string; paid_users: string;
    }
    interface ModelRow {
      model: string; provider: string; request_count: string;
      total_tokens: string; total_cost: string; unique_users: string;
    }
    interface TopUserRow {
      user_id: string; email: string | null; name: string | null;
      total_deposited: string; total_cost: string; last_active: Date | null;
    }

    // ── 8 条查询并行执行（审核修复：串行 → Promise.all） ──
    const [
      marginResult, conversionResult, wapuResult, retentionResult,
      arpuResult, dailyPnlResult, modelProfitResult, topValueUsersResult,
    ] = await Promise.all([
      // 1. 毛利率（月维度）
      pool.query(
        `SELECT
           (SELECT COALESCE(SUM(amount::numeric), 0) FROM payments
            WHERE status = 'succeeded' AND paid_at >= $1 AND paid_at <= $2) as month_revenue,
           (SELECT COALESCE(SUM(amount::numeric), 0) FROM payments
            WHERE status = 'succeeded' AND paid_at >= $3 AND paid_at <= $4) as prev_month_revenue,
           (SELECT COALESCE(SUM(cost::numeric), 0) FROM usage_logs
            WHERE created_at >= $1 AND created_at <= $2) as month_cost,
           (SELECT COALESCE(SUM(cost::numeric), 0) FROM usage_logs
            WHERE created_at >= $3 AND created_at <= $4) as prev_month_cost`,
        [monthStart, monthEnd, prevMonthStart, prevMonthEnd]
      ),
      // 2. 首充转化率
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM users) as total_users,
           (SELECT COUNT(DISTINCT user_id) FROM payments WHERE status = 'succeeded') as paid_users,
           (SELECT COUNT(DISTINCT p.user_id) FROM payments p
            JOIN users u ON p.user_id = u.id
            WHERE p.status = 'succeeded' AND u.created_at >= $1 AND u.created_at <= $2) as new_paid_in_period,
           (SELECT COUNT(*) FROM users WHERE created_at >= $1 AND created_at <= $2) as new_users_in_period,
           (SELECT COUNT(DISTINCT p.user_id) FROM payments p
            JOIN users u ON p.user_id = u.id
            WHERE p.status = 'succeeded' AND u.created_at >= $3 AND u.created_at <= $4) as prev_new_paid,
           (SELECT COUNT(*) FROM users WHERE created_at >= $3 AND created_at <= $4) as prev_new_users`,
        [start, end, prevStart, prevEnd]
      ),
      // 3. WAPU（审核修复：IN → EXISTS 避免全表扫描）
      pool.query(
        `SELECT
           (SELECT COUNT(DISTINCT ul.user_id) FROM usage_logs ul
            WHERE ul.created_at >= NOW() - INTERVAL '7 days'
              AND EXISTS (SELECT 1 FROM payments p WHERE p.user_id = ul.user_id AND p.status = 'succeeded')
           ) as current_wapu,
           (SELECT COUNT(DISTINCT ul.user_id) FROM usage_logs ul
            WHERE ul.created_at >= NOW() - INTERVAL '14 days'
              AND ul.created_at < NOW() - INTERVAL '7 days'
              AND EXISTS (SELECT 1 FROM payments p WHERE p.user_id = ul.user_id AND p.status = 'succeeded')
           ) as prev_wapu`
      ),
      // 4. 留存率（审核修复：7日 cohort 限定为 7-14 天前注册的用户，与 30日一致）
      pool.query(
        `WITH active_7d AS (
           SELECT DISTINCT user_id FROM usage_logs WHERE created_at >= NOW() - INTERVAL '7 days'
         ),
         active_30d AS (
           SELECT DISTINCT user_id FROM usage_logs WHERE created_at >= NOW() - INTERVAL '30 days'
         )
         SELECT
           COUNT(DISTINCT CASE
             WHEN u.created_at < NOW() - INTERVAL '7 days' AND u.created_at >= NOW() - INTERVAL '14 days'
               AND a7.user_id IS NOT NULL
             THEN u.id END) as retained_7d,
           COUNT(DISTINCT CASE
             WHEN u.created_at < NOW() - INTERVAL '7 days' AND u.created_at >= NOW() - INTERVAL '14 days'
             THEN u.id END) as cohort_7d,
           COUNT(DISTINCT CASE
             WHEN u.created_at < NOW() - INTERVAL '30 days' AND u.created_at >= NOW() - INTERVAL '60 days'
               AND a30.user_id IS NOT NULL
             THEN u.id END) as retained_30d,
           COUNT(DISTINCT CASE
             WHEN u.created_at < NOW() - INTERVAL '30 days' AND u.created_at >= NOW() - INTERVAL '60 days'
             THEN u.id END) as cohort_30d
         FROM users u
         LEFT JOIN active_7d a7 ON u.id = a7.user_id
         LEFT JOIN active_30d a30 ON u.id = a30.user_id`
      ),
      // 5. ARPU（本月）
      pool.query(
        `SELECT
           COALESCE(SUM(amount::numeric), 0) as month_revenue,
           COUNT(DISTINCT user_id) as paying_users
         FROM payments
         WHERE status = 'succeeded' AND paid_at >= $1 AND paid_at <= $2`,
        [monthStart, monthEnd]
      ),
      // 6. 日粒度 P&L + 新增 & 首充用户
      pool.query(
        `SELECT
           d.day,
           COALESCE(r.revenue, 0) as revenue,
           COALESCE(c.cost, 0) as cost,
           COALESCE(nu.new_users, 0) as new_users,
           COALESCE(pu.paid_users, 0) as paid_users
         FROM (
           SELECT generate_series(
             DATE_TRUNC('day', $1::timestamp),
             DATE_TRUNC('day', $2::timestamp),
             '1 day'::interval
           ) as day
         ) d
         LEFT JOIN (
           SELECT DATE_TRUNC('day', paid_at) as day, SUM(amount::numeric) as revenue
           FROM payments WHERE status = 'succeeded' AND paid_at >= $1 AND paid_at <= $2
           GROUP BY 1
         ) r ON d.day = r.day
         LEFT JOIN (
           SELECT DATE_TRUNC('day', created_at) as day, SUM(cost::numeric) as cost
           FROM usage_logs WHERE created_at >= $1 AND created_at <= $2
           GROUP BY 1
         ) c ON d.day = c.day
         LEFT JOIN (
           SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as new_users
           FROM users WHERE created_at >= $1 AND created_at <= $2
           GROUP BY 1
         ) nu ON d.day = nu.day
         LEFT JOIN (
           SELECT DATE_TRUNC('day', first_paid) as day, COUNT(*) as paid_users
           FROM (
             SELECT user_id, MIN(paid_at) as first_paid
             FROM payments WHERE status = 'succeeded' GROUP BY user_id
           ) fp WHERE fp.first_paid >= $1 AND fp.first_paid <= $2
           GROUP BY 1
         ) pu ON d.day = pu.day
         ORDER BY d.day`,
        [start, end]
      ),
      // 7. 模型成本分布 Top 10
      pool.query(
        `SELECT
           model, provider,
           COUNT(*) as request_count,
           COALESCE(SUM(total_tokens), 0) as total_tokens,
           COALESCE(SUM(cost::numeric), 0) as total_cost,
           COUNT(DISTINCT user_id) as unique_users
         FROM usage_logs
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY model, provider
         ORDER BY total_cost DESC
         LIMIT 10`,
        [start, end]
      ),
      // 8. 高价值用户 Top 10
      pool.query(
        `SELECT
           u.id as user_id, u.email, u.name,
           COALESCE(ub.total_deposited::numeric, 0) as total_deposited,
           COALESCE(cs.total_cost, 0) as total_cost,
           COALESCE(cs.last_active, u.created_at) as last_active
         FROM users u
         LEFT JOIN user_balances ub ON u.id = ub.user_id
         LEFT JOIN (
           SELECT user_id, SUM(cost::numeric) as total_cost, MAX(created_at) as last_active
           FROM usage_logs GROUP BY user_id
         ) cs ON u.id = cs.user_id
         WHERE COALESCE(ub.total_deposited::numeric, 0) > 0
         ORDER BY COALESCE(ub.total_deposited::numeric, 0) DESC
         LIMIT 10`
      ),
    ]);

    // ── 解析 & 计算 ──
    const calcGrowth = (current: number, prev: number): string => {
      if (prev === 0) return current > 0 ? '+100.00' : '0.00';
      return ((current - prev) / prev * 100).toFixed(2);
    };

    const mg = (marginResult.rows[0] ?? {}) as Partial<MarginRow>;
    const cv = (conversionResult.rows[0] ?? {}) as Partial<ConversionRow>;
    const wp = (wapuResult.rows[0] ?? {}) as Partial<WapuRow>;
    const rt = (retentionResult.rows[0] ?? {}) as Partial<RetentionRow>;
    const ar = (arpuResult.rows[0] ?? {}) as Partial<ArpuRow>;

    const monthRevenue = parseFloat(mg.month_revenue ?? '0');
    const prevMonthRevenue = parseFloat(mg.prev_month_revenue ?? '0');
    const monthCost = parseFloat(mg.month_cost ?? '0');
    const prevMonthCost = parseFloat(mg.prev_month_cost ?? '0');
    const totalUsers = parseInt(cv.total_users ?? '0', 10);
    const paidUsers = parseInt(cv.paid_users ?? '0', 10);
    const newPaidInPeriod = parseInt(cv.new_paid_in_period ?? '0', 10);
    const newUsersInPeriod = parseInt(cv.new_users_in_period ?? '0', 10);
    const prevNewPaid = parseInt(cv.prev_new_paid ?? '0', 10);
    const prevNewUsers = parseInt(cv.prev_new_users ?? '0', 10);
    const currentWapu = parseInt(wp.current_wapu ?? '0', 10);
    const prevWapu = parseInt(wp.prev_wapu ?? '0', 10);
    const retained7d = parseInt(rt.retained_7d ?? '0', 10);
    const cohort7d = parseInt(rt.cohort_7d ?? '0', 10);
    const retained30d = parseInt(rt.retained_30d ?? '0', 10);
    const cohort30d = parseInt(rt.cohort_30d ?? '0', 10);
    const monthPayingUsers = parseInt(ar.paying_users ?? '0', 10);
    const arpuMonthRevenue = parseFloat(ar.month_revenue ?? '0');

    const periodRate = newUsersInPeriod > 0 ? (newPaidInPeriod / newUsersInPeriod * 100) : 0;
    const prevPeriodRate = prevNewUsers > 0 ? (prevNewPaid / prevNewUsers * 100) : 0;

    res.json(
      successResponse({
        grossMargin: {
          monthRevenue,
          prevMonthRevenue,
          monthCost,
          prevMonthCost,
          revenueGrowth: calcGrowth(monthRevenue, prevMonthRevenue),
        },
        conversion: {
          totalUsers,
          paidUsers,
          overallRate: totalUsers > 0 ? (paidUsers / totalUsers * 100).toFixed(2) : '0.00',
          periodRate: periodRate.toFixed(2),
          periodRateChange: calcGrowth(periodRate, prevPeriodRate),
        },
        wapu: {
          current: currentWapu,
          previous: prevWapu,
          change: calcGrowth(currentWapu, prevWapu),
        },
        retention: {
          day7: {
            retained: retained7d,
            cohort: cohort7d,
            rate: cohort7d > 0 ? (retained7d / cohort7d * 100).toFixed(2) : '0.00',
          },
          day30: {
            retained: retained30d,
            cohort: cohort30d,
            rate: cohort30d > 0 ? (retained30d / cohort30d * 100).toFixed(2) : '0.00',
          },
        },
        arpu: {
          value: monthPayingUsers > 0 ? parseFloat((arpuMonthRevenue / monthPayingUsers).toFixed(2)) : 0,
          payingUsers: monthPayingUsers,
        },
        dailyPnl: (dailyPnlResult.rows || []).map((row: unknown) => {
          const r = row as DailyPnlRow;
          return {
            day: r.day,
            revenue: parseFloat(String(r.revenue)),
            cost: parseFloat(String(r.cost)),
            newUsers: parseInt(String(r.new_users), 10),
            paidUsers: parseInt(String(r.paid_users), 10),
          };
        }),
        modelProfit: (modelProfitResult.rows || []).map((row: unknown) => {
          const r = row as ModelRow;
          return {
            model: r.model,
            provider: r.provider,
            requestCount: parseInt(r.request_count, 10),
            totalTokens: parseInt(r.total_tokens, 10),
            totalCost: parseFloat(r.total_cost),
            uniqueUsers: parseInt(r.unique_users, 10),
          };
        }),
        topValueUsers: (topValueUsersResult.rows || []).map((row: unknown) => {
          const r = row as TopUserRow;
          return {
            userId: r.user_id,
            email: r.email,
            name: r.name,
            totalDeposited: parseFloat(r.total_deposited),
            totalCost: parseFloat(r.total_cost),
            lastActive: r.last_active,
          };
        }),
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      })
    );
  }
);

export default adminDashboardRouter;
