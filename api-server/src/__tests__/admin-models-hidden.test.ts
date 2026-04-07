import 'express-async-errors';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/error-handler.js';

const { mockPoolQuery, mockClearModelPriceCache } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockClearModelPriceCache: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

vi.mock('../middleware/admin-auth.js', () => ({
  authenticateAdminAsync: (
    req: { adminId?: string; adminRole?: string; adminPermissions?: string[] },
    _res: unknown,
    next: () => void
  ) => {
    req.adminId = 'admin-1';
    req.adminRole = 'super_admin';
    req.adminPermissions = ['*'];
    next();
  },
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../middleware/admin-logger.js', () => ({
  auditLog: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../services/billing.js', () => ({
  billingService: {
    clearModelPriceCache: mockClearModelPriceCache,
  },
}));

import { adminModelsRouter } from '../routes/admin/models.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/models', adminModelsRouter);
  app.use(errorHandler);
  return app;
}

describe('后台模型隐藏能力', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/admin/models 应返回 isHidden 字段', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'hidden-model',
            display_name: 'Hidden Model',
            provider: 'openai',
            input_price_per_mtok: 0,
            output_price_per_mtok: 0,
            cache_read_price_per_mtok: 0,
            cache_write_price_per_mtok: 0,
            input_credits_per_mtok: '1',
            output_credits_per_mtok: '2',
            cache_read_credits_per_mtok: '0',
            cache_write_credits_per_mtok: '0',
            long_context_input_price: 0,
            long_context_output_price: 0,
            long_context_threshold: 0,
            max_tokens: 4096,
            max_context_length: 128000,
            is_enabled: true,
            is_hidden: true,
            sort_order: 0,
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            updated_at: new Date('2026-01-02T00:00:00.000Z'),
            description: null,
            features: [],
            use_cases: [],
            tags: [],
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({
        rows: [{ total_models: '1', enabled_models: '1', providers: '1' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app).get('/api/admin/models');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.models[0]).toMatchObject({
      id: 'hidden-model',
      isEnabled: true,
      isHidden: true,
    });

    const [sql] = mockPoolQuery.mock.calls[0] as [string];
    expect(sql).toContain(`AS is_hidden`);
  });

  it('PATCH /api/admin/models/:id 应支持更新 isHidden', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'hidden-model' }] })
      .mockResolvedValueOnce({ rows: [{ column_name: 'is_hidden' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .patch('/api/admin/models/hidden-model')
      .send({ isHidden: true });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.message).toBe('模型配置已更新');

    const updateCall = mockPoolQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE models SET')
    ) as [string, unknown[]] | undefined;

    expect(updateCall).toBeDefined();
    expect(updateCall?.[0]).toContain('is_hidden = $1');
    expect(updateCall?.[1]).toEqual([true, 'hidden-model']);
    expect(mockClearModelPriceCache).toHaveBeenCalledTimes(1);
  });
});
