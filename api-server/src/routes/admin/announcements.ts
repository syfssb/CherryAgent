/**
 * 管理后台 - 公告管理路由
 *
 * 功能:
 * - GET    /api/admin/announcements           - 获取公告列表
 * - POST   /api/admin/announcements           - 创建公告
 * - PUT    /api/admin/announcements/:id       - 更新公告
 * - DELETE /api/admin/announcements/:id       - 删除公告
 * - PUT    /api/admin/announcements/:id/pin   - 置顶公告
 * - PUT    /api/admin/announcements/:id/unpin - 取消置顶
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin } from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { successResponse, paginationMeta } from '../../utils/response.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

export const adminAnnouncementsRouter = Router();

// 所有路由需要管理员认证
adminAnnouncementsRouter.use(authenticateAdmin);


// ============================================================
// 验证 Schema
// ============================================================

const i18nFieldSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
}).optional();

const i18nSchema = z.object({
  zh: i18nFieldSchema,
  'zh-TW': i18nFieldSchema,
  ja: i18nFieldSchema,
  en: i18nFieldSchema,
}).optional();

const announcementTypes = ['info', 'warning', 'important', 'critical', 'maintenance', 'promotion'] as const;

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  type: z.enum(announcementTypes).default('info'),
  isPublished: z.boolean().default(false),
  isPinned: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  expiresAt: z.string().datetime().nullable().optional(),
  channels: z.array(z.string()).nullable().optional(),
  i18n: i18nSchema,
});

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  type: z.enum(announcementTypes).optional(),
  isPublished: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  channels: z.array(z.string()).nullable().optional(),
  i18n: i18nSchema,
});

// ============================================================
// 数据库行类型
// ============================================================

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  type: string;
  is_published: boolean;
  publish_at: string | null;
  expires_at: string | null;
  sort_order: number;
  is_pinned: boolean;
  pinned_at: string | null;
  channels: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  i18n: Record<string, Record<string, string>> | null;
}

function rowToAnnouncement(row: AnnouncementRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    isPublished: row.is_published,
    isPinned: row.is_pinned ?? false,
    pinnedAt: row.pinned_at,
    publishedAt: row.publish_at,
    expiresAt: row.expires_at,
    sortOrder: row.sort_order,
    channels: row.channels,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    i18n: row.i18n ?? {},
  };
}

// ============================================================
// 路由处理器
// ============================================================

/**
 * GET /api/admin/announcements
 * 获取公告列表（支持分页和筛选）
 */
adminAnnouncementsRouter.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const typeFilter = req.query.type as string | undefined;
  const publishedFilter = req.query.isPublished as string | undefined;
  const search = req.query.search as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (typeFilter && (announcementTypes as readonly string[]).includes(typeFilter)) {
    conditions.push(`type = $${paramIdx++}`);
    params.push(typeFilter);
  }

  if (publishedFilter === 'true' || publishedFilter === 'false') {
    conditions.push(`is_published = $${paramIdx++}`);
    params.push(publishedFilter === 'true');
  }

  if (search && search.trim()) {
    const escapedSearch = search.trim().replace(/[%_\\]/g, '\\$&');
    conditions.push(`(title ILIKE $${paramIdx} OR content ILIKE $${paramIdx})`);
    params.push(`%${escapedSearch}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 查总数
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM announcements ${whereClause}`,
    params
  );
  const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

  // 查分页数据
  const dataResult = await pool.query(
    `SELECT * FROM announcements ${whereClause}
     ORDER BY is_pinned DESC, pinned_at DESC NULLS LAST, created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  const announcements = (dataResult.rows as AnnouncementRow[]).map(rowToAnnouncement);

  res.json(successResponse(
    { announcements },
    paginationMeta(total, page, limit)
  ));
});

/**
 * POST /api/admin/announcements
 * 创建公告
 */
adminAnnouncementsRouter.post('/', async (req: Request, res: Response) => {
  const parseResult = createAnnouncementSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const { title, content, type, isPublished, isPinned, sortOrder, expiresAt, channels, i18n } = parseResult.data;
  const publishAt = new Date().toISOString();
  const pinnedAt = isPinned ? new Date().toISOString() : null;

  const result = await pool.query(
    `INSERT INTO announcements (title, content, type, is_published, publish_at, expires_at, sort_order, channels, i18n, is_pinned, pinned_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [title, content, type, isPublished, publishAt, expiresAt ?? null, sortOrder, channels ? JSON.stringify(channels) : null, i18n ? JSON.stringify(i18n) : null, isPinned, pinnedAt]
  );

  const announcement = rowToAnnouncement(result.rows[0] as AnnouncementRow);

  res.status(201).json(successResponse({
    message: '公告创建成功',
    announcement,
  }));
});

/**
 * PUT /api/admin/announcements/:id
 * 更新公告
 */
adminAnnouncementsRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const parseResult = updateAnnouncementSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  // 检查公告是否存在
  const existResult = await pool.query(
    'SELECT * FROM announcements WHERE id = $1',
    [id]
  );
  if (existResult.rows.length === 0) {
    throw new NotFoundError('公告');
  }

  const existing = existResult.rows[0] as AnnouncementRow;
  const updates = parseResult.data;

  // 如果从未发布变为发布，设置发布时间
  let publishAt = existing.publish_at;
  if (updates.isPublished === true && !existing.is_published) {
    publishAt = new Date().toISOString();
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (updates.title !== undefined) {
    setClauses.push(`title = $${paramIdx++}`);
    params.push(updates.title);
  }
  if (updates.content !== undefined) {
    setClauses.push(`content = $${paramIdx++}`);
    params.push(updates.content);
  }
  if (updates.type !== undefined) {
    setClauses.push(`type = $${paramIdx++}`);
    params.push(updates.type);
  }
  if (updates.isPublished !== undefined) {
    setClauses.push(`is_published = $${paramIdx++}`);
    params.push(updates.isPublished);
    setClauses.push(`publish_at = $${paramIdx++}`);
    params.push(publishAt);
  }
  if (updates.expiresAt !== undefined) {
    setClauses.push(`expires_at = $${paramIdx++}`);
    params.push(updates.expiresAt);
  }
  if (updates.sortOrder !== undefined) {
    setClauses.push(`sort_order = $${paramIdx++}`);
    params.push(updates.sortOrder);
  }
  if (updates.isPinned !== undefined) {
    setClauses.push(`is_pinned = $${paramIdx++}`);
    params.push(updates.isPinned);
    setClauses.push(`pinned_at = $${paramIdx++}`);
    params.push(updates.isPinned ? new Date().toISOString() : null);
  }
  if (updates.channels !== undefined) {
    setClauses.push(`channels = $${paramIdx++}`);
    params.push(updates.channels ? JSON.stringify(updates.channels) : null);
  }
  if (updates.i18n !== undefined) {
    setClauses.push(`i18n = $${paramIdx++}`);
    params.push(updates.i18n ? JSON.stringify(updates.i18n) : null);
  }

  if (setClauses.length === 0) {
    throw new ValidationError('没有需要更新的字段');
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(id);

  const result = await pool.query(
    `UPDATE announcements SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    params
  );

  const announcement = rowToAnnouncement(result.rows[0] as AnnouncementRow);

  res.json(successResponse({
    message: '公告更新成功',
    announcement,
  }));
});

/**
 * DELETE /api/admin/announcements/:id
 * 删除公告
 */
adminAnnouncementsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await pool.query(
    'DELETE FROM announcements WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('公告');
  }

  res.json(successResponse({
    message: '公告删除成功',
  }));
});

/**
 * PUT /api/admin/announcements/:id/pin
 * 置顶公告
 */
adminAnnouncementsRouter.put('/:id/pin', async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE announcements
     SET is_pinned = true, pinned_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('公告');
  }

  const announcement = rowToAnnouncement(result.rows[0] as AnnouncementRow);

  res.json(successResponse({
    message: '公告已置顶',
    announcement,
  }));
});

/**
 * PUT /api/admin/announcements/:id/unpin
 * 取消置顶
 */
adminAnnouncementsRouter.put('/:id/unpin', async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE announcements
     SET is_pinned = false, pinned_at = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('公告');
  }

  const announcement = rowToAnnouncement(result.rows[0] as AnnouncementRow);

  res.json(successResponse({
    message: '公告已取消置顶',
    announcement,
  }));
});

export default adminAnnouncementsRouter;
