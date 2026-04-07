/**
 * Claude Messages API 处理器
 *
 * 处理 /api/proxy/messages 和 /api/proxy/v1/messages 路由。
 * 接收 Claude 原生格式请求，通过 ProviderRegistry 调用适配器。
 */

import type { Request, Response } from 'express';
import { ProviderError } from '../../utils/errors.js';
import {
  selectChannel,
  updateChannelHealth,
  recordChannelRequest,
  sanitizeChannel,
} from '../../services/channel.js';
import type { ChannelConfig } from '../../services/channel.js';
import { settleCreditsAfterRequest, refundOnError } from '../../middleware/balance-check.js';
import { billingService } from '../../services/billing.js';
import { providerRegistry } from './registry.js';
import { generateRequestId } from './utils.js';
import { createRawStream } from './adapters/anthropic.js';
import { normalizeProxyRouteError, PERMANENT_PROVIDER_ERROR_MESSAGE } from './upstream-error.js';
import type { UnifiedCompletionParams, UsageInfo } from './types.js';

export const handleClaudeMessages = async (req: Request, res: Response) => {
  const requestBody = req.body;
  const { model, messages, max_tokens, system, stream } = requestBody;
  const requestId = generateRequestId();
  const startTime = Date.now();

  // 选择渠道
  const selection = selectChannel(model);
  if (!selection) {
    await refundOnError(req);
    throw new ProviderError(PERMANENT_PROVIDER_ERROR_MESSAGE, 409, { model });
  }

  const { channel, reason } = selection;

  console.info(`[claude-handler] Channel selected:`, {
    requestId,
    model,
    reason,
    ...sanitizeChannel(channel),
  });

  // 从注册表获取适配器：先按渠道 provider 查找，再按模型匹配，最后回退到 openai-compat
  const adapter = providerRegistry.getAdapter(channel.provider)
    ?? providerRegistry.getAdapterForModel(model)
    ?? providerRegistry.getAdapter('openai');
  if (!adapter) {
    await refundOnError(req);
    throw new ProviderError(PERMANENT_PROVIDER_ERROR_MESSAGE, 409, {
      model,
      provider: channel.provider,
    });
  }

  // 构建统一参数
  const params: UnifiedCompletionParams = {
    model,
    messages: messages.map((m: { role: string; content: unknown }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    maxTokens: max_tokens || 4096,
    system: system ?? undefined,
    temperature: requestBody.temperature,
    topP: requestBody.top_p,
    topK: requestBody.top_k,
    stopSequences: requestBody.stop_sequences,
    stream: !!stream,
    rawBody: requestBody,
  };

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

  try {
    if (stream) {
      await handleClaudeStream(req, res, { channel, adapter, params, requestId, startTime, safeSettle });
    } else {
      await handleClaudeNonStream(res, { channel, adapter, params, requestId, startTime, safeSettle });
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
};

// ---- 内部类型 ----

interface HandlerContext {
  channel: ChannelConfig;
  adapter: { name: string; createCompletion: Function; createStream: Function };
  params: UnifiedCompletionParams;
  requestId: string;
  startTime: number;
  safeSettle: (data: Parameters<typeof settleCreditsAfterRequest>[1]) => Promise<void>;
}

// ---- 流式处理 ----

async function handleClaudeStream(
  req: Request,
  res: Response,
  ctx: HandlerContext,
): Promise<void> {
  const { adapter } = ctx;

  // anthropic provider 使用 raw SSE 透传（性能最优），其他 provider 走适配器统一流
  if (adapter.name === 'anthropic') {
    await handleClaudeRawStream(req, res, ctx);
  } else {
    await handleClaudeAdapterStream(req, res, ctx);
  }
}

// ---- anthropic 原始 SSE 透传 ----

async function handleClaudeRawStream(
  req: Request,
  res: Response,
  ctx: HandlerContext,
): Promise<void> {
  const { channel, params, requestId, startTime, safeSettle } = ctx;

  // 直接从 Anthropic API 获取原始 SSE 响应
  const upstream = await createRawStream(channel, params);

  // 透传上游响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Channel-Id', channel.id);

  // 旁路解析 usage 用于计费
  let usage: UsageInfo = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let aborted = false;

  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = '';

  // 流式超时兜底（10 分钟无结算则自动退还）
  const STREAM_TIMEOUT_MS = 10 * 60 * 1000;
  const streamTimer = setTimeout(async () => {
    aborted = true;
    reader.cancel().catch(() => {});
    console.warn(`[claude-handler] Stream timeout after 10min`, { requestId });
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
    reader.cancel().catch(() => {});
    const latencyMs = Date.now() - startTime;
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

  // SSE keepalive：每 15 秒发送注释行，防止 Windows Defender / 防火墙
  // 在 thinking 与 text 之间的短暂停顿期将连接判定为"空闲"而断开
  const keepAliveTimer = setInterval(() => {
    if (!aborted && !res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 15_000);

  try {
    while (!aborted) {
      const { value, done } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });

      // 直接透传原始字节到客户端
      res.write(value);

      // 旁路解析 SSE 事件提取 usage
      sseBuffer += text;
      let eventEnd: number;
      while ((eventEnd = sseBuffer.indexOf('\n\n')) !== -1) {
        const eventStr = sseBuffer.slice(0, eventEnd);
        sseBuffer = sseBuffer.slice(eventEnd + 2);
        extractUsageFromSSE(eventStr, usage);
      }
    }
  } catch (error) {
    if (!aborted) {
      clearTimeout(streamTimer);
      clearInterval(keepAliveTimer);
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
      res.end();
      return;
    }
  } finally {
    clearInterval(keepAliveTimer);
    reader.cancel().catch(() => {});
  }

  // 流正常结束，结算
  clearTimeout(streamTimer);
  const latencyMs = Date.now() - startTime;
  updateChannelHealth(channel.id, true, latencyMs);
  recordChannelRequest(channel.id, usage.inputTokens + usage.outputTokens);

  await safeSettle({
    model: params.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    latencyMs,
    status: 'success',
  });

  if (!res.writableEnded) {
    res.end();
  }
}

/**
 * 从 SSE 事件字符串中提取 usage 信息（就地更新）
 */
function extractUsageFromSSE(eventStr: string, usage: UsageInfo): void {
  const lines = eventStr.split('\n');
  let eventType = '';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      data = line.slice(6);
    }
  }

  if (!data || data === '[DONE]') return;

  try {
    const parsed = JSON.parse(data);

    if (eventType === 'message_start') {
      const msg = parsed.message;
      if (msg?.usage) {
        usage.inputTokens = msg.usage.input_tokens ?? 0;
        usage.outputTokens = msg.usage.output_tokens ?? 0;
        usage.cacheReadTokens = msg.usage.cache_read_input_tokens ?? 0;
        usage.cacheWriteTokens = msg.usage.cache_creation_input_tokens ?? 0;
      }
    } else if (eventType === 'message_delta') {
      if (parsed.usage) {
        usage.outputTokens = parsed.usage.output_tokens ?? usage.outputTokens;
        // Kimi/New API 把缓存数据放在 message_delta，原生 Anthropic 在 message_start
        if (parsed.usage.cache_read_input_tokens) {
          usage.cacheReadTokens = parsed.usage.cache_read_input_tokens;
        }
        if (parsed.usage.cache_creation_input_tokens) {
          usage.cacheWriteTokens = parsed.usage.cache_creation_input_tokens;
        }
      }
    }
  } catch {
    // 解析失败忽略，不影响透传
  }
}

// ---- 非 anthropic provider 的适配器流式处理 ----

async function handleClaudeAdapterStream(
  req: Request,
  res: Response,
  ctx: HandlerContext,
): Promise<void> {
  const { channel, adapter, params, requestId, startTime, safeSettle } = ctx;

  const streamIterable = await adapter.createStream(channel, params);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Channel-Id', channel.id);

  let usage: UsageInfo = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let aborted = false;
  let contentText = '';

  req.on('close', async () => {
    aborted = true;
    const latencyMs = Date.now() - startTime;
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

  // SSE keepalive：每 15 秒发送注释行，防止 Windows Defender / 防火墙
  // 在 thinking 与 text 之间的短暂停顿期将连接判定为"空闲"而断开
  const keepAliveTimer = setInterval(() => {
    if (!aborted && !res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 15_000);

  try {
    // 发送 message_start 事件（模拟 Anthropic SSE 格式）
    const messageStartEvent = {
      type: 'message_start',
      message: {
        id: `msg_${requestId}`,
        type: 'message',
        role: 'assistant',
        model: params.model,
        content: [],
        stop_reason: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    };
    res.write(`event: message_start\ndata: ${JSON.stringify(messageStartEvent)}\n\n`);

    // 发送 content_block_start
    res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`);

    for await (const chunk of streamIterable) {
      if (aborted) break;

      switch (chunk.type) {
        case 'text': {
          contentText += chunk.text;
          const delta = { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk.text } };
          res.write(`event: content_block_delta\ndata: ${JSON.stringify(delta)}\n\n`);
          break;
        }
        case 'usage': {
          usage = { ...chunk.usage };
          break;
        }
        case 'error': {
          const errorEvent = { type: 'error', error: { type: 'api_error', message: chunk.error } };
          res.write(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`);
          break;
        }
        case 'done': {
          // content_block_stop + message_delta + message_stop
          res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
          const messageDelta = {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: usage.outputTokens },
          };
          res.write(`event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`);
          res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
          break;
        }
      }
    }
  } catch (error) {
    clearInterval(keepAliveTimer);
    if (!aborted) {
      updateChannelHealth(channel.id, false);
      const latencyMs = Date.now() - startTime;
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
      res.end();
      return;
    }
  }

  clearInterval(keepAliveTimer);
  // 流正常结束
  const latencyMs = Date.now() - startTime;
  updateChannelHealth(channel.id, true, latencyMs);
  recordChannelRequest(channel.id, usage.inputTokens + usage.outputTokens);

  await safeSettle({
    model: params.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    latencyMs,
    status: 'success',
  });

  if (!res.writableEnded) {
    res.end();
  }
}

// ---- 非流式处理 ----

async function handleClaudeNonStream(
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

  // 如果原始响应存在（Anthropic SDK 返回的完整对象），透传并增强
  const responseBody = result.rawResponse
    ? {
        ...result.rawResponse as Record<string, unknown>,
        credits_consumed: creditsCalculation.totalCredits,
        _usage: {
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          cache_read_tokens: result.usage.cacheReadTokens ?? 0,
          cache_write_tokens: result.usage.cacheWriteTokens ?? 0,
          total_tokens: result.usage.inputTokens + result.usage.outputTokens,
          latency_ms: latencyMs,
          model: params.model,
          provider: channel.provider,
          channel_id: channel.id,
          request_id: requestId,
          credits_consumed: creditsCalculation.totalCredits,
          input_credits: creditsCalculation.inputCredits,
          output_credits: creditsCalculation.outputCredits,
          cache_read_credits: creditsCalculation.cacheReadCredits,
          cache_write_credits: creditsCalculation.cacheWriteCredits,
        },
      }
    : {
        id: result.id,
        type: 'message',
        role: 'assistant',
        model: result.model,
        content: [{ type: 'text', text: result.content }],
        stop_reason: result.stopReason,
        usage: {
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          cache_creation_input_tokens: result.usage.cacheWriteTokens ?? 0,
          cache_read_input_tokens: result.usage.cacheReadTokens ?? 0,
        },
        credits_consumed: creditsCalculation.totalCredits,
        _usage: {
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          cache_read_tokens: result.usage.cacheReadTokens ?? 0,
          cache_write_tokens: result.usage.cacheWriteTokens ?? 0,
          total_tokens: result.usage.inputTokens + result.usage.outputTokens,
          latency_ms: latencyMs,
          model: params.model,
          provider: channel.provider,
          channel_id: channel.id,
          request_id: requestId,
          credits_consumed: creditsCalculation.totalCredits,
          input_credits: creditsCalculation.inputCredits,
          output_credits: creditsCalculation.outputCredits,
          cache_read_credits: creditsCalculation.cacheReadCredits,
          cache_write_credits: creditsCalculation.cacheWriteCredits,
        },
      };

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Channel-Id', channel.id);
  res.json(responseBody);
}
