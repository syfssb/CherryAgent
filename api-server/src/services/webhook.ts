import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { webhookEvents, payments } from '../db/schema.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

/**
 * Webhook 处理状态
 */
export type WebhookStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Webhook 提供商
 */
export type WebhookProvider = 'stripe' | 'xunhupay';

/**
 * Webhook 事件记录
 */
export interface WebhookEventRecord {
  id: string;
  provider: WebhookProvider;
  eventId: string;
  eventType: string;
  status: WebhookStatus;
  retryCount: number;
  maxRetries: number;
  userId: string | null;
  paymentId: string | null;
  rawPayload: unknown;
  processedAt: Date | null;
  errorMessage: string | null;
  errorDetails: unknown;
  signature: string | null;
  signatureVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建 Webhook 事件参数
 */
export interface CreateWebhookEventParams {
  provider: WebhookProvider;
  eventId: string;
  eventType: string;
  rawPayload: unknown;
  signature?: string;
  signatureVerified?: boolean;
  userId?: string;
  paymentId?: string;
}

/**
 * Webhook 处理器函数类型
 */
export type WebhookHandler = (eventRecord: WebhookEventRecord) => Promise<void>;

/**
 * Webhook 服务
 * 提供幂等性保证、重试机制、状态管理
 */
export const webhookService = {
  /**
   * 记录 webhook 事件（幂等性核心）
   * 使用数据库唯一约束确保同一事件只记录一次
   *
   * @param params - Webhook 事件参数
   * @returns 事件记录 (如果是重复事件则返回已存在的记录)
   */
  async recordWebhookEvent(
    params: CreateWebhookEventParams
  ): Promise<{ record: WebhookEventRecord; isNew: boolean }> {
    try {
      // 尝试插入新记录
      const result = await db
        .insert(webhookEvents)
        .values({
          provider: params.provider,
          eventId: params.eventId,
          eventType: params.eventType,
          rawPayload: params.rawPayload,
          signature: params.signature,
          signatureVerified: params.signatureVerified ?? false,
          userId: params.userId,
          paymentId: params.paymentId,
          status: 'pending',
          retryCount: 0,
          maxRetries: 3,
        })
        .returning();

      if (result.length > 0) {
        return {
          record: this.mapToEventRecord(result[0]!),
          isNew: true,
        };
      }

      throw new Error('插入 webhook 事件失败');
    } catch (error) {
      // 检查是否是唯一约束冲突（说明事件已存在）
      if (
        error instanceof Error &&
        (error.message.includes('unique') ||
         error.message.includes('duplicate'))
      ) {
        // 查询已存在的记录
        const existingRecord = await db
          .select()
          .from(webhookEvents)
          .where(
            and(
              eq(webhookEvents.provider, params.provider),
              eq(webhookEvents.eventId, params.eventId)
            )
          )
          .limit(1);

        if (existingRecord.length > 0) {
          console.log(
            `[Webhook] 事件已存在: ${params.provider}:${params.eventId}, 状态: ${existingRecord[0]!.status}`
          );
          return {
            record: this.mapToEventRecord(existingRecord[0]!),
            isNew: false,
          };
        }
      }

      throw error;
    }
  },

  /**
   * 更新 webhook 事件状态
   *
   * @param eventId - 数据库中的事件 ID
   * @param status - 新状态
   * @param errorMessage - 错误消息（可选）
   * @param errorDetails - 错误详情（可选）
   */
  async updateWebhookStatus(
    eventId: string,
    status: WebhookStatus,
    errorMessage?: string,
    errorDetails?: unknown
  ): Promise<void> {
    const updates: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'completed') {
      updates.processedAt = new Date();
    }

    if (errorMessage) {
      updates.errorMessage = errorMessage;
    }

    if (errorDetails) {
      updates.errorDetails = errorDetails;
    }

    await db
      .update(webhookEvents)
      .set(updates)
      .where(eq(webhookEvents.id, eventId));
  },

  /**
   * 标记事件为处理中
   * 使用乐观锁防止并发处理
   *
   * @param eventId - 事件 ID
   * @returns 是否成功获取锁
   */
  async markAsProcessing(eventId: string): Promise<boolean> {
    const result = await db
      .update(webhookEvents)
      .set({
        status: 'processing',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(webhookEvents.id, eventId),
          eq(webhookEvents.status, 'pending') // 只有 pending 状态才能转为 processing
        )
      )
      .returning();

    return result.length > 0;
  },

  /**
   * 增加重试次数
   *
   * @param eventId - 事件 ID
   */
  async incrementRetryCount(eventId: string): Promise<void> {
    await db
      .update(webhookEvents)
      .set({
        retryCount: sql`${webhookEvents.retryCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(webhookEvents.id, eventId));
  },

  /**
   * 处理 webhook 事件（带幂等性保证）
   *
   * @param params - Webhook 事件参数
   * @param handler - 处理函数
   * @returns 是否成功处理
   */
  async processWebhook(
    params: CreateWebhookEventParams,
    handler: WebhookHandler
  ): Promise<{ success: boolean; isDuplicate: boolean; record: WebhookEventRecord }> {
    // 1. 记录事件（幂等性检查）
    const { record, isNew } = await this.recordWebhookEvent(params);

    // 2. 如果是重复事件
    if (!isNew) {
      // 如果已经完成，直接返回成功
      if (record.status === 'completed') {
        console.log(
          `[Webhook] 事件已处理完成，跳过: ${params.provider}:${params.eventId}`
        );
        return { success: true, isDuplicate: true, record };
      }

      // 如果正在处理中，返回冲突
      if (record.status === 'processing') {
        console.warn(
          `[Webhook] 事件正在处理中，跳过: ${params.provider}:${params.eventId}`
        );
        return { success: false, isDuplicate: true, record };
      }

      // 如果是失败状态，检查是否可以重试
      if (record.status === 'failed') {
        if (record.retryCount >= record.maxRetries) {
          console.error(
            `[Webhook] 事件已达到最大重试次数，跳过: ${params.provider}:${params.eventId}`
          );
          return { success: false, isDuplicate: true, record };
        }
        // 可以重试，继续处理
        console.log(
          `[Webhook] 事件重试 (${record.retryCount}/${record.maxRetries}): ${params.provider}:${params.eventId}`
        );
      }
    }

    // 3. 尝试获取处理锁
    const lockAcquired = await this.markAsProcessing(record.id);
    if (!lockAcquired) {
      console.warn(
        `[Webhook] 无法获取处理锁（可能正在被其他进程处理）: ${params.provider}:${params.eventId}`
      );
      return { success: false, isDuplicate: false, record };
    }

    // 4. 执行处理逻辑
    try {
      await handler(record);

      // 5. 标记为完成
      await this.updateWebhookStatus(record.id, 'completed');

      console.log(
        `[Webhook] 事件处理成功: ${params.provider}:${params.eventId}`
      );

      return {
        success: true,
        isDuplicate: false,
        record: {
          ...record,
          status: 'completed',
          processedAt: new Date(),
        },
      };
    } catch (error) {
      // 6. 处理失败
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const errorDetails = {
        error: error instanceof Error ? error.stack : String(error),
        timestamp: new Date().toISOString(),
      };

      // 增加重试次数
      await this.incrementRetryCount(record.id);

      // 更新状态
      await this.updateWebhookStatus(
        record.id,
        'failed',
        errorMessage,
        errorDetails
      );

      console.error(
        `[Webhook] 事件处理失败: ${params.provider}:${params.eventId}`,
        error
      );

      throw error;
    }
  },

  /**
   * 查询失败的 webhook 事件（需要重试）
   *
   * @param provider - 提供商（可选）
   * @param limit - 限制数量
   * @returns 失败的事件列表
   */
  async getFailedEvents(
    provider?: WebhookProvider,
    limit: number = 100
  ): Promise<WebhookEventRecord[]> {
    const conditions = [
      eq(webhookEvents.status, 'failed'),
      sql`${webhookEvents.retryCount} < ${webhookEvents.maxRetries}`,
    ];

    if (provider) {
      conditions.push(eq(webhookEvents.provider, provider));
    }

    const results = await db
      .select()
      .from(webhookEvents)
      .where(and(...conditions))
      .orderBy(webhookEvents.createdAt)
      .limit(limit);

    return results.map(this.mapToEventRecord);
  },

  /**
   * 重试失败的 webhook 事件
   *
   * @param eventId - 事件 ID
   * @param handler - 处理函数
   */
  async retryFailedEvent(
    eventId: string,
    handler: WebhookHandler
  ): Promise<void> {
    // 查询事件
    const result = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, eventId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Webhook 事件');
    }

    const record = this.mapToEventRecord(result[0]!);

    // 检查是否可以重试
    if (record.retryCount >= record.maxRetries) {
      throw new ConflictError('事件已达到最大重试次数');
    }

    // 重置状态为 pending
    await db
      .update(webhookEvents)
      .set({
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(webhookEvents.id, eventId));

    // 重新处理
    const params: CreateWebhookEventParams = {
      provider: record.provider,
      eventId: record.eventId,
      eventType: record.eventType,
      rawPayload: record.rawPayload,
      signature: record.signature ?? undefined,
      signatureVerified: record.signatureVerified,
      userId: record.userId ?? undefined,
      paymentId: record.paymentId ?? undefined,
    };

    await this.processWebhook(params, handler);
  },

  /**
   * 获取 webhook 事件统计
   *
   * @param provider - 提供商
   * @param startDate - 开始日期
   * @param endDate - 结束日期
   */
  async getWebhookStats(
    provider: WebhookProvider,
    startDate: Date,
    endDate: Date
  ): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    processing: number;
    successRate: number;
  }> {
    const conditions = [
      eq(webhookEvents.provider, provider),
      sql`${webhookEvents.createdAt} >= ${startDate}`,
      sql`${webhookEvents.createdAt} <= ${endDate}`,
    ];

    const results = await db
      .select({
        status: webhookEvents.status,
        count: sql<number>`count(*)::int`,
      })
      .from(webhookEvents)
      .where(and(...conditions))
      .groupBy(webhookEvents.status);

    const stats = {
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      processing: 0,
      successRate: 0,
    };

    for (const row of results) {
      const count = row.count;
      stats.total += count;

      switch (row.status) {
        case 'completed':
          stats.completed = count;
          break;
        case 'failed':
          stats.failed = count;
          break;
        case 'pending':
          stats.pending = count;
          break;
        case 'processing':
          stats.processing = count;
          break;
      }
    }

    if (stats.total > 0) {
      stats.successRate = Number(((stats.completed / stats.total) * 100).toFixed(2));
    }

    return stats;
  },

  /**
   * 关联 webhook 事件和支付记录
   *
   * @param eventId - 事件 ID
   * @param paymentId - 支付记录 ID
   */
  async linkPayment(eventId: string, paymentId: string): Promise<void> {
    // 获取支付记录的用户 ID
    const paymentResult = await db
      .select({ userId: payments.userId })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (paymentResult.length === 0) {
      throw new NotFoundError('支付记录');
    }

    await db
      .update(webhookEvents)
      .set({
        paymentId,
        userId: paymentResult[0]!.userId,
        updatedAt: new Date(),
      })
      .where(eq(webhookEvents.id, eventId));
  },

  /**
   * 映射数据库记录到事件记录对象
   */
  mapToEventRecord(row: typeof webhookEvents.$inferSelect): WebhookEventRecord {
    return {
      id: row.id,
      provider: row.provider as WebhookProvider,
      eventId: row.eventId,
      eventType: row.eventType,
      status: row.status as WebhookStatus,
      retryCount: row.retryCount,
      maxRetries: row.maxRetries,
      userId: row.userId,
      paymentId: row.paymentId,
      rawPayload: row.rawPayload,
      processedAt: row.processedAt,
      errorMessage: row.errorMessage,
      errorDetails: row.errorDetails,
      signature: row.signature,
      signatureVerified: row.signatureVerified,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
};

export default webhookService;
