/**
 * SQLite 数据库迁移系统
 *
 * 功能:
 * - 记录已执行的迁移版本
 * - 按顺序执行未执行的迁移
 * - 支持回滚到指定版本
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration, MigrationRecord } from "../../types/local-db.js";

// 导入所有迁移脚本
import migration001 from "./001-add-session-features.js";
import migration002 from "./002-memory-system.js";
import migration003 from "./003-skills.js";
import migration004 from "./004-local-settings.js";
import migration005 from "./005-fts-search.js";
import migration006 from "./006-session-skills.js";
import migration007 from "./007-messages-content.js";
import migration008 from "./008-session-provider.js";
import migration009 from "./009-skill-runtimes.js";
import migration010 from "./010-skill-unique-name.js";
import migration011 from "./011-session-model-id.js";

// 按版本号排序的迁移列表
const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011
].sort((a, b) => a.version - b.version);

export class MigrationRunner {
  private db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
    this.ensureMigrationTable();
  }

  /**
   * 确保迁移记录表存在
   */
  private ensureMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `);
  }

  /**
   * 获取已应用的迁移版本列表
   */
  getAppliedMigrations(): MigrationRecord[] {
    const rows = this.db
      .prepare(`SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC`)
      .all() as Array<{ version: number; name: string; applied_at: number }>;

    return rows.map((row) => ({
      version: row.version,
      name: row.name,
      appliedAt: row.applied_at
    }));
  }

  /**
   * 获取当前数据库版本
   */
  getCurrentVersion(): number {
    const row = this.db
      .prepare(`SELECT MAX(version) as version FROM schema_migrations`)
      .get() as { version: number | null } | undefined;

    return row?.version ?? 0;
  }

  /**
   * 获取待执行的迁移
   */
  getPendingMigrations(): Migration[] {
    const currentVersion = this.getCurrentVersion();
    return migrations.filter((m) => m.version > currentVersion);
  }

  /**
   * 运行所有待执行的迁移
   * @returns 执行的迁移数量
   */
  migrateUp(): number {
    const pending = this.getPendingMigrations();

    if (pending.length === 0) {
      return 0;
    }

    let executed = 0;

    for (const migration of pending) {
      this.runMigration(migration, "up");
      executed++;
    }

    // 迁移完成后同步 PRAGMA user_version
    const finalVersion = this.getCurrentVersion();
    this.syncUserVersion(finalVersion);

    return executed;
  }

  /**
   * 迁移到指定版本
   * @param targetVersion 目标版本，如果小于当前版本则回滚
   */
  migrateTo(targetVersion: number): { direction: "up" | "down"; count: number } {
    const currentVersion = this.getCurrentVersion();

    if (targetVersion === currentVersion) {
      return { direction: "up", count: 0 };
    }

    if (targetVersion > currentVersion) {
      // 向上迁移
      const toApply = migrations.filter(
        (m) => m.version > currentVersion && m.version <= targetVersion
      );

      for (const migration of toApply) {
        this.runMigration(migration, "up");
      }

      return { direction: "up", count: toApply.length };
    } else {
      // 向下回滚
      const toRollback = migrations
        .filter((m) => m.version > targetVersion && m.version <= currentVersion)
        .sort((a, b) => b.version - a.version); // 按版本倒序回滚

      for (const migration of toRollback) {
        this.runMigration(migration, "down");
      }

      return { direction: "down", count: toRollback.length };
    }
  }

  /**
   * 回滚最近的 N 个迁移
   * @param steps 回滚步数，默认为 1
   */
  rollback(steps = 1): number {
    const applied = this.getAppliedMigrations();

    if (applied.length === 0) {
      return 0;
    }

    const toRollback = applied
      .sort((a, b) => b.version - a.version)
      .slice(0, steps);

    for (const record of toRollback) {
      const migration = migrations.find((m) => m.version === record.version);
      if (migration) {
        this.runMigration(migration, "down");
      }
    }

    return toRollback.length;
  }

  /**
   * 回滚所有迁移
   */
  rollbackAll(): number {
    const applied = this.getAppliedMigrations();
    return this.rollback(applied.length);
  }

  /**
   * 执行单个迁移
   */
  private runMigration(migration: Migration, direction: "up" | "down"): void {
    const transaction = this.db.transaction(() => {
      if (direction === "up") {
        migration.up(this.db);
        this.db
          .prepare(
            `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`
          )
          .run(migration.version, migration.name, Date.now());
      } else {
        migration.down(this.db);
        this.db
          .prepare(`DELETE FROM schema_migrations WHERE version = ?`)
          .run(migration.version);
      }
    });

    try {
      transaction();
    } catch (error) {
      const action = direction === "up" ? "执行" : "回滚";
      throw new Error(
        `迁移${action}失败 [v${migration.version}: ${migration.name}]: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取迁移状态报告
   */
  getStatus(): {
    currentVersion: number;
    latestVersion: number;
    applied: MigrationRecord[];
    pending: Migration[];
  } {
    const applied = this.getAppliedMigrations();
    const pending = this.getPendingMigrations();
    const currentVersion = this.getCurrentVersion();
    const latestVersion = migrations.length > 0
      ? migrations[migrations.length - 1].version
      : 0;

    return {
      currentVersion,
      latestVersion,
      applied,
      pending
    };
  }

  /**
   * 检查数据库是否需要迁移
   */
  needsMigration(): boolean {
    return this.getPendingMigrations().length > 0;
  }

  /**
   * 获取所有可用的迁移
   */
  static getAllMigrations(): Migration[] {
    return [...migrations];
  }

  /**
   * 获取最新迁移版本号
   */
  static getLatestVersion(): number {
    return migrations.length > 0
      ? migrations[migrations.length - 1].version
      : 0;
  }

  /**
   * 同步 PRAGMA user_version 与 schema_migrations 表的版本
   * 确保两者保持一致
   */
  private syncUserVersion(version: number): void {
    try {
      this.db.pragma(`user_version = ${Math.floor(version)}`);
      console.info(`[migrations] PRAGMA user_version 已同步为 ${version}`);
    } catch (error) {
      console.warn(
        '[migrations] 同步 user_version 失败:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}

/**
 * 便捷函数：运行所有待执行的迁移
 */
export function runMigrations(db: BetterSqlite3.Database): number {
  const runner = new MigrationRunner(db);
  return runner.migrateUp();
}

/**
 * 便捷函数：检查并返回迁移状态
 */
export function getMigrationStatus(db: BetterSqlite3.Database): ReturnType<MigrationRunner["getStatus"]> {
  const runner = new MigrationRunner(db);
  return runner.getStatus();
}

export { migrations };
export const LATEST_MIGRATION_VERSION = MigrationRunner.getLatestVersion();
export default MigrationRunner;
