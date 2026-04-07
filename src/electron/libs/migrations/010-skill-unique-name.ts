/**
 * 迁移 010: Skills 名称唯一约束
 *
 * 变更:
 * - 清理历史遗留的重复 builtin skill 记录（WAL 竞争条件导致）
 * - 为 skills 表 name 列添加 UNIQUE 约束，从数据库层防止重复
 *
 * 背景:
 * 旧版本 registerSkillHandlers() 和 syncPresetSkillsToDatabase() 各自
 * 创建独立的 SQLite 连接，WAL 模式隔离导致两边都看不到对方的写入，
 * 同一个 builtin skill 被插入两次。
 */

import type * as BetterSqlite3 from "better-sqlite3";
import type { Migration } from "../../types/local-db.js";

const migration: Migration = {
  version: 10,
  name: "skill-unique-name",

  up(db: BetterSqlite3.Database): void {
    // Step 1: Remove duplicate builtin records, keeping the oldest (smallest rowid)
    db.exec(`
      DELETE FROM skills WHERE rowid IN (
        SELECT s.rowid FROM skills s
        INNER JOIN (
          SELECT name, MIN(rowid) as keep_rowid
          FROM skills
          WHERE source = 'builtin'
          GROUP BY name
          HAVING COUNT(*) > 1
        ) dups ON s.name = dups.name AND s.source = 'builtin' AND s.rowid != dups.keep_rowid
      )
    `);

    // Step 2: Also deduplicate non-builtin duplicates (if any exist)
    db.exec(`
      DELETE FROM skills WHERE rowid IN (
        SELECT s.rowid FROM skills s
        INNER JOIN (
          SELECT name, MIN(rowid) as keep_rowid
          FROM skills
          GROUP BY name
          HAVING COUNT(*) > 1
        ) dups ON s.name = dups.name AND s.rowid != dups.keep_rowid
      )
    `);

    // Step 3: Rebuild FTS index after deleting duplicates
    db.exec(`INSERT INTO skills_fts(skills_fts) VALUES('rebuild')`);

    // Step 4: Create UNIQUE index on name
    // This replaces the existing non-unique index idx_skills_name
    db.exec(`DROP INDEX IF EXISTS idx_skills_name`);
    db.exec(`CREATE UNIQUE INDEX idx_skills_name ON skills(name)`);
  },

  down(db: BetterSqlite3.Database): void {
    // Revert to non-unique index
    db.exec(`DROP INDEX IF EXISTS idx_skills_name`);
    db.exec(`CREATE INDEX idx_skills_name ON skills(name)`);
  }
};

export default migration;
