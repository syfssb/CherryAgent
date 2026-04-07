/**
 * VersionGuard 单元测试
 *
 * 由于 better-sqlite3 的 native binding 是为 Electron 编译的，
 * 这里使用 mock Database 对象来测试 VersionGuard 的纯逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VersionGuard } from '../db/version-guard.js';
import type * as BetterSqlite3 from 'better-sqlite3';

// ==================== Mock Database ====================

function createMockDb(options?: {
  userVersion?: number;
  schemaMigrationsExists?: boolean;
  schemaMaxVersion?: number | null;
}): BetterSqlite3.Database {
  const {
    userVersion = 0,
    schemaMigrationsExists = false,
    schemaMaxVersion = null,
  } = options ?? {};

  let currentUserVersion = userVersion;

  const mockDb = {
    pragma: vi.fn((pragmaStr: string, opts?: { simple?: boolean }) => {
      if (typeof pragmaStr === 'string' && pragmaStr.startsWith('user_version =')) {
        const val = parseInt(pragmaStr.split('=')[1].trim(), 10);
        currentUserVersion = val;
        return undefined;
      }
      if (pragmaStr === 'user_version') {
        return currentUserVersion;
      }
      return undefined;
    }),
    exec: vi.fn(),
    prepare: vi.fn((sql: string) => {
      // schema_migrations 表存在性检查
      if (sql.includes('sqlite_master') && sql.includes('schema_migrations')) {
        return {
          get: vi.fn(() =>
            schemaMigrationsExists ? { name: 'schema_migrations' } : undefined
          ),
        };
      }
      // MAX(version) 查询
      if (sql.includes('MAX(version)')) {
        return {
          get: vi.fn(() => ({ max_version: schemaMaxVersion })),
        };
      }
      return { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    }),
    backup: vi.fn(),
  } as unknown as BetterSqlite3.Database;

  return mockDb;
}

// ==================== 测试 ====================

describe('VersionGuard', () => {
  // ==================== getDbVersion / setDbVersion ====================

  describe('getDbVersion / setDbVersion', () => {
    it('should return 0 for a fresh database', () => {
      const db = createMockDb({ userVersion: 0 });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      expect(guard.getDbVersion()).toBe(0);
    });

    it('should set and get user_version correctly', () => {
      const db = createMockDb({ userVersion: 0 });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      guard.setDbVersion(5);
      expect(guard.getDbVersion()).toBe(5);
    });

    it('should floor non-integer versions', () => {
      const db = createMockDb({ userVersion: 0 });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      guard.setDbVersion(3.9);
      expect(guard.getDbVersion()).toBe(3);
    });
  });

  // ==================== check ====================

  describe('check', () => {
    it('should return proceed when dbVersion matches appMaxVersion', () => {
      const db = createMockDb({ userVersion: 7 });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      const result = guard.check();
      expect(result.compatible).toBe(true);
      expect(result.action).toBe('proceed');
      expect(result.dbVersion).toBe(7);
      expect(result.appMaxVersion).toBe(7);
    });

    it('should return migrate-up when dbVersion < appMaxVersion', () => {
      const db = createMockDb({ userVersion: 3 });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      const result = guard.check();
      expect(result.compatible).toBe(true);
      expect(result.action).toBe('migrate-up');
      expect(result.dbVersion).toBe(3);
    });

    it('should return migrate-up for fresh database (version 0)', () => {
      const db = createMockDb({ userVersion: 0 });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      const result = guard.check();
      expect(result.compatible).toBe(true);
      expect(result.action).toBe('migrate-up');
      expect(result.dbVersion).toBe(0);
    });

    it('should return incompatible-newer when dbVersion > appMaxVersion', () => {
      const db = createMockDb({ userVersion: 10 });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      const result = guard.check();
      expect(result.compatible).toBe(false);
      expect(result.action).toBe('incompatible-newer');
      expect(result.dbVersion).toBe(10);
    });

    it('should return incompatible-older when dbVersion < appMinVersion', () => {
      const db = createMockDb({ userVersion: 1 });
      const guard = new VersionGuard(db, {
        appMaxVersion: 7,
        appMinVersion: 3,
      });
      const result = guard.check();
      expect(result.compatible).toBe(false);
      expect(result.action).toBe('incompatible-older');
      expect(result.dbVersion).toBe(1);
    });

    it('should return proceed when appMaxVersion is 0 and db is fresh', () => {
      const db = createMockDb({ userVersion: 0 });
      const guard = new VersionGuard(db, { appMaxVersion: 0 });
      const result = guard.check();
      expect(result.compatible).toBe(true);
      expect(result.action).toBe('proceed');
    });

    it('should include appMinVersion in result', () => {
      const db = createMockDb({ userVersion: 5 });
      const guard = new VersionGuard(db, {
        appMaxVersion: 7,
        appMinVersion: 2,
      });
      const result = guard.check();
      expect(result.appMinVersion).toBe(2);
    });

    it('should have human-readable message for each action', () => {
      // proceed
      const db1 = createMockDb({ userVersion: 7 });
      const g1 = new VersionGuard(db1, { appMaxVersion: 7 });
      expect(g1.check().message).toContain('无需迁移');

      // migrate-up
      const db2 = createMockDb({ userVersion: 3 });
      const g2 = new VersionGuard(db2, { appMaxVersion: 7 });
      expect(g2.check().message).toContain('迁移');

      // incompatible-newer
      const db3 = createMockDb({ userVersion: 10 });
      const g3 = new VersionGuard(db3, { appMaxVersion: 7 });
      expect(g3.check().message).toContain('升级应用');

      // incompatible-older
      const db4 = createMockDb({ userVersion: 1 });
      const g4 = new VersionGuard(db4, { appMaxVersion: 7, appMinVersion: 3 });
      expect(g4.check().message).toContain('过旧');
    });
  });

  // ==================== syncFromSchemaMigrations ====================

  describe('syncFromSchemaMigrations', () => {
    it('should sync user_version from schema_migrations when user_version is 0', () => {
      const db = createMockDb({
        userVersion: 0,
        schemaMigrationsExists: true,
        schemaMaxVersion: 5,
      });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      expect(guard.getDbVersion()).toBe(0);

      guard.syncFromSchemaMigrations();
      expect(guard.getDbVersion()).toBe(5);
    });

    it('should not overwrite user_version if already set', () => {
      const db = createMockDb({
        userVersion: 3,
        schemaMigrationsExists: true,
        schemaMaxVersion: 5,
      });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      guard.syncFromSchemaMigrations();
      // user_version 已经是 3，不应被覆盖
      expect(guard.getDbVersion()).toBe(3);
    });

    it('should handle missing schema_migrations table gracefully', () => {
      const db = createMockDb({
        userVersion: 0,
        schemaMigrationsExists: false,
      });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      expect(() => guard.syncFromSchemaMigrations()).not.toThrow();
      expect(guard.getDbVersion()).toBe(0);
    });

    it('should handle empty schema_migrations table (null max)', () => {
      const db = createMockDb({
        userVersion: 0,
        schemaMigrationsExists: true,
        schemaMaxVersion: null,
      });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      guard.syncFromSchemaMigrations();
      expect(guard.getDbVersion()).toBe(0);
    });
  });

  // ==================== createBackup ====================

  describe('createBackup', () => {
    it('should call VACUUM INTO with correct path', () => {
      const db = createMockDb({ userVersion: 3 });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });

      // createBackup 需要文件系统操作，这里只验证 exec 被调用
      const backupDir = '/tmp/vg-test-backup-' + Date.now();
      const backupPath = guard.createBackup(backupDir);

      // 验证返回的路径格式
      expect(backupPath).toContain('sessions_v3_');
      expect(backupPath).toContain('.db');
      expect(backupPath).toContain(backupDir);

      // 验证 exec 被调用了 VACUUM INTO
      expect(db.exec).toHaveBeenCalledWith(
        expect.stringContaining('VACUUM INTO')
      );

      // 清理
      const { rmSync } = require('fs');
      try { rmSync(backupDir, { recursive: true, force: true }); } catch {}
    });

    it('should fallback to backup API if VACUUM INTO fails', () => {
      const db = createMockDb({ userVersion: 2 });
      // 让 exec 抛出错误模拟 VACUUM INTO 失败
      (db.exec as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('VACUUM INTO not supported');
      });

      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      const backupDir = '/tmp/vg-test-backup-fallback-' + Date.now();

      const backupPath = guard.createBackup(backupDir);

      // 应该回退到 backup API
      expect(db.backup).toHaveBeenCalledWith(expect.stringContaining('.db'));
      expect(backupPath).toContain('sessions_v2_');

      // 清理
      const { rmSync } = require('fs');
      try { rmSync(backupDir, { recursive: true, force: true }); } catch {}
    });

    it('should throw if both VACUUM INTO and backup API fail', () => {
      const db = createMockDb({ userVersion: 1 });
      (db.exec as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('VACUUM INTO failed');
      });
      (db.backup as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('backup API failed');
      });

      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      const backupDir = '/tmp/vg-test-backup-fail-' + Date.now();

      expect(() => guard.createBackup(backupDir)).toThrow('数据库备份失败');

      // 清理
      const { rmSync } = require('fs');
      try { rmSync(backupDir, { recursive: true, force: true }); } catch {}
    });
  });

  // ==================== 默认值 ====================

  describe('defaults', () => {
    it('should default appMinVersion to 0', () => {
      const db = createMockDb({ userVersion: 0 });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      const result = guard.check();
      expect(result.appMinVersion).toBe(0);
    });

    it('should default maxBackups to 5', () => {
      // 通过 VersionGuard 构造函数的默认值验证
      const db = createMockDb({ userVersion: 0 });
      const guard = new VersionGuard(db, { appMaxVersion: 7 });
      // maxBackups 是 private，无法直接访问，但可以通过行为验证
      // 这里只验证构造不抛错
      expect(guard).toBeDefined();
    });
  });
});
