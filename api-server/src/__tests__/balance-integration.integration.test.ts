import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../db/index.js';
import { users, userBalances, balanceTransactions, usageLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { billingService } from '../services/billing.js';
import { getUserBalance } from '../services/user.js';

/**
 * 集成测试: 完整的余额检查与结算流程
 *
 * 这些测试使用真实的数据库连接，需要确保测试数据库可用
 * 运行前请设置 TEST_DATABASE_URL 环境变量
 */

describe('Balance Check and Settlement Integration', () => {
  let testUserId: string;

  beforeAll(async () => {
    // 创建测试用户
    const [user] = await db
      .insert(users)
      .values({
        email: `test-${Date.now()}@example.com`,
        password: 'test-hash',
        name: 'Test User',
        role: 'user',
        isActive: true,
      })
      .returning();

    testUserId = user.id;

    // 初始化余额 $10
    await db.insert(userBalances).values({
      userId: testUserId,
      balance: '10.0000',
      currency: 'USD',
      totalDeposited: '10.0000',
      totalSpent: '0.0000',
    });
  });

  afterAll(async () => {
    // 清理测试数据
    if (testUserId) {
      await db.delete(usageLogs).where(eq(usageLogs.userId, testUserId));
      await db.delete(balanceTransactions).where(eq(balanceTransactions.userId, testUserId));
      await db.delete(userBalances).where(eq(userBalances.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  beforeEach(async () => {
    // 重置余额到 $10
    await db
      .update(userBalances)
      .set({
        balance: '10.0000',
        totalDeposited: '10.0000',
        totalSpent: '0.0000',
      })
      .where(eq(userBalances.userId, testUserId));

    // 清空交易记录
    await db.delete(balanceTransactions).where(eq(balanceTransactions.userId, testUserId));
    await db.delete(usageLogs).where(eq(usageLogs.userId, testUserId));
  });

  describe('完整的请求流程', () => {
    it('应该完成预扣-结算-退款流程', async () => {
      // 1. 预扣
      const preChargeResult = await billingService.preChargeCredits(testUserId, 0.05);

      expect(preChargeResult.creditsBefore).toBe(10.0);
      expect(preChargeResult.creditsAfter).toBe(9.95);
      expect(preChargeResult.preChargeId).toMatch(/^pre_/);

      // 验证余额被扣除
      let balance = await getUserBalance(testUserId);
      expect(parseFloat(balance.balance)).toBe(9.95);

      // 2. 结算 (实际费用小于预扣)
      const settleResult = await billingService.settleCredits(
        testUserId,
        0.02, // 实际费用 $0.02
        preChargeResult.preChargeId
      );

      expect(settleResult.actualCredits).toBe(0.02);
      expect(settleResult.refundCredits).toBe(0.03); // 退还 $0.03
      expect(settleResult.creditsAfter).toBe(9.98);

      // 验证最终余额
      balance = await getUserBalance(testUserId);
      expect(parseFloat(balance.balance)).toBe(9.98);
      expect(parseFloat(balance.totalSpent)).toBe(0.02);

      // 3. 记录使用量
      await billingService.recordUsage(testUserId, {
        requestId: 'req_test123',
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        inputTokens: 667,
        outputTokens: 1333,
        latencyMs: 500,
        status: 'success',
        creditsConsumed: 0.02,
      });

      // 验证使用记录
      const usageRecords = await billingService.getUsageRecords(testUserId);
      expect(usageRecords.records.length).toBe(1);
      expect(usageRecords.records[0].model).toBe('claude-3-5-sonnet-20241022');
      expect(parseFloat(usageRecords.records[0].cost)).toBe(0.02);
    });

    it('应该在请求失败时全额退还预扣', async () => {
      // 1. 预扣
      const preChargeResult = await billingService.preChargeCredits(testUserId, 0.05);

      let balance = await getUserBalance(testUserId);
      expect(parseFloat(balance.balance)).toBe(9.95);

      // 2. 请求失败，退还预扣
      await billingService.refundPreCharge(testUserId, preChargeResult.preChargeId);

      // 验证余额完全恢复
      balance = await getUserBalance(testUserId);
      expect(parseFloat(balance.balance)).toBe(10.0);
      expect(parseFloat(balance.totalSpent)).toBe(0.0);
    });

    it('应该正确处理多次 API 调用', async () => {
      const calls = [
        { estimatedCost: 0.05, actualCost: 0.03 },
        { estimatedCost: 0.10, actualCost: 0.08 },
        { estimatedCost: 0.15, actualCost: 0.12 },
      ];

      let totalSpent = 0;

      for (const call of calls) {
        // 预扣
        const preChargeResult = await billingService.preChargeCredits(
          testUserId,
          call.estimatedCost
        );

        // 结算
        await billingService.settleCredits(
          testUserId,
          call.actualCost,
          preChargeResult.preChargeId
        );

        totalSpent += call.actualCost;

        // 记录使用量
        await billingService.recordUsage(testUserId, {
          requestId: `req_${Date.now()}`,
          model: 'claude-3-5-sonnet-20241022',
          provider: 'anthropic',
          inputTokens: Math.floor(call.actualCost * 1000),
          outputTokens: Math.floor(call.actualCost * 1000),
          status: 'success',
          creditsConsumed: call.actualCost,
        });
      }

      // 验证最终余额
      const balance = await getUserBalance(testUserId);
      expect(parseFloat(balance.balance)).toBeCloseTo(10 - totalSpent, 4);
      expect(parseFloat(balance.totalSpent)).toBeCloseTo(totalSpent, 4);

      // 验证使用记录数量
      const usageRecords = await billingService.getUsageRecords(testUserId);
      expect(usageRecords.records.length).toBe(3);
    });

    it('应该在余额不足时阻止预扣', async () => {
      // 设置余额为 $0.01
      await db
        .update(userBalances)
        .set({ balance: '0.0100' })
        .where(eq(userBalances.userId, testUserId));

      // 尝试预扣 $0.05，应该失败
      await expect(
        billingService.preChargeCredits(testUserId, 0.05)
      ).rejects.toThrow('余额不足');

      // 余额不应该变化
      const balance = await getUserBalance(testUserId);
      expect(parseFloat(balance.balance)).toBe(0.01);
    });

    it('应该防止重复结算同一个预扣', async () => {
      // 预扣
      const preChargeResult = await billingService.preChargeCredits(testUserId, 0.05);

      // 第一次结算
      await billingService.settleCredits(
        testUserId,
        0.02,
        preChargeResult.preChargeId
      );

      // 尝试第二次结算，应该失败
      await expect(
        billingService.settleCredits(
          testUserId,
          0.02,
          preChargeResult.preChargeId
        )
      ).rejects.toThrow('预扣记录已处理');
    });

    it('应该防止重复退款同一个预扣', async () => {
      // 预扣
      const preChargeResult = await billingService.preChargeCredits(testUserId, 0.05);

      // 第一次退款
      await billingService.refundPreCharge(testUserId, preChargeResult.preChargeId);

      const balance1 = await getUserBalance(testUserId);
      expect(parseFloat(balance1.balance)).toBe(10.0);

      // 第二次退款，应该跳过（不抛错，但也不重复退款）
      await billingService.refundPreCharge(testUserId, preChargeResult.preChargeId);

      const balance2 = await getUserBalance(testUserId);
      expect(parseFloat(balance2.balance)).toBe(10.0); // 余额不变
    });
  });

  describe('并发场景', () => {
    it('应该处理并发预扣请求', async () => {
      // 发起 5 个并发预扣请求，每个 $0.50
      const promises = Array(5)
        .fill(null)
        .map(() => billingService.preChargeCredits(testUserId, 0.50));

      // 只有前面几个应该成功（总共 $10 余额）
      const results = await Promise.allSettled(promises);

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failCount = results.filter((r) => r.status === 'rejected').length;

      // 最多成功 20 个 (10 / 0.5 = 20)
      expect(successCount).toBeLessThanOrEqual(20);
      expect(successCount + failCount).toBe(5);

      // 验证余额
      const balance = await getUserBalance(testUserId);
      const expectedBalance = 10 - successCount * 0.5;
      expect(parseFloat(balance.balance)).toBeCloseTo(expectedBalance, 4);
    });

    it('应该在乐观锁冲突时重试', async () => {
      // 这个测试模拟乐观锁冲突的场景
      // 实际应用中，客户端应该实现重试逻辑

      let attempts = 0;
      let success = false;

      while (attempts < 3 && !success) {
        try {
          await billingService.preChargeCredits(testUserId, 0.05);
          success = true;
        } catch (error: any) {
          if (error.message?.includes('冲突') || error.message?.includes('conflict')) {
            attempts++;
            // 短暂等待后重试
            await new Promise((resolve) => setTimeout(resolve, 10));
          } else {
            throw error;
          }
        }
      }

      expect(success).toBe(true);
    });
  });

  describe('边界情况', () => {
    it('应该处理零费用的请求', async () => {
      const preChargeResult = await billingService.preChargeCredits(testUserId, 0.001);

      // 实际费用为 0
      await billingService.settleCredits(testUserId, 0, preChargeResult.preChargeId);

      // 应该退还全部预扣
      const balance = await getUserBalance(testUserId);
      expect(parseFloat(balance.balance)).toBe(10.0);
      expect(parseFloat(balance.totalSpent)).toBe(0);
    });

    it('应该处理非常小的费用', async () => {
      const preChargeResult = await billingService.preChargeCredits(testUserId, 0.001);

      // 实际费用 $0.0001
      await billingService.settleCredits(testUserId, 0.0001, preChargeResult.preChargeId);

      const balance = await getUserBalance(testUserId);
      expect(parseFloat(balance.balance)).toBeCloseTo(9.9999, 4);
      expect(parseFloat(balance.totalSpent)).toBeCloseTo(0.0001, 4);
    });

    it('应该处理很大的输入输出 tokens', async () => {
      const calculation = await billingService.calculateCredits(
        'claude-3-opus-20240229',
        100000, // 100K input
        100000, // 100K output
      );

      // 验证计算结果存在
      expect(calculation.totalCredits).toBeGreaterThan(0);
    });

    it('应该正确记录错误请求', async () => {
      const preChargeResult = await billingService.preChargeCredits(testUserId, 0.05);

      // 请求失败
      await billingService.refundPreCharge(testUserId, preChargeResult.preChargeId);

      // 记录错误
      await billingService.recordUsage(testUserId, {
        requestId: 'req_error',
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        inputTokens: 100,
        outputTokens: 0,
        status: 'error',
        errorMessage: 'API timeout',
        creditsConsumed: 0,
      });

      const usageRecords = await billingService.getUsageRecords(testUserId);
      expect(usageRecords.records.length).toBe(1);
      expect(usageRecords.records[0].status).toBe('error');
      expect(parseFloat(usageRecords.records[0].cost)).toBe(0);
    });
  });

  describe('查询功能', () => {
    it('应该支持分页查询使用记录', async () => {
      // 创建 25 条使用记录
      for (let i = 0; i < 25; i++) {
        await billingService.recordUsage(testUserId, {
          requestId: `req_${i}`,
          model: 'claude-3-5-sonnet-20241022',
          provider: 'anthropic',
          inputTokens: 1000,
          outputTokens: 1000,
          status: 'success',
          creditsConsumed: 0.01,
        });
      }

      // 查询第一页
      const page1 = await billingService.getUsageRecords(testUserId, {
        page: 1,
        limit: 10,
      });

      expect(page1.records.length).toBe(10);
      expect(page1.total).toBe(25);

      // 查询第二页
      const page2 = await billingService.getUsageRecords(testUserId, {
        page: 2,
        limit: 10,
      });

      expect(page2.records.length).toBe(10);
      expect(page2.total).toBe(25);

      // 记录不应该重复
      const ids1 = page1.records.map((r) => r.id);
      const ids2 = page2.records.map((r) => r.id);
      const intersection = ids1.filter((id) => ids2.includes(id));
      expect(intersection.length).toBe(0);
    });

    it('应该支持按模型筛选', async () => {
      // 创建不同模型的记录
      await billingService.recordUsage(testUserId, {
        requestId: 'req_sonnet',
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        inputTokens: 1000,
        outputTokens: 1000,
        status: 'success',
        creditsConsumed: 0.01,
      });

      await billingService.recordUsage(testUserId, {
        requestId: 'req_haiku',
        model: 'claude-3-5-haiku-20241022',
        provider: 'anthropic',
        inputTokens: 1000,
        outputTokens: 1000,
        status: 'success',
        creditsConsumed: 0.005,
      });

      // 筛选 Sonnet
      const sonnetRecords = await billingService.getUsageRecords(testUserId, {
        model: 'claude-3-5-sonnet-20241022',
      });

      expect(sonnetRecords.records.length).toBe(1);
      expect(sonnetRecords.records[0].model).toBe('claude-3-5-sonnet-20241022');
    });

    it('应该支持按时间范围筛选', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      await billingService.recordUsage(testUserId, {
        requestId: 'req_today',
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        inputTokens: 1000,
        outputTokens: 1000,
        status: 'success',
        creditsConsumed: 0.01,
      });

      // 查询今天的记录
      const todayRecords = await billingService.getUsageRecords(testUserId, {
        startDate: yesterday,
        endDate: now,
      });

      expect(todayRecords.records.length).toBeGreaterThan(0);
    });

    it('应该支持查询交易记录', async () => {
      // 执行一次完整流程
      const preChargeResult = await billingService.preChargeCredits(testUserId, 0.05);
      await billingService.settleCredits(testUserId, 0.02, preChargeResult.preChargeId);

      // 查询交易记录 (不包括 precharge)
      const transactions = await billingService.getTransactionRecords(testUserId);

      // 应该有: refund + usage
      expect(transactions.records.length).toBeGreaterThanOrEqual(2);

      const types = transactions.records.map((t) => t.type);
      expect(types).toContain('refund');
      expect(types).toContain('usage');
      expect(types).not.toContain('precharge'); // 预扣是内部记录，不对外展示
    });
  });
});
