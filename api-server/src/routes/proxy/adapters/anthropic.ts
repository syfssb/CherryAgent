/**
 * Anthropic Provider 适配器
 *
 * 使用 fetch 直接透传请求体到上游，避免 SDK 重新构建请求导致：
 * 1. tools/tool_choice 等字段丢失
 * 2. SDK 添加的 header 被中转站拦截（403）
 */

import type { ChannelConfig } from '../../../services/channel.js';
import type {
  ProviderAdapter,
  ProviderCapabilities,
  UnifiedCompletionParams,
  CompletionResult,
  StreamChunk,
  UsageInfo,
} from '../types.js';
import { createUpstreamHttpError } from '../upstream-error.js';

function getBaseUrl(channel: ChannelConfig): string {
  let baseURL = channel.baseUrl || 'https://api.anthropic.com';
  // 去掉末尾的 /v1 避免重复
  baseURL = baseURL.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
  return baseURL;
}

/**
 * 清洗请求体中的 tools：
 * Anthropic API 不允许同一个 tool 同时包含 allowed_domains 和 blocked_domains。
 * 当两者都存在时：优先保留 allowed_domains（若非空），否则两个都移除。
 */
function sanitizeRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(body.tools)) return body;

  const sanitizedTools = body.tools.map((tool: unknown) => {
    if (!tool || typeof tool !== 'object') return tool;
    const t = tool as Record<string, unknown>;

    const hasAllowed = 'allowed_domains' in t;
    const hasBlocked = 'blocked_domains' in t;
    if (!hasAllowed || !hasBlocked) return t;

    // 两个都存在：allowed_domains 非空则保留它，否则两者都去掉
    const allowed = t.allowed_domains;
    const { blocked_domains: _b, ...withoutBlocked } = t;
    if (Array.isArray(allowed) && allowed.length === 0) {
      const { allowed_domains: _a, ...withoutBoth } = withoutBlocked;
      return withoutBoth;
    }
    return withoutBlocked;
  });

  return { ...body, tools: sanitizedTools };
}

/**
 * count_tokens：预估请求的 token 数量
 * 不消耗 token，直接透传到上游 Anthropic API
 */
export async function countTokens(
  channel: ChannelConfig,
  body: Record<string, unknown>,
): Promise<{ input_tokens: number }> {
  const baseUrl = getBaseUrl(channel);
  const url = `${baseUrl}/v1/messages/count_tokens`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': channel.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw createUpstreamHttpError(channel.provider, response.status, errorText);
  }

  return response.json() as Promise<{ input_tokens: number }>;
}

/**
 * 创建原始流式请求，返回 fetch Response（用于透传 SSE）
 */
export async function createRawStream(
  channel: ChannelConfig,
  params: UnifiedCompletionParams,
): Promise<Response> {
  const baseUrl = getBaseUrl(channel);
  const url = `${baseUrl}/v1/messages`;

  const body = params.rawBody
    ? sanitizeRequestBody({ ...params.rawBody, stream: true })
    : buildFallbackBody(params, true);

  console.info(`[anthropic-adapter] createRawStream:`, {
    model: params.model,
    channelId: channel.id,
    url,
  });

  // 流式请求：仅做连接超时（30 秒内必须收到 HTTP 响应头），
  // 连接成功后取消超时，不限制流的总时长
  const ac = new AbortController();
  const connectTimer = setTimeout(() => ac.abort(new Error('上游 API 30 秒未响应，连接超时')), 30_000);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': channel.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: ac.signal,
  });

  clearTimeout(connectTimer);

  if (!response.ok) {
    const errorText = await response.text();
    throw createUpstreamHttpError(channel.provider, response.status, errorText);
  }

  return response;
}

export const anthropicAdapter: ProviderAdapter = {
  name: 'anthropic',

  modelPatterns: [
    /^claude-3-opus/,
    /^claude-3-sonnet/,
    /^claude-3-haiku/,
    /^claude-3\.5-sonnet/,
    /^claude-3-5-sonnet/,
    /^claude-3-5-haiku/,
    /^claude-sonnet-4/,
    /^claude-opus-4/,
    /^claude-haiku-4/,
  ],

  capabilities: {
    streaming: true,
    tools: true,
    vision: true,
  } satisfies ProviderCapabilities,

  matchesModel(modelId: string): boolean {
    const normalized = modelId.toLowerCase();
    return this.modelPatterns.some((pattern) => pattern.test(normalized));
  },

  async createCompletion(
    channel: ChannelConfig,
    params: UnifiedCompletionParams,
  ): Promise<CompletionResult> {
    const baseUrl = getBaseUrl(channel);
    const url = `${baseUrl}/v1/messages`;

    // 优先透传原始请求体；如果没有 rawBody 则从 params 构建
    const body = params.rawBody
      ? sanitizeRequestBody({ ...params.rawBody, stream: false })
      : buildFallbackBody(params, false);

    console.info(`[anthropic-adapter] createCompletion (fetch):`, {
      model: params.model,
      channelId: channel.id,
      url,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': channel.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1_200_000), // 非流式 20 分钟总超时
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw createUpstreamHttpError(channel.provider, response.status, errorText);
    }

    const data = await response.json() as {
      id: string;
      model: string;
      content: Array<{ type: string; text?: string }>;
      stop_reason: string | null;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };

    const textContent = (data.content || [])
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text!)
      .join('');

    return {
      id: data.id,
      model: data.model,
      content: textContent,
      stopReason: data.stop_reason ?? 'end_turn',
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: data.usage?.cache_creation_input_tokens ?? 0,
      },
      rawResponse: data,
    };
  },

  async createStream(
    channel: ChannelConfig,
    params: UnifiedCompletionParams,
  ): Promise<AsyncIterable<StreamChunk>> {
    const baseUrl = getBaseUrl(channel);
    const url = `${baseUrl}/v1/messages`;

    // 优先透传原始请求体；如果没有 rawBody 则从 params 构建
    const body = params.rawBody
      ? sanitizeRequestBody({ ...params.rawBody, stream: true })
      : buildFallbackBody(params, true);

    console.info(`[anthropic-adapter] createStream (fetch):`, {
      model: params.model,
      channelId: channel.id,
      url,
    });

    // 流式请求：仅做连接超时，连接成功后取消，不限制流的总时长
    const ac = new AbortController();
    const connectTimer = setTimeout(() => ac.abort(new Error('上游 API 30 秒未响应，连接超时')), 30_000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': channel.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });

    clearTimeout(connectTimer);

    if (!response.ok) {
      const errorText = await response.text();
      throw createUpstreamHttpError(channel.provider, response.status, errorText);
    }

    return parseSSEStream(response);
  },
};

/**
 * rawBody 不存在时的 fallback：从 UnifiedCompletionParams 构建请求体
 */
function buildFallbackBody(params: UnifiedCompletionParams, stream: boolean): Record<string, unknown> {
  return {
    model: params.model,
    messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: params.maxTokens,
    stream,
    ...(params.system && { system: params.system }),
    ...(params.temperature !== undefined && { temperature: params.temperature }),
    ...(params.topP !== undefined && { top_p: params.topP }),
    ...(params.topK !== undefined && { top_k: params.topK }),
    ...(params.stopSequences && { stop_sequences: params.stopSequences }),
  };
}

/**
 * 解析 SSE 流，转为 AsyncIterable<StreamChunk>
 */
function parseSSEStream(response: Response): AsyncIterable<StreamChunk> {
  return {
    [Symbol.asyncIterator]() {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 };
      let done = false;

      return {
        async next(): Promise<IteratorResult<StreamChunk>> {
          while (!done) {
            // 尝试从 buffer 中提取完整的 SSE 事件
            const eventEnd = buffer.indexOf('\n\n');
            if (eventEnd !== -1) {
              const eventStr = buffer.slice(0, eventEnd);
              buffer = buffer.slice(eventEnd + 2);

              const chunk = parseSSEEvent(eventStr, usage);
              if (chunk) {
                if (chunk.type === 'usage') {
                  usage = chunk.usage;
                }
                return { value: chunk, done: false };
              }
              continue;
            }

            // 读取更多数据
            const { value, done: readerDone } = await reader.read();
            if (readerDone) {
              done = true;
              // 处理 buffer 中剩余的数据
              if (buffer.trim()) {
                const chunk = parseSSEEvent(buffer.trim(), usage);
                if (chunk) {
                  buffer = '';
                  return { value: chunk, done: false };
                }
              }
              return { value: { type: 'done' } as StreamChunk, done: false };
            }

            buffer += decoder.decode(value, { stream: true });
          }

          return { value: undefined as unknown as StreamChunk, done: true };
        },

        async return(): Promise<IteratorResult<StreamChunk>> {
          reader.cancel().catch(() => {});
          done = true;
          return { value: undefined as unknown as StreamChunk, done: true };
        },
      };
    },
  };
}

/**
 * 解析单个 SSE 事件
 */
function parseSSEEvent(eventStr: string, currentUsage: UsageInfo): StreamChunk | null {
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

  if (!data || data === '[DONE]') {
    return null;
  }

  try {
    const parsed = JSON.parse(data);

    switch (eventType) {
      case 'message_start': {
        const msg = parsed.message;
        if (msg?.usage) {
          return {
            type: 'usage',
            usage: {
              inputTokens: msg.usage.input_tokens ?? 0,
              outputTokens: msg.usage.output_tokens ?? 0,
              cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
              cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
            },
          };
        }
        return null;
      }

      case 'content_block_start': {
        const block = parsed.content_block;
        return {
          type: 'content_block_start',
          index: parsed.index ?? 0,
          contentBlock: block,
        };
      }

      case 'content_block_delta': {
        const delta = parsed.delta;
        if (delta?.type === 'text_delta') {
          return { type: 'text', text: delta.text ?? '' };
        }
        if (delta?.type === 'thinking_delta') {
          return { type: 'thinking', thinking: delta.thinking ?? '' };
        }
        if (delta?.type === 'signature_delta') {
          return { type: 'signature', signature: delta.signature ?? '' };
        }
        if (delta?.type === 'input_json_delta') {
          // tool_use 的 input 增量，作为 text 透传
          return { type: 'text', text: delta.partial_json ?? '' };
        }
        return null;
      }

      case 'content_block_stop': {
        return {
          type: 'content_block_stop',
          index: parsed.index ?? 0,
        };
      }

      case 'message_delta': {
        if (parsed.usage) {
          return {
            type: 'usage',
            usage: {
              inputTokens: currentUsage.inputTokens,
              outputTokens: parsed.usage.output_tokens ?? currentUsage.outputTokens,
              cacheReadTokens: currentUsage.cacheReadTokens,
              cacheWriteTokens: currentUsage.cacheWriteTokens,
            },
          };
        }
        return null;
      }

      case 'message_stop': {
        return { type: 'done' };
      }

      case 'error': {
        return { type: 'error', error: parsed.error?.message ?? 'Unknown error' };
      }

      case 'ping':
        return null;

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * 清除客户端缓存（保留接口兼容）
 */
export function clearAnthropicClientCache(): void {
  // fetch 模式无需缓存
}
