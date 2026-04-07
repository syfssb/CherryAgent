import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { webhookService } from '../services/webhook.js';
import { db } from '../db/index.js';
import { webhookEvents } from '../db/schema.js';
import { eq } from 'drizzle-orm';

describe('Webhook 幂等性测试', () => {
  // 清理测试数据
  afterEach(async () => {
    await db.delete(webhookEvents);
  });

  describe('recordWebhookEvent', () => {
    it('应该成功记录新的 webhook 事件', async () => {
      const params = {
        provider: 'stripe' as const,
        eventId: 'evt_test_123',
        eventType: 'checkout.session.completed',
        rawPayload: { test: 'data' },
        signature: 'test_signature',
        signatureVerified: true,
      };

      const result = await webhookService.recordWebhookEvent(params);

      expect(result.isNew).toBe(true);
      expect(result.record.provider).toBe('stripe');
      expect(result.record.eventId).toBe('evt_test_123');
      expect(result.record.status).toBe('pending');
      expect(result.record.signatureVerified).toBe(true);
    });

    it('应该检测到重复的 webhook 事件', async () => {
      const params = {
        provider: 'stripe' as const,
        eventId: 'evt_test_duplicate',
        eventType: 'checkout.session.completed',
        rawPayload: { test: 'data' },
      };

      // 第一次插入
      const first = await webhookService.recordWebhookEvent(params);
      expect(first.isNew).toBe(true);

      // 第二次插入（重复）
      const second = await webhookService.recordWebhookEvent(params);
      expect(second.isNew).toBe(false);
      expect(second.record.id).toBe(first.record.id);
    });
  });

  describe('processWebhook', () => {
    it('应该成功处理新的 webhook 事件', async () => {
      const params = {
        provider: 'stripe' as const,
        eventId: 'evt_test_process',
        eventType: 'checkout.session.completed',
        rawPayload: { test: 'data' },
      };

      let handlerCalled = false;
      const handler = async () => {
        handlerCalled = true;
      };

      const result = await webhookService.processWebhook(params, handler);

      expect(result.success).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.record.status).toBe('completed');
      expect(handlerCalled).toBe(true);
    });

    it('应该跳过已完成的重复事件', async () => {
      const params = {
        provider: 'stripe' as const,
        eventId: 'evt_test_duplicate_completed',
        eventType: 'checkout.session.completed',
        rawPayload: { test: 'data' },
      };

      let callCount = 0;
      const handler = async () => {
        callCount++;
      };

      // 第一次处理
      await webhookService.processWebhook(params, handler);
      expect(callCount).toBe(1);

      // 第二次处理（重复）
      const result = await webhookService.processWebhook(params, handler);
      expect(result.success).toBe(true);
      expect(result.isDuplicate).toBe(true);
      expect(result.record.status).toBe('completed');
      expect(callCount).toBe(1); // handler 不应该被再次调用
    });

    it('应该正确处理失败的事件', async () => {
      const params = {
        provider: 'stripe' as const,
        eventId: 'evt_test_failed',
        eventType: 'checkout.session.completed',
        rawPayload: { test: 'data' },
      };

      const handler = async () => {
        throw new Error('处理失败');
      };

      await expect(
        webhookService.processWebhook(params, handler)
      ).rejects.toThrow('处理失败');

      // 检查事件状态
      const events = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.eventId, params.eventId));

      expect(events.length).toBe(1);
      expect(events[0].status).toBe('failed');
      expect(events[0].retryCount).toBe(1);
      expect(events[0].errorMessage).toBe('处理失败');
    });

    it('应该防止并发处理同一事件', async () => {
      const params = {
        provider: 'stripe' as const,
        eventId: 'evt_test_concurrent',
        eventType: 'checkout.session.completed',
        rawPayload: { test: 'data' },
      };

      let concurrentCount = 0;
      const handler = async () => {
        concurrentCount++;
        // 模拟慢速处理
        await new Promise((resolve) => setTimeout(resolve, 100));
        concurrentCount--;
      };

      // 同时发起两个处理请求
      const [result1, result2] = await Promise.all([
        webhookService.processWebhook(params, handler),
        webhookService.processWebhook(params, handler),
      ]);

      // 确保只有一个成功获取锁并处理
      const successResults = [result1, result2].filter((r) => r.success && !r.isDuplicate);
      const duplicateResults = [result1, result2].filter((r) => r.isDuplicate || !r.success);

      expect(successResults.length).toBe(1);
      expect(duplicateResults.length).toBe(1);

      // 确保没有并发处理
      expect(concurrentCount).toBe(0);
    });
  });

  describe('markAsProcessing', () => {
    it('应该成功标记为处理中', async () => {
      const params = {
        provider: 'stripe' as const,
        eventId: 'evt_test_mark',
        eventType: 'checkout.session.completed',
        rawPayload: { test: 'data' },
      };

      const { record } = await webhookService.recordWebhookEvent(params);
      const success = await webhookService.markAsProcessing(record.id);

      expect(success).toBe(true);

      // 验证状态已更新
      const updated = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.id, record.id))
        .limit(1);

      expect(updated[0].status).toBe('processing');
    });

    it('应该拒绝标记非 pending 状态的事件', async () => {
      const params = {
        provider: 'stripe' as const,
        eventId: 'evt_test_mark_reject',
        eventType: 'checkout.session.completed',
        rawPayload: { test: 'data' },
      };

      const { record } = await webhookService.recordWebhookEvent(params);

      // 先标记为 processing
      await webhookService.markAsProcessing(record.id);

      // 尝试再次标记（应该失败）
      const secondMark = await webhookService.markAsProcessing(record.id);
      expect(secondMark).toBe(false);
    });
  });

  describe('retryFailedEvent', () => {
    it('应该成功重试失败的事件', async () => {
      const params = {
        provider: 'stripe' as const,
        eventId: 'evt_test_retry',
        eventType: 'checkout.session.completed',
        rawPayload: { test: 'data' },
      };

      let attemptCount = 0;
      const handler = async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('第一次失败');
        }
        // 第二次成功
      };

      // 第一次处理（失败）
      await expect(
        webhookService.processWebhook(params, handler)
      ).rejects.toThrow('第一次失败');

      const events = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.eventId, params.eventId));

      expect(events[0].status).toBe('failed');

      // 重试（成功）
      await webhookService.retryFailedEvent(events[0].id, handler);

      const retried = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.eventId, params.eventId));

      expect(retried[0].status).toBe('completed');
      expect(attemptCount).toBe(2);
    });

    it('应该拒绝重试超过最大次数的事件', async () => {
      // 创建一个已达到最大重试次数的事件
      const result = await db
        .insert(webhookEvents)
        .values({
          provider: 'stripe',
          eventId: 'evt_test_max_retries',
          eventType: 'test',
          rawPayload: {},
          status: 'failed',
          retryCount: 3,
          maxRetries: 3,
        })
        .returning();

      const handler = async () => {};

      await expect(
        webhookService.retryFailedEvent(result[0].id, handler)
      ).rejects.toThrow('最大重试次数');
    });
  });

  describe('getFailedEvents', () => {
    it('应该只返回可重试的失败事件', async () => {
      // 创建多个事件
      await db.insert(webhookEvents).values([
        {
          provider: 'stripe',
          eventId: 'evt_failed_1',
          eventType: 'test',
          rawPayload: {},
          status: 'failed',
          retryCount: 1,
          maxRetries: 3,
        },
        {
          provider: 'stripe',
          eventId: 'evt_failed_2',
          eventType: 'test',
          rawPayload: {},
          status: 'failed',
          retryCount: 3,
          maxRetries: 3, // 已达到最大重试次数
        },
        {
          provider: 'stripe',
          eventId: 'evt_completed',
          eventType: 'test',
          rawPayload: {},
          status: 'completed',
          retryCount: 0,
          maxRetries: 3,
        },
      ]);

      const failed = await webhookService.getFailedEvents('stripe', 100);

      // 只应该返回 evt_failed_1
      expect(failed.length).toBe(1);
      expect(failed[0].eventId).toBe('evt_failed_1');
    });
  });

  describe('getWebhookStats', () => {
    it('应该正确统计 webhook 事件', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // 创建测试数据
      await db.insert(webhookEvents).values([
        {
          provider: 'stripe',
          eventId: 'evt_stat_1',
          eventType: 'test',
          rawPayload: {},
          status: 'completed',
          createdAt: now,
        },
        {
          provider: 'stripe',
          eventId: 'evt_stat_2',
          eventType: 'test',
          rawPayload: {},
          status: 'completed',
          createdAt: now,
        },
        {
          provider: 'stripe',
          eventId: 'evt_stat_3',
          eventType: 'test',
          rawPayload: {},
          status: 'failed',
          createdAt: now,
        },
        {
          provider: 'stripe',
          eventId: 'evt_stat_4',
          eventType: 'test',
          rawPayload: {},
          status: 'pending',
          createdAt: now,
        },
      ]);

      const stats = await webhookService.getWebhookStats(
        'stripe',
        yesterday,
        new Date(now.getTime() + 1000)
      );

      expect(stats.total).toBe(4);
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.successRate).toBe(50); // 2/4 = 50%
    });
  });
});
