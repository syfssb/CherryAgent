import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetModelAndEnv,
  mockLlmComplete,
  mockGetProxyConfig,
} = vi.hoisted(() => ({
  mockGetModelAndEnv: vi.fn(),
  mockLlmComplete: vi.fn(),
  mockGetProxyConfig: vi.fn(),
}));

vi.mock('../libs/llm-service.js', () => ({
  getModelAndEnv: mockGetModelAndEnv,
  llmComplete: mockLlmComplete,
}));

vi.mock('../libs/proxy-client.js', () => ({
  getProxyConfig: mockGetProxyConfig,
}));

import { generateTitle } from '../libs/title-generator.js';

describe('title-generator', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetModelAndEnv.mockReset();
    mockLlmComplete.mockReset();
    mockGetProxyConfig.mockReset();

    mockGetModelAndEnv.mockResolvedValue({
      config: {
        isProxy: true,
        apiKey: 'proxy-token',
        baseURL: 'https://example.com/proxy',
        model: 'claude-sonnet-4-6',
      },
      model: 'claude-sonnet-4-6',
      env: {},
    });

    mockGetProxyConfig.mockReturnValue({
      baseURL: 'https://example.com/api',
      apiKey: 'proxy-token',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('proxy 标题生成失败时应返回本地 fallback 标题且不回退 llmComplete', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: { toolModelId: 'gpt-4o-mini' } }),
      } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
      } as any);

    const result = await generateTitle([
      { type: 'user_prompt', prompt: 'hi' } as any,
    ]);

    expect(result.success).toBe(true);
    expect(result.title).toBe('hi');
    expect(mockLlmComplete).not.toHaveBeenCalled();
  });
});
