/**
 * 签到服务
 *
 * 功能：
 * - 每日签到（UTC+8 时区）
 * - 连续签到天数追踪（7 天周期）
 * - 签到奖励积分发放
 * - 签到状态查询
 * - 签到日历查询
 */

import { pool } from '../db/index.js';
import {
  getSystemConfigNumber,
  getSystemConfigBool,
} from './config.js';
import { ValidationError } from '../utils/errors.js';

// ==========================================
// 时区工具
// ==========================================

/**
 * 获取 UTC+8 时区的当前日期字符串 (YYYY-MM-DD)
 */
function getTodayDateCST(): string {
  const now = new Date();
  // UTC+8
  const cstOffset = 8 * 60 * 60 * 1000;
  const cstDate = new Date(now.getTime() + cstOffset);
  return cstDate.toISOString().split('T')[0] as string;
}

/**
 * 获取 UTC+8 时区的昨天日期字符串 (YYYY-MM-DD)
 */
function getYesterdayDateCST(): string {
  const now = new Date();
  const cstOffset = 8 * 60 * 60 * 1000;
  const cstDate = new Date(now.getTime() + cstOffset - 24 * 60 * 60 * 1000);
  return cstDate.toISOString().split('T')[0] as string;
}

// ==========================================
// 签到核心逻辑
// ==========================================

export interface CheckInResult {
  success: boolean;
  date: string;
  consecutiveDays: number;
  creditsEarned: number;
  totalCredits: number;
  message: string;
}

/**
 * 执行签到
 *
 * 使用事务 + UNIQUE 约束防止并发重复签到（TOCTOU 安全）
 */
export async function performCheckIn(userId: string): Promise<CheckInResult> {
  // 检查签到功能是否启用
  const enabled = await getSystemConfigBool('checkin_enabled', true);
  if (!enabled) {
    throw new ValidationError('签到功能暂未开放');
  }

  // 检查用户是否被冻结
  const userResult = await pool.query<{ is_frozen: boolean }>(
    `SELECT is_frozen FROM users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new ValidationError('用户不存在');
  }

  const userRow = userResult.rows[0]!;
  if (userRow.is_frozen) {
    throw new ValidationError('账户已被冻结，无法签到');
  }

  const today = getTodayDateCST();

  // 计算连续签到天数（事务外读取，仅用于计算奖励）
  const consecutiveDays = await calculateConsecutiveDays(userId, today);
  const creditsEarned = await calculateCheckInReward(consecutiveDays);

  // 使用事务保证签到记录插入 + 积分发放的原子性
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 利用 UNIQUE(user_id, check_in_date) 约束，INSERT ... ON CONFLICT 防止重复签到
    const insertResult = await client.query<{ id: string }>(
      `INSERT INTO check_in_records (user_id, check_in_date, consecutive_days, credits_earned)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, check_in_date) DO NOTHING
       RETURNING id`,
      [userId, today, consecutiveDays, creditsEarned.toFixed(2)]
    );

    if (insertResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new ValidationError('今天已经签到过了');
    }

    // 在同一事务内发放积分
    const totalCredits = await grantCheckInCreditsInTx(client, userId, creditsEarned, consecutiveDays);

    await client.query('COMMIT');

    return {
      success: true,
      date: today,
      consecutiveDays,
      creditsEarned,
      totalCredits,
      message: consecutiveDays > 1
        ? `签到成功！连续签到 ${consecutiveDays} 天，获得 ${creditsEarned} 积分`
        : `签到成功！获得 ${creditsEarned} 积分`,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 计算连续签到天数
 */
async function calculateConsecutiveDays(
  userId: string,
  _today: string
): Promise<number> {
  const yesterday = getYesterdayDateCST();

  // 查询昨天的签到记录
  const yesterdayRecord = await pool.query<{ consecutive_days: number }>(
    `SELECT consecutive_days FROM check_in_records
     WHERE user_id = $1 AND check_in_date = $2
     LIMIT 1`,
    [userId, yesterday]
  );

  if (yesterdayRecord.rows.length === 0) {
    // 昨天没签到，重新开始计数
    return 1;
  }

  const prevDays = yesterdayRecord.rows[0]!.consecutive_days;

  // 7 天周期：达到 7 天后重新开始
  if (prevDays >= 7) {
    return 1;
  }

  return prevDays + 1;
}

/**
 * 计算签到奖励积分
 *
 * 奖励策略（7 天周期）：
 * - 基础奖励：checkin_base_credits（默认 0.5）
 * - 连续奖励：每多一天 +checkin_consecutive_bonus（默认 0.1）
 * - 最大连续奖励：checkin_max_consecutive_bonus（默认 3）
 *
 * 示例（默认配置）：
 * 第1天: 0.5
 * 第2天: 0.5 + 0.1 = 0.6
 * 第3天: 0.5 + 0.2 = 0.7
 * ...
 * 第7天: 0.5 + 0.6 = 1.1
 * 第8天（新周期）: 0.5
 */
async function calculateCheckInReward(consecutiveDays: number): Promise<number> {
  const baseCredits = await getSystemConfigNumber('checkin_base_credits', 0.5);
  const consecutiveBonus = await getSystemConfigNumber('checkin_consecutive_bonus', 0.1);
  const maxConsecutiveBonus = await getSystemConfigNumber('checkin_max_consecutive_bonus', 3);

  const bonus = Math.min(
    (consecutiveDays - 1) * consecutiveBonus,
    maxConsecutiveBonus
  );

  return Number((baseCredits + bonus).toFixed(2));
}

/**
 * 发放签到积分（事务内版本）
 * 接受事务 client，保证与签到记录插入在同一事务中
 */
async function grantCheckInCreditsInTx(
  client: import('pg').PoolClient,
  userId: string,
  credits: number,
  consecutiveDays: number
): Promise<number> {
  // 获取当前积分（使用 FOR UPDATE 锁定行）
  const balanceResult = await client.query<{ credits: string }>(
    `SELECT credits FROM user_balances WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );

  let currentCredits = 0;
  if (balanceResult.rows.length > 0) {
    currentCredits = parseFloat(balanceResult.rows[0]!.credits);
  } else {
    // 初始化余额记录
    await client.query(
      `INSERT INTO user_balances (user_id, balance, currency, total_deposited, total_spent, credits, total_credits_purchased, total_credits_consumed)
       VALUES ($1, '0', 'CNY', '0', '0', '0', '0', '0')`,
      [userId]
    );
  }

  const newCredits = Number((currentCredits + credits).toFixed(2));

  // 更新积分
  await client.query(
    `UPDATE user_balances SET
       credits = $1,
       total_credits_purchased = total_credits_purchased::decimal + $2,
       updated_at = NOW()
     WHERE user_id = $3`,
    [newCredits.toString(), credits.toFixed(2), userId]
  );

  // 记录交易
  await client.query(
    `INSERT INTO balance_transactions
       (user_id, type, amount, balance_before, balance_after,
        credits_amount, credits_before, credits_after, description)
     VALUES ($1, 'bonus', '0', '0', '0', $2, $3, $4, $5)`,
    [
      userId,
      credits.toFixed(2),
      currentCredits.toFixed(2),
      newCredits.toFixed(2),
      `每日签到奖励（连续第 ${consecutiveDays} 天）`,
    ]
  );

  return newCredits;
}

// ==========================================
// 签到状态查询
// ==========================================

export interface CheckInStatus {
  checkedInToday: boolean;
  consecutiveDays: number;
  totalCheckIns: number;
  lastCheckInDate: string | null;
  todayReward: number;
  nextReward: number;
}

/**
 * 获取签到状态
 */
export async function getCheckInStatus(userId: string): Promise<CheckInStatus> {
  const today = getTodayDateCST();

  // 查询今天的签到记录
  const todayRecord = await pool.query<{
    consecutive_days: number;
    credits_earned: string;
  }>(
    `SELECT consecutive_days, credits_earned FROM check_in_records
     WHERE user_id = $1 AND check_in_date = $2
     LIMIT 1`,
    [userId, today]
  );

  // 查询总签到次数
  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM check_in_records WHERE user_id = $1`,
    [userId]
  );

  // 查询最近一次签到
  const lastRecord = await pool.query<{
    check_in_date: string;
    consecutive_days: number;
  }>(
    `SELECT check_in_date, consecutive_days FROM check_in_records
     WHERE user_id = $1
     ORDER BY check_in_date DESC
     LIMIT 1`,
    [userId]
  );

  const checkedInToday = todayRecord.rows.length > 0;
  const totalCheckIns = parseInt(totalResult.rows[0]!.count, 10);
  const lastCheckInDate = lastRecord.rows.length > 0
    ? lastRecord.rows[0]!.check_in_date
    : null;

  let consecutiveDays = 0;
  if (checkedInToday) {
    consecutiveDays = todayRecord.rows[0]!.consecutive_days;
  } else if (lastRecord.rows.length > 0) {
    const yesterday = getYesterdayDateCST();
    if (lastRecord.rows[0]!.check_in_date === yesterday) {
      consecutiveDays = lastRecord.rows[0]!.consecutive_days;
    }
  }

  // 计算今天/下次的奖励
  const nextConsecutive = checkedInToday
    ? (consecutiveDays >= 7 ? 1 : consecutiveDays + 1)
    : (consecutiveDays > 0 ? consecutiveDays + 1 : 1);

  const todayReward = checkedInToday
    ? parseFloat(todayRecord.rows[0]!.credits_earned)
    : await calculateCheckInReward(consecutiveDays > 0 ? consecutiveDays + 1 : 1);

  const nextReward = await calculateCheckInReward(nextConsecutive);

  return {
    checkedInToday,
    consecutiveDays,
    totalCheckIns,
    lastCheckInDate,
    todayReward,
    nextReward,
  };
}

// ==========================================
// 签到日历
// ==========================================

export interface CheckInCalendarItem {
  date: string;
  consecutiveDays: number;
  creditsEarned: number;
}

/**
 * 获取签到日历（指定月份）
 */
export async function getCheckInCalendar(
  userId: string,
  year: number,
  month: number
): Promise<CheckInCalendarItem[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const result = await pool.query<{
    check_in_date: string;
    consecutive_days: number;
    credits_earned: string;
  }>(
    `SELECT check_in_date, consecutive_days, credits_earned
     FROM check_in_records
     WHERE user_id = $1
       AND check_in_date >= $2
       AND check_in_date < $3
     ORDER BY check_in_date ASC`,
    [userId, startDate, endDate]
  );

  return result.rows.map((row) => ({
    date: row.check_in_date,
    consecutiveDays: row.consecutive_days,
    creditsEarned: parseFloat(row.credits_earned),
  }));
}
