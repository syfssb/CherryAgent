/**
 * 管理后台 - Clerk 认证配置路由
 *
 * 混合方案：
 * - Secret Key 等敏感信息通过环境变量管理（不存数据库）
 * - 非敏感配置（publishable key、domain、启用开关等）存 system_configs 表
 * - 读取时优先从数据库读，fallback 到环境变量
 *
 * 路由 (挂载到 /api/admin/settings/clerk):
 * - GET  /  - 获取 Clerk 配置
 * - PUT  /  - 更新 Clerk 配置
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin } from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { successResponse } from '../../utils/response.js';
import { clearConfigCache } from '../../services/config.js';
import { env } from '../../utils/env.js';

export const adminClerkSettingsRouter = Router();

adminClerkSettingsRouter.use(authenticateAdmin);

// ============================================================
// 配置键定义
// ============================================================

interface ClerkFieldDef {
  dbKey: string;
  envKey: keyof typeof env | null;
  type: 'string' | 'boolean';
  defaultValue: string;
}

const CLERK_FIELD_MAP: Record<string, ClerkFieldDef> = {
  enabled:        { dbKey: 'clerk_enabled',         envKey: null,                    type: 'boolean', defaultValue: 'false' },
  publishableKey: { dbKey: 'clerk_publishable_key',  envKey: 'CLERK_PUBLISHABLE_KEY', type: 'string',  defaultValue: '' },
  domain:         { dbKey: 'clerk_domain',           envKey: 'CLERK_DOMAIN',          type: 'string',  defaultValue: '' },
  issuerUrl:      { dbKey: 'clerk_issuer_url',       envKey: 'CLERK_ISSUER_URL',      type: 'string',  defaultValue: '' },
};

const ALL_DB_KEYS = Object.values(CLERK_FIELD_MAP).map((f) => f.dbKey);

// ============================================================
// 验证 Schema
// ============================================================

const updateClerkConfigSchema = z.object({
  enabled: z.boolean().optional(),
  publishableKey: z.string().max(500).optional(),
  domain: z.string().max(500).optional(),
  issuerUrl: z.string().max(500).optional(),
}).strict();

// ============================================================
// 辅助函数
// ============================================================

function parseValue(raw: string, type: ClerkFieldDef['type']): unknown {
  if (type === 'boolean') {
    return raw === 'true' || raw === '1';
  }
  return raw;
}

/**
 * 读取 Clerk 配置
 * 优先从数据库读取，fallback 到环境变量
 */
async function readClerkConfig(): Promise<Record<string, unknown>> {
  const placeholders = ALL_DB_KEYS.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool.query(
    `SELECT key, value, updated_at, updated_by FROM system_configs WHERE key IN (${placeholders})`,
    ALL_DB_KEYS
  );

  const dbMap = new Map<string, { value: string; updated_at: string; updated_by: string | null }>();
  for (const row of result.rows as Array<{ key: string; value: string; updated_at: string; updated_by: string | null }>) {
    dbMap.set(row.key, row);
  }

  const config: Record<string, unknown> = {};
  let latestUpdatedAt = '';
  let latestUpdatedBy: string | null = null;

  for (const [field, def] of Object.entries(CLERK_FIELD_MAP)) {
    const dbRow = dbMap.get(def.dbKey);
    // 优先数据库值，fallback 到环境变量，最后用默认值
    let raw = dbRow?.value;
    if (raw === undefined || raw === '') {
      raw = def.envKey ? (env[def.envKey] as string | undefined) ?? def.defaultValue : def.defaultValue;
    }
    config[field] = parseValue(raw, def.type);

    if (dbRow?.updated_at && dbRow.updated_at > latestUpdatedAt) {
      latestUpdatedAt = dbRow.updated_at;
      latestUpdatedBy = dbRow.updated_by;
    }
  }

  // Secret Key 状态（只读，不暴露值）
  const secretKeyConfigured = Boolean(env.CLERK_SECRET_KEY);
  config.secretKeyStatus = secretKeyConfigured ? 'configured' : 'not_configured';

  // Webhook Secret 状态
  const webhookSecretConfigured = Boolean(env.CLERK_WEBHOOK_SECRET);
  config.webhookSecretStatus = webhookSecretConfigured ? 'configured' : 'not_configured';

  config.updatedAt = latestUpdatedAt || new Date().toISOString();
  if (latestUpdatedBy) {
    config.updatedBy = latestUpdatedBy;
  }

  return config;
}

// ============================================================
// 路由处理器
// ============================================================

/**
 * GET /api/admin/settings/clerk
 * 获取 Clerk 配置
 */
adminClerkSettingsRouter.get('/', async (_req: Request, res: Response) => {
  const config = await readClerkConfig();
  res.json(successResponse(config));
});

/**
 * PUT /api/admin/settings/clerk
 * 更新 Clerk 配置
 */
adminClerkSettingsRouter.put('/', async (req: Request, res: Response) => {
  const parseResult = updateClerkConfigSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VAL_2001', message: '参数验证失败', details: parseResult.error.errors },
    });
    return;
  }

  const data = parseResult.data;
  const adminId = req.adminId ?? null;

  for (const [field, value] of Object.entries(data)) {
    if (value === undefined) continue;

    const def = CLERK_FIELD_MAP[field];
    if (!def) continue;

    const strValue = String(value);

    // 防止掩码值被写回数据库
    if (typeof value === 'string' && value.includes('*')) continue;

    await pool.query(
      `INSERT INTO system_configs (key, value, description, updated_at, updated_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (key) DO UPDATE
       SET value = $2, updated_at = NOW(), updated_by = $4`,
      [def.dbKey, strValue, `Clerk 配置: ${field}`, adminId]
    );
  }

  clearConfigCache();

  const config = await readClerkConfig();
  res.json(successResponse(config));
});

export default adminClerkSettingsRouter;
