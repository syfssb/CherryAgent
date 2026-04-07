import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingService } from '../handler.js';

const getStoredCredentials = vi.fn();

const deps = {
  authProvider: {
    getAccessToken: vi.fn(async () => 'token'),
    getStoredCredentials,
  },
  shellAdapter: {
    openExternal: vi.fn(async () => undefined),
    showItemInFolder: vi.fn(),
  },
  dialogAdapter: {
    showSaveDialog: vi.fn(async () => ({ canceled: true })),
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showMessageBox: vi.fn(async () => ({ response: 0 })),
  },
  apiBaseUrl: 'http://billing.test',
};

describe('BillingService.getUsageHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoredCredentials.mockResolvedValue({ accessToken: 'token' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('应优先使用后端返回的真实余额积分消耗，避免把 0.0052 显示成 0.01', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{
          id: 'usage_001',
          model: 'claude-haiku-4-5-20251001',
          provider: 'anthropic',
          inputTokens: 912,
          outputTokens: 4,
          totalTokens: 916,
          cost: '0.0652',
          creditsConsumed: '0.0652',
          quotaUsed: '0.06',
          balanceCreditsConsumed: '0.00',
          status: 'success',
          latencyMs: 123,
          createdAt: '2026-03-06T08:57:24.000Z',
        }],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      }),
    })));

    const service = new BillingService(deps);
    const result = await service.getUsageHistory();

    expect(result.success).toBe(true);
    expect(result.data?.records).toHaveLength(1);
    expect(result.data?.records[0]?.cost).toBe(7);
    expect(result.data?.records[0]?.quotaUsed).toBe(6);
    expect(result.data?.records[0]?.balanceCreditsConsumed).toBe(0);
  });
});
