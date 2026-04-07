/**
 * 期卡核心服务单元测试
 *
 * 覆盖验证点：
 * 1. getTodayDateCST() 时区工具函数
 * 2. activatePeriodCard() 激活期卡
 * 3. getActiveCard() 查询有效期卡
 * 4. upgradePeriodCard() 升级期卡
 * 5. calculateUpgradePrice() 差价计算
 * 6. processExpirations() 过期处理 + 到期提醒
 * 7. partial unique index 约束（同一用户只能有 1 张 active 卡）
 * 8. 降级拒绝（新卡价格 <= 旧卡剩余价值时差价为 0）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  periodCardService,
  getTodayDateCST,
  type UserPeriodCard,
} from '../services/period-card.js';

// Mock 依赖
vi.mock('../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../services/email.js', () => ({
  emailService: {
    sendTemplateEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

import { pool } from '../db/index.js';
import { emailService } from '../services/email.js';

// ==========================================
// 测试辅助
// ==========================================

function createMockTx() {
  return {
    query: vi.fn(),
  };
}

function createMockPlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan_monthly_001',
    name: '月卡套餐',
    period_days: 30,
    daily_credits: '1000.00',
    price_cents: 9900,
    ...overrides,
  };
}

function createMockCardRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  return {
    id: 'card_001',
    user_id: 'user_001',
    plan_id: 'plan_monthly_001',
    payment_id: 'pay_001',
    status: 'active',
    starts_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    daily_credits: '1000.00',
    daily_quota_remaining: '800.00',
    quota_reset_date: getTodayDateCST(),
    expiry_notified: false,
    upgraded_to_id: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

// ==========================================
// 测试用例
// ==========================================

describe('期卡核心服务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------
  // 1. 时区工具函数
  // ------------------------------------------
  describe('getTodayDateCST()', () => {
    it('应返回 YYYY-MM-DD 格式的日期字符串', () => {
      const result = getTodayDateCST();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('返回的日期应为 Asia/Shanghai 时区', () => {
      const result = getTodayDateCST();
      // 使用相同方式计算预期值
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const expected = `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`;
      expect(result).toBe(expected);
    });
  });

  // ------------------------------------------
  // 2. activatePeriodCard()
  // ------------------------------------------
  describe('activatePeriodCard()', () => {
    it('应成功激活期卡并返回正确结构', async () => {
      const tx = createMockTx();
      const planRow = createMockPlanRow();

      // mock: 查询套餐
      tx.query.mockResolvedValueOnce({ rows: [planRow] });
      // mock: 插入期卡记录
      tx.query.mockResolvedValueOnce({
        rows: [createMockCardRow({
          plan_id: planRow.id,
          daily_credits: planRow.daily_credits,
          daily_quota_remaining: planRow.daily_credits,
        })],
      });

      const result = await periodCardService.activatePeriodCard(
        tx, 'user_001', 'plan_monthly_001', 'pay_001'
      );

      expect(result.planId).toBe('plan_monthly_001');
      expect(result.status).toBe('active');
      expect(result.dailyCredits).toBe('1000.00');
      // 验证点 5: dailyQuotaRemaining 初始化 = dailyCredits
      expect(result.dailyQuotaRemaining).toBe('1000.00');
    });

    it('套餐不存在时应抛出错误', async () => {
      const tx = createMockTx();
      tx.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        periodCardService.activatePeriodCard(tx, 'user_001', 'plan_nonexist', 'pay_001')
      ).rejects.toThrow('期卡套餐不存在');
    });

    it('INSERT 时 daily_quota_remaining 应等于 daily_credits（验证点 5）', async () => {
      const tx = createMockTx();
      const planRow = createMockPlanRow({ daily_credits: '500.00' });

      tx.query.mockResolvedValueOnce({ rows: [planRow] });
      tx.query.mockResolvedValueOnce({
        rows: [createMockCardRow({
          daily_credits: '500.00',
          daily_quota_remaining: '500.00',
        })],
      });

      const result = await periodCardService.activatePeriodCard(
        tx, 'user_001', planRow.id, 'pay_001'
      );

      // 验证 INSERT SQL 中 $6 同时用于 daily_credits 和 daily_quota_remaining
      const insertCall = tx.query.mock.calls[1];
      const insertSql = insertCall[0] as string;
      expect(insertSql).toContain('$6, $6');

      expect(result.dailyCredits).toBe('500.00');
      expect(result.dailyQuotaRemaining).toBe('500.00');
    });

    it('应正确计算 expires_at = starts_at + period_days', async () => {
      const tx = createMockTx();
      const planRow = createMockPlanRow({ period_days: 7 });

      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      tx.query.mockResolvedValueOnce({ rows: [planRow] });
      tx.query.mockResolvedValueOnce({
        rows: [createMockCardRow({
          starts_at: now.toISOString(),
          expires_at: expectedExpiry.toISOString(),
        })],
      });

      const result = await periodCardService.activatePeriodCard(
        tx, 'user_001', planRow.id, 'pay_001'
      );

      // 验证 INSERT 参数中的 expires_at
      const insertCall = tx.query.mock.calls[1];
      const params = insertCall[1] as unknown[];
      const startsAt = params[3] as Date;
      const expiresAt = params[4] as Date;
      const diffDays = Math.round((expiresAt.getTime() - startsAt.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(7);
    });

    it('partial unique index: 同一用户插入第二张 active 卡应报错（验证点 2）', async () => {
      const tx = createMockTx();
      const planRow = createMockPlanRow();

      tx.query.mockResolvedValueOnce({ rows: [planRow] });
      // 模拟 unique index violation
      tx.query.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint "user_period_cards_one_active_per_user"'), {
          code: '23505',
          constraint: 'user_period_cards_one_active_per_user',
        })
      );

      await expect(
        periodCardService.activatePeriodCard(tx, 'user_001', planRow.id, 'pay_002')
      ).rejects.toThrow('duplicate key');
    });
  });

  // ------------------------------------------
  // 3. getActiveCard()
  // ------------------------------------------
  describe('getActiveCard()', () => {
    it('有 active 卡时应返回卡信息', async () => {
      const cardRow = createMockCardRow();
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [cardRow] } as never);

      const result = await periodCardService.getActiveCard('user_001');

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user_001');
      expect(result!.status).toBe('active');
    });

    it('无 active 卡时应返回 null', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);

      const result = await periodCardService.getActiveCard('user_001');
      expect(result).toBeNull();
    });

    it('SQL 应包含 status=active AND expires_at > NOW()', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);

      await periodCardService.getActiveCard('user_001');

      const queryCall = vi.mocked(pool.query).mock.calls[0];
      const querySql = queryCall[0] as string;
      expect(querySql).toContain("status = 'active'");
      expect(querySql).toContain('expires_at > NOW()');
    });
  });

  // ------------------------------------------
  // 4. upgradePeriodCard()
  // ------------------------------------------
  describe('upgradePeriodCard()', () => {
    it('应成功升级：旧卡标记 upgraded，新卡激活', async () => {
      const tx = createMockTx();
      const oldCardRow = createMockCardRow({ id: 'card_old' });
      const newPlanRow = createMockPlanRow({ id: 'plan_premium', daily_credits: '2000.00', price_cents: 19900 });
      const newCardRow = createMockCardRow({
        id: 'card_new',
        plan_id: 'plan_premium',
        daily_credits: '2000.00',
        daily_quota_remaining: '2000.00',
      });

      // 1. 锁定旧卡 (FOR UPDATE)
      tx.query.mockResolvedValueOnce({ rows: [oldCardRow] });
      // 2. 查询旧套餐价格（P3 降级拦截）
      tx.query.mockResolvedValueOnce({ rows: [{ price_cents: 9900 }] });
      // 3. 查询新套餐价格（P3 降级拦截）
      tx.query.mockResolvedValueOnce({ rows: [{ price_cents: 19900 }] });
      // 4. UPDATE 旧卡 status = 'upgraded'
      tx.query.mockResolvedValueOnce({ rows: [] });
      // 5. activatePeriodCard → 查询新套餐
      tx.query.mockResolvedValueOnce({ rows: [newPlanRow] });
      // 6. activatePeriodCard → INSERT 新卡
      tx.query.mockResolvedValueOnce({ rows: [newCardRow] });
      // 7. UPDATE 旧卡 upgraded_to_id
      tx.query.mockResolvedValueOnce({ rows: [] });

      const result = await periodCardService.upgradePeriodCard(
        tx, 'user_001', 'plan_premium', 'pay_upgrade', 'card_old'
      );

      expect(result.planId).toBe('plan_premium');
      expect(result.dailyCredits).toBe('2000.00');

      // 验证旧卡被标记为 upgraded（index 3: UPDATE status）
      const updateOldCall = tx.query.mock.calls[3];
      expect((updateOldCall[0] as string)).toContain("status = 'upgraded'");

      // 验证 upgraded_to_id 被回写（index 6: UPDATE upgraded_to_id）
      const updateRefCall = tx.query.mock.calls[6];
      expect((updateRefCall[1] as string[])[0]).toBe('card_new');
      expect((updateRefCall[1] as string[])[1]).toBe('card_old');
    });

    it('旧卡不存在时应抛出错误', async () => {
      const tx = createMockTx();
      tx.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        periodCardService.upgradePeriodCard(tx, 'user_001', 'plan_premium', 'pay_up', 'card_nonexist')
      ).rejects.toThrow('当前没有可升级的有效期卡');
    });

    it('旧卡 status 不是 active 时应抛出错误', async () => {
      const tx = createMockTx();
      // FOR UPDATE 查询 status='active' 不匹配，返回空
      tx.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        periodCardService.upgradePeriodCard(tx, 'user_001', 'plan_premium', 'pay_up', 'card_expired')
      ).rejects.toThrow('当前没有可升级的有效期卡');
    });

    it('降级时应抛出错误（P3 降级拦截）', async () => {
      const tx = createMockTx();
      const oldCardRow = createMockCardRow({ id: 'card_old', plan_id: 'plan_premium' });

      // 1. 锁定旧卡
      tx.query.mockResolvedValueOnce({ rows: [oldCardRow] });
      // 2. 查询旧套餐价格（贵）
      tx.query.mockResolvedValueOnce({ rows: [{ price_cents: 19900 }] });
      // 3. 查询新套餐价格（便宜）
      tx.query.mockResolvedValueOnce({ rows: [{ price_cents: 9900 }] });

      await expect(
        periodCardService.upgradePeriodCard(tx, 'user_001', 'plan_basic', 'pay_down', 'card_old')
      ).rejects.toThrow('不支持降级');
    });

    it('套餐信息查询失败时应抛出错误', async () => {
      const tx = createMockTx();
      const oldCardRow = createMockCardRow({ id: 'card_old' });

      // 1. 锁定旧卡
      tx.query.mockResolvedValueOnce({ rows: [oldCardRow] });
      // 2. 旧套餐查询返回空
      tx.query.mockResolvedValueOnce({ rows: [] });
      // 3. 新套餐查询
      tx.query.mockResolvedValueOnce({ rows: [{ price_cents: 19900 }] });

      await expect(
        periodCardService.upgradePeriodCard(tx, 'user_001', 'plan_premium', 'pay_up', 'card_old')
      ).rejects.toThrow('套餐信息查询失败');
    });

    it('同价套餐应允许升级（不算降级）', async () => {
      const tx = createMockTx();
      const oldCardRow = createMockCardRow({ id: 'card_old' });
      const newPlanRow = createMockPlanRow({ id: 'plan_same', daily_credits: '1000.00', price_cents: 9900 });
      const newCardRow = createMockCardRow({
        id: 'card_new',
        plan_id: 'plan_same',
        daily_credits: '1000.00',
        daily_quota_remaining: '1000.00',
      });

      // 1. 锁定旧卡
      tx.query.mockResolvedValueOnce({ rows: [oldCardRow] });
      // 2. 旧套餐价格
      tx.query.mockResolvedValueOnce({ rows: [{ price_cents: 9900 }] });
      // 3. 新套餐价格（同价）
      tx.query.mockResolvedValueOnce({ rows: [{ price_cents: 9900 }] });
      // 4. UPDATE 旧卡 status
      tx.query.mockResolvedValueOnce({ rows: [] });
      // 5. activatePeriodCard → 查询套餐
      tx.query.mockResolvedValueOnce({ rows: [newPlanRow] });
      // 6. activatePeriodCard → INSERT 新卡
      tx.query.mockResolvedValueOnce({ rows: [newCardRow] });
      // 7. UPDATE upgraded_to_id
      tx.query.mockResolvedValueOnce({ rows: [] });

      const result = await periodCardService.upgradePeriodCard(
        tx, 'user_001', 'plan_same', 'pay_same', 'card_old'
      );

      expect(result.planId).toBe('plan_same');
    });
  });

  // ------------------------------------------
  // 5. calculateUpgradePrice()
  // ------------------------------------------
  describe('calculateUpgradePrice()', () => {
    it('应正确计算升级差价', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 剩余 15 天

      // 旧卡 JOIN 查询
      vi.mocked(pool.query)
        .mockResolvedValueOnce({
          rows: [{
            id: 'card_old',
            expires_at: expiresAt,
            plan_price_cents: 9900,  // 99 元
            plan_period_days: 30,
          }],
        } as never)
        .mockResolvedValueOnce({ rows: [] } as never) // placeholder
        .mockResolvedValueOnce({
          rows: [{ price_cents: 19900 }], // 199 元
        } as never);

      // 但 Promise.all 只用 index 0 和 2
      // 重新 mock
      vi.mocked(pool.query).mockReset();
      vi.mocked(pool.query)
        .mockResolvedValueOnce({
          rows: [{
            id: 'card_old',
            expires_at: expiresAt,
            plan_price_cents: 9900,
            plan_period_days: 30,
          }],
        } as never)
        .mockResolvedValueOnce({
          rows: [{ price_cents: 19900 }],
        } as never);

      const result = await periodCardService.calculateUpgradePrice('card_old', 'plan_premium');

      // 旧卡剩余价值 = (9900 / 30) * 15 = 4950
      // 差价 = max(0, 19900 - 4950) = 14950
      expect(result.oldRemainingValue).toBe(4950);
      expect(result.newPriceCents).toBe(19900);
      expect(result.priceCents).toBe(14950);
    });

    it('降级时差价应为 0（验证点 12）', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000); // 剩余 29 天

      vi.mocked(pool.query)
        .mockResolvedValueOnce({
          rows: [{
            id: 'card_old',
            expires_at: expiresAt,
            plan_price_cents: 19900,  // 199 元
            plan_period_days: 30,
          }],
        } as never)
        .mockResolvedValueOnce({
          rows: [{ price_cents: 9900 }], // 99 元（更便宜）
        } as never);

      const result = await periodCardService.calculateUpgradePrice('card_old', 'plan_basic');

      // 旧卡剩余价值 = (19900 / 30) * 29 = 19237（向上取整天数）
      // 差价 = max(0, 9900 - 19237) = 0
      expect(result.priceCents).toBe(0);
      expect(result.oldRemainingValue).toBeGreaterThan(result.newPriceCents);
    });

    it('旧卡不存在时应抛出错误', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [] } as never)
        .mockResolvedValueOnce({ rows: [{ price_cents: 9900 }] } as never);

      await expect(
        periodCardService.calculateUpgradePrice('card_nonexist', 'plan_basic')
      ).rejects.toThrow('当前没有可升级的有效期卡');
    });

    it('目标套餐不存在时应抛出错误', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

      vi.mocked(pool.query)
        .mockResolvedValueOnce({
          rows: [{
            id: 'card_old',
            expires_at: expiresAt,
            plan_price_cents: 9900,
            plan_period_days: 30,
          }],
        } as never)
        .mockResolvedValueOnce({ rows: [] } as never);

      await expect(
        periodCardService.calculateUpgradePrice('card_old', 'plan_nonexist')
      ).rejects.toThrow('目标套餐不存在');
    });

    it('剩余天数应向上取整（对用户有利）', async () => {
      const now = new Date();
      // 剩余 14.5 天 → 向上取整为 15 天
      const expiresAt = new Date(now.getTime() + 14.5 * 24 * 60 * 60 * 1000);

      vi.mocked(pool.query)
        .mockResolvedValueOnce({
          rows: [{
            id: 'card_old',
            expires_at: expiresAt,
            plan_price_cents: 9900,
            plan_period_days: 30,
          }],
        } as never)
        .mockResolvedValueOnce({
          rows: [{ price_cents: 19900 }],
        } as never);

      const result = await periodCardService.calculateUpgradePrice('card_old', 'plan_premium');

      // Math.ceil(14.5) = 15
      // 旧卡剩余价值 = (9900 / 30) * 15 = 4950
      expect(result.oldRemainingValue).toBe(4950);
    });
  });

  // ------------------------------------------
  // 6. processExpirations()
  // ------------------------------------------
  describe('processExpirations()', () => {
    it('应将已过期的 active 卡标记为 expired（验证点 10）', async () => {
      // 第一次 query: 过期处理
      vi.mocked(pool.query)
        .mockResolvedValueOnce({
          rows: [{ id: 'card_expired_1' }, { id: 'card_expired_2' }],
        } as never)
        // 第二次 query: 到期提醒（无需提醒的）
        .mockResolvedValueOnce({ rows: [] } as never);

      const result = await periodCardService.processExpirations();

      expect(result.expired).toBe(2);
      expect(result.reminded).toBe(0);

      // 验证 UPDATE SQL
      const expireCall = vi.mocked(pool.query).mock.calls[0];
      const expireSql = expireCall[0] as string;
      expect(expireSql).toContain("SET status = 'expired'");
      expect(expireSql).toContain("WHERE status = 'active' AND expires_at <= NOW()");
      expect(expireSql).toContain('RETURNING id');
    });

    it('应发送到期提醒邮件（原子 UPDATE...RETURNING 去重）', async () => {
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 小时后到期

      // 过期处理
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [] } as never)
        // 到期提醒 RETURNING
        .mockResolvedValueOnce({
          rows: [{
            id: 'card_remind_1',
            user_id: 'user_remind_1',
            plan_id: 'plan_monthly_001',
            expires_at: expiresAt,
          }],
        } as never)
        // 查询用户信息
        .mockResolvedValueOnce({
          rows: [{ email: 'user@example.com', name: '测试用户' }],
        } as never)
        // 查询套餐信息
        .mockResolvedValueOnce({
          rows: [{ name: '月卡套餐' }],
        } as never);

      const result = await periodCardService.processExpirations();

      expect(result.expired).toBe(0);
      expect(result.reminded).toBe(1);

      // 验证邮件发送
      expect(emailService.sendTemplateEmail).toHaveBeenCalledWith(
        'period-card-expiry-reminder',
        'user@example.com',
        expect.objectContaining({
          username: '测试用户',
          planName: '月卡套餐',
          appName: 'Cherry Agent',
        }),
        'user_remind_1'
      );

      // 验证 UPDATE...RETURNING SQL 包含防重复条件
      const reminderCall = vi.mocked(pool.query).mock.calls[1];
      const reminderSql = reminderCall[0] as string;
      expect(reminderSql).toContain('expiry_notified = true');
      expect(reminderSql).toContain('expiry_notified = false');
      expect(reminderSql).toContain('RETURNING');
    });

    it('邮件发送失败不应中断整个过期处理', async () => {
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [] } as never)
        .mockResolvedValueOnce({
          rows: [
            { id: 'card_1', user_id: 'user_1', plan_id: 'plan_1', expires_at: expiresAt },
            { id: 'card_2', user_id: 'user_2', plan_id: 'plan_1', expires_at: expiresAt },
          ],
        } as never)
        // card_1 的用户查询失败
        .mockResolvedValueOnce({ rows: [] } as never)
        .mockResolvedValueOnce({ rows: [{ name: '套餐A' }] } as never)
        // card_2 的用户和套餐查询成功
        .mockResolvedValueOnce({ rows: [{ email: 'user2@test.com', name: '用户2' }] } as never)
        .mockResolvedValueOnce({ rows: [{ name: '套餐A' }] } as never);

      const result = await periodCardService.processExpirations();

      // card_1 跳过（用户不存在），card_2 成功
      expect(result.reminded).toBe(1);
    });

    it('用户名为 null 时应使用邮箱前缀作为 fallback', async () => {
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [] } as never)
        .mockResolvedValueOnce({
          rows: [{
            id: 'card_1', user_id: 'user_1', plan_id: 'plan_1', expires_at: expiresAt,
          }],
        } as never)
        .mockResolvedValueOnce({
          rows: [{ email: 'john@example.com', name: null }],
        } as never)
        .mockResolvedValueOnce({
          rows: [{ name: '月卡' }],
        } as never);

      await periodCardService.processExpirations();

      expect(emailService.sendTemplateEmail).toHaveBeenCalledWith(
        'period-card-expiry-reminder',
        'john@example.com',
        expect.objectContaining({ username: 'john' }),
        'user_1'
      );
    });
  });
});
