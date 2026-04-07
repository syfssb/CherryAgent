/**
 * Sync Routes - 数据同步 API 端点
 *
 * 功能:
 * - POST /sync/push - 推送本地变更到服务器
 * - GET /sync/pull - 拉取远端变更
 * - GET /sync/status - 获取同步状态
 * - POST /sync/resolve-conflict - 解决冲突
 *
 * 持久化: PostgreSQL (sync_changes, sync_conflicts, sync_device_info)
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { pool } from '../db/index.js';
import { successResponse, paginationMeta } from '../utils/response.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';

export const syncRouter = Router();

// ============================================================================
// 类型定义
// ============================================================================

type SyncEntityType = 'session' | 'tag' | 'memory_block' | 'skill' | 'setting';
type ChangeType = 'create' | 'update' | 'delete';
type ConflictResolutionType = 'keep_local' | 'keep_remote' | 'manual_merge';

interface SyncChange {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  changeType: ChangeType;
  data: unknown;
  timestamp: number;
  checksum: string;
  deviceId: string;
}

interface SyncConflict {
  id: string;
  userId: string;
  entityType: SyncEntityType;
  entityId: string;
  localData: unknown;
  remoteData: unknown;
  localDeviceId: string;
  remoteDeviceId: string;
  localTimestamp: number;
  remoteTimestamp: number;
  createdAt: number;
  resolvedAt?: number | undefined;
  resolution?: ConflictResolutionType | undefined;
}

// ============================================================================
// 验证 Schema
// ============================================================================

const SyncChangeSchema = z.object({
  id: z.string(),
  entityType: z.enum(['session', 'tag', 'memory_block', 'skill', 'setting']),
  entityId: z.string(),
  changeType: z.enum(['create', 'update', 'delete']),
  data: z.unknown(),
  timestamp: z.number(),
  checksum: z.string(),
  deviceId: z.string()
});

const PushRequestSchema = z.object({
  changes: z.array(SyncChangeSchema).min(1).max(1000)
});

const ResolveConflictSchema = z.object({
  conflictId: z.string(),
  resolution: z.enum(['keep_local', 'keep_remote', 'manual_merge']),
  mergedData: z.unknown().optional()
});

// ============================================================================
// 数据库行 -> 业务对象 映射
// ============================================================================

interface SyncChangeRow {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  change_type: string;
  data: unknown;
  timestamp: string;
  checksum: string;
  device_id: string;
}

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

function rowToChange(row: SyncChangeRow): SyncChange {
  return {
    id: row.id,
    entityType: row.entity_type as SyncEntityType,
    entityId: row.entity_id,
    changeType: row.change_type as ChangeType,
    data: row.data,
    timestamp: Number(row.timestamp),
    checksum: row.checksum,
    deviceId: row.device_id,
  };
}

function rowToConflict(row: SyncConflictRow): SyncConflict {
  return {
    id: row.id,
    userId: row.user_id,
    entityType: row.entity_type as SyncEntityType,
    entityId: row.entity_id,
    localData: row.local_data,
    remoteData: row.remote_data,
    localDeviceId: row.local_device_id,
    remoteDeviceId: row.remote_device_id,
    localTimestamp: Number(row.local_timestamp),
    remoteTimestamp: Number(row.remote_timestamp),
    createdAt: Number(row.created_at),
    resolvedAt: row.resolved_at ? Number(row.resolved_at) : undefined,
    resolution: row.resolution as ConflictResolutionType | undefined,
  };
}

// ============================================================================
// 路由处理器
// ============================================================================

/**
 * POST /sync/push
 * 推送本地变更到服务器
 */
syncRouter.post('/push', authenticate, async (req: Request, res: Response) => {
  const userId = req.userId!;

  console.log(`[Sync API] POST /sync/push - userId: ${userId}`);

  const parseResult = PushRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid request body', parseResult.error.errors);
  }

  const { changes } = parseResult.data;
  console.log(`[Sync API] 收到 ${changes.length} 条变更记录`);

  const syncedIds: string[] = [];
  const conflictIds: string[] = [];
  const createdConflicts: SyncConflict[] = [];

  for (const change of changes) {
    // 检查冲突：同一实体、不同设备、5 分钟内的变更
    const conflictResult = await pool.query(
      `SELECT id, user_id, entity_type, entity_id, change_type, data,
              timestamp, checksum, device_id
       FROM sync_changes
       WHERE user_id = $1
         AND entity_type = $2
         AND entity_id = $3
         AND device_id != $4
         AND timestamp > $5
       ORDER BY timestamp DESC
       LIMIT 1`,
      [userId, change.entityType, change.entityId, change.deviceId, change.timestamp - 300000]
    );

    if (conflictResult.rows.length > 0) {
      const existing = rowToChange(conflictResult.rows[0] as SyncChangeRow);

      // 检查 checksum：如果相同则数据相同，不算冲突
      if (existing.checksum === change.checksum) {
        console.log(`[Sync API] 检测到相同 checksum，跳过冲突创建: ${change.id}`);
        // 数据相同，不创建冲突，直接跳过
        continue;
      }

      // checksum 不同，创建冲突记录
      console.log(`[Sync API] 检测到真实冲突 (checksum 不同): ${change.id}`);
      const conflictInsert = await pool.query(
        `INSERT INTO sync_conflicts
           (user_id, entity_type, entity_id, local_data, remote_data,
            local_device_id, remote_device_id, local_timestamp, remote_timestamp, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          userId,
          existing.entityType,
          existing.entityId,
          JSON.stringify(existing.data),
          JSON.stringify(change.data),
          existing.deviceId,
          change.deviceId,
          existing.timestamp,
          change.timestamp,
          Date.now(),
        ]
      );

      const conflict = rowToConflict(conflictInsert.rows[0] as SyncConflictRow);
      conflictIds.push(change.id);
      createdConflicts.push(conflict);
    } else {
      // 插入变更记录
      const insertResult = await pool.query(
        `INSERT INTO sync_changes
           (id, user_id, entity_type, entity_id, change_type, data, timestamp, checksum, device_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          change.id,
          userId,
          change.entityType,
          change.entityId,
          change.changeType,
          JSON.stringify(change.data),
          change.timestamp,
          change.checksum,
          change.deviceId,
        ]
      );

      if (insertResult.rows.length > 0) {
        console.log(`[Sync API] 成功插入变更记录: ${change.id}, entityType: ${change.entityType}, entityId: ${change.entityId}`);
        syncedIds.push(change.id);
      } else {
        console.log(`[Sync API] 变更记录已存在（跳过）: ${change.id}`);
      }
    }
  }

  // 更新设备同步时间
  if (changes.length > 0) {
    await pool.query(
      `INSERT INTO sync_device_info (user_id, device_id, last_sync_time, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, device_id)
       DO UPDATE SET last_sync_time = $3, updated_at = NOW()`,
      [userId, changes[0]!.deviceId, Date.now()]
    );
    console.log(`[Sync API] 更新设备同步时间: userId=${userId}, deviceId=${changes[0]!.deviceId}`);
  }

  console.log(`[Sync API] 同步完成 - 总计: ${changes.length}, 成功: ${syncedIds.length}, 冲突: ${conflictIds.length}`);

  res.json(successResponse({
    success: true,
    syncedIds,
    conflictIds,
    conflicts: createdConflicts.map((c) => ({
      id: c.id,
      entityType: c.entityType,
      entityId: c.entityId
    })),
    stats: {
      total: changes.length,
      synced: syncedIds.length,
      conflicts: conflictIds.length
    }
  }));
});

/**
 * GET /sync/pull
 * 拉取远端变更
 */
syncRouter.get('/pull', authenticate, async (req: Request, res: Response) => {
  const userId = req.userId!;
  const since = parseInt(req.query.since as string) || 0;
  const deviceId = req.query.deviceId as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
  const offset = parseInt(req.query.offset as string) || 0;

  // 构建查询：排除当前设备的变更
  const params: unknown[] = [userId, since];
  let deviceFilter = '';
  if (deviceId) {
    deviceFilter = ' AND device_id != $3';
    params.push(deviceId);
  }

  // 查总数
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM sync_changes
     WHERE user_id = $1 AND timestamp > $2${deviceFilter}`,
    params
  );
  const total = parseInt((countResult.rows[0] as { count: string }).count, 10);

  // 查分页数据
  const dataParams = [...params, limit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  const changesResult = await pool.query(
    `SELECT id, user_id, entity_type, entity_id, change_type, data,
            timestamp, checksum, device_id
     FROM sync_changes
     WHERE user_id = $1 AND timestamp > $2${deviceFilter}
     ORDER BY timestamp ASC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    dataParams
  );

  const changes = (changesResult.rows as SyncChangeRow[]).map(rowToChange);

  // 更新设备同步时间
  if (deviceId) {
    await pool.query(
      `INSERT INTO sync_device_info (user_id, device_id, last_sync_time, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, device_id)
       DO UPDATE SET last_sync_time = $3, updated_at = NOW()`,
      [userId, deviceId, Date.now()]
    );
  }

  // 未解决冲突数
  const pendingResult = await pool.query(
    `SELECT COUNT(*) as count FROM sync_conflicts
     WHERE user_id = $1 AND resolved_at IS NULL`,
    [userId]
  );
  const pendingConflicts = parseInt((pendingResult.rows[0] as { count: string }).count, 10);

  const page = offset > 0 ? Math.floor(offset / limit) + 1 : 1;

  res.json(successResponse(
    {
      changes,
      pendingConflicts,
      serverTime: Date.now()
    },
    paginationMeta(total, page, limit)
  ));
});

/**
 * GET /sync/status
 * 获取同步状态
 */
syncRouter.get('/status', authenticate, async (req: Request, res: Response) => {
  const userId = req.userId!;

  // 设备数和最后同步时间
  const deviceResult = await pool.query(
    `SELECT COUNT(*) as device_count,
            COALESCE(MAX(last_sync_time), 0) as last_sync_time
     FROM sync_device_info
     WHERE user_id = $1`,
    [userId]
  );
  const row = deviceResult.rows[0] as { device_count: string; last_sync_time: string };
  const deviceCount = parseInt(row.device_count, 10);
  const lastSyncTime = Number(row.last_sync_time);

  // 未解决冲突
  const conflictsResult = await pool.query(
    `SELECT id, user_id, entity_type, entity_id,
            local_timestamp, remote_timestamp, created_at
     FROM sync_conflicts
     WHERE user_id = $1 AND resolved_at IS NULL`,
    [userId]
  );
  const pendingConflicts = conflictsResult.rows as SyncConflictRow[];

  // 总同步条目数
  const totalResult = await pool.query(
    `SELECT COUNT(*) as count FROM sync_changes WHERE user_id = $1`,
    [userId]
  );
  const totalSyncedItems = parseInt((totalResult.rows[0] as { count: string }).count, 10);

  res.json(successResponse({
    userId,
    lastSyncTime,
    deviceCount,
    pendingConflicts: pendingConflicts.length,
    totalSyncedItems,
    conflicts: pendingConflicts.map((c) => ({
      id: c.id,
      entityType: c.entity_type,
      entityId: c.entity_id,
      localTimestamp: Number(c.local_timestamp),
      remoteTimestamp: Number(c.remote_timestamp),
      createdAt: Number(c.created_at)
    })),
    serverTime: Date.now()
  }));
});

/**
 * POST /sync/resolve-conflict
 * 解决冲突
 */
syncRouter.post('/resolve-conflict', authenticate, async (req: Request, res: Response) => {
  const userId = req.userId!;

  const parseResult = ResolveConflictSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid request body', parseResult.error.errors);
  }

  const { conflictId, resolution, mergedData } = parseResult.data;

  // 查找冲突（必须属于当前用户且未解决）
  const conflictResult = await pool.query(
    `SELECT * FROM sync_conflicts WHERE id = $1 AND user_id = $2`,
    [conflictId, userId]
  );

  if (conflictResult.rows.length === 0) {
    throw new NotFoundError('Conflict');
  }

  const conflict = rowToConflict(conflictResult.rows[0] as SyncConflictRow);

  if (conflict.resolvedAt) {
    throw new ConflictError('Conflict already resolved');
  }

  // 确定最终数据
  let resultData: unknown;
  switch (resolution) {
    case 'keep_local':
      resultData = conflict.localData;
      break;
    case 'keep_remote':
      resultData = conflict.remoteData;
      break;
    case 'manual_merge':
      if (mergedData === undefined) {
        throw new ValidationError('mergedData is required for manual_merge resolution');
      }
      resultData = mergedData;
      break;
  }

  const now = Date.now();

  // 标记冲突已解决
  await pool.query(
    `UPDATE sync_conflicts SET resolved_at = $1, resolution = $2 WHERE id = $3`,
    [now, resolution, conflictId]
  );

  // 创建解决后的变更记录
  const resolvedChangeResult = await pool.query(
    `INSERT INTO sync_changes
       (user_id, entity_type, entity_id, change_type, data, timestamp, checksum, device_id)
     VALUES ($1, $2, $3, 'update', $4, $5, '', 'server-resolved')
     RETURNING id, entity_type, entity_id, timestamp`,
    [userId, conflict.entityType, conflict.entityId, JSON.stringify(resultData), now]
  );

  const resolved = resolvedChangeResult.rows[0] as {
    id: string;
    entity_type: string;
    entity_id: string;
    timestamp: string;
  };

  res.json(successResponse({
    success: true,
    conflictId,
    resolution,
    resolvedChange: {
      id: resolved.id,
      entityType: resolved.entity_type,
      entityId: resolved.entity_id,
      timestamp: Number(resolved.timestamp)
    }
  }));
});

/**
 * GET /sync/conflicts
 * 获取所有未解决的冲突
 */
syncRouter.get('/conflicts', authenticate, async (req: Request, res: Response) => {
  const userId = req.userId!;

  const result = await pool.query(
    `SELECT * FROM sync_conflicts WHERE user_id = $1 AND resolved_at IS NULL ORDER BY created_at DESC`,
    [userId]
  );

  const conflicts = (result.rows as SyncConflictRow[]).map(rowToConflict);

  res.json(successResponse({
    conflicts,
    total: conflicts.length
  }));
});

/**
 * GET /sync/conflicts/:id
 * 获取单个冲突详情
 */
syncRouter.get('/conflicts/:id', authenticate, async (req: Request, res: Response) => {
  const userId = req.userId!;
  const conflictId = req.params.id;

  const result = await pool.query(
    `SELECT * FROM sync_conflicts WHERE id = $1 AND user_id = $2`,
    [conflictId, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Conflict');
  }

  res.json(successResponse(rowToConflict(result.rows[0] as SyncConflictRow)));
});

/**
 * DELETE /sync/conflicts/:id
 * 删除冲突 (标记为忽略)
 */
syncRouter.delete('/conflicts/:id', authenticate, async (req: Request, res: Response) => {
  const userId = req.userId!;
  const conflictId = req.params.id;

  const result = await pool.query(
    `UPDATE sync_conflicts
     SET resolved_at = $1, resolution = 'keep_local'
     WHERE id = $2 AND user_id = $3 AND resolved_at IS NULL
     RETURNING id`,
    [Date.now(), conflictId, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Conflict');
  }

  res.json(successResponse({
    success: true,
    message: 'Conflict ignored'
  }));
});

/**
 * POST /sync/reset
 * 重置用户同步数据 (危险操作)
 */
syncRouter.post('/reset', authenticate, async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { confirm } = req.body;

  if (confirm !== 'RESET_SYNC_DATA') {
    throw new ValidationError('Please confirm reset by setting confirm to "RESET_SYNC_DATA"');
  }

  // 在事务中清除所有同步数据
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM sync_changes WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM sync_conflicts WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM sync_device_info WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  res.json(successResponse({
    success: true,
    message: 'Sync data reset successfully'
  }));
});

export default syncRouter;
