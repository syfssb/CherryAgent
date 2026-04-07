import { Router, type Request, type Response } from 'express';
import { successResponse } from '../utils/response.js';
import { pool } from '../db/index.js';
import { NotFoundError } from '../utils/errors.js';
import { getSystemConfig } from '../services/config.js';

export const modelsPublicRouter = Router();
const MODEL_HIDDEN_CLAUSE = `COALESCE((to_jsonb(m) ->> 'is_hidden')::boolean, false) = false`;

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * 获取可用模型列表（含积分价格）
 * GET /api/models
 */
modelsPublicRouter.get(
  '/',
  async (_req: Request, res: Response) => {
    const toolModelId = await getSystemConfig('tool_model_id', '');

    const params: unknown[] = [];
    let whereExtra = '';
    if (toolModelId) {
      whereExtra = ' AND id != $1';
      params.push(toolModelId);
    }

    const result = await pool.query(
      `SELECT
        m.id,
        m.display_name,
        m.provider,
        m.input_credits_per_mtok,
        m.output_credits_per_mtok,
        m.cache_read_credits_per_mtok,
        m.cache_write_credits_per_mtok,
        m.input_price_per_mtok,
        m.output_price_per_mtok,
        m.cache_read_price_per_mtok,
        m.cache_write_price_per_mtok,
        m.max_tokens,
        m.max_context_length,
        m.sort_order,
        (to_jsonb(m) ->> 'description') AS description,
        COALESCE((to_jsonb(m) -> 'features'), '[]'::jsonb) AS features,
        COALESCE((to_jsonb(m) -> 'use_cases'), '[]'::jsonb) AS use_cases,
        COALESCE((to_jsonb(m) -> 'tags'), '[]'::jsonb) AS tags
      FROM models m
      WHERE m.is_enabled = true
        AND ${MODEL_HIDDEN_CLAUSE}${whereExtra}
      ORDER BY m.sort_order ASC, m.provider, m.id`,
      params
    );

    const models = (result.rows as Array<{
      id: string;
      display_name: string;
      provider: string;
      input_credits_per_mtok: string | null;
      output_credits_per_mtok: string | null;
      cache_read_credits_per_mtok: string | null;
      cache_write_credits_per_mtok: string | null;
      input_price_per_mtok: string | null;
      output_price_per_mtok: string | null;
      cache_read_price_per_mtok: string | null;
      cache_write_price_per_mtok: string | null;
      max_tokens: number;
      max_context_length: number;
      sort_order: number;
      description: string | null;
      features: unknown;
      use_cases: unknown;
      tags: unknown;
    }>).map((row) => {
      const inputCredits = parseFloat(row.input_credits_per_mtok ?? '0');
      const outputCredits = parseFloat(row.output_credits_per_mtok ?? '0');
      const cacheReadCredits = parseFloat(row.cache_read_credits_per_mtok ?? '0');
      const cacheWriteCredits = parseFloat(row.cache_write_credits_per_mtok ?? '0');

      return {
        id: row.id,
        displayName: row.display_name,
        provider: row.provider,
        pricing: {
          inputCreditsPerMtok: Number.isFinite(inputCredits) ? inputCredits : 0,
          outputCreditsPerMtok: Number.isFinite(outputCredits) ? outputCredits : 0,
          cacheReadCreditsPerMtok: Number.isFinite(cacheReadCredits) ? cacheReadCredits : 0,
          cacheWriteCreditsPerMtok: Number.isFinite(cacheWriteCredits) ? cacheWriteCredits : 0,
        },
        limits: {
          maxTokens: row.max_tokens,
          maxContextLength: row.max_context_length,
        },
        description: row.description,
        features: normalizeStringArray(row.features),
        useCases: normalizeStringArray(row.use_cases),
        tags: normalizeStringArray(row.tags),
      };
    });

    res.json(successResponse({
      models,
      unit: '积分/百万token',
      note: '1 积分 = 0.1 元人民币',
    }));
  }
);

/**
 * 获取工具模型配置
 * GET /api/models/tool-model
 */
modelsPublicRouter.get('/tool-model', async (_req: Request, res: Response) => {
  const toolModelId = await getSystemConfig('tool_model_id', '');
  const smallFastModelId = await getSystemConfig('small_fast_model_id', '');
  res.json(successResponse({ toolModelId, smallFastModelId }));
});

/**
 * 获取单个模型详情
 * GET /api/models/:id
 */
modelsPublicRouter.get(
  '/:id',
  async (req: Request, res: Response) => {
    const id = req.params.id ?? '';
    const toolModelId = await getSystemConfig('tool_model_id', '');
    const params: string[] = [id];
    let whereExtra = '';

    if (toolModelId) {
      whereExtra = ' AND m.id != $2';
      params.push(toolModelId);
    }

    const result = await pool.query(
      `SELECT
        m.id,
        m.display_name,
        m.provider,
        m.input_credits_per_mtok,
        m.output_credits_per_mtok,
        m.cache_read_credits_per_mtok,
        m.cache_write_credits_per_mtok,
        m.input_price_per_mtok,
        m.output_price_per_mtok,
        m.cache_read_price_per_mtok,
        m.cache_write_price_per_mtok,
        m.max_tokens,
        m.max_context_length,
        (to_jsonb(m) ->> 'description') AS description,
        COALESCE((to_jsonb(m) -> 'features'), '[]'::jsonb) AS features,
        COALESCE((to_jsonb(m) -> 'use_cases'), '[]'::jsonb) AS use_cases,
        COALESCE((to_jsonb(m) -> 'tags'), '[]'::jsonb) AS tags
      FROM models m
      WHERE m.id = $1
        AND m.is_enabled = true
        AND ${MODEL_HIDDEN_CLAUSE}${whereExtra}`,
      params
    );

    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('模型');
    }

    const row = result.rows[0] as {
      id: string;
      display_name: string;
      provider: string;
      input_credits_per_mtok: string | null;
      output_credits_per_mtok: string | null;
      cache_read_credits_per_mtok: string | null;
      cache_write_credits_per_mtok: string | null;
      input_price_per_mtok: string | null;
      output_price_per_mtok: string | null;
      cache_read_price_per_mtok: string | null;
      cache_write_price_per_mtok: string | null;
      max_tokens: number;
      max_context_length: number;
      description: string | null;
      features: unknown;
      use_cases: unknown;
      tags: unknown;
    };

    const inputCredits = parseFloat(row.input_credits_per_mtok ?? '0');
    const outputCredits = parseFloat(row.output_credits_per_mtok ?? '0');
    const cacheReadCredits = parseFloat(row.cache_read_credits_per_mtok ?? '0');
    const cacheWriteCredits = parseFloat(row.cache_write_credits_per_mtok ?? '0');

    res.json(successResponse({
      id: row.id,
      displayName: row.display_name,
      provider: row.provider,
      pricing: {
        inputCreditsPerMtok: Number.isFinite(inputCredits) ? inputCredits : 0,
        outputCreditsPerMtok: Number.isFinite(outputCredits) ? outputCredits : 0,
        cacheReadCreditsPerMtok: Number.isFinite(cacheReadCredits) ? cacheReadCredits : 0,
        cacheWriteCreditsPerMtok: Number.isFinite(cacheWriteCredits) ? cacheWriteCredits : 0,
      },
      limits: {
        maxTokens: row.max_tokens,
        maxContextLength: row.max_context_length,
      },
      description: row.description,
      features: normalizeStringArray(row.features),
      useCases: normalizeStringArray(row.use_cases),
      tags: normalizeStringArray(row.tags),
    }));
  }
);

export default modelsPublicRouter;
