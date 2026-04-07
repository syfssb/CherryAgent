import bcrypt from 'bcryptjs';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/index.js';
import {
  ROLE_PERMISSIONS,
  authenticateAdminAsync,
  getEffectivePermissions,
  requireSuperAdmin,
  type AdminPermission,
  type AdminRole,
} from '../../middleware/admin-auth.js';
import { auditLog } from '../../middleware/admin-logger.js';
import {
  CommonSchemas,
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { paginationMeta, successResponse } from '../../utils/response.js';

export const adminAdminsRouter = Router();

const ADMIN_ROLE_VALUES = ['super_admin', 'admin', 'operator', 'viewer'] as const;
const ASSIGNABLE_ROLE_VALUES = ['admin', 'operator', 'viewer'] as const;
const CUSTOM_PERMISSION_VALUES = [
  'users:read',
  'users:write',
  'users:suspend',
  'users:balance',
  'finance:read',
  'finance:write',
  'finance:export',
  'channels:read',
  'channels:write',
  'channels:delete',
  'models:read',
  'models:write',
  'versions:read',
  'versions:write',
  'versions:publish',
  'dashboard:read',
  'logs:read',
  'config:read',
  'config:write',
] as const;
const ALL_PERMISSION_VALUES = ['*', ...CUSTOM_PERMISSION_VALUES] as const;

type AssignableRole = (typeof ASSIGNABLE_ROLE_VALUES)[number];

const permissionCatalog: Array<{
  key: (typeof CUSTOM_PERMISSION_VALUES)[number];
  label: string;
  category: string;
}> = [
  { key: 'users:read', label: '查看用户', category: 'users' },
  { key: 'users:write', label: '编辑用户', category: 'users' },
  { key: 'users:suspend', label: '封禁用户', category: 'users' },
  { key: 'users:balance', label: '调整余额', category: 'users' },
  { key: 'finance:read', label: '查看财务', category: 'finance' },
  { key: 'finance:write', label: '编辑财务', category: 'finance' },
  { key: 'finance:export', label: '导出财务', category: 'finance' },
  { key: 'channels:read', label: '查看渠道', category: 'channels' },
  { key: 'channels:write', label: '编辑渠道', category: 'channels' },
  { key: 'channels:delete', label: '删除渠道', category: 'channels' },
  { key: 'models:read', label: '查看模型', category: 'models' },
  { key: 'models:write', label: '编辑模型', category: 'models' },
  { key: 'versions:read', label: '查看版本', category: 'versions' },
  { key: 'versions:write', label: '编辑版本', category: 'versions' },
  { key: 'versions:publish', label: '发布版本', category: 'versions' },
  { key: 'dashboard:read', label: '查看仪表盘', category: 'dashboard' },
  { key: 'logs:read', label: '查看日志', category: 'logs' },
  { key: 'config:read', label: '查看配置', category: 'config' },
  { key: 'config:write', label: '编辑配置', category: 'config' },
];

const listAdminsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  role: z.enum(ADMIN_ROLE_VALUES).optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sortBy: z
    .enum(['createdAt', 'lastLoginAt', 'username', 'email', 'role'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const createAdminSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, '用户名不能为空')
    .max(50, '用户名最多 50 个字符')
    .regex(/^\S+$/, '用户名不能包含空格'),
  email: z
    .union([CommonSchemas.email, z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  password: z
    .string()
    .min(8, '密码至少 8 个字符')
    .max(100, '密码最多 100 个字符')
    .regex(/[A-Z]/, '密码需要包含大写字母')
    .regex(/[a-z]/, '密码需要包含小写字母')
    .regex(/[0-9]/, '密码需要包含数字'),
  role: z.enum(ASSIGNABLE_ROLE_VALUES),
  permissions: z.array(z.enum(CUSTOM_PERMISSION_VALUES)).default([]),
  isActive: z.boolean().default(true),
}).transform((data) => ({
  ...data,
  permissions: Array.from(new Set(data.permissions)),
}));

const updateAdminSchema = z
  .object({
    email: z
      .union([CommonSchemas.email, z.literal(''), z.null()])
      .optional()
      .transform((v) => (v === '' ? null : v)),
    role: z.enum(ASSIGNABLE_ROLE_VALUES).optional(),
    permissions: z.array(z.enum(CUSTOM_PERMISSION_VALUES)).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.email === undefined &&
      data.role === undefined &&
      data.permissions === undefined &&
      data.isActive === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '没有要更新的字段',
      });
    }
  })
  .transform((data) => ({
    ...data,
    permissions:
      data.permissions === undefined
        ? undefined
        : Array.from(new Set(data.permissions)),
  }));

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, '新密码至少 8 个字符')
    .max(100, '新密码最多 100 个字符')
    .regex(/[A-Z]/, '密码需要包含大写字母')
    .regex(/[a-z]/, '密码需要包含小写字母')
    .regex(/[0-9]/, '密码需要包含数字'),
});

const adminIdParamSchema = z.object({
  id: CommonSchemas.uuid,
});

interface AdminDbRow {
  id: string;
  username: string;
  email: string | null;
  role: AdminRole;
  permissions: unknown;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface AdminStatsRow {
  total: string;
  active: string;
  inactive: string;
}

interface AdminRoleStatsRow {
  role: AdminRole;
  count: string;
}

function normalizeCustomPermissions(raw: unknown): AdminPermission[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (permission): permission is AdminPermission =>
      typeof permission === 'string' &&
      (ALL_PERMISSION_VALUES as readonly string[]).includes(permission)
  );
}

function mapAdminRow(row: AdminDbRow) {
  const customPermissions = normalizeCustomPermissions(row.permissions);
  const effectivePermissions = getEffectivePermissions(row.role, customPermissions);

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    permissions: effectivePermissions,
    customPermissions,
    effectivePermissions,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function handleAdminUniqueConstraint(error: unknown): void {
  const pgError = error as { code?: string; constraint?: string };
  if (pgError.code !== '23505') {
    return;
  }

  if (pgError.constraint === 'admins_username_unique') {
    throw new ConflictError('用户名已存在');
  }

  if (pgError.constraint === 'admins_email_unique') {
    throw new ConflictError('邮箱已存在');
  }

  throw new ConflictError('管理员信息冲突');
}

export function assertAdminPatchAllowed(
  targetRole: AdminRole,
  updates: {
    role?: AssignableRole;
    permissions?: AdminPermission[];
    isActive?: boolean;
  }
): void {
  if (
    targetRole === 'super_admin' &&
    (updates.role !== undefined ||
      updates.permissions !== undefined ||
      updates.isActive !== undefined)
  ) {
    throw new ValidationError('super_admin 仅允许修改邮箱');
  }
}

export function assertAdminDeletionAllowed(
  targetAdminId: string,
  targetRole: AdminRole,
  currentAdminId: string
): void {
  if (targetAdminId === currentAdminId) {
    throw new ValidationError('不能删除自己的管理员账号');
  }

  if (targetRole === 'super_admin') {
    throw new ValidationError('不能删除 super_admin 管理员');
  }
}

/**
 * 获取管理员列表
 * GET /admin/admins
 */
adminAdminsRouter.get(
  '/',
  authenticateAdminAsync,
  requireSuperAdmin,
  validateQuery(listAdminsSchema),
  async (req: Request, res: Response) => {
    const { page, limit, search, role, isActive, sortBy, sortOrder } =
      req.query as unknown as z.infer<typeof listAdminsSchema>;

    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (search) {
      const escaped = search.replace(/[%_\\]/g, '\\$&');
      conditions.push(
        `(a.username ILIKE $${paramIndex} OR a.email ILIKE $${paramIndex})`
      );
      params.push(`%${escaped}%`);
      paramIndex++;
    }

    if (role) {
      conditions.push(`a.role = $${paramIndex++}`);
      params.push(role);
    }

    if (isActive !== undefined) {
      conditions.push(`a.is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortColumnMap: Record<z.infer<typeof listAdminsSchema>['sortBy'], string> = {
      createdAt: 'a.created_at',
      lastLoginAt: 'a.last_login_at',
      username: 'a.username',
      email: 'a.email',
      role: 'a.role',
    };
    const sortColumn = sortColumnMap[sortBy] ?? 'a.created_at';
    const nullOrder = sortBy === 'lastLoginAt' ? ' NULLS LAST' : '';
    const orderClause = `ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}${nullOrder}`;

    const adminsResult = await pool.query(
      `SELECT
         a.id,
         a.username,
         a.email,
         a.role,
         a.permissions,
         a.is_active,
         a.last_login_at,
         a.created_at,
         a.updated_at
       FROM admins a
       ${whereClause}
       ${orderClause}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM admins a ${whereClause}`,
      params
    );
    const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

    const statsResult = await pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE is_active = true) as active,
         COUNT(*) FILTER (WHERE is_active = false) as inactive
       FROM admins`
    );
    const statsRow = statsResult.rows[0] as AdminStatsRow;

    const roleStatsResult = await pool.query(
      `SELECT role, COUNT(*) as count FROM admins GROUP BY role`
    );

    const byRole: Record<AdminRole, number> = {
      super_admin: 0,
      admin: 0,
      operator: 0,
      viewer: 0,
    };
    for (const row of roleStatsResult.rows as AdminRoleStatsRow[]) {
      if ((ADMIN_ROLE_VALUES as readonly string[]).includes(row.role)) {
        byRole[row.role] = parseInt(row.count, 10);
      }
    }

    const admins = (adminsResult.rows as AdminDbRow[]).map(mapAdminRow);

    res.json(
      successResponse(
        {
          admins,
          stats: {
            total: parseInt(statsRow.total, 10),
            active: parseInt(statsRow.active, 10),
            inactive: parseInt(statsRow.inactive, 10),
            byRole,
          },
        },
        paginationMeta(total, page, limit)
      )
    );
  }
);

/**
 * 获取管理员元信息
 * GET /admin/admins/meta
 */
adminAdminsRouter.get(
  '/meta',
  authenticateAdminAsync,
  requireSuperAdmin,
  async (_req: Request, res: Response) => {
    res.json(
      successResponse({
        assignableRoles: ASSIGNABLE_ROLE_VALUES,
        permissions: permissionCatalog,
        rolePermissions: {
          super_admin: [...ROLE_PERMISSIONS.super_admin],
          admin: [...ROLE_PERMISSIONS.admin],
          operator: [...ROLE_PERMISSIONS.operator],
          viewer: [...ROLE_PERMISSIONS.viewer],
        },
      })
    );
  }
);

/**
 * 获取管理员详情
 * GET /admin/admins/:id
 */
adminAdminsRouter.get(
  '/:id',
  authenticateAdminAsync,
  requireSuperAdmin,
  validateParams(adminIdParamSchema),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const adminResult = await pool.query(
      `SELECT
         id,
         username,
         email,
         role,
         permissions,
         is_active,
         last_login_at,
         created_at,
         updated_at
       FROM admins
       WHERE id = $1`,
      [id]
    );

    if (!adminResult.rows || adminResult.rows.length === 0) {
      throw new NotFoundError('管理员');
    }

    const admin = mapAdminRow(adminResult.rows[0] as AdminDbRow);
    res.json(successResponse({ admin }));
  }
);

/**
 * 创建管理员
 * POST /admin/admins
 */
adminAdminsRouter.post(
  '/',
  authenticateAdminAsync,
  requireSuperAdmin,
  validateBody(createAdminSchema),
  auditLog('admin.create', 'admin', {
    getTargetId: (req) => (req as Request & { createdAdminId?: string }).createdAdminId,
    getDescription: (req) => `创建管理员: ${req.body.username}`,
    captureRequestBody: false,
  }),
  async (req: Request, res: Response) => {
    const payload = req.body as z.infer<typeof createAdminSchema>;
    const passwordHash = await bcrypt.hash(payload.password, 12);

    try {
      const createResult = await pool.query(
        `INSERT INTO admins (
           username,
           password_hash,
           email,
           role,
           permissions,
           is_active
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         RETURNING
           id,
           username,
           email,
           role,
           permissions,
           is_active,
           last_login_at,
           created_at,
           updated_at`,
        [
          payload.username,
          passwordHash,
          payload.email ?? null,
          payload.role,
          JSON.stringify(payload.permissions),
          payload.isActive,
        ]
      );

      const created = mapAdminRow(createResult.rows[0] as AdminDbRow);
      (req as Request & { createdAdminId?: string }).createdAdminId = created.id;

      res.json(
        successResponse({
          message: '管理员创建成功',
          admin: created,
        })
      );
    } catch (error) {
      handleAdminUniqueConstraint(error);
      throw error;
    }
  }
);

/**
 * 更新管理员
 * PATCH /admin/admins/:id
 */
adminAdminsRouter.patch(
  '/:id',
  authenticateAdminAsync,
  requireSuperAdmin,
  validateParams(adminIdParamSchema),
  validateBody(updateAdminSchema),
  auditLog('admin.update', 'admin', {
    getTargetId: (req) => req.params.id,
    getDescription: (req) => `更新管理员: ${req.params.id}`,
    captureRequestBody: true,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const payload = req.body as z.infer<typeof updateAdminSchema>;

    const existingResult = await pool.query(
      `SELECT id, role FROM admins WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('管理员');
    }

    const existing = existingResult.rows[0] as { id: string; role: AdminRole };
    assertAdminPatchAllowed(existing.role, {
      role: payload.role,
      permissions: payload.permissions as AdminPermission[] | undefined,
      isActive: payload.isActive,
    });

    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (payload.email !== undefined) {
      updateFields.push(`email = $${paramIndex++}`);
      params.push(payload.email);
    }

    if (payload.role !== undefined) {
      updateFields.push(`role = $${paramIndex++}`);
      params.push(payload.role);
    }

    if (payload.permissions !== undefined) {
      updateFields.push(`permissions = $${paramIndex++}::jsonb`);
      params.push(JSON.stringify(payload.permissions));
    }

    if (payload.isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      params.push(payload.isActive);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('没有要更新的字段');
    }

    updateFields.push('updated_at = NOW()');
    params.push(id);

    try {
      const updateResult = await pool.query(
        `UPDATE admins
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING
           id,
           username,
           email,
           role,
           permissions,
           is_active,
           last_login_at,
           created_at,
           updated_at`,
        params
      );

      const updated = mapAdminRow(updateResult.rows[0] as AdminDbRow);
      res.json(
        successResponse({
          message: '管理员信息已更新',
          admin: updated,
        })
      );
    } catch (error) {
      handleAdminUniqueConstraint(error);
      throw error;
    }
  }
);

/**
 * 删除管理员
 * DELETE /admin/admins/:id
 */
adminAdminsRouter.delete(
  '/:id',
  authenticateAdminAsync,
  requireSuperAdmin,
  validateParams(adminIdParamSchema),
  auditLog('admin.delete', 'admin', {
    getTargetId: (req) => req.params.id,
    getDescription: (req) => `删除管理员: ${req.params.id}`,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentAdminId = req.adminId!;

    const existingResult = await pool.query(
      `SELECT id, username, role FROM admins WHERE id = $1`,
      [id]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('管理员');
    }

    const existing = existingResult.rows[0] as {
      id: string;
      username: string;
      role: AdminRole;
    };

    assertAdminDeletionAllowed(existing.id, existing.role, currentAdminId);

    await pool.query(`DELETE FROM admins WHERE id = $1`, [id]);

    res.json(
      successResponse({
        message: '管理员已删除',
        admin: {
          id: existing.id,
          username: existing.username,
        },
      })
    );
  }
);

/**
 * 重置管理员密码
 * POST /admin/admins/:id/reset-password
 */
adminAdminsRouter.post(
  '/:id/reset-password',
  authenticateAdminAsync,
  requireSuperAdmin,
  validateParams(adminIdParamSchema),
  validateBody(resetPasswordSchema),
  auditLog('admin.reset_password', 'admin', {
    getTargetId: (req) => req.params.id,
    getDescription: (req) => `重置管理员密码: ${req.params.id}`,
    captureRequestBody: false,
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { newPassword } = req.body as z.infer<typeof resetPasswordSchema>;

    const existingResult = await pool.query(`SELECT id FROM admins WHERE id = $1`, [id]);
    if (!existingResult.rows || existingResult.rows.length === 0) {
      throw new NotFoundError('管理员');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, id]
    );

    res.json(
      successResponse({
        message: '管理员密码重置成功',
      })
    );
  }
);

export default adminAdminsRouter;
