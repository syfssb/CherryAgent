/**
 * J1: 邮箱注册 → 验证 → 登录 E2E 测试
 */
import { test, expect } from '@playwright/test'
import pg from 'pg'
import crypto from 'crypto'
import { apiRequest, cleanupTestUsers, createE2EPool } from '../fixtures/test-helpers.js'

// 固定随机 ID，retry 时不变
const RUN_ID = crypto.randomBytes(4).toString('hex')

test.describe.serial('J1: 邮箱注册→验证→登录', () => {
  let pool: pg.Pool
  const testEmail = `e2e-auth-${RUN_ID}@test.local`
  const testPassword = 'TestPass123!'
  let accessToken: string
  let refreshToken: string

  test.beforeAll(async () => {
    pool = createE2EPool()
    // 确保该邮箱不存在（清理上次残留，先删关联表）
    await pool.query(`DELETE FROM email_verification_tokens WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [testEmail]).catch(() => {})
    await pool.query(`DELETE FROM user_access_tokens WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [testEmail]).catch(() => {})
    await pool.query(`DELETE FROM user_balances WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [testEmail]).catch(() => {})
    await pool.query(`DELETE FROM users WHERE email = $1`, [testEmail])
  })

  test.afterAll(async () => {
    await cleanupTestUsers(pool)
    await pool.end()
  })

  test('1. POST /api/auth/register → 201, emailVerificationSent: true', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/register', {
      body: { email: testEmail, password: testPassword, name: 'E2E Auth Test' },
    })

    expect(status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.data.emailVerificationSent).toBe(true)
    expect(data.data.user.email).toBe(testEmail)
  })

  test('2. POST /api/auth/login/password (未验证) → 403', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/login/password', {
      body: { email: testEmail, password: testPassword },
    })

    expect(status).toBe(403)
    expect(data.success).toBe(false)
    expect(data.error.code).toBe('EMAIL_NOT_VERIFIED')
  })

  test('3. 直接通过数据库验证邮箱（模拟用户点击验证链接）', async () => {
    // 在 E2E 测试中，直接通过 SQL 标记邮箱已验证
    // 因为 verify-email 端点是给浏览器用的（返回 HTML），且 fire-and-forget 的 token 写入存在竞态
    const result = await pool.query(
      `UPDATE users SET email_verified_at = NOW() WHERE email = $1 RETURNING id`,
      [testEmail]
    )
    expect(result.rows.length).toBe(1)
  })

  test('4. POST /api/auth/login/password (已验证) → 200, 返回 accessToken + balance', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/login/password', {
      body: { email: testEmail, password: testPassword },
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.accessToken).toBeTruthy()
    expect(data.data.refreshToken).toBeTruthy()
    expect(data.data.user.email).toBe(testEmail)
    expect(data.data.balance).toBeDefined()

    accessToken = data.data.accessToken
    refreshToken = data.data.refreshToken
  })

  test('5. GET /api/auth/me (Bearer token) → 200, 返回用户信息', async () => {
    const { status, data } = await apiRequest('GET', '/api/auth/me', {
      token: accessToken,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.user.email).toBe(testEmail)
    expect(data.data.balance).toBeDefined()
  })

  test('6. POST /api/auth/refresh → 200, 返回新 accessToken', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/refresh', {
      body: { refreshToken },
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.accessToken).toBeTruthy()
    expect(data.data.refreshToken).toBeTruthy()
    // 注意：不断言 accessToken !== 旧值，因为同一秒内 JWT iat 相同会生成相同 token
  })

  test('7. 重复注册同一邮箱 → 409', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/register', {
      body: { email: testEmail, password: testPassword, name: 'Duplicate' },
    })

    expect(status).toBe(409)
    expect(data.success).toBe(false)
  })

  test('8. 弱密码注册 → 400', async () => {
    const weakPasswords = ['short', 'alllowercase1', 'ALLUPPERCASE1', 'NoDigitsHere']

    for (const weakPassword of weakPasswords) {
      const { status, data } = await apiRequest('POST', '/api/auth/register', {
        body: {
          email: `e2e-weak-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@test.local`,
          password: weakPassword,
        },
      })

      expect(status).toBe(400)
      expect(data.success).toBe(false)
    }
  })
})
