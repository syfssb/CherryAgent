/**
 * 管理后台 - 系统配置路由
 *
 * 功能:
 * - GET /api/admin/configs       - 获取所有配置
 * - PUT /api/admin/configs/:key  - 更新配置
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin } from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { successResponse } from '../../utils/response.js';
import { ValidationError } from '../../utils/errors.js';
import { maskSensitive } from '../../utils/crypto.js';
import { paymentConfigService } from '../../services/payment-config.js';
import { clearConfigCache } from '../../services/config.js';

export const adminConfigsRouter = Router();

// 所有路由需要管理员认证
adminConfigsRouter.use(authenticateAdmin);

// ============================================================
// 验证 Schema
// ============================================================

const updateConfigSchema = z.object({
  value: z.string(),
});

// ============================================================
// 数据库行类型
// ============================================================

interface ConfigRow {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

/**
 * 需要脱敏的配置键
 */
const SENSITIVE_CONFIG_KEYS = new Set([
  'stripe_secret_key',
  'stripe_webhook_secret',
  'xunhupay_appsecret',
]);

function rowToConfig(row: ConfigRow) {
  const value = SENSITIVE_CONFIG_KEYS.has(row.key) && row.value.length > 0
    ? maskSensitive(row.value, 4, 4)
    : row.value;

  return {
    key: row.key,
    value,
    description: row.description,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

// ============================================================
// 路由处理器
// ============================================================

/**
 * GET /api/admin/configs
 * 获取所有系统配置
 */
adminConfigsRouter.get('/', async (_req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT * FROM system_configs ORDER BY key ASC'
  );

  const configs = (result.rows as ConfigRow[]).map(rowToConfig);

  res.json(successResponse({ configs }));
});

/**
 * PUT /api/admin/configs/:key
 * 更新指定配置
 */
adminConfigsRouter.put('/:key', async (req: Request, res: Response) => {
  const { key } = req.params;

  const parseResult = updateConfigSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const { value } = parseResult.data;
  const adminId = req.adminId ?? null;

  const result = await pool.query(
    `INSERT INTO system_configs (key, value, updated_at, updated_by)
     VALUES ($3, $1, NOW(), $2)
     ON CONFLICT (key) DO UPDATE
     SET value = $1, updated_at = NOW(), updated_by = $2
     RETURNING *`,
    [value, adminId, key]
  );

  const config = rowToConfig(result.rows[0] as ConfigRow);

  // 清除系统配置缓存，确保新值立即生效
  clearConfigCache();

  // 如果更新了支付相关配置，清除支付配置缓存
  if (key!.startsWith('stripe_') || key!.startsWith('xunhupay_') || key! === 'payment_methods') {
    paymentConfigService.clearCache();
  }

  // 同步 welcome_credits → welcome_bonus_cents（保持两个配置一致）
  if (key === 'welcome_credits') {
    const credits = parseFloat(value);
    if (!isNaN(credits) && credits >= 0) {
      const centsValue = String(Math.round(credits * 100));
      await pool.query(
        `INSERT INTO system_configs (key, value, description, updated_at, updated_by)
         VALUES ('welcome_bonus_cents', $1, '新用户欢迎奖励金额（分）', NOW(), $2)
         ON CONFLICT (key) DO UPDATE
         SET value = $1, updated_at = NOW(), updated_by = $2`,
        [centsValue, adminId]
      );
    }
  }

  // 同步 welcome_bonus_cents → welcome_credits（保持两个配置一致）
  if (key === 'welcome_bonus_cents') {
    const cents = parseFloat(value);
    if (!isNaN(cents) && cents >= 0) {
      const creditsValue = String(Math.round(cents / 100));
      await pool.query(
        `INSERT INTO system_configs (key, value, description, updated_at, updated_by)
         VALUES ('welcome_credits', $1, '新用户欢迎积分数量', NOW(), $2)
         ON CONFLICT (key) DO UPDATE
         SET value = $1, updated_at = NOW(), updated_by = $2`,
        [creditsValue, adminId]
      );
    }
  }

  res.json(successResponse({
    message: '配置更新成功',
    config,
  }));
});

export default adminConfigsRouter;
