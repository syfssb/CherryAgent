import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse, paginationMeta } from '../utils/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { pool } from '../db/index.js';
import { ValidationError } from '../utils/errors.js';
import { env } from '../utils/env.js';
import crypto from 'crypto';

export const referralsRouter = Router();

// 所有路由需要认证
referralsRouter.use(authenticate);

// ==========================================
// Schema 定义
// ==========================================

const commissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const withdrawalsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const withdrawSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.string().min(1).max(50),
  paymentAccount: z.string().min(1).max(200),
});

const applyCodeSchema = z.object({
  code: z.string().min(1).max(20).trim(),
});

// ==========================================
// 辅助函数
// ==========================================

/**
 * 根据邀请码生成完整邀请链接
 */
function buildInviteUrl(code: string): string {
  const base = env.LANDING_URL.replace(/\/+$/, '');
  return `${base}/register?ref=${code}`;
}

/**
 * 生成唯一邀请码
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i]! % chars.length];
  }
  return code;
}

// ==========================================
// 路由处理
// ==========================================

/**
 * 获取/生成我的邀请码
 * GET /api/referrals/my-code
 */
referralsRouter.get(
  '/my-code',
  async (req: Request, res: Response) => {
    const userId = req.userId!;

    // 检查分销功能是否启用
    const configResult = await pool.query(
      `SELECT is_enabled FROM referral_config LIMIT 1`
    );
    if (configResult.rows.length > 0 && !(configResult.rows[0] as { is_enabled: boolean }).is_enabled) {
      throw new ValidationError('分销功能暂未开放');
    }

    // 查找现有邀请码
    const existingResult = await pool.query(
      `SELECT id, code, description, usage_count, max_usage, is_active, created_at
       FROM referral_codes
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (existingResult.rows && existingResult.rows.length > 0) {
      const code = existingResult.rows[0] as {
        id: string;
        code: string;
        description: string | null;
        usage_count: number;
        max_usage: number | null;
        is_active: boolean;
        created_at: Date;
      };
      res.json(successResponse({
        id: code.id,
        code: code.code,
        inviteUrl: buildInviteUrl(code.code),
        description: code.description,
        usageCount: code.usage_count,
        maxUsage: code.max_usage,
        isActive: code.is_active,
        createdAt: code.created_at,
      }));
      return;
    }

    // 生成新邀请码（最多重试 5 次避免冲突）
    let newCode = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      newCode = generateReferralCode();
      const conflict = await pool.query(
        `SELECT id FROM referral_codes WHERE code = $1`,
        [newCode]
      );
      if (!conflict.rows || conflict.rows.length === 0) {
        break;
      }
      if (attempt === 4) {
        throw new ValidationError('邀请码生成失败，请重试');
      }
    }

    const insertResult = await pool.query(
      `INSERT INTO referral_codes (user_id, code)
       VALUES ($1, $2)
       RETURNING id, code, description, usage_count, max_usage, is_active, created_at`,
      [userId, newCode]
    );

    const created = insertResult.rows[0] as {
      id: string;
      code: string;
      description: string | null;
      usage_count: number;
      max_usage: number | null;
      is_active: boolean;
      created_at: Date;
    };

    res.json(successResponse({
      id: created.id,
      code: created.code,
      inviteUrl: buildInviteUrl(created.code),
      description: created.description,
      usageCount: created.usage_count,
      maxUsage: created.max_usage,
      isActive: created.is_active,
      createdAt: created.created_at,
    }));
  }
);

/**
 * 我的分销统计
 * GET /api/referrals/stats
 */
referralsRouter.get(
  '/stats',
  async (req: Request, res: Response) => {
    const userId = req.userId!;

    const statsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM referral_relations WHERE referrer_id = $1) as total_referrals,
        (SELECT COALESCE(SUM(commission_amount::numeric), 0) FROM referral_commissions WHERE referrer_id = $1) as total_commission,
        (SELECT COALESCE(SUM(commission_amount::numeric), 0) FROM referral_commissions WHERE referrer_id = $1 AND status = 'approved') as available_commission,
        (SELECT COALESCE(SUM(commission_amount::numeric), 0) FROM referral_commissions WHERE referrer_id = $1 AND status = 'pending') as pending_commission,
        (SELECT COALESCE(SUM(commission_amount::numeric), 0) FROM referral_commissions WHERE referrer_id = $1 AND status = 'paid') as paid_commission,
        (SELECT COALESCE(SUM(amount::numeric), 0) FROM referral_withdrawals WHERE user_id = $1 AND status IN ('pending', 'approved')) as withdrawing_amount,
        (SELECT COALESCE(SUM(amount::numeric), 0) FROM referral_withdrawals WHERE user_id = $1 AND status = 'paid') as paid_withdrawal_amount
    `, [userId]);

    const stats = statsResult.rows[0] as {
      total_referrals: string;
      total_commission: string;
      available_commission: string;
      pending_commission: string;
      paid_commission: string;
      withdrawing_amount: string;
      paid_withdrawal_amount: string;
    };

    const availableForWithdrawal = (
      parseFloat(stats.available_commission)
      - parseFloat(stats.withdrawing_amount)
      - parseFloat(stats.paid_withdrawal_amount)
    );

    res.json(successResponse({
      totalReferrals: parseInt(stats.total_referrals, 10),
      totalCommission: parseFloat(stats.total_commission),
      availableCommission: parseFloat(stats.available_commission),
      pendingCommission: parseFloat(stats.pending_commission),
      paidCommission: parseFloat(stats.paid_commission),
      withdrawingAmount: parseFloat(stats.withdrawing_amount),
      withdrawnAmount: parseFloat(stats.paid_withdrawal_amount),
      availableForWithdrawal: Math.max(0, availableForWithdrawal),
    }));
  }
);

/**
 * 我的佣金记录
 * GET /api/referrals/commissions
 */
referralsRouter.get(
  '/commissions',
  validateQuery(commissionsQuerySchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const query = req.query as unknown as z.infer<typeof commissionsQuerySchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const commissionsResult = await pool.query(
      `SELECT
         rc.id,
         rc.referred_id,
         u.email as referred_email,
         u.name as referred_name,
         rc.order_amount,
         rc.commission_rate,
         rc.commission_amount,
         rc.level,
         rc.status,
         rc.created_at,
         rc.settled_at
       FROM referral_commissions rc
       JOIN users u ON rc.referred_id = u.id
       WHERE rc.referrer_id = $1
       ORDER BY rc.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM referral_commissions WHERE referrer_id = $1`,
      [userId]
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const commissions = (commissionsResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        referred_id: string;
        referred_email: string;
        referred_name: string | null;
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
        referredId: r.referred_id,
        referredEmail: r.referred_email,
        referredName: r.referred_name,
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
 * 我的提现记录
 * GET /api/referrals/withdrawals
 */
referralsRouter.get(
  '/withdrawals',
  validateQuery(withdrawalsQuerySchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const query = req.query as unknown as z.infer<typeof withdrawalsQuerySchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const withdrawalsResult = await pool.query(
      `SELECT
         id,
         amount,
         status,
         payment_method,
         payment_account,
         note,
         created_at,
         processed_at
       FROM referral_withdrawals
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM referral_withdrawals WHERE user_id = $1`,
      [userId]
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const withdrawals = (withdrawalsResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
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
 * 申请提现
 * POST /api/referrals/withdraw
 */
referralsRouter.post(
  '/withdraw',
  validateBody(withdrawSchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { amount, paymentMethod, paymentAccount } = req.body as z.infer<typeof withdrawSchema>;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 锁定用户行，串行化同一用户的提现请求，避免并发超提
      await client.query(
        `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );

      // 检查分销配置
      const configResult = await client.query(
        `SELECT min_withdrawal, is_enabled FROM referral_config LIMIT 1`
      );

      if (configResult.rows.length > 0) {
        const config = configResult.rows[0] as { min_withdrawal: string; is_enabled: boolean };
        if (!config.is_enabled) {
          throw new ValidationError('分销功能暂未开放');
        }
        if (amount < parseFloat(config.min_withdrawal)) {
          throw new ValidationError(`最低提现金额为 ${config.min_withdrawal} 元`);
        }
      }

      // 计算可提现金额：已通过佣金 - (待处理/已通过/已打款提现)
      const approvedCommissionResult = await client.query(`
        SELECT COALESCE(SUM(commission_amount::numeric), 0) as approved_commission
        FROM referral_commissions
        WHERE referrer_id = $1 AND status = 'approved'
      `, [userId]);

      const withdrawalTotalResult = await client.query(`
        SELECT COALESCE(SUM(amount::numeric), 0) as withdrawal_total
        FROM referral_withdrawals
        WHERE user_id = $1 AND status IN ('pending', 'approved', 'paid')
      `, [userId]);

      const approvedCommission = parseFloat(
        (approvedCommissionResult.rows[0] as { approved_commission: string }).approved_commission
      );
      const withdrawalTotal = parseFloat(
        (withdrawalTotalResult.rows[0] as { withdrawal_total: string }).withdrawal_total
      );
      const canWithdraw = approvedCommission - withdrawalTotal;

      if (amount > canWithdraw) {
        throw new ValidationError(`可提现金额不足，当前可提现 ${Math.max(0, canWithdraw).toFixed(2)} 元`);
      }

      // 创建提现申请
      const insertResult = await client.query(
        `INSERT INTO referral_withdrawals (user_id, amount, payment_method, payment_account)
         VALUES ($1, $2, $3, $4)
         RETURNING id, amount, status, created_at`,
        [userId, amount, paymentMethod, paymentAccount]
      );

      await client.query('COMMIT');

      const withdrawal = insertResult.rows[0] as {
        id: string;
        amount: string;
        status: string;
        created_at: Date;
      };

      res.json(successResponse({
        id: withdrawal.id,
        amount: withdrawal.amount,
        status: withdrawal.status,
        createdAt: withdrawal.created_at,
      }));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
);

/**
 * 使用邀请码（注册时调用）
 * POST /api/referrals/apply
 */
referralsRouter.post(
  '/apply',
  validateBody(applyCodeSchema),
  async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { code } = req.body as z.infer<typeof applyCodeSchema>;

    // 检查分销功能是否启用
    const configResult = await pool.query(
      `SELECT is_enabled FROM referral_config LIMIT 1`
    );
    if (configResult.rows.length > 0 && !(configResult.rows[0] as { is_enabled: boolean }).is_enabled) {
      throw new ValidationError('分销功能暂未开放');
    }

    const normalizedCode = code.toUpperCase();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 锁定邀请码行，避免并发绕过 max_usage
      const codeResult = await client.query(
        `SELECT id, user_id, usage_count, max_usage, is_active
         FROM referral_codes
         WHERE code = $1
         FOR UPDATE`,
        [normalizedCode]
      );

      if (!codeResult.rows || codeResult.rows.length === 0) {
        throw new ValidationError('邀请码不存在');
      }

      const referralCode = codeResult.rows[0] as {
        id: string;
        user_id: string;
        usage_count: number;
        max_usage: number | null;
        is_active: boolean;
      };

      if (!referralCode.is_active) {
        throw new ValidationError('邀请码已失效');
      }

      if (referralCode.max_usage !== null && referralCode.usage_count >= referralCode.max_usage) {
        throw new ValidationError('邀请码已达到使用上限');
      }

      // 不能自己推荐自己
      if (referralCode.user_id === userId) {
        throw new ValidationError('不能使用自己的邀请码');
      }

      // 通过 ON CONFLICT 防并发重复绑定
      const relationInsert = await client.query(
        `INSERT INTO referral_relations (referrer_id, referred_id, referral_code_id, level)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (referred_id) DO NOTHING
         RETURNING id`,
        [referralCode.user_id, userId, referralCode.id]
      );

      if (!relationInsert.rows || relationInsert.rows.length === 0) {
        throw new ValidationError('您已使用过邀请码');
      }

      // 原子更新使用次数，双保险避免 max_usage 并发穿透
      const usageUpdate = await client.query(
        `UPDATE referral_codes
         SET usage_count = usage_count + 1
         WHERE id = $1
           AND (max_usage IS NULL OR usage_count < max_usage)
         RETURNING usage_count`,
        [referralCode.id]
      );

      if (!usageUpdate.rows || usageUpdate.rows.length === 0) {
        throw new ValidationError('邀请码已达到使用上限');
      }

      // 检查是否需要创建二级推荐关系
      const configCheck = await client.query(
        `SELECT max_levels FROM referral_config LIMIT 1`
      );
      if (configCheck.rows.length > 0) {
        const maxLevels = (configCheck.rows[0] as { max_levels: number }).max_levels;
        if (maxLevels >= 2) {
          // 查找推荐人的推荐人
          const parentRelation = await client.query(
            `SELECT referrer_id FROM referral_relations WHERE referred_id = $1 AND level = 1`,
            [referralCode.user_id]
          );
          if (parentRelation.rows && parentRelation.rows.length > 0) {
            // 二级推荐关系通过佣金记录来体现，而不是再插入 referral_relations
            // parentRelation.rows[0].referrer_id 为祖父推荐人 ID
          }
        }
      }

      await client.query('COMMIT');
      res.json(successResponse({ message: '邀请码使用成功' }));
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
);

export default referralsRouter;
