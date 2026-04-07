/**
 * 批量解决同步冲突脚本
 *
 * 策略：keep_latest - 保留时间戳最新的数据
 *
 * 使用方法：
 * cd api-server
 * bun run scripts/resolve-conflicts.ts
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

const { Pool } = pg;

// 加载环境变量
config({ path: resolve(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL 未配置');
  process.exit(1);
}

// 目标用户 ID（从诊断脚本中发现的实际有冲突的用户）
const TARGET_USER_ID = '8ff31cc0-a35f-4329-8d9e-1ccf0b3812ff';

interface SyncConflictRow {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  local_data: unknown;
  remote_data: unknown;
  local_device_id: string;
  remote_device_id: string;
  local_timestamp: string;
  remote_timestamp: string;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

interface ConflictStats {
  entityType: string;
  count: number;
  localNewer: number;
  remoteNewer: number;
  sameTime: number;
}

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 5,
  });

  try {
    console.log('🔍 开始分析同步冲突...\n');

    // 1. 查询所有未解决的冲突
    console.log(`📊 查询用户 ${TARGET_USER_ID} 的未解决冲突...`);
    const conflictsResult = await pool.query<SyncConflictRow>(
      `SELECT * FROM sync_conflicts
       WHERE user_id = $1 AND resolved_at IS NULL
       ORDER BY created_at ASC`,
      [TARGET_USER_ID]
    );

    const conflicts = conflictsResult.rows;
    console.log(`✅ 找到 ${conflicts.length} 个未解决冲突\n`);

    if (conflicts.length === 0) {
      console.log('✨ 没有需要解决的冲突');
      return;
    }

    // 2. 分析冲突统计
    console.log('📈 冲突分析：');
    const statsMap = new Map<string, ConflictStats>();

    for (const conflict of conflicts) {
      const entityType = conflict.entity_type;
      if (!statsMap.has(entityType)) {
        statsMap.set(entityType, {
          entityType,
          count: 0,
          localNewer: 0,
          remoteNewer: 0,
          sameTime: 0,
        });
      }

      const stats = statsMap.get(entityType)!;
      stats.count++;

      const localTs = Number(conflict.local_timestamp);
      const remoteTs = Number(conflict.remote_timestamp);

      if (localTs > remoteTs) {
        stats.localNewer++;
      } else if (remoteTs > localTs) {
        stats.remoteNewer++;
      } else {
        stats.sameTime++;
      }
    }

    console.table(Array.from(statsMap.values()));
    console.log('');

    // 3. 批量解决冲突
    console.log('🔧 开始批量解决冲突（使用 keep_latest 策略）...\n');

    let resolvedCount = 0;
    let keepLocalCount = 0;
    let keepRemoteCount = 0;
    const errors: Array<{ conflictId: string; error: string }> = [];

    for (const conflict of conflicts) {
      try {
        const localTs = Number(conflict.local_timestamp);
        const remoteTs = Number(conflict.remote_timestamp);

        // 确定解决策略：保留时间戳最新的数据
        let resolution: 'keep_local' | 'keep_remote';
        let resultData: unknown;

        if (localTs >= remoteTs) {
          // local 更新或相同时间，保留 local
          resolution = 'keep_local';
          resultData = conflict.local_data;
          keepLocalCount++;
        } else {
          // remote 更新，保留 remote
          resolution = 'keep_remote';
          resultData = conflict.remote_data;
          keepRemoteCount++;
        }

        const now = Date.now();

        // 开始事务
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // 标记冲突已解决
          await client.query(
            `UPDATE sync_conflicts
             SET resolved_at = $1, resolution = $2
             WHERE id = $3`,
            [now, resolution, conflict.id]
          );

          // 创建解决后的变更记录
          await client.query(
            `INSERT INTO sync_changes
               (user_id, entity_type, entity_id, change_type, data, timestamp, checksum, device_id)
             VALUES ($1, $2, $3, 'update', $4, $5, '', 'server-resolved')`,
            [
              conflict.user_id,
              conflict.entity_type,
              conflict.entity_id,
              JSON.stringify(resultData),
              now,
            ]
          );

          await client.query('COMMIT');
          resolvedCount++;

          if (resolvedCount % 10 === 0) {
            console.log(`✅ 已解决 ${resolvedCount}/${conflicts.length} 个冲突...`);
          }
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({
          conflictId: conflict.id,
          error: errorMessage,
        });
        console.error(`❌ 解决冲突 ${conflict.id} 失败: ${errorMessage}`);
      }
    }

    console.log('');
    console.log('✨ 批量解决完成！\n');

    // 4. 验证结果
    console.log('📊 解决结果统计：');
    console.log(`  总冲突数: ${conflicts.length}`);
    console.log(`  成功解决: ${resolvedCount}`);
    console.log(`  失败数量: ${errors.length}`);
    console.log(`  保留 local: ${keepLocalCount}`);
    console.log(`  保留 remote: ${keepRemoteCount}`);
    console.log('');

    if (errors.length > 0) {
      console.log('❌ 失败的冲突：');
      console.table(errors);
      console.log('');
    }

    // 5. 验证数据库中的未解决冲突数
    const verifyResult = await pool.query(
      `SELECT COUNT(*) as count FROM sync_conflicts
       WHERE user_id = $1 AND resolved_at IS NULL`,
      [TARGET_USER_ID]
    );
    const remainingConflicts = parseInt(verifyResult.rows[0].count, 10);

    console.log('🔍 验证结果：');
    console.log(`  剩余未解决冲突: ${remainingConflicts}`);
    console.log('');

    if (remainingConflicts === 0) {
      console.log('🎉 所有冲突已成功解决！');
    } else {
      console.log(`⚠️  还有 ${remainingConflicts} 个冲突未解决`);
    }
  } catch (error) {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
