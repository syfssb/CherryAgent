/**
 * 迁移 009: Skills 双栈 Runtime 支持
 *
 * 变更:
 * - 在 skills 表新增 compatible_runtimes 列（TEXT，JSON 序列化）
 * - 默认值 '["claude"]' 保持向后兼容
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration } from "../../types/local-db.js";

const migration: Migration = {
  version: 9,
  name: "skill-runtimes",

  up(db: BetterSqlite3.Database): void {
    db.exec(`
      ALTER TABLE skills ADD COLUMN compatible_runtimes TEXT NOT NULL DEFAULT '["claude"]'
    `);
  },

  down(db: BetterSqlite3.Database): void {
    // SQLite 不支持 DROP COLUMN（3.35.0 之前），创建新表迁移
    db.exec(`
      CREATE TABLE skills_backup AS SELECT
        id, name, description, content, source, is_enabled, icon, category, created_at, updated_at
      FROM skills
    `);
    db.exec(`DROP TABLE skills`);
    db.exec(`ALTER TABLE skills_backup RENAME TO skills`);

    // 重建索引
    db.exec(`CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_skills_is_enabled ON skills(is_enabled)`);

    // 重建 FTS
    db.exec(`DROP TABLE IF EXISTS skills_fts`);
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS skills_fts USING fts5(
        name, description, content,
        content='skills', content_rowid='rowid'
      )
    `);
    db.exec(`INSERT INTO skills_fts(rowid, name, description, content) SELECT rowid, name, description, content FROM skills`);

    // 重建触发器
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
  }
};

export default migration;
