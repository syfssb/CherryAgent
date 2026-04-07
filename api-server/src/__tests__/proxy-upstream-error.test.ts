import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '../utils/response.js';

async function importUpstreamErrorUtils() {
  return import('../routes/proxy/upstream-error.js');
}

describe('proxy upstream error normalization', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('503 + model_not_found 应归类为 409 ProviderError', async () => {
    const { createUpstreamHttpError, normalizeProxyRouteError, PERMANENT_PROVIDER_ERROR_MESSAGE } = await importUpstreamErrorUtils();

    const error = createUpstreamHttpError(
      'anthropic',
      503,
      JSON.stringify({
        error: {
          code: 'model_not_found',
          message: 'No available channel for model claude-sonnet-4-6 under group svip',
          type: 'new_api_error',
        },
      }),
    );

    const normalized = normalizeProxyRouteError('anthropic', error);

    expect(normalized.name).toBe('ProviderError');
    expect((normalized as any).statusCode).toBe(409);
    expect((normalized as any).code).toBe(ErrorCodes.PROVIDER_ERROR);
    expect(normalized.message).toBe(PERMANENT_PROVIDER_ERROR_MESSAGE);
  });

  it('上游原生 404 应保留为 404 ProviderError', async () => {
    const { createUpstreamHttpError, normalizeProxyRouteError } = await importUpstreamErrorUtils();

    const error = createUpstreamHttpError(
      'openai',
      404,
      JSON.stringify({
        error: {
          code: 'not_found',
          message: 'The requested resource was not found',
        },
      }),
    );

    const normalized = normalizeProxyRouteError('openai', error);

    expect(normalized.name).toBe('ProviderError');
    expect((normalized as any).statusCode).toBe(404);
    expect((normalized as any).code).toBe(ErrorCodes.PROVIDER_ERROR);
    expect(normalized.message).toContain('The requested resource was not found');
  });

  it('真实 503 应保留 503 ExternalServiceError', async () => {
    const { createUpstreamHttpError, normalizeProxyRouteError } = await importUpstreamErrorUtils();

    const error = createUpstreamHttpError(
      'openai',
      503,
      JSON.stringify({
        error: {
          code: 'server_error',
          message: 'upstream overloaded',
        },
      }),
    );

    const normalized = normalizeProxyRouteError('openai', error);

    expect(normalized.name).toBe('ExternalServiceError');
    expect((normalized as any).statusCode).toBe(503);
    expect((normalized as any).code).toBe(ErrorCodes.EXTERNAL_SERVICE_ERROR);
    expect(normalized.message).toContain('upstream overloaded');
  });

  it('本地没有可用渠道错误应归类为 409 ProviderError', async () => {
    const { normalizeProxyRouteError, PERMANENT_PROVIDER_ERROR_MESSAGE } = await importUpstreamErrorUtils();

    const normalized = normalizeProxyRouteError(
      'proxy',
      new Error('没有可用的渠道支持模型: claude-sonnet-4-6'),
    );

    expect(normalized.name).toBe('ProviderError');
    expect((normalized as any).statusCode).toBe(409);
    expect((normalized as any).code).toBe(ErrorCodes.PROVIDER_ERROR);
    expect(normalized.message).toBe(PERMANENT_PROVIDER_ERROR_MESSAGE);
  });
});

describe('proxy route handlers should apply unified permanent error mapping', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('handleClaudeMessages 遇到 model_not_found 时应快速失败为 409', async () => {
    const { createUpstreamHttpError, PERMANENT_PROVIDER_ERROR_MESSAGE } = await importUpstreamErrorUtils();
    const mockSelectChannel = vi.fn().mockReturnValue({
      channel: {
        id: 'ch-anthropic-1',
        provider: 'anthropic',
        baseUrl: 'https://upstream.example.com',
        apiKey: 'sk-test',
      },
      reason: 'available',
    });
    const mockAdapter = {
      name: 'anthropic',
      createCompletion: vi.fn().mockRejectedValue(
        createUpstreamHttpError(
          'anthropic',
          503,
          JSON.stringify({ error: { code: 'model_not_found', message: 'No available channel for model claude-sonnet-4-6 under group svip' } }),
        ),
      ),
      createStream: vi.fn(),
    };

    vi.doMock('../services/channel.js', () => ({
      selectChannel: mockSelectChannel,
      updateChannelHealth: vi.fn(),
      recordChannelRequest: vi.fn(),
      sanitizeChannel: (channel: unknown) => channel,
    }));
    vi.doMock('../middleware/balance-check.js', () => ({
      settleCreditsAfterRequest: vi.fn().mockResolvedValue(undefined),
      refundOnError: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('../services/billing.js', () => ({ billingService: { calculateCredits: vi.fn() } }));
    vi.doMock('../routes/proxy/registry.js', () => ({
      providerRegistry: {
        getAdapter: vi.fn().mockReturnValue(mockAdapter),
        getAdapterForModel: vi.fn().mockReturnValue(mockAdapter),
      },
    }));
    vi.doMock('../routes/proxy/utils.js', () => ({ generateRequestId: vi.fn().mockReturnValue('req-test') }));
    vi.doMock('../routes/proxy/adapters/anthropic.js', async () => {
      const actual = await vi.importActual<object>('../routes/proxy/adapters/anthropic.js');
      return { ...actual, createRawStream: vi.fn() };
    });

    const { handleClaudeMessages } = await import('../routes/proxy/claude-handler.js');

    const req = {
      body: {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 256,
        stream: false,
      },
    } as any;
    const res = { json: vi.fn(), setHeader: vi.fn(), write: vi.fn(), end: vi.fn(), writableEnded: false } as any;

    await expect(handleClaudeMessages(req, res)).rejects.toMatchObject({
      name: 'ProviderError',
      statusCode: 409,
      message: PERMANENT_PROVIDER_ERROR_MESSAGE,
    });
  });

  it('handleChatCompletions 遇到 model_not_found 时应快速失败为 409', async () => {
    const { createUpstreamHttpError, PERMANENT_PROVIDER_ERROR_MESSAGE } = await importUpstreamErrorUtils();
    const mockSelectChannel = vi.fn().mockReturnValue({
      channel: {
        id: 'ch-openai-1',
        provider: 'openai',
        baseUrl: 'https://upstream.example.com',
        apiKey: 'sk-test',
        name: 'OpenAI',
      },
      reason: 'available',
    });
    const mockAdapter = {
      createCompletion: vi.fn().mockRejectedValue(
        createUpstreamHttpError(
          'openai',
          503,
          JSON.stringify({ error: { code: 'model_not_found', message: 'No available channel for model gpt-5.4 under group svip' } }),
        ),
      ),
      createStream: vi.fn(),
    };

    vi.doMock('../services/channel.js', () => ({
      selectChannel: mockSelectChannel,
      updateChannelHealth: vi.fn(),
      recordChannelRequest: vi.fn(),
    }));
    vi.doMock('../middleware/balance-check.js', () => ({
      settleCreditsAfterRequest: vi.fn().mockResolvedValue(undefined),
      refundOnError: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('../services/billing.js', () => ({ billingService: { calculateCredits: vi.fn() } }));
    vi.doMock('../routes/proxy/registry.js', () => ({
      providerRegistry: {
        getAdapter: vi.fn().mockReturnValue(mockAdapter),
        getAdapterForModel: vi.fn().mockReturnValue(mockAdapter),
      },
    }));
    vi.doMock('../routes/proxy/utils.js', async () => {
      const actual = await vi.importActual<object>('../routes/proxy/utils.js');
      return { ...actual, generateRequestId: vi.fn().mockReturnValue('req-test') };
    });

    const { handleChatCompletions } = await import('../routes/proxy/chat-completions.js');

    const req = {
      body: {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 256,
        stream: false,
      },
    } as any;
    const res = { json: vi.fn(), setHeader: vi.fn(), write: vi.fn(), end: vi.fn(), writableEnded: false } as any;

    await expect(handleChatCompletions(req, res)).rejects.toMatchObject({
      name: 'ProviderError',
      statusCode: 409,
      message: PERMANENT_PROVIDER_ERROR_MESSAGE,
    });
  });

  it('handleResponses 遇到 model_not_found 时应快速失败为 409', async () => {
    const { PERMANENT_PROVIDER_ERROR_MESSAGE } = await importUpstreamErrorUtils();
    const mockSelectChannel = vi.fn().mockReturnValue({
      channel: {
        id: 'ch-openai-1',
        provider: 'openai',
        baseUrl: 'https://upstream.example.com',
        apiKey: 'sk-test',
      },
      reason: 'available',
    });

    vi.doMock('../services/channel.js', () => ({
      selectChannel: mockSelectChannel,
      updateChannelHealth: vi.fn(),
      recordChannelRequest: vi.fn(),
    }));
    vi.doMock('../middleware/balance-check.js', () => ({
      settleCreditsAfterRequest: vi.fn().mockResolvedValue(undefined),
      refundOnError: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('../routes/proxy/utils.js', () => ({ generateRequestId: vi.fn().mockReturnValue('req-test') }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({
        error: {
          code: 'model_not_found',
          message: 'No available channel for model gpt-5.4 under group svip',
        },
      }),
    } as Response);

    try {
      const { handleResponses } = await import('../routes/proxy/responses.js');
      const req = { body: { model: 'gpt-5.4', stream: false }, on: vi.fn() } as any;
      const res = { json: vi.fn(), setHeader: vi.fn(), write: vi.fn(), end: vi.fn(), writableEnded: false } as any;

      await expect(handleResponses(req, res)).rejects.toMatchObject({
        name: 'ProviderError',
        statusCode: 409,
        message: PERMANENT_PROVIDER_ERROR_MESSAGE,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
