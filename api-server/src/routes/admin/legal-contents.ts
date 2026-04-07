/**
 * 管理后台 - 法律文档管理路由
 *
 * 功能:
 * - GET    /api/admin/legal-contents       - 获取所有法律文档
 * - GET    /api/admin/legal-contents/:type - 获取指定类型的法律文档
 * - PUT    /api/admin/legal-contents/:type - 更新指定类型的法律文档
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin } from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { successResponse } from '../../utils/response.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

export const adminLegalContentsRouter = Router();

// 所有路由需要管理员认证
adminLegalContentsRouter.use(authenticateAdmin);

// ============================================================
// 验证 Schema
// ============================================================

const i18nContentSchema = z.object({
  content: z.string().optional(),
}).optional();

const i18nSchema = z.object({
  zh: i18nContentSchema,
  'zh-TW': i18nContentSchema,
  ja: i18nContentSchema,
}).optional();

const legalContentTypes = ['privacy_policy', 'terms_of_service', 'about_us'] as const;

const updateLegalContentSchema = z.object({
  content: z.string().min(1),
  i18n: i18nSchema,
});

// ============================================================
// 数据库行类型
// ============================================================

interface LegalContentRow {
  id: string;
  type: string;
  content: string;
  i18n: Record<string, Record<string, string>> | null;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

function rowToLegalContent(row: LegalContentRow) {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    i18n: row.i18n ?? {},
    version: row.version,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

// ============================================================
// 路由处理器
// ============================================================

/**
 * GET /api/admin/legal-contents
 * 获取所有法律文档
 */
adminLegalContentsRouter.get('/', async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT * FROM legal_contents ORDER BY type`
  );

  const legalContents = (result.rows as LegalContentRow[]).map(rowToLegalContent);

  res.json(successResponse({ legalContents }));
});

/**
 * GET /api/admin/legal-contents/:type
 * 获取指定类型的法律文档
 */
adminLegalContentsRouter.get('/:type', async (req: Request, res: Response) => {
  const { type } = req.params;

  if (!type || !(legalContentTypes as readonly string[]).includes(type)) {
    throw new ValidationError('无效的文档类型');
  }

  const result = await pool.query(
    `SELECT * FROM legal_contents WHERE type = $1`,
    [type]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('法律文档');
  }

  const legalContent = rowToLegalContent(result.rows[0] as LegalContentRow);

  res.json(successResponse({ legalContent }));
});

/**
 * PUT /api/admin/legal-contents/:type
 * 更新指定类型的法律文档
 */
adminLegalContentsRouter.put('/:type', async (req: Request, res: Response) => {
  const { type } = req.params;

  if (!type || !(legalContentTypes as readonly string[]).includes(type)) {
    throw new ValidationError('无效的文档类型');
  }

  const parseResult = updateLegalContentSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const { content, i18n } = parseResult.data;

  // 检查文档是否存在
  const existResult = await pool.query(
    'SELECT * FROM legal_contents WHERE type = $1',
    [type]
  );

  if (existResult.rows.length === 0) {
    throw new NotFoundError('法律文档');
  }

  // 更新文档（version 和 updated_at 由触发器自动更新）
  const result = await pool.query(
    `UPDATE legal_contents
     SET content = $1, i18n = $2, updated_by = $3
     WHERE type = $4
     RETURNING *`,
    [content, i18n ? JSON.stringify(i18n) : '{}', req.user?.id ?? null, type]
  );

  const legalContent = rowToLegalContent(result.rows[0] as LegalContentRow);

  res.json(successResponse({
    message: '法律文档更新成功',
    legalContent,
  }));
});

export default adminLegalContentsRouter;
