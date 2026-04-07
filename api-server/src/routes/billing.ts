import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse, paginationMeta } from '../utils/response.js';
import { validateBody, validateQuery, validateParams, CommonSchemas } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { billingService } from '../services/billing.js';
import { discountService } from '../services/discount.js';
import { redeemCodeService } from '../services/redeem-code.js';
import { stripeService } from '../services/stripe.js';
import { xunhupayService } from '../services/xunhupay.js';
import { db } from '../db/index.js';
import { pool } from '../db/index.js';
import { userBalances } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { ValidationError } from '../utils/errors.js';
import { paymentConfigService } from '../services/payment-config.js';
import { env } from '../utils/env.js';

export const billingRouter = Router();

function shouldRedirectToFrontendBilling(): boolean {
  if (!env.FRONTEND_URL) {
    return false;
  }

  // 如果前端地址和后端地址相同，不跳转（避免跳转到不存在的后端路由）
  if (env.FRONTEND_URL === env.API_BASE_URL) {
    return false;
  }

  if (env.NODE_ENV !== 'production') {
    return true;
  }

  try {
    const hostname = new URL(env.FRONTEND_URL).hostname;
    return hostname !== 'localhost' && hostname !== '127.0.0.1';
  } catch {
    return false;
  }
}

function buildFrontendBillingUrl(params: Record<string, string>): string | null {
  if (!shouldRedirectToFrontendBilling()) {
    return null;
  }

  const url = new URL('/billing', env.FRONTEND_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderCheckoutResultPage(params: {
  title: string;
  message: string;
  status: 'success' | 'warning' | 'error';
  orderId?: string;
}): string {
  const accentColor = params.status === 'success'
    ? '#0f766e'
    : params.status === 'warning'
      ? '#9a3412'
      : '#991b1b';

  const orderIdLine = params.orderId
    ? `<p style="margin:12px 0 0;color:#334155;font-size:14px;">订单号：<code>${escapeHtml(params.orderId)}</code></p>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#0f172a;">
  <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
    <section style="width:100%;max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:24px;">
      <h1 style="margin:0 0 10px;font-size:22px;color:${accentColor};">${escapeHtml(params.title)}</h1>
      <p style="margin:0;color:#334155;line-height:1.6;">${escapeHtml(params.message)}</p>
      ${orderIdLine}
      <p style="margin:16px 0 0;color:#64748b;font-size:13px;">现在可以关闭此页面并返回应用继续操作。</p>
    </section>
  </main>
</body>
</html>`;
}

// ==========================================
// 公开路由（不需要认证）
// ==========================================

/**
 * 获取可用支付方式
 * GET /api/billing/payment-methods
 */
billingRouter.get(
  '/payment-methods',
  async (_req: Request, res: Response) => {
    const methods = await paymentConfigService.getAvailablePaymentMethods();
    res.json(successResponse(methods));
  }
);

/**
 * Stripe 充值成功页面处理（公开）
 * GET /api/billing/recharge/success
 */
billingRouter.get(
  '/recharge/success',
  async (req: Request, res: Response) => {
    const { session_id } = req.query;

    if (!session_id || typeof session_id !== 'string') {
      const redirectUrl = buildFrontendBillingUrl({ error: 'invalid_session' });
      if (redirectUrl) {
        res.redirect(302, redirectUrl);
        return;
      }

      res
        .status(400)
        .type('html')
        .send(renderCheckoutResultPage({
          title: '支付参数错误',
          message: '缺少有效的 session_id，无法确认支付结果。',
          status: 'error',
        }));
      return;
    }

    try {
      const status = await stripeService.getCheckoutSessionStatus(session_id);

      const queryParams: Record<string, string> = { orderId: status.orderId };
      if (status.status === 'succeeded') {
        queryParams.success = 'true';
      } else {
        queryParams.status = status.status;
      }

      const redirectUrl = buildFrontendBillingUrl(queryParams);
      if (redirectUrl) {
        res.redirect(302, redirectUrl);
        return;
      }

      if (status.status === 'succeeded') {
        res
          .status(200)
          .type('html')
          .send(renderCheckoutResultPage({
            title: '支付成功',
            message: '支付已完成，余额通常会在几秒内到账。',
            status: 'success',
            orderId: status.orderId,
          }));
        return;
      }

      res
        .status(200)
        .type('html')
        .send(renderCheckoutResultPage({
          title: '支付处理中',
          message: `当前支付状态为 ${status.status}，请稍后在应用内刷新确认。`,
          status: 'warning',
          orderId: status.orderId,
        }));
    } catch {
      const redirectUrl = buildFrontendBillingUrl({ error: 'check_failed' });
      if (redirectUrl) {
        res.redirect(302, redirectUrl);
        return;
      }

      res
        .status(500)
        .type('html')
        .send(renderCheckoutResultPage({
          title: '支付结果查询失败',
          message: '服务器暂时无法确认支付状态，请稍后在应用内刷新查看。',
          status: 'error',
        }));
    }
  }
);

/**
 * Stripe 充值取消页面处理（公开）
 * GET /api/billing/recharge/cancel
 */
billingRouter.get(
  '/recharge/cancel',
  async (_req: Request, res: Response) => {
    const redirectUrl = buildFrontendBillingUrl({ cancelled: 'true' });
    if (redirectUrl) {
      res.redirect(302, redirectUrl);
      return;
    }

    res
      .status(200)
      .type('html')
      .send(renderCheckoutResultPage({
        title: '已取消支付',
        message: '你已取消本次支付，不会产生扣款。',
        status: 'warning',
      }));
  }
);

// 以下路由需要认证
billingRouter.use(authenticate);

// ==========================================
// Schemas
// ==========================================

const usageQuerySchema = CommonSchemas.pagination.extend({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  model: z.string().optional(),
});

const transactionsQuerySchema = CommonSchemas.pagination.extend({
  type: z.enum(['deposit', 'usage', 'refund', 'bonus', 'adjustment']).optional(),
});

const rechargesQuerySchema = CommonSchemas.pagination.extend({
  status: z.enum(['pending', 'succeeded', 'failed', 'refunded']).optional(),
});

const stripeRechargeSchema = z.object({
  amount: z.number().int().min(100).max(1000000),
  currency: z.string().length(3).optional(),
});

const xunhupayRechargeSchema = z.object({
  amount: z.number().int().min(100).max(100000),
  paymentType: z.enum(['wechat', 'alipay']).default('wechat'),
  returnUrl: z.string().url().optional(),
});

const purchasePeriodCardSchema = z.object({
  planId: z.string().uuid(),
  paymentType: z.enum(['wechat', 'alipay']).default('wechat'),
  returnUrl: z.string().url().optional(),
});

const packageRechargeSchema = z.object({
  packageId: z.string().uuid(),
  paymentType: z.enum(['wechat', 'alipay']).default('wechat'),
  returnUrl: z.string().url().optional(),
});

const orderIdParamSchema = z.object({
  orderId: CommonSchemas.uuid,
});

const upgradePeriodCardSchema = z.object({
  planId: z.string().uuid(),
  paymentType: z.enum(['wechat', 'alipay']).default('wechat'),
  returnUrl: z.string().url().optional(),
});

const periodCardHistorySchema = CommonSchemas.pagination;

// ==========================================
// 积分相关路由
// ==========================================

/**
 * 获取用户积分余额
 * GET /api/billing/credits
 */
billingRouter.get(
  '/credits',
  async (req: Request, res: Response) => {
    const userId = req.userId!;

    const balanceResult = await db
      .select()
      .from(userBalances)
      .where(eq(userBalances.userId, userId))
      .limit(1);

    if (balanceResult.length === 0) {
      res.json(successResponse({
        credits: 0,
        totalCreditsPurchased: 0,
        totalCreditsConsumed: 0,
      }));
      return;
    }

    const balance = balanceResult[0]!;
    res.json(successResponse({
      credits: parseFloat(balance.credits),
      totalCreditsPurchased: parseFloat(balance.totalCreditsPurchased),
      totalCreditsConsumed: parseFloat(balance.totalCreditsConsumed),
    }));
  }
);

/**
 * 获取充值套餐列表
 * GET /api/billing/packages
 */
billingRouter.get(
  '/packages',
  async (_req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT id, name, description, credits, price_cents, currency, bonus_credits, sort_order
       FROM credit_packages
       WHERE is_enabled = true
       ORDER BY sort_order ASC`
    );

    const packages = (result.rows as Array<{
      id: string;
      name: string;
      description: string | null;
      credits: string;
      price_cents: number;
      currency: string;
      bonus_credits: string;
      sort_order: number;
    }>).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      credits: parseFloat(row.credits),
      priceCents: row.price_cents,
      priceYuan: (row.price_cents / 100).toFixed(2),
      currency: row.currency,
      bonusCredits: parseFloat(row.bonus_credits),
      totalCredits: parseFloat(row.credits) + parseFloat(row.bonus_credits),
    }));

    res.json(successResponse(packages));
  }
);

/**
 * 获取模型价格列表（积分）
 * GET /api/billing/pricing
 */
billingRouter.get(
  '/pricing',
  async (_req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT
        m.id,
        m.display_name,
        m.provider,
        m.input_credits_per_mtok,
        m.output_credits_per_mtok,
        m.cache_read_credits_per_mtok,
        m.cache_write_credits_per_mtok,
        m.max_tokens,
        m.max_context_length
      FROM models m
      WHERE m.is_enabled = true
        AND COALESCE((to_jsonb(m) ->> 'is_hidden')::boolean, false) = false
      ORDER BY m.sort_order ASC, m.provider, m.id`
    );

    const models = (result.rows as Array<{
      id: string;
      display_name: string;
      provider: string;
      input_credits_per_mtok: string | null;
      output_credits_per_mtok: string | null;
      cache_read_credits_per_mtok: string | null;
      cache_write_credits_per_mtok: string | null;
      max_tokens: number;
      max_context_length: number;
    }>).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      provider: row.provider,
      pricing: {
        inputCreditsPerMtok: parseFloat(row.input_credits_per_mtok ?? '0'),
        outputCreditsPerMtok: parseFloat(row.output_credits_per_mtok ?? '0'),
        cacheReadCreditsPerMtok: parseFloat(row.cache_read_credits_per_mtok ?? '0'),
        cacheWriteCreditsPerMtok: parseFloat(row.cache_write_credits_per_mtok ?? '0'),
      },
      limits: {
        maxTokens: row.max_tokens,
        maxContextLength: row.max_context_length,
      },
    }));

    res.json(successResponse({
      models,
      unit: '积分/百万token',
      note: '1 积分 = 0.1 元人民币',
    }));
  }
);

/**
 * 费用估算（积分）
 * POST /api/billing/estimate
 */
billingRouter.post(
  '/estimate',
  validateBody(z.object({
    model: z.string(),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    cacheReadTokens: z.number().int().min(0).optional(),
    cacheWriteTokens: z.number().int().min(0).optional(),
  })),
  async (req: Request, res: Response) => {
    const { model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = req.body;

    const calculation = await billingService.calculateCredits(
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens ?? 0,
      cacheWriteTokens ?? 0
    );

    res.json(successResponse({
      model: calculation.model,
      inputTokens: calculation.inputTokens,
      outputTokens: calculation.outputTokens,
      cacheReadTokens: calculation.cacheReadTokens,
      cacheWriteTokens: calculation.cacheWriteTokens,
      inputCredits: calculation.inputCredits,
      outputCredits: calculation.outputCredits,
      cacheReadCredits: calculation.cacheReadCredits,
      cacheWriteCredits: calculation.cacheWriteCredits,
      totalCredits: calculation.totalCredits,
      unit: '积分',
    }));
  }
);

// ==========================================
// 使用记录和交易记录
// ==========================================

/**
 * 获取使用记录
 * GET /api/billing/usage
 */
billingRouter.get(
  '/usage',
  validateQuery(usageQuerySchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const query = req.query as unknown as z.infer<typeof usageQuerySchema>;

    const { records, total, summary } = await billingService.getUsageRecords(userId, {
      page: query.page,
      limit: query.limit,
      ...(query.startDate && { startDate: query.startDate }),
      ...(query.endDate && { endDate: query.endDate }),
      ...(query.model && { model: query.model }),
    });

    res.json(successResponse(records, { ...paginationMeta(total, query.page, query.limit), summary }));
  }
);

/**
 * 获取余额变动记录
 * GET /api/billing/transactions
 */
billingRouter.get(
  '/transactions',
  validateQuery(transactionsQuerySchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const query = req.query as unknown as z.infer<typeof transactionsQuerySchema>;

    const { records, total } = await billingService.getTransactionRecords(userId, {
      page: query.page,
      limit: query.limit,
      ...(query.type && { type: query.type }),
    });

    res.json(successResponse(records, paginationMeta(total, query.page, query.limit)));
  }
);

/**
 * 获取充值记录（查询 payments 表）
 * GET /api/billing/recharges
 */
billingRouter.get(
  '/recharges',
  validateQuery(rechargesQuerySchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const query = req.query as unknown as z.infer<typeof rechargesQuerySchema>;

    const { records, total } = await billingService.getRechargeRecords(userId, {
      page: query.page,
      limit: query.limit,
      ...(query.status && { status: query.status }),
    });

    res.json(successResponse(records, paginationMeta(total, query.page, query.limit)));
  }
);

// ==========================================
// 旧版余额接口（兼容）
// ==========================================

/**
 * 获取用户余额（兼容旧版 + 积分）
 * GET /api/billing/balance
 */
billingRouter.get(
  '/balance',
  async (req: Request, res: Response) => {
    const userId = req.userId!;

    const balanceResult = await db
      .select()
      .from(userBalances)
      .where(eq(userBalances.userId, userId))
      .limit(1);

    if (balanceResult.length === 0) {
      res.json(successResponse({
        balance: '0',
        currency: 'CNY',
        totalDeposited: '0',
        totalSpent: '0',
        credits: 0,
        totalCreditsPurchased: 0,
        totalCreditsConsumed: 0,
      }));
      return;
    }

    const balance = balanceResult[0]!;
    res.json(successResponse({
      balance: balance.credits,
      currency: balance.currency,
      totalDeposited: balance.totalCreditsPurchased,
      totalSpent: balance.totalCreditsConsumed,
      credits: parseFloat(balance.credits),
      totalCreditsPurchased: parseFloat(balance.totalCreditsPurchased),
      totalCreditsConsumed: parseFloat(balance.totalCreditsConsumed),
    }));
  }
);

// ==========================================
// 充值路由
// ==========================================

/**
 * 通过套餐充值（虎皮椒）
 * POST /api/billing/recharge/package
 */
billingRouter.post(
  '/recharge/package',
  validateBody(packageRechargeSchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { packageId, paymentType, returnUrl } = req.body as z.infer<typeof packageRechargeSchema>;

    // 查询套餐信息
    const pkgResult = await pool.query(
      `SELECT id, name, credits, price_cents, currency, bonus_credits
       FROM credit_packages
       WHERE id = $1 AND is_enabled = true`,
      [packageId]
    );

    if (!pkgResult.rows || pkgResult.rows.length === 0) {
      throw new ValidationError('充值套餐不存在或已下架');
    }

    const pkg = pkgResult.rows[0] as {
      id: string;
      name: string;
      credits: string;
      price_cents: number;
      currency: string;
      bonus_credits: string;
    };

    const result = await xunhupayService.createRechargeOrder(
      userId,
      pkg.price_cents,
      paymentType,
      returnUrl
    );

    // 更新支付记录的 metadata，保存套餐积分信息
    // 这样 webhook 回调时可以正确充值积分
    const pkgCredits = parseFloat(pkg.credits);
    const pkgBonusCredits = parseFloat(pkg.bonus_credits);
    await pool.query(
      `UPDATE payments SET metadata = metadata || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ packageCredits: pkgCredits, packageBonusCredits: pkgBonusCredits, packageId: pkg.id }), result.orderId]
    );

    res.json(successResponse({
      orderId: result.orderId,
      payUrl: result.payUrl,
      qrcodeUrl: result.qrcodeUrl,
      package: {
        id: pkg.id,
        name: pkg.name,
        credits: parseFloat(pkg.credits),
        bonusCredits: parseFloat(pkg.bonus_credits),
        totalCredits: parseFloat(pkg.credits) + parseFloat(pkg.bonus_credits),
        priceCents: pkg.price_cents,
        priceYuan: (pkg.price_cents / 100).toFixed(2),
      },
    }));
  }
);

/**
 * 创建 Stripe 充值
 * POST /api/billing/recharge/stripe
 */
billingRouter.post(
  '/recharge/stripe',
  validateBody(stripeRechargeSchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { amount, currency } = req.body as z.infer<typeof stripeRechargeSchema>;

    const result = await stripeService.createRechargeCheckoutSession(
      userId,
      amount,
      currency?.toLowerCase()
    );

    res.json(successResponse({
      orderId: result.orderId,
      sessionId: result.sessionId,
      checkoutUrl: result.checkoutUrl,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }));
  }
);

/**
 * 创建虎皮椒充值
 * POST /api/billing/recharge/xunhupay
 */
billingRouter.post(
  '/recharge/xunhupay',
  validateBody(xunhupayRechargeSchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { amount, paymentType, returnUrl } = req.body as z.infer<typeof xunhupayRechargeSchema>;

    const result = await xunhupayService.createRechargeOrder(
      userId,
      amount,
      paymentType,
      returnUrl
    );

    res.json(successResponse({
      orderId: result.orderId,
      payUrl: result.payUrl,
      qrcodeUrl: result.qrcodeUrl,
    }));
  }
);

// ==========================================
// 期卡购买路由
// ==========================================

/**
 * 获取可用期卡套餐列表
 * GET /api/billing/period-card-plans
 */
billingRouter.get(
  '/period-card-plans',
  async (_req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT id, name, description, period_type, period_days, daily_credits, quota_mode, total_credits, price_cents, currency, sort_order
       FROM period_card_plans
       WHERE is_enabled = true
       ORDER BY sort_order ASC`
    );

    const plans = (result.rows as Array<{
      id: string;
      name: string;
      description: string | null;
      period_type: string;
      period_days: number;
      daily_credits: string;
      quota_mode: string;
      total_credits: string;
      price_cents: number;
      currency: string;
      sort_order: number;
    }>).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      periodType: row.period_type,
      periodDays: row.period_days,
      dailyCredits: parseFloat(row.daily_credits),
      quotaMode: row.quota_mode,
      totalCredits: parseFloat(row.total_credits),
      priceCents: row.price_cents,
      priceYuan: (row.price_cents / 100).toFixed(2),
      currency: row.currency,
    }));

    res.json(successResponse(plans));
  }
);

/**
 * 获取当前用户的期卡信息（返回数组，支持多卡）
 * GET /api/billing/period-card
 */
billingRouter.get(
  '/period-card',
  async (req: Request, res: Response) => {
    const userId = req.userId!;

    const result = await pool.query(
      `SELECT upc.id, upc.status, upc.starts_at, upc.expires_at,
              upc.daily_credits, upc.quota_reset_date,
              upc.quota_mode, upc.total_credits, upc.total_remaining,
              CASE
                WHEN upc.quota_mode = 'total' THEN upc.total_remaining
                WHEN upc.quota_reset_date != TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')
                  THEN upc.daily_credits
                ELSE upc.daily_quota_remaining
              END AS effective_quota_remaining,
              pcp.name as plan_name, pcp.period_type, pcp.period_days
       FROM user_period_cards upc
       JOIN period_card_plans pcp ON upc.plan_id = pcp.id
       WHERE upc.user_id = $1 AND upc.status = 'active' AND upc.expires_at > NOW()
       ORDER BY upc.expires_at ASC`,
      [userId]
    );

    const cards = result.rows.map((row: any) => ({
      id: row.id,
      status: row.status,
      planName: row.plan_name,
      periodType: row.period_type,
      periodDays: row.period_days,
      dailyCredits: parseFloat(row.daily_credits),
      dailyQuotaRemaining: parseFloat(row.effective_quota_remaining),
      quotaResetDate: row.quota_reset_date,
      quotaMode: row.quota_mode,
      totalCredits: parseFloat(row.total_credits),
      totalRemaining: parseFloat(row.total_remaining),
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
    }));

    res.json(successResponse(cards));
  }
);

/**
 * 购买期卡（虎皮椒）
 * POST /api/billing/purchase-period-card
 */
billingRouter.post(
  '/purchase-period-card',
  validateBody(purchasePeriodCardSchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { planId, paymentType, returnUrl } = req.body as z.infer<typeof purchasePeriodCardSchema>;

    // 查询期卡套餐
    const planResult = await pool.query(
      `SELECT id, name, period_type, period_days, daily_credits, quota_mode, total_credits, price_cents, currency
       FROM period_card_plans
       WHERE id = $1 AND is_enabled = true`,
      [planId]
    );

    if (!planResult.rows || planResult.rows.length === 0) {
      throw new ValidationError('期卡套餐不存在或已下架');
    }

    const plan = planResult.rows[0] as {
      id: string;
      name: string;
      period_type: string;
      period_days: number;
      daily_credits: string;
      quota_mode: string;
      total_credits: string;
      price_cents: number;
      currency: string;
    };

    const result = await xunhupayService.createRechargeOrder(
      userId,
      plan.price_cents,
      paymentType,
      returnUrl,
      {
        orderType: 'period_card_purchase',
        extraMetadata: {
          periodCardPlanId: plan.id,
          periodCardPlanName: plan.name,
          quota_mode: plan.quota_mode,
          daily_credits: parseFloat(plan.daily_credits),
          total_credits: parseFloat(plan.total_credits),
          period_days: plan.period_days,
        },
        description: `期卡购买-${plan.name}`.substring(0, 30),
      }
    );

    res.json(successResponse({
      orderId: result.orderId,
      payUrl: result.payUrl,
      qrcodeUrl: result.qrcodeUrl,
      plan: {
        id: plan.id,
        name: plan.name,
        periodType: plan.period_type,
        periodDays: plan.period_days,
        dailyCredits: parseFloat(plan.daily_credits),
        quotaMode: plan.quota_mode,
        totalCredits: parseFloat(plan.total_credits),
        priceCents: plan.price_cents,
        priceYuan: (plan.price_cents / 100).toFixed(2),
      },
    }));
  }
);

/**
 * 购买期卡（Stripe）
 * POST /api/billing/purchase-period-card/stripe
 */
billingRouter.post(
  '/purchase-period-card/stripe',
  validateBody(z.object({
    planId: z.string().uuid(),
  })),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { planId } = req.body as { planId: string };

    // 查询期卡套餐
    const planResult = await pool.query(
      `SELECT id, name, period_type, period_days, daily_credits, quota_mode, total_credits, price_cents, currency
       FROM period_card_plans
       WHERE id = $1 AND is_enabled = true`,
      [planId]
    );

    if (!planResult.rows || planResult.rows.length === 0) {
      throw new ValidationError('期卡套餐不存在或已下架');
    }

    const plan = planResult.rows[0] as {
      id: string;
      name: string;
      period_type: string;
      period_days: number;
      daily_credits: string;
      quota_mode: string;
      total_credits: string;
      price_cents: number;
      currency: string;
    };

    const result = await stripeService.createPeriodCardCheckoutSession(
      userId,
      plan.id,
      plan.name,
      plan.price_cents,
      plan.currency.toLowerCase(),
      {
        quota_mode: plan.quota_mode,
        daily_credits: String(parseFloat(plan.daily_credits)),
        total_credits: String(parseFloat(plan.total_credits)),
        period_days: String(plan.period_days),
      }
    );

    res.json(successResponse({
      orderId: result.orderId,
      sessionId: result.sessionId,
      checkoutUrl: result.checkoutUrl,
      plan: {
        id: plan.id,
        name: plan.name,
        periodType: plan.period_type,
        periodDays: plan.period_days,
        dailyCredits: parseFloat(plan.daily_credits),
        quotaMode: plan.quota_mode,
        totalCredits: parseFloat(plan.total_credits),
        priceCents: plan.price_cents,
        priceYuan: (plan.price_cents / 100).toFixed(2),
      },
    }));
  }
);

/**
 * 升级期卡（虎皮椒）
 * POST /api/billing/upgrade-period-card
 */
billingRouter.post(
  '/upgrade-period-card',
  validateBody(upgradePeriodCardSchema),
  async (_req: Request, res: Response) => {
    res.status(403).json({ success: false, error: { message: '期卡升级功能暂时冻结', code: 'UPGRADE_FROZEN' } });
  }
);

/**
 * 获取期卡历史记录
 * GET /api/billing/period-card-history
 */
billingRouter.get(
  '/period-card-history',
  validateQuery(periodCardHistorySchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const query = req.query as unknown as z.infer<typeof periodCardHistorySchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const recordsResult = await pool.query(
      `SELECT upc.id, upc.status, upc.starts_at, upc.expires_at,
              upc.daily_credits, upc.upgraded_to_id, upc.created_at,
              pcp.name AS plan_name, pcp.period_type, pcp.period_days, pcp.price_cents
       FROM user_period_cards upc
       JOIN period_card_plans pcp ON pcp.id = upc.plan_id
       WHERE upc.user_id = $1
       ORDER BY upc.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) AS count FROM user_period_cards WHERE user_id = $1`,
      [userId]
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const records = (recordsResult.rows as Array<{
      id: string;
      status: string;
      starts_at: Date;
      expires_at: Date;
      daily_credits: string;
      upgraded_to_id: string | null;
      created_at: Date;
      plan_name: string;
      period_type: string;
      period_days: number;
      price_cents: number;
    }>).map((row) => ({
      id: row.id,
      status: row.status,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      dailyCredits: parseFloat(row.daily_credits),
      upgradedToId: row.upgraded_to_id,
      createdAt: row.created_at,
      planName: row.plan_name,
      periodType: row.period_type,
      periodDays: row.period_days,
      priceCents: row.price_cents,
      priceYuan: (row.price_cents / 100).toFixed(2),
    }));

    res.json(successResponse(records, paginationMeta(total, page, limit)));
  }
);

/**
 * 查询充值状态
 * GET /api/billing/recharge/:orderId/status
 */
billingRouter.get(
  '/recharge/:orderId/status',
  validateParams(orderIdParamSchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { orderId } = req.params;

    const paymentResult = await pool.query(
      `SELECT id, payment_method FROM payments WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [orderId, userId]
    );

    if (!paymentResult.rows || paymentResult.rows.length === 0) {
      throw new ValidationError('订单不存在或无权限访问');
    }

    const payment = paymentResult.rows[0] as { id: string; payment_method: string };

    if (payment.payment_method === 'stripe') {
      const stripeStatus = await stripeService.getOrderStatus(orderId!);

      res.json(successResponse({
        orderId: stripeStatus.orderId,
        status: stripeStatus.status,
        amount: stripeStatus.amount,
        currency: stripeStatus.currency,
        paidAt: stripeStatus.paidAt?.toISOString() ?? null,
        paymentMethod: 'stripe',
      }));
      return;
    }

    if (payment.payment_method === 'xunhupay') {
      const xunhupayStatus = await xunhupayService.queryOrderByLocalId(orderId!);

      res.json(successResponse({
        orderId: xunhupayStatus.orderId,
        status: xunhupayStatus.status,
        transactionId: xunhupayStatus.transactionId,
        paidAt: xunhupayStatus.paidAt?.toISOString() ?? null,
        paymentMethod: 'xunhupay',
      }));
      return;
    }

    throw new ValidationError('不支持的支付方式');
  }
);

// ==========================================
// 折扣码验证
// ==========================================

const validateDiscountSchema = z.object({
  code: z.string().min(1).max(50),
  packageId: z.string().uuid().optional(),
  amount: z.number().int().min(0).optional(),
});

/**
 * 验证折扣码
 * POST /api/billing/discount/validate
 */
billingRouter.post(
  '/discount/validate',
  validateBody(validateDiscountSchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { code, packageId, amount } = req.body as z.infer<typeof validateDiscountSchema>;

    const result = await discountService.validateDiscountCode(code, userId, packageId, amount);

    res.json(successResponse({
      valid: result.valid,
      discountType: result.discountType,
      discountValue: result.discountValue,
      discountAmount: result.discountAmount,
      bonusCredits: result.bonusCredits,
      finalAmount: result.finalAmount,
      message: result.message,
    }));
  }
);

// ==========================================
// 兑换码
// ==========================================

const validateRedeemSchema = z.object({
  code: z.string().min(1).max(50),
});

/**
 * 验证兑换码
 * POST /api/billing/redeem/validate
 */
billingRouter.post(
  '/redeem/validate',
  validateBody(validateRedeemSchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { code } = req.body as z.infer<typeof validateRedeemSchema>;

    const result = await redeemCodeService.validateRedeemCode(code, userId);

    res.json(successResponse({
      valid: result.valid,
      creditsAmount: result.creditsAmount,
      message: result.message,
      redeemType: result.redeemType,
      periodCardPlanName: result.periodCardPlanName,
    }));
  }
);

/**
 * 兑换码兑换
 * POST /api/billing/redeem
 */
billingRouter.post(
  '/redeem',
  validateBody(validateRedeemSchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { code } = req.body as z.infer<typeof validateRedeemSchema>;

    const result = await redeemCodeService.redeemCode(code, userId);

    res.json(successResponse({
      success: result.success,
      creditsAwarded: result.creditsAwarded,
      message: result.message,
      redeemType: result.redeemType,
    }));
  }
);
