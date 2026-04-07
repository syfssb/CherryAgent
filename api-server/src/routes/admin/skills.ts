/**
 * 管理后台 - Skill 管理路由
 *
 * 功能:
 * - GET    /api/admin/skills           - 获取 skill 列表
 * - POST   /api/admin/skills           - 创建 skill
 * - PUT    /api/admin/skills/:id       - 更新 skill
 * - DELETE /api/admin/skills/:id       - 删除 skill
 * - PATCH  /api/admin/skills/:id/toggle - 启用/禁用 skill
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin } from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { successResponse, paginationMeta } from '../../utils/response.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

export const adminSkillsRouter = Router();

// 所有路由需要管理员认证
adminSkillsRouter.use(authenticateAdmin);

// ============================================================
// 验证 Schema
// ============================================================

const SKILL_CATEGORIES = [
  'general',
  'development',
  'writing',
  'analysis',
  'automation',
  'communication',
  'design',
  'data',
  'devops',
  'other',
] as const;

const VALID_RUNTIMES = ['claude', 'codex'] as const;
const DEFAULT_COMPATIBLE_RUNTIMES: Array<(typeof VALID_RUNTIMES)[number]> = ['claude', 'codex'];

const compatibleRuntimesSchema = z
  .array(z.enum(VALID_RUNTIMES))
  .min(1, '至少选择一个兼容运行时')
  .default(DEFAULT_COMPATIBLE_RUNTIMES);

const i18nSchema = z.record(z.string(), z.record(z.string(), z.string())).nullable().optional();

const createSkillSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称最长 100 字符'),
  slug: z.string()
    .min(1, 'slug 不能为空')
    .max(100, 'slug 最长 100 字符')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 只能包含小写字母、数字和连字符'),
  description: z.string().max(1000).nullable().optional(),
  category: z.enum(SKILL_CATEGORIES).default('general'),
  skillContent: z.string().min(1, 'Skill 内容不能为空'),
  icon: z.string().max(50).nullable().optional(),
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  version: z.string().max(20).default('1.0.0'),
  compatibleRuntimes: compatibleRuntimesSchema,
  i18n: i18nSchema,
});

const updateSkillSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 只能包含小写字母、数字和连字符')
    .optional(),
  description: z.string().max(1000).nullable().optional(),
  category: z.enum(SKILL_CATEGORIES).optional(),
  skillContent: z.string().min(1).optional(),
  icon: z.string().max(50).nullable().optional(),
  isEnabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  version: z.string().max(20).optional(),
  compatibleRuntimes: z.array(z.enum(VALID_RUNTIMES)).min(1).optional(),
  i18n: i18nSchema,
});

// ============================================================
// 数据库行类型
// ============================================================

interface SkillRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  skill_content: string;
  icon: string | null;
  is_enabled: boolean;
  is_default: boolean;
  sort_order: number;
  version: string;
  compatible_runtimes: string;
  created_at: string;
  updated_at: string;
  i18n: Record<string, Record<string, string>> | null;
}

function rowToSkill(row: SkillRow) {
  let compatibleRuntimes: string[];
  try {
    compatibleRuntimes = JSON.parse(row.compatible_runtimes);
  } catch {
    compatibleRuntimes = DEFAULT_COMPATIBLE_RUNTIMES;
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category,
    skillContent: row.skill_content,
    icon: row.icon,
    isEnabled: row.is_enabled,
    isDefault: row.is_default,
    sortOrder: row.sort_order,
    version: row.version,
    compatibleRuntimes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    i18n: row.i18n ?? {},
  };
}

// ============================================================
// 路由处理器
// ============================================================

/**
 * GET /api/admin/skills
 * 获取 skill 列表（支持分页和筛选）
 */
adminSkillsRouter.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const categoryFilter = req.query.category as string | undefined;
  const enabledFilter = req.query.isEnabled as string | undefined;
  const search = req.query.search as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (categoryFilter && SKILL_CATEGORIES.includes(categoryFilter as typeof SKILL_CATEGORIES[number])) {
    conditions.push(`category = $${paramIdx++}`);
    params.push(categoryFilter);
  }

  if (enabledFilter === 'true' || enabledFilter === 'false') {
    conditions.push(`is_enabled = $${paramIdx++}`);
    params.push(enabledFilter === 'true');
  }

  if (search && search.trim()) {
    const escapedSearch = search.trim().replace(/[%_\\]/g, '\\$&');
    conditions.push(`(name ILIKE $${paramIdx} OR slug ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`);
    params.push(`%${escapedSearch}%`);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 查总数
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM preset_skills ${whereClause}`,
    params
  );
  const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

  // 查分页数据
  const dataResult = await pool.query(
    `SELECT * FROM preset_skills ${whereClause}
     ORDER BY sort_order ASC, created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  const skills = (dataResult.rows as SkillRow[]).map(rowToSkill);

  // 统计汇总
  const summaryResult = await pool.query(
    `SELECT
       COUNT(*) as total_skills,
       COUNT(CASE WHEN is_enabled = true THEN 1 END) as enabled_skills,
       COUNT(CASE WHEN is_default = true THEN 1 END) as default_skills,
       COUNT(DISTINCT category) as categories
     FROM preset_skills`
  );

  const summary = summaryResult.rows[0] as {
    total_skills: string;
    enabled_skills: string;
    default_skills: string;
    categories: string;
  };

  res.json(successResponse(
    {
      skills,
      summary: {
        totalSkills: parseInt(summary.total_skills, 10),
        enabledSkills: parseInt(summary.enabled_skills, 10),
        defaultSkills: parseInt(summary.default_skills, 10),
        categories: parseInt(summary.categories, 10),
      },
    },
    paginationMeta(total, page, limit)
  ));
});

/**
 * POST /api/admin/skills
 * 创建 skill
 */
adminSkillsRouter.post('/', async (req: Request, res: Response) => {
  const parseResult = createSkillSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const {
    name,
    slug,
    description,
    category,
    skillContent,
    icon,
    isEnabled,
    isDefault,
    sortOrder,
    version,
    compatibleRuntimes,
    i18n,
  } = parseResult.data;

  // 检查 slug 唯一性
  const existingResult = await pool.query(
    'SELECT id FROM preset_skills WHERE slug = $1',
    [slug]
  );
  if (existingResult.rows.length > 0) {
    throw new ValidationError('该 slug 已被使用');
  }

  const result = await pool.query(
    `INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, sort_order, version, compatible_runtimes, i18n)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [name, slug, description ?? null, category, skillContent, icon ?? null, isEnabled, isDefault, sortOrder, version, JSON.stringify(compatibleRuntimes), i18n ? JSON.stringify(i18n) : null]
  );

  const skill = rowToSkill(result.rows[0] as SkillRow);

  res.status(201).json(successResponse({
    message: 'Skill 创建成功',
    skill,
  }));
});

/**
 * PUT /api/admin/skills/:id
 * 更新 skill
 */
adminSkillsRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const parseResult = updateSkillSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  // 检查 skill 是否存在
  const existResult = await pool.query(
    'SELECT * FROM preset_skills WHERE id = $1',
    [id]
  );
  if (existResult.rows.length === 0) {
    throw new NotFoundError('Skill');
  }

  const updates = parseResult.data;

  // 如果更新 slug，检查唯一性
  if (updates.slug) {
    const slugCheck = await pool.query(
      'SELECT id FROM preset_skills WHERE slug = $1 AND id != $2',
      [updates.slug, id]
    );
    if (slugCheck.rows.length > 0) {
      throw new ValidationError('该 slug 已被使用');
    }
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIdx++}`);
    params.push(updates.name);
  }
  if (updates.slug !== undefined) {
    setClauses.push(`slug = $${paramIdx++}`);
    params.push(updates.slug);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIdx++}`);
    params.push(updates.description);
  }
  if (updates.category !== undefined) {
    setClauses.push(`category = $${paramIdx++}`);
    params.push(updates.category);
  }
  if (updates.skillContent !== undefined) {
    setClauses.push(`skill_content = $${paramIdx++}`);
    params.push(updates.skillContent);
  }
  if (updates.icon !== undefined) {
    setClauses.push(`icon = $${paramIdx++}`);
    params.push(updates.icon);
  }
  if (updates.isEnabled !== undefined) {
    setClauses.push(`is_enabled = $${paramIdx++}`);
    params.push(updates.isEnabled);
  }
  if (updates.isDefault !== undefined) {
    setClauses.push(`is_default = $${paramIdx++}`);
    params.push(updates.isDefault);
  }
  if (updates.sortOrder !== undefined) {
    setClauses.push(`sort_order = $${paramIdx++}`);
    params.push(updates.sortOrder);
  }
  if (updates.version !== undefined) {
    setClauses.push(`version = $${paramIdx++}`);
    params.push(updates.version);
  }
  if (updates.i18n !== undefined) {
    setClauses.push(`i18n = $${paramIdx++}`);
    params.push(updates.i18n ? JSON.stringify(updates.i18n) : null);
  }
  if (updates.compatibleRuntimes !== undefined) {
    setClauses.push(`compatible_runtimes = $${paramIdx++}`);
    params.push(JSON.stringify(updates.compatibleRuntimes));
  }

  if (setClauses.length === 0) {
    throw new ValidationError('没有需要更新的字段');
  }

  setClauses.push(`updated_at = NOW()`);
  params.push(id);

  const result = await pool.query(
    `UPDATE preset_skills SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    params
  );

  const skill = rowToSkill(result.rows[0] as SkillRow);

  res.json(successResponse({
    message: 'Skill 更新成功',
    skill,
  }));
});

/**
 * DELETE /api/admin/skills/:id
 * 删除 skill
 */
adminSkillsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await pool.query(
    'DELETE FROM preset_skills WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Skill');
  }

  res.json(successResponse({
    message: 'Skill 删除成功',
  }));
});

/**
 * PATCH /api/admin/skills/:id/toggle
 * 启用/禁用 skill
 */
adminSkillsRouter.patch('/:id/toggle', async (req: Request, res: Response) => {
  const { id } = req.params;

  // 查询当前状态
  const existResult = await pool.query(
    'SELECT id, is_enabled FROM preset_skills WHERE id = $1',
    [id]
  );

  if (existResult.rows.length === 0) {
    throw new NotFoundError('Skill');
  }

  const current = existResult.rows[0] as { id: string; is_enabled: boolean };
  const newEnabled = !current.is_enabled;

  const result = await pool.query(
    `UPDATE preset_skills SET is_enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [newEnabled, id]
  );

  const skill = rowToSkill(result.rows[0] as SkillRow);

  res.json(successResponse({
    message: newEnabled ? 'Skill 已启用' : 'Skill 已禁用',
    skill,
  }));
});

export default adminSkillsRouter;
