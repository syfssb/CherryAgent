import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new pg.Pool({
  host: 'hnd1.clusters.zeabur.com',
  port: 25801,
  user: 'root',
  password: '6yZj8QDgHGA0w23X57EavOVs9tr14uRq',
  database: 'zeabur'
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('连接到数据库成功');

    const sql = readFileSync(join(__dirname, 'src/db/migrations/0032_sync_tables.sql'), 'utf8');
    console.log('开始执行迁移...');

    await client.query(sql);
    console.log('✅ 迁移执行成功！');

    // 验证表是否创建成功
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('sync_changes', 'sync_conflicts', 'sync_device_info')
      ORDER BY table_name
    `);

    console.log('\n已创建的表:');
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));

  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
