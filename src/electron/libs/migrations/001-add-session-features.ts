/**
 * 迁移 001: 添加会话功能扩展
 *
 * 变更:
 * - 为 sessions 表添加 is_pinned 和 is_archived 列
 * - 创建 tags 表用于标签管理
 * - 创建 session_tags 关联表
 * - 创建 sessions_fts 全文搜索虚拟表
 * - 创建 messages_fts 全文搜索虚拟表
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration } from "../../types/local-db.js";

const migration: Migration = {
  version: 1,
  name: "add-session-features",

  up(db: BetterSqlite3.Database): void {
    // 确保基础表存在 (新库初始化时避免迁移失败)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        claude_session_id TEXT,
        status TEXT NOT NULL,
        cwd TEXT,
        allowed_tools TEXT,
        last_prompt TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS messages_session_id ON messages(session_id)`);

    // 为 sessions 表添加 is_pinned / is_archived 列 (仅在缺失时添加)
    const columns = db
      .prepare(`PRAGMA table_info(sessions)`)
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((col) => col.name));

    if (!columnNames.has("is_pinned")) {
      db.exec(`ALTER TABLE sessions ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`);
    }

    if (!columnNames.has("is_archived")) {
      db.exec(`ALTER TABLE sessions ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`);
    }

    // 创建 tags 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '#6366f1',
        created_at INTEGER NOT NULL
      )
    `);

    // 创建 tags 表索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)
    `);

    // 创建 session_tags 关联表
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_tags (
        session_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, tag_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    // 创建 session_tags 索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_tags_session_id ON session_tags(session_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_tags_tag_id ON session_tags(tag_id)
    `);

    // 创建索引优化查询
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_is_pinned ON sessions(is_pinned)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_is_archived ON sessions(is_archived)
    `);
  },

  down(db: BetterSqlite3.Database): void {
    // 删除触发器
    db.exec(`DROP TRIGGER IF EXISTS messages_au`);
    db.exec(`DROP TRIGGER IF EXISTS messages_ad`);
    db.exec(`DROP TRIGGER IF EXISTS messages_ai`);
    db.exec(`DROP TRIGGER IF EXISTS sessions_au`);
    db.exec(`DROP TRIGGER IF EXISTS sessions_ad`);
    db.exec(`DROP TRIGGER IF EXISTS sessions_ai`);

    // 删除 FTS 虚拟表
    db.exec(`DROP TABLE IF EXISTS messages_fts`);
    db.exec(`DROP TABLE IF EXISTS sessions_fts`);

    // 删除索引
    db.exec(`DROP INDEX IF EXISTS idx_sessions_is_archived`);
    db.exec(`DROP INDEX IF EXISTS idx_sessions_is_pinned`);
    db.exec(`DROP INDEX IF EXISTS idx_session_tags_tag_id`);
    db.exec(`DROP INDEX IF EXISTS idx_session_tags_session_id`);
    db.exec(`DROP INDEX IF EXISTS idx_tags_name`);

    // 删除关联表
    db.exec(`DROP TABLE IF EXISTS session_tags`);

    // 删除 tags 表
    db.exec(`DROP TABLE IF EXISTS tags`);

    // SQLite 不支持 DROP COLUMN，需要重建表
    // 创建临时表，不包含新增的列
    db.exec(`
      CREATE TABLE sessions_backup (
        id TEXT PRIMARY KEY,
        title TEXT,
        claude_session_id TEXT,
        status TEXT NOT NULL,
        cwd TEXT,
        allowed_tools TEXT,
        last_prompt TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 复制数据
    db.exec(`
      INSERT INTO sessions_backup
      SELECT id, title, claude_session_id, status, cwd, allowed_tools, last_prompt, created_at, updated_at
      FROM sessions
    `);

    // 删除原表
    db.exec(`DROP TABLE sessions`);

    // 重命名备份表
    db.exec(`ALTER TABLE sessions_backup RENAME TO sessions`);

    // 重建索引
    db.exec(`CREATE INDEX IF NOT EXISTS messages_session_id ON messages(session_id)`);
  }
};

export default migration;
