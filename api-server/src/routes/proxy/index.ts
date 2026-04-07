import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse } from '../../utils/response.js';
import { authenticate, optionalAuth } from '../../middleware/auth.js';
import { getAllChannelStatus } from '../../services/channel.js';
import { balanceCheck } from '../../middleware/balance-check.js';
import { validateBody } from '../../middleware/validate.js';
import { chatCompletionSchema, claudeMessagesSchema, responsesSchema } from './schemas.js';
import { handleClaudeMessages } from './claude-handler.js';
import { handleChatCompletions } from './chat-completions.js';
import { handleResponses, handleResponsesCompact } from './responses.js';
import { providerRegistry } from './registry.js';
import type { ModelInfo } from './types.js';
import { pool } from '../../db/index.js';
import { selectChannel } from '../../services/channel.js';
import { countTokens } from './adapters/anthropic.js';
import { ExternalServiceError } from '../../utils/errors.js';

// 注册所有内置适配器（副作用导入）
import './adapters/index.js';

export { providerRegistry } from './registry.js';
export type { ProviderAdapter, UnifiedCompletionParams, CompletionResult, StreamChunk } from './types.js';

export const proxyRouter = Router();

/**
 * Claude count_tokens API 代理
 * POST /api/proxy/v1/messages/count_tokens
 *
 * SDK 在 streaming 模式前会调用此端点预估 token 数量。
 * 不消耗 token，不需要 balanceCheck。
 */
proxyRouter.post(
  '/v1/messages/count_tokens',
  authenticate,
  async (req: Request, res: Response) => {
    const { model } = req.body;
    const selection = selectChannel(model);
    if (!selection) {
      throw new ExternalServiceError('proxy', `没有可用的渠道支持模型: ${model}`);
    }
    const result = await countTokens(selection.channel, req.body);
    res.json(result);
  }
);

/**
 * Claude Messages API 代理
 * POST /api/proxy/messages
 * POST /api/proxy/v1/messages (兼容 SDK /v1/messages)
 */
proxyRouter.post(
  '/messages',
  authenticate,
  balanceCheck(),
  validateBody(claudeMessagesSchema),
  handleClaudeMessages
);

proxyRouter.post(
  '/v1/messages',
  authenticate,
  balanceCheck(),
  validateBody(claudeMessagesSchema),
  handleClaudeMessages
);

/**
 * Chat Completions 代理 (OpenAI 兼容格式)
 * POST /api/proxy/chat/completions
 */
proxyRouter.post(
  '/chat/completions',
  authenticate,
  balanceCheck(),
  validateBody(chatCompletionSchema),
  handleChatCompletions
);

/**
 * OpenAI Responses Compact 代理（供 Codex SDK 上下文压缩使用）
 * POST /api/proxy/v1/responses/compact
 *
 * 当 Codex 会话历史超出模型上下文窗口时，Codex CLI 自动调用此端点
 * 将对话历史压缩为更短摘要（非流式 JSON 响应）。
 * 必须注册在 /v1/responses 之前，确保路由优先匹配。
 */
proxyRouter.post(
  '/v1/responses/compact',
  authenticate,
  balanceCheck(),
  validateBody(responsesSchema),
  handleResponsesCompact
);

/**
 * OpenAI Responses 代理（供 Codex SDK 使用）
 * POST /api/proxy/v1/responses
 * POST /api/proxy/responses
 */
proxyRouter.post(
  '/v1/responses',
  authenticate,
  balanceCheck(),
  validateBody(responsesSchema),
  handleResponses
);

proxyRouter.post(
  '/responses',
  authenticate,
  balanceCheck(),
  validateBody(responsesSchema),
  handleResponses
);

/**
 * Embeddings 代理
 * POST /api/proxy/embeddings
 */
proxyRouter.post(
  '/embeddings',
  authenticate,
  validateBody(z.object({
    model: z.string().min(1),
    input: z.union([z.string(), z.array(z.string())]),
    encoding_format: z.enum(['float', 'base64']).optional(),
    dimensions: z.number().int().min(1).optional(),
  })),
  async (_req: Request, res: Response) => {
    res.status(501).json({
      error: {
        message: 'Embeddings endpoint is not yet implemented',
        type: 'not_implemented',
      },
    });
  }
);

/**
 * 获取可用模型列表
 * GET /api/proxy/models
 *
 * 直接从数据库读取模型信息，不再依赖硬编码
 */
proxyRouter.get(
  '/models',
  optionalAuth,
  async (_req: Request, res: Response) => {
    // 从数据库读取所有启用的模型
    const result = await pool.query(
      `SELECT
        m.id,
        m.display_name,
        m.provider,
        m.max_context_length
      FROM models m
      WHERE m.is_enabled = true
        AND COALESCE((to_jsonb(m) ->> 'is_hidden')::boolean, false) = false
      ORDER BY m.sort_order ASC, m.provider, m.id`
    );

    const models: ModelInfo[] = (result.rows as Array<{
      id: string;
      display_name: string;
      provider: string;
      max_context_length: number;
    }>).map((row) => {
      const adapter = providerRegistry.getAdapterForModel(row.id);
      return {
        id: row.id,
        displayName: row.display_name,
        provider: row.provider,
        capabilities: adapter?.capabilities ?? { streaming: true, tools: false, vision: false },
        context_window: row.max_context_length,
      };
    });

    res.json(successResponse(models));
  }
);

/**
 * 获取渠道状态
 * GET /api/proxy/channels
 */
proxyRouter.get(
  '/channels',
  authenticate,
  async (_req: Request, res: Response) => {
    const status = getAllChannelStatus();

    const sanitizedStatus = status.map(({ channel, health, rateLimit }) => ({
      id: channel.id,
      name: channel.name,
      provider: channel.provider,
      models: channel.models,
      isEnabled: channel.isEnabled,
      costMultiplier: channel.costMultiplier,
      health: {
        isHealthy: health.isHealthy,
        successCount: health.successCount,
        failureCount: health.failureCount,
        averageLatencyMs: health.averageLatencyMs,
      },
      rateLimit: rateLimit ? {
        requestCount: rateLimit.requestCount,
        tokenCount: rateLimit.tokenCount,
      } : undefined,
    }));

    res.json(successResponse(sanitizedStatus));
  }
);

/**
 * 获取已注册的 Provider 列表
 * GET /api/proxy/providers
 */
proxyRouter.get(
  '/providers',
  optionalAuth,
  async (_req: Request, res: Response) => {
    const adapters = providerRegistry.getAllAdapters();

    const providers = adapters.map((a) => ({
      name: a.name,
      capabilities: a.capabilities,
      modelPatterns: a.modelPatterns.map((p) => p.source),
    }));

    res.json(successResponse(providers));
  }
);

/**
 * Catch-all：静默接收 SDK 内部遥测 / 未知路由，返回 204 Not Content
 *
 * Claude Agent SDK 会向 ANTHROPIC_BASE_URL 下发一些内部请求
 * （如 /api/event_logging/batch、/v1/beta/... 等），我们无需处理，
 * 直接 204 让 SDK 认为上报成功，避免 500 噪音出现在用户界面。
 */
proxyRouter.all('*', (_req: Request, res: Response) => {
  res.status(204).end();
});

export default proxyRouter;
