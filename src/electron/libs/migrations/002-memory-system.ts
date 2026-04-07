/**
 * 迁移 002: 创建 Memory 系统
 *
 * 变更:
 * - 创建 memory_blocks 表用于存储结构化记忆块
 * - 创建 archival_memories 表用于存储归档记忆
 * - 支持向量嵌入存储用于语义搜索
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration } from "../../types/local-db.js";

const migration: Migration = {
  version: 2,
  name: "memory-system",

  up(db: BetterSqlite3.Database): void {
    // 创建 memory_blocks 表
    // 用于存储用户定义的结构化记忆块，如个人信息、偏好设置等
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_blocks (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        value TEXT NOT NULL DEFAULT '',
        char_limit INTEGER NOT NULL DEFAULT 2000,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 创建 memory_blocks 索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memory_blocks_label ON memory_blocks(label)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memory_blocks_updated_at ON memory_blocks(updated_at DESC)
    `);

    // 创建 archival_memories 表
    // 用于存储从会话中提取的长期记忆，支持向量搜索
    db.exec(`
      CREATE TABLE IF NOT EXISTS archival_memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding BLOB,
        source_session_id TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (source_session_id) REFERENCES sessions(id) ON DELETE SET NULL
      )
    `);

    // 创建 archival_memories 索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_archival_memories_source_session ON archival_memories(source_session_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_archival_memories_created_at ON archival_memories(created_at DESC)
    `);

    // 创建 archival_memories_fts 全文搜索虚拟表
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS archival_memories_fts USING fts5(
        content,
        tags,
        content='archival_memories',
        content_rowid='rowid'
      )
    `);

    // 创建触发器保持 FTS 同步
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS archival_memories_ai AFTER INSERT ON archival_memories BEGIN
        INSERT INTO archival_memories_fts(rowid, content, tags)
        VALUES (new.rowid, new.content, new.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS archival_memories_ad AFTER DELETE ON archival_memories BEGIN
        INSERT INTO archival_memories_fts(archival_memories_fts, rowid, content, tags)
        VALUES('delete', old.rowid, old.content, old.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS archival_memories_au AFTER UPDATE ON archival_memories BEGIN
        INSERT INTO archival_memories_fts(archival_memories_fts, rowid, content, tags)
        VALUES('delete', old.rowid, old.content, old.tags);
        INSERT INTO archival_memories_fts(rowid, content, tags)
        VALUES (new.rowid, new.content, new.tags);
      END
    `);

    // 插入默认的记忆块模板
    const defaultMemoryBlocks = [
      {
        id: "core_memory_persona",
        label: "AI Persona",
        description: "AI 助手的核心人格设定和行为准则",
        value: "",
        charLimit: 2000
      },
      {
        id: "core_memory_user",
        label: "User Profile",
        description: "用户的基本信息、偏好和工作习惯",
        value: "",
        charLimit: 2000
      },
      {
        id: "core_memory_project",
        label: "Project Context",
        description: "当前项目的背景、目标和技术栈",
        value: "",
        charLimit: 3000
      }
    ];

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO memory_blocks (id, label, description, value, char_limit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    for (const block of defaultMemoryBlocks) {
      insertStmt.run(
        block.id,
        block.label,
        block.description,
        block.value,
        block.charLimit,
        now,
        now
      );
    }
  },

  down(db: BetterSqlite3.Database): void {
    // 删除触发器
    db.exec(`DROP TRIGGER IF EXISTS archival_memories_au`);
    db.exec(`DROP TRIGGER IF EXISTS archival_memories_ad`);
    db.exec(`DROP TRIGGER IF EXISTS archival_memories_ai`);

    // 删除 FTS 虚拟表
    db.exec(`DROP TABLE IF EXISTS archival_memories_fts`);

    // 删除索引
    db.exec(`DROP INDEX IF EXISTS idx_archival_memories_created_at`);
    db.exec(`DROP INDEX IF EXISTS idx_archival_memories_source_session`);
    db.exec(`DROP INDEX IF EXISTS idx_memory_blocks_updated_at`);
    db.exec(`DROP INDEX IF EXISTS idx_memory_blocks_label`);

    // 删除表
    db.exec(`DROP TABLE IF EXISTS archival_memories`);
    db.exec(`DROP TABLE IF EXISTS memory_blocks`);
  }
};

export default migration;
