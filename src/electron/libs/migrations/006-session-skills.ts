/**
 * 迁移 006: 会话技能绑定
 *
 * 变更:
 * - 为 sessions 表添加 active_skill_ids / skill_mode 列
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration } from "../../types/local-db.js";

const migration: Migration = {
  version: 6,
  name: "session-skills",

  up(db: BetterSqlite3.Database): void {
    const columns = db
      .prepare(`PRAGMA table_info(sessions)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((col) => col.name));

    if (!columnNames.has("active_skill_ids")) {
      db.exec(`ALTER TABLE sessions ADD COLUMN active_skill_ids TEXT`);
    }

    if (!columnNames.has("skill_mode")) {
      db.exec(`ALTER TABLE sessions ADD COLUMN skill_mode TEXT DEFAULT 'auto'`);
    }

    console.info("[migration-006] Session skill columns ensured");
  },

  down(_db: BetterSqlite3.Database): void {
    // SQLite 不支持 DROP COLUMN；保持无操作
    console.info("[migration-006] No-op down migration for session-skills");
  }
};

export default migration;
