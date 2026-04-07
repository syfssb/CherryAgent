/**
 * 公开 API - Skill 路由
 *
 * 功能:
 * - GET /api/skills          - 获取已启用的 skill 列表（元数据，不含完整内容）
 * - GET /api/skills/defaults  - 获取默认安装的 skill 列表（含完整内容）
 * - GET /api/skills/version   - 获取 skill 版本信息（用于客户端轮询）
 * - GET /api/skills/:slug     - 获取单个 skill 完整内容
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db/index.js';
import { successResponse } from '../utils/response.js';
import { NotFoundError } from '../utils/errors.js';
import { resolveI18n, getLocaleFromQuery } from '../utils/i18n.js';

export const publicSkillsRouter = Router();

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
  created_at: string;
  updated_at: string;
  i18n: Record<string, Record<string, string>> | null;
}

/**
 * GET /api/skills/version
 * 返回技能的版本摘要（最后更新时间 + 数量），供客户端轮询判断是否需要刷新
 */
publicSkillsRouter.get('/version', async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT MAX(updated_at) as last_updated, COUNT(*)::int as count
     FROM preset_skills
     WHERE is_enabled = true`
  );

  const row = result.rows[0] as { last_updated: string | null; count: number };

  res.json(successResponse({
    lastUpdated: row.last_updated,
    count: row.count ?? 0,
  }));
});

/**
 * GET /api/skills
 * 获取已启用的 skill 列表（不含完整内容，只含元数据）
 * 支持 ?lang=zh|zh-TW|ja 查询参数返回对应语言内容
 */
publicSkillsRouter.get('/', async (req: Request, res: Response) => {
  const locale = getLocaleFromQuery(req.query as Record<string, unknown>);

  const result = await pool.query(
    `SELECT id, name, slug, description, category, icon, is_default, sort_order, version, updated_at, i18n
     FROM preset_skills
     WHERE is_enabled = true
     ORDER BY sort_order ASC, name ASC
     LIMIT 200`
  );

  const skills = (result.rows as SkillRow[]).map((row) => {
    const localized = resolveI18n(row.i18n, locale, {
      name: row.name,
      description: row.description,
    });
    return {
      id: row.id,
      name: localized.name,
      slug: row.slug,
      description: localized.description,
      category: row.category,
      icon: row.icon,
      isDefault: row.is_default,
      sortOrder: row.sort_order,
      version: row.version,
      updatedAt: row.updated_at,
    };
  });

  res.json(successResponse({ skills }));
});

/**
 * GET /api/skills/defaults
 * 获取默认安装的 skill 列表（含完整内容，供桌面端安装使用）
 * 返回完整 i18n 字段，让客户端自行选择语言
 */
publicSkillsRouter.get('/defaults', async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT id, name, slug, description, category, skill_content, icon, sort_order, version, updated_at, i18n
     FROM preset_skills
     WHERE is_enabled = true AND is_default = true
     ORDER BY sort_order ASC, name ASC`
  );

  const skills = (result.rows as SkillRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category,
    skillContent: row.skill_content,
    icon: row.icon,
    sortOrder: row.sort_order,
    version: row.version,
    updatedAt: row.updated_at,
    i18n: row.i18n ?? {},
  }));

  res.json(successResponse({ skills }));
});

/**
 * GET /api/skills/:slug
 * 获取单个 skill 完整内容
 * 支持 ?lang=zh|zh-TW|ja 查询参数返回对应语言内容
 */
publicSkillsRouter.get('/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;
  const locale = getLocaleFromQuery(req.query as Record<string, unknown>);

  const result = await pool.query(
    `SELECT id, name, slug, description, category, skill_content, icon, is_default, sort_order, version, updated_at, i18n
     FROM preset_skills
     WHERE slug = $1 AND is_enabled = true`,
    [slug]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Skill');
  }

  const row = result.rows[0] as SkillRow;
  const localized = resolveI18n(row.i18n, locale, {
    name: row.name,
    description: row.description,
  });

  res.json(successResponse({
    skill: {
      id: row.id,
      name: localized.name,
      slug: row.slug,
      description: localized.description,
      category: row.category,
      skillContent: row.skill_content,
      icon: row.icon,
      isDefault: row.is_default,
      sortOrder: row.sort_order,
      version: row.version,
      updatedAt: row.updated_at,
    },
  }));
});

export default publicSkillsRouter;
