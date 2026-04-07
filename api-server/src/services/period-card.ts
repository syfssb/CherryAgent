import { pool } from '../db/index.js';
import { emailService } from './email.js';

// ==========================================
// 类型定义
// ==========================================

export interface PeriodCardPlan {
  id: string;
  name: string;
  description: string | null;
  periodType: string;
  periodDays: number;
  dailyCredits: string;
  priceCents: number;
  currency: string;
  isEnabled: boolean;
  sortOrder: number;
}

export interface UserPeriodCard {
  id: string;
  userId: string;
  planId: string;
  paymentId: string | null;
  status: string;
  startsAt: Date;
  expiresAt: Date;
  dailyCredits: string;
  dailyQuotaRemaining: string;
  quotaResetDate: string | null;
  quotaMode: 'daily' | 'total';
  totalCredits: number;
  totalRemaining: number;
  expiryNotified: boolean;
  upgradedToId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// 时区工具函数
// ==========================================

/**
 * 获取当前 Asia/Shanghai 时区的日期字符串 (YYYY-MM-DD)
 * 使用 formatToParts 避免 locale 差异问题
 */
export function getTodayDateCST(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  return `${year}-${month}-${day}`;
}

// ==========================================
// 期卡服务
// ==========================================

export const periodCardService = {
  /**
   * 激活期卡（支付成功后调用）
   * 在事务内调用，tx 由调用方传入
   */
  async activatePeriodCard(
    tx: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    userId: string,
    planId: string,
    paymentId: string
  ): Promise<UserPeriodCard> {
    // 查询套餐信息
    const planResult = await tx.query(
      `SELECT id, name, period_days, daily_credits, quota_mode, total_credits FROM period_card_plans WHERE id = $1`,
      [planId]
    );
    if (planResult.rows.length === 0) {
      throw new Error(`期卡套餐不存在: ${planId}`);
    }
    const plan = planResult.rows[0] as {
      id: string; name: string; period_days: number; daily_credits: string;
      quota_mode: string | null; total_credits: string | null;
    };

    const today = getTodayDateCST();
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + plan.period_days * 24 * 60 * 60 * 1000);
    const quotaMode = plan.quota_mode || 'daily';

    let insertResult;
    if (quotaMode === 'total') {
      // 总量池模式：daily_credits=0, daily_quota_remaining=0, quota_reset_date=NULL
      const totalCredits = plan.total_credits || '0';
      insertResult = await tx.query(
        `INSERT INTO user_period_cards
          (user_id, plan_id, payment_id, status, starts_at, expires_at,
           daily_credits, daily_quota_remaining, quota_reset_date,
           quota_mode, total_credits, total_remaining)
         VALUES ($1, $2, $3, 'active', $4, $5, 0, 0, NULL, 'total', $6, $6)
         RETURNING *`,
        [userId, planId, paymentId, startsAt, expiresAt, totalCredits]
      );
    } else {
      // 日额度模式（默认）：现有逻辑不变
      insertResult = await tx.query(
        `INSERT INTO user_period_cards
          (user_id, plan_id, payment_id, status, starts_at, expires_at,
           daily_credits, daily_quota_remaining, quota_reset_date)
         VALUES ($1, $2, $3, 'active', $4, $5, $6, $6, $7)
         RETURNING *`,
        [userId, planId, paymentId, startsAt, expiresAt, plan.daily_credits, today]
      );
    }

    const row = insertResult.rows[0] as Record<string, unknown>;
    return mapRowToUserPeriodCard(row);
  },

  /**
   * 查询用户所有有效期卡（带 lazy reset），按到期时间升序
   */
  async getActiveCards(userId: string): Promise<UserPeriodCard[]> {
    const result = await pool.query(
      `SELECT *,
              TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS db_today,
              CASE
                WHEN quota_mode = 'total' THEN total_remaining
                WHEN quota_reset_date != TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')
                  THEN daily_credits
                ELSE daily_quota_remaining
              END AS effective_quota_remaining
       FROM user_period_cards
       WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
       ORDER BY expires_at ASC`,
      [userId]
    );
    return result.rows.map((row: Record<string, unknown>) =>
      mapRowToUserPeriodCard({
        ...row,
        daily_quota_remaining: row.effective_quota_remaining,
      })
    );
  },

  /**
   * 查询用户当前有效期卡（带 lazy reset：跨天时返回重置后的额度值）
   * 兼容包装：返回 getActiveCards 第一张
   */
  async getActiveCard(userId: string): Promise<UserPeriodCard | null> {
    const cards = await this.getActiveCards(userId);
    return cards[0] ?? null;
  },

  /**
   * 升级期卡
   * 旧卡标记为 upgraded，新卡激活
   * 差价公式：max(0, 新卡价格 - 旧卡剩余价值)
   *   旧卡剩余价值 = (旧卡价格 / 旧卡总天数) × 剩余天数
   *   剩余天数 = ceil((expires_at - now()) / 86400000)  向上取整，对用户有利
   */
  async upgradePeriodCard(
    tx: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    userId: string,
    newPlanId: string,
    paymentId: string,
    oldCardId: string
  ): Promise<UserPeriodCard> {
    // 锁定旧卡（FOR UPDATE 用于外部事务调用场景，调用方可能未持有 advisory lock）
    const oldCardResult = await tx.query(
      `SELECT * FROM user_period_cards
       WHERE id = $1 AND user_id = $2 AND status = 'active'
       FOR UPDATE`,
      [oldCardId, userId]
    );
    if (oldCardResult.rows.length === 0) {
      throw new Error('当前没有可升级的有效期卡');
    }

    // 降级拦截：查询新旧套餐价格，禁止降级
    const oldPlanResult = await tx.query(
      `SELECT price_cents FROM period_card_plans WHERE id = $1`,
      [(oldCardResult.rows[0] as any).plan_id]
    );
    const newPlanResult = await tx.query(
      `SELECT price_cents FROM period_card_plans WHERE id = $1`,
      [newPlanId]
    );
    if (!oldPlanResult.rows[0] || !newPlanResult.rows[0]) {
      throw new Error('套餐信息查询失败');
    }
    const oldPrice = (oldPlanResult.rows[0] as { price_cents: number }).price_cents;
    const newPrice = (newPlanResult.rows[0] as { price_cents: number }).price_cents;
    if (newPrice < oldPrice) {
      throw new Error(`不支持降级: 新套餐价格 (${newPrice}) 低于当前套餐 (${oldPrice})`);
    }

    // 标记旧卡为 upgraded
    await tx.query(
      `UPDATE user_period_cards
       SET status = 'upgraded', updated_at = NOW()
       WHERE id = $1`,
      [oldCardId]
    );

    // 激活新卡
    const newCard = await this.activatePeriodCard(tx, userId, newPlanId, paymentId);

    // 回写旧卡的 upgraded_to_id
    await tx.query(
      `UPDATE user_period_cards SET upgraded_to_id = $1 WHERE id = $2`,
      [newCard.id, oldCardId]
    );

    return newCard;
  },

  /**
   * 计算升级差价（分）
   */
  async calculateUpgradePrice(
    oldCardId: string,
    newPlanId: string
  ): Promise<{ priceCents: number; oldRemainingValue: number; newPriceCents: number }> {
    const [oldCardResult, , newPlanResult] = await Promise.all([
      pool.query(
        `SELECT upc.*, pcp.price_cents AS plan_price_cents, pcp.period_days AS plan_period_days
         FROM user_period_cards upc
         JOIN period_card_plans pcp ON pcp.id = upc.plan_id
         WHERE upc.id = $1 AND upc.status = 'active'`,
        [oldCardId]
      ),
      Promise.resolve(null), // placeholder, info comes from join above
      pool.query(
        `SELECT price_cents FROM period_card_plans WHERE id = $1`,
        [newPlanId]
      ),
    ]);

    if (oldCardResult.rows.length === 0) {
      throw new Error('当前没有可升级的有效期卡');
    }
    if (newPlanResult.rows.length === 0) {
      throw new Error('目标套餐不存在');
    }

    const oldCard = oldCardResult.rows[0] as {
      expires_at: Date; plan_price_cents: number; plan_period_days: number;
    };
    const newPriceCents = (newPlanResult.rows[0] as { price_cents: number }).price_cents;

    // 剩余天数向上取整，对用户有利
    const remainingMs = new Date(oldCard.expires_at).getTime() - Date.now();
    const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    const oldRemainingValue = Math.round(
      (oldCard.plan_price_cents / oldCard.plan_period_days) * Math.max(0, remainingDays)
    );

    const priceCents = Math.max(0, newPriceCents - oldRemainingValue);

    return { priceCents, oldRemainingValue, newPriceCents };
  },

  /**
   * 过期处理 + 到期提醒（cron 调用）
   * 使用原子 UPDATE...RETURNING 去重，天然防重复
   */
  async processExpirations(): Promise<{ expired: number; reminded: number }> {
    // 1. 过期处理：将已过期的 active 卡标记为 expired
    const expiredResult = await pool.query(
      `UPDATE user_period_cards
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'active' AND expires_at <= NOW()
       RETURNING id`
    );
    const expired = expiredResult.rows.length;

    // 2. 到期提醒：原子 UPDATE...RETURNING 防重复
    const reminderResult = await pool.query(
      `UPDATE user_period_cards
       SET expiry_notified = true, updated_at = NOW()
       WHERE status = 'active'
         AND expires_at < NOW() + INTERVAL '1 day'
         AND expires_at > NOW()
         AND expiry_notified = false
       RETURNING id, user_id, plan_id, expires_at`
    );

    let reminded = 0;
    for (const row of reminderResult.rows as Array<{
      id: string; user_id: string; plan_id: string; expires_at: Date;
    }>) {
      try {
        // 查询用户和套餐信息
        const [userResult, planResult] = await Promise.all([
          pool.query(`SELECT email, name FROM users WHERE id = $1`, [row.user_id]),
          pool.query(`SELECT name FROM period_card_plans WHERE id = $1`, [row.plan_id]),
        ]);

        if (userResult.rows.length === 0 || planResult.rows.length === 0) {
          continue;
        }

        const user = userResult.rows[0] as { email: string; name: string | null };
        const plan = planResult.rows[0] as { name: string };
        const expiresAt = new Date(row.expires_at).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
        });

        await emailService.sendTemplateEmail(
          'period-card-expiry-reminder',
          user.email,
          {
            username: user.name ?? user.email.split('@')[0] ?? 'user',
            planName: plan.name,
            expiresAt,
            appName: 'Cherry Agent',
            renewLink: '',
          },
          row.user_id
        );
        reminded++;
      } catch (err) {
        console.error(`[PeriodCard] 发送到期提醒失败 (card=${row.id}):`, err);
      }
    }

    if (expired > 0 || reminded > 0) {
      console.info(`[PeriodCard] 过期处理完成: expired=${expired}, reminded=${reminded}`);
    }

    return { expired, reminded };
  },
};

// ==========================================
// 内部工具函数
// ==========================================

function mapRowToUserPeriodCard(row: Record<string, unknown>): UserPeriodCard {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    planId: row.plan_id as string,
    paymentId: (row.payment_id as string) ?? null,
    status: row.status as string,
    startsAt: new Date(row.starts_at as string),
    expiresAt: new Date(row.expires_at as string),
    dailyCredits: row.daily_credits as string,
    dailyQuotaRemaining: row.daily_quota_remaining as string,
    quotaResetDate: (row.quota_reset_date as string) ?? null,
    quotaMode: (row.quota_mode as 'daily' | 'total') || 'daily',
    totalCredits: parseFloat((row.total_credits as string) || '0'),
    totalRemaining: parseFloat((row.total_remaining as string) || '0'),
    expiryNotified: row.expiry_notified as boolean,
    upgradedToId: (row.upgraded_to_id as string) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export default periodCardService;
