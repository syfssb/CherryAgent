import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse, paginationMeta } from '../../utils/response.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  authenticateAdminAsync,
  requirePermission,
} from '../../middleware/admin-auth.js';
import { auditLog } from '../../middleware/admin-logger.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { pool } from '../../db/index.js';
import { billingService } from '../../services/billing.js';

export const adminModelsRouter = Router();

const MODEL_DESCRIPTION_COLUMNS = [
  'description',
  'features',
  'use_cases',
  'tags',
] as const;
let hasModelDescriptionColumns: boolean | null = null;
let hasModelVisibilityColumn: boolean | null = null;

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function ensureModelDescriptionColumns(): Promise<void> {
  if (hasModelDescriptionColumns === true) {
    return;
  }

  const result = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'models'
       AND column_name = ANY($1::text[])`,
    [MODEL_DESCRIPTION_COLUMNS]
  );

  const existingColumns = new Set(result.rows.map((row) => row.column_name));
  const columnsReady = MODEL_DESCRIPTION_COLUMNS.every((column) =>
    existingColumns.has(column)
  );

  if (!columnsReady) {
    hasModelDescriptionColumns = false;
    throw new ValidationError('数据库未完成模型介绍字段迁移，请先执行 0030_add_model_description.sql');
  }

  hasModelDescriptionColumns = true;
}

async function ensureModelVisibilityColumn(required: boolean = true): Promise<boolean> {
  if (hasModelVisibilityColumn !== null) {
    if (!hasModelVisibilityColumn && required) {
      throw new ValidationError('数据库未完成模型隐藏字段迁移，请先执行 0040_add_model_hidden.sql');
    }
    return hasModelVisibilityColumn;
  }

  const result = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'models'
       AND column_name = 'is_hidden'`
  );

  hasModelVisibilityColumn = result.rows.length > 0;

  if (!hasModelVisibilityColumn && required) {
    throw new ValidationError('数据库未完成模型隐藏字段迁移，请先执行 0040_add_model_hidden.sql');
  }

  return hasModelVisibilityColumn;
}

// ==========================================
// Schema 定义
// ==========================================

/**
 * 模型列表查询 Schema
 */
const listModelsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  provider: z.string().optional(),
  isEnabled: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  isHidden: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().optional(),
});

/**
 * 更新模型 Schema
 */
const updateModelSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  inputPricePerMtok: z.number().int().min(0).optional(),
  outputPricePerMtok: z.number().int().min(0).optional(),
  cacheReadPricePerMtok: z.number().int().min(0).optional(),
  cacheWritePricePerMtok: z.number().int().min(0).optional(),
  inputCreditsPerMtok: z.number().min(0).optional(),
  outputCreditsPerMtok: z.number().min(0).optional(),
  cacheReadCreditsPerMtok: z.number().min(0).optional(),
  cacheWriteCreditsPerMtok: z.number().min(0).optional(),
  longContextInputPrice: z.number().int().min(0).optional(),
  longContextOutputPrice: z.number().int().min(0).optional(),
  longContextThreshold: z.number().int().min(0).optional(),
  maxTokens: z.number().int().min(1).optional(),
  maxContextLength: z.number().int().min(1).optional(),
  isEnabled: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  description: z.string().max(20000).optional(),
  features: z.array(z.string().min(1).max(100)).max(100).optional(),
  useCases: z.array(z.string().min(1).max(100)).max(100).optional(),
  tags: z.array(z.string().min(1).max(20)).max(3).optional(),
});

/**
 * 创建模型 Schema
 */
const createModelSchema = z.object({
  id: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  provider: z.string().min(1),
  inputPricePerMtok: z.number().int().min(0).default(0),
  outputPricePerMtok: z.number().int().min(0).default(0),
  cacheReadPricePerMtok: z.number().int().min(0).default(0),
  cacheWritePricePerMtok: z.number().int().min(0).default(0),
  inputCreditsPerMtok: z.number().min(0).default(0),
  outputCreditsPerMtok: z.number().min(0).default(0),
  cacheReadCreditsPerMtok: z.number().min(0).default(0),
  cacheWriteCreditsPerMtok: z.number().min(0).default(0),
  longContextInputPrice: z.number().int().min(0).default(0),
  longContextOutputPrice: z.number().int().min(0).default(0),
  longContextThreshold: z.number().int().min(0).default(0),
  maxTokens: z.number().int().min(1).default(4096),
  maxContextLength: z.number().int().min(1).default(128000),
  isEnabled: z.boolean().default(true),
  isHidden: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  description: z.string().max(20000).optional(),
  features: z.array(z.string().min(1).max(100)).max(100).optional(),
  useCases: z.array(z.string().min(1).max(100)).max(100).optional(),
  tags: z.array(z.string().min(1).max(20)).max(3).optional(),
});

// ==========================================
// 路由处理
// ==========================================

/**
 * 获取模型列表
 * GET /admin/models
 */
adminModelsRouter.get(
  '/',
  authenticateAdminAsync,
  requirePermission('models:read'),
  validateQuery(listModelsSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof listModelsSchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.provider) {
      conditions.push(`m.provider = $${paramIndex++}`);
      params.push(query.provider);
    }

    if (query.isEnabled !== undefined) {
      conditions.push(`m.is_enabled = $${paramIndex++}`);
      params.push(query.isEnabled);
    }

    if (query.isHidden !== undefined) {
      conditions.push(`COALESCE((to_jsonb(m) ->> 'is_hidden')::boolean, false) = $${paramIndex++}`);
      params.push(query.isHidden);
    }

    if (query.search) {
      const escapedSearch = query.search.replace(/[%_\\]/g, '\\$&');
      conditions.push(`(m.id ILIKE $${paramIndex} OR m.display_name ILIKE $${paramIndex})`);
      params.push(`%${escapedSearch}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询模型列表
    const modelsResult = await pool.query(
      `SELECT
         m.id,
         m.display_name,
         m.provider,
         m.input_price_per_mtok,
         m.output_price_per_mtok,
         m.cache_read_price_per_mtok,
         m.cache_write_price_per_mtok,
         m.input_credits_per_mtok,
         m.output_credits_per_mtok,
         m.cache_read_credits_per_mtok,
         m.cache_write_credits_per_mtok,
         m.long_context_input_price,
         m.long_context_output_price,
         m.long_context_threshold,
         m.max_tokens,
         m.max_context_length,
         m.is_enabled,
         COALESCE((to_jsonb(m) ->> 'is_hidden')::boolean, false) AS is_hidden,
         m.sort_order,
         m.created_at,
         m.updated_at,
         (to_jsonb(m) ->> 'description') AS description,
         COALESCE((to_jsonb(m) -> 'features'), '[]'::jsonb) AS features,
         COALESCE((to_jsonb(m) -> 'use_cases'), '[]'::jsonb) AS use_cases,
         COALESCE((to_jsonb(m) -> 'tags'), '[]'::jsonb) AS tags
       FROM models m
       ${whereClause}
       ORDER BY m.sort_order ASC, m.provider, m.id
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM models m ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    // 统计汇总
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) as total_models,
         COUNT(CASE WHEN is_enabled = true THEN 1 END) as enabled_models,
         COUNT(DISTINCT provider) as providers
       FROM models`
    );

    const summary = summaryResult.rows[0] as {
      total_models: string;
      enabled_models: string;
      providers: string;
    };

    // 获取每个模型的使用统计 (最近 7 天)
    const usageResult = await pool.query(
      `SELECT
         model,
         COUNT(*) as request_count,
         COALESCE(SUM(total_tokens), 0) as total_tokens
       FROM usage_logs
       WHERE created_at >= NOW() - INTERVAL '7 days'
       GROUP BY model`
    );

    const usageMap = new Map<string, { requestCount: number; totalTokens: number }>();
    (usageResult.rows || []).forEach((row: unknown) => {
      const r = row as { model: string; request_count: string; total_tokens: string };
      usageMap.set(r.model, {
        requestCount: parseInt(r.request_count, 10),
        totalTokens: parseInt(r.total_tokens, 10),
      });
    });

    const models = (modelsResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        display_name: string;
        provider: string;
        input_price_per_mtok: number;
        output_price_per_mtok: number;
        cache_read_price_per_mtok: number;
        cache_write_price_per_mtok: number;
        input_credits_per_mtok: string | null;
        output_credits_per_mtok: string | null;
        cache_read_credits_per_mtok: string | null;
        cache_write_credits_per_mtok: string | null;
        long_context_input_price: number;
        long_context_output_price: number;
        long_context_threshold: number;
        max_tokens: number;
        max_context_length: number;
        is_enabled: boolean;
        is_hidden: boolean;
        sort_order: number;
        created_at: Date;
        updated_at: Date;
        description: string | null;
        features: unknown;
        use_cases: unknown;
        tags: unknown;
      };

      const usage = usageMap.get(r.id);

      return {
        id: r.id,
        displayName: r.display_name,
        provider: r.provider,
        pricing: {
          inputPricePerMtok: r.input_price_per_mtok,
          outputPricePerMtok: r.output_price_per_mtok,
          cacheReadPricePerMtok: r.cache_read_price_per_mtok,
          cacheWritePricePerMtok: r.cache_write_price_per_mtok,
          longContextInputPrice: r.long_context_input_price,
          longContextOutputPrice: r.long_context_output_price,
          longContextThreshold: r.long_context_threshold,
        },
        creditsPricing: {
          inputCreditsPerMtok: parseFloat(r.input_credits_per_mtok ?? '0'),
          outputCreditsPerMtok: parseFloat(r.output_credits_per_mtok ?? '0'),
          cacheReadCreditsPerMtok: parseFloat(r.cache_read_credits_per_mtok ?? '0'),
          cacheWriteCreditsPerMtok: parseFloat(r.cache_write_credits_per_mtok ?? '0'),
        },
        limits: {
          maxTokens: r.max_tokens,
          maxContextLength: r.max_context_length,
        },
        isEnabled: r.is_enabled,
        isHidden: r.is_hidden,
        sortOrder: r.sort_order,
        description: r.description,
        features: normalizeStringArray(r.features),
        useCases: normalizeStringArray(r.use_cases),
        tags: normalizeStringArray(r.tags),
        usage: usage
          ? {
              last7Days: {
                requestCount: usage.requestCount,
                totalTokens: usage.totalTokens,
              },
            }
          : null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    res.json(
      successResponse(
        {
          models,
          summary: {
            totalModels: parseInt(summary.total_models, 10),
            enabledModels: parseInt(summary.enabled_models, 10),
            providers: parseInt(summary.providers, 10),
          },
        },
        paginationMeta(total, page, limit)
      )
    );
  }
);

/**
 * 获取模型详情
 * GET /admin/models/:id
 */
adminModelsRouter.get(
  '/:id',
  authenticateAdminAsync,
  requirePermission('models:read'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
         m.id,
         m.display_name,
         m.provider,
         m.input_price_per_mtok,
         m.output_price_per_mtok,
         m.cache_read_price_per_mtok,
         m.cache_write_price_per_mtok,
         m.input_credits_per_mtok,
         m.output_credits_per_mtok,
         m.cache_read_credits_per_mtok,
         m.cache_write_credits_per_mtok,
         m.long_context_input_price,
         m.long_context_output_price,
         m.long_context_threshold,
         m.max_tokens,
         m.max_context_length,
         m.is_enabled,
         COALESCE((to_jsonb(m) ->> 'is_hidden')::boolean, false) AS is_hidden,
         m.sort_order,
         m.created_at,
         m.updated_at,
         (to_jsonb(m) ->> 'description') AS description,
         COALESCE((to_jsonb(m) -> 'features'), '[]'::jsonb) AS features,
         COALESCE((to_jsonb(m) -> 'use_cases'), '[]'::jsonb) AS use_cases,
         COALESCE((to_jsonb(m) -> 'tags'), '[]'::jsonb) AS tags
       FROM models m
       WHERE m.id = $1`,
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('模型');
    }

    const r = result.rows[0] as {
      id: string;
      display_name: string;
      provider: string;
      input_price_per_mtok: number;
      output_price_per_mtok: number;
      cache_read_price_per_mtok: number;
      cache_write_price_per_mtok: number;
      input_credits_per_mtok: string | null;
      output_credits_per_mtok: string | null;
      cache_read_credits_per_mtok: string | null;
      cache_write_credits_per_mtok: string | null;
      long_context_input_price: number;
      long_context_output_price: number;
      long_context_threshold: number;
      max_tokens: number;
      max_context_length: number;
      is_enabled: boolean;
      is_hidden: boolean;
      sort_order: number;
      created_at: Date;
      updated_at: Date;
      description: string | null;
      features: unknown;
      use_cases: unknown;
      tags: unknown;
    };

    // 获取使用统计
    const usageResult = await pool.query(
      `SELECT
         DATE_TRUNC('day', created_at) as day,
         COUNT(*) as request_count,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost::numeric), 0) as total_cost
       FROM usage_logs
       WHERE model = $1
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE_TRUNC('day', created_at)
       ORDER BY day`,
      [id]
    );

    const dailyUsage = (usageResult.rows || []).map((row: unknown) => {
      const u = row as {
        day: Date;
        request_count: string;
        total_tokens: string;
        total_cost: string;
      };
      return {
        day: u.day,
        requestCount: parseInt(u.request_count, 10),
        totalTokens: parseInt(u.total_tokens, 10),
        totalCost: parseFloat(u.total_cost),
      };
    });

    // 汇总统计
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) as total_requests,
         COALESCE(SUM(total_tokens), 0) as total_tokens,
         COALESCE(SUM(cost::numeric), 0) as total_cost,
         COALESCE(AVG(latency_ms), 0) as avg_latency
       FROM usage_logs
       WHERE model = $1
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [id]
    );

    const usageSummary = summaryResult.rows[0] as {
      total_requests: string;
      total_tokens: string;
      total_cost: string;
      avg_latency: string;
    };

    res.json(
      successResponse({
        model: {
          id: r.id,
          displayName: r.display_name,
          provider: r.provider,
          pricing: {
            inputPricePerMtok: r.input_price_per_mtok,
            outputPricePerMtok: r.output_price_per_mtok,
            cacheReadPricePerMtok: r.cache_read_price_per_mtok,
            cacheWritePricePerMtok: r.cache_write_price_per_mtok,
            longContextInputPrice: r.long_context_input_price,
            longContextOutputPrice: r.long_context_output_price,
            longContextThreshold: r.long_context_threshold,
          },
          creditsPricing: {
            inputCreditsPerMtok: parseFloat(r.input_credits_per_mtok ?? '0'),
            outputCreditsPerMtok: parseFloat(r.output_credits_per_mtok ?? '0'),
            cacheReadCreditsPerMtok: parseFloat(r.cache_read_credits_per_mtok ?? '0'),
            cacheWriteCreditsPerMtok: parseFloat(r.cache_write_credits_per_mtok ?? '0'),
          },
          limits: {
            maxTokens: r.max_tokens,
            maxContextLength: r.max_context_length,
          },
          isEnabled: r.is_enabled,
          isHidden: r.is_hidden,
          sortOrder: r.sort_order,
          description: r.description,
          features: normalizeStringArray(r.features),
          useCases: normalizeStringArray(r.use_cases),
          tags: normalizeStringArray(r.tags),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        },
        usage: {
          last30Days: {
            totalRequests: parseInt(usageSummary.total_requests, 10),
            totalTokens: parseInt(usageSummary.total_tokens, 10),
            totalCost: parseFloat(usageSummary.total_cost),
            avgLatencyMs: parseFloat(usageSummary.avg_latency).toFixed(0),
          },
          daily: dailyUsage,
        },
      })
    );
  }
);

/**
 * 更新模型配置
 * PATCH /admin/models/:id
 */
adminModelsRouter.patch(
  '/:id',
  authenticateAdminAsync,
  requirePermission('models:write'),
  validateBody(updateModelSchema),
  auditLog('model.update', 'model', {
    getTargetId: (req) => req.params.id,
    captureRequestBody: true,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body as z.infer<typeof updateModelSchema>;
    const hasDescriptionUpdates = updates.description !== undefined
      || updates.features !== undefined
      || updates.useCases !== undefined
      || updates.tags !== undefined;
    const canUpdateHiddenState = updates.isHidden === undefined
      ? false
      : await ensureModelVisibilityColumn(updates.isHidden === true);
    const resolvedInputCreditsPerMtok = updates.inputCreditsPerMtok;
    const resolvedOutputCreditsPerMtok = updates.outputCreditsPerMtok;
    const resolvedCacheReadCreditsPerMtok = updates.cacheReadCreditsPerMtok;
    const resolvedCacheWriteCreditsPerMtok = updates.cacheWriteCreditsPerMtok;

    // 检查模型是否存在
    const existingResult = await pool.query(
      `SELECT id FROM models WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('模型');
    }

    if (hasDescriptionUpdates) {
      await ensureModelDescriptionColumns();
    }

    // 构建更新语句
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.displayName !== undefined) {
      updateFields.push(`display_name = $${paramIndex++}`);
      params.push(updates.displayName);
    }

    if (updates.inputPricePerMtok !== undefined) {
      updateFields.push(`input_price_per_mtok = $${paramIndex++}`);
      params.push(updates.inputPricePerMtok);
    }

    if (updates.outputPricePerMtok !== undefined) {
      updateFields.push(`output_price_per_mtok = $${paramIndex++}`);
      params.push(updates.outputPricePerMtok);
    }

    if (updates.cacheReadPricePerMtok !== undefined) {
      updateFields.push(`cache_read_price_per_mtok = $${paramIndex++}`);
      params.push(updates.cacheReadPricePerMtok);
    }

    if (updates.cacheWritePricePerMtok !== undefined) {
      updateFields.push(`cache_write_price_per_mtok = $${paramIndex++}`);
      params.push(updates.cacheWritePricePerMtok);
    }

    if (updates.longContextInputPrice !== undefined) {
      updateFields.push(`long_context_input_price = $${paramIndex++}`);
      params.push(updates.longContextInputPrice);
    }

    if (updates.longContextOutputPrice !== undefined) {
      updateFields.push(`long_context_output_price = $${paramIndex++}`);
      params.push(updates.longContextOutputPrice);
    }

    if (updates.longContextThreshold !== undefined) {
      updateFields.push(`long_context_threshold = $${paramIndex++}`);
      params.push(updates.longContextThreshold);
    }

    if (updates.maxTokens !== undefined) {
      updateFields.push(`max_tokens = $${paramIndex++}`);
      params.push(updates.maxTokens);
    }

    if (updates.maxContextLength !== undefined) {
      updateFields.push(`max_context_length = $${paramIndex++}`);
      params.push(updates.maxContextLength);
    }

    if (updates.isEnabled !== undefined) {
      updateFields.push(`is_enabled = $${paramIndex++}`);
      params.push(updates.isEnabled);
    }

    if (updates.isHidden !== undefined && canUpdateHiddenState) {
      updateFields.push(`is_hidden = $${paramIndex++}`);
      params.push(updates.isHidden);
    }

    if (updates.sortOrder !== undefined) {
      updateFields.push(`sort_order = $${paramIndex++}`);
      params.push(updates.sortOrder);
    }

    if (resolvedInputCreditsPerMtok !== undefined) {
      updateFields.push(`input_credits_per_mtok = $${paramIndex++}`);
      params.push(resolvedInputCreditsPerMtok);
    }

    if (resolvedOutputCreditsPerMtok !== undefined) {
      updateFields.push(`output_credits_per_mtok = $${paramIndex++}`);
      params.push(resolvedOutputCreditsPerMtok);
    }

    if (resolvedCacheReadCreditsPerMtok !== undefined) {
      updateFields.push(`cache_read_credits_per_mtok = $${paramIndex++}`);
      params.push(resolvedCacheReadCreditsPerMtok);
    }

    if (resolvedCacheWriteCreditsPerMtok !== undefined) {
      updateFields.push(`cache_write_credits_per_mtok = $${paramIndex++}`);
      params.push(resolvedCacheWriteCreditsPerMtok);
    }

    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      params.push(updates.description);
    }

    if (updates.features !== undefined) {
      updateFields.push(`features = $${paramIndex++}::jsonb`);
      params.push(JSON.stringify(updates.features));
    }

    if (updates.useCases !== undefined) {
      updateFields.push(`use_cases = $${paramIndex++}::jsonb`);
      params.push(JSON.stringify(updates.useCases));
    }

    if (updates.tags !== undefined) {
      updateFields.push(`tags = $${paramIndex++}::jsonb`);
      params.push(JSON.stringify(updates.tags));
    }

    if (updateFields.length === 0) {
      throw new ValidationError('没有要更新的字段');
    }

    updateFields.push(`updated_at = NOW()`);
    params.push(id);

    await pool.query(
      `UPDATE models SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    // 清除模型价格缓存
    billingService.clearModelPriceCache();

    res.json(
      successResponse({
        message: '模型配置已更新',
      })
    );
  }
);

/**
 * 创建新模型
 * POST /admin/models
 */
adminModelsRouter.post(
  '/',
  authenticateAdminAsync,
  requirePermission('models:write'),
  validateBody(createModelSchema),
  auditLog('model.update', 'model', {
    captureRequestBody: true,
    getDescription: (req) => `创建模型: ${req.body.id}`,
  }),
  async (req: Request, res: Response) => {
    const data = req.body as z.infer<typeof createModelSchema>;
    const hasDescriptionFields = data.description !== undefined
      || data.features !== undefined
      || data.useCases !== undefined
      || data.tags !== undefined;
    const canPersistHiddenState = await ensureModelVisibilityColumn(data.isHidden === true);
    const inputCreditsPerMtok = data.inputCreditsPerMtok;
    const outputCreditsPerMtok = data.outputCreditsPerMtok;
    const cacheReadCreditsPerMtok = data.cacheReadCreditsPerMtok;
    const cacheWriteCreditsPerMtok = data.cacheWriteCreditsPerMtok;

    // 检查模型 ID 是否已存在
    const existingResult = await pool.query(
      `SELECT id FROM models WHERE id = $1`,
      [data.id]
    );

    if (existingResult.rows && existingResult.rows.length > 0) {
      throw new ValidationError('模型 ID 已存在');
    }

    if (hasDescriptionFields) {
      await ensureModelDescriptionColumns();
    }

    const insertColumns = [
      'id',
      'display_name',
      'provider',
      'input_price_per_mtok',
      'output_price_per_mtok',
      'cache_read_price_per_mtok',
      'cache_write_price_per_mtok',
      'input_credits_per_mtok',
      'output_credits_per_mtok',
      'cache_read_credits_per_mtok',
      'cache_write_credits_per_mtok',
      'long_context_input_price',
      'long_context_output_price',
      'long_context_threshold',
      'max_tokens',
      'max_context_length',
      'is_enabled',
      'sort_order',
    ];
    const insertValues: unknown[] = [
      data.id,
      data.displayName,
      data.provider,
      data.inputPricePerMtok,
      data.outputPricePerMtok,
      data.cacheReadPricePerMtok,
      data.cacheWritePricePerMtok,
      inputCreditsPerMtok,
      outputCreditsPerMtok,
      cacheReadCreditsPerMtok,
      cacheWriteCreditsPerMtok,
      data.longContextInputPrice,
      data.longContextOutputPrice,
      data.longContextThreshold,
      data.maxTokens,
      data.maxContextLength,
      data.isEnabled,
      data.sortOrder,
    ];

    if (canPersistHiddenState) {
      insertColumns.push('is_hidden');
      insertValues.push(data.isHidden);
    }

    if (hasDescriptionFields) {
      insertColumns.push('description', 'features', 'use_cases', 'tags');
      insertValues.push(
        data.description ?? null,
        JSON.stringify(data.features ?? []),
        JSON.stringify(data.useCases ?? []),
        JSON.stringify(data.tags ?? [])
      );
    }

    const placeholders = insertColumns.map((column, index) => {
      const position = `$${index + 1}`;
      if (column === 'features' || column === 'use_cases' || column === 'tags') {
        return `${position}::jsonb`;
      }
      return position;
    });

    await pool.query(
      `INSERT INTO models (
         ${insertColumns.join(',\n         ')}
       )
       VALUES (${placeholders.join(', ')})`,
      insertValues
    );

    // 清除模型价格缓存
    billingService.clearModelPriceCache();

    res.status(201).json(
      successResponse({
        message: '模型已创建',
        model: {
          id: data.id,
          displayName: data.displayName,
          provider: data.provider,
        },
      })
    );
  }
);

/**
 * 批量更新模型状态
 * POST /admin/models/batch-update
 */
adminModelsRouter.post(
  '/batch-update',
  authenticateAdminAsync,
  requirePermission('models:write'),
    validateBody(
      z.object({
        ids: z.array(z.string()).min(1),
        updates: z.object({
          isEnabled: z.boolean().optional(),
          isHidden: z.boolean().optional(),
        }),
      })
    ),
  auditLog('model.update', 'model', {
    captureRequestBody: true,
    getDescription: (req) => `批量更新 ${req.body.ids.length} 个模型`,
  }),
  async (req: Request, res: Response) => {
    const { ids, updates } = req.body;
    const canUpdateHiddenState = updates.isHidden === undefined
      ? false
      : await ensureModelVisibilityColumn(updates.isHidden === true);

    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (updates.isEnabled !== undefined) {
      updateFields.push(`is_enabled = $${paramIdx++}`);
      params.push(updates.isEnabled);
    }

    if (updates.isHidden !== undefined && canUpdateHiddenState) {
      updateFields.push(`is_hidden = $${paramIdx++}`);
      params.push(updates.isHidden);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('没有要更新的字段');
    }

    params.push(ids);

    await pool.query(
      `UPDATE models
       SET ${updateFields.join(', ')}, updated_at = NOW()
       WHERE id = ANY($${paramIdx})`,
      params
    );

    billingService.clearModelPriceCache();

    res.json(
      successResponse({
        message: `已更新 ${ids.length} 个模型`,
        updatedCount: ids.length,
      })
    );
  }
);

/**
 * 批量删除模型
 * POST /admin/models/batch-delete
 */
adminModelsRouter.post(
  '/batch-delete',
  authenticateAdminAsync,
  requirePermission('models:write'),
  validateBody(
    z.object({
      ids: z.array(z.string()).min(1).max(100),
    })
  ),
  auditLog('model.delete', 'model', {
    captureRequestBody: true,
    getDescription: (req) => `批量删除 ${req.body.ids.length} 个模型`,
  }),
  async (req: Request, res: Response) => {
    const { ids } = req.body;

    const result = await pool.query(
      `DELETE FROM models WHERE id = ANY($1)`,
      [ids]
    );

    const deletedCount = result.rowCount ?? 0;

    // 清除模型价格缓存
    billingService.clearModelPriceCache();

    res.json(
      successResponse({
        message: `已删除 ${deletedCount} 个模型`,
        deletedCount,
      })
    );
  }
);

/**
 * 删除模型
 * DELETE /admin/models/:id
 */
adminModelsRouter.delete(
  '/:id',
  authenticateAdminAsync,
  requirePermission('models:write'),
  auditLog('model.delete', 'model', {
    getTargetId: (req) => req.params.id,
    getDescription: (req) => `删除模型: ${req.params.id}`,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 检查模型是否存在
    const existingResult = await pool.query(
      `SELECT id, display_name FROM models WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('模型');
    }

    await pool.query(`DELETE FROM models WHERE id = $1`, [id]);

    // 清除模型价格缓存
    billingService.clearModelPriceCache();

    res.json(
      successResponse({
        message: '模型已删除',
      })
    );
  }
);

export default adminModelsRouter;
