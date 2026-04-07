/**
 * 管理后台 - 兑换码管理路由
 *
 * 功能:
 * - GET    /api/admin/redeem-codes              - 兑换码列表（分页、筛选）
 * - POST   /api/admin/redeem-codes              - 创建单个兑换码
 * - POST   /api/admin/redeem-codes/batch        - 批量生成兑换码
 * - PUT    /api/admin/redeem-codes/:id          - 更新兑换码
 * - DELETE /api/admin/redeem-codes/:id          - 删除兑换码
 * - PATCH  /api/admin/redeem-codes/:id/toggle   - 启用/禁用
 * - GET    /api/admin/redeem-codes/:id/usages   - 查看使用记录
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  authenticateAdminAsync,
  requirePermission,
} from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { successResponse, paginationMeta } from '../../utils/response.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';
import {
  redeemCodeService,
  type RedeemCodeRow,
  type RedeemUsageRow,
} from '../../services/redeem-code.js';

export const adminRedeemCodesRouter = Router();

// ============================================================
// 验证 Schema
// ============================================================

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive', 'expired', '']).optional(),
  search: z.string().optional(),
});

const createSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  creditsAmount: z.number().min(0),
  maxUses: z.number().int().min(1).nullable().optional().default(1),
  isActive: z.boolean().default(true),
  expiresAt: z.string().datetime().nullable().optional(),
  redeemType: z.enum(['credits', 'period_card']).default('credits'),
  periodCardPlanId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  creditsAmount: z.number().min(0.01).optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const batchCreateSchema = z.object({
  prefix: z.string().min(1).max(20).default('REDEEM'),
  count: z.number().int().min(1).max(1000),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  creditsAmount: z.number().min(0),
  maxUses: z.number().int().min(1).nullable().optional().default(1),
  isActive: z.boolean().default(true),
  expiresAt: z.string().datetime().nullable().optional(),
  redeemType: z.enum(['credits', 'period_card']).default('credits'),
  periodCardPlanId: z.string().uuid().optional(),
});

// ============================================================
// 路由处理器
// ============================================================

/**
 * GET /api/admin/redeem-codes
 * 获取兑换码列表
 */
adminRedeemCodesRouter.get(
  '/',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  async (req: Request, res: Response) => {
    const parseResult = listSchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new ValidationError('参数验证失败', parseResult.error.errors);
    }

    const { page, limit, status, search } = parseResult.data;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status === 'active') {
      conditions.push(`is_active = true AND (expires_at IS NULL OR expires_at > NOW())`);
    } else if (status === 'inactive') {
      conditions.push(`is_active = false`);
    } else if (status === 'expired') {
      conditions.push(`expires_at IS NOT NULL AND expires_at <= NOW()`);
    }

    if (search && search.trim()) {
      const escapedSearch = search.trim().replace(/[%_\\]/g, '\\$&');
      conditions.push(`(code ILIKE $${paramIdx} OR name ILIKE $${paramIdx})`);
      params.push(`%${escapedSearch}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM redeem_codes ${whereClause}`,
      params
    );
    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const dataResult = await pool.query(
      `SELECT * FROM redeem_codes ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    const redeemCodes = (dataResult.rows as RedeemCodeRow[]).map(redeemCodeService.rowToRedeemCode);

    res.json(successResponse(
      { redeemCodes },
      paginationMeta(total, page, limit)
    ));
  }
);

/**
 * POST /api/admin/redeem-codes
 * 创建单个兑换码
 */
adminRedeemCodesRouter.post(
  '/',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  async (req: Request, res: Response) => {
    const parseResult = createSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('参数验证失败', parseResult.error.errors);
    }

    const data = parseResult.data;

    // 期卡类型校验
    if (data.redeemType === 'period_card') {
      if (!data.periodCardPlanId) {
        throw new ValidationError('期卡类型兑换码必须选择关联的期卡套餐');
      }
      const planCheck = await pool.query(
        `SELECT id FROM period_card_plans WHERE id = $1`,
        [data.periodCardPlanId]
      );
      if (!planCheck.rows || planCheck.rows.length === 0) {
        throw new ValidationError('关联的期卡套餐不存在');
      }
    }
    if (data.redeemType === 'credits' && (!data.creditsAmount || data.creditsAmount <= 0)) {
      throw new ValidationError('积分类型兑换码的积分数量必须大于 0');
    }

    // 检查 code 唯一性
    const existResult = await pool.query(
      `SELECT id FROM redeem_codes WHERE UPPER(code) = UPPER($1)`,
      [data.code]
    );
    if (existResult.rows && existResult.rows.length > 0) {
      throw new ValidationError('兑换码已存在');
    }

    const result = await pool.query(
      `INSERT INTO redeem_codes
       (code, name, description, credits_amount, max_uses, is_active, expires_at, created_by, redeem_type, period_card_plan_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.code.toUpperCase(),
        data.name,
        data.description ?? null,
        data.creditsAmount,
        data.maxUses ?? null,
        data.isActive,
        data.expiresAt ?? null,
        null,
        data.redeemType,
        data.periodCardPlanId ?? null,
      ]
    );

    const redeemCode = redeemCodeService.rowToRedeemCode(result.rows[0] as RedeemCodeRow);

    res.status(201).json(successResponse({
      message: '兑换码创建成功',
      redeemCode,
    }));
  }
);

/**
 * POST /api/admin/redeem-codes/batch
 * 批量生成兑换码
 */
adminRedeemCodesRouter.post(
  '/batch',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  async (req: Request, res: Response) => {
    const parseResult = batchCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('参数验证失败', parseResult.error.errors);
    }

    const data = parseResult.data;

    // 期卡类型校验
    if (data.redeemType === 'period_card') {
      if (!data.periodCardPlanId) {
        throw new ValidationError('期卡类型兑换码必须选择关联的期卡套餐');
      }
      const planCheck = await pool.query(
        `SELECT id FROM period_card_plans WHERE id = $1`,
        [data.periodCardPlanId]
      );
      if (!planCheck.rows || planCheck.rows.length === 0) {
        throw new ValidationError('关联的期卡套餐不存在');
      }
    }
    if (data.redeemType === 'credits' && (!data.creditsAmount || data.creditsAmount <= 0)) {
      throw new ValidationError('积分类型兑换码的积分数量必须大于 0');
    }

    const createdCodes = await redeemCodeService.batchCreate({
      prefix: data.prefix,
      count: data.count,
      name: data.name,
      description: data.description,
      creditsAmount: data.creditsAmount,
      maxUses: data.maxUses ?? null,
      expiresAt: data.expiresAt,
      isActive: data.isActive,
      createdBy: undefined,
      redeemType: data.redeemType,
      periodCardPlanId: data.periodCardPlanId,
    });

    res.status(201).json(successResponse({
      message: `成功生成 ${createdCodes.length} 个兑换码`,
      count: createdCodes.length,
      codes: createdCodes,
    }));
  }
);

/**
 * PUT /api/admin/redeem-codes/:id
 * 更新兑换码
 */
adminRedeemCodesRouter.put(
  '/:id',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const parseResult = updateSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('参数验证失败', parseResult.error.errors);
    }

    const existResult = await pool.query(
      'SELECT id FROM redeem_codes WHERE id = $1',
      [id]
    );
    if (!existResult.rows || existResult.rows.length === 0) {
      throw new NotFoundError('兑换码');
    }

    const updates = parseResult.data;

    // 如果更新 code，检查唯一性
    if (updates.code) {
      const codeExist = await pool.query(
        `SELECT id FROM redeem_codes WHERE UPPER(code) = UPPER($1) AND id != $2`,
        [updates.code, id]
      );
      if (codeExist.rows && codeExist.rows.length > 0) {
        throw new ValidationError('兑换码已存在');
      }
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (updates.code !== undefined) {
      setClauses.push(`code = $${paramIdx++}`);
      params.push(updates.code.toUpperCase());
    }
    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIdx++}`);
      params.push(updates.description);
    }
    if (updates.creditsAmount !== undefined) {
      setClauses.push(`credits_amount = $${paramIdx++}`);
      params.push(updates.creditsAmount);
    }
    if (updates.maxUses !== undefined) {
      setClauses.push(`max_uses = $${paramIdx++}`);
      params.push(updates.maxUses);
    }
    if (updates.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIdx++}`);
      params.push(updates.isActive);
    }
    if (updates.expiresAt !== undefined) {
      setClauses.push(`expires_at = $${paramIdx++}`);
      params.push(updates.expiresAt);
    }

    if (setClauses.length === 0) {
      throw new ValidationError('没有需要更新的字段');
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(
      `UPDATE redeem_codes SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    const redeemCode = redeemCodeService.rowToRedeemCode(result.rows[0] as RedeemCodeRow);

    res.json(successResponse({
      message: '兑换码更新成功',
      redeemCode,
    }));
  }
);

/**
 * DELETE /api/admin/redeem-codes/:id
 * 删除兑换码
 */
adminRedeemCodesRouter.delete(
  '/:id',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const usageResult = await pool.query(
      'SELECT COUNT(*) as count FROM redeem_code_usages WHERE redeem_code_id = $1',
      [id]
    );
    const usageCount = parseInt((usageResult.rows[0] as { count: string }).count, 10);

    if (usageCount > 0) {
      throw new ValidationError('该兑换码已有使用记录，无法删除。建议停用该兑换码。');
    }

    const result = await pool.query(
      'DELETE FROM redeem_codes WHERE id = $1 RETURNING id',
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('兑换码');
    }

    res.json(successResponse({
      message: '兑换码删除成功',
    }));
  }
);

/**
 * PATCH /api/admin/redeem-codes/:id/toggle
 * 启用/禁用兑换码
 */
adminRedeemCodesRouter.patch(
  '/:id/toggle',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const existResult = await pool.query(
      'SELECT id, is_active FROM redeem_codes WHERE id = $1',
      [id]
    );

    if (!existResult.rows || existResult.rows.length === 0) {
      throw new NotFoundError('兑换码');
    }

    const current = existResult.rows[0] as { id: string; is_active: boolean };
    const newStatus = !current.is_active;

    await pool.query(
      'UPDATE redeem_codes SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, id]
    );

    res.json(successResponse({
      message: newStatus ? '兑换码已启用' : '兑换码已停用',
      isActive: newStatus,
    }));
  }
);

/**
 * GET /api/admin/redeem-codes/:id/usages
 * 查看兑换码使用记录
 */
adminRedeemCodesRouter.get(
  '/:id/usages',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const existResult = await pool.query(
      'SELECT id FROM redeem_codes WHERE id = $1',
      [id]
    );
    if (!existResult.rows || existResult.rows.length === 0) {
      throw new NotFoundError('兑换码');
    }

    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM redeem_code_usages WHERE redeem_code_id = $1',
      [id]
    );
    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const dataResult = await pool.query(
      `SELECT rcu.*, u.email as user_email, u.name as user_name
       FROM redeem_code_usages rcu
       LEFT JOIN users u ON u.id = rcu.user_id
       WHERE rcu.redeem_code_id = $1
       ORDER BY rcu.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    const usages = (dataResult.rows as RedeemUsageRow[]).map(redeemCodeService.rowToRedeemUsage);

    res.json(successResponse(
      { usages },
      paginationMeta(total, page, limit)
    ));
  }
);

export default adminRedeemCodesRouter;
