/**
 * Chat Completions 处理器 (OpenAI 兼容格式)
 *
 * 处理 /api/proxy/chat/completions 路由。
 * 接收 OpenAI Chat Completions 格式请求，通过 ProviderRegistry 调用适配器，
 * 并将响应转换回 OpenAI 格式。
 */

import type { Request, Response } from 'express';
import { ProviderError } from '../../utils/errors.js';
import {
  selectChannel,
  updateChannelHealth,
  recordChannelRequest,
} from '../../services/channel.js';
import { settleCreditsAfterRequest, refundOnError } from '../../middleware/balance-check.js';
import { billingService } from '../../services/billing.js';
import { providerRegistry } from './registry.js';
import { generateRequestId, getProviderFromModel, convertToClaudeMessages } from './utils.js';
import { normalizeProxyRouteError, PERMANENT_PROVIDER_ERROR_MESSAGE } from './upstream-error.js';
import type { UnifiedCompletionParams, UsageInfo } from './types.js';

export async function handleChatCompletions(req: Request, res: Response): Promise<void> {
  const requestBody = req.body;
  const { model, messages, stream, provider: explicitProvider } = requestBody;
  const requestId = generateRequestId();
  const startTime = Date.now();

  // 确定提供商：优先使用显式指定 → 模型推断 → 渠道配置
  const rawProvider = explicitProvider ?? getProviderFromModel(model);

  // 从注册表获取适配器：先按 provider 名称查找，再按模型匹配，最后回退到 openai-compat
  const adapter = providerRegistry.getAdapter(rawProvider)
    ?? providerRegistry.getAdapterForModel(model)
    ?? providerRegistry.getAdapter('openai');
  if (!adapter) {
    await refundOnError(req);
    throw new ProviderError(PERMANENT_PROVIDER_ERROR_MESSAGE, 409, {
      model,
      provider: rawProvider,
    });
  }

  // 选择渠道
  const selection = selectChannel(model);
  if (!selection) {
    await refundOnError(req);
    throw new ProviderError(PERMANENT_PROVIDER_ERROR_MESSAGE, 409, { model });
  }

  const { channel } = selection;

  // 流式结算防护
  let settled = false;
  const safeSettle = async (data: Parameters<typeof settleCreditsAfterRequest>[1]) => {
    if (settled) return;
    settled = true;
    await settleCreditsAfterRequest(req, {
      ...data,
      provider: data.provider ?? channel.provider,
      channelId: data.channelId ?? channel.id,
      requestId: data.requestId ?? requestId,
    });
  };

  // 将 OpenAI 格式消息转为统一格式
  const { systemMessage, claudeMessages } = convertToClaudeMessages(messages);

  const params: UnifiedCompletionParams = {
    model,
    messages: claudeMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
    })),
    maxTokens: requestBody.max_tokens || 4096,
    system: systemMessage ?? undefined,
    temperature: requestBody.temperature,
    topP: requestBody.top_p,
    stopSequences: requestBody.stop
      ? (Array.isArray(requestBody.stop) ? requestBody.stop : [requestBody.stop])
      : undefined,
    stream: !!stream,
    rawBody: requestBody,
  };

  try {
    if (stream) {
      await handleOpenAIStream(req, res, { channel, adapter, params, requestId, startTime, safeSettle });
    } else {
      await handleOpenAINonStream(res, { channel, adapter, params, requestId, startTime, safeSettle });
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    updateChannelHealth(channel.id, false);

    await safeSettle({
      model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    throw normalizeProxyRouteError(channel.provider, error);
  }
}

// ---- 内部类型 ----

interface HandlerContext {
  channel: { id: string; provider: string; name: string };
  adapter: { createCompletion: Function; createStream: Function };
  params: UnifiedCompletionParams;
  requestId: string;
  startTime: number;
  safeSettle: (data: Parameters<typeof settleCreditsAfterRequest>[1]) => Promise<void>;
}

// ---- 流式处理（OpenAI SSE 格式输出） ----

async function handleOpenAIStream(
  req: Request,
  res: Response,
  ctx: HandlerContext,
): Promise<void> {
  const { channel, adapter, params, requestId, startTime, safeSettle } = ctx;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Channel-Id', channel.id);

  let usage: UsageInfo = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let firstTokenTime: number | null = null;
  let aborted = false;

  const iterable = await adapter.createStream(channel, params);
  const iterator = iterable[Symbol.asyncIterator]();

  // 流式超时兜底（10 分钟无结算则自动退还）
  const STREAM_TIMEOUT_MS = 10 * 60 * 1000;
  const streamTimer = setTimeout(async () => {
    aborted = true;
    if (iterator.return) {
      iterator.return().catch(() => {});
    }
    console.warn(`[chat-completions] Stream timeout after 10min`, { requestId });
    const latencyMs = Date.now() - startTime;
    await safeSettle({
      model: params.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      latencyMs,
      status: 'error',
      errorMessage: 'Stream timeout: no settlement after 10 minutes',
    });
    if (!res.writableEnded) res.end();
  }, STREAM_TIMEOUT_MS);

  // 客户端断开
  req.on('close', async () => {
    aborted = true;
    clearTimeout(streamTimer);
    const latencyMs = Date.now() - startTime;
    if (iterator.return) {
      iterator.return().catch(() => {});
    }
    await safeSettle({
      model: params.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      latencyMs,
      status: usage.outputTokens > 0 ? 'success' : 'error',
      errorMessage: usage.outputTokens > 0 ? undefined : 'Client disconnected',
    });
  });

  try {
    while (!aborted) {
      const { value: chunk, done } = await iterator.next();
      if (done) break;

      switch (chunk.type) {
        case 'text': {
          if (firstTokenTime === null) {
            firstTokenTime = Date.now();
          }
          const sseChunk = {
            id: `chatcmpl-${requestId}`,
            object: 'chat.completion.chunk',
            created: Math.floor(startTime / 1000),
            model: params.model,
            choices: [{
              index: 0,
              delta: { content: chunk.text },
              finish_reason: null,
            }],
          };
          res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
          break;
        }
        case 'usage': {
          usage = chunk.usage;
          break;
        }
        case 'error': {
          const errorChunk = {
            error: { message: chunk.error, type: 'api_error' },
          };
          res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
          break;
        }
        case 'done': {
          clearTimeout(streamTimer);
          const latencyMs = Date.now() - startTime;
          updateChannelHealth(channel.id, true, latencyMs);
          recordChannelRequest(channel.id, usage.inputTokens + usage.outputTokens);

          const creditsCalculation = await billingService.calculateCredits(
            params.model, usage.inputTokens, usage.outputTokens,
            usage.cacheReadTokens, usage.cacheWriteTokens,
          );

          const endChunk = {
            id: `chatcmpl-${requestId}`,
            object: 'chat.completion.chunk',
            created: Math.floor(startTime / 1000),
            model: params.model,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: 'stop',
            }],
            usage: {
              prompt_tokens: usage.inputTokens,
              completion_tokens: usage.outputTokens,
              total_tokens: usage.inputTokens + usage.outputTokens,
            },
            _usage: {
              latency_ms: latencyMs,
              first_token_latency_ms: firstTokenTime ? firstTokenTime - startTime : null,
              model: params.model,
              provider: channel.provider,
              channel_id: channel.id,
              credits_consumed: creditsCalculation.totalCredits,
              input_credits: creditsCalculation.inputCredits,
              output_credits: creditsCalculation.outputCredits,
              cache_read_tokens: usage.cacheReadTokens ?? 0,
              cache_write_tokens: usage.cacheWriteTokens ?? 0,
              cache_read_credits: creditsCalculation.cacheReadCredits,
              cache_write_credits: creditsCalculation.cacheWriteCredits,
            },
          };
          res.write(`data: ${JSON.stringify(endChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();

          await safeSettle({
            model: params.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
            latencyMs,
            status: 'success',
          });
          return;
        }
      }
    }
  } catch (error) {
    if (!aborted) {
      clearTimeout(streamTimer);
      const latencyMs = Date.now() - startTime;
      updateChannelHealth(channel.id, false);

      await safeSettle({
        model: params.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        latencyMs,
        status: usage.outputTokens > 0 ? 'success' : 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      const errorChunk = {
        error: { message: error instanceof Error ? error.message : String(error), type: 'api_error' },
      };
      res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
      res.end();
    }
  }
}

// ---- 非流式处理（OpenAI JSON 格式输出） ----

async function handleOpenAINonStream(
  res: Response,
  ctx: Omit<HandlerContext, 'adapter'> & { adapter: { createCompletion: Function } },
): Promise<void> {
  const { channel, adapter, params, requestId, startTime, safeSettle } = ctx;

  const result = await adapter.createCompletion(channel, params);
  const latencyMs = Date.now() - startTime;

  updateChannelHealth(channel.id, true, latencyMs);
  recordChannelRequest(channel.id, result.usage.inputTokens + result.usage.outputTokens);

  const creditsCalculation = await billingService.calculateCredits(
    params.model, result.usage.inputTokens, result.usage.outputTokens,
    result.usage.cacheReadTokens, result.usage.cacheWriteTokens,
  );

  await safeSettle({
    model: params.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cacheReadTokens: result.usage.cacheReadTokens,
    cacheWriteTokens: result.usage.cacheWriteTokens,
    latencyMs,
    status: 'success',
  });

  const openAIResponse = {
    id: `chatcmpl-${requestId}`,
    object: 'chat.completion',
    created: Math.floor(startTime / 1000),
    model: params.model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: result.content,
      },
      finish_reason: result.stopReason === 'end_turn' ? 'stop' : result.stopReason,
    }],
    usage: {
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
      total_tokens: result.usage.inputTokens + result.usage.outputTokens,
    },
    _usage: {
      latency_ms: latencyMs,
      model: params.model,
      provider: channel.provider,
      channel_id: channel.id,
      request_id: requestId,
      credits_consumed: creditsCalculation.totalCredits,
      input_credits: creditsCalculation.inputCredits,
      output_credits: creditsCalculation.outputCredits,
      cache_read_tokens: result.usage.cacheReadTokens ?? 0,
      cache_write_tokens: result.usage.cacheWriteTokens ?? 0,
      cache_read_credits: creditsCalculation.cacheReadCredits,
      cache_write_credits: creditsCalculation.cacheWriteCredits,
    },
  };

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Channel-Id', channel.id);
  res.json(openAIResponse);
}
