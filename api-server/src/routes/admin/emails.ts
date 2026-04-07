/**
 * 管理后台 - 邮件管理路由
 *
 * emails 路由 (挂载到 /api/admin/emails):
 * - GET  /logs              - 邮件发送日志
 * - GET  /templates         - 邮件模板列表
 * - PUT  /templates/:slug   - 更新模板
 * - POST /test              - 发送测试邮件
 *
 * emailSettings 路由 (挂载到 /api/admin/settings/email):
 * - GET  /                  - 获取邮件配置
 * - PUT  /                  - 更新邮件配置
 * - POST /test              - 测试 SMTP 连接
 * - POST /send-test         - 发送测试邮件
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin } from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { successResponse } from '../../utils/response.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';
import { emailService } from '../../services/email.js';

// ============================================================
// 邮件管理路由 (/api/admin/emails)
// ============================================================

export const adminEmailsRouter = Router();
adminEmailsRouter.use(authenticateAdmin);

// 确保邮件相关表存在（兼容未执行 migration 0012 的环境）
pool.query(`
  CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    template VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    html_content TEXT NOT NULL,
    variables TEXT,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});

// ============================================================
// 邮件配置路由 (/api/admin/settings/email)
// ============================================================

export const adminEmailSettingsRouter = Router();
adminEmailSettingsRouter.use(authenticateAdmin);

// ============================================================
// 验证 Schema
// ============================================================

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500),
  htmlContent: z.string().min(1),
  isEnabled: z.boolean().optional(),
});

const testEmailSchema = z.object({
  to: z.string().email('无效的邮箱地址'),
  subject: z.string().max(500).optional(),
});

const updateEmailConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(['smtp', 'sendgrid', 'mailgun', 'aws-ses']).optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  fromEmail: z.string().max(200).optional().or(z.literal('')),
  fromName: z.string().max(100).optional(),
  replyToEmail: z.string().email().optional().or(z.literal('')),
});

// ============================================================
// 数据库行类型
// ============================================================

interface EmailLogRow {
  id: string;
  user_id: string | null;
  to_email: string;
  subject: string;
  template: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

interface EmailTemplateRow {
  id: string;
  slug: string;
  name: string;
  subject: string;
  html_content: string;
  variables: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// 辅助函数
// ============================================================

function maskPassword(password: string): string {
  if (!password || password.length < 4) {
    return password ? '****' : '';
  }
  return password.substring(0, 2) + '*'.repeat(Math.max(0, password.length - 4)) + password.substring(password.length - 2);
}

async function readEmailConfig() {
  const result = await pool.query(
    `SELECT key, value FROM system_configs WHERE key IN (
      'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure',
      'smtp_from_name', 'smtp_from_email', 'smtp_reply_to', 'email_enabled'
    )`
  );

  const configMap = new Map<string, string>();
  for (const row of result.rows as Array<{ key: string; value: string }>) {
    configMap.set(row.key, row.value);
  }

  return {
    enabled: configMap.get('email_enabled') === 'true',
    provider: 'smtp' as const,
    smtpHost: configMap.get('smtp_host') ?? '',
    smtpPort: parseInt(configMap.get('smtp_port') ?? '587', 10),
    smtpSecure: configMap.get('smtp_secure') === 'true',
    smtpUser: configMap.get('smtp_user') ?? '',
    smtpPassword: maskPassword(configMap.get('smtp_pass') ?? ''),
    fromEmail: configMap.get('smtp_from_email') ?? '',
    fromName: configMap.get('smtp_from_name') ?? 'Cherry Agent',
    replyToEmail: configMap.get('smtp_reply_to') ?? '',
  };
}

// ============================================================
// 邮件日志路由
// ============================================================

/**
 * GET /api/admin/emails/logs
 * 获取邮件发送日志
 */
adminEmailsRouter.get('/logs', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const template = req.query.template as string | undefined;

  const params: unknown[] = [];
  const conditions: string[] = [];

  if (status) {
    params.push(status);
    conditions.push(`el.status = $${params.length}`);
  }

  if (template) {
    params.push(template);
    conditions.push(`el.template = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM email_logs el ${whereClause}`,
    params
  );
  const total = parseInt((countResult.rows[0] as { total: string }).total, 10);

  const logsResult = await pool.query(
    `SELECT el.*, u.email as user_email, u.name as user_name
     FROM email_logs el
     LEFT JOIN users u ON el.user_id = u.id
     ${whereClause}
     ORDER BY el.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const logs = (logsResult.rows as EmailLogRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email ?? null,
    userName: row.user_name ?? null,
    toEmail: row.to_email,
    subject: row.subject,
    template: row.template,
    status: row.status,
    errorMessage: row.error_message,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  }));

  res.json(successResponse({
    logs,
    meta: { total, page, limit, hasMore: offset + limit < total },
  }));
});

// ============================================================
// 邮件模板路由
// ============================================================

/**
 * GET /api/admin/emails/templates
 * 获取所有邮件模板
 */
adminEmailsRouter.get('/templates', async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM email_templates ORDER BY slug ASC`
  );

  const templates = (result.rows as EmailTemplateRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    subject: row.subject,
    htmlContent: row.html_content,
    variables: row.variables,
    isEnabled: row.is_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  res.json(successResponse({ templates }));
});

/**
 * PUT /api/admin/emails/templates/:slug
 * 更新邮件模板
 */
adminEmailsRouter.put('/templates/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;

  const parseResult = updateTemplateSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const { name, subject, htmlContent, isEnabled } = parseResult.data;

  const setClauses: string[] = ['subject = $1', 'html_content = $2', 'updated_at = NOW()'];
  const params: unknown[] = [subject, htmlContent];

  if (name !== undefined) {
    params.push(name);
    setClauses.push(`name = $${params.length}`);
  }

  if (isEnabled !== undefined) {
    params.push(isEnabled);
    setClauses.push(`is_enabled = $${params.length}`);
  }

  params.push(slug);

  const result = await pool.query(
    `UPDATE email_templates
     SET ${setClauses.join(', ')}
     WHERE slug = $${params.length}
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('邮件模板');
  }

  const row = result.rows[0] as EmailTemplateRow;

  res.json(successResponse({
    message: '模板更新成功',
    template: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      subject: row.subject,
      htmlContent: row.html_content,
      variables: row.variables,
      isEnabled: row.is_enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  }));
});

/**
 * POST /api/admin/emails/test
 * 发送测试邮件
 */
adminEmailsRouter.post('/test', async (req: Request, res: Response) => {
  const parseResult = testEmailSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const { to, subject } = parseResult.data;
  const result = await emailService.sendTestEmail(to, subject);

  res.json(successResponse({
    success: result.success,
    message: result.message,
    timestamp: new Date().toISOString(),
  }));
});

// ============================================================
// 邮件配置路由 (settings/email)
// ============================================================

/**
 * GET /api/admin/settings/email
 * 获取邮件配置
 */
adminEmailSettingsRouter.get('/', async (_req: Request, res: Response) => {
  const config = await readEmailConfig();
  res.json(successResponse(config));
});

/**
 * PUT /api/admin/settings/email
 * 更新邮件配置
 */
adminEmailSettingsRouter.put('/', async (req: Request, res: Response) => {
  const parseResult = updateEmailConfigSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const data = parseResult.data;
  const adminId = req.adminId ?? null;

  const fieldMap: Record<string, string> = {
    enabled: 'email_enabled',
    smtpHost: 'smtp_host',
    smtpPort: 'smtp_port',
    smtpSecure: 'smtp_secure',
    smtpUser: 'smtp_user',
    smtpPassword: 'smtp_pass',
    fromEmail: 'smtp_from_email',
    fromName: 'smtp_from_name',
    replyToEmail: 'smtp_reply_to',
  };

  for (const [field, dbKey] of Object.entries(fieldMap)) {
    const value = (data as Record<string, unknown>)[field];
    if (value === undefined) {
      continue;
    }

    // 跳过密码字段如果是脱敏值 (包含 *)
    if (field === 'smtpPassword' && typeof value === 'string' && value.includes('*')) {
      continue;
    }

    await pool.query(
      `INSERT INTO system_configs (key, value, description, updated_at, updated_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (key) DO UPDATE
       SET value = $2, updated_at = NOW(), updated_by = $4`,
      [dbKey, String(value), `邮件配置: ${field}`, adminId]
    );
  }

  // 清除缓存
  emailService.clearSmtpConfigCache();

  const config = await readEmailConfig();
  res.json(successResponse({
    ...config,
    updatedAt: new Date().toISOString(),
  }));
});

/**
 * POST /api/admin/settings/email/test
 * 测试 SMTP 连接
 */
adminEmailSettingsRouter.post('/test', async (req: Request, res: Response) => {
  const parseResult = z.object({
    testEmail: z.string().email('无效的邮箱地址'),
  }).safeParse(req.body);

  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const result = await emailService.testConnection();

  res.json(successResponse({
    success: result.success,
    message: result.message,
    details: result.details,
    timestamp: new Date().toISOString(),
  }));
});

/**
 * POST /api/admin/settings/email/send-test
 * 发送测试邮件
 */
adminEmailSettingsRouter.post('/send-test', async (req: Request, res: Response) => {
  const parseResult = z.object({
    to: z.string().email('无效的邮箱地址'),
    subject: z.string().max(500).optional(),
  }).safeParse(req.body);

  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const { to, subject } = parseResult.data;
  const result = await emailService.sendTestEmail(to, subject);

  res.json(successResponse({
    success: result.success,
    message: result.message,
    timestamp: new Date().toISOString(),
  }));
});

export default adminEmailsRouter;
