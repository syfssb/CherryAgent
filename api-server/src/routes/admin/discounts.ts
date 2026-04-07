/**
 * 管理后台 - 折扣码管理路由
 *
 * 功能:
 * - GET    /api/admin/discounts              - 折扣码列表（分页、筛选）
 * - POST   /api/admin/discounts              - 创建折扣码
 * - PUT    /api/admin/discounts/:id          - 更新折扣码
 * - DELETE /api/admin/discounts/:id          - 删除折扣码
 * - PATCH  /api/admin/discounts/:id/toggle   - 启用/禁用
 * - GET    /api/admin/discounts/:id/usages   - 查看使用记录
 * - POST   /api/admin/discounts/batch        - 批量生成折扣码
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import {
  authenticateAdminAsync,
  requirePermission,
} from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { successResponse, paginationMeta } from '../../utils/response.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

export const adminDiscountsRouter = Router();

// ============================================================
// 验证 Schema
// ============================================================

const listDiscountsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive', 'expired', '']).optional(),
  discountType: z.enum(['percentage', 'fixed_amount', 'bonus_credits', '']).optional(),
  search: z.string().optional(),
});

const createDiscountSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  discountType: z.enum(['percentage', 'fixed_amount', 'bonus_credits']).default('percentage'),
  discountValue: z.number().min(0.01),
  minAmount: z.number().int().min(0).default(0),
  maxDiscount: z.number().int().min(0).nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  applicablePackages: z.array(z.string().uuid()).nullable().optional(),
});

const updateDiscountSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  discountType: z.enum(['percentage', 'fixed_amount', 'bonus_credits']).optional(),
  discountValue: z.number().min(0.01).optional(),
  minAmount: z.number().int().min(0).optional(),
  maxDiscount: z.number().int().min(0).nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  applicablePackages: z.array(z.string().uuid()).nullable().optional(),
});

const batchCreateSchema = z.object({
  prefix: z.string().min(1).max(20).default('DISC'),
  count: z.number().int().min(1).max(1000),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  discountType: z.enum(['percentage', 'fixed_amount', 'bonus_credits']).default('percentage'),
  discountValue: z.number().min(0.01),
  minAmount: z.number().int().min(0).default(0),
  maxDiscount: z.number().int().min(0).nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).default(1),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  applicablePackages: z.array(z.string().uuid()).nullable().optional(),
});

// ============================================================
// 数据库行类型
// ============================================================

interface DiscountCodeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: string;
  discount_value: string;
  min_amount: number;
  max_discount: number | null;
  usage_limit: number | null;
  per_user_limit: number;
  used_count: number;
  is_active: boolean;
  starts_at: string;
  expires_at: string | null;
  applicable_packages: string[] | null;
  created_at: string;
  updated_at: string;
}

interface UsageRow {
  id: string;
  discount_code_id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  order_id: string | null;
  original_amount: number;
  discount_amount: number;
  final_amount: number;
  bonus_credits: string;
  created_at: string;
}

function rowToDiscount(row: DiscountCodeRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    discountType: row.discount_type,
    discountValue: parseFloat(row.discount_value),
    minAmount: row.min_amount,
    maxDiscount: row.max_discount,
    usageLimit: row.usage_limit,
    perUserLimit: row.per_user_limit,
    usedCount: row.used_count,
    isActive: row.is_active,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    applicablePackages: row.applicable_packages,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToUsage(row: UsageRow) {
  return {
    id: row.id,
    discountCodeId: row.discount_code_id,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    orderId: row.order_id,
    originalAmount: row.original_amount,
    discountAmount: row.discount_amount,
    finalAmount: row.final_amount,
    bonusCredits: parseFloat(row.bonus_credits),
    createdAt: row.created_at,
  };
}

/**
 * 生成随机折扣码
 * 格式: PREFIX-XXXX-XXXX
 */
function generateRandomCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part1 = Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  const part2 = Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `${prefix.toUpperCase()}-${part1}-${part2}`;
}

// ============================================================
// 路由处理器
// ============================================================

/**
 * GET /api/admin/discounts
 * 获取折扣码列表
 */
adminDiscountsRouter.get(
  '/',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  async (req: Request, res: Response) => {
    const parseResult = listDiscountsSchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new ValidationError('参数验证失败', parseResult.error.errors);
    }

    const { page, limit, status, discountType, search } = parseResult.data;
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

    if (discountType) {
      conditions.push(`discount_type = $${paramIdx++}`);
      params.push(discountType);
    }

    if (search && search.trim()) {
      const escapedSearch = search.trim().replace(/[%_\\]/g, '\\$&');
      conditions.push(`(code ILIKE $${paramIdx} OR name ILIKE $${paramIdx})`);
      params.push(`%${escapedSearch}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM discount_codes ${whereClause}`,
      params
    );
    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const dataResult = await pool.query(
      `SELECT * FROM discount_codes ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    const discounts = (dataResult.rows as DiscountCodeRow[]).map(rowToDiscount);

    res.json(successResponse(
      { discounts },
      paginationMeta(total, page, limit)
    ));
  }
);

/**
 * POST /api/admin/discounts
 * 创建折扣码
 */
adminDiscountsRouter.post(
  '/',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  async (req: Request, res: Response) => {
    const parseResult = createDiscountSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('参数验证失败', parseResult.error.errors);
    }

    const data = parseResult.data;

    // 验证百分比范围
    if (data.discountType === 'percentage' && data.discountValue > 100) {
      throw new ValidationError('百分比折扣值不能超过 100');
    }

    // 检查 code 唯一性（不区分大小写）
    const existResult = await pool.query(
      `SELECT id FROM discount_codes WHERE UPPER(code) = UPPER($1)`,
      [data.code]
    );
    if (existResult.rows && existResult.rows.length > 0) {
      throw new ValidationError('折扣码已存在');
    }

    const result = await pool.query(
      `INSERT INTO discount_codes
       (code, name, description, discount_type, discount_value, min_amount, max_discount,
        usage_limit, per_user_limit, is_active, starts_at, expires_at, applicable_packages)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        data.code.toUpperCase(),
        data.name,
        data.description ?? null,
        data.discountType,
        data.discountValue,
        data.minAmount,
        data.maxDiscount ?? null,
        data.usageLimit ?? null,
        data.perUserLimit,
        data.isActive,
        data.startsAt ?? new Date().toISOString(),
        data.expiresAt ?? null,
        data.applicablePackages ?? null,
      ]
    );

    const discount = rowToDiscount(result.rows[0] as DiscountCodeRow);

    res.status(201).json(successResponse({
      message: '折扣码创建成功',
      discount,
    }));
  }
);

/**
 * POST /api/admin/discounts/batch
 * 批量生成折扣码
 */
adminDiscountsRouter.post(
  '/batch',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  async (req: Request, res: Response) => {
    const parseResult = batchCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('参数验证失败', parseResult.error.errors);
    }

    const data = parseResult.data;

    // 验证百分比范围
    if (data.discountType === 'percentage' && data.discountValue > 100) {
      throw new ValidationError('百分比折扣值不能超过 100');
    }

    const createdCodes: string[] = [];
    const maxRetries = 3;

    for (let i = 0; i < data.count; i++) {
      let code = '';
      let inserted = false;

      for (let retry = 0; retry < maxRetries; retry++) {
        code = generateRandomCode(data.prefix);

        try {
          await pool.query(
            `INSERT INTO discount_codes
             (code, name, description, discount_type, discount_value, min_amount, max_discount,
              usage_limit, per_user_limit, is_active, starts_at, expires_at, applicable_packages)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
              code,
              data.name,
              data.description ?? null,
              data.discountType,
              data.discountValue,
              data.minAmount,
              data.maxDiscount ?? null,
              data.usageLimit ?? null,
              data.perUserLimit,
              data.isActive,
              data.startsAt ?? new Date().toISOString(),
              data.expiresAt ?? null,
              data.applicablePackages ?? null,
            ]
          );
          inserted = true;
          break;
        } catch (err: unknown) {
          // 唯一约束冲突，重试
          const pgError = err as { code?: string };
          if (pgError.code === '23505') {
            continue;
          }
          throw err;
        }
      }

      if (inserted) {
        createdCodes.push(code);
      }
    }

    res.status(201).json(successResponse({
      message: `成功生成 ${createdCodes.length} 个折扣码`,
      count: createdCodes.length,
      codes: createdCodes,
    }));
  }
);

/**
 * PUT /api/admin/discounts/:id
 * 更新折扣码
 */
adminDiscountsRouter.put(
  '/:id',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const parseResult = updateDiscountSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('参数验证失败', parseResult.error.errors);
    }

    // 检查是否存在
    const existResult = await pool.query(
      'SELECT id FROM discount_codes WHERE id = $1',
      [id]
    );
    if (!existResult.rows || existResult.rows.length === 0) {
      throw new NotFoundError('折扣码');
    }

    const updates = parseResult.data;

    // 验证百分比范围
    if (updates.discountType === 'percentage' && updates.discountValue !== undefined && updates.discountValue > 100) {
      throw new ValidationError('百分比折扣值不能超过 100');
    }

    // 如果更新 code，检查唯一性
    if (updates.code) {
      const codeExist = await pool.query(
        `SELECT id FROM discount_codes WHERE UPPER(code) = UPPER($1) AND id != $2`,
        [updates.code, id]
      );
      if (codeExist.rows && codeExist.rows.length > 0) {
        throw new ValidationError('折扣码已存在');
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
    if (updates.discountType !== undefined) {
      setClauses.push(`discount_type = $${paramIdx++}`);
      params.push(updates.discountType);
    }
    if (updates.discountValue !== undefined) {
      setClauses.push(`discount_value = $${paramIdx++}`);
      params.push(updates.discountValue);
    }
    if (updates.minAmount !== undefined) {
      setClauses.push(`min_amount = $${paramIdx++}`);
      params.push(updates.minAmount);
    }
    if (updates.maxDiscount !== undefined) {
      setClauses.push(`max_discount = $${paramIdx++}`);
      params.push(updates.maxDiscount);
    }
    if (updates.usageLimit !== undefined) {
      setClauses.push(`usage_limit = $${paramIdx++}`);
      params.push(updates.usageLimit);
    }
    if (updates.perUserLimit !== undefined) {
      setClauses.push(`per_user_limit = $${paramIdx++}`);
      params.push(updates.perUserLimit);
    }
    if (updates.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIdx++}`);
      params.push(updates.isActive);
    }
    if (updates.startsAt !== undefined) {
      setClauses.push(`starts_at = $${paramIdx++}`);
      params.push(updates.startsAt);
    }
    if (updates.expiresAt !== undefined) {
      setClauses.push(`expires_at = $${paramIdx++}`);
      params.push(updates.expiresAt);
    }
    if (updates.applicablePackages !== undefined) {
      setClauses.push(`applicable_packages = $${paramIdx++}`);
      params.push(updates.applicablePackages);
    }

    if (setClauses.length === 0) {
      throw new ValidationError('没有需要更新的字段');
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(
      `UPDATE discount_codes SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    const discount = rowToDiscount(result.rows[0] as DiscountCodeRow);

    res.json(successResponse({
      message: '折扣码更新成功',
      discount,
    }));
  }
);

/**
 * DELETE /api/admin/discounts/:id
 * 删除折扣码
 */
adminDiscountsRouter.delete(
  '/:id',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 检查是否有使用记录
    const usageResult = await pool.query(
      'SELECT COUNT(*) as count FROM discount_code_usages WHERE discount_code_id = $1',
      [id]
    );
    const usageCount = parseInt((usageResult.rows[0] as { count: string }).count, 10);

    if (usageCount > 0) {
      throw new ValidationError('该折扣码已有使用记录，无法删除。建议停用该折扣码。');
    }

    const result = await pool.query(
      'DELETE FROM discount_codes WHERE id = $1 RETURNING id',
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('折扣码');
    }

    res.json(successResponse({
      message: '折扣码删除成功',
    }));
  }
);

/**
 * PATCH /api/admin/discounts/:id/toggle
 * 启用/禁用折扣码
 */
adminDiscountsRouter.patch(
  '/:id/toggle',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const existResult = await pool.query(
      'SELECT id, is_active FROM discount_codes WHERE id = $1',
      [id]
    );

    if (!existResult.rows || existResult.rows.length === 0) {
      throw new NotFoundError('折扣码');
    }

    const current = existResult.rows[0] as { id: string; is_active: boolean };
    const newStatus = !current.is_active;

    await pool.query(
      'UPDATE discount_codes SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, id]
    );

    res.json(successResponse({
      message: newStatus ? '折扣码已启用' : '折扣码已停用',
      isActive: newStatus,
    }));
  }
);

/**
 * GET /api/admin/discounts/:id/usages
 * 查看折扣码使用记录
 */
adminDiscountsRouter.get(
  '/:id/usages',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    // 检查折扣码是否存在
    const existResult = await pool.query(
      'SELECT id FROM discount_codes WHERE id = $1',
      [id]
    );
    if (!existResult.rows || existResult.rows.length === 0) {
      throw new NotFoundError('折扣码');
    }

    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM discount_code_usages WHERE discount_code_id = $1',
      [id]
    );
    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const dataResult = await pool.query(
      `SELECT dcu.*, u.email as user_email, u.name as user_name
       FROM discount_code_usages dcu
       LEFT JOIN users u ON u.id = dcu.user_id
       WHERE dcu.discount_code_id = $1
       ORDER BY dcu.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    const usages = (dataResult.rows as UsageRow[]).map(rowToUsage);

    res.json(successResponse(
      { usages },
      paginationMeta(total, page, limit)
    ));
  }
);

export default adminDiscountsRouter;
