/**
 * 迁移 011: 为 sessions 表添加 model_id 列
 *
 * 变更:
 * - 为 sessions 表添加 model_id 列（记录该话题使用的具体模型 ID）
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration } from "../../types/local-db.js";

const migration: Migration = {
  version: 11,
  name: "011-session-model-id",

  up(db: BetterSqlite3.Database): void {
    const columns = db
      .prepare(`PRAGMA table_info(sessions)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((col) => col.name));

    if (!columnNames.has("model_id")) {
      db.exec(`ALTER TABLE sessions ADD COLUMN model_id TEXT`);
    }
  },

  down(_db: BetterSqlite3.Database): void {
    // SQLite 不支持 DROP COLUMN（3.35.0 之前），保留列但不使用
  }
};

export default migration;
