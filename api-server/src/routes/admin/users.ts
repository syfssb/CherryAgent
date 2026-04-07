import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse, paginationMeta } from '../../utils/response.js';
import { validateBody, validateQuery, CommonSchemas } from '../../middleware/validate.js';
import {
  authenticateAdminAsync,
  requirePermission,
} from '../../middleware/admin-auth.js';
import { auditLog } from '../../middleware/admin-logger.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { pool } from '../../db/index.js';
import { billingService } from '../../services/billing.js';
import { sendPasswordResetForUser } from '../../services/password-reset.js';

export const adminUsersRouter = Router();

// ==========================================
// Schema 定义
// ==========================================

/**
 * 用户列表查询 Schema
 */
const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(['user', 'admin']).optional(),
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  sortBy: z.enum(['createdAt', 'email', 'name', 'credits']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

/**
 * 更新用户状态 Schema
 */
const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['user', 'admin']).optional(),
  isActive: z.boolean().optional(),
});

/**
 * 调整余额 Schema
 */
const adjustBalanceSchema = z.object({
  amount: z.number().refine((v) => v !== 0, '金额不能为 0'),
  reason: z.string().min(1, '原因不能为空').max(500),
  type: z.enum(['bonus', 'refund', 'adjustment', 'compensation']).default('adjustment'),
});

/**
 * 封禁原因 Schema
 */
const suspendReasonSchema = z.object({
  reason: z.string().min(1, '原因不能为空').max(500),
});

// ==========================================
// 路由处理
// ==========================================

/**
 * 获取用户列表
 * GET /admin/users
 */
adminUsersRouter.get(
  '/',
  authenticateAdminAsync,
  requirePermission('users:read'),
  validateQuery(listUsersSchema),
  async (req: Request, res: Response) => {
    const {
      page,
      limit,
      search,
      role,
      isActive,
      sortBy,
      sortOrder,
      startDate,
      endDate,
    } = req.query as unknown as z.infer<typeof listUsersSchema>;

    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // 搜索条件
    if (search) {
      const escapedSearch = search.replace(/[%_\\]/g, '\\$&');
      conditions.push(
        `(u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`
      );
      params.push(`%${escapedSearch}%`);
      paramIndex++;
    }

    if (role) {
      conditions.push(`u.role = $${paramIndex++}`);
      params.push(role);
    }

    if (isActive !== undefined) {
      conditions.push(`u.is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    if (startDate) {
      conditions.push(`u.created_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`u.created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 排序映射
    const sortColumnMap: Record<string, string> = {
      createdAt: 'u.created_at',
      email: 'u.email',
      name: 'u.name',
      credits: 'b.credits',
    };
    const sortColumn = sortColumnMap[sortBy] || 'u.created_at';
    const orderClause = `ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;

    // 查询用户列表
    const usersResult = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.name,
         u.role,
         u.avatar_url,
         u.is_active,
         u.email_verified_at,
         u.created_at,
         u.updated_at,
         COALESCE(b.credits, '0') as credits,
         COALESCE(b.currency, 'CNY') as currency,
         COALESCE(b.total_credits_purchased, '0') as total_credits_purchased,
         COALESCE(b.total_credits_consumed, '0') as total_credits_consumed
       FROM users u
       LEFT JOIN user_balances b ON u.id = b.user_id
       ${whereClause}
       ${orderClause}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM users u ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const users = (usersResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        email: string;
        name: string | null;
        role: string;
        avatar_url: string | null;
        is_active: boolean;
        email_verified_at: Date | null;
        created_at: Date;
        updated_at: Date;
        credits: string;
        currency: string;
        total_credits_purchased: string;
        total_credits_consumed: string;
      };
      return {
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        avatarUrl: r.avatar_url,
        isActive: r.is_active,
        emailVerifiedAt: r.email_verified_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        balance: {
          current: r.credits,
          currency: r.currency,
          totalDeposited: r.total_credits_purchased,
          totalSpent: r.total_credits_consumed,
        },
      };
    });

    res.json(
      successResponse(
        { users },
        paginationMeta(total, page, limit)
      )
    );
  }
);

/**
 * 获取用户详情
 * GET /admin/users/:id
 */
adminUsersRouter.get(
  '/:id',
  authenticateAdminAsync,
  requirePermission('users:read'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 查询用户基本信息
    const userResult = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.name,
         u.role,
         u.avatar_url,
         u.supabase_id,
         u.stripe_customer_id,
         u.is_active,
         u.email_verified_at,
         u.created_at,
         u.updated_at,
         COALESCE(b.credits, '0') as credits,
         COALESCE(b.currency, 'CNY') as currency,
         COALESCE(b.total_credits_purchased, '0') as total_credits_purchased,
         COALESCE(b.total_credits_consumed, '0') as total_credits_consumed
       FROM users u
       LEFT JOIN user_balances b ON u.id = b.user_id
       WHERE u.id = $1`,
      [id]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      throw new NotFoundError('用户');
    }

    const row = userResult.rows[0] as {
      id: string;
      email: string;
      name: string | null;
      role: string;
      avatar_url: string | null;
      supabase_id: string | null;
      stripe_customer_id: string | null;
      is_active: boolean;
      email_verified_at: Date | null;
      created_at: Date;
      updated_at: Date;
      credits: string;
      currency: string;
      total_credits_purchased: string;
      total_credits_consumed: string;
    };

    // 查询最近使用统计
    const usageStatsResult = await pool.query(
      `SELECT
         COUNT(*) as total_requests,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost::numeric), 0) as total_cost
       FROM usage_logs
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [id]
    );
    const usageStats = usageStatsResult.rows[0] as {
      total_requests: string;
      total_tokens: string;
      total_cost: string;
    };

    res.json(
      successResponse({
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          avatarUrl: row.avatar_url,
          supabaseId: row.supabase_id,
          stripeCustomerId: row.stripe_customer_id,
          isActive: row.is_active,
          emailVerifiedAt: row.email_verified_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          balance: {
            current: row.credits,
            currency: row.currency,
            totalDeposited: row.total_credits_purchased,
            totalSpent: row.total_credits_consumed,
          },
          usageStats: {
            last30Days: {
              totalRequests: parseInt(usageStats.total_requests, 10),
              totalTokens: parseInt(usageStats.total_tokens, 10),
              totalCost: parseFloat(usageStats.total_cost).toFixed(4),
            },
          },
        },
      })
    );
  }
);

/**
 * 更新用户信息
 * PATCH /admin/users/:id
 */
adminUsersRouter.patch(
  '/:id',
  authenticateAdminAsync,
  requirePermission('users:write'),
  validateBody(updateUserSchema),
  auditLog('user.update', 'user', {
    getTargetId: (req) => req.params.id,
    captureRequestBody: true,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body as z.infer<typeof updateUserSchema>;

    // 检查用户是否存在
    const existingResult = await pool.query(
      `SELECT id FROM users WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('用户');
    }

    // 构建更新语句
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }

    if (updates.role !== undefined) {
      updateFields.push(`role = $${paramIndex++}`);
      params.push(updates.role);
    }

    if (updates.isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      params.push(updates.isActive);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('没有要更新的字段');
    }

    updateFields.push(`updated_at = NOW()`);
    params.push(id);

    await pool.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    res.json(
      successResponse({
        message: '用户信息已更新',
      })
    );
  }
);

/**
 * 调整用户余额
 * POST /admin/users/:id/balance
 */
adminUsersRouter.post(
  '/:id/balance',
  authenticateAdminAsync,
  requirePermission('users:balance'),
  validateBody(adjustBalanceSchema),
  auditLog('user.balance_adjust', 'user', {
    getTargetId: (req) => req.params.id,
    captureRequestBody: true,
    getDescription: (req) =>
      `调整余额: ${req.body.amount > 0 ? '+' : ''}${req.body.amount} (${req.body.reason})`,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { amount, reason } = req.body as z.infer<typeof adjustBalanceSchema>;

    if (!id) {
      throw new ValidationError('用户 ID 不能为空');
    }

    // 检查用户是否存在
    const userResult = await pool.query(
      `SELECT id FROM users WHERE id = $1`,
      [id]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      throw new NotFoundError('用户');
    }

    const result = await billingService.adjustCredits(
      id,
      amount,
      `管理员调整: ${reason}`,
      req.adminId!
    );

    res.json(
      successResponse({
        message: '积分已调整',
        balance: {
          before: result.creditsBefore.toFixed(2),
          after: result.creditsAfter.toFixed(2),
          adjustment: amount.toFixed(2),
        },
      })
    );
  }
);

/**
 * 封禁用户
 * POST /admin/users/:id/suspend
 */
adminUsersRouter.post(
  '/:id/suspend',
  authenticateAdminAsync,
  requirePermission('users:suspend'),
  validateBody(suspendReasonSchema),
  auditLog('user.suspend', 'user', {
    getTargetId: (req) => req.params.id,
    captureRequestBody: true,
    getDescription: (req) => `封禁用户: ${req.body.reason}`,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body as z.infer<typeof suspendReasonSchema>;

    // 检查用户是否存在
    const userResult = await pool.query(
      `SELECT id, is_active, email FROM users WHERE id = $1`,
      [id]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      throw new NotFoundError('用户');
    }

    const user = userResult.rows[0] as {
      id: string;
      is_active: boolean;
      email: string;
    };

    if (!user.is_active) {
      throw new ValidationError('用户已被封禁');
    }

    // 封禁用户
    await pool.query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // 撤销所有 API Keys
    await pool.query(
      `UPDATE user_access_tokens SET is_active = false, updated_at = NOW() WHERE user_id = $1`,
      [id]
    );

    res.json(
      successResponse({
        message: '用户已封禁',
        user: {
          id: user.id,
          email: user.email,
          suspendReason: reason,
        },
      })
    );
  }
);

/**
 * 解封用户
 * POST /admin/users/:id/unsuspend
 */
adminUsersRouter.post(
  '/:id/unsuspend',
  authenticateAdminAsync,
  requirePermission('users:suspend'),
  auditLog('user.unsuspend', 'user', {
    getTargetId: (req) => req.params.id,
    getDescription: () => '解封用户',
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 检查用户是否存在
    const userResult = await pool.query(
      `SELECT id, is_active, email FROM users WHERE id = $1`,
      [id]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      throw new NotFoundError('用户');
    }

    const user = userResult.rows[0] as {
      id: string;
      is_active: boolean;
      email: string;
    };

    if (user.is_active) {
      throw new ValidationError('用户未被封禁');
    }

    // 解封用户
    await pool.query(
      `UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json(
      successResponse({
        message: '用户已解封',
        user: {
          id: user.id,
          email: user.email,
        },
      })
    );
  }
);

/**
 * 获取用户的交易记录
 * GET /admin/users/:id/transactions
 */
adminUsersRouter.get(
  '/:id/transactions',
  authenticateAdminAsync,
  requirePermission('users:read'),
  validateQuery(CommonSchemas.pagination),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const offset = (page - 1) * limit;

    const transactionsResult = await pool.query(
      `SELECT
         id,
         type,
         amount,
         balance_before,
         balance_after,
         description,
         created_at
       FROM balance_transactions
       WHERE user_id = $1 AND type != 'precharge'
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM balance_transactions WHERE user_id = $1 AND type != 'precharge'`,
      [id]
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const transactions = (transactionsResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        type: string;
        amount: string;
        balance_before: string;
        balance_after: string;
        description: string | null;
        created_at: Date;
      };
      return {
        id: r.id,
        type: r.type,
        amount: r.amount,
        balanceBefore: r.balance_before,
        balanceAfter: r.balance_after,
        description: r.description,
        createdAt: r.created_at,
      };
    });

    res.json(
      successResponse(
        { transactions },
        paginationMeta(total, page, limit)
      )
    );
  }
);

/**
 * 管理员重置用户密码
 * POST /admin/users/:id/reset-password
 * 为指定用户生成密码重置链接并发送邮件
 */
adminUsersRouter.post(
  '/:id/reset-password',
  authenticateAdminAsync,
  requirePermission('users:write'),
  auditLog('user.reset_password', 'user', {
    getTargetId: (req) => req.params.id,
    getDescription: (req) => `管理员重置用户密码: ${req.params.id}`,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const userResult = await pool.query(
      `SELECT id, email, name FROM users WHERE id = $1`,
      [id]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      throw new NotFoundError('用户');
    }

    const user = userResult.rows[0] as { id: string; email: string; name: string | null };

    await sendPasswordResetForUser(user.id, user.email, user.name || user.email);

    res.json(
      successResponse({
        message: '密码重置邮件已发送',
        email: user.email,
      })
    );
  }
);

/**
 * 删除用户
 * DELETE /admin/users/:id
 * 彻底删除用户及其所有关联数据
 */
adminUsersRouter.delete(
  '/:id',
  authenticateAdminAsync,
  requirePermission('users:write'),
  auditLog('user.delete', 'user', {
    getTargetId: (req) => req.params.id,
    getDescription: (req) => `彻底删除用户 ${req.params.id}`,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 不允许删除自己（管理员不能删除自己的账号）
    // 注意：adminId 是 admins 表的 ID，不是 users 表的 ID
    // 但仍需防止误操作，检查目标用户是否为管理员角色
    const userResult = await pool.query(
      `SELECT id, email, role FROM users WHERE id = $1`,
      [id]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
      throw new NotFoundError('用户');
    }

    const targetUser = userResult.rows[0] as {
      id: string;
      email: string;
      role: string;
    };

    // 使用事务确保数据一致性
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 按依赖顺序删除关联数据
      // 1. 删除折扣码使用记录
      await client.query(
        `DELETE FROM discount_code_usages WHERE user_id = $1`,
        [id]
      );

      // 2. 删除兑换码使用记录
      await client.query(
        `DELETE FROM redeem_code_usages WHERE user_id = $1`,
        [id]
      );

      // 3. 删除推荐系统相关数据
      await client.query(
        `DELETE FROM referral_commissions WHERE referrer_id = $1 OR referred_id = $1`,
        [id]
      );
      await client.query(
        `DELETE FROM referral_withdrawals WHERE user_id = $1`,
        [id]
      );
      await client.query(
        `DELETE FROM referral_relations WHERE referrer_id = $1 OR referred_id = $1`,
        [id]
      );
      await client.query(
        `DELETE FROM referral_codes WHERE user_id = $1`,
        [id]
      );

      // 4. 删除签到记录
      await client.query(
        `DELETE FROM check_in_records WHERE user_id = $1`,
        [id]
      );

      // 5. 删除可疑账户记录
      await client.query(
        `DELETE FROM suspicious_accounts WHERE user_id = $1`,
        [id]
      );

      // 6. 删除 IP 注册日志
      await client.query(
        `DELETE FROM ip_registration_log WHERE user_id = $1`,
        [id]
      );

      // 7. 删除邮箱验证和密码重置 token
      await client.query(
        `DELETE FROM email_verification_tokens WHERE user_id = $1`,
        [id]
      );
      await client.query(
        `DELETE FROM password_reset_tokens WHERE user_id = $1`,
        [id]
      );

      // 8. 删除 access tokens
      await client.query(
        `DELETE FROM user_access_tokens WHERE user_id = $1`,
        [id]
      );

      // 9. 更新 webhook 事件（设为 null，不删除记录）
      await client.query(
        `UPDATE webhook_events SET user_id = NULL WHERE user_id = $1`,
        [id]
      );

      // 10. 更新使用日志（设为 null，保留统计数据）
      await client.query(
        `UPDATE usage_logs SET user_id = NULL WHERE user_id = $1`,
        [id]
      );

      // 11. 删除安全审计日志中的用户引用
      await client.query(
        `UPDATE security_audit_logs SET user_id = NULL WHERE user_id = $1`,
        [id]
      );

      // 11.5 删除期卡使用日志（必须在 user_period_cards 之前）
      await client.query(
        `DELETE FROM period_card_usage_logs WHERE user_id = $1`,
        [id]
      );

      // 11.6 删除用户期卡记录（必须在 payments 之前，因为有 payment_id 外键）
      await client.query(
        `DELETE FROM user_period_cards WHERE user_id = $1`,
        [id]
      );

      // 12. 删除支付记录
      await client.query(
        `DELETE FROM payments WHERE user_id = $1`,
        [id]
      );

      // 13. 删除余额交易记录
      await client.query(
        `DELETE FROM balance_transactions WHERE user_id = $1`,
        [id]
      );

      // 14. 删除订阅
      await client.query(
        `DELETE FROM subscriptions WHERE user_id = $1`,
        [id]
      );

      // 15. 删除用户余额
      await client.query(
        `DELETE FROM user_balances WHERE user_id = $1`,
        [id]
      );

      // 16. 更新兑换码的 created_by 引用
      await client.query(
        `UPDATE redeem_codes SET created_by = NULL WHERE created_by = $1`,
        [id]
      );

      // 17. 更新可疑账户的 reviewed_by 引用
      await client.query(
        `UPDATE suspicious_accounts SET reviewed_by = NULL WHERE reviewed_by = $1`,
        [id]
      );

      // 18. 最后删除用户本身
      await client.query(
        `DELETE FROM users WHERE id = $1`,
        [id]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json(
      successResponse({
        message: '用户已彻底删除',
        user: {
          id: targetUser.id,
          email: targetUser.email,
        },
      })
    );
  }
);

export default adminUsersRouter;
