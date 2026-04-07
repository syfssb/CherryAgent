/**
 * 迁移 005: 全文搜索 (FTS5)
 *
 * 功能:
 * - 为 sessions 和 messages 创建 FTS5 虚拟表
 * - 自动同步数据到 FTS 表
 * - 支持跨 session 和 message 的全文搜索
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration } from "../../types/local-db.js";

const migration: Migration = {
  version: 5,
  name: "fts-search",

  up(db: BetterSqlite3.Database): void {
    // 清理旧版迁移遗留的触发器，避免重复写入
    db.exec(`DROP TRIGGER IF EXISTS sessions_ai;`);
    db.exec(`DROP TRIGGER IF EXISTS sessions_ad;`);
    db.exec(`DROP TRIGGER IF EXISTS sessions_au;`);
    db.exec(`DROP TRIGGER IF EXISTS messages_ai;`);
    db.exec(`DROP TRIGGER IF EXISTS messages_ad;`);
    db.exec(`DROP TRIGGER IF EXISTS messages_au;`);

    // 重新创建 FTS 表，保证 schema 一致
    db.exec(`DROP TABLE IF EXISTS sessions_fts;`);
    db.exec(`DROP TABLE IF EXISTS messages_fts;`);

    // 创建 sessions FTS5 虚拟表
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
        id UNINDEXED,
        title,
        last_prompt,
        content='sessions',
        content_rowid='rowid'
      );
    `);

    // 创建 messages FTS5 虚拟表
    // 注意: messages 表的 data 字段存储 JSON，我们需要提取文本内容
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        id UNINDEXED,
        session_id UNINDEXED,
        content,
        content='messages',
        content_rowid='rowid',
        tokenize='porter unicode61'
      );
    `);

    // 创建触发器：sessions 插入时同步到 FTS
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS sessions_fts_insert AFTER INSERT ON sessions BEGIN
        INSERT INTO sessions_fts(rowid, id, title, last_prompt)
        VALUES (new.rowid, new.id, new.title, new.last_prompt);
      END;
    `);

    // 创建触发器：sessions 更新时同步到 FTS
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS sessions_fts_update AFTER UPDATE ON sessions BEGIN
        UPDATE sessions_fts
        SET title = new.title, last_prompt = new.last_prompt
        WHERE rowid = new.rowid;
      END;
    `);

    // 创建触发器：sessions 删除时从 FTS 删除
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS sessions_fts_delete AFTER DELETE ON sessions BEGIN
        DELETE FROM sessions_fts WHERE rowid = old.rowid;
      END;
    `);

    // 创建触发器：messages 插入时同步到 FTS
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, id, session_id, content)
        VALUES (new.rowid, new.id, new.session_id, new.data);
      END;
    `);

    // 创建触发器：messages 更新时同步到 FTS
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
        UPDATE messages_fts
        SET content = new.data
        WHERE rowid = new.rowid;
      END;
    `);

    // 创建触发器：messages 删除时从 FTS 删除
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE rowid = old.rowid;
      END;
    `);

    // 初始化：将现有数据同步到 FTS 表
    db.exec(`
      INSERT INTO sessions_fts(rowid, id, title, last_prompt)
      SELECT rowid, id, title, last_prompt FROM sessions;
    `);

    db.exec(`
      INSERT INTO messages_fts(rowid, id, session_id, content)
      SELECT rowid, id, session_id, data FROM messages;
    `);

    console.info("[migration-005] FTS5 search tables created and initialized");
  },

  down(db: BetterSqlite3.Database): void {
    // 删除触发器
    db.exec(`DROP TRIGGER IF EXISTS sessions_fts_insert;`);
    db.exec(`DROP TRIGGER IF EXISTS sessions_fts_update;`);
    db.exec(`DROP TRIGGER IF EXISTS sessions_fts_delete;`);
    db.exec(`DROP TRIGGER IF EXISTS messages_fts_insert;`);
    db.exec(`DROP TRIGGER IF EXISTS messages_fts_update;`);
    db.exec(`DROP TRIGGER IF EXISTS messages_fts_delete;`);

    // 删除 FTS 虚拟表
    db.exec(`DROP TABLE IF EXISTS sessions_fts;`);
    db.exec(`DROP TABLE IF EXISTS messages_fts;`);

    console.info("[migration-005] FTS5 search tables dropped");
  }
};

export default migration;
