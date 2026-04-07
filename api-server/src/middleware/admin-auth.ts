import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Secret, SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../db/index.js';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';
import { env } from '../utils/env.js';

// ==========================================
// 登录速率限制
// ==========================================

interface LoginAttempt {
  failCount: number;
  lockedUntil: number | null; // Unix timestamp (ms)
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 分钟

/** 基于 IP 的失败记录 */
const ipAttempts = new Map<string, LoginAttempt>();
/** 基于用户名的失败记录 */
const usernameAttempts = new Map<string, LoginAttempt>();

/**
 * 清理过期的锁定记录（避免内存泄漏）
 * 每 10 分钟执行一次
 */
function cleanupExpiredAttempts(): void {
  const now = Date.now();
  for (const [key, attempt] of ipAttempts) {
    if (attempt.lockedUntil && attempt.lockedUntil < now) {
      ipAttempts.delete(key);
    }
  }
  for (const [key, attempt] of usernameAttempts) {
    if (attempt.lockedUntil && attempt.lockedUntil < now) {
      usernameAttempts.delete(key);
    }
  }
}

setInterval(cleanupExpiredAttempts, 10 * 60 * 1000).unref();

function isLocked(attempt: LoginAttempt | undefined): boolean {
  if (!attempt) return false;
  return attempt.lockedUntil !== null && attempt.lockedUntil > Date.now();
}

function getRemainingLockSeconds(attempt: LoginAttempt): number {
  if (!attempt.lockedUntil) return 0;
  return Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
}

/**
 * 检查登录速率限制
 * 基于 IP 或用户名任一被锁定即拒绝
 */
export function checkLoginRateLimit(ip: string, username: string): void {
  const ipRecord = ipAttempts.get(ip);
  if (isLocked(ipRecord)) {
    const remaining = getRemainingLockSeconds(ipRecord!);
    throw new AuthenticationError(
      `登录尝试次数过多，请在 ${remaining} 秒后重试`
    );
  }

  const userRecord = usernameAttempts.get(username);
  if (isLocked(userRecord)) {
    const remaining = getRemainingLockSeconds(userRecord!);
    throw new AuthenticationError(
      `该账户登录尝试次数过多，请在 ${remaining} 秒后重试`
    );
  }
}

/**
 * 记录登录失败
 */
export function recordLoginFailure(ip: string, username: string): void {
  for (const [key, store] of [
    [ip, ipAttempts],
    [username, usernameAttempts],
  ] as const) {
    const record = store.get(key) || { failCount: 0, lockedUntil: null };
    const updated = {
      failCount: record.failCount + 1,
      lockedUntil:
        record.failCount + 1 >= MAX_FAILED_ATTEMPTS
          ? Date.now() + LOCKOUT_DURATION_MS
          : null,
    };
    store.set(key, updated);
  }
}

/**
 * 登录成功后清除失败记录
 */
export function clearLoginAttempts(ip: string, username: string): void {
  ipAttempts.delete(ip);
  usernameAttempts.delete(username);
}

// ==========================================
// 类型定义
// ==========================================

/**
 * 管理员角色
 */
export type AdminRole = 'super_admin' | 'admin' | 'operator' | 'viewer';

/**
 * 管理员权限
 */
export type AdminPermission =
  | '*' // 所有权限
  | 'users:read'
  | 'users:write'
  | 'users:suspend'
  | 'users:balance'
  | 'finance:read'
  | 'finance:write'
  | 'finance:export'
  | 'channels:read'
  | 'channels:write'
  | 'channels:delete'
  | 'models:read'
  | 'models:write'
  | 'versions:read'
  | 'versions:write'
  | 'versions:publish'
  | 'dashboard:read'
  | 'logs:read'
  | 'config:read'
  | 'config:write';

/**
 * 管理员 JWT Payload
 */
export interface AdminJwtPayload {
  sub: string; // 管理员 ID
  username: string;
  role: AdminRole;
  permissions: AdminPermission[];
  iat: number;
  exp: number;
}

/**
 * 管理员信息
 */
export interface AdminInfo {
  id: string;
  username: string;
  email: string | null;
  role: AdminRole;
  permissions: AdminPermission[];
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

/**
 * 扩展 Express Request 类型
 */
declare global {
  namespace Express {
    interface Request {
      admin?: AdminInfo;
      adminId?: string;
      adminRole?: AdminRole;
      adminPermissions?: AdminPermission[];
    }
  }
}

// ==========================================
// 角色权限映射
// ==========================================

/**
 * 角色默认权限
 */
export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: ['*'],
  admin: [
    'users:read',
    'users:write',
    'users:suspend',
    'users:balance',
    'finance:read',
    'finance:write',
    'finance:export',
    'channels:read',
    'channels:write',
    'models:read',
    'models:write',
    'versions:read',
    'versions:write',
    'dashboard:read',
    'logs:read',
    'config:read',
  ],
  operator: [
    'users:read',
    'users:write',
    'users:suspend',
    'finance:read',
    'channels:read',
    'models:read',
    'versions:read',
    'dashboard:read',
    'logs:read',
  ],
  viewer: [
    'users:read',
    'finance:read',
    'channels:read',
    'models:read',
    'versions:read',
    'dashboard:read',
    'logs:read',
  ],
};

// ==========================================
// 辅助函数
// ==========================================

/**
 * 获取管理员有效权限
 * 合并角色权限和自定义权限
 */
export function getEffectivePermissions(
  role: AdminRole,
  customPermissions: AdminPermission[]
): AdminPermission[] {
  const rolePermissions = ROLE_PERMISSIONS[role] || [];

  // 如果有 * 权限，则拥有所有权限
  if (rolePermissions.includes('*') || customPermissions.includes('*')) {
    return ['*'];
  }

  // 合并并去重
  const allPermissions = new Set([...rolePermissions, ...customPermissions]);
  return Array.from(allPermissions);
}

/**
 * 检查是否拥有指定权限
 */
export function hasPermission(
  permissions: AdminPermission[],
  requiredPermission: AdminPermission
): boolean {
  // * 权限拥有所有权限
  if (permissions.includes('*')) {
    return true;
  }

  return permissions.includes(requiredPermission);
}

/**
 * 检查是否拥有任意一个权限
 */
export function hasAnyPermission(
  permissions: AdminPermission[],
  requiredPermissions: AdminPermission[]
): boolean {
  if (permissions.includes('*')) {
    return true;
  }

  return requiredPermissions.some((p) => permissions.includes(p));
}

/**
 * 检查是否拥有所有指定权限
 */
export function hasAllPermissions(
  permissions: AdminPermission[],
  requiredPermissions: AdminPermission[]
): boolean {
  if (permissions.includes('*')) {
    return true;
  }

  return requiredPermissions.every((p) => permissions.includes(p));
}

// ==========================================
// 管理员认证中间件
// ==========================================

/**
 * 管理员 JWT 认证中间件
 * 验证 Authorization header 中的 Bearer token
 */
export function authenticateAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AuthenticationError('缺少 Authorization 头');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthenticationError('Authorization 格式错误，应为 Bearer <token>');
  }

  const token = parts[1];
  if (!token) {
    throw new AuthenticationError('Token 不能为空');
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      audience: 'cherry-agent:admin',
    }) as AdminJwtPayload;

    // 验证是否是管理员 token (通过检查是否有 username 字段)
    if (!payload.username || !payload.role) {
      throw new AuthenticationError('无效的管理员 Token');
    }

    req.adminId = payload.sub;
    req.adminRole = payload.role;
    req.adminPermissions = getEffectivePermissions(
      payload.role,
      payload.permissions || []
    );

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token 已过期');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('无效的 Token');
    }
    throw error;
  }
}

/**
 * 异步管理员认证中间件
 * 额外验证管理员账户是否仍然有效
 */
export async function authenticateAdminAsync(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AuthenticationError('缺少 Authorization 头');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthenticationError('Authorization 格式错误');
  }

  const token = parts[1];
  if (!token) {
    throw new AuthenticationError('Token 不能为空');
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      audience: 'cherry-agent:admin',
    }) as AdminJwtPayload;

    if (!payload.username || !payload.role) {
      throw new AuthenticationError('无效的管理员 Token');
    }

    // 从数据库验证管理员账户
    const adminResult = await pool.query(
      `SELECT id, username, email, role, permissions, is_active, last_login_at, created_at
       FROM admins
       WHERE id = $1 AND is_active = true`,
      [payload.sub]
    );

    if (!adminResult.rows || adminResult.rows.length === 0) {
      throw new AuthenticationError('管理员账户不存在或已被禁用');
    }

    const admin = adminResult.rows[0] as {
      id: string;
      username: string;
      email: string | null;
      role: string;
      permissions: AdminPermission[];
      is_active: boolean;
      last_login_at: Date | null;
      created_at: Date;
    };

    req.adminId = admin.id;
    req.adminRole = admin.role as AdminRole;
    req.adminPermissions = getEffectivePermissions(
      admin.role as AdminRole,
      admin.permissions || []
    );
    req.admin = {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role as AdminRole,
      permissions: req.adminPermissions,
      isActive: admin.is_active,
      lastLoginAt: admin.last_login_at,
      createdAt: admin.created_at,
    };

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token 已过期');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('无效的 Token');
    }
    throw error;
  }
}

// ==========================================
// 权限检查中间件
// ==========================================

/**
 * 要求特定权限的中间件工厂
 * @param requiredPermission - 需要的权限
 */
export function requirePermission(requiredPermission: AdminPermission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.adminId || !req.adminPermissions) {
      throw new AuthenticationError('需要先登录');
    }

    if (!hasPermission(req.adminPermissions, requiredPermission)) {
      throw new AuthorizationError(
        `需要 ${requiredPermission} 权限`
      );
    }

    next();
  };
}

/**
 * 要求任意一个权限的中间件工厂
 * @param requiredPermissions - 需要的权限列表 (满足任意一个即可)
 */
export function requireAnyPermission(...requiredPermissions: AdminPermission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.adminId || !req.adminPermissions) {
      throw new AuthenticationError('需要先登录');
    }

    if (!hasAnyPermission(req.adminPermissions, requiredPermissions)) {
      throw new AuthorizationError(
        `需要以下权限之一: ${requiredPermissions.join(', ')}`
      );
    }

    next();
  };
}

/**
 * 要求所有权限的中间件工厂
 * @param requiredPermissions - 需要的权限列表 (必须全部满足)
 */
export function requireAllPermissions(...requiredPermissions: AdminPermission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.adminId || !req.adminPermissions) {
      throw new AuthenticationError('需要先登录');
    }

    if (!hasAllPermissions(req.adminPermissions, requiredPermissions)) {
      throw new AuthorizationError(
        `需要以下全部权限: ${requiredPermissions.join(', ')}`
      );
    }

    next();
  };
}

/**
 * 要求特定角色的中间件工厂
 * @param allowedRoles - 允许的角色列表
 */
export function requireRole(...allowedRoles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.adminId || !req.adminRole) {
      throw new AuthenticationError('需要先登录');
    }

    if (!allowedRoles.includes(req.adminRole)) {
      throw new AuthorizationError(
        `需要 ${allowedRoles.join(' 或 ')} 角色`
      );
    }

    next();
  };
}

/**
 * 仅超级管理员的中间件
 */
export function requireSuperAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.adminId || !req.adminRole) {
    throw new AuthenticationError('需要先登录');
  }

  if (req.adminRole !== 'super_admin') {
    throw new AuthorizationError('需要超级管理员权限');
  }

  next();
}

// ==========================================
// Token 生成
// ==========================================

/**
 * 生成管理员 JWT Token
 */
export function generateAdminToken(
  adminId: string,
  username: string,
  role: AdminRole,
  permissions: AdminPermission[]
): { accessToken: string; expiresIn: number } {
  const effectivePermissions = getEffectivePermissions(role, permissions);

  const payload: Omit<AdminJwtPayload, 'iat' | 'exp'> = {
    sub: adminId,
    username,
    role,
    permissions: effectivePermissions,
  };

  const secret: Secret = env.JWT_SECRET;
  const accessToken = jwt.sign(payload, secret, {
    expiresIn: env.ADMIN_JWT_EXPIRES_IN as SignOptions['expiresIn'],
    audience: 'cherry-agent:admin',
  });

  const decoded = jwt.decode(accessToken) as AdminJwtPayload;
  const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

  return { accessToken, expiresIn };
}

/**
 * 验证管理员密码
 */
export async function verifyAdminPassword(
  username: string,
  password: string
): Promise<AdminInfo> {
  const result = await pool.query(
    `SELECT id, username, email, password_hash, role, permissions, is_active, last_login_at, created_at
     FROM admins
     WHERE username = $1`,
    [username]
  );

  if (!result.rows || result.rows.length === 0) {
    throw new AuthenticationError('用户名或密码错误');
  }

  const admin = result.rows[0] as {
    id: string;
    username: string;
    email: string | null;
    password_hash: string;
    role: string;
    permissions: AdminPermission[];
    is_active: boolean;
    last_login_at: Date | null;
    created_at: Date;
  };

  if (!admin.is_active) {
    throw new AuthenticationError('账户已被禁用');
  }

  const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
  if (!isPasswordValid) {
    throw new AuthenticationError('用户名或密码错误');
  }

  return {
    id: admin.id,
    username: admin.username,
    email: admin.email,
    role: admin.role as AdminRole,
    permissions: getEffectivePermissions(
      admin.role as AdminRole,
      admin.permissions || []
    ),
    isActive: admin.is_active,
    lastLoginAt: admin.last_login_at,
    createdAt: admin.created_at,
  };
}

/**
 * 更新管理员最后登录时间
 */
export async function updateAdminLastLogin(adminId: string): Promise<void> {
  await pool.query(
    `UPDATE admins SET last_login_at = NOW() WHERE id = $1`,
    [adminId]
  );
}
