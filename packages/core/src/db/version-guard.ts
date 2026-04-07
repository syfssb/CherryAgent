/**
 * DB 版本回滚保护 (Version Guard)
 *
 * 使用 SQLite PRAGMA user_version 做快速版本检查，
 * 与现有 schema_migrations 表双重保障。
 *
 * - 版本不兼容时阻止启动，提示升级
 * - 迁移前自动备份（VACUUM INTO）
 * - 不自动回滚（可能丢数据）
 * - 只保留最近 N 个备份文件
 */

import type * as BetterSqlite3 from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join, basename } from 'path';

// --- 类型定义 ---

export type VersionAction =
  | 'proceed'            // 版本一致，无需迁移
  | 'migrate-up'         // 需要向上迁移
  | 'incompatible-newer' // DB 版本比 app 新，不兼容
  | 'incompatible-older'; // DB 版本比 app 最低支持版本还旧

export interface VersionCheckResult {
  /** 是否兼容（可以继续启动） */
  compatible: boolean;
  /** 数据库当前版本（PRAGMA user_version） */
  dbVersion: number;
  /** 应用支持的最高迁移版本 */
  appMaxVersion: number;
  /** 应用支持的最低迁移版本（低于此版本无法迁移） */
  appMinVersion: number;
  /** 建议的操作 */
  action: VersionAction;
  /** 人类可读的消息 */
  message: string;
}

export interface VersionGuardOptions {
  /** 应用内置的最高迁移版本号 */
  appMaxVersion: number;
  /** 应用支持的最低 DB 版本（默认 0，即支持从零开始迁移） */
  appMinVersion?: number;
  /** 备份保留数量（默认 5） */
  maxBackups?: number;
}

// --- VersionGuard 实现 ---

export class VersionGuard {
  private readonly db: BetterSqlite3.Database;
  private readonly appMaxVersion: number;
  private readonly appMinVersion: number;
  private readonly maxBackups: number;

  constructor(db: BetterSqlite3.Database, options: VersionGuardOptions) {
    this.db = db;
    this.appMaxVersion = options.appMaxVersion;
    this.appMinVersion = options.appMinVersion ?? 0;
    this.maxBackups = options.maxBackups ?? 5;
  }

  /**
   * 读取 PRAGMA user_version
   */
  getDbVersion(): number {
    const row = this.db.pragma('user_version', { simple: true });
    return typeof row === 'number' ? row : 0;
  }

  /**
   * 设置 PRAGMA user_version
   */
  setDbVersion(version: number): void {
    this.db.pragma(`user_version = ${Math.floor(version)}`);
  }

  /**
   * 执行版本兼容性检查
   *
   * 返回值说明:
   * - proceed: DB 版本 === appMaxVersion，无需迁移
   * - migrate-up: DB 版本 < appMaxVersion 且 >= appMinVersion，需要迁移
   * - incompatible-newer: DB 版本 > appMaxVersion，说明用户用了更新的 app 创建了 DB
   * - incompatible-older: DB 版本 < appMinVersion，太旧无法迁移
   */
  check(): VersionCheckResult {
    const dbVersion = this.getDbVersion();

    // 情况 1: DB 版本比 app 支持的最高版本还新
    // 说明用户曾用更新版本的 app 操作过这个 DB
    if (dbVersion > this.appMaxVersion) {
      return {
        compatible: false,
        dbVersion,
        appMaxVersion: this.appMaxVersion,
        appMinVersion: this.appMinVersion,
        action: 'incompatible-newer',
        message:
          `数据库版本 (v${dbVersion}) 高于当前应用支持的最高版本 (v${this.appMaxVersion})。` +
          `请升级应用到最新版本，或使用与该数据库匹配的应用版本。`
      };
    }

    // 情况 2: DB 版本比 app 支持的最低版本还旧
    if (dbVersion < this.appMinVersion) {
      return {
        compatible: false,
        dbVersion,
        appMaxVersion: this.appMaxVersion,
        appMinVersion: this.appMinVersion,
        action: 'incompatible-older',
        message:
          `数据库版本 (v${dbVersion}) 低于当前应用支持的最低版本 (v${this.appMinVersion})。` +
          `该数据库可能来自过旧的应用版本，无法安全迁移。`
      };
    }

    // 情况 3: DB 版本 === appMaxVersion，完全匹配
    if (dbVersion === this.appMaxVersion) {
      return {
        compatible: true,
        dbVersion,
        appMaxVersion: this.appMaxVersion,
        appMinVersion: this.appMinVersion,
        action: 'proceed',
        message: `数据库版本 (v${dbVersion}) 与应用版本匹配，无需迁移。`
      };
    }

    // 情况 4: DB 版本 < appMaxVersion，需要向上迁移
    return {
      compatible: true,
      dbVersion,
      appMaxVersion: this.appMaxVersion,
      appMinVersion: this.appMinVersion,
      action: 'migrate-up',
      message:
        `数据库版本 (v${dbVersion}) 需要迁移到 v${this.appMaxVersion}。` +
        `将在迁移前自动创建备份。`
    };
  }

  /**
   * 使用 VACUUM INTO 创建数据库备份
   *
   * @param backupDir - 备份目录路径
   * @returns 备份文件的完整路径
   */
  createBackup(backupDir: string): string {
    // 确保备份目录存在
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '');
    const dbVersion = this.getDbVersion();
    const fileName = `sessions_v${dbVersion}_${timestamp}.db`;
    const backupPath = join(backupDir, fileName);

    try {
      // VACUUM INTO 创建一个完整的、压缩过的数据库副本
      this.db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
      console.info(`[version-guard] 备份已创建: ${backupPath}`);
    } catch (error) {
      // 如果 VACUUM INTO 不可用（SQLite 版本过旧），回退到 backup API
      console.warn(
        '[version-guard] VACUUM INTO 失败，尝试 backup API:',
        error instanceof Error ? error.message : String(error)
      );
      try {
        this.db.backup(backupPath);
        console.info(`[version-guard] 备份已创建 (backup API): ${backupPath}`);
      } catch (backupError) {
        throw new Error(
          `数据库备份失败: ${backupError instanceof Error ? backupError.message : String(backupError)}`
        );
      }
    }

    // 清理旧备份
    this.cleanupOldBackups(backupDir);

    return backupPath;
  }

  /**
   * 清理旧备份，只保留最近 maxBackups 个
   */
  private cleanupOldBackups(backupDir: string): void {
    try {
      const files = readdirSync(backupDir)
        .filter((f) => f.startsWith('sessions_v') && f.endsWith('.db'))
        .map((f) => ({
          name: f,
          path: join(backupDir, f),
          mtime: statSync(join(backupDir, f)).mtimeMs
        }))
        .sort((a, b) => b.mtime - a.mtime); // 按修改时间降序

      // 删除超出保留数量的旧备份
      const toDelete = files.slice(this.maxBackups);
      for (const file of toDelete) {
        try {
          unlinkSync(file.path);
          console.info(`[version-guard] 已删除旧备份: ${file.name}`);
        } catch (err) {
          console.warn(
            `[version-guard] 删除旧备份失败: ${file.name}`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      if (toDelete.length > 0) {
        console.info(
          `[version-guard] 清理了 ${toDelete.length} 个旧备份，保留最近 ${this.maxBackups} 个`
        );
      }
    } catch (error) {
      // 清理失败不应阻止正常流程
      console.warn(
        '[version-guard] 清理旧备份时出错:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 同步 user_version 与 schema_migrations 表
   *
   * 处理从旧版本升级的情况：如果 schema_migrations 有记录但 user_version 为 0，
   * 则将 user_version 设置为 schema_migrations 中的最高版本。
   */
  syncFromSchemaMigrations(): void {
    try {
      // 检查 schema_migrations 表是否存在
      const tableExists = this.db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'`
        )
        .get();

      if (!tableExists) {
        return;
      }

      const row = this.db
        .prepare(`SELECT MAX(version) as max_version FROM schema_migrations`)
        .get() as { max_version: number | null } | undefined;

      const schemaVersion = row?.max_version ?? 0;
      const userVersion = this.getDbVersion();

      // 如果 user_version 为 0 但 schema_migrations 有记录，
      // 说明是从旧版本升级的，需要同步
      if (userVersion === 0 && schemaVersion > 0) {
        this.setDbVersion(schemaVersion);
        console.info(
          `[version-guard] 已从 schema_migrations 同步 user_version: 0 -> ${schemaVersion}`
        );
      }
    } catch (error) {
      // 同步失败不应阻止启动
      console.warn(
        '[version-guard] 同步 schema_migrations 时出错:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
