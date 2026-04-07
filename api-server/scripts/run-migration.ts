/**
 * 执行数据库 migration 脚本
 */
import { readFileSync } from 'fs';
import { pool } from '../src/db/index.js';

async function runMigration(migrationFile: string) {
  try {
    console.log(`[migration] 执行 ${migrationFile}...`);

    const sql = readFileSync(migrationFile, 'utf-8');
    await pool.query(sql);

    console.log(`[migration] ✓ ${migrationFile} 执行成功`);
  } catch (error) {
    console.error(`[migration] ✗ ${migrationFile} 执行失败:`, error);
    throw error;
  }
}

async function main() {
  const migrationFile = process.argv[2];

  if (!migrationFile) {
    console.error('用法: bun run scripts/run-migration.ts <migration-file>');
    process.exit(1);
  }

  await runMigration(migrationFile);
  await pool.end();
}

main().catch((error) => {
  console.error('Migration 失败:', error);
  process.exit(1);
});
