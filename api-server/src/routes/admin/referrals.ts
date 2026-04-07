import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse, paginationMeta } from '../../utils/response.js';
import { validateBody, validateQuery, validateParams, CommonSchemas } from '../../middleware/validate.js';
import {
  authenticateAdminAsync,
  requirePermission,
} from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { ValidationError } from '../../utils/errors.js';

export const adminReferralsRouter = Router();

// ==========================================
// Schema 定义
// ==========================================

const configUpdateSchema = z.object({
  commissionRate: z.number().min(0).max(100).optional(),
  commissionType: z.enum(['percentage', 'fixed']).optional(),
  fixedAmount: z.number().min(0).optional(),
  minWithdrawal: z.number().min(0).optional(),
  maxLevels: z.number().int().min(1).max(3).optional(),
  level2Rate: z.number().min(0).max(100).optional(),
  isEnabled: z.boolean().optional(),
});

const commissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'paid', 'rejected']).optional(),
  referrerId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

const withdrawalsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'paid', 'rejected']).optional(),
  userId: z.string().uuid().optional(),
});

const commissionActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional(),
});

const withdrawalActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'pay']),
  note: z.string().max(500).optional(),
});

const idParamSchema = z.object({
  id: CommonSchemas.uuid,
});

// ==========================================
// 路由处理
// ==========================================

/**
 * 获取分销配置
 * GET /admin/referrals/config
 */
adminReferralsRouter.get(
  '/config',
  authenticateAdminAsync,
  requirePermission('config:read'),
  async (_req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT id, commission_rate, commission_type, fixed_amount, min_withdrawal,
              max_levels, level2_rate, is_enabled, updated_at
       FROM referral_config
       LIMIT 1`
    );

    if (!result.rows || result.rows.length === 0) {
      res.json(successResponse({
        commissionRate: 10,
        commissionType: 'percentage',
        fixedAmount: 0,
        minWithdrawal: 10,
        maxLevels: 1,
        level2Rate: 5,
        isEnabled: true,
      }));
      return;
    }

    const config = result.rows[0] as {
      id: string;
      commission_rate: string;
      commission_type: string;
      fixed_amount: string;
      min_withdrawal: string;
      max_levels: number;
      level2_rate: string;
      is_enabled: boolean;
      updated_at: Date;
    };

    res.json(successResponse({
      id: config.id,
      commissionRate: parseFloat(config.commission_rate),
      commissionType: config.commission_type,
      fixedAmount: parseFloat(config.fixed_amount),
      minWithdrawal: parseFloat(config.min_withdrawal),
      maxLevels: config.max_levels,
      level2Rate: parseFloat(config.level2_rate),
      isEnabled: config.is_enabled,
      updatedAt: config.updated_at,
    }));
  }
);

/**
 * 更新分销配置
 * PUT /admin/referrals/config
 */
adminReferralsRouter.put(
  '/config',
  authenticateAdminAsync,
  requirePermission('config:write'),
  validateBody(configUpdateSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof configUpdateSchema>;

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (body.commissionRate !== undefined) {
      setClauses.push(`commission_rate = $${paramIndex++}`);
      params.push(body.commissionRate);
    }
    if (body.commissionType !== undefined) {
      setClauses.push(`commission_type = $${paramIndex++}`);
      params.push(body.commissionType);
    }
    if (body.fixedAmount !== undefined) {
      setClauses.push(`fixed_amount = $${paramIndex++}`);
      params.push(body.fixedAmount);
    }
    if (body.minWithdrawal !== undefined) {
      setClauses.push(`min_withdrawal = $${paramIndex++}`);
      params.push(body.minWithdrawal);
    }
    if (body.maxLevels !== undefined) {
      setClauses.push(`max_levels = $${paramIndex++}`);
      params.push(body.maxLevels);
    }
    if (body.level2Rate !== undefined) {
      setClauses.push(`level2_rate = $${paramIndex++}`);
      params.push(body.level2Rate);
    }
    if (body.isEnabled !== undefined) {
      setClauses.push(`is_enabled = $${paramIndex++}`);
      params.push(body.isEnabled);
    }

    if (setClauses.length === 0) {
      throw new ValidationError('至少需要提供一个更新字段');
    }

    setClauses.push('updated_at = NOW()');

    await pool.query(
      `UPDATE referral_config SET ${setClauses.join(', ')}
       WHERE id = (SELECT id FROM referral_config LIMIT 1)`,
      params
    );

    res.json(successResponse({ message: '分销配置已更新' }));
  }
);

/**
 * 分销概览统计
 * GET /admin/referrals/overview
 */
adminReferralsRouter.get(
  '/overview',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  async (_req: Request, res: Response) => {
    const statsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM referral_codes WHERE is_active = true) as total_codes,
        (SELECT COUNT(*) FROM referral_relations) as total_referrals,
        (SELECT COALESCE(SUM(commission_amount::numeric), 0) FROM referral_commissions) as total_commission,
        (SELECT COALESCE(SUM(commission_amount::numeric), 0) FROM referral_commissions WHERE status = 'pending') as pending_commission,
        (SELECT COALESCE(SUM(commission_amount::numeric), 0) FROM referral_commissions WHERE status = 'paid') as paid_commission,
        (SELECT COUNT(*) FROM referral_withdrawals WHERE status = 'pending') as pending_withdrawals,
        (SELECT COALESCE(SUM(amount::numeric), 0) FROM referral_withdrawals WHERE status = 'pending') as pending_withdrawal_amount,
        (SELECT COALESCE(SUM(amount::numeric), 0) FROM referral_withdrawals WHERE status = 'paid') as paid_withdrawal_amount
    `);

    const stats = statsResult.rows[0] as {
      total_codes: string;
      total_referrals: string;
      total_commission: string;
      pending_commission: string;
      paid_commission: string;
      pending_withdrawals: string;
      pending_withdrawal_amount: string;
      paid_withdrawal_amount: string;
    };

    // 最近推荐记录
    const recentResult = await pool.query(`
      SELECT
        rr.id,
        rr.created_at,
        u_referrer.email as referrer_email,
        u_referrer.name as referrer_name,
        u_referred.email as referred_email,
        u_referred.name as referred_name,
        rc.code as referral_code
      FROM referral_relations rr
      JOIN users u_referrer ON rr.referrer_id = u_referrer.id
      JOIN users u_referred ON rr.referred_id = u_referred.id
      LEFT JOIN referral_codes rc ON rr.referral_code_id = rc.id
      ORDER BY rr.created_at DESC
      LIMIT 10
    `);

    const recentReferrals = (recentResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        created_at: Date;
        referrer_email: string;
        referrer_name: string | null;
        referred_email: string;
        referred_name: string | null;
        referral_code: string | null;
      };
      return {
        id: r.id,
        referrerEmail: r.referrer_email,
        referrerName: r.referrer_name,
        referredEmail: r.referred_email,
        referredName: r.referred_name,
        referralCode: r.referral_code,
        createdAt: r.created_at,
      };
    });

    // 推荐排行榜
    const topResult = await pool.query(`
      SELECT
        rr.referrer_id,
        u.email,
        u.name,
        COUNT(*) as referral_count,
        COALESCE(SUM(rc.commission_amount::numeric), 0) as total_earned
      FROM referral_relations rr
      JOIN users u ON rr.referrer_id = u.id
      LEFT JOIN referral_commissions rc ON rc.referrer_id = rr.referrer_id AND rc.status IN ('approved', 'paid')
      GROUP BY rr.referrer_id, u.email, u.name
      ORDER BY referral_count DESC
      LIMIT 10
    `);

    const topReferrers = (topResult.rows || []).map((row: unknown) => {
      const r = row as {
        referrer_id: string;
        email: string;
        name: string | null;
        referral_count: string;
        total_earned: string;
      };
      return {
        userId: r.referrer_id,
        email: r.email,
        name: r.name,
        referralCount: parseInt(r.referral_count, 10),
        totalEarned: parseFloat(r.total_earned),
      };
    });

    res.json(successResponse({
      stats: {
        totalCodes: parseInt(stats.total_codes, 10),
        totalReferrals: parseInt(stats.total_referrals, 10),
        totalCommission: parseFloat(stats.total_commission),
        pendingCommission: parseFloat(stats.pending_commission),
        paidCommission: parseFloat(stats.paid_commission),
        pendingWithdrawals: parseInt(stats.pending_withdrawals, 10),
        pendingWithdrawalAmount: parseFloat(stats.pending_withdrawal_amount),
        paidWithdrawalAmount: parseFloat(stats.paid_withdrawal_amount),
      },
      recentReferrals,
      topReferrers,
    }));
  }
);

/**
 * 佣金记录列表
 * GET /admin/referrals/commissions
 */
adminReferralsRouter.get(
  '/commissions',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  validateQuery(commissionsQuerySchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof commissionsQuerySchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.status) {
      conditions.push(`rc.status = $${paramIndex++}`);
      params.push(query.status);
    }
    if (query.referrerId) {
      conditions.push(`rc.referrer_id = $${paramIndex++}`);
      params.push(query.referrerId);
    }
    if (query.startDate) {
      conditions.push(`rc.created_at >= $${paramIndex++}`);
      params.push(query.startDate);
    }
    if (query.endDate) {
      conditions.push(`rc.created_at <= $${paramIndex++}`);
      params.push(query.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const commissionsResult = await pool.query(
      `SELECT
         rc.id,
         rc.referrer_id,
         u_referrer.email as referrer_email,
         u_referrer.name as referrer_name,
         rc.referred_id,
         u_referred.email as referred_email,
         rc.order_id,
         rc.order_amount,
         rc.commission_rate,
         rc.commission_amount,
         rc.level,
         rc.status,
         rc.created_at,
         rc.settled_at
       FROM referral_commissions rc
       JOIN users u_referrer ON rc.referrer_id = u_referrer.id
       JOIN users u_referred ON rc.referred_id = u_referred.id
       ${whereClause}
       ORDER BY rc.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM referral_commissions rc ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const commissions = (commissionsResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        referrer_id: string;
        referrer_email: string;
        referrer_name: string | null;
        referred_id: string;
        referred_email: string;
        order_id: string | null;
        order_amount: string;
        commission_rate: string;
        commission_amount: string;
        level: number;
        status: string;
        created_at: Date;
        settled_at: Date | null;
      };
      return {
        id: r.id,
        referrerId: r.referrer_id,
        referrerEmail: r.referrer_email,
        referrerName: r.referrer_name,
        referredId: r.referred_id,
        referredEmail: r.referred_email,
        orderId: r.order_id,
        orderAmount: r.order_amount,
        commissionRate: r.commission_rate,
        commissionAmount: r.commission_amount,
        level: r.level,
        status: r.status,
        createdAt: r.created_at,
        settledAt: r.settled_at,
      };
    });

    res.json(successResponse({ commissions }, paginationMeta(total, page, limit)));
  }
);

/**
 * 审核佣金
 * PATCH /admin/referrals/commissions/:id
 */
adminReferralsRouter.patch(
  '/commissions/:id',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  validateParams(idParamSchema),
  validateBody(commissionActionSchema),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { action } = req.body as z.infer<typeof commissionActionSchema>;

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const updateResult = await pool.query(
      `UPDATE referral_commissions
       SET status = $1, settled_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE settled_at END
       WHERE id = $2 AND status = 'pending'
       RETURNING id`,
      [newStatus, id]
    );

    if (!updateResult.rows || updateResult.rows.length === 0) {
      const existing = await pool.query(
        `SELECT status FROM referral_commissions WHERE id = $1`,
        [id]
      );
      if (!existing.rows || existing.rows.length === 0) {
        throw new ValidationError('佣金记录不存在');
      }

      const commission = existing.rows[0] as { status: string };
      throw new ValidationError(`当前状态为 ${commission.status}，无法操作`);
    }

    res.json(successResponse({ message: `佣金已${action === 'approve' ? '通过' : '拒绝'}` }));
  }
);

/**
 * 提现申请列表
 * GET /admin/referrals/withdrawals
 */
adminReferralsRouter.get(
  '/withdrawals',
  authenticateAdminAsync,
  requirePermission('finance:read'),
  validateQuery(withdrawalsQuerySchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof withdrawalsQuerySchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.status) {
      conditions.push(`rw.status = $${paramIndex++}`);
      params.push(query.status);
    }
    if (query.userId) {
      conditions.push(`rw.user_id = $${paramIndex++}`);
      params.push(query.userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const withdrawalsResult = await pool.query(
      `SELECT
         rw.id,
         rw.user_id,
         u.email as user_email,
         u.name as user_name,
         rw.amount,
         rw.status,
         rw.payment_method,
         rw.payment_account,
         rw.note,
         rw.created_at,
         rw.processed_at
       FROM referral_withdrawals rw
       JOIN users u ON rw.user_id = u.id
       ${whereClause}
       ORDER BY rw.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM referral_withdrawals rw ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const withdrawals = (withdrawalsResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        user_id: string;
        user_email: string;
        user_name: string | null;
        amount: string;
        status: string;
        payment_method: string | null;
        payment_account: string | null;
        note: string | null;
        created_at: Date;
        processed_at: Date | null;
      };
      return {
        id: r.id,
        userId: r.user_id,
        userEmail: r.user_email,
        userName: r.user_name,
        amount: r.amount,
        status: r.status,
        paymentMethod: r.payment_method,
        paymentAccount: r.payment_account,
        note: r.note,
        createdAt: r.created_at,
        processedAt: r.processed_at,
      };
    });

    res.json(successResponse({ withdrawals }, paginationMeta(total, page, limit)));
  }
);

/**
 * 处理提现
 * PATCH /admin/referrals/withdrawals/:id
 */
adminReferralsRouter.patch(
  '/withdrawals/:id',
  authenticateAdminAsync,
  requirePermission('finance:write'),
  validateParams(idParamSchema),
  validateBody(withdrawalActionSchema),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { action, note } = req.body as z.infer<typeof withdrawalActionSchema>;

    const transitionMap: Record<z.infer<typeof withdrawalActionSchema>['action'], { from: string; to: string }> = {
      approve: { from: 'pending', to: 'approved' },
      reject: { from: 'pending', to: 'rejected' },
      pay: { from: 'approved', to: 'paid' },
    };
    const transition = transitionMap[action];

    // 构造 SET 子句的字段列表
    const setFields = ['status = $1'];

    const updateParams: unknown[] = [transition.to, id, transition.from];

    // 如果有 note，添加到 SET 子句和参数列表
    if (note !== undefined && note !== null) {
      setFields.push(`note = $${updateParams.length + 1}`);
      updateParams.push(note);
    }

    // 只有当新状态是 'paid' 或 'rejected' 时，才更新 processed_at
    if (transition.to === 'paid' || transition.to === 'rejected') {
      setFields.push('processed_at = NOW()');
    }

    const updateResult = await pool.query(
      `UPDATE referral_withdrawals
       SET ${setFields.join(', ')}
       WHERE id = $2 AND status = $3
       RETURNING id`,
      updateParams
    );

    if (!updateResult.rows || updateResult.rows.length === 0) {
      const existing = await pool.query(
        `SELECT status FROM referral_withdrawals WHERE id = $1`,
        [id]
      );
      if (!existing.rows || existing.rows.length === 0) {
        throw new ValidationError('提现记录不存在');
      }

      const withdrawal = existing.rows[0] as { status: string };
      const actionTextMap: Record<z.infer<typeof withdrawalActionSchema>['action'], string> = {
        approve: '审批',
        reject: '拒绝',
        pay: '打款',
      };
      throw new ValidationError(`当前状态为 ${withdrawal.status}，无法${actionTextMap[action]}`);
    }

    const actionLabels: Record<string, string> = {
      approve: '已审批通过',
      reject: '已拒绝',
      pay: '已打款',
    };

    res.json(successResponse({ message: `提现${actionLabels[action]}` }));
  }
);

export default adminReferralsRouter;
