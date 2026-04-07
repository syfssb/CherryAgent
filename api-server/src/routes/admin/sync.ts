/**
 * 管理后台 - 同步管理路由
 *
 * 路由:
 * - GET  /overview          - 同步概览统计
 * - GET  /users             - 用户同步列表
 * - GET  /users/:userId     - 用户同步详情
 * - DELETE /users/:userId   - 清除用户同步数据
 * - POST /cleanup           - 清理过期同步数据
 * - POST /resolve-conflicts - 批量解决冲突
 */

import { Router, type Request, type Response } from 'express';
import {
  authenticateAdminAsync,
  requirePermission,
} from '../../middleware/admin-auth.js';
import { pool } from '../../db/index.js';
import { successResponse } from '../../utils/response.js';

export const adminSyncRouter = Router();

// 所有路由需要管理员认证
adminSyncRouter.use(authenticateAdminAsync);
adminSyncRouter.use(requirePermission('users:read'));

/**
 * GET /api/admin/sync/overview
 * 同步概览统计
 */
adminSyncRouter.get('/overview', async (_req: Request, res: Response) => {
  // 查询总变更数
  const changesResult = await pool.query(
    'SELECT COUNT(*) as count FROM sync_changes'
  );
  const totalChanges = parseInt((changesResult.rows[0] as { count: string }).count, 10);

  // 查询总冲突数和未解决冲突数
  const conflictsResult = await pool.query(
    `SELECT
       COUNT(*) as total_conflicts,
       COUNT(*) FILTER (WHERE resolved_at IS NULL) as unresolved_conflicts
     FROM sync_conflicts`
  );
  const conflictRow = conflictsResult.rows[0] as { total_conflicts: string; unresolved_conflicts: string };
  const totalConflicts = parseInt(conflictRow.total_conflicts, 10);
  const unresolvedConflicts = parseInt(conflictRow.unresolved_conflicts, 10);

  // 查询活跃设备数（去重 device_id）
  const devicesResult = await pool.query(
    'SELECT COUNT(DISTINCT device_id) as count FROM sync_device_info'
  );
  const activeDevices = parseInt((devicesResult.rows[0] as { count: string }).count, 10);

  // 查询活跃用户数（去重 user_id）
  const usersResult = await pool.query(
    'SELECT COUNT(DISTINCT user_id) as count FROM sync_device_info'
  );
  const activeUsers = parseInt((usersResult.rows[0] as { count: string }).count, 10);

  res.json(
    successResponse({
      totalChanges,
      totalConflicts,
      unresolvedConflicts,
      activeDevices,
      activeUsers,
    })
  );
});

/**
 * GET /api/admin/sync/users
 * 用户同步列表
 */
adminSyncRouter.get('/users', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const offset = (page - 1) * limit;

  // 查询总用户数（有同步数据的用户）
  // 使用子查询获取所有有同步数据的用户ID
  const countResult = await pool.query(
    `SELECT COUNT(DISTINCT user_id) as count
     FROM (
       SELECT user_id FROM sync_changes
       UNION
       SELECT user_id FROM sync_device_info
     ) AS sync_users`
  );
  const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

  // 查询用户列表及其统计信息
  // 使用子查询过滤有同步数据的用户，避免 WHERE EXISTS 性能问题
  const usersResult = await pool.query(
    `SELECT
       u.id as user_id,
       u.email,
       u.name as username,
       COUNT(DISTINCT sdi.device_id) as device_count,
       COALESCE(MAX(sdi.last_sync_time), 0) as last_sync_at,
       (SELECT COUNT(*) FROM sync_changes WHERE user_id = u.id) as change_count,
       (SELECT COUNT(*) FROM sync_conflicts WHERE user_id = u.id) as conflict_count,
       (SELECT COUNT(*) FROM sync_conflicts WHERE user_id = u.id AND resolved_at IS NULL) as unresolved_conflicts
     FROM users u
     LEFT JOIN sync_device_info sdi ON u.id = sdi.user_id
     WHERE u.id IN (
       SELECT user_id FROM sync_changes
       UNION
       SELECT user_id FROM sync_device_info
     )
     GROUP BY u.id, u.email, u.name
     ORDER BY last_sync_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const users = usersResult.rows.map((row: any) => ({
    userId: row.user_id,
    email: row.email,
    username: row.username,
    devicesCount: parseInt(row.device_count, 10),
    lastSyncTime: Number(row.last_sync_at),
    changesCount: parseInt(row.change_count, 10),
    conflictsCount: parseInt(row.conflict_count, 10),
    unresolvedConflictsCount: parseInt(row.unresolved_conflicts, 10),
  }));

  res.json(
    successResponse(
      { users },
      { total, page, limit, hasMore: offset + users.length < total }
    )
  );
});

/**
 * GET /api/admin/sync/users/:userId
 * 用户同步详情
 */
adminSyncRouter.get('/users/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;

  // 查询用户基本信息
  const userResult = await pool.query(
    'SELECT id, email, name as username FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = userResult.rows[0] as { id: string; email: string; username: string | null };

  // 查询用户的同步统计信息
  const statsResult = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM sync_changes WHERE user_id = $1) as change_count,
       (SELECT COUNT(*) FROM sync_conflicts WHERE user_id = $1) as conflict_count,
       (SELECT COUNT(*) FROM sync_conflicts WHERE user_id = $1 AND resolved_at IS NULL) as unresolved_conflicts,
       (SELECT COUNT(DISTINCT device_id) FROM sync_device_info WHERE user_id = $1) as device_count,
       (SELECT COALESCE(MAX(last_sync_time), 0) FROM sync_device_info WHERE user_id = $1) as last_sync_at`,
    [userId]
  );

  const stats = statsResult.rows[0] as {
    change_count: string;
    conflict_count: string;
    unresolved_conflicts: string;
    device_count: string;
    last_sync_at: string;
  };

  // 查询用户的设备列表
  const devicesResult = await pool.query(
    `SELECT device_id, last_sync_time, updated_at
     FROM sync_device_info
     WHERE user_id = $1
     ORDER BY last_sync_time DESC`,
    [userId]
  );

  const devices = devicesResult.rows.map((row: any) => ({
    deviceId: row.device_id,
    lastSyncTime: Number(row.last_sync_time),
    updatedAt: row.updated_at,
  }));

  // 查询最近的变更记录（最近 20 条）
  const changesResult = await pool.query(
    `SELECT id, entity_type, entity_id, change_type, timestamp, device_id
     FROM sync_changes
     WHERE user_id = $1
     ORDER BY timestamp DESC
     LIMIT 20`,
    [userId]
  );

  const recentChanges = changesResult.rows.map((row: any) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    changeType: row.change_type,
    timestamp: Number(row.timestamp),
    deviceId: row.device_id,
  }));

  // 查询未解决的冲突列表
  const conflictsResult = await pool.query(
    `SELECT id, entity_type, entity_id, local_device_id, remote_device_id,
            local_timestamp, remote_timestamp, created_at
     FROM sync_conflicts
     WHERE user_id = $1 AND resolved_at IS NULL
     ORDER BY created_at DESC`,
    [userId]
  );

  const unresolvedConflictList = conflictsResult.rows.map((row: any) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    localDeviceId: row.local_device_id,
    remoteDeviceId: row.remote_device_id,
    localTimestamp: Number(row.local_timestamp),
    remoteTimestamp: Number(row.remote_timestamp),
    createdAt: Number(row.created_at),
  }));

  res.json(
    successResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.username,
      },
      stats: {
        changesCount: parseInt(stats.change_count, 10),
        conflictsCount: parseInt(stats.conflict_count, 10),
        unresolvedConflictsCount: parseInt(stats.unresolved_conflicts, 10),
        devicesCount: parseInt(stats.device_count, 10),
      },
      devices,
      recentChanges,
      unresolvedConflicts: unresolvedConflictList,
    })
  );
});

/**
 * DELETE /api/admin/sync/users/:userId
 * 清除用户同步数据
 */
adminSyncRouter.delete('/users/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;

  // 使用事务确保原子性
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 删除用户的 sync_changes 记录
    await client.query('DELETE FROM sync_changes WHERE user_id = $1', [userId]);

    // 删除用户的 sync_conflicts 记录
    await client.query('DELETE FROM sync_conflicts WHERE user_id = $1', [userId]);

    // 删除用户的 sync_device_info 记录
    await client.query('DELETE FROM sync_device_info WHERE user_id = $1', [userId]);

    await client.query('COMMIT');

    res.json(successResponse({ message: '同步数据已清除' }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

/**
 * POST /api/admin/sync/cleanup
 * 清理过期同步数据
 */
adminSyncRouter.post('/cleanup', async (req: Request, res: Response) => {
  const olderThanDays = parseInt(req.body.olderThanDays as string, 10) || 30;
  const cutoffTimestamp = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  // 使用事务确保原子性
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 删除过期的 sync_changes
    const changesResult = await client.query(
      'DELETE FROM sync_changes WHERE timestamp < $1',
      [cutoffTimestamp]
    );
    const deletedChanges = changesResult.rowCount || 0;

    // 删除已解决的 sync_conflicts
    const conflictsResult = await client.query(
      'DELETE FROM sync_conflicts WHERE resolved_at IS NOT NULL'
    );
    const deletedConflicts = conflictsResult.rowCount || 0;

    await client.query('COMMIT');

    res.json(
      successResponse({
        message: '清理完成',
        deletedChanges,
        deletedConflicts,
      })
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

/**
 * POST /api/admin/sync/resolve-conflicts
 * 批量解决冲突
 *
 * Body:
 * - userId (可选): 指定用户 ID，不提供则解决所有用户的冲突
 * - strategy (可选): 解决策略，默认 'keep_latest'
 *   - 'keep_latest': 保留时间戳最新的数据
 *   - 'keep_local': 全部保留 local 数据
 *   - 'keep_remote': 全部保留 remote 数据
 */
adminSyncRouter.post('/resolve-conflicts', async (req: Request, res: Response) => {
  const { userId, strategy = 'keep_latest' } = req.body;

  // 验证策略
  const validStrategies = ['keep_latest', 'keep_local', 'keep_remote'];
  if (!validStrategies.includes(strategy)) {
    res.status(400).json({
      error: `Invalid strategy. Must be one of: ${validStrategies.join(', ')}`,
    });
    return;
  }

  // 构建查询条件
  const whereClause = userId ? 'WHERE user_id = $1 AND resolved_at IS NULL' : 'WHERE resolved_at IS NULL';
  const queryParams = userId ? [userId] : [];

  // 查询未解决的冲突
  const conflictsResult = await pool.query(
    `SELECT id, user_id, entity_type, entity_id, local_data, remote_data,
            local_device_id, remote_device_id, local_timestamp, remote_timestamp
     FROM sync_conflicts
     ${whereClause}
     ORDER BY created_at ASC`,
    queryParams
  );

  const conflicts = conflictsResult.rows;

  if (conflicts.length === 0) {
    res.json(
      successResponse({
        message: '没有需要解决的冲突',
        resolved: 0,
        keepLocal: 0,
        keepRemote: 0,
      })
    );
    return;
  }

  // 批量解决冲突
  let resolvedCount = 0;
  let keepLocalCount = 0;
  let keepRemoteCount = 0;
  const errors: Array<{ conflictId: string; error: string }> = [];

  for (const conflict of conflicts) {
    try {
      const localTs = Number(conflict.local_timestamp);
      const remoteTs = Number(conflict.remote_timestamp);

      // 确定解决策略
      let resolution: 'keep_local' | 'keep_remote';
      let resultData: unknown;

      if (strategy === 'keep_latest') {
        // 保留时间戳最新的数据
        if (localTs >= remoteTs) {
          resolution = 'keep_local';
          resultData = conflict.local_data;
          keepLocalCount++;
        } else {
          resolution = 'keep_remote';
          resultData = conflict.remote_data;
          keepRemoteCount++;
        }
      } else if (strategy === 'keep_local') {
        resolution = 'keep_local';
        resultData = conflict.local_data;
        keepLocalCount++;
      } else {
        // keep_remote
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
    }
  }

  // 验证剩余未解决冲突数
  const verifyResult = await pool.query(
    userId
      ? 'SELECT COUNT(*) as count FROM sync_conflicts WHERE user_id = $1 AND resolved_at IS NULL'
      : 'SELECT COUNT(*) as count FROM sync_conflicts WHERE resolved_at IS NULL',
    userId ? [userId] : []
  );
  const remainingConflicts = parseInt(verifyResult.rows[0].count, 10);

  res.json(
    successResponse({
      message: '批量解决完成',
      total: conflicts.length,
      resolved: resolvedCount,
      failed: errors.length,
      keepLocal: keepLocalCount,
      keepRemote: keepRemoteCount,
      remainingConflicts,
      errors: errors.length > 0 ? errors : undefined,
    })
  );
});

export default adminSyncRouter;
