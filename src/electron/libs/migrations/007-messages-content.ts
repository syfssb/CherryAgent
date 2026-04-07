/**
 * 迁移 007: 为 messages 添加 content 列
 *
 * 目的:
 * - 兼容 messages_fts 的 external content 表要求 (需要 content 列)
 * - 避免删除会话时触发 "no such column: T.content"
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration } from "../../types/local-db.js";

const migration: Migration = {
  version: 7,
  name: "messages-content-column",

  up(db: BetterSqlite3.Database): void {
    const columns = db
      .prepare(`PRAGMA table_info(messages)`)
      .all() as Array<{ name: string }>;
    const hasContent = columns.some((col) => col.name === "content");

    if (!hasContent) {
      db.exec(`ALTER TABLE messages ADD COLUMN content TEXT`);
    }

    db.exec(`UPDATE messages SET content = data WHERE content IS NULL OR content = ''`);
    console.info("[migration-007] messages.content column ensured");
  },

  // SQLite 无法安全删除列，降级为 no-op
  down(): void {}
};

export default migration;
