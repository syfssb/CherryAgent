import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse, paginationMeta } from '../../utils/response.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  authenticateAdminAsync,
  requirePermission,
} from '../../middleware/admin-auth.js';
import { auditLog } from '../../middleware/admin-logger.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { pool } from '../../db/index.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import { refreshChannelCache } from '../../services/channel.js';

export const adminChannelsRouter = Router();

// ==========================================
// Schema 定义
// ==========================================

/**
 * 渠道列表查询 Schema
 */
const listChannelsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  provider: z.string().optional(),
  isEnabled: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  healthStatus: z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']).optional(),
  search: z.string().optional(),
});

/**
 * 创建渠道 Schema
 */
const createChannelSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100),
  provider: z.string().min(1, '提供商不能为空'),
  baseUrl: z.string().url('无效的 URL 格式'),
  apiKey: z.string().min(1, 'API Key 不能为空'),
  modelMapping: z.record(z.string()).optional().default({}),
  weight: z.number().int().min(0).max(100).default(100),
  priority: z.number().int().min(0).default(0),
  rpmLimit: z.number().int().min(0).default(0),
  tpmLimit: z.number().int().min(0).default(0),
  dailyLimit: z.number().int().min(0).default(0),
  priceMultiplier: z.number().positive().default(1),
  isEnabled: z.boolean().default(true),
});

/**
 * 更新渠道 Schema
 */
const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  provider: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  modelMapping: z.record(z.string()).optional(),
  weight: z.number().int().min(0).max(100).optional(),
  priority: z.number().int().min(0).optional(),
  rpmLimit: z.number().int().min(0).optional(),
  tpmLimit: z.number().int().min(0).optional(),
  dailyLimit: z.number().int().min(0).optional(),
  priceMultiplier: z.number().positive().optional(),
  isEnabled: z.boolean().optional(),
});

// ==========================================
// 路由处理
// ==========================================

/**
 * 获取渠道列表
 * GET /admin/channels
 */
adminChannelsRouter.get(
  '/',
  authenticateAdminAsync,
  requirePermission('channels:read'),
  validateQuery(listChannelsSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof listChannelsSchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.provider) {
      conditions.push(`provider = $${paramIndex++}`);
      params.push(query.provider);
    }

    if (query.isEnabled !== undefined) {
      conditions.push(`is_enabled = $${paramIndex++}`);
      params.push(query.isEnabled);
    }

    if (query.healthStatus) {
      conditions.push(`health_status = $${paramIndex++}`);
      params.push(query.healthStatus);
    }

    if (query.search) {
      const escapedSearch = query.search.replace(/[%_\\]/g, '\\$&');
      conditions.push(`name ILIKE $${paramIndex++}`);
      params.push(`%${escapedSearch}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询渠道列表
    const channelsResult = await pool.query(
      `SELECT
         id,
         name,
         provider,
         base_url,
         model_mapping,
         weight,
         priority,
         rpm_limit,
         tpm_limit,
         daily_limit,
         price_multiplier,
         is_enabled,
         health_status,
         last_health_check,
         consecutive_failures,
         created_at,
         updated_at
       FROM channels
       ${whereClause}
       ORDER BY is_enabled DESC, priority ASC, weight DESC, created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM channels ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    // 统计汇总
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) as total_channels,
         COUNT(CASE WHEN is_enabled = true THEN 1 END) as enabled_channels,
         COUNT(CASE WHEN health_status = 'healthy' THEN 1 END) as healthy_channels,
         COUNT(CASE WHEN health_status = 'degraded' THEN 1 END) as degraded_channels,
         COUNT(CASE WHEN health_status = 'unhealthy' THEN 1 END) as unhealthy_channels
       FROM channels`
    );

    const summary = summaryResult.rows[0] as {
      total_channels: string;
      enabled_channels: string;
      healthy_channels: string;
      degraded_channels: string;
      unhealthy_channels: string;
    };

    const channels = (channelsResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        name: string;
        provider: string;
        base_url: string;
        model_mapping: Record<string, string>;
        weight: number;
        priority: number;
        rpm_limit: number;
        tpm_limit: number;
        daily_limit: number;
        price_multiplier: string;
        is_enabled: boolean;
        health_status: string;
        last_health_check: Date | null;
        consecutive_failures: number;
        created_at: Date;
        updated_at: Date;
      };
      return {
        id: r.id,
        name: r.name,
        provider: r.provider,
        baseUrl: r.base_url,
        modelMapping: r.model_mapping,
        weight: r.weight,
        priority: r.priority,
        rpmLimit: r.rpm_limit,
        tpmLimit: r.tpm_limit,
        dailyLimit: r.daily_limit,
        priceMultiplier: parseFloat(r.price_multiplier),
        isEnabled: r.is_enabled,
        healthStatus: r.health_status,
        lastHealthCheck: r.last_health_check,
        consecutiveFailures: r.consecutive_failures,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    res.json(
      successResponse(
        {
          channels,
          summary: {
            totalChannels: parseInt(summary.total_channels, 10),
            enabledChannels: parseInt(summary.enabled_channels, 10),
            healthyChannels: parseInt(summary.healthy_channels, 10),
            degradedChannels: parseInt(summary.degraded_channels, 10),
            unhealthyChannels: parseInt(summary.unhealthy_channels, 10),
          },
        },
        paginationMeta(total, page, limit)
      )
    );
  }
);

/**
 * 获取渠道详情
 * GET /admin/channels/:id
 */
adminChannelsRouter.get(
  '/:id',
  authenticateAdminAsync,
  requirePermission('channels:read'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
         id,
         name,
         provider,
         base_url,
         api_key_encrypted,
         model_mapping,
         weight,
         priority,
         rpm_limit,
         tpm_limit,
         daily_limit,
         price_multiplier,
         is_enabled,
         health_status,
         last_health_check,
         consecutive_failures,
         created_at,
         updated_at
       FROM channels
       WHERE id = $1`,
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('渠道');
    }

    const r = result.rows[0] as {
      id: string;
      name: string;
      provider: string;
      base_url: string;
      api_key_encrypted: string;
      model_mapping: Record<string, string>;
      weight: number;
      priority: number;
      rpm_limit: number;
      tpm_limit: number;
      daily_limit: number;
      price_multiplier: string;
      is_enabled: boolean;
      health_status: string;
      last_health_check: Date | null;
      consecutive_failures: number;
      created_at: Date;
      updated_at: Date;
    };

    // 解密 API Key (只显示前后几位)
    let apiKeyMasked = '********';
    try {
      const decrypted = decrypt(r.api_key_encrypted);
      if (decrypted.length > 8) {
        apiKeyMasked = `${decrypted.slice(0, 4)}...${decrypted.slice(-4)}`;
      }
    } catch {
      // 解密失败，保持掩码
    }

    // 获取使用统计
    const usageResult = await pool.query(
      `SELECT
         COUNT(*) as total_requests,
         COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
         COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(AVG(latency_ms), 0) as avg_latency
       FROM usage_logs
       WHERE metadata->>'channelId' = $1
         AND created_at >= NOW() - INTERVAL '7 days'`,
      [id]
    );

    const usage = usageResult.rows[0] as {
      total_requests: string;
      success_count: string;
      error_count: string;
      total_tokens: string;
      avg_latency: string;
    };

    res.json(
      successResponse({
        channel: {
          id: r.id,
          name: r.name,
          provider: r.provider,
          baseUrl: r.base_url,
          apiKeyMasked,
          modelMapping: r.model_mapping,
          weight: r.weight,
          priority: r.priority,
          rpmLimit: r.rpm_limit,
          tpmLimit: r.tpm_limit,
          dailyLimit: r.daily_limit,
          priceMultiplier: parseFloat(r.price_multiplier),
          isEnabled: r.is_enabled,
          healthStatus: r.health_status,
          lastHealthCheck: r.last_health_check,
          consecutiveFailures: r.consecutive_failures,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        },
        usage: {
          last7Days: {
            totalRequests: parseInt(usage.total_requests, 10),
            successCount: parseInt(usage.success_count, 10),
            errorCount: parseInt(usage.error_count, 10),
            totalTokens: parseInt(usage.total_tokens, 10),
            avgLatencyMs: parseFloat(usage.avg_latency).toFixed(0),
            successRate:
              parseInt(usage.total_requests, 10) > 0
                ? (
                    (parseInt(usage.success_count, 10) /
                      parseInt(usage.total_requests, 10)) *
                    100
                  ).toFixed(2)
                : '0.00',
          },
        },
      })
    );
  }
);

/**
 * 创建渠道
 * POST /admin/channels
 */
adminChannelsRouter.post(
  '/',
  authenticateAdminAsync,
  requirePermission('channels:write'),
  validateBody(createChannelSchema),
  auditLog('channel.create', 'channel', {
    captureRequestBody: true,
    getDescription: (req) => `创建渠道: ${req.body.name}`,
  }),
  async (req: Request, res: Response) => {
    const data = req.body as z.infer<typeof createChannelSchema>;

    // 加密 API Key
    const encryptedApiKey = encrypt(data.apiKey);

    const result = await pool.query(
      `INSERT INTO channels (
         name,
         provider,
         base_url,
         api_key_encrypted,
         model_mapping,
         weight,
         priority,
         rpm_limit,
         tpm_limit,
         daily_limit,
         price_multiplier,
         is_enabled
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, created_at`,
      [
        data.name,
        data.provider,
        data.baseUrl,
        encryptedApiKey,
        JSON.stringify(data.modelMapping),
        data.weight,
        data.priority,
        data.rpmLimit,
        data.tpmLimit,
        data.dailyLimit,
        data.priceMultiplier,
        data.isEnabled,
      ]
    );

    const created = result.rows[0] as { id: string; created_at: Date };

    // 主动刷新渠道缓存
    await refreshChannelCache();

    res.status(201).json(
      successResponse({
        message: '渠道已创建',
        channel: {
          id: created.id,
          name: data.name,
          provider: data.provider,
          createdAt: created.created_at,
        },
      })
    );
  }
);

/**
 * 更新渠道
 * PATCH /admin/channels/:id
 */
adminChannelsRouter.patch(
  '/:id',
  authenticateAdminAsync,
  requirePermission('channels:write'),
  validateBody(updateChannelSchema),
  auditLog('channel.update', 'channel', {
    getTargetId: (req) => req.params.id,
    captureRequestBody: true,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body as z.infer<typeof updateChannelSchema>;

    // 检查渠道是否存在
    const existingResult = await pool.query(
      `SELECT id FROM channels WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('渠道');
    }

    // 构建更新语句
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      params.push(updates.name);
    }

    if (updates.provider !== undefined) {
      updateFields.push(`provider = $${paramIndex++}`);
      params.push(updates.provider);
    }

    if (updates.baseUrl !== undefined) {
      updateFields.push(`base_url = $${paramIndex++}`);
      params.push(updates.baseUrl);
    }

    if (updates.apiKey !== undefined) {
      updateFields.push(`api_key_encrypted = $${paramIndex++}`);
      params.push(encrypt(updates.apiKey));
    }

    if (updates.modelMapping !== undefined) {
      updateFields.push(`model_mapping = $${paramIndex++}`);
      params.push(JSON.stringify(updates.modelMapping));
    }

    if (updates.weight !== undefined) {
      updateFields.push(`weight = $${paramIndex++}`);
      params.push(updates.weight);
    }

    if (updates.priority !== undefined) {
      updateFields.push(`priority = $${paramIndex++}`);
      params.push(updates.priority);
    }

    if (updates.rpmLimit !== undefined) {
      updateFields.push(`rpm_limit = $${paramIndex++}`);
      params.push(updates.rpmLimit);
    }

    if (updates.tpmLimit !== undefined) {
      updateFields.push(`tpm_limit = $${paramIndex++}`);
      params.push(updates.tpmLimit);
    }

    if (updates.dailyLimit !== undefined) {
      updateFields.push(`daily_limit = $${paramIndex++}`);
      params.push(updates.dailyLimit);
    }

    if (updates.priceMultiplier !== undefined) {
      updateFields.push(`price_multiplier = $${paramIndex++}`);
      params.push(updates.priceMultiplier);
    }

    if (updates.isEnabled !== undefined) {
      updateFields.push(`is_enabled = $${paramIndex++}`);
      params.push(updates.isEnabled);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('没有要更新的字段');
    }

    updateFields.push(`updated_at = NOW()`);
    params.push(id);

    await pool.query(
      `UPDATE channels SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    // 主动刷新渠道缓存
    await refreshChannelCache();

    res.json(
      successResponse({
        message: '渠道已更新',
      })
    );
  }
);

/**
 * 删除渠道
 * DELETE /admin/channels/:id
 */
adminChannelsRouter.delete(
  '/:id',
  authenticateAdminAsync,
  requirePermission('channels:delete'),
  auditLog('channel.delete', 'channel', {
    getTargetId: (req) => req.params.id,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 检查渠道是否存在
    const existingResult = await pool.query(
      `SELECT id, name FROM channels WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('渠道');
    }

    const channel = existingResult.rows[0] as { id: string; name: string };

    // 删除渠道
    await pool.query(`DELETE FROM channels WHERE id = $1`, [id]);

    // 主动刷新渠道缓存
    await refreshChannelCache();

    res.json(
      successResponse({
        message: '渠道已删除',
        channel: {
          id: channel.id,
          name: channel.name,
        },
      })
    );
  }
);

/**
 * 重置渠道健康状态
 * POST /admin/channels/:id/reset-health
 */
adminChannelsRouter.post(
  '/:id/reset-health',
  authenticateAdminAsync,
  requirePermission('channels:write'),
  auditLog('channel.update', 'channel', {
    getTargetId: (req) => req.params.id,
    getDescription: () => '重置健康状态',
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 检查渠道是否存在
    const existingResult = await pool.query(
      `SELECT id FROM channels WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('渠道');
    }

    // 重置健康状态
    await pool.query(
      `UPDATE channels
       SET health_status = 'unknown',
           consecutive_failures = 0,
           last_health_check = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    res.json(
      successResponse({
        message: '健康状态已重置',
      })
    );
  }
);

/**
 * 测试渠道连接
 * POST /admin/channels/:id/test
 */
adminChannelsRouter.post(
  '/:id/test',
  authenticateAdminAsync,
  requirePermission('channels:write'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 获取渠道配置
    const result = await pool.query(
      `SELECT
         id,
         name,
         provider,
         base_url,
         api_key_encrypted,
         model_mapping
       FROM channels
       WHERE id = $1`,
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('渠道');
    }

    const channel = result.rows[0] as {
      id: string;
      name: string;
      provider: string;
      base_url: string;
      api_key_encrypted: string;
      model_mapping: Record<string, string> | null;
    };

    // 解密 API Key
    let apiKey: string;
    try {
      apiKey = decrypt(channel.api_key_encrypted);
    } catch {
      throw new ValidationError(
        'API Key 解密失败，可能是加密密钥已变更。请编辑该渠道重新输入 API Key。'
      );
    }

    // 可选参数：指定模型进行对话测试
    const { model } = req.body as { model?: string };

    const startTime = Date.now();
    let testResult: { success: boolean; message: string; latencyMs: number; model?: string };

    const isAnthropic = channel.provider === 'anthropic';

    try {
      if (model) {
        if (isAnthropic) {
          // Anthropic 格式：使用原始 fetch 发送 /v1/messages 请求
          // 不使用 SDK 以避免其默认 User-Agent 被第三方 CDN/WAF 拦截
          const baseUrl = channel.base_url.replace(/\/+$/, '').replace(/\/v1\/?$/, '');
          const response = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: 'Hi' }],
              max_tokens: 5,
            }),
            signal: AbortSignal.timeout(30000),
          });

          const latencyMs = Date.now() - startTime;

          if (response.ok) {
            testResult = {
              success: true,
              message: '模型对话测试成功',
              latencyMs,
              model,
            };
          } else {
            const body = await response.text().catch(() => '');
            testResult = {
              success: false,
              message: `HTTP ${response.status}: ${body.slice(0, 200) || response.statusText}`,
              latencyMs,
              model,
            };
          }
        } else {
          // OpenAI 兼容格式：发送 /chat/completions 请求
          const response = await fetch(`${channel.base_url}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: 'Hi' }],
              max_tokens: 5,
            }),
            signal: AbortSignal.timeout(30000),
          });

          const latencyMs = Date.now() - startTime;

          if (response.ok) {
            testResult = {
              success: true,
              message: '模型对话测试成功',
              latencyMs,
              model,
            };
          } else {
            const body = await response.text().catch(() => '');
            testResult = {
              success: false,
              message: `HTTP ${response.status}: ${body.slice(0, 200) || response.statusText}`,
              latencyMs,
              model,
            };
          }
        }
      } else {
        if (isAnthropic) {
          // Anthropic 格式基础测试：发送最小请求验证连通性
          const baseUrl = channel.base_url.replace(/\/+$/, '').replace(/\/v1\/?$/, '');
          const models = Object.keys(channel.model_mapping ?? {});
          const testModelName = models[0] || 'claude-sonnet-4-20250514';

          const response = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: testModelName,
              messages: [{ role: 'user', content: 'Hi' }],
              max_tokens: 1,
            }),
            signal: AbortSignal.timeout(10000),
          });

          const latencyMs = Date.now() - startTime;

          if (response.ok) {
            testResult = {
              success: true,
              message: '连接成功',
              latencyMs,
            };
          } else {
            const body = await response.text().catch(() => '');
            testResult = {
              success: false,
              message: `HTTP ${response.status}: ${body.slice(0, 200) || response.statusText}`,
              latencyMs,
            };
          }
        } else {
          // OpenAI 兼容格式基础测试：请求 /models 端点
          const response = await fetch(`${channel.base_url}/models`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(10000),
          });

          const latencyMs = Date.now() - startTime;

          if (response.ok) {
            testResult = {
              success: true,
              message: '连接成功',
              latencyMs,
            };
          } else {
            testResult = {
              success: false,
              message: `HTTP ${response.status}: ${response.statusText}`,
              latencyMs,
            };
          }
        }
      }

      // 测试成功时更新健康状态
      if (testResult.success) {
        await pool.query(
          `UPDATE channels
           SET health_status = 'healthy',
               consecutive_failures = 0,
               last_health_check = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [id]
        );
      }
    } catch (error: unknown) {
      const latencyMs = Date.now() - startTime;
      let message = '连接失败';
      if (error instanceof Error) {
        message = error.message;
      }
      testResult = {
        success: false,
        message,
        latencyMs,
        ...(model && { model }),
      };
    }

    res.json(successResponse(testResult));
  }
);

export default adminChannelsRouter;
