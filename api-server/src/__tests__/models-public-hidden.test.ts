import 'express-async-errors';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/error-handler.js';

const { mockPoolQuery, mockGetSystemConfig } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockGetSystemConfig: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

vi.mock('../services/config.js', () => ({
  getSystemConfig: (...args: unknown[]) => mockGetSystemConfig(...args),
}));

import { modelsPublicRouter } from '../routes/models-public.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/models', modelsPublicRouter);
  app.use(errorHandler);
  return app;
}

describe('公开模型列表隐藏能力', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSystemConfig.mockResolvedValue('tool-model');
  });

  it('GET /api/models 应只返回启用且未隐藏的模型', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'claude-sonnet-4-5',
          display_name: 'Claude Sonnet 4.5',
          provider: 'anthropic',
          input_credits_per_mtok: '1.2',
          output_credits_per_mtok: '6.8',
          cache_read_credits_per_mtok: '0.3',
          cache_write_credits_per_mtok: '1.1',
          input_price_per_mtok: '0',
          output_price_per_mtok: '0',
          cache_read_price_per_mtok: '0',
          cache_write_price_per_mtok: '0',
          max_tokens: 8192,
          max_context_length: 200000,
          sort_order: 1,
          description: '适合复杂推理',
          features: ['长上下文'],
          use_cases: ['代码生成'],
          tags: ['推荐'],
        },
      ],
    });

    const response = await request(app).get('/api/models');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.models).toHaveLength(1);
    expect(response.body.data.models[0]).toMatchObject({
      id: 'claude-sonnet-4-5',
      displayName: 'Claude Sonnet 4.5',
      provider: 'anthropic',
      description: '适合复杂推理',
      features: ['长上下文'],
      useCases: ['代码生成'],
      tags: ['推荐'],
    });

    const [sql, params] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('m.is_enabled = true');
    expect(sql).toContain(`'is_hidden'`);
    expect(params).toEqual(['tool-model']);
  });

  it('GET /api/models/:id 不应暴露隐藏模型详情', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const response = await request(app).get('/api/models/hidden-model');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error?.message).toBe('模型不存在');

    const [sql, params] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(`'is_hidden'`);
    expect(params).toEqual(['hidden-model', 'tool-model']);
  });
});
