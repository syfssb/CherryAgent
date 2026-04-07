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

export const adminPackagesRouter = Router();

// ==========================================
// Schema 定义
// ==========================================

const listPackagesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  isEnabled: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

const createPackageSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  credits: z.number().min(0.01),
  priceCents: z.number().int().min(1),
  currency: z.string().length(3).default('CNY'),
  bonusCredits: z.number().min(0).default(0),
  isEnabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const updatePackageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  credits: z.number().min(0.01).optional(),
  priceCents: z.number().int().min(1).optional(),
  currency: z.string().length(3).optional(),
  bonusCredits: z.number().min(0).optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// ==========================================
// 路由处理
// ==========================================

/**
 * 获取充值套餐列表
 * GET /admin/packages
 */
adminPackagesRouter.get(
  '/',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  validateQuery(listPackagesSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof listPackagesSchema>;
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

    const packagesResult = await pool.query(
      `SELECT
        id, name, description, credits, price_cents, currency,
        bonus_credits, is_enabled, sort_order, created_at, updated_at
      FROM credit_packages
      ${whereClause}
      ORDER BY sort_order ASC, created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM credit_packages ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const packages = (packagesResult.rows as Array<{
      id: string;
      name: string;
      description: string | null;
      credits: string;
      price_cents: number;
      currency: string;
      bonus_credits: string;
      is_enabled: boolean;
      sort_order: number;
      created_at: Date;
      updated_at: Date;
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
      isEnabled: row.is_enabled,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json(
      successResponse(
        { packages },
        paginationMeta(total, page, limit)
      )
    );
  }
);

/**
 * 创建充值套餐
 * POST /admin/packages
 */
adminPackagesRouter.post(
  '/',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  validateBody(createPackageSchema),
  auditLog('package.create', 'credit_package', {
    captureRequestBody: true,
    getDescription: (req) => `创建充值套餐: ${req.body.name}`,
  }),
  async (req: Request, res: Response) => {
    const data = req.body as z.infer<typeof createPackageSchema>;

    const result = await pool.query(
      `INSERT INTO credit_packages (name, description, credits, price_cents, currency, bonus_credits, is_enabled, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        data.name,
        data.description ?? null,
        data.credits,
        data.priceCents,
        data.currency,
        data.bonusCredits,
        data.isEnabled,
        data.sortOrder,
      ]
    );

    const id = (result.rows[0] as { id: string }).id;

    res.status(201).json(
      successResponse({
        message: '充值套餐已创建',
        id,
      })
    );
  }
);

/**
 * 更新充值套餐
 * PATCH /admin/packages/:id
 */
adminPackagesRouter.patch(
  '/:id',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  validateBody(updatePackageSchema),
  auditLog('package.update', 'credit_package', {
    getTargetId: (req) => req.params.id,
    captureRequestBody: true,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body as z.infer<typeof updatePackageSchema>;

    // 检查套餐是否存在
    const existingResult = await pool.query(
      `SELECT id FROM credit_packages WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('充值套餐');
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

    if (updates.credits !== undefined) {
      updateFields.push(`credits = $${paramIndex++}`);
      params.push(updates.credits);
    }

    if (updates.priceCents !== undefined) {
      updateFields.push(`price_cents = $${paramIndex++}`);
      params.push(updates.priceCents);
    }

    if (updates.currency !== undefined) {
      updateFields.push(`currency = $${paramIndex++}`);
      params.push(updates.currency);
    }

    if (updates.bonusCredits !== undefined) {
      updateFields.push(`bonus_credits = $${paramIndex++}`);
      params.push(updates.bonusCredits);
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
      `UPDATE credit_packages SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    res.json(
      successResponse({
        message: '充值套餐已更新',
      })
    );
  }
);

/**
 * 删除充值套餐
 * DELETE /admin/packages/:id
 */
adminPackagesRouter.delete(
  '/:id',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  auditLog('package.delete', 'credit_package', {
    getTargetId: (req) => req.params.id,
    getDescription: (req) => `删除充值套餐: ${req.params.id}`,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM credit_packages WHERE id = $1 RETURNING id`,
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('充值套餐');
    }

    res.json(
      successResponse({
        message: '充值套餐已删除',
      })
    );
  }
);

export default adminPackagesRouter;
