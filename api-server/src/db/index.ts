import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../utils/env.js';
import * as schema from './schema.js';

const { Pool } = pg;

const poolMax = Math.max(1, env.DB_POOL_MAX);
const poolMin = Math.max(0, Math.min(env.DB_POOL_MIN, poolMax));
if (env.DB_POOL_MIN > env.DB_POOL_MAX) {
  console.warn(
    `[DB] DB_POOL_MIN (${env.DB_POOL_MIN}) 大于 DB_POOL_MAX (${env.DB_POOL_MAX})，已自动调整为 min=${poolMin}, max=${poolMax}`
  );
}

/**
 * PostgreSQL 连接池
 */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: poolMax,
  min: poolMin,
  idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
  statement_timeout: 30000,
  query_timeout: 35000,
});

// 连接错误处理
pool.on('error', (err) => {
  console.error('PostgreSQL 连接池错误:', {
    message: err?.message,
    code: (err as { code?: string } | undefined)?.code,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

/**
 * Drizzle ORM 实例
 */
export const db = drizzle(pool, { schema });

/**
 * 测试数据库连接
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('数据库连接测试失败:', error);
    return false;
  }
}

/**
 * 关闭数据库连接
 */
export async function closeConnection(): Promise<void> {
  await pool.end();
}

export { pool };
