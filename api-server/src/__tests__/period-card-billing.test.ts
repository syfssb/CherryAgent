/**
 * 期卡扣费逻辑单元测试
 *
 * 覆盖验证点：
 * 6. 发起 AI 请求，验证先扣期卡额度，preCharge metadata 含 quotaUsed
 * 7. 额度用完后继续请求，验证从 credits 扣减
 * 8. 模拟次日（修改 quotaResetDate），验证额度自动重置
 * 9. 并发测试：验证 advisory lock SQL 存在
 * 14. 验证 finance 统计不受期卡影响（无新 type 污染 balance_transactions）
 *
 * 策略：mock db.transaction 捕获 tx 上的所有 execute/insert 调用，
 * 按调用顺序返回预设结果，验证 SQL 参数和最终返回值。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ==========================================
// Mock 设置
// ==========================================

// 用于捕获事务内的调用
let txExecuteCalls: Array<{ sql: unknown; result: unknown }> = [];
let txInsertValues: Array<Record<string, unknown>> = [];
let txExecuteResults: Array<{ rows: unknown[] }> = [];

const mockTxInsert = vi.fn().mockReturnValue({
  values: vi.fn((vals: Record<string, unknown>) => {
    txInsertValues.push(vals);
    return Promise.resolve(undefined);
  }),
});

const mockTxUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

const mockTxExecute = vi.fn(async (sqlObj: unknown) => {
  const idx = txExecuteCalls.length;
  const result = txExecuteResults[idx] ?? { rows: [] };
  txExecuteCalls.push({ sql: sqlObj, result });
  return result;
});

vi.mock('../db/index.js', () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: mockTxExecute,
        insert: mockTxInsert,
        update: mockTxUpdate,
      };
      return fn(tx);
    }),
  },
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock('../db/schema.js', () => ({
  userBalances: { userId: 'user_id' },
  balanceTransactions: { __table: 'balance_transactions' },
  usageLogs: { __table: 'usage_logs' },
}));

vi.mock('../services/email.js', () => ({
  emailService: {
    sendLowBalanceEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/config.js', () => ({
  getSystemConfigNumber: vi.fn().mockResolvedValue(1.0),
  getSystemConfigBool: vi.fn().mockResolvedValue(false),
}));

vi.mock('../utils/crypto.js', () => {
  let counter = 0;
  return {
    generateSecureToken: vi.fn(() => `mock_token_${++counter}`),
  };
});

import { pool } from '../db/index.js';
import { billingService } from '../services/billing.js';
import { QuotaExceededError, NotFoundError } from '../utils/errors.js';

// ==========================================
// 辅助函数
// ==========================================

/**
 * 设置 tx.execute 的返回值序列
 * 调用顺序：
 *   0: advisory lock (空)
 *   1: 查询期卡
 *   2+: 后续操作（扣减期卡、查询余额、扣减余额等）
 */
function setupTxResults(results: Array<{ rows: unknown[] }>) {
  txExecuteResults = results;
}

/** mock checkSpendingLimits 跳过限额检查 */
function skipSpendingLimits() {
  vi.mocked(pool.query)
    // loadSpendingLimitConfig
    .mockResolvedValueOnce({ rows: [] } as never)
    // checkSpendingLimits: user_balances
    .mockResolvedValueOnce({ rows: [{ daily_credits_limit: '0', monthly_credits_limit: '0' }] } as never);
}

// ==========================================
// 测试用例
// ==========================================

describe('期卡扣费逻辑', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txExecuteCalls = [];
    txInsertValues = [];
    txExecuteResults = [];
  });

  // ------------------------------------------
  // 验证点 6: 先扣期卡额度
  // ------------------------------------------
  describe('preChargeCredits - 期卡优先扣减（验证点 6）', () => {
    it('有 active 期卡且额度充足时，应全部从期卡扣减', async () => {
      skipSpendingLimits();
      setupTxResults([
        // 0: advisory lock
        { rows: [] },
        // 1: 查询期卡 → 有 active 卡，额度 800
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '800.00',
          quota_reset_date: '2025-06-15',
          db_today: '2025-06-15',
        }] },
        // 2: CAS 扣减期卡额度
        { rows: [] },
        // 3: 查询 user_balances
        { rows: [{ credits: '500.00' }] },
        // 4: INSERT period_card_usage_logs (tx.execute)
        { rows: [] },
      ]);

      const result = await billingService.preChargeCredits('user_001', 5.0);

      expect(result.quotaUsed).toBe(5.0);
      expect(result.creditsUsed).toBe(0);
      expect(result.periodCardId).toBe('card_001');
      expect(result.preChargeId).toMatch(/^pre_/);
      expect(result.estimatedCredits).toBe(5.0);
      expect(result.creditsBefore).toBe(500);
      expect(result.creditsAfter).toBe(500); // credits 没扣

      // 验证 balance_transactions 中 creditsAmount = 0（credits 没变动）
      expect(txInsertValues.length).toBeGreaterThanOrEqual(1);
      const btRecord = txInsertValues[0];
      expect(btRecord.type).toBe('precharge');
      expect(btRecord.creditsAmount).toBe('0.00');
      // metadata 应包含 quotaUsed 和 periodCardId
      expect((btRecord.metadata as Record<string, unknown>).quotaUsed).toBe(5.0);
      expect((btRecord.metadata as Record<string, unknown>).creditsUsed).toBe(0);
      expect((btRecord.metadata as Record<string, unknown>).periodCardId).toBe('card_001');
    });

    it('期卡额度不足时应混合扣减（验证点 7）', async () => {
      skipSpendingLimits();
      setupTxResults([
        // 0: advisory lock
        { rows: [] },
        // 1: 查询期卡 → 剩余额度 3.00
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '3.00',
          quota_reset_date: '2025-06-15',
          db_today: '2025-06-15',
        }] },
        // 2: CAS 扣减期卡额度
        { rows: [] },
        // 3: 查询 user_balances
        { rows: [{ credits: '500.00' }] },
        // 4: 扣减 credits
        { rows: [] },
        // 5: INSERT period_card_usage_logs
        { rows: [] },
      ]);

      const result = await billingService.preChargeCredits('user_001', 5.0);

      // 期卡扣 3.00，credits 扣 2.00
      expect(result.quotaUsed).toBe(3.0);
      expect(result.creditsUsed).toBe(2.0);
      expect(result.periodCardId).toBe('card_001');
      expect(result.creditsBefore).toBe(500);
      expect(result.creditsAfter).toBe(498);
    });

    it('无期卡时应全部从 credits 扣减', async () => {
      skipSpendingLimits();
      setupTxResults([
        // 0: advisory lock
        { rows: [] },
        // 1: 查询期卡 → 无
        { rows: [] },
        // 2: 查询 user_balances
        { rows: [{ credits: '500.00' }] },
        // 3: 扣减 credits
        { rows: [] },
      ]);

      const result = await billingService.preChargeCredits('user_001', 5.0);

      expect(result.quotaUsed).toBe(0);
      expect(result.creditsUsed).toBe(5.0);
      expect(result.periodCardId).toBeNull();
      expect(result.creditsBefore).toBe(500);
      expect(result.creditsAfter).toBe(495);
    });

    it('期卡额度恰好等于预扣金额时应全部从期卡扣', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] },
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '5.00',
          quota_reset_date: '2025-06-15',
          db_today: '2025-06-15',
        }] },
        { rows: [] }, // CAS
        { rows: [{ credits: '100.00' }] }, // balance
        { rows: [] }, // usage log
      ]);

      const result = await billingService.preChargeCredits('user_001', 5.0);

      expect(result.quotaUsed).toBe(5.0);
      expect(result.creditsUsed).toBe(0);
      expect(result.creditsAfter).toBe(100); // credits 不变
    });
  });

  // ------------------------------------------
  // 验证点 8: 额度自动重置
  // ------------------------------------------
  describe('preChargeCredits - 额度自动重置（验证点 8）', () => {
    it('quota_reset_date 不是今天时应重置额度后扣减', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] }, // advisory lock
        // 查询期卡：quota_reset_date 是昨天，额度已用完
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '0.00', // 昨天用完了
          quota_reset_date: '2025-06-14', // 昨天
          db_today: '2025-06-15',         // 今天
        }] },
        { rows: [] }, // CAS 重置+扣减
        { rows: [{ credits: '500.00' }] }, // balance
        { rows: [] }, // usage log
      ]);

      const result = await billingService.preChargeCredits('user_001', 5.0);

      // 重置后额度为 1000.00，扣 5.0 全部从期卡
      expect(result.quotaUsed).toBe(5.0);
      expect(result.creditsUsed).toBe(0);
    });

    it('quota_reset_date 为 null 时应视为新的一天并重置', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] },
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '0.00',
          quota_reset_date: null, // 从未设置
          db_today: '2025-06-15',
        }] },
        { rows: [] }, // CAS
        { rows: [{ credits: '500.00' }] },
        { rows: [] }, // usage log
      ]);

      const result = await billingService.preChargeCredits('user_001', 5.0);

      // null !== '2025-06-15'，触发重置
      expect(result.quotaUsed).toBe(5.0);
      expect(result.creditsUsed).toBe(0);
    });

    it('quota_reset_date 是今天时不应重置', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] },
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '200.00', // 今天已用了 800
          quota_reset_date: '2025-06-15',  // 今天
          db_today: '2025-06-15',
        }] },
        { rows: [] }, // CAS
        { rows: [{ credits: '500.00' }] },
        { rows: [] }, // usage log
      ]);

      const result = await billingService.preChargeCredits('user_001', 5.0);

      // 不重置，从剩余 200 中扣 5
      expect(result.quotaUsed).toBe(5.0);
      expect(result.creditsUsed).toBe(0);
    });
  });

  // ------------------------------------------
  // 验证点 9: 并发安全 - advisory lock
  // ------------------------------------------
  describe('并发安全 - advisory lock（验证点 9）', () => {
    it('事务第一条 SQL 应为 pg_advisory_xact_lock', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] }, // advisory lock
        { rows: [] }, // 无期卡
        { rows: [{ credits: '100.00' }] },
        { rows: [] },
      ]);

      await billingService.preChargeCredits('user_001', 1.0);

      // 第一次 execute 调用应包含 advisory lock
      expect(txExecuteCalls.length).toBeGreaterThanOrEqual(1);
      // drizzle sql`` 生成的对象包含 queryChunks 或 strings
      const firstCall = txExecuteCalls[0].sql;
      const sqlStr = JSON.stringify(firstCall);
      expect(sqlStr).toContain('pg_advisory_xact_lock');
    });
  });

  // ------------------------------------------
  // 余额不足场景
  // ------------------------------------------
  describe('preChargeCredits - 余额不足', () => {
    it('期卡额度不足 + credits 也不足时应抛出 QuotaExceededError', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] },
        // 期卡剩余 2.00
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '2.00',
          quota_reset_date: '2025-06-15',
          db_today: '2025-06-15',
        }] },
        { rows: [] }, // CAS
        // credits 只有 1.00，但需要 3.00
        { rows: [{ credits: '1.00' }] },
      ]);

      await expect(
        billingService.preChargeCredits('user_001', 5.0)
      ).rejects.toThrow(QuotaExceededError);
    });

    it('无期卡 + credits 不足时应抛出 QuotaExceededError', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] },
        { rows: [] }, // 无期卡
        { rows: [{ credits: '1.00' }] }, // 只有 1 积分
      ]);

      await expect(
        billingService.preChargeCredits('user_001', 5.0)
      ).rejects.toThrow(QuotaExceededError);
    });

    it('用户余额记录不存在时应抛出 NotFoundError', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] },
        { rows: [] }, // 无期卡
        { rows: [] }, // 无余额记录
      ]);

      await expect(
        billingService.preChargeCredits('user_001', 5.0)
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ------------------------------------------
  // 验证点 14: finance 统计隔离
  // ------------------------------------------
  describe('finance 统计隔离（验证点 14）', () => {
    it('期卡全额扣减时 balance_transactions.creditsAmount 应为 0', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] },
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '1000.00',
          quota_reset_date: '2025-06-15',
          db_today: '2025-06-15',
        }] },
        { rows: [] },
        { rows: [{ credits: '500.00' }] },
        { rows: [] },
      ]);

      const result = await billingService.preChargeCredits('user_001', 5.0);

      expect(result.quotaUsed).toBe(5.0);
      expect(result.creditsUsed).toBe(0);

      // balance_transactions 记录
      const btRecord = txInsertValues[0];
      expect(btRecord.type).toBe('precharge');
      expect(btRecord.creditsAmount).toBe('0.00');
    });

    it('balance_transactions.type 不应包含 period_card 相关类型', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] },
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '500.00',
          quota_reset_date: '2025-06-15',
          db_today: '2025-06-15',
        }] },
        { rows: [] },
        { rows: [{ credits: '500.00' }] },
        { rows: [] },
      ]);

      await billingService.preChargeCredits('user_001', 3.0);

      const btRecord = txInsertValues[0];
      expect(btRecord.type).toBe('precharge');
      expect(String(btRecord.type)).not.toContain('period_card');
    });

    it('期卡扣减应通过 tx.execute INSERT period_card_usage_logs', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] },
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '800.00',
          quota_reset_date: '2025-06-15',
          db_today: '2025-06-15',
        }] },
        { rows: [] }, // CAS
        { rows: [{ credits: '500.00' }] },
        { rows: [] }, // period_card_usage_logs INSERT
      ]);

      await billingService.preChargeCredits('user_001', 5.0);

      // 最后一次 tx.execute 应为 INSERT period_card_usage_logs
      const lastExecute = txExecuteCalls[txExecuteCalls.length - 1];
      const sqlStr = JSON.stringify(lastExecute.sql);
      expect(sqlStr).toContain('period_card_usage_logs');
      expect(sqlStr).toContain('pre_charge_id');
    });

    it('混合扣减时 creditsAmount 应只反映 credits 部分', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] },
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '3.00',
          quota_reset_date: '2025-06-15',
          db_today: '2025-06-15',
        }] },
        { rows: [] }, // CAS
        { rows: [{ credits: '500.00' }] },
        { rows: [] }, // 扣减 credits
        { rows: [] }, // usage log
      ]);

      const result = await billingService.preChargeCredits('user_001', 5.0);

      expect(result.quotaUsed).toBe(3.0);
      expect(result.creditsUsed).toBe(2.0);

      const btRecord = txInsertValues[0];
      // creditsAmount 应为 -2.00（只记录 credits 扣减部分）
      expect(btRecord.creditsAmount).toBe('-2.00');
    });
  });

  // ------------------------------------------
  // preChargeId 唯一性
  // ------------------------------------------
  describe('preChargeId 生成', () => {
    it('每次调用应生成不同的 preChargeId', async () => {
      skipSpendingLimits();
      setupTxResults([
        { rows: [] }, { rows: [] },
        { rows: [{ credits: '100.00' }] }, { rows: [] },
      ]);
      const r1 = await billingService.preChargeCredits('user_001', 1.0);

      vi.clearAllMocks();
      txExecuteCalls = [];
      txInsertValues = [];
      skipSpendingLimits();
      setupTxResults([
        { rows: [] }, { rows: [] },
        { rows: [{ credits: '100.00' }] }, { rows: [] },
      ]);
      const r2 = await billingService.preChargeCredits('user_001', 1.0);

      expect(r1.preChargeId).not.toBe(r2.preChargeId);
    });
  });

  // ------------------------------------------
  // P4: refundPreCharge 删除 usage log
  // ------------------------------------------
  describe('refundPreCharge - 期卡用量日志删除（P4）', () => {
    it('退还期卡额度时应删除对应的 period_card_usage_logs 记录', async () => {
      setupTxResults([
        // 0: advisory lock
        { rows: [] },
        // 1: 查询预扣记录
        { rows: [{
          id: 'bt_001',
          credits_amount: '-2.00',
          metadata: {
            preChargeId: 'pre_abc',
            status: 'pending',
            quotaUsed: 3.0,
            creditsUsed: 2.0,
            periodCardId: 'card_001',
          },
        }] },
        // 2: SELECT quota_reset_date（跨天检查）
        { rows: [{ quota_reset_date: '2025-06-15' }] },
        // 3: UPDATE user_period_cards（退还期卡额度）
        { rows: [] },
        // 4: DELETE period_card_usage_logs（P4 新增）
        { rows: [] },
        // 5: UPDATE user_balances（退还 credits）
        { rows: [{ credits_before: '498.00', credits_after: '500.00' }] },
      ]);

      await billingService.refundPreCharge('user_001', 'pre_abc');

      // 验证 DELETE SQL 包含 period_card_usage_logs
      const deleteCall = txExecuteCalls[4];
      const sqlStr = JSON.stringify(deleteCall.sql);
      expect(sqlStr).toContain('period_card_usage_logs');
      expect(sqlStr).toContain('DELETE');
      expect(sqlStr).toContain('pre_charge_id');
    });

    it('无期卡扣减时不应执行 DELETE usage log', async () => {
      setupTxResults([
        // 0: advisory lock
        { rows: [] },
        // 1: 查询预扣记录（无期卡扣减）
        { rows: [{
          id: 'bt_002',
          credits_amount: '-5.00',
          metadata: {
            preChargeId: 'pre_def',
            status: 'pending',
            quotaUsed: 0,
            creditsUsed: 5.0,
            periodCardId: null,
          },
        }] },
        // 2: UPDATE user_balances（退还 credits）
        { rows: [{ credits_before: '495.00', credits_after: '500.00' }] },
      ]);

      await billingService.refundPreCharge('user_001', 'pre_def');

      // 不应有 DELETE period_card_usage_logs 调用
      const allSqls = txExecuteCalls.map(c => JSON.stringify(c.sql));
      const hasDeleteUsageLog = allSqls.some(s => s.includes('DELETE') && s.includes('period_card_usage_logs'));
      expect(hasDeleteUsageLog).toBe(false);
    });
  });

  // ------------------------------------------
  // P4: settleCredits 修正 usage log
  // ------------------------------------------
  describe('settleCredits - 期卡用量日志修正（P4）', () => {
    it('退还期卡额度时应修正 period_card_usage_logs 的 quota_used', async () => {
      setupTxResults([
        // 0: advisory lock
        { rows: [] },
        // 1: 查询预扣记录
        { rows: [{
          id: 'bt_003',
          credits_amount: '-2.00',
          metadata: {
            preChargeId: 'pre_settle',
            status: 'pending',
            quotaUsed: 5.0,
            creditsUsed: 2.0,
            periodCardId: 'card_001',
          },
        }] },
        // 2: SELECT quota_reset_date（跨天检查）
        { rows: [{ quota_reset_date: '2025-06-15' }] },
        // 3: UPDATE user_period_cards（退还期卡额度）
        { rows: [] },
        // 4: UPDATE period_card_usage_logs（P4 新增：修正 quota_used）
        { rows: [] },
        // 5: UPDATE user_balances（退还 credits + 累加消耗）
        { rows: [{ credits_before: '498.00', credits_after: '500.00' }] },
      ]);

      // 实际消耗 3.0，预扣 7.0（quota 5 + credits 2），退还 4.0
      // 退还优先退 credits: min(4.0, 2.0) = 2.0
      // 退还期卡额度: 4.0 - 2.0 = 2.0
      const result = await billingService.settleCredits('user_001', 3.0, 'pre_settle');

      // 验证 UPDATE SQL 包含 period_card_usage_logs
      const updateLogCall = txExecuteCalls[4];
      const sqlStr = JSON.stringify(updateLogCall.sql);
      expect(sqlStr).toContain('period_card_usage_logs');
      expect(sqlStr).toContain('quota_used');
      expect(sqlStr).toContain('pre_charge_id');
    });

    it('无期卡退还时不应修正 usage log', async () => {
      setupTxResults([
        // 0: advisory lock
        { rows: [] },
        // 1: 查询预扣记录（全部从 credits 扣减）
        { rows: [{
          id: 'bt_004',
          credits_amount: '-5.00',
          metadata: {
            preChargeId: 'pre_no_card',
            status: 'pending',
            quotaUsed: 0,
            creditsUsed: 5.0,
            periodCardId: null,
          },
        }] },
        // 2: UPDATE user_balances（退还 credits + 累加消耗）
        { rows: [{ credits_before: '497.00', credits_after: '499.00' }] },
        // 3: UPDATE user_balances for total_credits_consumed
        { rows: [{ credits_after: '499.00' }] },
      ]);

      // 实际消耗 3.0，预扣 5.0，退还 2.0 全部退 credits
      await billingService.settleCredits('user_001', 3.0, 'pre_no_card');

      // 不应有 UPDATE period_card_usage_logs 调用
      const allSqls = txExecuteCalls.map(c => JSON.stringify(c.sql));
      const hasUpdateUsageLog = allSqls.some(s => s.includes('period_card_usage_logs') && s.includes('quota_used'));
      expect(hasUpdateUsageLog).toBe(false);
    });
  });

  // ------------------------------------------
  // P5: settleCredits ON CONFLICT 约束验证
  // ------------------------------------------
  describe('settleCredits - ON CONFLICT 约束列验证（P5）', () => {
    it('billing.ts 中 ON CONFLICT 应使用 (user_period_card_id, pre_charge_id) 而非 usage_date', () => {
      const { readFileSync } = require('fs');
      const { resolve } = require('path');
      const billingSource = readFileSync(
        resolve(__dirname, '../services/billing.ts'),
        'utf-8'
      );

      // 找到所有 ON CONFLICT 行涉及 period_card_usage_logs 的上下文
      const onConflictMatches = billingSource.match(/ON CONFLICT \([^)]+\)/g) || [];
      const usageLogConflicts = onConflictMatches.filter(
        (m: string) => m.includes('user_period_card_id') && m.includes('pre_charge_id')
      );

      // 应该至少有 2 处（total 模式和 daily 模式各一处）
      expect(usageLogConflicts.length).toBeGreaterThanOrEqual(2);

      // 不应包含 usage_date（旧的三列约束）
      for (const match of usageLogConflicts) {
        expect(match).not.toContain('usage_date');
      }
    });
  });

  // ------------------------------------------
  // P6: settleCredits - shortfall 期卡扣减计入 totalQuotaUsed
  // ------------------------------------------
  describe('settleCredits - shortfall 期卡扣减显示修复（P6）', () => {
    it('期卡覆盖后仅剩微小残差时，不应伪造 0.01 积分扣减', async () => {
      setupTxResults([
        // 0: advisory lock
        { rows: [] },
        // 1: 查询预扣记录（预扣阶段全部走期卡，且带 4 位小数）
        { rows: [{
          id: 'bt_012',
          credits_amount: '0.00',
          metadata: {
            preChargeId: 'pre_tiny_residual',
            status: 'pending',
            quotaUsed: 2.7514,
            creditsUsed: 0,
            cardDeductions: [{ cardId: 'card_003', quotaUsed: 2.7514, quotaMode: 'daily' }],
          },
        }] },
        // 2: SELECT quota_reset_date（退还多余期卡额度前检查）
        { rows: [{ quota_reset_date: '2025-06-15' }] },
        // 3: UPDATE user_period_cards（退还 2.69）
        { rows: [] },
        // 4: UPDATE period_card_usage_logs（修正 quota_used）
        { rows: [] },
        // 5: UPDATE user_balances（只累加消耗，不变更 credits）
        { rows: [{ credits_after: '500.00' }] },
      ]);

      const result = await billingService.settleCredits('user_001', 0.0652, 'pre_tiny_residual');

      expect(result.quotaUsed).toBe(0.06);
      expect(result.balanceCreditsConsumed).toBe(0);

      const usageRecord = txInsertValues.find(
        (v) => v.type === 'usage' && v.referenceType === 'usage'
      );
      expect(usageRecord).toBeDefined();
      expect(usageRecord!.creditsAmount).toBe('0.00');
      expect(usageRecord!.creditsBefore).toBe('500.00');
      expect(usageRecord!.creditsAfter).toBe('500.00');
      expect(usageRecord!.description).toContain('期卡: 0.06');
      expect(usageRecord!.description).toContain('积分: 0.00');
      expect((usageRecord!.metadata as Record<string, unknown>).balanceCreditsConsumed).toBe(0);
    });

    it('预扣已用期卡 + shortfall 又补扣期卡：quotaUsed 应包含两阶段总和', async () => {
      setupTxResults([
        // 0: advisory lock
        { rows: [] },
        // 1: 查询预扣记录（预扣阶段期卡扣了 3.0）
        { rows: [{
          id: 'bt_010',
          credits_amount: '0.00',
          metadata: {
            preChargeId: 'pre_shortfall_card',
            status: 'pending',
            quotaUsed: 3.0,
            creditsUsed: 0,
            cardDeductions: [{ cardId: 'card_001', quotaUsed: 3.0, quotaMode: 'daily' }],
          },
        }] },
        // shortfall 路径：实际 9.0，预扣只有 3.0，差额 6.0
        // 2: 查询 active 期卡（shortfall 补扣）
        { rows: [{
          id: 'card_001',
          daily_credits: '1000.00',
          daily_quota_remaining: '997.00',
          quota_reset_date: '2025-06-15',
          quota_mode: null,
          total_remaining: null,
          db_today: '2025-06-15',
        }] },
        // 3: UPDATE user_period_cards（CAS 补扣 6.0）
        { rows: [] },
        // 4: INSERT period_card_usage_logs（补扣日志）
        { rows: [] },
        // 5: UPDATE user_balances（只累加消耗，不扣 credits）
        { rows: [{ credits_after: '500.00' }] },
        // 6: UPDATE 预扣记录状态
        // (由 mockTxUpdate 处理)
      ]);

      const result = await billingService.settleCredits('user_001', 9.0, 'pre_shortfall_card');

      // quotaUsed 应为 preCharge(3.0) + shortfall(6.0) = 9.0
      expect(result.quotaUsed).toBe(9.0);

      // usage 交易描述应包含完整的期卡金额
      const usageRecord = txInsertValues.find(
        (v) => v.type === 'usage' && v.referenceType === 'usage'
      );
      expect(usageRecord).toBeDefined();
      expect(usageRecord!.description).toContain('期卡: 9.00');
      expect(usageRecord!.description).toContain('积分: 0.00');
    });

    it('预扣 quotaUsed=0 + shortfall 全部从期卡补扣：description 不应退化为纯积分文案', async () => {
      setupTxResults([
        // 0: advisory lock
        { rows: [] },
        // 1: 查询预扣记录（预扣阶段全部 credits，无期卡）
        { rows: [{
          id: 'bt_011',
          credits_amount: '-2.00',
          metadata: {
            preChargeId: 'pre_no_card_shortfall',
            status: 'pending',
            quotaUsed: 0,
            creditsUsed: 2.0,
            periodCardId: null,
          },
        }] },
        // shortfall 路径：实际 7.0，预扣只有 2.0，差额 5.0
        // 2: 查询 active 期卡（shortfall 补扣）
        { rows: [{
          id: 'card_002',
          daily_credits: '1000.00',
          daily_quota_remaining: '1000.00',
          quota_reset_date: '2025-06-15',
          quota_mode: null,
          total_remaining: null,
          db_today: '2025-06-15',
        }] },
        // 3: UPDATE user_period_cards（CAS 补扣 5.0）
        { rows: [] },
        // 4: INSERT period_card_usage_logs（补扣日志）
        { rows: [] },
        // 5: UPDATE user_balances（只累加消耗）
        { rows: [{ credits_after: '498.00' }] },
      ]);

      const result = await billingService.settleCredits('user_001', 7.0, 'pre_no_card_shortfall');

      // shortfall 期卡补扣了 5.0
      expect(result.quotaUsed).toBe(5.0);
      expect(result.quotaUsed).toBeGreaterThan(0);

      // description 不应是纯积分文案
      const usageRecord = txInsertValues.find(
        (v) => v.type === 'usage' && v.referenceType === 'usage'
      );
      expect(usageRecord).toBeDefined();
      expect(usageRecord!.description).not.toBe('API 调用消耗积分');
      expect(usageRecord!.description).toContain('期卡: 5.00');
    });
  });
});
