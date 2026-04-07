/**
 * 管理后台 - 外部 Skills 管理路由
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin } from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { successResponse, paginationMeta } from '../../utils/response.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';
import {
  fetchSkillsFromMultipleRepos,
  DEFAULT_SKILL_REPOS,
} from '../../services/github-skills-fetcher.js';

export const adminExternalSkillsRouter = Router();

// 所有路由需要管理员认证
adminExternalSkillsRouter.use(authenticateAdmin);

/**
 * GET /api/admin/external-skills
 * 获取外部 skills 列表
 */
adminExternalSkillsRouter.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status as string | undefined;
  const sourceFilter = req.query.source as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (statusFilter) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(statusFilter);
  }

  if (sourceFilter) {
    conditions.push(`source = $${paramIdx++}`);
    params.push(sourceFilter);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 查总数
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM external_skills ${whereClause}`,
    params
  );
  const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

  // 查分页数据
  const dataResult = await pool.query(
    `SELECT * FROM external_skills ${whereClause}
     ORDER BY fetched_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  res.json(
    successResponse(
      { skills: dataResult.rows },
      paginationMeta(total, page, limit)
    )
  );
});

/**
 * POST /api/admin/external-skills/fetch
 * 从 GitHub 抓取外部 skills
 */
adminExternalSkillsRouter.post('/fetch', async (req: Request, res: Response) => {
  const schema = z.object({
    repos: z
      .array(
        z.object({
          owner: z.string(),
          repo: z.string(),
          skillsPath: z.string().optional(),
        })
      )
      .optional(),
  });

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const repos = parseResult.data.repos || DEFAULT_SKILL_REPOS;

  try {
    const skills = await fetchSkillsFromMultipleRepos(repos);

    // 存储到数据库
    let inserted = 0;
    let skipped = 0;

    for (const skill of skills) {
      try {
        await pool.query(
          `INSERT INTO external_skills (source, repo_url, skill_slug, name, description, category, skill_content, icon, version, metadata, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
           ON CONFLICT (source, repo_url, skill_slug) DO UPDATE
           SET skill_content = EXCLUDED.skill_content,
               version = EXCLUDED.version,
               updated_at = NOW()`,
          [
            skill.source,
            skill.repoUrl,
            skill.skillSlug,
            skill.name,
            skill.description,
            skill.category,
            skill.skillContent,
            skill.icon,
            skill.version,
            JSON.stringify(skill.metadata),
          ]
        );
        inserted++;
      } catch (error) {
        console.error(`Failed to insert skill ${skill.name}:`, error);
        skipped++;
      }
    }

    res.json(
      successResponse({
        message: `成功抓取 ${skills.length} 个 skills`,
        inserted,
        skipped,
        total: skills.length,
      })
    );
  } catch (error) {
    throw new Error(`抓取失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
});

/**
 * POST /api/admin/external-skills/:id/import
 * 导入外部 skill 到 preset_skills
 */
adminExternalSkillsRouter.post('/:id/import', async (req: Request, res: Response) => {
  const { id } = req.params;
  const schema = z.object({
    isDefault: z.boolean().default(true),
  });

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const { isDefault } = parseResult.data;

  // 查询外部 skill
  const externalResult = await pool.query(
    'SELECT * FROM external_skills WHERE id = $1',
    [id]
  );

  if (externalResult.rows.length === 0) {
    throw new NotFoundError('External Skill');
  }

  const external = externalResult.rows[0] as {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    skill_content: string;
    icon: string | null;
    version: string | null;
    skill_slug: string;
  };

  // 检查是否已导入
  const existingResult = await pool.query(
    'SELECT id FROM preset_skills WHERE slug = $1',
    [external.skill_slug]
  );

  if (existingResult.rows.length > 0) {
    throw new ValidationError('该 skill 已存在于 preset_skills 中');
  }

  // 导入到 preset_skills
  const insertResult = await pool.query(
    `INSERT INTO preset_skills (name, slug, description, category, skill_content, icon, is_enabled, is_default, version, compatible_runtimes)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9)
     RETURNING id`,
    [
      external.name,
      external.skill_slug,
      external.description,
      external.category || 'other',
      external.skill_content,
      external.icon,
      isDefault,
      external.version || '1.0.0',
      JSON.stringify(['claude', 'codex']),
    ]
  );

  const presetId = (insertResult.rows[0] as { id: string }).id;

  // 更新外部 skill 状态
  await pool.query(
    `UPDATE external_skills
     SET status = 'imported', imported_to_preset_id = $1, updated_at = NOW()
     WHERE id = $2`,
    [presetId, id]
  );

  res.json(
    successResponse({
      message: 'Skill 导入成功',
      presetSkillId: presetId,
    })
  );
});

/**
 * PATCH /api/admin/external-skills/:id/status
 * 更新外部 skill 状态
 */
adminExternalSkillsRouter.patch('/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const schema = z.object({
    status: z.enum(['pending', 'approved', 'rejected']),
  });

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('参数验证失败', parseResult.error.errors);
  }

  const { status } = parseResult.data;

  const result = await pool.query(
    `UPDATE external_skills SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('External Skill');
  }

  res.json(
    successResponse({
      message: '状态更新成功',
      skill: result.rows[0],
    })
  );
});

/**
 * DELETE /api/admin/external-skills/:id
 * 删除外部 skill
 */
adminExternalSkillsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await pool.query(
    'DELETE FROM external_skills WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('External Skill');
  }

  res.json(successResponse({ message: 'External Skill 删除成功' }));
});

export default adminExternalSkillsRouter;
