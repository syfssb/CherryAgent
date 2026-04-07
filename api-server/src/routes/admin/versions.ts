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

export const adminVersionsRouter = Router();

// ==========================================
// Schema 定义
// ==========================================

/**
 * 版本列表查询 Schema
 */
const listVersionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  isPublished: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  updateStrategy: z
    .enum(['none', 'optional', 'recommended', 'forced'])
    .optional(),
});

/**
 * 创建版本 Schema
 */
const createVersionSchema = z.object({
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, '版本号格式错误，应为 x.x.x'),
  downloadUrlMacArm64: z.string().url().optional(),
  downloadUrlMacX64: z.string().url().optional(),
  downloadUrlWinX64: z.string().url().optional(),
  downloadUrlLinuxX64: z.string().url().optional(),
  releaseNotes: z.string().optional(),
  releaseDate: z.coerce.date().optional(),
  updateStrategy: z
    .enum(['none', 'optional', 'recommended', 'forced'])
    .default('optional'),
  minVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/)
    .optional(),
  stagingPercentage: z.number().int().min(0).max(100).default(100),
  isPublished: z.boolean().default(false),
});

/**
 * 更新版本 Schema
 */
const updateVersionSchema = z.object({
  downloadUrlMacArm64: z.string().url().optional().nullable(),
  downloadUrlMacX64: z.string().url().optional().nullable(),
  downloadUrlWinX64: z.string().url().optional().nullable(),
  downloadUrlLinuxX64: z.string().url().optional().nullable(),
  releaseNotes: z.string().optional(),
  releaseDate: z.coerce.date().optional(),
  updateStrategy: z.enum(['none', 'optional', 'recommended', 'forced']).optional(),
  minVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/)
    .optional()
    .nullable(),
  stagingPercentage: z.number().int().min(0).max(100).optional(),
  isPublished: z.boolean().optional(),
});

// ==========================================
// 辅助函数
// ==========================================

/**
 * 比较版本号
 * 返回: 1 (v1 > v2), -1 (v1 < v2), 0 (v1 = v2)
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('-')[0]!.split('.').map(Number);
  const parts2 = v2.split('-')[0]!.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

// ==========================================
// 路由处理
// ==========================================

/**
 * 获取版本列表
 * GET /admin/versions
 */
adminVersionsRouter.get(
  '/',
  authenticateAdminAsync,
  requirePermission('versions:read'),
  validateQuery(listVersionsSchema),
  async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof listVersionsSchema>;
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.isPublished !== undefined) {
      conditions.push(`is_published = $${paramIndex++}`);
      params.push(query.isPublished);
    }

    if (query.updateStrategy) {
      conditions.push(`update_strategy = $${paramIndex++}`);
      params.push(query.updateStrategy);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询版本列表
    const versionsResult = await pool.query(
      `SELECT
         id,
         version,
         download_url_mac_arm64,
         download_url_mac_x64,
         download_url_win_x64,
         download_url_linux_x64,
         release_notes,
         release_date,
         update_strategy,
         min_version,
         staging_percentage,
         download_count_mac,
         download_count_win,
         download_count_linux,
         is_published,
         created_at
       FROM app_versions
       ${whereClause}
       ORDER BY
         string_to_array(split_part(version, '-', 1), '.')::int[] DESC,
         created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    // 查询总数
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM app_versions ${whereClause}`,
      params
    );

    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    // 获取最新发布版本
    const latestResult = await pool.query(
      `SELECT version FROM app_versions
       WHERE is_published = true
       ORDER BY string_to_array(split_part(version, '-', 1), '.')::int[] DESC
       LIMIT 1`
    );

    const latestVersion =
      latestResult.rows && latestResult.rows.length > 0
        ? (latestResult.rows[0] as { version: string }).version
        : null;

    const versions = (versionsResult.rows || []).map((row: unknown) => {
      const r = row as {
        id: string;
        version: string;
        download_url_mac_arm64: string | null;
        download_url_mac_x64: string | null;
        download_url_win_x64: string | null;
        download_url_linux_x64: string | null;
        release_notes: string | null;
        release_date: Date;
        update_strategy: string;
        min_version: string | null;
        staging_percentage: number;
        download_count_mac: number;
        download_count_win: number;
        download_count_linux: number;
        is_published: boolean;
        created_at: Date;
      };
      return {
        id: r.id,
        version: r.version,
        downloadUrls: {
          macArm64: r.download_url_mac_arm64,
          macX64: r.download_url_mac_x64,
          winX64: r.download_url_win_x64,
          linuxX64: r.download_url_linux_x64,
        },
        releaseNotes: r.release_notes,
        releaseDate: r.release_date,
        updateStrategy: r.update_strategy,
        minVersion: r.min_version,
        stagingPercentage: r.staging_percentage,
        downloadCounts: {
          mac: r.download_count_mac,
          win: r.download_count_win,
          linux: r.download_count_linux,
          total:
            r.download_count_mac + r.download_count_win + r.download_count_linux,
        },
        isPublished: r.is_published,
        isLatest: r.version === latestVersion,
        createdAt: r.created_at,
      };
    });

    res.json(
      successResponse(
        {
          versions,
          latestVersion,
        },
        paginationMeta(total, page, limit)
      )
    );
  }
);

/**
 * 获取版本详情
 * GET /admin/versions/:id
 */
adminVersionsRouter.get(
  '/:id',
  authenticateAdminAsync,
  requirePermission('versions:read'),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
         id,
         version,
         download_url_mac_arm64,
         download_url_mac_x64,
         download_url_win_x64,
         download_url_linux_x64,
         release_notes,
         release_date,
         update_strategy,
         min_version,
         staging_percentage,
         download_count_mac,
         download_count_win,
         download_count_linux,
         is_published,
         created_at
       FROM app_versions
       WHERE id = $1`,
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('版本');
    }

    const r = result.rows[0] as {
      id: string;
      version: string;
      download_url_mac_arm64: string | null;
      download_url_mac_x64: string | null;
      download_url_win_x64: string | null;
      download_url_linux_x64: string | null;
      release_notes: string | null;
      release_date: Date;
      update_strategy: string;
      min_version: string | null;
      staging_percentage: number;
      download_count_mac: number;
      download_count_win: number;
      download_count_linux: number;
      is_published: boolean;
      created_at: Date;
    };

    res.json(
      successResponse({
        version: {
          id: r.id,
          version: r.version,
          downloadUrls: {
            macArm64: r.download_url_mac_arm64,
            macX64: r.download_url_mac_x64,
            winX64: r.download_url_win_x64,
            linuxX64: r.download_url_linux_x64,
          },
          releaseNotes: r.release_notes,
          releaseDate: r.release_date,
          updateStrategy: r.update_strategy,
          minVersion: r.min_version,
          stagingPercentage: r.staging_percentage,
          downloadCounts: {
            mac: r.download_count_mac,
            win: r.download_count_win,
            linux: r.download_count_linux,
            total:
              r.download_count_mac + r.download_count_win + r.download_count_linux,
          },
          isPublished: r.is_published,
          createdAt: r.created_at,
        },
      })
    );
  }
);

/**
 * 创建新版本
 * POST /admin/versions
 */
adminVersionsRouter.post(
  '/',
  authenticateAdminAsync,
  requirePermission('versions:write'),
  validateBody(createVersionSchema),
  auditLog('version.create', 'version', {
    captureRequestBody: true,
    getDescription: (req) => `创建版本: ${req.body.version}`,
  }),
  async (req: Request, res: Response) => {
    const data = req.body as z.infer<typeof createVersionSchema>;

    // 检查版本号是否已存在
    const existingResult = await pool.query(
      `SELECT id FROM app_versions WHERE version = $1`,
      [data.version]
    );

    if (existingResult.rows && existingResult.rows.length > 0) {
      throw new ValidationError('版本号已存在');
    }

    const result = await pool.query(
      `INSERT INTO app_versions (
         version,
         download_url_mac_arm64,
         download_url_mac_x64,
         download_url_win_x64,
         download_url_linux_x64,
         release_notes,
         release_date,
         update_strategy,
         min_version,
         staging_percentage,
         is_published
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, created_at`,
      [
        data.version,
        data.downloadUrlMacArm64 || null,
        data.downloadUrlMacX64 || null,
        data.downloadUrlWinX64 || null,
        data.downloadUrlLinuxX64 || null,
        data.releaseNotes || null,
        data.releaseDate || new Date(),
        data.updateStrategy,
        data.minVersion || null,
        data.stagingPercentage,
        data.isPublished,
      ]
    );

    const created = result.rows[0] as { id: string; created_at: Date };

    res.status(201).json(
      successResponse({
        message: '版本已创建',
        version: {
          id: created.id,
          version: data.version,
          isPublished: data.isPublished,
          createdAt: created.created_at,
        },
      })
    );
  }
);

/**
 * 更新版本
 * PATCH /admin/versions/:id
 */
adminVersionsRouter.patch(
  '/:id',
  authenticateAdminAsync,
  requirePermission('versions:write'),
  validateBody(updateVersionSchema),
  auditLog('version.update', 'version', {
    getTargetId: (req) => req.params.id,
    captureRequestBody: true,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body as z.infer<typeof updateVersionSchema>;

    // 检查版本是否存在
    const existingResult = await pool.query(
      `SELECT id, version FROM app_versions WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('版本');
    }

    // 构建更新语句
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (updates.downloadUrlMacArm64 !== undefined) {
      updateFields.push(`download_url_mac_arm64 = $${paramIndex++}`);
      params.push(updates.downloadUrlMacArm64);
    }

    if (updates.downloadUrlMacX64 !== undefined) {
      updateFields.push(`download_url_mac_x64 = $${paramIndex++}`);
      params.push(updates.downloadUrlMacX64);
    }

    if (updates.downloadUrlWinX64 !== undefined) {
      updateFields.push(`download_url_win_x64 = $${paramIndex++}`);
      params.push(updates.downloadUrlWinX64);
    }

    if (updates.downloadUrlLinuxX64 !== undefined) {
      updateFields.push(`download_url_linux_x64 = $${paramIndex++}`);
      params.push(updates.downloadUrlLinuxX64);
    }

    if (updates.releaseNotes !== undefined) {
      updateFields.push(`release_notes = $${paramIndex++}`);
      params.push(updates.releaseNotes);
    }

    if (updates.releaseDate !== undefined) {
      updateFields.push(`release_date = $${paramIndex++}`);
      params.push(updates.releaseDate);
    }

    if (updates.updateStrategy !== undefined) {
      updateFields.push(`update_strategy = $${paramIndex++}`);
      params.push(updates.updateStrategy);
    }

    if (updates.minVersion !== undefined) {
      updateFields.push(`min_version = $${paramIndex++}`);
      params.push(updates.minVersion);
    }

    if (updates.stagingPercentage !== undefined) {
      updateFields.push(`staging_percentage = $${paramIndex++}`);
      params.push(updates.stagingPercentage);
    }

    if (updates.isPublished !== undefined) {
      updateFields.push(`is_published = $${paramIndex++}`);
      params.push(updates.isPublished);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('没有要更新的字段');
    }

    params.push(id);

    await pool.query(
      `UPDATE app_versions SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    res.json(
      successResponse({
        message: '版本已更新',
      })
    );
  }
);

/**
 * 发布版本
 * POST /admin/versions/:id/publish
 */
adminVersionsRouter.post(
  '/:id/publish',
  authenticateAdminAsync,
  requirePermission('versions:publish'),
  auditLog('version.publish', 'version', {
    getTargetId: (req) => req.params.id,
    getDescription: () => '发布版本',
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 检查版本是否存在
    const existingResult = await pool.query(
      `SELECT id, version, is_published FROM app_versions WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('版本');
    }

    const version = existingResult.rows[0] as {
      id: string;
      version: string;
      is_published: boolean;
    };

    if (version.is_published) {
      throw new ValidationError('版本已发布');
    }

    // 发布版本
    await pool.query(
      `UPDATE app_versions
       SET is_published = true, release_date = NOW()
       WHERE id = $1`,
      [id]
    );

    res.json(
      successResponse({
        message: '版本已发布',
        version: {
          id: version.id,
          version: version.version,
        },
      })
    );
  }
);

/**
 * 取消发布版本
 * POST /admin/versions/:id/unpublish
 */
adminVersionsRouter.post(
  '/:id/unpublish',
  authenticateAdminAsync,
  requirePermission('versions:publish'),
  auditLog('version.update', 'version', {
    getTargetId: (req) => req.params.id,
    getDescription: () => '取消发布版本',
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 检查版本是否存在
    const existingResult = await pool.query(
      `SELECT id, version, is_published FROM app_versions WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('版本');
    }

    const version = existingResult.rows[0] as {
      id: string;
      version: string;
      is_published: boolean;
    };

    if (!version.is_published) {
      throw new ValidationError('版本未发布');
    }

    // 取消发布
    await pool.query(
      `UPDATE app_versions SET is_published = false WHERE id = $1`,
      [id]
    );

    res.json(
      successResponse({
        message: '版本已取消发布',
        version: {
          id: version.id,
          version: version.version,
        },
      })
    );
  }
);

/**
 * 删除版本
 * DELETE /admin/versions/:id
 */
adminVersionsRouter.delete(
  '/:id',
  authenticateAdminAsync,
  requirePermission('versions:write'),
  auditLog('version.update', 'version', {
    getTargetId: (req) => req.params.id,
    getDescription: () => '删除版本',
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // 检查版本是否存在
    const existingResult = await pool.query(
      `SELECT id, version, is_published FROM app_versions WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('版本');
    }

    const version = existingResult.rows[0] as {
      id: string;
      version: string;
      is_published: boolean;
    };

    // 不允许删除已发布的版本
    if (version.is_published) {
      throw new ValidationError('不能删除已发布的版本，请先取消发布');
    }

    // 删除版本
    await pool.query(`DELETE FROM app_versions WHERE id = $1`, [id]);

    res.json(
      successResponse({
        message: '版本已删除',
        version: {
          id: version.id,
          version: version.version,
        },
      })
    );
  }
);

/**
 * 获取最新版本 (公开 API)
 * GET /admin/versions/latest
 */
adminVersionsRouter.get(
  '/latest/check',
  async (req: Request, res: Response) => {
    const platform = (req.query.platform as string) || 'mac_arm64';
    const currentVersion = req.query.version as string | undefined;

    const result = await pool.query(
      `SELECT
         id,
         version,
         download_url_mac_arm64,
         download_url_mac_x64,
         download_url_win_x64,
         download_url_linux_x64,
         release_notes,
         release_date,
         update_strategy,
         min_version
       FROM app_versions
       WHERE is_published = true
         AND staging_percentage > 0
       ORDER BY string_to_array(split_part(version, '-', 1), '.')::int[] DESC
       LIMIT 1`
    );

    if (!result.rows || result.rows.length === 0) {
      res.json(
        successResponse({
          updateAvailable: false,
          message: '没有可用更新',
        })
      );
      return;
    }

    const r = result.rows[0] as {
      id: string;
      version: string;
      download_url_mac_arm64: string | null;
      download_url_mac_x64: string | null;
      download_url_win_x64: string | null;
      download_url_linux_x64: string | null;
      release_notes: string | null;
      release_date: Date;
      update_strategy: string;
      min_version: string | null;
    };

    // 获取对应平台的下载链接
    const downloadUrlMap: Record<string, string | null> = {
      mac_arm64: r.download_url_mac_arm64,
      mac_x64: r.download_url_mac_x64,
      win_x64: r.download_url_win_x64,
      linux_x64: r.download_url_linux_x64,
    };

    const downloadUrl = downloadUrlMap[platform] || r.download_url_mac_arm64;

    // 检查是否有更新
    let updateAvailable = false;
    let isForced = false;

    if (currentVersion) {
      updateAvailable = compareVersions(r.version, currentVersion) > 0;

      // 检查是否强制更新
      if (updateAvailable && r.min_version) {
        isForced = compareVersions(r.min_version, currentVersion) > 0;
      }
    }

    res.json(
      successResponse({
        updateAvailable,
        version: r.version,
        downloadUrl,
        releaseNotes: r.release_notes,
        releaseDate: r.release_date,
        updateStrategy: isForced ? 'forced' : r.update_strategy,
        minVersion: r.min_version,
      })
    );
  }
);

export default adminVersionsRouter;
