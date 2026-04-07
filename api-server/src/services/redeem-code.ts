/**
 * 兑换码服务
 *
 * 提供兑换码的核心业务逻辑：
 * - 验证兑换码有效性
 * - 执行兑换（原子操作）
 * - 批量生成兑换码
 */

import crypto from 'crypto';
import { pool } from '../db/index.js';
import { ValidationError } from '../utils/errors.js';
import { getTodayDateCST } from './period-card.js';

// ============================================================
// 类型定义
// ============================================================

export interface RedeemCodeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  credits_amount: string;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  created_by: string | null;
  is_active: boolean;
  redeem_type: string;
  period_card_plan_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RedeemUsageRow {
  id: string;
  redeem_code_id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  credits_awarded: string;
  created_at: string;
}

export interface RedeemResult {
  success: boolean;
  creditsAwarded: number;
  message: string;
  redeemType: 'credits' | 'period_card';
}

export interface RedeemValidation {
  valid: boolean;
  creditsAmount: number;
  message: string;
  redeemType?: string;
  periodCardPlanName?: string;
}

// ============================================================
// 行转换
// ============================================================

export function rowToRedeemCode(row: RedeemCodeRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    creditsAmount: parseFloat(row.credits_amount),
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    isActive: row.is_active,
    redeemType: row.redeem_type,
    periodCardPlanId: row.period_card_plan_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToRedeemUsage(row: RedeemUsageRow) {
  return {
    id: row.id,
    redeemCodeId: row.redeem_code_id,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    creditsAwarded: parseFloat(row.credits_awarded),
    createdAt: row.created_at,
  };
}

// ============================================================
// 生成随机兑换码
// 格式: PREFIX-XXXX-XXXX
// ============================================================

function generateRandomCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part1 = Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  const part2 = Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `${prefix.toUpperCase()}-${part1}-${part2}`;
}

// ============================================================
// 服务方法
// ============================================================

/**
 * 验证兑换码（不执行兑换）
 */
async function validateRedeemCode(code: string, userId: string): Promise<RedeemValidation> {
  const result = await pool.query(
    `SELECT * FROM redeem_codes WHERE UPPER(code) = UPPER($1)`,
    [code]
  );

  if (!result.rows || result.rows.length === 0) {
    return { valid: false, creditsAmount: 0, message: '兑换码不存在' };
  }

  const redeemCode = result.rows[0] as RedeemCodeRow;

  if (!redeemCode.is_active) {
    return { valid: false, creditsAmount: 0, message: '兑换码已停用' };
  }

  if (redeemCode.expires_at && new Date(redeemCode.expires_at) < new Date()) {
    return { valid: false, creditsAmount: 0, message: '兑换码已过期' };
  }

  if (redeemCode.max_uses !== null && redeemCode.used_count >= redeemCode.max_uses) {
    return { valid: false, creditsAmount: 0, message: '兑换码已达到使用上限' };
  }

  // 检查用户是否已使用过
  const usageResult = await pool.query(
    `SELECT id FROM redeem_code_usages WHERE redeem_code_id = $1 AND user_id = $2`,
    [redeemCode.id, userId]
  );

  if (usageResult.rows && usageResult.rows.length > 0) {
    return { valid: false, creditsAmount: 0, message: '您已使用过此兑换码' };
  }

  // 期卡类型
  if (redeemCode.redeem_type === 'period_card') {
    if (!redeemCode.period_card_plan_id) {
      return { valid: false, creditsAmount: 0, message: '兑换码配置异常，缺少期卡套餐' };
    }
    const planResult = await pool.query(
      `SELECT name FROM period_card_plans WHERE id = $1 AND is_enabled = true`,
      [redeemCode.period_card_plan_id]
    );
    if (!planResult.rows || planResult.rows.length === 0) {
      return { valid: false, creditsAmount: 0, message: '关联的期卡套餐不存在或已下架' };
    }
    const planName = (planResult.rows[0] as { name: string }).name;
    return {
      valid: true,
      creditsAmount: 0,
      message: `可兑换期卡套餐: ${planName}`,
      redeemType: 'period_card',
      periodCardPlanName: planName,
    };
  }

  return {
    valid: true,
    creditsAmount: parseFloat(redeemCode.credits_amount),
    message: `可兑换 ${parseFloat(redeemCode.credits_amount)} 积分`,
    redeemType: 'credits',
  };
}

/**
 * 执行兑换（原子事务操作）
 */
async function redeemCode(code: string, userId: string): Promise<RedeemResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 锁定兑换码行，防止并发问题
    const codeResult = await client.query(
      `SELECT * FROM redeem_codes WHERE UPPER(code) = UPPER($1) FOR UPDATE`,
      [code]
    );

    if (!codeResult.rows || codeResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new ValidationError('兑换码不存在');
    }

    const redeemCodeRow = codeResult.rows[0] as RedeemCodeRow;

    if (!redeemCodeRow.is_active) {
      await client.query('ROLLBACK');
      throw new ValidationError('兑换码已停用');
    }

    if (redeemCodeRow.expires_at && new Date(redeemCodeRow.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      throw new ValidationError('兑换码已过期');
    }

    if (redeemCodeRow.max_uses !== null && redeemCodeRow.used_count >= redeemCodeRow.max_uses) {
      await client.query('ROLLBACK');
      throw new ValidationError('兑换码已达到使用上限');
    }

    // 检查用户是否已使用过
    const usageCheck = await client.query(
      `SELECT id FROM redeem_code_usages WHERE redeem_code_id = $1 AND user_id = $2`,
      [redeemCodeRow.id, userId]
    );

    if (usageCheck.rows && usageCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      throw new ValidationError('您已使用过此兑换码');
    }

    // 1. 更新兑换码使用次数
    await client.query(
      `UPDATE redeem_codes SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1`,
      [redeemCodeRow.id]
    );

    // 根据兑换类型分支处理
    if (redeemCodeRow.redeem_type === 'period_card') {
      return await redeemPeriodCard(client, redeemCodeRow, userId);
    }

    return await redeemCredits(client, redeemCodeRow, userId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 兑换积分（原有逻辑）
 */
async function redeemCredits(
  client: import('pg').PoolClient,
  redeemCodeRow: RedeemCodeRow,
  userId: string
): Promise<RedeemResult> {
  const creditsAmount = parseFloat(redeemCodeRow.credits_amount);

  // 插入兑换记录
  await client.query(
    `INSERT INTO redeem_code_usages (redeem_code_id, user_id, credits_awarded)
     VALUES ($1, $2, $3)`,
    [redeemCodeRow.id, userId, creditsAmount]
  );

  // 更新用户余额（upsert）
  const balanceResult = await client.query(
    `SELECT credits, balance FROM user_balances WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );

  let creditsBefore = 0;
  let balanceBefore = '0';

  if (balanceResult.rows && balanceResult.rows.length > 0) {
    creditsBefore = parseFloat((balanceResult.rows[0] as { credits: string }).credits);
    balanceBefore = (balanceResult.rows[0] as { balance: string }).balance;

    await client.query(
      `UPDATE user_balances
       SET credits = credits + $1,
           total_credits_purchased = total_credits_purchased + $1,
           updated_at = NOW()
       WHERE user_id = $2`,
      [creditsAmount, userId]
    );
  } else {
    await client.query(
      `INSERT INTO user_balances (user_id, credits, total_credits_purchased)
       VALUES ($1, $2, $2)`,
      [userId, creditsAmount]
    );
  }

  const creditsAfter = creditsBefore + creditsAmount;

  // 记录余额变动
  await client.query(
    `INSERT INTO balance_transactions
     (user_id, type, amount, balance_before, balance_after, credits_amount, credits_before, credits_after, description, reference_type, metadata)
     VALUES ($1, 'bonus', '0', $2, $2, $3, $4, $5, $6, 'redeem_code', $7)`,
    [
      userId,
      balanceBefore,
      creditsAmount,
      creditsBefore,
      creditsAfter,
      `兑换码 ${redeemCodeRow.code} 兑换 ${creditsAmount} 积分`,
      JSON.stringify({ redeemCodeId: redeemCodeRow.id, redeemCode: redeemCodeRow.code }),
    ]
  );

  await client.query('COMMIT');

  return {
    success: true,
    creditsAwarded: creditsAmount,
    message: `成功兑换 ${creditsAmount} 积分`,
    redeemType: 'credits' as const,
  };
}

/**
 * 兑换期卡
 */
async function redeemPeriodCard(
  client: import('pg').PoolClient,
  redeemCodeRow: RedeemCodeRow,
  userId: string
): Promise<RedeemResult> {
  // 查询关联的期卡套餐
  const planResult = await client.query(
    `SELECT * FROM period_card_plans WHERE id = $1 AND is_enabled = true`,
    [redeemCodeRow.period_card_plan_id]
  );

  if (!planResult.rows || planResult.rows.length === 0) {
    await client.query('ROLLBACK');
    throw new ValidationError('关联的期卡套餐不存在或已下架');
  }

  const plan = planResult.rows[0] as {
    id: string;
    name: string;
    period_days: number;
    daily_credits: string;
    quota_mode: string | null;
    total_credits: string | null;
  };

  // 激活期卡
  const now = new Date();
  const expiresAt = new Date(now.getTime() + plan.period_days * 24 * 60 * 60 * 1000);
  const quotaMode = plan.quota_mode ?? 'daily';

  if (quotaMode === 'total') {
    const totalCredits = parseFloat(plan.total_credits ?? '0');
    await client.query(
      `INSERT INTO user_period_cards (user_id, plan_id, payment_id, status, starts_at, expires_at, daily_credits, daily_quota_remaining, quota_reset_date, quota_mode, total_credits, total_remaining)
       VALUES ($1, $2, NULL, 'active', $3, $4, 0, 0, NULL, 'total', $5, $5)`,
      [userId, plan.id, now, expiresAt, totalCredits]
    );
  } else {
    const quotaResetDate = getTodayDateCST();
    await client.query(
      `INSERT INTO user_period_cards (user_id, plan_id, payment_id, status, starts_at, expires_at, daily_credits, daily_quota_remaining, quota_reset_date)
       VALUES ($1, $2, NULL, 'active', $3, $4, $5, $5, $6)`,
      [userId, plan.id, now, expiresAt, plan.daily_credits, quotaResetDate]
    );
  }

  // 写兑换记录（credits_awarded = 0）
  await client.query(
    `INSERT INTO redeem_code_usages (redeem_code_id, user_id, credits_awarded)
     VALUES ($1, $2, 0)`,
    [redeemCodeRow.id, userId]
  );

  // 写审计记录
  const balanceResult = await client.query(
    `SELECT credits, balance FROM user_balances WHERE user_id = $1`,
    [userId]
  );

  let balanceBefore = '0';
  let creditsBefore = 0;

  if (balanceResult.rows && balanceResult.rows.length > 0) {
    balanceBefore = (balanceResult.rows[0] as { balance: string }).balance;
    creditsBefore = parseFloat((balanceResult.rows[0] as { credits: string }).credits);
  }

  await client.query(
    `INSERT INTO balance_transactions
     (user_id, type, amount, balance_before, balance_after, credits_amount, credits_before, credits_after, description, reference_type, metadata)
     VALUES ($1, 'bonus', '0', $2, $2, 0, $3, $3, $4, 'redeem_code', $5)`,
    [
      userId,
      balanceBefore,
      creditsBefore,
      `兑换码 ${redeemCodeRow.code} 兑换期卡 ${plan.name}`,
      JSON.stringify({ redeemCodeId: redeemCodeRow.id, redeemCode: redeemCodeRow.code, periodCardPlanId: plan.id }),
    ]
  );

  await client.query('COMMIT');

  return {
    success: true,
    creditsAwarded: 0,
    message: `成功兑换期卡套餐: ${plan.name}`,
    redeemType: 'period_card' as const,
  };
}

/**
 * 批量生成兑换码
 */
async function batchCreate(params: {
  prefix: string;
  count: number;
  name: string;
  description?: string;
  creditsAmount: number;
  maxUses: number | null;
  expiresAt?: string | null;
  isActive: boolean;
  createdBy?: string;
  redeemType?: string;
  periodCardPlanId?: string;
}): Promise<string[]> {
  const createdCodes: string[] = [];
  const maxRetries = 3;

  for (let i = 0; i < params.count; i++) {
    let inserted = false;
    let code = '';

    for (let retry = 0; retry < maxRetries; retry++) {
      code = generateRandomCode(params.prefix);

      try {
        await pool.query(
          `INSERT INTO redeem_codes
           (code, name, description, credits_amount, max_uses, expires_at, is_active, created_by, redeem_type, period_card_plan_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            code,
            params.name,
            params.description ?? null,
            params.creditsAmount,
            params.maxUses,
            params.expiresAt ?? null,
            params.isActive,
            params.createdBy ?? null,
            params.redeemType ?? 'credits',
            params.periodCardPlanId ?? null,
          ]
        );
        inserted = true;
        break;
      } catch (err: unknown) {
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

  return createdCodes;
}

export const redeemCodeService = {
  validateRedeemCode,
  redeemCode,
  batchCreate,
  generateRandomCode,
  rowToRedeemCode,
  rowToRedeemUsage,
};
