import { Router, type Request, type Response } from 'express';
import { eq, and, desc, sql, type SQLWrapper } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { webhookEvents } from '../../db/schema.js';
import { webhookService } from '../../services/webhook.js';
import { stripeService } from '../../services/stripe.js';
import { xunhupayService } from '../../services/xunhupay.js';
import { successResponse } from '../../utils/response.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';
import { authenticateAdmin } from '../../middleware/admin-auth.js';

export const webhookManagementRouter = Router();

// 所有管理路由都需要管理员权限
webhookManagementRouter.use(authenticateAdmin);

/**
 * 获取 webhook 事件列表
 * GET /api/admin/webhooks/events
 */
webhookManagementRouter.get(
  '/events',
  async (req: Request, res: Response) => {
    const {
      provider,
      status,
      page = '1',
      limit = '20',
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // 构建查询条件
    const conditions: (SQLWrapper | undefined)[] = [];

    if (provider) {
      conditions.push(eq(webhookEvents.provider, provider as string));
    }

    if (status) {
      conditions.push(eq(webhookEvents.status, status as string));
    }

    if (startDate) {
      const start = new Date(startDate as string);
      conditions.push(sql`${webhookEvents.createdAt} >= ${start}`);
    }

    if (endDate) {
      const end = new Date(endDate as string);
      conditions.push(sql`${webhookEvents.createdAt} <= ${end}`);
    }

    // 查询事件
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const events = await db
      .select()
      .from(webhookEvents)
      .where(whereClause)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(limitNum)
      .offset(offset);

    // 查询总数
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(webhookEvents)
      .where(whereClause);

    const total = countResult[0]?.count ?? 0;

    res.json(
      successResponse({
        events,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      })
    );
  }
);

/**
 * 获取单个 webhook 事件详情
 * GET /api/admin/webhooks/events/:id
 */
webhookManagementRouter.get(
  '/events/:id',
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, id!))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Webhook 事件');
    }

    res.json(successResponse({ event: result[0] }));
  }
);

/**
 * 重试失败的 webhook 事件
 * POST /api/admin/webhooks/events/:id/retry
 */
webhookManagementRouter.post(
  '/events/:id/retry',
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 查询事件
    const result = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, id!))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Webhook 事件');
    }

    const event = result[0]!;

    // 检查状态
    if (event.status === 'completed') {
      throw new ValidationError('事件已成功处理，无需重试');
    }

    if (event.status === 'processing') {
      throw new ValidationError('事件正在处理中，请稍后再试');
    }

    if (event.retryCount >= event.maxRetries) {
      throw new ValidationError('事件已达到最大重试次数');
    }

    // 根据提供商执行重试
    let handler: (eventRecord: typeof event) => Promise<void>;

    if (event.provider === 'stripe') {
      handler = async (record) => {
        const stripeEvent = record.rawPayload as any;
        await stripeService.processStripeEvent(stripeEvent);
      };
    } else if (event.provider === 'xunhupay') {
      handler = async (record) => {
        const xunhupayParams = record.rawPayload as any;
        await xunhupayService.processXunhupayCallback(xunhupayParams);
      };
    } else {
      throw new ValidationError('不支持的支付提供商');
    }

    // 执行重试
    await webhookService.retryFailedEvent(id!, handler);

    res.json(successResponse({ message: '重试成功' }));
  }
);

/**
 * 批量重试失败的 webhook 事件
 * POST /api/admin/webhooks/events/retry-failed
 */
webhookManagementRouter.post(
  '/events/retry-failed',
  async (req: Request, res: Response) => {
    const { provider, limit = 10 } = req.body;

    const limitNum = Math.min(parseInt(limit, 10) || 10, 100);

    // 获取失败的事件
    const failedEvents = await webhookService.getFailedEvents(
      provider as 'stripe' | 'xunhupay' | undefined,
      limitNum
    );

    const results = {
      total: failedEvents.length,
      succeeded: 0,
      failed: 0,
      errors: [] as Array<{ eventId: string; error: string }>,
    };

    // 逐个重试
    for (const event of failedEvents) {
      try {
        let handler: (eventRecord: typeof event) => Promise<void>;

        if (event.provider === 'stripe') {
          handler = async (record) => {
            const stripeEvent = record.rawPayload as any;
            await stripeService.processStripeEvent(stripeEvent);
          };
        } else if (event.provider === 'xunhupay') {
          handler = async (record) => {
            const xunhupayParams = record.rawPayload as any;
            await xunhupayService.processXunhupayCallback(xunhupayParams);
          };
        } else {
          throw new Error('不支持的支付提供商');
        }

        await webhookService.retryFailedEvent(event.id, handler);
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          eventId: event.id,
          error: error instanceof Error ? error.message : '未知错误',
        });
      }
    }

    res.json(successResponse({ results }));
  }
);

/**
 * 获取 webhook 统计信息
 * GET /api/admin/webhooks/stats
 */
webhookManagementRouter.get(
  '/stats',
  async (req: Request, res: Response) => {
    const {
      provider = 'stripe',
      startDate,
      endDate,
    } = req.query;

    // 默认统计最近 7 天
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate
      ? new Date(startDate as string)
      : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    const stats = await webhookService.getWebhookStats(
      provider as 'stripe' | 'xunhupay',
      start,
      end
    );

    res.json(successResponse({ stats }));
  }
);

/**
 * 删除旧的 webhook 事件记录
 * DELETE /api/admin/webhooks/events/cleanup
 */
webhookManagementRouter.delete(
  '/events/cleanup',
  async (req: Request, res: Response) => {
    const { days = 90, status = 'completed' } = req.body;

    if (!['completed', 'failed'].includes(status)) {
      throw new ValidationError('只能清理 completed 或 failed 状态的事件');
    }

    const daysNum = parseInt(days, 10);
    if (daysNum < 30) {
      throw new ValidationError('保留时间至少 30 天');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);

    const result = await db
      .delete(webhookEvents)
      .where(
        and(
          eq(webhookEvents.status, status),
          sql`${webhookEvents.createdAt} < ${cutoffDate}`
        )
      )
      .returning({ id: webhookEvents.id });

    res.json(
      successResponse({
        message: `已清理 ${result.length} 条记录`,
        deletedCount: result.length,
      })
    );
  }
);

/**
 * 手动触发 webhook 重放（用于测试）
 * POST /api/admin/webhooks/replay
 */
webhookManagementRouter.post(
  '/replay',
  async (req: Request, res: Response) => {
    const { eventId } = req.body;

    if (!eventId) {
      throw new ValidationError('缺少 eventId 参数');
    }

    // 查询原始事件
    const result = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, eventId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Webhook 事件');
    }

    const originalEvent = result[0]!;

    // 创建新的事件记录（模拟重放）
    const replayEventId = `replay_${originalEvent.eventId}_${Date.now()}`;

    const { record } = await webhookService.recordWebhookEvent({
      provider: originalEvent.provider as 'stripe' | 'xunhupay',
      eventId: replayEventId,
      eventType: originalEvent.eventType,
      rawPayload: originalEvent.rawPayload,
      signature: originalEvent.signature ?? undefined,
      signatureVerified: originalEvent.signatureVerified,
      userId: originalEvent.userId ?? undefined,
      paymentId: originalEvent.paymentId ?? undefined,
    });

    res.json(
      successResponse({
        message: '已创建重放事件',
        replayEventId: record.id,
      })
    );
  }
);
