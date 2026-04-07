/**
 * OpenAI Responses API 处理器
 *
 * 处理 /api/proxy/v1/responses 与 /api/proxy/responses 路由，
 * 供 Codex SDK 使用。请求体透传到上游渠道的 /v1/responses。
 */

import type { Request, Response } from 'express';
import { ExternalServiceError, ProviderError, ValidationError } from '../../utils/errors.js';
import {
  selectChannel,
  updateChannelHealth,
  recordChannelRequest,
} from '../../services/channel.js';
import { settleCreditsAfterRequest, refundOnError } from '../../middleware/balance-check.js';
import { generateRequestId } from './utils.js';
import { createUpstreamHttpError, normalizeProxyRouteError, PERMANENT_PROVIDER_ERROR_MESSAGE } from './upstream-error.js';

type UsageInfo = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

function toSafeInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/v1\/?$/, '');
}

function buildResponsesUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/v1/responses`;
}

function usageFromUnknown(value: unknown): UsageInfo {
  const obj = value && typeof value === 'object' ? value as Record<string, unknown> : {};

  // Responses API 返回嵌套结构: input_tokens_details.cached_tokens
  // Chat Completions API 返回: prompt_tokens_details.cached_tokens
  const inputDetails = obj.input_tokens_details && typeof obj.input_tokens_details === 'object'
    ? obj.input_tokens_details as Record<string, unknown>
    : {};
  const promptDetails = obj.prompt_tokens_details && typeof obj.prompt_tokens_details === 'object'
    ? obj.prompt_tokens_details as Record<string, unknown>
    : {};

  return {
    inputTokens: toSafeInt(obj.input_tokens ?? obj.prompt_tokens),
    outputTokens: toSafeInt(obj.output_tokens ?? obj.completion_tokens),
    cacheReadTokens: toSafeInt(
      inputDetails.cached_tokens
      ?? promptDetails.cached_tokens
      ?? obj.cached_input_tokens
      ?? obj.cache_read_input_tokens
    ),
    cacheWriteTokens: toSafeInt(obj.cache_creation_input_tokens ?? obj.cache_write_input_tokens),
  };
}

function extractUsageFromPayload(payload: unknown): UsageInfo {
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (body.usage) {
    return usageFromUnknown(body.usage);
  }
  if (body.response && typeof body.response === 'object') {
    const responseObj = body.response as Record<string, unknown>;
    if (responseObj.usage) {
      return usageFromUnknown(responseObj.usage);
    }
  }
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

function mergeUsage(target: UsageInfo, next: UsageInfo): void {
  target.inputTokens = Math.max(target.inputTokens, next.inputTokens);
  target.outputTokens = Math.max(target.outputTokens, next.outputTokens);
  target.cacheReadTokens = Math.max(target.cacheReadTokens, next.cacheReadTokens);
  target.cacheWriteTokens = Math.max(target.cacheWriteTokens, next.cacheWriteTokens);
}

function extractUsageFromSSEEvent(eventBlock: string, usage: UsageInfo): void {
  const lines = eventBlock.split('\n');
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) return;
  const dataText = dataLines.join('\n');
  if (!dataText || dataText === '[DONE]') return;

  try {
    const parsed = JSON.parse(dataText) as unknown;
    mergeUsage(usage, extractUsageFromPayload(parsed));
  } catch {
    // 忽略非 JSON 事件，保持透传稳定
  }
}

/**
 * Codex SDK 上下文压缩处理器
 *
 * 处理 POST /api/proxy/v1/responses/compact 路由。
 * 当 Codex CLI 会话历史超过模型上下文窗口时，自动调用此端点将对话历史
 * 压缩为更短的摘要，避免触发 "compact_remote failed" 错误。
 *
 * 请求体格式与 /v1/responses 相同（含 model 字段），但上游返回的是
 * 压缩后的 JSON 响应（非流式）。
 */
export async function handleResponsesCompact(req: Request, res: Response): Promise<void> {
  const requestBody = req.body as Record<string, unknown>;
  const model = typeof requestBody.model === 'string' ? requestBody.model : '';
  const requestId = generateRequestId();
  const startTime = Date.now();

  if (!model) {
    await refundOnError(req);
    throw new ValidationError('responses/compact 请求缺少 model 字段');
  }

  const selection = selectChannel(model);
  if (!selection) {
    await refundOnError(req);
    throw new ProviderError(PERMANENT_PROVIDER_ERROR_MESSAGE, 409, { model });
  }

  const { channel } = selection;

  if (channel.provider === 'anthropic') {
    await refundOnError(req);
    throw new ProviderError(
      `模型 ${model} 被路由到 Anthropic 渠道 (${channel.id})，但 Responses compact API 仅支持 OpenAI 兼容渠道。`,
      409,
      { model, channelId: channel.id, provider: channel.provider },
    );
  }

  const upstreamUrl = `${normalizeBaseUrl(channel.baseUrl)}/v1/responses/compact`;
  const upstreamHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${channel.apiKey}`,
  };

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

  const usage: UsageInfo = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  try {
    const abortController = new AbortController();

    req.on('close', () => {
      abortController.abort();
    });

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    });

    if (!upstream.ok) {
      const bodyText = await upstream.text();
      throw createUpstreamHttpError(channel.provider, upstream.status, bodyText);
    }

    const payload = await upstream.json();
    mergeUsage(usage, extractUsageFromPayload(payload));

    const latencyMs = Date.now() - startTime;
    updateChannelHealth(channel.id, true, latencyMs);
    recordChannelRequest(channel.id, usage.inputTokens + usage.outputTokens);

    await safeSettle({
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      latencyMs,
      status: 'success',
    });

    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Channel-Id', channel.id);
    res.json(payload);
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    updateChannelHealth(channel.id, false);

    await safeSettle({
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      latencyMs,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    throw normalizeProxyRouteError(channel.provider, error);
  }
}

export async function handleResponses(req: Request, res: Response): Promise<void> {
  const requestBody = req.body as Record<string, unknown>;
  const model = typeof requestBody.model === 'string' ? requestBody.model : '';
  const stream = requestBody.stream === true;
  const requestId = generateRequestId();
  const startTime = Date.now();

  if (!model) {
    await refundOnError(req);
    throw new ValidationError('responses 请求缺少 model');
  }

  const selection = selectChannel(model);
  if (!selection) {
    await refundOnError(req);
    throw new ProviderError(PERMANENT_PROVIDER_ERROR_MESSAGE, 409, { model });
  }

  const { channel } = selection;

  // Responses API 仅支持 OpenAI 兼容渠道，防止 Codex 模型被误路由到 Anthropic
  if (channel.provider === 'anthropic') {
    await refundOnError(req);
    throw new ProviderError(
      `模型 ${model} 被路由到 Anthropic 渠道 (${channel.id})，但 Responses API 仅支持 OpenAI 兼容渠道。请检查渠道配置。`,
      409,
      { model, channelId: channel.id, provider: channel.provider },
    );
  }

  const upstreamUrl = buildResponsesUrl(channel.baseUrl);
  const upstreamHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${channel.apiKey}`,
  };

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

  const usage: UsageInfo = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  let connectTimeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const abortController = new AbortController();
    let clientClosed = false;

    // 30 秒连接超时：上游无任何响应时触发
    connectTimeout = setTimeout(() => {
      if (!clientClosed) {
        abortController.abort(new Error('上游 API 30 秒未响应，连接超时'));
      }
    }, 30_000);

    req.on('close', async () => {
      clientClosed = true;
      abortController.abort();
      const latencyMs = Date.now() - startTime;
      await safeSettle({
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        latencyMs,
        status: usage.outputTokens > 0 ? 'success' : 'error',
        errorMessage: usage.outputTokens > 0 ? undefined : 'Client disconnected',
      });
    });

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    });

    // 连接成功，清除连接超时计时器
    if (connectTimeout) {
      clearTimeout(connectTimeout);
      connectTimeout = null;
    }

    if (!upstream.ok) {
      const bodyText = await upstream.text();
      throw createUpstreamHttpError(channel.provider, upstream.status, bodyText);
    }

    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Channel-Id', channel.id);

    if (!stream) {
      const payload = await upstream.json();
      mergeUsage(usage, extractUsageFromPayload(payload));

      const latencyMs = Date.now() - startTime;
      updateChannelHealth(channel.id, true, latencyMs);
      recordChannelRequest(channel.id, usage.inputTokens + usage.outputTokens);

      await safeSettle({
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        latencyMs,
        status: 'success',
      });

      res.json(payload);
      return;
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (!upstream.body) {
      throw new ExternalServiceError(channel.provider, 'Responses stream body is empty');
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';

    while (!clientClosed) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      res.write(value);

      const chunkText = decoder.decode(value, { stream: true });
      sseBuffer += chunkText;

      let eventEnd = sseBuffer.indexOf('\n\n');
      while (eventEnd !== -1) {
        const eventBlock = sseBuffer.slice(0, eventEnd);
        sseBuffer = sseBuffer.slice(eventEnd + 2);
        extractUsageFromSSEEvent(eventBlock, usage);
        eventEnd = sseBuffer.indexOf('\n\n');
      }
    }

    const latencyMs = Date.now() - startTime;
    updateChannelHealth(channel.id, true, latencyMs);
    recordChannelRequest(channel.id, usage.inputTokens + usage.outputTokens);

    await safeSettle({
      model,
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
  } catch (error) {
    // catch 路径也需要清除连接超时计时器，避免 timer 泄漏
    if (connectTimeout) {
      clearTimeout(connectTimeout);
      connectTimeout = null;
    }
    const latencyMs = Date.now() - startTime;
    updateChannelHealth(channel.id, false);

    await safeSettle({
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      latencyMs,
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    throw normalizeProxyRouteError(channel.provider, error);
  }
}
