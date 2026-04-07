import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pool } from '../db/index.js';
import {
  userBalances,
  balanceTransactions,
  payments,
  usageLogs,
} from '../db/schema.js';
import {
  QuotaExceededError,
  NotFoundError,
  ConflictError,
} from '../utils/errors.js';
import { generateSecureToken } from '../utils/crypto.js';
import { emailService } from './email.js';
import { getSystemConfigNumber, getSystemConfigBool } from './config.js';

// ==========================================
// 类型定义
// ==========================================

export interface ModelCreditsInfo {
  id: string;
  displayName: string;
  provider: string;
  inputCreditsPerMtok: number;
  outputCreditsPerMtok: number;
  cacheReadCreditsPerMtok: number;
  cacheWriteCreditsPerMtok: number;
  isEnabled: boolean;
}

export interface CreditsCostCalculation {
  inputCredits: number;
  outputCredits: number;
  cacheReadCredits: number;
  cacheWriteCredits: number;
  totalCredits: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CardDeduction {
  cardId: string;
  quotaUsed: number;
  quotaMode?: 'daily' | 'total';
}

export interface PreChargeResult {
  preChargeId: string;
  estimatedCredits: number;
  creditsBefore: number;
  creditsAfter: number;
  /** 期卡额度扣减总量（0 表示无期卡或未使用期卡） */
  quotaUsed: number;
  /** 充值积分扣减量 */
  creditsUsed: number;
  /** 各期卡扣减明细（多卡场景） */
  cardDeductions: CardDeduction[];
  /** @deprecated 使用 cardDeductions 代替，保留兼容 */
  periodCardId: string | null;
}

export interface SettlementResult {
  actualCredits: number;
  refundCredits: number;
  creditsAfter: number;
  /** 本次结算实际消耗的期卡额度 */
  quotaUsed: number;
  /** 本次结算实际消耗的余额积分（两位小数，和余额流水一致） */
  balanceCreditsConsumed?: number;
}

export interface UsageData {
  requestId: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  latencyMs?: number | undefined;
  status: 'success' | 'error';
  errorMessage?: string | undefined;
  creditsConsumed: number;
  /** 期卡额度消耗量 */
  quotaUsed?: number;
  metadata?: Record<string, unknown> | undefined;
}

export interface UsageRecord {
  id: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  creditsConsumed: string;
  quotaUsed: string;
  cost: string;
  status: string;
  latencyMs: number | null;
  createdAt: Date;
  balanceCreditsConsumed?: string;
}

export interface TransactionRecord {
  id: string;
  type: string;
  amount: string;
  creditsAmount: string;
  creditsBefore: string;
  creditsAfter: string;
  description: string | null;
  createdAt: Date;
}

// ==========================================
// 模型价格缓存
// ==========================================

interface ModelPriceCache {
  data: Map<string, ModelCreditsInfo>;
  lastUpdated: number;
}

const MODEL_CACHE_TTL_MS = 60_000; // 1 分钟缓存

let modelPriceCache: ModelPriceCache = {
  data: new Map(),
  lastUpdated: 0,
};

// ==========================================
// 消费限额错误
// ==========================================

export class SpendingLimitError extends QuotaExceededError {
  public readonly limitType: 'daily' | 'monthly';
  public readonly spent: number;
  public readonly limit: number;
  public readonly resetAt: string;

  constructor(
    limitType: 'daily' | 'monthly',
    spent: number,
    limit: number,
    resetAt: string
  ) {
    const typeLabel = limitType === 'daily' ? '每日' : '每月';
    super(
      `已达到${typeLabel}消费限额: 已消费 ${spent.toFixed(2)} 积分，限额 ${limit.toFixed(2)} 积分，重置时间: ${resetAt}`,
      { limitType, spent, limit, resetAt }
    );
    this.limitType = limitType;
    this.spent = spent;
    this.limit = limit;
    this.resetAt = resetAt;
  }
}

// ==========================================
// 消费限额缓存
// ==========================================

interface SpendingLimitConfig {
  defaultDailyCreditsLimit: number;
  defaultMonthlyCreditsLimit: number;
  lastUpdated: number;
}

const SPENDING_LIMIT_CACHE_TTL_MS = 60_000; // 1 分钟缓存

let spendingLimitConfigCache: SpendingLimitConfig = {
  defaultDailyCreditsLimit: 0,
  defaultMonthlyCreditsLimit: 0,
  lastUpdated: 0,
};

// ==========================================
// 计费服务
// ==========================================

export const billingService = {
  /**
   * 从数据库加载模型积分价格
   * 带缓存，避免每次请求都查数据库
   */
  async loadModelPrices(): Promise<Map<string, ModelCreditsInfo>> {
    const now = Date.now();
    if (
      modelPriceCache.data.size > 0 &&
      now - modelPriceCache.lastUpdated < MODEL_CACHE_TTL_MS
    ) {
      return modelPriceCache.data;
    }

    const result = await pool.query(
      `SELECT
        id,
        display_name,
        provider,
        input_credits_per_mtok,
        output_credits_per_mtok,
        cache_read_credits_per_mtok,
        cache_write_credits_per_mtok,
        input_price_per_mtok,
        output_price_per_mtok,
        cache_read_price_per_mtok,
        cache_write_price_per_mtok,
        is_enabled
      FROM models
      WHERE is_enabled = true`
    );

    const newCache = new Map<string, ModelCreditsInfo>();
    for (const row of result.rows as Array<{
      id: string;
      display_name: string;
      provider: string;
      input_credits_per_mtok: string | null;
      output_credits_per_mtok: string | null;
      cache_read_credits_per_mtok: string | null;
      cache_write_credits_per_mtok: string | null;
      input_price_per_mtok: string | null;
      output_price_per_mtok: string | null;
      cache_read_price_per_mtok: string | null;
      cache_write_price_per_mtok: string | null;
      is_enabled: boolean;
    }>) {
      const inputCredits = parseFloat(row.input_credits_per_mtok ?? '0');
      const outputCredits = parseFloat(row.output_credits_per_mtok ?? '0');
      const cacheReadCredits = parseFloat(row.cache_read_credits_per_mtok ?? '0');
      const cacheWriteCredits = parseFloat(row.cache_write_credits_per_mtok ?? '0');

      newCache.set(row.id, {
        id: row.id,
        displayName: row.display_name,
        provider: row.provider,
        inputCreditsPerMtok: Number.isFinite(inputCredits) ? inputCredits : 0,
        outputCreditsPerMtok: Number.isFinite(outputCredits) ? outputCredits : 0,
        cacheReadCreditsPerMtok: Number.isFinite(cacheReadCredits) ? cacheReadCredits : 0,
        cacheWriteCreditsPerMtok: Number.isFinite(cacheWriteCredits) ? cacheWriteCredits : 0,
        isEnabled: row.is_enabled,
      });
    }

    modelPriceCache = { data: newCache, lastUpdated: now };
    return newCache;
  },

  /**
   * 清除模型价格缓存（管理员修改价格后调用）
   */
  clearModelPriceCache(): void {
    modelPriceCache = { data: new Map(), lastUpdated: 0 };
  },

  /**
   * 获取模型积分价格
   */
  async getModelCreditsInfo(model: string): Promise<ModelCreditsInfo> {
    const prices = await this.loadModelPrices();

    // 精确匹配
    const info = prices.get(model);
    if (info) {
      return info;
    }

    // 模糊匹配：尝试找到包含关键字的模型
    const normalizedModel = model.toLowerCase();
    for (const [key, value] of prices) {
      if (normalizedModel.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedModel)) {
        return value;
      }
    }

    // 默认价格（防止未配置模型无法使用）
    console.warn(`[billing] 模型 ${model} 未配置价格，使用默认价格`);
    return {
      id: model,
      displayName: model,
      provider: 'unknown',
      inputCreditsPerMtok: 3,
      outputCreditsPerMtok: 15,
      cacheReadCreditsPerMtok: 0.3,
      cacheWriteCreditsPerMtok: 0,
      isEnabled: true,
    };
  },

  /**
   * 计算请求消耗的积分
   */
  async calculateCredits(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number = 0,
    cacheWriteTokens: number = 0
  ): Promise<CreditsCostCalculation> {
    const modelInfo = await this.getModelCreditsInfo(model);

    // 读取全局价格倍率（默认 1.0，即不调整）
    const globalMultiplier = await getSystemConfigNumber('global_price_multiplier', 1.0);

    // OpenAI/Anthropic 的 prompt_tokens/input_tokens 已包含 cache tokens，
    // 计费时需要减去 cache 部分，避免双重计费
    const nonCacheInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);

    const inputCredits = (nonCacheInputTokens / 1_000_000) * modelInfo.inputCreditsPerMtok * globalMultiplier;
    const outputCredits = (outputTokens / 1_000_000) * modelInfo.outputCreditsPerMtok * globalMultiplier;
    const cacheReadCredits = (cacheReadTokens / 1_000_000) * modelInfo.cacheReadCreditsPerMtok * globalMultiplier;
    const cacheWriteCredits = (cacheWriteTokens / 1_000_000) * modelInfo.cacheWriteCreditsPerMtok * globalMultiplier;
    const totalCredits = inputCredits + outputCredits + cacheReadCredits + cacheWriteCredits;

    return {
      inputCredits: Number(inputCredits.toFixed(4)),
      outputCredits: Number(outputCredits.toFixed(4)),
      cacheReadCredits: Number(cacheReadCredits.toFixed(4)),
      cacheWriteCredits: Number(cacheWriteCredits.toFixed(4)),
      totalCredits: Number(totalCredits.toFixed(4)),
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
    };
  },

  /**
   * 估算请求消耗的积分（用于预扣）
   */
  async estimateCredits(
    model: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): Promise<number> {
    const calculation = await this.calculateCredits(
      model,
      estimatedInputTokens,
      estimatedOutputTokens
    );
    // 预扣时增加 20% 的缓冲
    return Number((calculation.totalCredits * 1.2).toFixed(4));
  },

  /**
   * 加载默认消费限额配置（带缓存）
   */
  async loadSpendingLimitConfig(): Promise<{ defaultDailyCreditsLimit: number; defaultMonthlyCreditsLimit: number }> {
    const now = Date.now();
    if (now - spendingLimitConfigCache.lastUpdated < SPENDING_LIMIT_CACHE_TTL_MS) {
      return spendingLimitConfigCache;
    }

    const result = await pool.query(
      `SELECT key, value FROM system_configs WHERE key IN ('default_daily_limit_cents', 'default_monthly_limit_cents')`
    );

    let defaultDaily = 0;
    let defaultMonthly = 0;
    for (const row of result.rows as Array<{ key: string; value: string }>) {
      const parsed = parseFloat(row.value);
      if (row.key === 'default_daily_limit_cents' && !isNaN(parsed)) {
        defaultDaily = parsed;
      } else if (row.key === 'default_monthly_limit_cents' && !isNaN(parsed)) {
        defaultMonthly = parsed;
      }
    }

    spendingLimitConfigCache = {
      defaultDailyCreditsLimit: defaultDaily,
      defaultMonthlyCreditsLimit: defaultMonthly,
      lastUpdated: now,
    };

    return spendingLimitConfigCache;
  },

  /**
   * 清除消费限额配置缓存
   */
  clearSpendingLimitCache(): void {
    spendingLimitConfigCache = {
      defaultDailyCreditsLimit: 0,
      defaultMonthlyCreditsLimit: 0,
      lastUpdated: 0,
    };
  },

  /**
   * 检查用户消费限额
   * 在预扣积分之前调用，如果超出限额则抛出 SpendingLimitError
   */
  async checkSpendingLimits(userId: string, estimatedCredits: number): Promise<void> {
    // 1. 查询用户级别的限额
    const userLimitResult = await pool.query(
      `SELECT daily_credits_limit, monthly_credits_limit FROM user_balances WHERE user_id = $1`,
      [userId]
    );

    let dailyLimit = 0;
    let monthlyLimit = 0;

    if (userLimitResult.rows.length > 0) {
      const row = userLimitResult.rows[0] as { daily_credits_limit: string; monthly_credits_limit: string };
      dailyLimit = parseFloat(row.daily_credits_limit) || 0;
      monthlyLimit = parseFloat(row.monthly_credits_limit) || 0;
    }

    // 2. 如果用户级别限额为 0，读取系统默认限额
    if (dailyLimit === 0 || monthlyLimit === 0) {
      const defaults = await this.loadSpendingLimitConfig();
      if (dailyLimit === 0) {
        dailyLimit = defaults.defaultDailyCreditsLimit;
      }
      if (monthlyLimit === 0) {
        monthlyLimit = defaults.defaultMonthlyCreditsLimit;
      }
    }

    // 3. 如果两个限额都为 0，表示无限制，跳过检查
    if (dailyLimit === 0 && monthlyLimit === 0) {
      return;
    }

    // 4. 查询当日和当月已消费积分（并行查询优化性能）
    const queries: Promise<{ rows: Array<{ total: string }> }>[] = [];

    if (dailyLimit > 0) {
      queries.push(
        pool.query(
          `SELECT COALESCE(SUM(ABS(credits_amount)), 0) AS total
           FROM balance_transactions
           WHERE user_id = $1 AND type = 'usage' AND created_at >= CURRENT_DATE`,
          [userId]
        ) as Promise<{ rows: Array<{ total: string }> }>
      );
    } else {
      queries.push(Promise.resolve({ rows: [{ total: '0' }] }));
    }

    if (monthlyLimit > 0) {
      queries.push(
        pool.query(
          `SELECT COALESCE(SUM(ABS(credits_amount)), 0) AS total
           FROM balance_transactions
           WHERE user_id = $1 AND type = 'usage' AND created_at >= date_trunc('month', CURRENT_DATE)`,
          [userId]
        ) as Promise<{ rows: Array<{ total: string }> }>
      );
    } else {
      queries.push(Promise.resolve({ rows: [{ total: '0' }] }));
    }

    const [dailyResult, monthlyResult] = await Promise.all(queries);

    // 5. 检查每日限额
    if (dailyLimit > 0) {
      const dailySpent = parseFloat(dailyResult!.rows[0]?.total ?? '0');
      if (dailySpent + estimatedCredits > dailyLimit) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        throw new SpendingLimitError(
          'daily',
          dailySpent,
          dailyLimit,
          tomorrow.toISOString()
        );
      }
    }

    // 6. 检查每月限额
    if (monthlyLimit > 0) {
      const monthlySpent = parseFloat(monthlyResult!.rows[0]?.total ?? '0');
      if (monthlySpent + estimatedCredits > monthlyLimit) {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);
        throw new SpendingLimitError(
          'monthly',
          monthlySpent,
          monthlyLimit,
          nextMonth.toISOString()
        );
      }
    }
  },

  /**
   * 预扣积分（支持双余额：期卡额度 + 充值积分）
   * 使用 pg_advisory_xact_lock 串行化同一用户的扣费操作，零死锁风险
   * 日期重置+扣减合并为原子 CAS 操作，日期使用数据库时钟
   */
  async preChargeCredits(
    userId: string,
    estimatedCredits: number
  ): Promise<PreChargeResult> {
    const preChargeId = `pre_${generateSecureToken(16)}`;

    // 消费限额检查移到事务外：减少事务持有时间，降低锁竞争
    // 限额是软限制，短暂的 TOCTOU 窗口可接受
    await this.checkSpendingLimits(userId, estimatedCredits);

    return await db.transaction(async (tx) => {
      // Advisory Lock: 串行化同一用户的所有扣费操作，消除死锁风险
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`
      );

      let quotaUsed = 0;
      let creditsUsed = 0;
      const cardDeductions: CardDeduction[] = [];
      let dbToday: string | null = null;

      // Step 1: 读取所有 active 期卡，按 expires_at ASC 排序（先到期先用）
      // FOR UPDATE: 锁定期卡行，防止并发扣减导致额度溢出
      const cardsResult = await tx.execute(
        sql`SELECT id, daily_credits, daily_quota_remaining, quota_reset_date,
                   quota_mode, total_remaining,
                   TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS db_today
            FROM user_period_cards
            WHERE user_id = ${userId} AND status = 'active' AND expires_at > NOW()
            ORDER BY expires_at ASC
            FOR UPDATE`
      );

      let remaining = estimatedCredits;

      for (const row of cardsResult.rows as Array<{
        id: string;
        daily_credits: string;
        daily_quota_remaining: string;
        quota_reset_date: string | null;
        quota_mode: string | null;
        total_remaining: string | null;
        db_today: string;
      }>) {
        if (remaining <= 0) break;

        dbToday = row.db_today;
        const cardQuotaMode = row.quota_mode || 'daily';

        if (cardQuotaMode === 'total') {
          // 总量池模式：直接从 total_remaining 扣减
          const availableQuota = parseFloat(row.total_remaining || '0');
          const deduction = Math.min(availableQuota, remaining);

          if (deduction > 0) {
            // 原子条件更新：WHERE total_remaining >= deduction 防并发超扣
            const updateResult = await tx.execute(
              sql`UPDATE user_period_cards
                  SET total_remaining = total_remaining - ${deduction.toFixed(2)}::decimal,
                      updated_at = NOW()
                  WHERE id = ${row.id} AND total_remaining >= ${deduction.toFixed(2)}::decimal`
            );

            // 如果影响 0 行说明并发竞争，跳过此卡
            if ((updateResult as { rowCount?: number }).rowCount === 0) continue;

            cardDeductions.push({ cardId: row.id, quotaUsed: deduction, quotaMode: 'total' });
            quotaUsed += deduction;
            remaining = Number((remaining - deduction).toFixed(2));
          }
        } else {
          // 日额度模式（默认）：现有逻辑不变
          // 计算可用额度（跨天则重置）
          const availableQuota = row.quota_reset_date !== dbToday
            ? parseFloat(row.daily_credits)
            : parseFloat(row.daily_quota_remaining);

          const deduction = Math.min(availableQuota, remaining);

          // 原子 CAS：日期重置 + 扣减合并
          if (deduction > 0) {
            await tx.execute(
              sql`UPDATE user_period_cards
                  SET daily_quota_remaining = CASE
                        WHEN quota_reset_date != ${dbToday}
                          THEN daily_credits - ${deduction.toFixed(2)}::decimal
                        ELSE daily_quota_remaining - ${deduction.toFixed(2)}::decimal
                      END,
                      quota_reset_date = ${dbToday},
                      updated_at = NOW()
                  WHERE id = ${row.id}`
            );

            cardDeductions.push({ cardId: row.id, quotaUsed: deduction, quotaMode: 'daily' });
            quotaUsed += deduction;
            remaining = Number((remaining - deduction).toFixed(2));
          } else if (row.quota_reset_date !== dbToday) {
            // 额度用完但需要重置日期标记
            await tx.execute(
              sql`UPDATE user_period_cards
                  SET daily_quota_remaining = daily_credits,
                      quota_reset_date = ${dbToday},
                      updated_at = NOW()
                  WHERE id = ${row.id}`
            );
          }
        }
      }

      creditsUsed = Number(remaining.toFixed(2));

      // Step 2: 读取并扣减 credits（FOR UPDATE 锁定余额行，防止并发超扣）
      const balanceResult = await tx.execute(
        sql`SELECT credits FROM user_balances WHERE user_id = ${userId} FOR UPDATE`
      );

      if (balanceResult.rows.length === 0) {
        throw new NotFoundError('用户余额记录');
      }

      const creditsBefore = parseFloat((balanceResult.rows[0] as { credits: string }).credits);

      if (creditsUsed > 0) {
        if (creditsBefore < creditsUsed) {
          throw new QuotaExceededError(
            `积分不足，当前积分: ${creditsBefore.toFixed(2)}，需要: ${creditsUsed.toFixed(2)}（期卡已抵扣 ${quotaUsed.toFixed(2)}），请先充值`
          );
        }

        await tx.execute(
          sql`UPDATE user_balances
              SET credits = credits - ${creditsUsed.toFixed(2)}::decimal,
                  updated_at = NOW()
              WHERE user_id = ${userId}`
        );
      }

      const creditsAfter = Number((creditsBefore - creditsUsed).toFixed(2));

      // 记录预扣交易（只记录 credits 部分到 balance_transactions）
      await tx.insert(balanceTransactions).values({
        userId,
        type: 'precharge',
        amount: '0',
        balanceBefore: '0',
        balanceAfter: '0',
        creditsAmount: (-creditsUsed).toFixed(2),
        creditsBefore: creditsBefore.toFixed(2),
        creditsAfter: creditsAfter.toFixed(2),
        description: quotaUsed > 0
          ? `预扣积分 (期卡抵扣: ${quotaUsed.toFixed(2)}, 积分扣减: ${creditsUsed.toFixed(2)})`
          : '预扣积分',
        referenceType: 'precharge',
        metadata: { preChargeId, status: 'pending', quotaUsed, creditsUsed, cardDeductions, periodCardId: cardDeductions.length > 0 ? cardDeductions[0]!.cardId : null },
      });

      // 期卡额度扣减记录到 period_card_usage_logs（每张卡一条记录）
      if (cardDeductions.length > 0 && dbToday) {
        for (const d of cardDeductions) {
          await tx.execute(
            sql`INSERT INTO period_card_usage_logs (user_period_card_id, user_id, pre_charge_id, usage_date, quota_used)
                VALUES (${d.cardId}, ${userId}, ${preChargeId}, ${dbToday}, ${d.quotaUsed.toFixed(2)}::decimal)`
          );
        }
      }

      return {
        preChargeId,
        estimatedCredits,
        creditsBefore,
        creditsAfter,
        quotaUsed,
        creditsUsed,
        cardDeductions,
        periodCardId: cardDeductions.length > 0 ? cardDeductions[0]!.cardId : null,
      };
    });
  },

  /**
   * 结算积分（支持双余额）
   * 请求完成后，根据实际使用量结算
   * 退还差额：优先退还到 credits（用户花钱买的），再退还到期卡额度
   * 使用 advisory lock 串行化同一用户操作
   * 注意：total_credits_consumed 记录的是实际结算的 credits 消耗（不含期卡额度部分），
   *       期卡额度消耗记录在 period_card_usage_logs 中
   */
  async settleCredits(
    userId: string,
    actualCredits: number,
    preChargeId: string
  ): Promise<SettlementResult> {
    const result = await db.transaction(async (tx) => {
      // Advisory Lock: 串行化同一用户的所有扣费操作
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`
      );

      // 查找预扣记录（FOR UPDATE 锁定行，防止并发结算同一预扣）
      const preChargeResult = await tx.execute(
        sql`SELECT id, credits_amount, metadata
            FROM balance_transactions
            WHERE user_id = ${userId}
              AND type = 'precharge'
              AND metadata->>'preChargeId' = ${preChargeId}
            LIMIT 1
            FOR UPDATE`
      );

      if (preChargeResult.rows.length === 0) {
        throw new NotFoundError('预扣记录');
      }

      const preChargeRow = preChargeResult.rows[0] as {
        id: string;
        credits_amount: string | null;
        metadata: {
          preChargeId: string;
          status: string;
          quotaUsed?: number;
          creditsUsed?: number;
          cardDeductions?: CardDeduction[];
          /** @deprecated 旧单卡字段，兼容已有预扣记录 */
          periodCardId?: string | null;
        } | null;
      };
      const preCharge = {
        id: preChargeRow.id,
        creditsAmount: preChargeRow.credits_amount ?? '0',
        metadata: preChargeRow.metadata,
      };
      const metadata = preCharge.metadata;

      if (metadata?.status !== 'pending') {
        throw new ConflictError('预扣记录已处理');
      }

      const quotaUsed = metadata?.quotaUsed ?? 0;
      const creditsUsed = metadata?.creditsUsed ?? 0;
      // 兼容旧单卡记录：如果没有 cardDeductions 但有 periodCardId，构造单元素数组
      const cardDeductions: CardDeduction[] = metadata?.cardDeductions
        ?? (metadata?.periodCardId && quotaUsed > 0
          ? [{ cardId: metadata.periodCardId, quotaUsed }]
          : []);
      const totalPreCharged = quotaUsed + creditsUsed;
      const totalRefund = Number((totalPreCharged - actualCredits).toFixed(2));

      let finalCredits: number;
      let creditsRefunded = 0;
      let quotaRefunded = 0;
      let shortfallQuotaDeducted = 0;
      let shortfallCreditsDeducted = 0;

      if (totalRefund > 0) {
        // 退还差额：优先退 credits（用户花钱买的），再退期卡额度
        creditsRefunded = Math.min(totalRefund, creditsUsed);
        quotaRefunded = Number((totalRefund - creditsRefunded).toFixed(2));

        // 退还期卡额度（逆序：后扣的先退）
        if (quotaRefunded > 0 && cardDeductions.length > 0) {
          let quotaToRefund = quotaRefunded;
          const today = new Date().toISOString().slice(0, 10);
          // 逆序遍历：后扣的卡先退
          for (let i = cardDeductions.length - 1; i >= 0 && quotaToRefund > 0; i--) {
            const d = cardDeductions[i]!;
            const refundForCard = Math.min(quotaToRefund, d.quotaUsed);
            if (refundForCard <= 0) continue;

            const deductionQuotaMode = d.quotaMode || 'daily';

            if (deductionQuotaMode === 'total') {
              // 总量池模式：直接退还 total_remaining，无跨天检查
              await tx.execute(
                sql`UPDATE user_period_cards
                    SET total_remaining = total_remaining + ${refundForCard.toFixed(2)}::decimal,
                        updated_at = NOW()
                    WHERE id = ${d.cardId} AND status = 'active'`
              );
            } else {
              // 日额度模式：跨天检查，如果卡的额度已被 lazy reset，跳过退还避免溢出
              const cardResult = await tx.execute(
                sql`SELECT quota_reset_date FROM user_period_cards
                    WHERE id = ${d.cardId} AND status = 'active'`
              );
              if (cardResult.rows.length > 0) {
                const resetDate = (cardResult.rows[0] as { quota_reset_date: string | null }).quota_reset_date;
                if (resetDate && resetDate > today) {
                  // 已跨天 reset，跳过此卡退还
                  quotaToRefund = Number((quotaToRefund - refundForCard).toFixed(2));
                  continue;
                }
              }

              await tx.execute(
                sql`UPDATE user_period_cards
                    SET daily_quota_remaining = daily_quota_remaining + ${refundForCard.toFixed(2)}::decimal,
                        updated_at = NOW()
                    WHERE id = ${d.cardId} AND status = 'active'`
              );
            }

            await tx.execute(
              sql`UPDATE period_card_usage_logs
                  SET quota_used = GREATEST(0, quota_used - ${refundForCard.toFixed(2)}::decimal)
                  WHERE user_period_card_id = ${d.cardId}
                    AND user_id = ${userId}
                    AND pre_charge_id = ${preChargeId}`
            );

            quotaToRefund = Number((quotaToRefund - refundForCard).toFixed(2));
          }
        }

        // 退还 credits + 累加消耗
        if (creditsRefunded > 0) {
          const updateResult = await tx.execute(
            sql`UPDATE user_balances
                SET credits = credits + ${creditsRefunded.toFixed(2)}::decimal,
                    total_credits_consumed = total_credits_consumed + ${actualCredits.toFixed(2)}::decimal,
                    updated_at = NOW()
                WHERE user_id = ${userId}
                RETURNING (credits - ${creditsRefunded.toFixed(2)}::decimal) AS credits_before,
                          credits AS credits_after`
          );

          if (updateResult.rows.length === 0) {
            throw new NotFoundError('用户余额记录');
          }

          const row = updateResult.rows[0] as { credits_before: string; credits_after: string };
          const creditsBefore = parseFloat(row.credits_before);
          finalCredits = parseFloat(row.credits_after);

          // 记录退款交易
          await tx.insert(balanceTransactions).values({
            userId,
            type: 'refund',
            amount: '0',
            balanceBefore: '0',
            balanceAfter: '0',
            creditsAmount: creditsRefunded.toFixed(2),
            creditsBefore: creditsBefore.toFixed(2),
            creditsAfter: finalCredits.toFixed(2),
            description: `结算退还 (预扣: ${totalPreCharged.toFixed(2)}, 实际: ${actualCredits.toFixed(2)}, 退credits: ${creditsRefunded.toFixed(2)}, 退额度: ${quotaRefunded.toFixed(2)})`,
            referenceType: 'settlement',
            metadata: { preChargeId, actualCredits, totalPreCharged, creditsRefunded, quotaRefunded },
          });
        } else {
          // 只退期卡额度，不退 credits，只累加消耗
          const updateResult = await tx.execute(
            sql`UPDATE user_balances
                SET total_credits_consumed = total_credits_consumed + ${actualCredits.toFixed(2)}::decimal,
                    updated_at = NOW()
                WHERE user_id = ${userId}
                RETURNING credits AS credits_after`
          );
          if (updateResult.rows.length === 0) {
            throw new NotFoundError('用户余额记录');
          }
          finalCredits = parseFloat((updateResult.rows[0] as { credits_after: string }).credits_after);
        }
      } else {
        // 实际费用等于或超过预扣
        const shortfall = Math.abs(totalRefund); // totalRefund <= 0，差额需补扣

        if (shortfall > 0) {
          // 补扣差额：优先从期卡扣除，期卡不足时才从余额扣除
          let quotaDeducted = 0;
          let creditsDeducted = 0;
          const additionalCardDeductions: CardDeduction[] = [];

          // 1. 尝试从期卡补扣
          const cardsResult = await tx.execute(
            sql`SELECT id, daily_credits, daily_quota_remaining, quota_reset_date,
                       quota_mode, total_remaining,
                       TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS db_today
                FROM user_period_cards
                WHERE user_id = ${userId} AND status = 'active' AND expires_at > NOW()
                ORDER BY expires_at ASC
                FOR UPDATE`
          );

          let remainingShortfall = shortfall;

          for (const row of cardsResult.rows) {
            if (remainingShortfall <= 0) break;

            const cardRow = row as {
              id: string;
              daily_credits: string;
              daily_quota_remaining: string;
              quota_reset_date: string | null;
              quota_mode: string | null;
              total_remaining: string | null;
              db_today: string;
            };

            const cardQuotaMode = cardRow.quota_mode || 'daily';

            if (cardQuotaMode === 'total') {
              // 总量池模式：从 total_remaining 补扣
              const availableQuota = parseFloat(cardRow.total_remaining || '0');
              const deduction = Math.min(availableQuota, remainingShortfall);

              if (deduction > 0) {
                // 原子条件更新：WHERE total_remaining >= deduction 防并发超扣
                const updateResult = await tx.execute(
                  sql`UPDATE user_period_cards
                      SET total_remaining = total_remaining - ${deduction.toFixed(2)}::decimal,
                          updated_at = NOW()
                      WHERE id = ${cardRow.id} AND total_remaining >= ${deduction.toFixed(2)}::decimal`
                );

                // 如果影响 0 行说明并发竞争，跳过此卡
                if ((updateResult as { rowCount?: number }).rowCount === 0) continue;

                // 记录期卡使用日志（补扣）
                await tx.execute(
                  sql`INSERT INTO period_card_usage_logs (user_id, user_period_card_id, usage_date, quota_used, pre_charge_id)
                      VALUES (${userId}, ${cardRow.id}, ${cardRow.db_today}, ${deduction.toFixed(2)}::decimal, ${preChargeId})
                      ON CONFLICT (user_period_card_id, pre_charge_id) WHERE pre_charge_id IS NOT NULL
                      DO UPDATE SET quota_used = period_card_usage_logs.quota_used + ${deduction.toFixed(2)}::decimal`
                );

                additionalCardDeductions.push({ cardId: cardRow.id, quotaUsed: deduction, quotaMode: 'total' });
                quotaDeducted += deduction;
                remainingShortfall = Number((remainingShortfall - deduction).toFixed(2));
              }
            } else {
              // 日额度模式（默认）：现有 CAS 逻辑不变
              // 计算可用额度（跨天则重置）
              const availableQuota = cardRow.quota_reset_date !== cardRow.db_today
                ? parseFloat(cardRow.daily_credits)
                : parseFloat(cardRow.daily_quota_remaining);

              const deduction = Math.min(availableQuota, remainingShortfall);

              if (deduction > 0) {
                // 原子 CAS：日期重置 + 扣减合并
                await tx.execute(
                  sql`UPDATE user_period_cards
                      SET daily_quota_remaining = CASE
                            WHEN quota_reset_date != ${cardRow.db_today}
                              THEN daily_credits - ${deduction.toFixed(2)}::decimal
                            ELSE daily_quota_remaining - ${deduction.toFixed(2)}::decimal
                          END,
                          quota_reset_date = ${cardRow.db_today},
                          updated_at = NOW()
                      WHERE id = ${cardRow.id}`
                );

                // 记录期卡使用日志（补扣）
                await tx.execute(
                  sql`INSERT INTO period_card_usage_logs (user_id, user_period_card_id, usage_date, quota_used, pre_charge_id)
                      VALUES (${userId}, ${cardRow.id}, ${cardRow.db_today}, ${deduction.toFixed(2)}::decimal, ${preChargeId})
                      ON CONFLICT (user_period_card_id, pre_charge_id) WHERE pre_charge_id IS NOT NULL
                      DO UPDATE SET quota_used = period_card_usage_logs.quota_used + ${deduction.toFixed(2)}::decimal`
                );

                additionalCardDeductions.push({ cardId: cardRow.id, quotaUsed: deduction, quotaMode: 'daily' });
                quotaDeducted += deduction;
                remainingShortfall = Number((remainingShortfall - deduction).toFixed(2));
              }
            }
          }

          // 将 shortfall 阶段的期卡扣减汇总到外层变量
          shortfallQuotaDeducted = quotaDeducted;

          // 2. 期卡不足，从余额补扣
          creditsDeducted = remainingShortfall;
          shortfallCreditsDeducted = creditsDeducted;

          if (creditsDeducted > 0) {
            const updateResult = await tx.execute(
              sql`UPDATE user_balances
                  SET credits = credits - ${creditsDeducted.toFixed(2)}::decimal,
                      total_credits_consumed = total_credits_consumed + ${actualCredits.toFixed(2)}::decimal,
                      updated_at = NOW()
                  WHERE user_id = ${userId}
                  RETURNING (credits + ${creditsDeducted.toFixed(2)}::decimal) AS credits_before,
                            credits AS credits_after`
            );

            if (updateResult.rows.length === 0) {
              throw new NotFoundError('用户余额记录');
            }

            const row = updateResult.rows[0] as { credits_before: string; credits_after: string };
            const creditsBefore = parseFloat(row.credits_before);
            finalCredits = parseFloat(row.credits_after);

            // 记录补扣交易
            await tx.insert(balanceTransactions).values({
              userId,
              type: 'usage',
              amount: '0',
              balanceBefore: '0',
              balanceAfter: '0',
              creditsAmount: (-creditsDeducted).toFixed(2),
              creditsBefore: creditsBefore.toFixed(2),
              creditsAfter: finalCredits.toFixed(2),
              description: `结算补扣 (预扣: ${totalPreCharged.toFixed(2)}, 实际: ${actualCredits.toFixed(2)}, 补扣期卡: ${quotaDeducted.toFixed(2)}, 补扣积分: ${creditsDeducted.toFixed(2)})`,
              referenceType: 'settlement',
              metadata: { preChargeId, actualCredits, totalPreCharged, shortfall, quotaDeducted, creditsDeducted, additionalCardDeductions },
            });
          } else {
            // 完全从期卡补扣，只累加消耗
            const updateResult = await tx.execute(
              sql`UPDATE user_balances
                  SET total_credits_consumed = total_credits_consumed + ${actualCredits.toFixed(2)}::decimal,
                      updated_at = NOW()
                  WHERE user_id = ${userId}
                  RETURNING credits AS credits_after`
            );
            if (updateResult.rows.length === 0) {
              throw new NotFoundError('用户余额记录');
            }
            finalCredits = parseFloat((updateResult.rows[0] as { credits_after: string }).credits_after);
          }
        } else {
          // 刚好相等，只累加消耗
          const updateResult = await tx.execute(
            sql`UPDATE user_balances
                SET total_credits_consumed = total_credits_consumed + ${actualCredits.toFixed(2)}::decimal,
                    updated_at = NOW()
                WHERE user_id = ${userId}
                RETURNING credits AS credits_after`
          );

          if (updateResult.rows.length === 0) {
            throw new NotFoundError('用户余额记录');
          }

          finalCredits = parseFloat((updateResult.rows[0] as { credits_after: string }).credits_after);
        }
      }

      // 更新预扣记录状态
      await tx
        .update(balanceTransactions)
        .set({
          metadata: {
            ...metadata,
            status: 'settled',
            actualCredits,
            refundCredits: creditsRefunded,
            refundQuota: quotaRefunded,
          },
        })
        .where(eq(balanceTransactions.id, preCharge.id));

      // 记录使用交易（只记录 credits 部分）
      const totalQuotaUsed = Math.max(0, Number((quotaUsed + shortfallQuotaDeducted - quotaRefunded).toFixed(2)));
      const balanceCreditsConsumed = Math.max(0, Number((creditsUsed - creditsRefunded + shortfallCreditsDeducted).toFixed(2)));
      const usageCreditsBefore = Number((finalCredits + balanceCreditsConsumed).toFixed(2));
      await tx.insert(balanceTransactions).values({
        userId,
        type: 'usage',
        amount: '0',
        balanceBefore: '0',
        balanceAfter: '0',
        creditsAmount: (-balanceCreditsConsumed).toFixed(2),
        creditsBefore: usageCreditsBefore.toFixed(2),
        creditsAfter: finalCredits.toFixed(2),
        description: totalQuotaUsed > 0
          ? `API 调用消耗 (期卡: ${totalQuotaUsed.toFixed(2)}, 积分: ${balanceCreditsConsumed.toFixed(2)})`
          : 'API 调用消耗积分',
        referenceType: 'usage',
        metadata: { preChargeId, balanceCreditsConsumed, totalQuotaUsed },
      });

      return {
        actualCredits,
        refundCredits: Math.max(0, creditsRefunded),
        creditsAfter: finalCredits,
        quotaUsed: totalQuotaUsed,
        balanceCreditsConsumed,
      };
    });

    // 异步检查低余额预警（不阻塞结算流程）
    this.checkLowBalanceAlert(userId, result.creditsAfter).catch((err) => {
      console.error('[Billing] 低余额预警检查失败:', err);
    });

    return result;
  },

  /**
   * 退还预扣积分（支持双余额）
   * 当请求失败或取消时，退还预扣的积分
   * 退还 creditsUsed 到 user_balances.credits
   * 退还 quotaUsed 到 user_period_cards.daily_quota_remaining
   * 使用 advisory lock 串行化同一用户操作
   */
  async refundPreCharge(userId: string, preChargeId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Advisory Lock: 串行化同一用户的所有扣费操作
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`
      );

      // 查找预扣记录（FOR UPDATE 锁定行，防止并发结算同一预扣）
      const preChargeResult = await tx.execute(
        sql`SELECT id, credits_amount, metadata
            FROM balance_transactions
            WHERE user_id = ${userId}
              AND type = 'precharge'
              AND metadata->>'preChargeId' = ${preChargeId}
            LIMIT 1
            FOR UPDATE`
      );

      if (preChargeResult.rows.length === 0) {
        throw new NotFoundError('预扣记录');
      }

      const preChargeRow = preChargeResult.rows[0] as {
        id: string;
        credits_amount: string | null;
        metadata: {
          preChargeId: string;
          status: string;
          quotaUsed?: number;
          creditsUsed?: number;
          cardDeductions?: CardDeduction[];
          /** @deprecated 旧单卡字段，兼容已有预扣记录 */
          periodCardId?: string | null;
        } | null;
      };
      const preCharge = {
        id: preChargeRow.id,
        creditsAmount: preChargeRow.credits_amount ?? '0',
        metadata: preChargeRow.metadata,
      };
      const metadata = preCharge.metadata;

      if (metadata?.status !== 'pending') {
        return;
      }

      const quotaUsed = metadata?.quotaUsed ?? 0;
      const creditsUsed = metadata?.creditsUsed ?? 0;
      // 兼容旧单卡记录
      const cardDeductions: CardDeduction[] = metadata?.cardDeductions
        ?? (metadata?.periodCardId && quotaUsed > 0
          ? [{ cardId: metadata.periodCardId, quotaUsed }]
          : []);

      // 退还期卡额度（逆序：后扣的先退）
      if (cardDeductions.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        for (let i = cardDeductions.length - 1; i >= 0; i--) {
          const d = cardDeductions[i]!;
          if (d.quotaUsed <= 0) continue;

          const deductionQuotaMode = d.quotaMode || 'daily';

          if (deductionQuotaMode === 'total') {
            // 总量池模式：直接退还 total_remaining，无跨天检查
            await tx.execute(
              sql`UPDATE user_period_cards
                  SET total_remaining = total_remaining + ${d.quotaUsed.toFixed(2)}::decimal,
                      updated_at = NOW()
                  WHERE id = ${d.cardId} AND status = 'active'`
            );
          } else {
            // 日额度模式：跨天检查，如果卡的额度已被 lazy reset，跳过退还避免溢出
            const cardResult = await tx.execute(
              sql`SELECT quota_reset_date FROM user_period_cards
                  WHERE id = ${d.cardId} AND status = 'active'`
            );
            if (cardResult.rows.length === 0) continue;
            const resetDate = (cardResult.rows[0] as { quota_reset_date: string | null }).quota_reset_date;
            if (resetDate && resetDate > today) continue; // 已跨天 reset，跳过

            await tx.execute(
              sql`UPDATE user_period_cards
                  SET daily_quota_remaining = daily_quota_remaining + ${d.quotaUsed.toFixed(2)}::decimal,
                      updated_at = NOW()
                  WHERE id = ${d.cardId} AND status = 'active'`
            );
          }

          await tx.execute(
            sql`DELETE FROM period_card_usage_logs
                WHERE user_period_card_id = ${d.cardId}
                  AND user_id = ${userId}
                  AND pre_charge_id = ${preChargeId}`
          );
        }
      }

      // 退还 credits
      let creditsBefore = 0;
      let creditsAfter = 0;

      if (creditsUsed > 0) {
        const updateResult = await tx.execute(
          sql`UPDATE user_balances
              SET credits = credits + ${creditsUsed.toFixed(2)}::decimal,
                  updated_at = NOW()
              WHERE user_id = ${userId}
              RETURNING (credits - ${creditsUsed.toFixed(2)}::decimal) AS credits_before,
                        credits AS credits_after`
        );

        if (updateResult.rows.length === 0) {
          throw new NotFoundError('用户余额记录');
        }

        const row = updateResult.rows[0] as { credits_before: string; credits_after: string };
        creditsBefore = parseFloat(row.credits_before);
        creditsAfter = parseFloat(row.credits_after);
      }

      // 更新预扣记录状态
      await tx
        .update(balanceTransactions)
        .set({
          metadata: { ...metadata, status: 'refunded' },
        })
        .where(eq(balanceTransactions.id, preCharge.id));

      // 记录退款交易（只记录 credits 部分）
      if (creditsUsed > 0) {
        await tx.insert(balanceTransactions).values({
          userId,
          type: 'refund',
          amount: '0',
          balanceBefore: '0',
          balanceAfter: '0',
          creditsAmount: creditsUsed.toFixed(2),
          creditsBefore: creditsBefore.toFixed(2),
          creditsAfter: creditsAfter.toFixed(2),
          description: quotaUsed > 0
            ? `预扣退还 (积分: ${creditsUsed.toFixed(2)}, 期卡额度: ${quotaUsed.toFixed(2)})`
            : '预扣退还 (请求取消或失败)',
          referenceType: 'precharge_refund',
          metadata: { preChargeId, creditsRefunded: creditsUsed, quotaRefunded: quotaUsed },
        });
      }
    });
  },

  /**
   * 记录使用量
   */
  async recordUsage(userId: string, usageData: UsageData): Promise<void> {
    await db.insert(usageLogs).values({
      userId,
      requestId: usageData.requestId,
      model: usageData.model,
      provider: usageData.provider,
      promptTokens: usageData.inputTokens,
      completionTokens: usageData.outputTokens,
      totalTokens: usageData.inputTokens + usageData.outputTokens,
      latencyMs: usageData.latencyMs,
      status: usageData.status,
      errorMessage: usageData.errorMessage,
      cost: usageData.creditsConsumed.toFixed(4),
      creditsConsumed: usageData.creditsConsumed.toFixed(4),
      quotaUsed: (usageData.quotaUsed ?? 0).toFixed(2),
      metadata: {
        ...usageData.metadata,
        balanceCreditsConsumed: (usageData.metadata as Record<string, unknown> | undefined)?.balanceCreditsConsumed,
        cacheReadTokens: usageData.cacheReadTokens ?? 0,
        cacheWriteTokens: usageData.cacheWriteTokens ?? 0,
      },
    });
  },

  /**
   * 获取用户使用记录
   */
  async getUsageRecords(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      startDate?: Date;
      endDate?: Date;
      model?: string;
    } = {}
  ): Promise<{
    records: UsageRecord[];
    total: number;
    summary: {
      totalRequests: number;
      totalTokens: number;
      totalCreditsConsumed: string;
    };
  }> {
    const { page = 1, limit = 20, startDate, endDate, model } = options;
    const offset = (page - 1) * limit;

    const conditions = [eq(usageLogs.userId, userId)];

    if (startDate) {
      conditions.push(sql`${usageLogs.createdAt} >= ${startDate}`);
    }

    if (endDate) {
      conditions.push(sql`${usageLogs.createdAt} <= ${endDate}`);
    }

    if (model) {
      conditions.push(eq(usageLogs.model, model));
    }

    const records = await db
      .select()
      .from(usageLogs)
      .where(and(...conditions))
      .orderBy(desc(usageLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const preChargeIds = Array.from(new Set(records
      .map((r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        return typeof meta.preChargeId === 'string' ? meta.preChargeId : null;
      })
      .filter((id): id is string => Boolean(id))));

    const balanceCreditsByPreCharge = new Map<string, string>();
    if (preChargeIds.length > 0) {
      const txResult = await pool.query<{
        pre_charge_id: string | null;
        credits_before: string | null;
        credits_after: string | null;
      }>(
        `SELECT metadata->>'preChargeId' AS pre_charge_id,
                credits_before,
                credits_after
         FROM balance_transactions
         WHERE user_id = $1
           AND type = 'usage'
           AND reference_type = 'usage'
           AND metadata->>'preChargeId' = ANY($2::text[])`,
        [userId, preChargeIds]
      );

      for (const row of txResult.rows) {
        if (!row.pre_charge_id) continue;
        const creditsBefore = parseFloat(row.credits_before ?? '0');
        const creditsAfter = parseFloat(row.credits_after ?? '0');
        const consumed = Math.max(0, Number(Math.abs(creditsBefore - creditsAfter).toFixed(2)));
        balanceCreditsByPreCharge.set(row.pre_charge_id, consumed.toFixed(2));
      }
    }

    // 聚合查询：同时获取总数和汇总统计，避免额外请求
    const aggregateResult = await db
      .select({
        count: sql<number>`count(*)`,
        totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}), 0)`,
        totalCreditsConsumed: sql<string>`coalesce(sum(${usageLogs.creditsConsumed}::decimal), 0)`,
      })
      .from(usageLogs)
      .where(and(...conditions));

    const total = Number(aggregateResult[0]?.count ?? 0);
    const summary = {
      totalRequests: total,
      totalTokens: Number(aggregateResult[0]?.totalTokens ?? 0),
      totalCreditsConsumed: String(aggregateResult[0]?.totalCreditsConsumed ?? '0'),
    };

    return {
      records: records.map((r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const preChargeId = typeof meta.preChargeId === 'string' ? meta.preChargeId : null;
        const balanceCreditsConsumedFromMeta = typeof meta.balanceCreditsConsumed === 'number'
          ? meta.balanceCreditsConsumed.toFixed(2)
          : typeof meta.balanceCreditsConsumed === 'string'
            ? meta.balanceCreditsConsumed
            : undefined;
        return {
          id: r.id,
          model: r.model,
          provider: r.provider,
          inputTokens: r.promptTokens,
          outputTokens: r.completionTokens,
          totalTokens: r.totalTokens,
          cacheReadTokens: (meta.cacheReadTokens as number) ?? 0,
          cacheWriteTokens: (meta.cacheWriteTokens as number) ?? 0,
          creditsConsumed: r.creditsConsumed ?? '0',
          quotaUsed: r.quotaUsed ?? '0',
          cost: r.cost ?? '0',
          balanceCreditsConsumed: balanceCreditsConsumedFromMeta
            ?? (preChargeId ? balanceCreditsByPreCharge.get(preChargeId) : undefined),
          status: r.status,
          latencyMs: r.latencyMs,
          createdAt: r.createdAt,
        };
      }),
      total,
      summary,
    };
  },

  /**
   * 获取用户交易记录
   */
  async getTransactionRecords(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      type?: string;
    } = {}
  ): Promise<{ records: TransactionRecord[]; total: number }> {
    const { page = 1, limit = 20, type } = options;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(balanceTransactions.userId, userId),
      sql`${balanceTransactions.type} != 'precharge'`,
    ];

    if (type) {
      conditions.push(eq(balanceTransactions.type, type));
    }

    const records = await db
      .select()
      .from(balanceTransactions)
      .where(and(...conditions))
      .orderBy(desc(balanceTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(balanceTransactions)
      .where(and(...conditions));

    const total = Number(countResult[0]?.count ?? 0);

    return {
      records: records.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        creditsAmount: r.creditsAmount ?? '0',
        creditsBefore: r.creditsBefore ?? '0',
        creditsAfter: r.creditsAfter ?? '0',
        description: r.description,
        createdAt: r.createdAt,
      })),
      total,
    };
  },

  /**
   * 获取用户充值记录（查询 payments 表）
   */
  async getRechargeRecords(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
    } = {}
  ): Promise<{ records: any[]; total: number }> {
    const { page = 1, limit = 20, status } = options;
    const offset = (page - 1) * limit;

    const conditions = [eq(payments.userId, userId)];

    if (status) {
      conditions.push(eq(payments.status, status as any));
    }

    const records = await db
      .select()
      .from(payments)
      .where(and(...conditions))
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(payments)
      .where(and(...conditions));

    const total = Number(countResult[0]?.count ?? 0);

    return {
      records: records.map((r) => ({
        id: r.id,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        paymentMethod: r.paymentMethod,
        description: r.description,
        createdAt: r.createdAt,
        paidAt: r.paidAt,
        metadata: r.metadata,
      })),
      total,
    };
  },

  /**
   * 积分充值
   * @param userId - 用户 ID
   * @param credits - 充值积分数
   * @param bonusCredits - 赠送积分数
   * @param paymentId - 支付记录 ID
   * @param description - 描述
   */
  async rechargeCredits(
    userId: string,
    credits: number,
    bonusCredits: number,
    paymentId: string,
    description: string
  ): Promise<void> {
    const totalCredits = credits + bonusCredits;

    await db.transaction(async (tx) => {
      // 幂等性检查：检查是否已存在相同 paymentId 的充值记录
      const existingRecharge = await tx
        .select()
        .from(balanceTransactions)
        .where(
          and(
            eq(balanceTransactions.userId, userId),
            eq(balanceTransactions.type, 'deposit'),
            sql`metadata->>'paymentId' = ${paymentId}`
          )
        )
        .limit(1);

      if (existingRecharge.length > 0) {
        console.log(`[Billing] 订单 ${paymentId} 已充值，跳过重复充值`);
        return;
      }

      // 原子 UPSERT：使用单条 INSERT ON CONFLICT DO UPDATE 消除并发竞态
      // credits 字段使用数据库原子加法，避免快照读覆盖写问题
      const upsertResult = await tx.execute(sql`
        INSERT INTO user_balances (user_id, balance, currency, total_deposited, total_spent,
          credits, total_credits_purchased, total_credits_consumed)
        VALUES (${userId}, '0', 'CNY', '0', '0',
          ${totalCredits.toFixed(2)}, ${totalCredits.toFixed(2)}, '0')
        ON CONFLICT (user_id) DO UPDATE SET
          credits               = ROUND(user_balances.credits::decimal + ${totalCredits.toFixed(2)}, 2),
          total_credits_purchased = user_balances.total_credits_purchased::decimal + ${totalCredits.toFixed(2)},
          updated_at            = NOW()
        RETURNING
          credits AS credits_after,
          -- RETURNING 中 credits 是 NEW 值（已加 totalCredits），减回得到 OLD 值
          ROUND(credits - ${totalCredits.toFixed(2)}, 2) AS credits_before
      `);

      const creditsAfter  = parseFloat(String(upsertResult.rows[0]?.credits_after  ?? totalCredits.toFixed(2)));
      const creditsBefore = parseFloat(String(upsertResult.rows[0]?.credits_before ?? '0'));

      // 记录充值交易
      await tx.insert(balanceTransactions).values({
        userId,
        type: 'deposit',
        amount: '0',
        balanceBefore: '0',
        balanceAfter: '0',
        creditsAmount: totalCredits.toFixed(2),
        creditsBefore: creditsBefore.toFixed(2),
        creditsAfter: creditsAfter.toFixed(2),
        description,
        referenceType: 'payment',
        metadata: { paymentId, credits, bonusCredits },
      });
    });

    // 异步发送购买确认邮件 (不阻塞充值流程)
    this.sendPurchaseEmail(userId, credits / 10, totalCredits, paymentId).catch((err) => {
      console.error('[Billing] 发送购买确认邮件失败:', err);
    });
  },

  /**
   * 异步发送购买确认邮件 (内部方法)
   */
  async sendPurchaseEmail(
    userId: string,
    amount: number,
    credits: number,
    paymentId: string
  ): Promise<void> {
    try {
      const userResult = await pool.query(
        `SELECT email, name FROM users WHERE id = $1`,
        [userId]
      );
      if (userResult.rows.length === 0) {
        return;
      }
      const user = userResult.rows[0] as { email: string; name: string | null };
      await emailService.sendPurchaseConfirmEmail(
        user.email,
        user.name ?? user.email.split('@')[0]!,
        amount.toFixed(2),
        credits.toFixed(2),
        paymentId
      );
    } catch (error) {
      console.error('[Billing] 发送购买确认邮件失败:', error);
    }
  },

  /**
   * 检查低余额并发送预警邮件（异步，不阻塞主流程）
   */
  async checkLowBalanceAlert(userId: string, currentCredits: number): Promise<void> {
    try {
      // 读取配置：是否开启通知 + 阈值（单位：分）
      const [notifyEnabled, thresholdCents] = await Promise.all([
        getSystemConfigBool('notify_on_low_balance', false),
        getSystemConfigNumber('low_balance_threshold_cents', 0),
      ]);

      if (!notifyEnabled || thresholdCents <= 0) {
        return;
      }

      const thresholdCredits = thresholdCents / 100;

      if (currentCredits >= thresholdCredits) {
        return;
      }

      // 查询用户信息
      const userResult = await pool.query(
        `SELECT email, name FROM users WHERE id = $1`,
        [userId]
      );
      if (userResult.rows.length === 0) {
        return;
      }

      const user = userResult.rows[0] as { email: string; name: string | null };
      await emailService.sendLowBalanceEmail(
        user.email,
        user.name ?? user.email.split('@')[0]!,
        currentCredits.toFixed(2),
        userId
      );
    } catch (error) {
      console.error('[Billing] 低余额预警检查失败:', error);
    }
  },

  /**
   * 管理员调整积分
   */
  async adjustCredits(
    userId: string,
    amount: number,
    description: string,
    operatorId: string
  ): Promise<{ creditsBefore: number; creditsAfter: number }> {
    return await db.transaction(async (tx) => {
      const balanceResult = await tx
        .select()
        .from(userBalances)
        .where(eq(userBalances.userId, userId))
        .limit(1);

      if (balanceResult.length === 0) {
        throw new NotFoundError('用户余额记录');
      }

      const currentCredits = parseFloat(balanceResult[0]!.credits);
      const newCredits = Number((currentCredits + amount).toFixed(2));

      if (newCredits < 0) {
        throw new QuotaExceededError('调整后积分不能为负数');
      }

      await tx
        .update(userBalances)
        .set({
          credits: newCredits.toString(),
          updatedAt: new Date(),
        })
        .where(eq(userBalances.userId, userId));

      await tx.insert(balanceTransactions).values({
        userId,
        type: 'adjustment' as string,
        amount: '0',
        balanceBefore: '0',
        balanceAfter: '0',
        creditsAmount: amount.toFixed(2),
        creditsBefore: currentCredits.toFixed(2),
        creditsAfter: newCredits.toFixed(2),
        description,
        referenceType: 'admin_adjustment',
        metadata: { operatorId },
      });

      return {
        creditsBefore: currentCredits,
        creditsAfter: newCredits,
      };
    });
  },
};

export default billingService;
