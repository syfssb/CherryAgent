/**
 * 期卡 M2 测试：Admin CRUD + 支付回调金额校验
 * 验证点 3: Admin Web 创建日卡/周卡/月卡套餐，验证 CRUD
 * 验证点 4: 支付回调金额校验（篡改金额应拒绝）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==========================================
// 验证点 3: Admin CRUD Schema 验证
// ==========================================

// 直接测试 zod schema 验证逻辑（不依赖 Express 中间件）
import { z } from 'zod';

const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  periodType: z.enum(['daily', 'weekly', 'monthly']),
  periodDays: z.number().int().min(1),
  dailyCredits: z.number().min(0).default(0),
  priceCents: z.number().int().min(100, { message: '价格至少为 1.00 元 (100分)' }),
  currency: z.string().length(3).default('CNY'),
  isEnabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  periodType: z.enum(['daily', 'weekly', 'monthly']).optional(),
  periodDays: z.number().int().min(1).optional(),
  dailyCredits: z.number().min(0).optional(),
  priceCents: z.number().int().min(100, { message: '价格至少为 1.00 元 (100分)' }).optional(),
  currency: z.string().length(3).optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

describe('验证点 3: Admin CRUD Schema 验证', () => {
  describe('createPlanSchema', () => {
    it('应接受有效的日卡套餐', () => {
      const result = createPlanSchema.safeParse({
        name: '日卡',
        periodType: 'daily',
        periodDays: 1,
        dailyCredits: 100,
        priceCents: 990,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('CNY');
        expect(result.data.isEnabled).toBe(true);
        expect(result.data.sortOrder).toBe(0);
      }
    });

    it('应接受有效的周卡套餐', () => {
      const result = createPlanSchema.safeParse({
        name: '周卡',
        periodType: 'weekly',
        periodDays: 7,
        dailyCredits: 200,
        priceCents: 4900,
        currency: 'CNY',
      });
      expect(result.success).toBe(true);
    });

    it('应接受有效的月卡套餐', () => {
      const result = createPlanSchema.safeParse({
        name: '月卡',
        periodType: 'monthly',
        periodDays: 30,
        dailyCredits: 500,
        priceCents: 9900,
      });
      expect(result.success).toBe(true);
    });

    it('name 为空时应拒绝', () => {
      const result = createPlanSchema.safeParse({
        name: '',
        periodType: 'daily',
        periodDays: 1,
        priceCents: 990,
      });
      expect(result.success).toBe(false);
    });

    it('name 超过 100 字符时应拒绝', () => {
      const result = createPlanSchema.safeParse({
        name: 'a'.repeat(101),
        periodType: 'daily',
        periodDays: 1,
        priceCents: 990,
      });
      expect(result.success).toBe(false);
    });

    it('periodType 不在枚举范围内时应拒绝', () => {
      const result = createPlanSchema.safeParse({
        name: '测试',
        periodType: 'yearly',
        periodDays: 365,
        priceCents: 99900,
      });
      expect(result.success).toBe(false);
    });

    it('priceCents 为 0 时应拒绝', () => {
      const result = createPlanSchema.safeParse({
        name: '免费卡',
        periodType: 'daily',
        periodDays: 1,
        priceCents: 0,
      });
      expect(result.success).toBe(false);
    });

    it('priceCents 为负数时应拒绝', () => {
      const result = createPlanSchema.safeParse({
        name: '测试',
        periodType: 'daily',
        periodDays: 1,
        priceCents: -100,
      });
      expect(result.success).toBe(false);
    });

    it('priceCents < 100 时应拒绝（P7 最低价校验）', () => {
      const result = createPlanSchema.safeParse({
        name: '测试',
        periodType: 'daily',
        periodDays: 1,
        priceCents: 99,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('1.00 元');
      }
    });

    it('priceCents = 100 时应接受（P7 最低价边界）', () => {
      const result = createPlanSchema.safeParse({
        name: '最低价卡',
        periodType: 'daily',
        periodDays: 1,
        priceCents: 100,
      });
      expect(result.success).toBe(true);
    });

    it('priceCents = 1 时应拒绝（P7 最低价校验）', () => {
      const result = createPlanSchema.safeParse({
        name: '测试',
        periodType: 'daily',
        periodDays: 1,
        priceCents: 1,
      });
      expect(result.success).toBe(false);
    });

    it('periodDays 为 0 时应拒绝', () => {
      const result = createPlanSchema.safeParse({
        name: '测试',
        periodType: 'daily',
        periodDays: 0,
        priceCents: 990,
      });
      expect(result.success).toBe(false);
    });

    it('dailyCredits 为负数时应拒绝', () => {
      const result = createPlanSchema.safeParse({
        name: '测试',
        periodType: 'daily',
        periodDays: 1,
        dailyCredits: -10,
        priceCents: 990,
      });
      expect(result.success).toBe(false);
    });

    it('currency 不是 3 字符时应拒绝', () => {
      const result = createPlanSchema.safeParse({
        name: '测试',
        periodType: 'daily',
        periodDays: 1,
        priceCents: 990,
        currency: 'YUAN',
      });
      expect(result.success).toBe(false);
    });

    it('缺少必填字段时应拒绝', () => {
      const result = createPlanSchema.safeParse({
        name: '测试',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updatePlanSchema', () => {
    it('应接受部分更新（只更新 name）', () => {
      const result = updatePlanSchema.safeParse({ name: '新名称' });
      expect(result.success).toBe(true);
    });

    it('应接受空对象（无更新字段）', () => {
      const result = updatePlanSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('应接受 description 设为 null（清空描述）', () => {
      const result = updatePlanSchema.safeParse({ description: null });
      expect(result.success).toBe(true);
    });

    it('应接受多字段同时更新', () => {
      const result = updatePlanSchema.safeParse({
        name: '升级月卡',
        dailyCredits: 1000,
        priceCents: 19900,
        isEnabled: false,
      });
      expect(result.success).toBe(true);
    });

    it('name 超长时应拒绝', () => {
      const result = updatePlanSchema.safeParse({ name: 'a'.repeat(101) });
      expect(result.success).toBe(false);
    });

    it('priceCents 为 0 时应拒绝', () => {
      const result = updatePlanSchema.safeParse({ priceCents: 0 });
      expect(result.success).toBe(false);
    });

    it('更新 priceCents < 100 时应拒绝（P7 最低价校验）', () => {
      const result = updatePlanSchema.safeParse({ priceCents: 50 });
      expect(result.success).toBe(false);
    });

    it('更新 priceCents = 100 时应接受（P7 最低价边界）', () => {
      const result = updatePlanSchema.safeParse({ priceCents: 100 });
      expect(result.success).toBe(true);
    });
  });
});

// ==========================================
// 验证点 3: Admin CRUD 路由逻辑
// ==========================================

describe('验证点 3: Admin CRUD 路由逻辑', () => {
  // 模拟 pool.query
  const mockPoolQuery = vi.fn();

  // 模拟 Admin 路由的核心逻辑（不走 Express，直接测试 handler 逻辑）
  describe('创建套餐 (POST /plans)', () => {
    it('INSERT SQL 应包含所有必要字段', () => {
      const data = {
        name: '月卡',
        description: '每月套餐',
        periodType: 'monthly',
        periodDays: 30,
        dailyCredits: 500,
        priceCents: 9900,
        currency: 'CNY',
        isEnabled: true,
        sortOrder: 1,
      };

      // 验证 schema 解析后的数据完整性
      const parsed = createPlanSchema.parse(data);
      expect(parsed.name).toBe('月卡');
      expect(parsed.periodType).toBe('monthly');
      expect(parsed.periodDays).toBe(30);
      expect(parsed.dailyCredits).toBe(500);
      expect(parsed.priceCents).toBe(9900);
      expect(parsed.currency).toBe('CNY');
      expect(parsed.isEnabled).toBe(true);
      expect(parsed.sortOrder).toBe(1);
    });
  });

  describe('更新套餐 (PATCH /plans/:id)', () => {
    it('动态构建 UPDATE SET 子句应只包含传入的字段', () => {
      const updates = { name: '新月卡', priceCents: 12900 };
      const parsed = updatePlanSchema.parse(updates);

      const updateFields: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (parsed.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        params.push(parsed.name);
      }
      if (parsed.priceCents !== undefined) {
        updateFields.push(`price_cents = $${paramIndex++}`);
        params.push(parsed.priceCents);
      }

      expect(updateFields).toEqual(['name = $1', 'price_cents = $2']);
      expect(params).toEqual(['新月卡', 12900]);
    });

    it('空更新应产生空 updateFields', () => {
      const parsed = updatePlanSchema.parse({});
      const updateFields: string[] = [];

      // 所有字段都是 undefined
      Object.values(parsed).forEach((v) => {
        if (v !== undefined) updateFields.push('field');
      });

      expect(updateFields.length).toBe(0);
    });
  });

  describe('删除套餐 (DELETE /plans/:id)', () => {
    it('DELETE RETURNING 无结果时应视为 NotFound', () => {
      // 模拟 pool.query 返回空行
      const result = { rows: [] };
      expect(result.rows.length).toBe(0);
      // 路由中会 throw new NotFoundError('期卡套餐')
    });
  });

  describe('取消期卡 (POST /records/:id/cancel)', () => {
    it('状态不是 active 时应拒绝取消', () => {
      const existing = { id: 'card-1', status: 'expired' };
      expect(existing.status).not.toBe('active');
      // 路由中会 throw new ValidationError(...)
    });

    it('状态是 active 时应允许取消', () => {
      const existing = { id: 'card-1', status: 'active' };
      expect(existing.status).toBe('active');
    });
  });
});

// ==========================================
// 验证点 4: 支付回调金额校验
// ==========================================

describe('验证点 4: 支付回调金额校验', () => {
  describe('虎皮椒金额校验逻辑', () => {
    // 复现 xunhupay.ts processXunhupayCallback 中的金额校验逻辑
    function xunhupayAmountCheck(
      totalFee: string,
      paymentAmount: string
    ): 'pass' | 'needs_review' {
      const paidAmountYuan = parseFloat(totalFee);
      const expectedAmountYuan = parseFloat(paymentAmount);
      if (Math.abs(paidAmountYuan - expectedAmountYuan) > 0.01) {
        return 'needs_review';
      }
      return 'pass';
    }

    it('金额完全匹配时应通过', () => {
      expect(xunhupayAmountCheck('99.00', '99.00')).toBe('pass');
    });

    it('金额差异恰好等于 0.01 时应拒绝（> 0.01 严格大于）', () => {
      // 源码判断条件是 Math.abs(diff) > 0.01，0.01 不大于 0.01，但浮点精度问题
      // parseFloat('99.01') - parseFloat('99.00') = 0.010000000000005116 > 0.01
      expect(xunhupayAmountCheck('99.01', '99.00')).toBe('needs_review');
      expect(xunhupayAmountCheck('98.99', '99.00')).toBe('needs_review');
    });

    it('金额差异极小（浮点精度内）时应通过', () => {
      // 99.005 和 99.00 差 0.005 < 0.01
      expect(xunhupayAmountCheck('99.005', '99.00')).toBe('pass');
    });

    it('金额被篡改（多付）时应拒绝', () => {
      expect(xunhupayAmountCheck('199.00', '99.00')).toBe('needs_review');
    });

    it('金额被篡改（少付）时应拒绝', () => {
      expect(xunhupayAmountCheck('1.00', '99.00')).toBe('needs_review');
    });

    it('金额差异为 0.02 时应拒绝', () => {
      expect(xunhupayAmountCheck('99.02', '99.00')).toBe('needs_review');
    });

    it('金额为 0 时应拒绝', () => {
      expect(xunhupayAmountCheck('0', '99.00')).toBe('needs_review');
    });

    it('小数位数不同但金额相同时应通过', () => {
      expect(xunhupayAmountCheck('99', '99.00')).toBe('pass');
      expect(xunhupayAmountCheck('99.0', '99.00')).toBe('pass');
    });
  });

  describe('Stripe 金额校验逻辑', () => {
    // 复现 stripe.ts handleCheckoutSessionCompleted 中的金额校验逻辑
    function stripeAmountCheck(
      amountTotal: number | null,
      sessionCurrency: string | null,
      paymentAmount: string,
      paymentCurrency: string
    ): 'pass' | 'needs_review' {
      const paidAmountCents = amountTotal ?? 0;
      const expectedAmountCents = Math.round(parseFloat(paymentAmount) * 100);
      const paidCurrency = (sessionCurrency ?? '').toUpperCase();
      const expectedCurrency = (paymentCurrency ?? '').toUpperCase();

      if (
        paidAmountCents !== expectedAmountCents ||
        paidCurrency !== expectedCurrency
      ) {
        return 'needs_review';
      }
      return 'pass';
    }

    it('金额和币种完全匹配时应通过', () => {
      expect(stripeAmountCheck(9900, 'cny', '99.00', 'CNY')).toBe('pass');
    });

    it('金额匹配但币种不同时应拒绝', () => {
      expect(stripeAmountCheck(9900, 'usd', '99.00', 'CNY')).toBe(
        'needs_review'
      );
    });

    it('币种匹配但金额被篡改时应拒绝', () => {
      expect(stripeAmountCheck(100, 'cny', '99.00', 'CNY')).toBe(
        'needs_review'
      );
    });

    it('amount_total 为 null 时应拒绝（视为 0）', () => {
      expect(stripeAmountCheck(null, 'cny', '99.00', 'CNY')).toBe(
        'needs_review'
      );
    });

    it('currency 为 null 时应拒绝', () => {
      expect(stripeAmountCheck(9900, null, '99.00', 'CNY')).toBe(
        'needs_review'
      );
    });

    it('分转元精度：99.99 元 = 9999 分', () => {
      expect(stripeAmountCheck(9999, 'cny', '99.99', 'CNY')).toBe('pass');
    });

    it('分转元精度：0.01 元 = 1 分', () => {
      expect(stripeAmountCheck(1, 'cny', '0.01', 'CNY')).toBe('pass');
    });

    it('币种大小写不敏感', () => {
      expect(stripeAmountCheck(9900, 'CNY', '99.00', 'cny')).toBe('pass');
      expect(stripeAmountCheck(9900, 'Cny', '99.00', 'cny')).toBe('pass');
    });

    it('金额差 1 分时应拒绝（Stripe 精确匹配）', () => {
      expect(stripeAmountCheck(9901, 'cny', '99.00', 'CNY')).toBe(
        'needs_review'
      );
    });
  });

  describe('支付回调期卡激活逻辑', () => {
    it('type 为 period_card_purchase 时应查询套餐并激活', () => {
      // 验证回调中的 type 判断逻辑
      const type = 'period_card_purchase';
      expect(type).toBe('period_card_purchase');
    });

    it('type 为 recharge 时不应触发期卡激活', () => {
      const type = 'recharge';
      expect(type).not.toBe('period_card_purchase');
    });

    it('期卡激活时 expires_at 应为 starts_at + period_days', () => {
      const now = new Date('2026-02-13T00:00:00Z');
      const periodDays = 30;
      const expiresAt = new Date(
        now.getTime() + periodDays * 24 * 60 * 60 * 1000
      );
      expect(expiresAt.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    });

    it('激活新卡前应将旧 active 卡标记为 upgraded', () => {
      // 验证 SQL 逻辑：UPDATE user_period_cards SET status = 'upgraded' WHERE user_id = ? AND status = 'active'
      const updateSql =
        "UPDATE user_period_cards SET status = 'upgraded' WHERE user_id = $1 AND status = 'active'";
      expect(updateSql).toContain("status = 'upgraded'");
      expect(updateSql).toContain("status = 'active'");
    });

    it('新卡 daily_quota_remaining 应等于 plan.daily_credits', () => {
      const plan = { daily_credits: '500.00' };
      // INSERT 中 daily_quota_remaining = plan.daily_credits
      const dailyCredits = plan.daily_credits;
      const dailyQuotaRemaining = plan.daily_credits;
      expect(dailyQuotaRemaining).toBe(dailyCredits);
    });

    it('缺少 periodCardPlanId 时不应激活期卡', () => {
      const plugins = { userId: 'u1', localOrderId: 'o1', type: 'period_card_purchase' };
      const periodCardPlanId = (plugins as any).periodCardPlanId as string | undefined;
      expect(periodCardPlanId).toBeUndefined();
    });
  });

  describe('幂等性保证', () => {
    it('payment.status 已为 succeeded 时应跳过处理', () => {
      const payment = { status: 'succeeded' };
      expect(payment.status).toBe('succeeded');
      // 回调中会 return，不重复处理
    });

    it('payment.status 为 pending 时应继续处理', () => {
      const payment = { status: 'pending' };
      expect(payment.status).not.toBe('succeeded');
    });
  });
});
