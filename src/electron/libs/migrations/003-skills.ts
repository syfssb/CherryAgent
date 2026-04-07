/**
 * 迁移 003: 创建 Skills 系统
 *
 * 变更:
 * - 创建 skills 表用于存储可复用的技能/提示词模板
 * - 支持内置、自定义和导入的技能
 * - 支持技能分类和启用/禁用状态
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration } from "../../types/local-db.js";

const migration: Migration = {
  version: 3,
  name: "skills",

  up(db: BetterSqlite3.Database): void {
    // 创建 skills 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'custom' CHECK(source IN ('builtin', 'custom', 'imported')),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        icon TEXT,
        category TEXT NOT NULL DEFAULT 'other' CHECK(category IN ('development', 'writing', 'analysis', 'automation', 'communication', 'other')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_skills_is_enabled ON skills(is_enabled)
    `);

    // 创建 skills_fts 全文搜索虚拟表
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
        name,
        description,
        content,
        content='skills',
        content_rowid='rowid'
      )
    `);

    // 创建触发器保持 FTS 同步
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
        INSERT INTO skills_fts(rowid, name, description, content)
        VALUES (new.rowid, new.name, new.description, new.content);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
        INSERT INTO skills_fts(skills_fts, rowid, name, description, content)
        VALUES('delete', old.rowid, old.name, old.description, old.content);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
        INSERT INTO skills_fts(skills_fts, rowid, name, description, content)
        VALUES('delete', old.rowid, old.name, old.description, old.content);
        INSERT INTO skills_fts(rowid, name, description, content)
        VALUES (new.rowid, new.name, new.description, new.content);
      END
    `);

    // 内置技能已由预装技能系统接管
  },

  down(db: BetterSqlite3.Database): void {
    // 删除触发器
    db.exec(`DROP TRIGGER IF EXISTS skills_au`);
    db.exec(`DROP TRIGGER IF EXISTS skills_ad`);
    db.exec(`DROP TRIGGER IF EXISTS skills_ai`);

    // 删除 FTS 虚拟表
    db.exec(`DROP TABLE IF EXISTS skills_fts`);

    // 删除索引
    db.exec(`DROP INDEX IF EXISTS idx_skills_is_enabled`);
    db.exec(`DROP INDEX IF EXISTS idx_skills_source`);
    db.exec(`DROP INDEX IF EXISTS idx_skills_category`);
    db.exec(`DROP INDEX IF EXISTS idx_skills_name`);

    // 删除表
    db.exec(`DROP TABLE IF EXISTS skills`);
  }
};

export default migration;
