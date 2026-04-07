/**
 * 管理后台 - 系统全局配置路由
 *
 * 挂载到 /api/admin/settings/system:
 * - GET  /       - 获取系统全局配置
 * - PUT  /       - 更新系统全局配置
 * - POST /reset  - 重置为默认配置
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin } from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { successResponse } from '../../utils/response.js';
import { clearConfigCache } from '../../services/config.js';

export const adminSystemSettingsRouter = Router();

adminSystemSettingsRouter.use(authenticateAdmin);

// ============================================================
// 配置键 → 前端字段映射
// ============================================================

interface FieldDef {
  dbKey: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue: string;
}

const FIELD_MAP: Record<string, FieldDef> = {
  siteName:                  { dbKey: 'site_name',                    type: 'string',  defaultValue: 'AI 助手平台' },
  siteDescription:           { dbKey: 'site_description',             type: 'string',  defaultValue: '' },
  siteUrl:                   { dbKey: 'site_url',                     type: 'string',  defaultValue: '' },
  logoUrl:                   { dbKey: 'logo_url',                     type: 'string',  defaultValue: '' },
  faviconUrl:                { dbKey: 'favicon_url',                  type: 'string',  defaultValue: '' },
  maintenanceMode:           { dbKey: 'maintenance_mode',             type: 'boolean', defaultValue: 'false' },
  maintenanceMessage:        { dbKey: 'maintenance_message',          type: 'string',  defaultValue: '系统正在维护中，请稍后再试...' },
  registrationEnabled:       { dbKey: 'registration_enabled',         type: 'boolean', defaultValue: 'true' },
  emailVerificationRequired: { dbKey: 'email_verification_required',  type: 'boolean', defaultValue: 'false' },
  defaultBalance:            { dbKey: 'default_balance',              type: 'number',  defaultValue: '0' },
  minRechargeAmount:         { dbKey: 'min_recharge_amount',          type: 'number',  defaultValue: '1' },
  maxRechargeAmount:         { dbKey: 'max_recharge_amount',          type: 'number',  defaultValue: '10000' },
  inviteBonus:               { dbKey: 'invite_bonus',                 type: 'number',  defaultValue: '0' },
  inviteRewardRate:          { dbKey: 'invite_reward_rate',           type: 'number',  defaultValue: '0' },
  rateLimitPerMinute:        { dbKey: 'rate_limit_per_minute',        type: 'number',  defaultValue: '60' },
  maxRequestsPerDay:         { dbKey: 'max_requests_per_day',         type: 'number',  defaultValue: '1000' },
  sessionTimeout:            { dbKey: 'session_timeout',              type: 'number',  defaultValue: '3600' },
  enableInviteSystem:        { dbKey: 'enable_invite_system',         type: 'boolean', defaultValue: 'true' },
  enableReferralSystem:      { dbKey: 'enable_referral_system',       type: 'boolean', defaultValue: 'false' },
  termsOfServiceUrl:         { dbKey: 'terms_of_service_url',         type: 'string',  defaultValue: '' },
  privacyPolicyUrl:          { dbKey: 'privacy_policy_url',           type: 'string',  defaultValue: '' },
  supportEmail:              { dbKey: 'support_email',                type: 'string',  defaultValue: '' },
  globalPriceMultiplier:     { dbKey: 'global_price_multiplier',      type: 'number',  defaultValue: '1' },
  defaultDailyLimitCents:    { dbKey: 'default_daily_limit_cents',    type: 'number',  defaultValue: '0' },
  defaultMonthlyLimitCents:  { dbKey: 'default_monthly_limit_cents',  type: 'number',  defaultValue: '0' },
  defaultRpmLimit:           { dbKey: 'default_rpm_limit',            type: 'number',  defaultValue: '60' },
  defaultTpmLimit:           { dbKey: 'default_tpm_limit',            type: 'number',  defaultValue: '100000' },
  defaultDailyRequestLimit:  { dbKey: 'default_daily_request_limit',  type: 'number',  defaultValue: '500' },
  defaultDailyTokenLimit:    { dbKey: 'default_daily_token_limit',    type: 'number',  defaultValue: '100000' },
  defaultMonthlyRequestLimit:{ dbKey: 'default_monthly_request_limit',type: 'number',  defaultValue: '10000' },
  defaultMonthlyTokenLimit:  { dbKey: 'default_monthly_token_limit',  type: 'number',  defaultValue: '2000000' },
  lowBalanceThresholdCents:  { dbKey: 'low_balance_threshold_cents',  type: 'number',  defaultValue: '1000' },
  notifyOnLowBalance:        { dbKey: 'notify_on_low_balance',        type: 'boolean', defaultValue: 'false' },
  welcomeBonusCents:         { dbKey: 'welcome_bonus_cents',           type: 'number',  defaultValue: '0' },
  toolModelId:               { dbKey: 'tool_model_id',                 type: 'string',  defaultValue: '' },
  smallFastModelId:          { dbKey: 'small_fast_model_id',            type: 'string',  defaultValue: '' },
  enableCodexProvider:       { dbKey: 'enable_codex_provider',          type: 'boolean', defaultValue: 'false' },
  enableRuntimeDimension:    { dbKey: 'enable_runtime_dimension',       type: 'boolean', defaultValue: 'false' },
  defaultAgentProvider:      { dbKey: 'default_agent_provider',         type: 'string',  defaultValue: 'claude' },
  enabledAgentProviders:     { dbKey: 'enabled_agent_providers',        type: 'string',  defaultValue: 'claude' },
  checkinEnabled:            { dbKey: 'checkin_enabled',                type: 'boolean', defaultValue: 'true' },
  checkinBaseCredits:        { dbKey: 'checkin_base_credits',           type: 'number',  defaultValue: '0.5' },
  checkinConsecutiveBonus:   { dbKey: 'checkin_consecutive_bonus',      type: 'number',  defaultValue: '0.1' },
  checkinMaxConsecutiveBonus:{ dbKey: 'checkin_max_consecutive_bonus',  type: 'number',  defaultValue: '3' },
  captchaEnabled:            { dbKey: 'captcha_enabled',               type: 'boolean', defaultValue: 'false' },
  captchaSecretId:           { dbKey: 'captcha_secret_id',             type: 'string',  defaultValue: '' },
  captchaSecretKey:          { dbKey: 'captcha_secret_key',            type: 'string',  defaultValue: '' },
  captchaAppId:              { dbKey: 'captcha_app_id',                type: 'string',  defaultValue: '' },
  captchaAppSecretKey:       { dbKey: 'captcha_app_secret_key',        type: 'string',  defaultValue: '' },
};

// 所有数据库键
const ALL_DB_KEYS = Object.values(FIELD_MAP).map((f) => f.dbKey);

// ============================================================
// 辅助函数
// ============================================================

function parseValue(raw: string, type: FieldDef['type']): unknown {
  switch (type) {
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'number': {
      const n = parseFloat(raw);
      return isNaN(n) ? 0 : n;
    }
    default:
      return raw;
  }
}

async function readSystemConfig(): Promise<Record<string, unknown>> {
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

  for (const [field, def] of Object.entries(FIELD_MAP)) {
    const dbRow = dbMap.get(def.dbKey);
    const raw = dbRow?.value ?? def.defaultValue;
    config[field] = parseValue(raw, def.type);

    if (dbRow?.updated_at && dbRow.updated_at > latestUpdatedAt) {
      latestUpdatedAt = dbRow.updated_at;
      latestUpdatedBy = dbRow.updated_by;
    }
  }

  config.updatedAt = latestUpdatedAt || new Date().toISOString();
  if (latestUpdatedBy) {
    config.updatedBy = latestUpdatedBy;
  }

  return config;
}

// ============================================================
// 验证 Schema
// ============================================================

const updateSystemConfigSchema = z.object({
  siteName: z.string().max(200).optional(),
  siteDescription: z.string().max(1000).optional(),
  siteUrl: z.string().max(500).optional(),
  logoUrl: z.string().max(500).optional(),
  faviconUrl: z.string().max(500).optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(1000).optional(),
  registrationEnabled: z.boolean().optional(),
  emailVerificationRequired: z.boolean().optional(),
  defaultBalance: z.number().min(0).optional(),
  minRechargeAmount: z.number().min(0).optional(),
  maxRechargeAmount: z.number().min(0).optional(),
  inviteBonus: z.number().min(0).optional(),
  inviteRewardRate: z.number().min(0).max(100).optional(),
  rateLimitPerMinute: z.number().int().min(0).optional(),
  maxRequestsPerDay: z.number().int().min(0).optional(),
  sessionTimeout: z.number().int().min(60).optional(),
  enableInviteSystem: z.boolean().optional(),
  enableReferralSystem: z.boolean().optional(),
  termsOfServiceUrl: z.string().max(500).optional(),
  privacyPolicyUrl: z.string().max(500).optional(),
  supportEmail: z.string().max(200).optional(),
  globalPriceMultiplier: z.number().min(0.1).max(10).optional(),
  defaultDailyLimitCents: z.number().int().min(0).optional(),
  defaultMonthlyLimitCents: z.number().int().min(0).optional(),
  defaultRpmLimit: z.number().int().min(0).optional(),
  defaultTpmLimit: z.number().int().min(0).optional(),
  lowBalanceThresholdCents: z.number().int().min(0).optional(),
  notifyOnLowBalance: z.boolean().optional(),
  welcomeBonusCents: z.number().int().min(0).max(100000).optional(),
  toolModelId: z.string().max(100).optional(),
  smallFastModelId: z.string().max(100).optional(),
  enableCodexProvider: z.boolean().optional(),
  enableRuntimeDimension: z.boolean().optional(),
  defaultAgentProvider: z.string().max(50).optional(),
  enabledAgentProviders: z.string().max(200).optional(),
  checkinEnabled: z.boolean().optional(),
  checkinBaseCredits: z.number().min(0).max(100).optional(),
  checkinConsecutiveBonus: z.number().min(0).max(100).optional(),
  checkinMaxConsecutiveBonus: z.number().min(0).max(100).optional(),
  captchaEnabled: z.boolean().optional(),
  captchaSecretId: z.string().max(200).optional(),
  captchaSecretKey: z.string().max(200).optional(),
  captchaAppId: z.string().max(50).optional(),
  captchaAppSecretKey: z.string().max(200).optional(),
});

// ============================================================
// 路由处理器
// ============================================================

/**
 * GET /api/admin/settings/system
 * 获取系统全局配置
 */
adminSystemSettingsRouter.get('/', async (_req: Request, res: Response) => {
  const config = await readSystemConfig();
  res.json(successResponse(config));
});

/**
 * PUT /api/admin/settings/system
 * 更新系统全局配置
 */
adminSystemSettingsRouter.put('/', async (req: Request, res: Response) => {
  const parseResult = updateSystemConfigSchema.safeParse(req.body);
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

    const def = FIELD_MAP[field];
    if (!def) continue;

    const strValue = String(value);

    // UPSERT: 如果 key 不存在则插入
    await pool.query(
      `INSERT INTO system_configs (key, value, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (key) DO UPDATE
       SET value = $2, updated_at = NOW(), updated_by = $3`,
      [def.dbKey, strValue, adminId]
    );

    // 同步 welcome_bonus_cents → welcome_credits（保持两个配置一致）
    if (field === 'welcomeBonusCents') {
      const creditsValue = String(Math.round((value as number) / 100));
      await pool.query(
        `INSERT INTO system_configs (key, value, description, updated_at, updated_by)
         VALUES ('welcome_credits', $1, '新用户欢迎积分数量', NOW(), $2)
         ON CONFLICT (key) DO UPDATE
         SET value = $1, updated_at = NOW(), updated_by = $2`,
        [creditsValue, adminId]
      );
    }
  }

  clearConfigCache();

  const config = await readSystemConfig();
  res.json(successResponse(config));
});

/**
 * POST /api/admin/settings/system/reset
 * 重置为默认配置
 */
adminSystemSettingsRouter.post('/reset', async (req: Request, res: Response) => {
  const adminId = req.adminId ?? null;

  for (const def of Object.values(FIELD_MAP)) {
    await pool.query(
      `INSERT INTO system_configs (key, value, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (key) DO UPDATE
       SET value = $2, updated_at = NOW(), updated_by = $3`,
      [def.dbKey, def.defaultValue, adminId]
    );
  }

  clearConfigCache();

  const config = await readSystemConfig();
  res.json(successResponse(config));
});

export default adminSystemSettingsRouter;
