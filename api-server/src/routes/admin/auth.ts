import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { successResponse } from '../../utils/response.js';
import { validateBody } from '../../middleware/validate.js';
import {
  authenticateAdmin,
  authenticateAdminAsync,
  generateAdminToken,
  verifyAdminPassword,
  updateAdminLastLogin,
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginAttempts,
} from '../../middleware/admin-auth.js';
import { logAdminAction, withAdminLog } from '../../middleware/admin-logger.js';
import { AuthenticationError } from '../../utils/errors.js';
import { pool } from '../../db/index.js';

export const adminAuthRouter = Router();

// ==========================================
// Schema 定义
// ==========================================

/**
 * 登录请求 Schema
 */
const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(50),
  password: z.string().min(1, '密码不能为空'),
});

/**
 * 修改密码请求 Schema
 */
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '当前密码不能为空'),
  newPassword: z
    .string()
    .min(8, '新密码至少 8 个字符')
    .max(100, '新密码最多 100 个字符')
    .regex(/[A-Z]/, '密码需要包含大写字母')
    .regex(/[a-z]/, '密码需要包含小写字母')
    .regex(/[0-9]/, '密码需要包含数字'),
});

// ==========================================
// 路由处理
// ==========================================

/**
 * 管理员登录
 * POST /admin/auth/login
 */
adminAuthRouter.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request, res: Response) => {
    const { username, password } = req.body;

    // 获取客户端 IP
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string'
      ? forwarded.split(',')[0]!.trim()
      : req.ip || req.socket.remoteAddress || 'unknown';

    // 检查速率限制
    checkLoginRateLimit(ip, username);

    // 验证密码（失败时记录并抛出）
    let admin;
    try {
      admin = await verifyAdminPassword(username, password);
    } catch (error) {
      recordLoginFailure(ip, username);
      throw error;
    }

    // 登录成功，清除失败记录
    clearLoginAttempts(ip, username);

    // 生成 Token
    const { accessToken, expiresIn } = generateAdminToken(
      admin.id,
      admin.username,
      admin.role,
      admin.permissions
    );

    // 更新最后登录时间
    await updateAdminLastLogin(admin.id);

    // 记录登录日志
    await logAdminAction(
      admin.id,
      {
        action: 'admin.login',
        targetType: 'admin',
        targetId: admin.id,
        description: `管理员 ${admin.username} 登录`,
      },
      req
    );

    res.json(
      successResponse({
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
        },
        accessToken,
        expiresIn,
      })
    );
  }
);

/**
 * 管理员登出
 * POST /admin/auth/logout
 */
adminAuthRouter.post(
  '/logout',
  authenticateAdmin,
  withAdminLog('admin.logout', (req) => ({
    targetType: 'admin',
    targetId: req.adminId,
    description: '管理员登出',
  })),
  async (_req: Request, res: Response) => {
    // 客户端需要删除本地存储的 token
    // 服务端可以实现 token 黑名单机制（可选）

    res.json(
      successResponse({
        message: '登出成功',
      })
    );
  }
);

/**
 * 获取当前管理员信息
 * GET /admin/auth/me
 */
adminAuthRouter.get(
  '/me',
  authenticateAdminAsync,
  async (req: Request, res: Response) => {
    if (!req.admin) {
      throw new AuthenticationError('未登录');
    }

    res.json(
      successResponse({
        admin: {
          id: req.admin.id,
          username: req.admin.username,
          email: req.admin.email,
          role: req.admin.role,
          permissions: req.admin.permissions,
          lastLoginAt: req.admin.lastLoginAt,
          createdAt: req.admin.createdAt,
        },
      })
    );
  }
);

/**
 * 修改密码
 * POST /admin/auth/change-password
 */
adminAuthRouter.post(
  '/change-password',
  authenticateAdminAsync,
  validateBody(changePasswordSchema),
  withAdminLog('admin.password_change', (req) => ({
    targetType: 'admin',
    targetId: req.adminId,
    description: '修改密码',
  })),
  async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.adminId!;

    // 验证当前密码
    const result = await pool.query(
      `SELECT password_hash FROM admins WHERE id = $1`,
      [adminId]
    );

    if (!result.rows || result.rows.length === 0) {
      throw new AuthenticationError('管理员不存在');
    }

    const admin = result.rows[0] as { password_hash: string };

    const bcrypt = await import('bcryptjs');
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      admin.password_hash
    );

    if (!isPasswordValid) {
      throw new AuthenticationError('当前密码错误');
    }

    // 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // 更新密码
    await pool.query(
      `UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newPasswordHash, adminId]
    );

    res.json(
      successResponse({
        message: '密码修改成功',
      })
    );
  }
);

/**
 * 刷新 Token
 * POST /admin/auth/refresh
 */
adminAuthRouter.post(
  '/refresh',
  authenticateAdminAsync,
  async (req: Request, res: Response) => {
    if (!req.admin) {
      throw new AuthenticationError('未登录');
    }

    // 生成新的 Token
    const { accessToken, expiresIn } = generateAdminToken(
      req.admin.id,
      req.admin.username,
      req.admin.role,
      req.admin.permissions
    );

    res.json(
      successResponse({
        accessToken,
        expiresIn,
      })
    );
  }
);

export default adminAuthRouter;
