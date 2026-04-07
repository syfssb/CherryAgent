import { pool } from '../db/index.js';
import { billingService } from './billing.js';
import { scanSuspiciousAccounts } from './fraud.js';
import { getTodayDateCST } from './period-card.js';

// ==========================================
// 定时任务管理
// ==========================================

interface CronTask {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
  timer?: ReturnType<typeof setInterval>;
}

const tasks: CronTask[] = [];

/**
 * 注册定时任务
 */
function registerTask(name: string, intervalMs: number, handler: () => Promise<void>): void {
  tasks.push({ name, intervalMs, handler });
}

/**
 * 启动所有定时任务
 */
export function startCronTasks(): void {
  for (const task of tasks) {
    console.info(`[cron] 启动定时任务: ${task.name} (间隔 ${task.intervalMs / 1000}s)`);
    // 启动后延迟 30 秒执行第一次，避免服务启动时的数据库压力
    setTimeout(() => {
      task.timer = setInterval(async () => {
        try {
          await task.handler();
        } catch (error) {
          console.error(`[cron] 任务 ${task.name} 执行失败:`, error);
        }
      }, task.intervalMs);
      // 立即执行一次
      task.handler().catch((error) => {
        console.error(`[cron] 任务 ${task.name} 首次执行失败:`, error);
      });
    }, 30_000);
  }
}

/**
 * 停止所有定时任务
 */
export function stopCronTasks(): void {
  for (const task of tasks) {
    if (task.timer) {
      clearInterval(task.timer);
      task.timer = undefined;
      console.info(`[cron] 停止定时任务: ${task.name}`);
    }
  }
}

// ==========================================
// 任务：清理超时预扣记录
// ==========================================

/**
 * 清理超过 10 分钟仍为 pending 的预扣记录
 * 这些记录通常是因为网络中断等原因导致服务端永远收不到完成/失败信号
 */
async function cleanupStalePreCharges(): Promise<void> {
  const result = await pool.query<{
    id: string;
    user_id: string;
    credits_amount: string;
    metadata: { preChargeId: string; status: string };
  }>(
    `SELECT id, user_id, credits_amount, metadata
     FROM balance_transactions
     WHERE type = 'precharge'
       AND metadata->>'status' = 'pending'
       AND created_at < NOW() - INTERVAL '10 minutes'
     LIMIT 100`
  );

  if (result.rows.length === 0) {
    return;
  }

  console.info(`[cron] 发现 ${result.rows.length} 条超时预扣记录，开始清理...`);

  let successCount = 0;
  let failCount = 0;

  for (const row of result.rows) {
    try {
      const preChargeId = row.metadata?.preChargeId;
      if (!preChargeId) {
        console.warn(`[cron] 预扣记录 ${row.id} 缺少 preChargeId，跳过`);
        failCount++;
        continue;
      }

      await billingService.refundPreCharge(row.user_id, preChargeId);
      successCount++;
      console.info(`[cron] 自动退还超时预扣: ${preChargeId} (用户: ${row.user_id}, 积分: ${row.credits_amount})`);
    } catch (error) {
      failCount++;
      console.error(`[cron] 退还预扣 ${row.id} 失败:`, error);
    }
  }

  console.info(`[cron] 超时预扣清理完成: 成功 ${successCount}, 失败 ${failCount}`);
}

// 注册任务：每 5 分钟清理超时预扣
registerTask('cleanup-stale-precharges', 5 * 60 * 1000, cleanupStalePreCharges);

// 注册任务：每 30 分钟扫描可疑账户
registerTask('scan-suspicious-accounts', 30 * 60 * 1000, scanSuspiciousAccounts);

// ==========================================
// 任务：停用过期兑换码
// ==========================================

/**
 * 扫描已过期但仍为 active 的兑换码，批量停用
 */
async function deactivateExpiredRedeemCodes(): Promise<void> {
  const result = await pool.query(
    `UPDATE redeem_codes
     SET is_active = false, updated_at = NOW()
     WHERE is_active = true
       AND expires_at IS NOT NULL
       AND expires_at < NOW()
     RETURNING id, code`
  );

  if (result.rowCount && result.rowCount > 0) {
    console.info(`[cron] 已停用 ${result.rowCount} 个过期兑换码`);
  }
}

// 注册任务：每小时停用过期兑换码
registerTask('deactivate-expired-redeem-codes', 60 * 60 * 1000, deactivateExpiredRedeemCodes);

// ==========================================
// 任务：处理过期期卡
// ==========================================

/**
 * 将已过期但仍为 active 的期卡标记为 expired
 */
async function processExpiredPeriodCards(): Promise<void> {
  const result = await pool.query(
    `UPDATE user_period_cards
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'active'
       AND expires_at < NOW()
     RETURNING id, user_id`
  );

  if (result.rowCount && result.rowCount > 0) {
    console.info(`[cron] 已标记 ${result.rowCount} 张过期期卡`);
  }
}

// 注册任务：每 10 分钟处理过期期卡
registerTask('process-expired-period-cards', 10 * 60 * 1000, processExpiredPeriodCards);

// ==========================================
// 任务：期卡到期提醒
// ==========================================

/**
 * 对即将到期且未通知的期卡发送提醒邮件
 * 根据期卡总时长动态调整提醒时机：
 * - 1天期卡：提前3小时提醒
 * - 2-3天期卡：提前6小时提醒
 * - 4-7天期卡：提前24小时提醒
 * - 8-30天期卡：提前3天提醒
 * - 30天以上期卡：提前7天提醒
 */
async function sendPeriodCardExpiryReminders(): Promise<void> {
  // 原子 UPDATE...RETURNING 去重：多副本部署下天然防重复
  const result = await pool.query<{
    id: string;
    user_id: string;
    plan_name: string;
    expires_at: Date;
    email: string;
    name: string;
  }>(
    `UPDATE user_period_cards upc
     SET expiry_notified = true, updated_at = NOW()
     FROM period_card_plans pcp, users u
     WHERE upc.plan_id = pcp.id AND upc.user_id = u.id
       AND upc.status = 'active'
       AND upc.expiry_notified = false
       AND upc.expires_at > NOW()
       AND (
         -- 1天期卡：提前3小时提醒
         (EXTRACT(EPOCH FROM (upc.expires_at - upc.starts_at)) / 3600 <= 24
          AND upc.expires_at <= NOW() + INTERVAL '3 hours')
         OR
         -- 2-3天期卡：提前6小时提醒
         (EXTRACT(EPOCH FROM (upc.expires_at - upc.starts_at)) / 3600 > 24
          AND EXTRACT(EPOCH FROM (upc.expires_at - upc.starts_at)) / 3600 <= 72
          AND upc.expires_at <= NOW() + INTERVAL '6 hours')
         OR
         -- 4-7天期卡：提前24小时提醒
         (EXTRACT(EPOCH FROM (upc.expires_at - upc.starts_at)) / 3600 > 72
          AND EXTRACT(EPOCH FROM (upc.expires_at - upc.starts_at)) / 3600 <= 168
          AND upc.expires_at <= NOW() + INTERVAL '24 hours')
         OR
         -- 8-30天期卡：提前3天提醒
         (EXTRACT(EPOCH FROM (upc.expires_at - upc.starts_at)) / 3600 > 168
          AND EXTRACT(EPOCH FROM (upc.expires_at - upc.starts_at)) / 3600 <= 720
          AND upc.expires_at <= NOW() + INTERVAL '3 days')
         OR
         -- 30天以上期卡：提前7天提醒
         (EXTRACT(EPOCH FROM (upc.expires_at - upc.starts_at)) / 3600 > 720
          AND upc.expires_at <= NOW() + INTERVAL '7 days')
       )
     RETURNING upc.id, upc.user_id, pcp.name as plan_name, upc.expires_at, u.email, u.name`
  );

  if (result.rows.length === 0) return;

  console.info(`[cron] 发现 ${result.rows.length} 张即将到期的期卡，发送提醒...`);

  for (const row of result.rows) {
    try {
      const { emailService } = await import('./email.js');
      const renewLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing`;
      await emailService.sendPeriodCardExpiryEmail(
        row.email,
        row.name || row.email,
        row.plan_name,
        new Date(row.expires_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        renewLink
      );
    } catch (error) {
      // 邮件发送失败时回滚 expiry_notified，下次 cron 会重试
      console.error(`[cron] 发送期卡到期提醒失败 (${row.id}):`, error);
      await pool.query(
        `UPDATE user_period_cards SET expiry_notified = false WHERE id = $1`,
        [row.id]
      ).catch(rollbackErr => {
        console.error(`[cron] 回滚 expiry_notified 失败 (${row.id}):`, rollbackErr);
      });
    }
  }
}

// 注册任务：每小时检查期卡到期提醒
registerTask('period-card-expiry-reminders', 60 * 60 * 1000, sendPeriodCardExpiryReminders);

// ==========================================
// 任务：重置期卡每日额度
// ==========================================

/**
 * 在北京时间每天 00:00 后重置所有 active 期卡的每日额度
 */
async function resetDailyPeriodCardQuota(): Promise<void> {
  const todayStr = getTodayDateCST();

  const result = await pool.query(
    `UPDATE user_period_cards
     SET daily_quota_remaining = daily_credits,
         quota_reset_date = $1,
         updated_at = NOW()
     WHERE status = 'active'
       AND (quota_mode IS NULL OR quota_mode = 'daily')
       AND (quota_reset_date IS NULL OR quota_reset_date < $1)
     RETURNING id`,
    [todayStr]
  );

  if (result.rowCount && result.rowCount > 0) {
    console.info(`[cron] 已重置 ${result.rowCount} 张期卡的每日额度 (${todayStr})`);
  }
}

// 注册任务：每 5 分钟检查是否需要重置每日额度
registerTask('reset-daily-period-card-quota', 5 * 60 * 1000, resetDailyPeriodCardQuota);

// ==========================================
// 任务：清理过期密码重置 token
// ==========================================

/**
 * 清理过期或已使用的密码重置 token
 * - 已过期且未使用的 token：立即删除
 * - 已使用超过 7 天的 token：删除（保留 7 天用于审计）
 */
async function cleanupExpiredPasswordResetTokens(): Promise<void> {
  const result = await pool.query(
    `DELETE FROM password_reset_tokens
     WHERE (expires_at < NOW() AND used_at IS NULL)
        OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '7 days')
     RETURNING id`
  );
  if (result.rowCount && result.rowCount > 0) {
    console.info(`[cron] 已清理 ${result.rowCount} 条过期密码重置 token`);
  }
}

// 注册任务：每 6 小时清理过期密码重置 token
registerTask('cleanup-expired-password-reset-tokens', 6 * 60 * 60 * 1000, cleanupExpiredPasswordResetTokens);
