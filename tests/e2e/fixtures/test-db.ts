/**
 * E2E 测试数据库管理
 * 直接使用远程 Zeabur 主库，通过 e2e- 前缀隔离测试数据
 * 不再尝试创建独立测试库（迁移文件不完整，无法独立建库）
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')

/**
 * 获取数据库 URL（从 api-server/.env 读取）
 */
function getDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) {
    return process.env.E2E_DATABASE_URL
  }
  if (process.env.E2E_ADMIN_DATABASE_URL) {
    return process.env.E2E_ADMIN_DATABASE_URL
  }
  const envPath = path.join(projectRoot, 'api-server/.env')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8')
    const match = content.match(/^DATABASE_URL=(.+)$/m)
    if (match) return match[1].trim()
  }
  return process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/zeabur'
}

export function getTestDatabaseUrl(): string {
  return getDatabaseUrl()
}

/**
 * 清理所有 e2e 测试用户及其关联数据（处理外键约束）
 */
async function cleanupE2EData(pool: pg.Pool): Promise<void> {
  const sub = `(SELECT id FROM users WHERE email LIKE 'e2e-%@test.local')`
  await pool.query(`DELETE FROM email_verification_tokens WHERE user_id IN ${sub}`).catch(() => {})
  await pool.query(`DELETE FROM password_reset_tokens WHERE user_id IN ${sub}`).catch(() => {})
  await pool.query(`DELETE FROM user_access_tokens WHERE user_id IN ${sub}`).catch(() => {})
  await pool.query(`DELETE FROM balance_transactions WHERE user_id IN ${sub}`).catch(() => {})
  await pool.query(`DELETE FROM user_balances WHERE user_id IN ${sub}`).catch(() => {})
  await pool.query(`DELETE FROM users WHERE email LIKE 'e2e-%@test.local'`).catch(() => {})
}

export async function setupTestDatabase(): Promise<string> {
  const dbUrl = getDatabaseUrl()
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2, idleTimeoutMillis: 5000 })

  try {
    // 验证连接
    await pool.query('SELECT 1')
    console.log('[E2E] Connected to database')

    // 清理上次残留的测试数据
    await cleanupE2EData(pool)
    console.log('[E2E] Cleaned up stale test data')
  } finally {
    await pool.end()
  }

  // 设置环境变量供其他模块使用
  process.env.E2E_DATABASE_URL = dbUrl
  return dbUrl
}

export async function teardownTestDatabase(): Promise<void> {
  const dbUrl = getDatabaseUrl()
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2, idleTimeoutMillis: 5000 })

  try {
    await cleanupE2EData(pool)
    console.log('[E2E] Test data cleaned up')
  } catch {
    // 忽略清理错误
  } finally {
    await pool.end()
  }
}

export function createTestPool(): pg.Pool {
  return new pg.Pool({
    connectionString: getDatabaseUrl(),
    max: 2,
    idleTimeoutMillis: 5000,
  })
}
