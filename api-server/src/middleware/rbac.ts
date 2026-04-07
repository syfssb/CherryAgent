import type { Request, Response, NextFunction } from 'express';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  type AdminPermission,
  type AdminRole,
} from './admin-auth.js';

function getAdminRole(req: Request): AdminRole | null {
  return req.adminRole ?? req.admin?.role ?? null;
}

function getAdminPermissions(req: Request): AdminPermission[] {
  return req.adminPermissions ?? req.admin?.permissions ?? [];
}

function assertAdminContext(req: Request): void {
  if (!req.admin && !req.adminRole && !req.adminPermissions) {
    throw new AuthenticationError('管理员未登录');
  }
}

/**
 * 角色校验中间件
 */
export function requireAdminRole(roles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertAdminContext(req);
      const role = getAdminRole(req);
      if (!role || !roles.includes(role)) {
        throw new AuthorizationError('角色权限不足');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 单权限校验中间件
 */
export function requirePermission(permission: AdminPermission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertAdminContext(req);
      const permissions = getAdminPermissions(req);
      if (!hasPermission(permissions, permission)) {
        throw new AuthorizationError('权限不足');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 任意权限校验中间件
 */
export function requireAnyPermission(permissions: AdminPermission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertAdminContext(req);
      const currentPermissions = getAdminPermissions(req);
      if (!hasAnyPermission(currentPermissions, permissions)) {
        throw new AuthorizationError('权限不足');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 全部权限校验中间件
 */
export function requireAllPermissions(permissions: AdminPermission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertAdminContext(req);
      const currentPermissions = getAdminPermissions(req);
      if (!hasAllPermissions(currentPermissions, permissions)) {
        throw new AuthorizationError('权限不足');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

