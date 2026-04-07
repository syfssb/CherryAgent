/**
 * E2E 测试辅助函数
 * 创建测试用户、配置渠道、模拟支付回调等
 */
import pg from 'pg'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { E2E_BASE_URL } from './api-server-setup.js'

import { getTestDatabaseUrl } from './test-db.js'

const JWT_SECRET = 'e2e-test-jwt-secret-must-be-at-least-32-characters-long'
const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

export interface TestUser {
  id: string
  email: string
  password: string
  accessToken: string
  refreshToken: string
}

/**
 * 简单的 bcrypt-like 密码哈希（使用 crypto）
 * 注意：E2E 测试中我们通过 API 注册用户，这个函数仅用于直接写库的场景
 */
async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs')
  return bcrypt.default.hash(password, 12)
}

/**
 * AES-256-CBC 加密（与 api-server/src/utils/crypto.ts 一致）
 */
function encrypt(text: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

/**
 * 创建已验证的测试用户（直接写库，跳过邮箱验证）
 */
export async function createVerifiedTestUser(
  pool: pg.Pool,
  opts?: { email?: string; credits?: number; name?: string }
): Promise<TestUser> {
  const email = opts?.email ?? `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`
  const password = 'TestPass123!'
  const hashedPassword = await hashPassword(password)
  const name = opts?.name ?? 'E2E Test User'

  // 1. 插入用户（email_verified_at 直接设为 NOW()）
  const userResult = await pool.query(
    `INSERT INTO users (email, password, name, role, email_verified_at)
     VALUES ($1, $2, $3, 'user', NOW())
     RETURNING id, email`,
    [email, hashedPassword, name]
  )
  const userId = userResult.rows[0].id

  // 2. 创建余额记录
  const credits = opts?.credits ?? 100
  await pool.query(
    `INSERT INTO user_balances (user_id, credits, total_credits_purchased)
     VALUES ($1, $2, $2)
     ON CONFLICT (user_id) DO UPDATE SET credits = $2`,
    [userId, credits]
  )

  // 3. 生成 JWT tokens
  const accessToken = jwt.sign(
    { sub: userId, email, role: 'user' },
    JWT_SECRET,
    { expiresIn: '1h' }
  )
  const refreshToken = jwt.sign(
    { sub: userId, email, role: 'user', type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' }
  )

  return { id: userId, email, password, accessToken, refreshToken }
}

/**
 * 配置 LLM 测试渠道
 */
export async function setupTestChannel(
  pool: pg.Pool,
  opts: { provider: string; apiKey: string; models: string[] }
): Promise<string> {
  const encryptedKey = encrypt(opts.apiKey)
  const baseUrl = opts.provider === 'anthropic'
    ? 'https://api.anthropic.com'
    : 'https://api.openai.com/v1'

  const result = await pool.query(
    `INSERT INTO channels (name, provider, base_url, api_key, models, weight, priority, is_enabled, cost_multiplier)
     VALUES ($1, $2, $3, $4, $5, 1, 1, true, 1.0)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      `e2e-${opts.provider}-${Date.now()}`,
      opts.provider,
      baseUrl,
      encryptedKey,
      JSON.stringify(opts.models),
    ]
  )
  return result.rows[0]?.id ?? 'existing'
}

/**
 * MD5 哈希（与迅虎支付签名一致）
 */
function md5Hash(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex')
}

/**
 * 生成迅虎支付签名（与 xunhupay.ts generateSign 一致）
 */
export function generateXunhupaySign(
  params: Record<string, string | number>,
  secret: string
): string {
  const sortedKeys = Object.keys(params).sort()
  const signStr = sortedKeys
    .filter(key => params[key] !== '' && params[key] !== undefined)
    .map(key => `${key}=${params[key]}`)
    .join('&')
  return md5Hash(signStr + secret)
}

/**
 * HTTP 请求辅助（使用 fetch）
 */
export async function apiRequest(
  method: string,
  path: string,
  opts?: {
    body?: any
    token?: string
    apiKey?: string
    headers?: Record<string, string>
  }
): Promise<{ status: number; data: any; raw: Response }> {
  const url = `${E2E_BASE_URL}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...opts?.headers,
  }

  if (opts?.token) {
    headers['Authorization'] = `Bearer ${opts.token}`
  } else if (opts?.apiKey) {
    headers['Authorization'] = `Bearer ${opts.apiKey}`
  }

  const res = await fetch(url, {
    method,
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  })

  let data: any
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    data = await res.json()
  } else {
    data = await res.text()
  }

  return { status: res.status, data, raw: res }
}

/**
 * 模拟迅虎支付回调
 */
export async function simulateXunhupayCallback(opts: {
  tradeOrderId: string
  totalFee: string
  secret: string
  plugins?: string
}): Promise<{ status: number; data: any }> {
  const params: Record<string, string> = {
    trade_order_id: opts.tradeOrderId,
    total_fee: opts.totalFee,
    transaction_id: `xunhu_${Date.now()}`,
    open_id: 'e2e_test_user',
    order_title: 'E2E 测试充值',
    status: 'OD',
    plugins: opts.plugins ?? '',
  }
  params.hash = generateXunhupaySign(params, opts.secret)

  return apiRequest('POST', '/api/webhooks/xunhupay', { body: params })
}

/**
 * 模拟支付成功（开发环境端点）
 */
export async function simulatePaymentSuccess(opts: {
  orderId: string
  amount: number
  userId: string
}): Promise<{ status: number; data: any }> {
  return apiRequest('POST', '/api/webhooks/payment-success', {
    body: {
      orderId: opts.orderId,
      amount: opts.amount,
      userId: opts.userId,
      type: 'recharge',
    },
  })
}

/**
 * 创建带 SSL 配置的 pg.Pool（适配 Zeabur 远程数据库）
 */
export function createE2EPool(urlOverride?: string): pg.Pool {
  const url = urlOverride || getE2EDatabaseUrl()
  return new pg.Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 5000,
  })
}

/**
 * 获取 E2E 测试数据库 URL
 */
export function getE2EDatabaseUrl(): string {
  return getTestDatabaseUrl()
}

/**
 * 清理测试数据（先删关联表，再删用户）
 */
export async function cleanupTestUsers(pool: pg.Pool): Promise<void> {
  // 先删除有外键引用的关联表
  await pool.query(
    `DELETE FROM email_verification_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'e2e-%@test.local')`
  ).catch(() => {})
  await pool.query(
    `DELETE FROM user_access_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'e2e-%@test.local')`
  ).catch(() => {})
  await pool.query(
    `DELETE FROM user_balances WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'e2e-%@test.local')`
  ).catch(() => {})
  await pool.query(
    `DELETE FROM balance_transactions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'e2e-%@test.local')`
  ).catch(() => {})
  await pool.query(
    `DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'e2e-%@test.local')`
  ).catch(() => {})
  // 最后删用户
  await pool.query(`DELETE FROM users WHERE email LIKE 'e2e-%@test.local'`)
}

