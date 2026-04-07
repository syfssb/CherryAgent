/**
 * 迁移 008: 会话存储中性化
 *
 * 变更:
 * - 为 sessions 表添加 provider 列 (默认 'claude')
 * - 为 sessions 表添加 provider_thread_id 列
 * - 为 sessions 表添加 runtime 列 (默认 'claude-sdk')
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration } from "../../types/local-db.js";

const migration: Migration = {
  version: 8,
  name: "008-session-provider",

  up(db: BetterSqlite3.Database): void {
    const columns = db
      .prepare(`PRAGMA table_info(sessions)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((col) => col.name));

    if (!columnNames.has("provider")) {
      db.exec(`ALTER TABLE sessions ADD COLUMN provider TEXT DEFAULT 'claude'`);
    }

    if (!columnNames.has("provider_thread_id")) {
      db.exec(`ALTER TABLE sessions ADD COLUMN provider_thread_id TEXT`);
    }

    if (!columnNames.has("runtime")) {
      db.exec(`ALTER TABLE sessions ADD COLUMN runtime TEXT DEFAULT 'claude-sdk'`);
    }
  },

  down(db: BetterSqlite3.Database): void {
    // SQLite 不支持 DROP COLUMN（3.35.0 之前），保留列但不使用
    // 对于支持 DROP COLUMN 的版本可以执行:
    // db.exec(`ALTER TABLE sessions DROP COLUMN provider`);
    // db.exec(`ALTER TABLE sessions DROP COLUMN provider_thread_id`);
    // db.exec(`ALTER TABLE sessions DROP COLUMN runtime`);
  }
};

export default migration;
