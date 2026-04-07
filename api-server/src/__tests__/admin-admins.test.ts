import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '../middleware/admin-auth.js';
import { auditLog } from '../middleware/admin-logger.js';
import { ValidationError } from '../utils/errors.js';
import {
  adminAdminsRouter,
  assertAdminDeletionAllowed,
  assertAdminPatchAllowed,
} from '../routes/admin/admins.js';

describe('管理员管理路由', () => {
  it('应注册完整路由集合', () => {
    const signatures = adminAdminsRouter.stack
      .filter((layer) => Boolean(layer.route))
      .flatMap((layer) => {
        const route = layer.route as { path: string; methods: Record<string, boolean> };
        return Object.keys(route.methods).map((method) => `${method.toUpperCase()} ${route.path}`);
      });

    expect(signatures).toContain('GET /');
    expect(signatures).toContain('GET /meta');
    expect(signatures).toContain('GET /:id');
    expect(signatures).toContain('POST /');
    expect(signatures).toContain('PATCH /:id');
    expect(signatures).toContain('DELETE /:id');
    expect(signatures).toContain('POST /:id/reset-password');
  });
});

describe('管理员权限与日志类型', () => {
  it('ROLE_PERMISSIONS 应导出并可读取', () => {
    expect(ROLE_PERMISSIONS.super_admin).toEqual(['*']);
    expect(ROLE_PERMISSIONS.admin).toContain('users:write');
    expect(ROLE_PERMISSIONS.operator).toContain('logs:read');
    expect(ROLE_PERMISSIONS.viewer).toContain('finance:read');
  });

  it('admin action 新类型可用于 auditLog', () => {
    const createLog = auditLog('admin.create', 'admin');
    const updateLog = auditLog('admin.update', 'admin');
    const deleteLog = auditLog('admin.delete', 'admin');
    const resetLog = auditLog('admin.reset_password', 'admin');

    expect(typeof createLog).toBe('function');
    expect(typeof updateLog).toBe('function');
    expect(typeof deleteLog).toBe('function');
    expect(typeof resetLog).toBe('function');
  });
});

describe('管理员 CRUD 关键约束', () => {
  it('super_admin 仅允许修改邮箱', () => {
    expect(() =>
      assertAdminPatchAllowed('super_admin', { isActive: false })
    ).toThrow(ValidationError);

    expect(() =>
      assertAdminPatchAllowed('super_admin', { role: 'admin' })
    ).toThrow(ValidationError);

    expect(() =>
      assertAdminPatchAllowed('super_admin', { permissions: ['users:read'] })
    ).toThrow(ValidationError);
  });

  it('普通管理员可修改角色/权限/状态', () => {
    expect(() =>
      assertAdminPatchAllowed('admin', {
        role: 'viewer',
        permissions: ['users:read', 'logs:read'],
        isActive: true,
      })
    ).not.toThrow();
  });

  it('禁止删除自己', () => {
    expect(() =>
      assertAdminDeletionAllowed(
        '00000000-0000-0000-0000-000000000001',
        'admin',
        '00000000-0000-0000-0000-000000000001'
      )
    ).toThrow(ValidationError);
  });

  it('禁止删除 super_admin', () => {
    expect(() =>
      assertAdminDeletionAllowed(
        '00000000-0000-0000-0000-000000000002',
        'super_admin',
        '00000000-0000-0000-0000-000000000001'
      )
    ).toThrow(ValidationError);
  });

  it('允许删除普通管理员', () => {
    expect(() =>
      assertAdminDeletionAllowed(
        '00000000-0000-0000-0000-000000000002',
        'operator',
        '00000000-0000-0000-0000-000000000001'
      )
    ).not.toThrow();
  });
});
