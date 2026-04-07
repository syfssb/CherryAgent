/**
 * 单元测试 — usageFromUnknown 函数 & handleResponses provider 校验
 *
 * 验证 Codex SDK Bug 修复:
 * 1. cached_tokens 嵌套结构解析
 * 2. Anthropic 渠道拦截
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── 提取 usageFromUnknown 进行纯函数测试 ─────────────────────
// 由于 usageFromUnknown 是模块内部函数，我们复制其逻辑进行独立测试
// 同时通过集成方式验证 handleResponses 中的 provider 校验

function toSafeInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

type UsageInfo = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

function usageFromUnknown(value: unknown): UsageInfo {
  const obj = value && typeof value === 'object' ? value as Record<string, unknown> : {};

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

describe('usageFromUnknown', () => {
  describe('Responses API 格式（嵌套 input_tokens_details.cached_tokens）', () => {
    it('正确解析 input_tokens_details.cached_tokens', () => {
      const usage = usageFromUnknown({
        input_tokens: 1000,
        output_tokens: 500,
        input_tokens_details: {
          cached_tokens: 200,
        },
      });

      expect(usage).toEqual({
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 200,
        cacheWriteTokens: 0,
      });
    });

    it('同时包含 cache_creation_input_tokens', () => {
      const usage = usageFromUnknown({
        input_tokens: 2000,
        output_tokens: 800,
        input_tokens_details: {
          cached_tokens: 500,
        },
        cache_creation_input_tokens: 300,
      });

      expect(usage).toEqual({
        inputTokens: 2000,
        outputTokens: 800,
        cacheReadTokens: 500,
        cacheWriteTokens: 300,
      });
    });
  });

  describe('Chat Completions API 格式（嵌套 prompt_tokens_details.cached_tokens）', () => {
    it('正确解析 prompt_tokens_details.cached_tokens', () => {
      const usage = usageFromUnknown({
        prompt_tokens: 1500,
        completion_tokens: 600,
        prompt_tokens_details: {
          cached_tokens: 400,
        },
      });

      expect(usage).toEqual({
        inputTokens: 1500,
        outputTokens: 600,
        cacheReadTokens: 400,
        cacheWriteTokens: 0,
      });
    });
  });

  describe('旧格式（扁平 cached_input_tokens）', () => {
    it('正确解析 cached_input_tokens', () => {
      const usage = usageFromUnknown({
        input_tokens: 800,
        output_tokens: 300,
        cached_input_tokens: 150,
      });

      expect(usage).toEqual({
        inputTokens: 800,
        outputTokens: 300,
        cacheReadTokens: 150,
        cacheWriteTokens: 0,
      });
    });

    it('正确解析 cache_read_input_tokens', () => {
      const usage = usageFromUnknown({
        input_tokens: 800,
        output_tokens: 300,
        cache_read_input_tokens: 100,
        cache_write_input_tokens: 50,
      });

      expect(usage).toEqual({
        inputTokens: 800,
        outputTokens: 300,
        cacheReadTokens: 100,
        cacheWriteTokens: 50,
      });
    });
  });

  describe('空对象 / null / undefined', () => {
    it('null 返回全零', () => {
      expect(usageFromUnknown(null)).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
    });

    it('undefined 返回全零', () => {
      expect(usageFromUnknown(undefined)).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
    });

    it('空对象返回全零', () => {
      expect(usageFromUnknown({})).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
    });

    it('非对象类型返回全零', () => {
      expect(usageFromUnknown('string')).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      expect(usageFromUnknown(42)).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
    });
  });

  describe('混合格式（嵌套优先于扁平）', () => {
    it('input_tokens_details.cached_tokens 优先于 cached_input_tokens', () => {
      const usage = usageFromUnknown({
        input_tokens: 1000,
        output_tokens: 500,
        input_tokens_details: {
          cached_tokens: 300,
        },
        cached_input_tokens: 100, // 应被忽略
      });

      expect(usage.cacheReadTokens).toBe(300);
    });

    it('prompt_tokens_details.cached_tokens 优先于 cache_read_input_tokens', () => {
      const usage = usageFromUnknown({
        prompt_tokens: 1000,
        completion_tokens: 500,
        prompt_tokens_details: {
          cached_tokens: 250,
        },
        cache_read_input_tokens: 50, // 应被忽略
      });

      expect(usage.cacheReadTokens).toBe(250);
    });

    it('input_tokens 优先于 prompt_tokens', () => {
      const usage = usageFromUnknown({
        input_tokens: 1000,
        prompt_tokens: 800, // 应被忽略
        output_tokens: 500,
        completion_tokens: 400, // 应被忽略
      });

      expect(usage.inputTokens).toBe(1000);
      expect(usage.outputTokens).toBe(500);
    });
  });

  describe('边界值', () => {
    it('负数被视为 0', () => {
      const usage = usageFromUnknown({
        input_tokens: -100,
        output_tokens: -50,
      });

      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
    });

    it('浮点数被截断', () => {
      const usage = usageFromUnknown({
        input_tokens: 100.9,
        output_tokens: 50.1,
      });

      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(50);
    });

    it('NaN 被视为 0', () => {
      const usage = usageFromUnknown({
        input_tokens: NaN,
        output_tokens: Infinity,
      });

      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
    });

    it('input_tokens_details 为非对象时回退到扁平字段', () => {
      const usage = usageFromUnknown({
        input_tokens: 1000,
        output_tokens: 500,
        input_tokens_details: 'invalid',
        cached_input_tokens: 200,
      });

      expect(usage.cacheReadTokens).toBe(200);
    });
  });
});

// ─── Provider 校验测试 ────────────────────────────────────────

describe('handleResponses — Anthropic 渠道拦截', () => {
  // 由于 handleResponses 依赖大量外部模块（Express, channel service, balance middleware），
  // 我们通过 mock 来验证 provider 校验逻辑

  let mockSelectChannel: ReturnType<typeof vi.fn>;
  let mockRefundOnError: ReturnType<typeof vi.fn>;
  let mockSettleCreditsAfterRequest: ReturnType<typeof vi.fn>;
  let mockUpdateChannelHealth: ReturnType<typeof vi.fn>;
  let mockRecordChannelRequest: ReturnType<typeof vi.fn>;
  let mockGenerateRequestId: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    mockSelectChannel = vi.fn();
    mockRefundOnError = vi.fn().mockResolvedValue(undefined);
    mockSettleCreditsAfterRequest = vi.fn().mockResolvedValue(undefined);
    mockUpdateChannelHealth = vi.fn();
    mockRecordChannelRequest = vi.fn();
    mockGenerateRequestId = vi.fn().mockReturnValue('req-test-123');
  });

  async function loadHandleResponses() {
    vi.doMock('../services/channel.js', () => ({
      selectChannel: mockSelectChannel,
      updateChannelHealth: mockUpdateChannelHealth,
      recordChannelRequest: mockRecordChannelRequest,
    }));
    vi.doMock('../middleware/balance-check.js', () => ({
      settleCreditsAfterRequest: mockSettleCreditsAfterRequest,
      refundOnError: mockRefundOnError,
    }));
    vi.doMock('../routes/proxy/utils.js', () => ({
      generateRequestId: mockGenerateRequestId,
    }));

    const mod = await import('../routes/proxy/responses.js');
    return mod.handleResponses;
  }

  it('Anthropic 渠道应抛出 ExternalServiceError', async () => {
    mockSelectChannel.mockReturnValue({
      channel: {
        id: 'ch-anthropic-1',
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-xxx',
      },
    });

    const handleResponses = await loadHandleResponses();

    const req = {
      body: { model: 'codex-mini-latest', stream: false },
      on: vi.fn(),
    } as any;
    const res = {
      setHeader: vi.fn(),
      json: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      writableEnded: false,
    } as any;

    await expect(handleResponses(req, res)).rejects.toThrow(
      /Anthropic.*Responses API 仅支持 OpenAI 兼容渠道/
    );
    expect(mockRefundOnError).toHaveBeenCalledWith(req);
  });

  it('OpenAI 渠道不应被拦截（正常请求流程）', async () => {
    mockSelectChannel.mockReturnValue({
      channel: {
        id: 'ch-openai-1',
        provider: 'openai',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-xxx',
      },
    });

    // mock global fetch 避免真实网络请求
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    try {
      const handleResponses = await loadHandleResponses();

      const req = {
        body: { model: 'codex-mini-latest', stream: false },
        on: vi.fn(),
      } as any;
      const res = {
        setHeader: vi.fn(),
        json: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        writableEnded: false,
      } as any;

      // 不应抛出 Anthropic 拦截错误
      await handleResponses(req, res);
      expect(res.json).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('缺少 model 应抛出错误', async () => {
    const handleResponses = await loadHandleResponses();

    const req = {
      body: { stream: false },
      on: vi.fn(),
    } as any;
    const res = {} as any;

    await expect(handleResponses(req, res)).rejects.toThrow(/缺少 model/);
    expect(mockRefundOnError).toHaveBeenCalledWith(req);
  });

  it('无可用渠道应抛出 ProviderError', async () => {
    mockSelectChannel.mockReturnValue(null);

    const handleResponses = await loadHandleResponses();

    const req = {
      body: { model: 'codex-mini-latest', stream: false },
      on: vi.fn(),
    } as any;
    const res = {} as any;

    await expect(handleResponses(req, res)).rejects.toMatchObject({
      name: 'ProviderError',
      statusCode: 409,
      message: '当前模型暂无可用渠道，请切换模型或稍后再试。',
    });
    expect(mockRefundOnError).toHaveBeenCalledWith(req);
  });
});
