import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse, paginationMeta } from '../../utils/response.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  authenticateAdminAsync,
  requirePermission,
} from '../../middleware/admin-auth.js';
import { auditLog } from '../../middleware/admin-logger.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { pool } from '../../db/index.js';
import { getTodayDateCST } from '../../services/period-card.js';

export const adminPeriodCardsRouter = Router();

// ==========================================
// Schema 定义
// ==========================================

const listPlansSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  isEnabled: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  periodType: z.enum(['daily', 'weekly', 'monthly']),
  periodDays: z.number().int().min(1),
  dailyCredits: z.number().min(0).default(0),
  quotaMode: z.enum(['daily', 'total']).default('daily'),
  totalCredits: z.number().min(0).default(0),
  priceCents: z.number().int().min(100, { message: '价格至少为 1.00 元 (100分)' }),
  currency: z.string().length(3).default('CNY'),
  isEnabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
}).refine(
  (data) => {
    if (data.quotaMode === 'daily') return data.dailyCredits > 0;
    if (data.quotaMode === 'total') return data.totalCredits > 0;
    return true;
  },
  {
    message: 'daily 模式需要 dailyCredits > 0，total 模式需要 totalCredits > 0',
    path: ['quotaMode'],
  }
);

const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  periodType: z.enum(['daily', 'weekly', 'monthly']).optional(),
  periodDays: z.number().int().min(1).optional(),
  dailyCredits: z.number().min(0).optional(),
  quotaMode: z.enum(['daily', 'total']).optional(),
  totalCredits: z.number().min(0).optional(),
  priceCents: z.number().int().min(100, { message: '价格至少为 1.00 元 (100分)' }).optional(),
  currency: z.string().length(3).optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const listRecordsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.string().optional(),
  userId: z.string().uuid().optional(),
});

// ==========================================
// 套餐管理路由
// ==========================================

/**
 * 获取期卡套餐列表
 * GET /admin/period-cards/plans
 */
adminPeriodCardsRouter.get(
  '/plans',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  validateQuery(listPlansSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof listPlansSchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.isEnabled !== undefined) {
      conditions.push(`is_enabled = $${paramIndex++}`);
      params.push(query.isEnabled);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const plansResult = await pool.query(
      `SELECT
        id, name, description, period_type, period_days, daily_credits,
        quota_mode, total_credits,
        price_cents, currency, is_enabled, sort_order, created_at, updated_at
      FROM period_card_plans
      ${whereClause}
      ORDER BY sort_order ASC, created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM period_card_plans ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const plans = (plansResult.rows as Array<{
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
      is_enabled: boolean;
      sort_order: number;
      created_at: Date;
      updated_at: Date;
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
      isEnabled: row.is_enabled,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json(
      successResponse(
        { plans },
        paginationMeta(total, page, limit)
      )
    );
  }
);

/**
 * 创建期卡套餐
 * POST /admin/period-cards/plans
 */
adminPeriodCardsRouter.post(
  '/plans',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  validateBody(createPlanSchema),
  auditLog('period_card_plan.create', 'period_card_plan', {
    captureRequestBody: true,
    getDescription: (req) => `创建期卡套餐: ${req.body.name}`,
  }),
  async (req: Request, res: Response) => {
    const data = req.body as z.infer<typeof createPlanSchema>;

    const result = await pool.query(
      `INSERT INTO period_card_plans (name, description, period_type, period_days, daily_credits, quota_mode, total_credits, price_cents, currency, is_enabled, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        data.name,
        data.description ?? null,
        data.periodType,
        data.periodDays,
        data.dailyCredits,
        data.quotaMode,
        data.totalCredits,
        data.priceCents,
        data.currency,
        data.isEnabled,
        data.sortOrder,
      ]
    );

    const id = (result.rows[0] as { id: string }).id;

    res.status(201).json(
      successResponse({
        message: '期卡套餐已创建',
        id,
      })
    );
  }
);

/**
 * 更新期卡套餐
 * PATCH /admin/period-cards/plans/:id
 */
adminPeriodCardsRouter.patch(
  '/plans/:id',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  validateBody(updatePlanSchema),
  auditLog('period_card_plan.update', 'period_card_plan', {
    getTargetId: (req) => req.params.id,
    captureRequestBody: true,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body as z.infer<typeof updatePlanSchema>;

    // 检查套餐是否存在，并获取当前值用于联动校验
    const existingResult = await pool.query(
      `SELECT id, quota_mode, daily_credits, total_credits FROM period_card_plans WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('期卡套餐');
    }

    const existing = existingResult.rows[0] as {
      id: string;
      quota_mode: string;
      daily_credits: string;
      total_credits: string;
    };

    // 合并当前值与更新值，做 quotaMode 联动校验
    const mergedQuotaMode = updates.quotaMode ?? existing.quota_mode;
    const mergedDailyCredits = updates.dailyCredits ?? parseFloat(existing.daily_credits);
    const mergedTotalCredits = updates.totalCredits ?? parseFloat(existing.total_credits);

    if (mergedQuotaMode === 'daily' && mergedDailyCredits <= 0) {
      throw new ValidationError('daily 模式需要 dailyCredits > 0');
    }
    if (mergedQuotaMode === 'total' && mergedTotalCredits <= 0) {
      throw new ValidationError('total 模式需要 totalCredits > 0');
    }

    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }

    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      params.push(updates.description);
    }

    if (updates.periodType !== undefined) {
      updateFields.push(`period_type = $${paramIndex++}`);
      params.push(updates.periodType);
    }

    if (updates.periodDays !== undefined) {
      updateFields.push(`period_days = $${paramIndex++}`);
      params.push(updates.periodDays);
    }

    if (updates.dailyCredits !== undefined) {
      updateFields.push(`daily_credits = $${paramIndex++}`);
      params.push(updates.dailyCredits);
    }

    if (updates.quotaMode !== undefined) {
      updateFields.push(`quota_mode = $${paramIndex++}`);
      params.push(updates.quotaMode);
    }

    if (updates.totalCredits !== undefined) {
      updateFields.push(`total_credits = $${paramIndex++}`);
      params.push(updates.totalCredits);
    }

    if (updates.priceCents !== undefined) {
      updateFields.push(`price_cents = $${paramIndex++}`);
      params.push(updates.priceCents);
    }

    if (updates.currency !== undefined) {
      updateFields.push(`currency = $${paramIndex++}`);
      params.push(updates.currency);
    }

    if (updates.isEnabled !== undefined) {
      updateFields.push(`is_enabled = $${paramIndex++}`);
      params.push(updates.isEnabled);
    }

    if (updates.sortOrder !== undefined) {
      updateFields.push(`sort_order = $${paramIndex++}`);
      params.push(updates.sortOrder);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('没有要更新的字段');
    }

    params.push(id);

    await pool.query(
      `UPDATE period_card_plans SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
      params
    );

    res.json(
      successResponse({
        message: '期卡套餐已更新',
      })
    );
  }
);

/**
 * 删除期卡套餐
 * DELETE /admin/period-cards/plans/:id
 */
adminPeriodCardsRouter.delete(
  '/plans/:id',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  auditLog('period_card_plan.delete', 'period_card_plan', {
    getTargetId: (req) => req.params.id,
    getDescription: (req) => `删除期卡套餐: ${req.params.id}`,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM period_card_plans WHERE id = $1 RETURNING id`,
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('期卡套餐');
    }

    res.json(
      successResponse({
        message: '期卡套餐已删除',
      })
    );
  }
);

// ==========================================
// 用户期卡记录路由
// ==========================================

/**
 * 获取用户期卡记录列表
 * GET /admin/period-cards/records
 */
adminPeriodCardsRouter.get(
  '/records',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  validateQuery(listRecordsSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof listRecordsSchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.status !== undefined) {
      conditions.push(`upc.status = $${paramIndex++}`);
      params.push(query.status);
    }

    if (query.userId !== undefined) {
      conditions.push(`upc.user_id = $${paramIndex++}`);
      params.push(query.userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const recordsResult = await pool.query(
      `SELECT
        upc.id, upc.user_id, upc.plan_id, upc.payment_id, upc.status,
        upc.starts_at, upc.expires_at, upc.daily_credits, upc.daily_quota_remaining,
        upc.quota_reset_date, upc.expiry_notified, upc.upgraded_to_id,
        upc.quota_mode, upc.total_credits, upc.total_remaining,
        upc.created_at, upc.updated_at,
        pcp.name AS plan_name,
        u.email AS user_email
      FROM user_period_cards upc
      LEFT JOIN period_card_plans pcp ON pcp.id = upc.plan_id
      LEFT JOIN users u ON u.id = upc.user_id
      ${whereClause}
      ORDER BY upc.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM user_period_cards upc ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const records = (recordsResult.rows as Array<{
      id: string;
      user_id: string;
      plan_id: string;
      payment_id: string | null;
      status: string;
      starts_at: Date;
      expires_at: Date;
      daily_credits: string;
      daily_quota_remaining: string;
      quota_reset_date: string | null;
      expiry_notified: boolean;
      upgraded_to_id: string | null;
      quota_mode: string;
      total_credits: string;
      total_remaining: string;
      created_at: Date;
      updated_at: Date;
      plan_name: string | null;
      user_email: string | null;
    }>).map((row) => ({
      id: row.id,
      userId: row.user_id,
      planId: row.plan_id,
      paymentId: row.payment_id,
      status: row.status,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      dailyCredits: parseFloat(row.daily_credits),
      dailyQuotaRemaining: parseFloat(row.daily_quota_remaining),
      quotaResetDate: row.quota_reset_date,
      expiryNotified: row.expiry_notified,
      upgradedToId: row.upgraded_to_id,
      quotaMode: row.quota_mode,
      totalCredits: parseFloat(row.total_credits),
      totalRemaining: parseFloat(row.total_remaining),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      planName: row.plan_name,
      userEmail: row.user_email,
    }));

    res.json(
      successResponse(
        { records },
        paginationMeta(total, page, limit)
      )
    );
  }
);

/**
 * 获取单条期卡记录详情
 * GET /admin/period-cards/records/:id
 */
adminPeriodCardsRouter.get(
  '/records/:id',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        upc.id, upc.user_id, upc.plan_id, upc.payment_id, upc.status,
        upc.starts_at, upc.expires_at, upc.daily_credits, upc.daily_quota_remaining,
        upc.quota_reset_date, upc.expiry_notified, upc.upgraded_to_id,
        upc.quota_mode, upc.total_credits, upc.total_remaining,
        upc.created_at, upc.updated_at,
        pcp.name AS plan_name, pcp.period_type, pcp.period_days, pcp.price_cents, pcp.currency,
        u.email AS user_email
      FROM user_period_cards upc
      LEFT JOIN period_card_plans pcp ON pcp.id = upc.plan_id
      LEFT JOIN users u ON u.id = upc.user_id
      WHERE upc.id = $1`,
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('期卡记录');
    }

    const row = result.rows[0] as {
      id: string;
      user_id: string;
      plan_id: string;
      payment_id: string | null;
      status: string;
      starts_at: Date;
      expires_at: Date;
      daily_credits: string;
      daily_quota_remaining: string;
      quota_reset_date: string | null;
      expiry_notified: boolean;
      upgraded_to_id: string | null;
      quota_mode: string;
      total_credits: string;
      total_remaining: string;
      created_at: Date;
      updated_at: Date;
      plan_name: string | null;
      period_type: string | null;
      period_days: number | null;
      price_cents: number | null;
      currency: string | null;
      user_email: string | null;
    };

    const record = {
      id: row.id,
      userId: row.user_id,
      planId: row.plan_id,
      paymentId: row.payment_id,
      status: row.status,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      dailyCredits: parseFloat(row.daily_credits),
      dailyQuotaRemaining: parseFloat(row.daily_quota_remaining),
      quotaResetDate: row.quota_reset_date,
      expiryNotified: row.expiry_notified,
      upgradedToId: row.upgraded_to_id,
      quotaMode: row.quota_mode,
      totalCredits: parseFloat(row.total_credits),
      totalRemaining: parseFloat(row.total_remaining),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      planName: row.plan_name,
      planPeriodType: row.period_type,
      planPeriodDays: row.period_days,
      planPriceCents: row.price_cents,
      planPriceYuan: row.price_cents != null ? (row.price_cents / 100).toFixed(2) : null,
      planCurrency: row.currency,
      userEmail: row.user_email,
    };

    res.json(successResponse({ record }));
  }
);

/**
 * 管理员取消用户期卡
 * POST /admin/period-cards/records/:id/cancel
 */
adminPeriodCardsRouter.post(
  '/records/:id/cancel',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  auditLog('period_card.cancel', 'user_period_card', {
    getTargetId: (req) => req.params.id,
    getDescription: (req) => `管理员取消用户期卡: ${req.params.id}`,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 检查记录是否存在且状态为 active
    const existingResult = await pool.query(
      `SELECT id, status FROM user_period_cards WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('期卡记录');
    }

    const existing = existingResult.rows[0] as { id: string; status: string };

    if (existing.status !== 'active') {
      throw new ValidationError(`期卡当前状态为 "${existing.status}"，无法取消`);
    }

    await pool.query(
      `UPDATE user_period_cards SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json(
      successResponse({
        message: '期卡已取消',
      })
    );
  }
);

// ==========================================
// 手动赠送期卡
// ==========================================

const grantSchema = z.object({
  userId: z.string().uuid(),
  planId: z.string().uuid(),
});

/**
 * 手动赠送期卡
 * POST /admin/period-cards/records/grant
 */
adminPeriodCardsRouter.post(
  '/records/grant',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  validateBody(grantSchema),
  auditLog('period_card.grant', 'user_period_card', {
    captureRequestBody: true,
    getDescription: (req) => `管理员赠送期卡给用户: ${req.body.userId}, 套餐: ${req.body.planId}`,
  }),
  async (req: Request, res: Response) => {
    const { userId, planId } = req.body as z.infer<typeof grantSchema>;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. 检查用户是否存在
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [userId]
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        throw new NotFoundError('用户');
      }

      // 2. 查询套餐
      const planResult = await client.query(
        `SELECT * FROM period_card_plans WHERE id = $1 AND is_enabled = true`,
        [planId]
      );

      if (!planResult.rows || planResult.rows.length === 0) {
        throw new NotFoundError('期卡套餐（或套餐未启用）');
      }

      const plan = planResult.rows[0] as { period_days: number; daily_credits: string; quota_mode: string; total_credits: string };

      // 3. 激活期卡（按 quota_mode 分支）
      const dailyCreditsVal = parseFloat(plan.daily_credits);
      const totalCreditsVal = parseFloat(plan.total_credits);
      const isTotal = plan.quota_mode === 'total';

      const insertResult = await client.query(
        `INSERT INTO user_period_cards
          (user_id, plan_id, payment_id, status, starts_at, expires_at,
           daily_credits, daily_quota_remaining, quota_reset_date,
           quota_mode, total_credits, total_remaining)
         VALUES ($1, $2, NULL, 'active', NOW(), NOW() + ($3 * INTERVAL '1 day'),
                 $4, $5, $6,
                 $7, $8, $9)
         RETURNING id`,
        [
          userId,
          planId,
          plan.period_days,
          isTotal ? 0 : dailyCreditsVal,
          isTotal ? 0 : dailyCreditsVal,
          isTotal ? null : getTodayDateCST(),
          plan.quota_mode,
          isTotal ? totalCreditsVal : 0,
          isTotal ? totalCreditsVal : 0,
        ]
      );

      await client.query('COMMIT');

      const id = (insertResult.rows[0] as { id: string }).id;

      res.status(201).json(
        successResponse({
          message: '期卡已赠送',
          id,
        })
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
);

// ==========================================
// 延期期卡
// ==========================================

const extendSchema = z.object({
  days: z.number().int().min(1).max(365),
});

/**
 * 延期期卡
 * POST /admin/period-cards/records/:id/extend
 */
adminPeriodCardsRouter.post(
  '/records/:id/extend',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  validateBody(extendSchema),
  auditLog('period_card.extend', 'user_period_card', {
    getTargetId: (req) => req.params.id,
    captureRequestBody: true,
    getDescription: (req) => `管理员延期期卡: ${req.params.id}, 延期 ${req.body.days} 天`,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { days } = req.body as z.infer<typeof extendSchema>;

    // 1. 检查期卡是否存在且 status = 'active'
    const existingResult = await pool.query(
      `SELECT id, status FROM user_period_cards WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('期卡记录');
    }

    const existing = existingResult.rows[0] as { id: string; status: string };

    if (existing.status !== 'active') {
      throw new ValidationError(`期卡当前状态为 "${existing.status}"，只能对生效中的期卡延期`);
    }

    // 2. 执行延期
    const updateResult = await pool.query(
      `UPDATE user_period_cards
       SET expires_at = expires_at + ($1 * INTERVAL '1 day'), updated_at = NOW()
       WHERE id = $2 AND status = 'active'
       RETURNING id, expires_at`,
      [days, id]
    );

    const updated = updateResult.rows[0] as { id: string; expires_at: Date };

    res.json(
      successResponse({
        message: `期卡已延期 ${days} 天`,
        newExpiresAt: updated.expires_at,
      })
    );
  }
);

export default adminPeriodCardsRouter;
