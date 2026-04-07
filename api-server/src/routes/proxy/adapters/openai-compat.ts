/**
 * OpenAI 兼容 Provider 适配器
 *
 * 通过标准 OpenAI Chat Completions API 调用上游服务。
 * 适用于 OpenAI 官方、以及所有兼容 OpenAI 格式的第三方服务。
 */

import type { ChannelConfig } from '../../../services/channel.js';
import type {
  ProviderAdapter,
  ProviderCapabilities,
  UnifiedCompletionParams,
  CompletionResult,
  StreamChunk,
} from '../types.js';
import { createUpstreamHttpError } from '../upstream-error.js';

/**
 * 将 UnifiedCompletionParams 转为 OpenAI Chat Completions 请求体
 */
function buildOpenAIRequestBody(params: UnifiedCompletionParams): Record<string, unknown> {
  const messages: Array<{ role: string; content: string }> = [];

  // system message
  if (params.system) {
    messages.push({ role: 'system', content: params.system });
  }

  // user/assistant messages
  for (const msg of params.messages) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : msg.content
          .filter((b) => b.type === 'text' && b.text)
          .map((b) => b.text!)
          .join('');

    messages.push({ role: msg.role, content });
  }

  return {
    model: params.model,
    messages,
    max_tokens: params.maxTokens,
    ...(params.temperature !== undefined && { temperature: params.temperature }),
    ...(params.topP !== undefined && { top_p: params.topP }),
    ...(params.stopSequences && { stop: params.stopSequences }),
    stream: params.stream,
  };
}

/**
 * 通用 fetch 调用 OpenAI 兼容 API
 * 流式请求使用连接超时（连接成功后取消），非流式使用总超时
 */
async function callOpenAI(
  channel: ChannelConfig,
  body: Record<string, unknown>,
): Promise<Response> {
  const baseUrl = channel.baseUrl.replace(/\/+$/, '').replace(/\/v1\/?$/, '');
  const url = `${baseUrl}/v1/chat/completions`;
  const isStream = !!body.stream;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${channel.apiKey}`,
  };

  let response: Response;

  if (isStream) {
    // 流式请求：仅做连接超时，连接成功后取消，不限制流的总时长
    const ac = new AbortController();
    const connectTimer = setTimeout(() => ac.abort(new Error('上游 API 30 秒未响应，连接超时')), 30_000);

    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });

    clearTimeout(connectTimer);
  } else {
    // 非流式请求：20 秒总超时
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1_200_000), // 非流式 20 分钟总超时
    });
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw createUpstreamHttpError(channel.provider, response.status, errorText);
  }

  return response;
}

export const openaiCompatAdapter: ProviderAdapter = {
  name: 'openai',

  modelPatterns: [
    /^gpt-4/,
    /^gpt-3\.5-turbo/,
    /^o1/,
    /^o3/,
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
    const body = buildOpenAIRequestBody({ ...params, stream: false });
    const response = await callOpenAI(channel, body);
    const data = await response.json() as OpenAIChatCompletionResponse;

    const choice = data.choices?.[0];

    return {
      id: data.id ?? `chatcmpl-${Date.now()}`,
      model: data.model ?? params.model,
      content: choice?.message?.content ?? '',
      stopReason: choice?.finish_reason ?? 'stop',
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        cacheReadTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      },
      rawResponse: data,
    };
  },

  async createStream(
    channel: ChannelConfig,
    params: UnifiedCompletionParams,
  ): Promise<AsyncIterable<StreamChunk>> {
    const body = buildOpenAIRequestBody({ ...params, stream: true });
    const response = await callOpenAI(channel, body);

    return parseSSEStream(response);
  },
};

/**
 * 解析 OpenAI SSE 流为 AsyncIterable<StreamChunk>
 */
function parseSSEStream(response: Response): AsyncIterable<StreamChunk> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();

  return {
    [Symbol.asyncIterator]() {
      let buffer = '';
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheReadTokens = 0;
      let streamDone = false;
      /** 当收到 [DONE] 后，先发 usage 再发 done，用队列缓冲 */
      const pending: StreamChunk[] = [];

      return {
        async next(): Promise<IteratorResult<StreamChunk>> {
          // 先消费待发送队列
          if (pending.length > 0) {
            return { value: pending.shift()!, done: false };
          }

          if (streamDone) {
            return { value: undefined as unknown as StreamChunk, done: true };
          }

          while (true) {
            // 先处理 buffer 中已有的完整行
            const lineEnd = buffer.indexOf('\n');
            if (lineEnd !== -1) {
              const line = buffer.slice(0, lineEnd).trim();
              buffer = buffer.slice(lineEnd + 1);

              if (!line || !line.startsWith('data: ')) {
                continue;
              }

              const payload = line.slice(6).trim();

              if (payload === '[DONE]') {
                streamDone = true;
                // 先返回 usage，将 done 放入待发送队列
                pending.push({ type: 'done' });
                return {
                  value: { type: 'usage', usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, cacheReadTokens: totalCacheReadTokens } },
                  done: false,
                };
              }

              try {
                const chunk = JSON.parse(payload) as OpenAIStreamChunk;

                // 收集 usage
                if (chunk.usage) {
                  totalInputTokens = chunk.usage.prompt_tokens ?? totalInputTokens;
                  totalOutputTokens = chunk.usage.completion_tokens ?? totalOutputTokens;
                  totalCacheReadTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? totalCacheReadTokens;
                }

                const delta = chunk.choices?.[0]?.delta;
                if (delta?.content) {
                  return { value: { type: 'text', text: delta.content }, done: false };
                }

                const finishReason = chunk.choices?.[0]?.finish_reason;
                if (finishReason) {
                  // 还有 [DONE] 要处理，先不结束
                  continue;
                }

                // 其他事件跳过
                continue;
              } catch {
                continue;
              }
            }

            // buffer 中没有完整行，读取更多数据
            const { value, done } = await reader.read();
            if (done) {
              streamDone = true;
              // 流意外结束（没有收到 [DONE]），仍然发送 usage + done
              pending.push({ type: 'done' });
              return {
                value: { type: 'usage', usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens } },
                done: false,
              };
            }

            buffer += decoder.decode(value, { stream: true });
          }
        },

        async return(): Promise<IteratorResult<StreamChunk>> {
          reader.cancel().catch(() => {});
          streamDone = true;
          return { value: undefined as unknown as StreamChunk, done: true };
        },
      };
    },
  };
}

// ---- OpenAI 响应类型 ----

interface OpenAIChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    index: number;
    message?: { role: string; content: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

interface OpenAIStreamChunk {
  id?: string;
  choices?: Array<{
    index: number;
    delta?: { role?: string; content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}
