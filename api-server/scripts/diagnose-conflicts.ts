/**
 * 诊断同步冲突脚本
 *
 * 使用方法：
 * cd api-server
 * bun run scripts/diagnose-conflicts.ts
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

const { Pool } = pg;

// 加载环境变量
config({ path: resolve(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL 未配置');
  process.exit(1);
}

const TARGET_USER_ID = '882b1b36-bccc-4722-9bab-fdda2201ee4e';

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 5,
  });

  try {
    console.log('开始诊断同步冲突...\n');

    // 1. 检查 sync_conflicts 表是否存在
    console.log('1. 检查 sync_conflicts 表是否存在...');
    const tableExistsResult = await pool.query(
      `SELECT EXISTS (
         SELECT FROM information_schema.tables
         WHERE table_schema = 'public'
         AND table_name = 'sync_conflicts'
       )`
    );
    const tableExists = tableExistsResult.rows[0].exists;
    console.log(`   sync_conflicts 表存在: ${tableExists}\n`);

    if (!tableExists) {
      console.log('sync_conflicts 表不存在，需要创建表');
      return;
    }

    // 2. 查看表结构
    console.log('2. 查看 sync_conflicts 表结构...');
    const columnsResult = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
       AND table_name = 'sync_conflicts'
       ORDER BY ordinal_position`
    );
    console.table(columnsResult.rows);
    console.log('');

    // 3. 查询所有冲突的总数
    console.log('3. 查询所有冲突的总数...');
    const totalResult = await pool.query(
      'SELECT COUNT(*) as count FROM sync_conflicts'
    );
    const totalConflicts = parseInt(totalResult.rows[0].count, 10);
    console.log(`   总冲突数: ${totalConflicts}\n`);

    // 4. 查询未解决冲突的总数
    console.log('4. 查询未解决冲突的总数...');
    const unresolvedResult = await pool.query(
      'SELECT COUNT(*) as count FROM sync_conflicts WHERE resolved_at IS NULL'
    );
    const unresolvedConflicts = parseInt(unresolvedResult.rows[0].count, 10);
    console.log(`   未解决冲突数: ${unresolvedConflicts}\n`);

    // 5. 按用户统计冲突
    console.log('5. 按用户统计冲突...');
    const userStatsResult = await pool.query(
      `SELECT user_id,
              COUNT(*) as total_conflicts,
              COUNT(*) FILTER (WHERE resolved_at IS NULL) as unresolved_conflicts
       FROM sync_conflicts
       GROUP BY user_id
       ORDER BY unresolved_conflicts DESC
       LIMIT 10`
    );
    console.table(userStatsResult.rows);
    console.log('');

    // 6. 查询目标用户的冲突
    console.log(`6. 查询目标用户 ${TARGET_USER_ID} 的冲突...`);
    const targetUserResult = await pool.query(
      `SELECT COUNT(*) as total_conflicts,
              COUNT(*) FILTER (WHERE resolved_at IS NULL) as unresolved_conflicts,
              COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) as resolved_conflicts
       FROM sync_conflicts
       WHERE user_id = $1`,
      [TARGET_USER_ID]
    );
    console.table(targetUserResult.rows);
    console.log('');

    // 7. 查看目标用户的前 5 个冲突详情
    console.log(`7. 查看目标用户的前 5 个冲突详情...`);
    const detailsResult = await pool.query(
      `SELECT id, entity_type, entity_id,
              local_timestamp, remote_timestamp,
              created_at, resolved_at, resolution
       FROM sync_conflicts
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [TARGET_USER_ID]
    );
    console.table(detailsResult.rows);
    console.log('');

    // 8. 按实体类型统计目标用户的冲突
    console.log(`8. 按实体类型统计目标用户的冲突...`);
    const entityStatsResult = await pool.query(
      `SELECT entity_type,
              COUNT(*) as total_conflicts,
              COUNT(*) FILTER (WHERE resolved_at IS NULL) as unresolved_conflicts
       FROM sync_conflicts
       WHERE user_id = $1
       GROUP BY entity_type
       ORDER BY unresolved_conflicts DESC`,
      [TARGET_USER_ID]
    );
    console.table(entityStatsResult.rows);
    console.log('');

    // 9. 检查是否有其他用户有未解决冲突
    console.log('9. 检查其他用户的未解决冲突...');
    const otherUsersResult = await pool.query(
      `SELECT user_id, COUNT(*) as unresolved_conflicts
       FROM sync_conflicts
       WHERE resolved_at IS NULL
       GROUP BY user_id
       ORDER BY unresolved_conflicts DESC
       LIMIT 5`
    );
    console.table(otherUsersResult.rows);
    console.log('');

    console.log('诊断完成！');
  } catch (error) {
    console.error('诊断失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
