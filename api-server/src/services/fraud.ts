/**
 * 防批量注册服务
 *
 * 功能：
 * - 一次性邮箱检测
 * - 同 IP 注册频率限制
 * - 注册 IP 记录
 * - 可疑账户扫描
 * - 欢迎奖励回收
 * - 账户冻结/解冻
 */

import MailChecker from 'mailchecker';
import { pool } from '../db/index.js';
import { getSystemConfigNumber, getSystemConfigBool } from './config.js';
import { ValidationError, RateLimitError } from '../utils/errors.js';

// ==========================================
// 注册前检查
// ==========================================

/**
 * 检查邮箱是否为一次性邮箱
 */
export function isDisposableEmail(email: string): boolean {
  return !MailChecker.isValid(email);
}

/**
 * 注册前防刷检查
 * 在用户注册前调用，检查邮箱和 IP 是否合规
 */
export async function preRegistrationCheck(
  email: string,
  ip: string
): Promise<void> {
  // 1. 一次性邮箱检测
  const blockDisposable = await getSystemConfigBool('fraud_block_disposable_email', true);
  if (blockDisposable && isDisposableEmail(email)) {
    throw new ValidationError('不支持使用临时邮箱注册，请使用常规邮箱');
  }

  // 2. 同 IP 注册频率检查
  await checkIpRegistrationRate(ip);
}

/**
 * 检查同一 IP 的注册频率
 */
async function checkIpRegistrationRate(ip: string): Promise<void> {
  const maxPerHour = await getSystemConfigNumber('fraud_max_registrations_per_ip_per_hour', 3);
  const maxPerDay = await getSystemConfigNumber('fraud_max_registrations_per_ip_per_day', 5);

  // 查询最近 1 小时内该 IP 的注册数
  const hourResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM ip_registration_log
     WHERE ip = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [ip]
  );

  const hourCount = parseInt(hourResult.rows[0]!.count, 10);
  if (hourCount >= maxPerHour) {
    throw new RateLimitError(
      '当前网络注册过于频繁，请稍后再试'
    );
  }

  // 查询最近 24 小时内该 IP 的注册数
  const dayResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM ip_registration_log
     WHERE ip = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [ip]
  );

  const dayCount = parseInt(dayResult.rows[0]!.count, 10);
  if (dayCount >= maxPerDay) {
    throw new RateLimitError(
      '当前网络今日注册次数已达上限，请明天再试'
    );
  }
}

// ==========================================
// 注册后记录
// ==========================================

/**
 * 记录注册信息（注册成功后调用）
 */
export async function recordRegistration(
  userId: string,
  email: string,
  ip: string
): Promise<void> {
  const disposable = isDisposableEmail(email);

  // 记录 IP 注册日志
  await pool.query(
    `INSERT INTO ip_registration_log (ip, user_id, email, is_disposable)
     VALUES ($1, $2, $3, $4)`,
    [ip, userId, email, disposable]
  );

  // 更新用户的注册 IP
  await pool.query(
    `UPDATE users SET registration_ip = $1 WHERE id = $2`,
    [ip, userId]
  );
}

// ==========================================
// 可疑账户扫描（定时任务调用）
// ==========================================

/**
 * 扫描可疑账户（定时任务入口）
 *
 * 检测规则：
 * 1. 同 IP 多账户注册
 * 2. 一次性邮箱注册
 * 3. 快速消耗欢迎奖励积分
 */
export async function scanSuspiciousAccounts(): Promise<void> {
  const enabled = await getSystemConfigBool('fraud_scan_enabled', true);
  if (!enabled) {
    return;
  }

  await scanSameIpMultipleAccounts();
  await scanDisposableEmailAccounts();
  await scanRapidCreditConsumption();
}

/**
 * 扫描同 IP 多账户注册
 */
async function scanSameIpMultipleAccounts(): Promise<void> {
  // 查找最近 24 小时内同一 IP 注册了 3 个以上账户的情况
  const result = await pool.query<{
    ip: string;
    user_count: string;
    user_ids: string[];
  }>(
    `SELECT ip, COUNT(DISTINCT user_id) as user_count,
            ARRAY_AGG(DISTINCT user_id) as user_ids
     FROM ip_registration_log
     WHERE created_at > NOW() - INTERVAL '24 hours'
     GROUP BY ip
     HAVING COUNT(DISTINCT user_id) >= 3`
  );

  for (const row of result.rows) {
    for (const userId of row.user_ids) {
      await createSuspiciousRecord(
        userId,
        'same_ip_multiple_accounts',
        {
          ip: row.ip,
          totalAccounts: parseInt(row.user_count, 10),
          relatedUserIds: row.user_ids,
        }
      );
    }
  }
}

/**
 * 扫描一次性邮箱注册的账户
 */
async function scanDisposableEmailAccounts(): Promise<void> {
  const result = await pool.query<{ user_id: string; email: string }>(
    `SELECT irl.user_id, irl.email
     FROM ip_registration_log irl
     LEFT JOIN suspicious_accounts sa
       ON sa.user_id = irl.user_id AND sa.reason = 'disposable_email'
     WHERE irl.is_disposable = TRUE
       AND irl.created_at > NOW() - INTERVAL '7 days'
       AND sa.id IS NULL`
  );

  for (const row of result.rows) {
    await createSuspiciousRecord(
      row.user_id,
      'disposable_email',
      { email: row.email }
    );
  }
}

/**
 * 扫描快速消耗欢迎奖励积分的账户
 */
async function scanRapidCreditConsumption(): Promise<void> {
  const thresholdMinutes = await getSystemConfigNumber(
    'fraud_rapid_consumption_threshold_minutes',
    30
  );

  // 查找注册后在阈值时间内就消耗完欢迎奖励的用户
  const result = await pool.query<{
    user_id: string;
    registered_at: Date;
    first_usage_at: Date;
    minutes_diff: string;
  }>(
    `SELECT u.id as user_id, u.created_at as registered_at,
            MIN(bt.created_at) as first_usage_at,
            EXTRACT(EPOCH FROM (MIN(bt.created_at) - u.created_at)) / 60 as minutes_diff
     FROM users u
     JOIN balance_transactions bt ON bt.user_id = u.id AND bt.type = 'usage'
     JOIN user_balances ub ON ub.user_id = u.id
     LEFT JOIN suspicious_accounts sa
       ON sa.user_id = u.id AND sa.reason = 'rapid_credit_consumption'
     WHERE u.created_at > NOW() - INTERVAL '7 days'
       AND ub.credits::decimal <= 0
       AND sa.id IS NULL
     GROUP BY u.id, u.created_at
     HAVING EXTRACT(EPOCH FROM (MIN(bt.created_at) - u.created_at)) / 60 < $1`,
    [thresholdMinutes]
  );

  for (const row of result.rows) {
    await createSuspiciousRecord(
      row.user_id,
      'rapid_credit_consumption',
      {
        registeredAt: row.registered_at,
        firstUsageAt: row.first_usage_at,
        minutesDiff: parseFloat(row.minutes_diff),
      }
    );
  }
}

/**
 * 创建可疑账户记录（去重）
 */
async function createSuspiciousRecord(
  userId: string,
  reason: string,
  details: Record<string, unknown>
): Promise<void> {
  // 检查是否已有相同原因的未处理记录
  const existing = await pool.query(
    `SELECT id FROM suspicious_accounts
     WHERE user_id = $1 AND reason = $2 AND status = 'pending'
     LIMIT 1`,
    [userId, reason]
  );

  if (existing.rows.length > 0) {
    return;
  }

  await pool.query(
    `INSERT INTO suspicious_accounts (user_id, reason, details, status)
     VALUES ($1, $2, $3, 'pending')`,
    [userId, reason, JSON.stringify(details)]
  );

  // 更新用户风险分数
  await pool.query(
    `UPDATE users SET
       risk_score = risk_score + 10,
       risk_flags = risk_flags || $1::jsonb
     WHERE id = $2`,
    [JSON.stringify([reason]), userId]
  );
}

// ==========================================
// 管理操作
// ==========================================

/**
 * 冻结用户账户
 */
export async function freezeUser(
  userId: string,
  reason: string
): Promise<void> {
  await pool.query(
    `UPDATE users SET
       is_frozen = TRUE,
       frozen_at = NOW(),
       frozen_reason = $1,
       is_active = FALSE
     WHERE id = $2`,
    [reason, userId]
  );
}

/**
 * 解冻用户账户
 */
export async function unfreezeUser(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET
       is_frozen = FALSE,
       frozen_at = NULL,
       frozen_reason = NULL,
       is_active = TRUE
     WHERE id = $1`,
    [userId]
  );
}

/**
 * 回收欢迎奖励积分
 */
export async function clawbackWelcomeBonus(userId: string): Promise<number> {
  // 查找该用户的欢迎奖励交易
  const bonusResult = await pool.query<{
    credits_amount: string;
  }>(
    `SELECT credits_amount FROM balance_transactions
     WHERE user_id = $1 AND type = 'bonus' AND description LIKE '%欢迎奖励%'
     LIMIT 1`,
    [userId]
  );

  if (bonusResult.rows.length === 0) {
    return 0;
  }

  const bonusAmount = parseFloat(bonusResult.rows[0]!.credits_amount);
  if (bonusAmount <= 0) {
    return 0;
  }

  // 获取当前积分
  const balanceResult = await pool.query<{ credits: string }>(
    `SELECT credits FROM user_balances WHERE user_id = $1`,
    [userId]
  );

  if (balanceResult.rows.length === 0) {
    return 0;
  }

  const currentCredits = parseFloat(balanceResult.rows[0]!.credits);
  // 只回收剩余积分中不超过奖励金额的部分
  const clawbackAmount = Math.min(bonusAmount, Math.max(0, currentCredits));

  if (clawbackAmount <= 0) {
    return 0;
  }

  const newCredits = Number((currentCredits - clawbackAmount).toFixed(2));

  // 扣减积分
  await pool.query(
    `UPDATE user_balances SET
       credits = $1,
       total_credits_consumed = total_credits_consumed::decimal + $2,
       updated_at = NOW()
     WHERE user_id = $3`,
    [newCredits.toString(), clawbackAmount.toFixed(2), userId]
  );

  // 记录交易
  await pool.query(
    `INSERT INTO balance_transactions
       (user_id, type, amount, balance_before, balance_after,
        credits_amount, credits_before, credits_after, description)
     VALUES ($1, 'withdrawal', '0', '0', '0', $2, $3, $4, $5)`,
    [
      userId,
      (-clawbackAmount).toFixed(2),
      currentCredits.toFixed(2),
      newCredits.toFixed(2),
      `欢迎奖励回收（防刷处理）`,
    ]
  );

  return clawbackAmount;
}

/**
 * 获取可疑账户列表（管理后台用）
 */
export async function getSuspiciousAccounts(
  page: number,
  limit: number,
  status?: string
): Promise<{ items: SuspiciousAccountItem[]; total: number }> {
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (status) {
    conditions.push(`sa.status = $${paramIdx++}`);
    params.push(status);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM suspicious_accounts sa ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0]!.count, 10);

  const dataResult = await pool.query<SuspiciousAccountRow>(
    `SELECT sa.id, sa.user_id, sa.reason, sa.details, sa.status,
            sa.reviewed_by, sa.reviewed_at, sa.action_taken,
            sa.created_at, sa.updated_at,
            u.email as user_email, u.name as user_name,
            u.is_frozen, u.risk_score, u.registration_ip,
            u.created_at as user_created_at
     FROM suspicious_accounts sa
     JOIN users u ON u.id = sa.user_id
     ${whereClause}
     ORDER BY sa.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  );

  const items: SuspiciousAccountItem[] = dataResult.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    actionTaken: row.action_taken,
    isFrozen: row.is_frozen,
    riskScore: row.risk_score,
    registrationIp: row.registration_ip,
    userCreatedAt: row.user_created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return { items, total };
}

/**
 * 审核可疑账户
 */
export async function reviewSuspiciousAccount(
  recordId: string,
  adminId: string,
  action: 'dismiss' | 'freeze' | 'freeze_and_clawback'
): Promise<{ clawbackAmount?: number }> {
  // 获取记录
  const record = await pool.query<{ user_id: string; status: string }>(
    `SELECT user_id, status FROM suspicious_accounts WHERE id = $1`,
    [recordId]
  );

  if (record.rows.length === 0) {
    throw new ValidationError('记录不存在');
  }

  const { user_id: userId, status: currentStatus } = record.rows[0]!;

  if (currentStatus !== 'pending') {
    throw new ValidationError('该记录已被处理');
  }

  let actionTaken = action;
  let clawbackAmount = 0;

  switch (action) {
    case 'dismiss':
      // 标记为已忽略
      break;

    case 'freeze':
      await freezeUser(userId, '管理员审核冻结');
      break;

    case 'freeze_and_clawback':
      await freezeUser(userId, '管理员审核冻结并回收积分');
      clawbackAmount = await clawbackWelcomeBonus(userId);
      break;
  }

  // 更新记录状态
  const newStatus = action === 'dismiss' ? 'dismissed' : 'reviewed';
  await pool.query(
    `UPDATE suspicious_accounts SET
       status = $1,
       reviewed_by = $2,
       reviewed_at = NOW(),
       action_taken = $3,
       updated_at = NOW()
     WHERE id = $4`,
    [newStatus, adminId, actionTaken, recordId]
  );

  return { clawbackAmount: clawbackAmount > 0 ? clawbackAmount : undefined };
}

// ==========================================
// 类型定义
// ==========================================

interface SuspiciousAccountRow {
  id: string;
  user_id: string;
  reason: string;
  details: unknown;
  status: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  action_taken: string | null;
  created_at: Date;
  updated_at: Date;
  user_email: string;
  user_name: string | null;
  is_frozen: boolean;
  risk_score: number;
  registration_ip: string | null;
  user_created_at: Date;
}

export interface SuspiciousAccountItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  reason: string;
  details: unknown;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  actionTaken: string | null;
  isFrozen: boolean;
  riskScore: number;
  registrationIp: string | null;
  userCreatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
