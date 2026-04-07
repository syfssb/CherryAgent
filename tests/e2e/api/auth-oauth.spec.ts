/**
 * J2: Google OAuth 模拟 E2E 测试
 *
 * 使用 /api/auth/test/mock-oauth-result 端点模拟 OAuth 流程
 * 该端点仅在 development/test 环境可用
 */
import { test, expect } from '@playwright/test'
import pg from 'pg'
import { apiRequest, cleanupTestUsers, createE2EPool } from '../fixtures/test-helpers.js'

test.describe('J2: Google OAuth 模拟', () => {
  let pool: pg.Pool
  const oauthEmail = `e2e-oauth-${Date.now()}@test.local`
  const oauthName = 'OAuth Test User'
  const testState = `test-state-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  test.beforeAll(async () => {
    pool = createE2EPool()
  })

  test.afterAll(async () => {
    await cleanupTestUsers(pool)
    await pool.end()
  })

  test('1. GET /api/auth/oauth/google → 检查 OAuth 配置', async () => {
    const { status, data } = await apiRequest('GET', '/api/auth/oauth/google')

    // 如果 GOOGLE_CLIENT_ID 未配置，返回 400
    if (status === 400) {
      expect(data.success).toBe(false)
      // 这是预期行为，OAuth 未配置
    } else {
      // 如果配置了，应返回 authUrl 和 state
      expect(status).toBe(200)
      expect(data.data.authUrl).toBeTruthy()
      expect(data.data.state).toBeTruthy()
    }
  })

  test('2. POST /api/auth/test/mock-oauth-result → 写入模拟 OAuth 结果', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/test/mock-oauth-result', {
      body: {
        state: testState,
        email: oauthEmail,
        name: oauthName,
        avatarUrl: 'https://example.com/avatar.png',
      },
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.state).toBe(testState)
  })

  test('3. GET /api/auth/oauth/result?state=xxx → 返回 accessToken', async () => {
    const { status, data } = await apiRequest(
      'GET',
      `/api/auth/oauth/result?state=${testState}`
    )

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.accessToken).toBeTruthy()
    expect(data.data.refreshToken).toBeTruthy()

    // 保存 token 用于下一步
    test.info().annotations.push({
      type: 'oauth_token',
      description: data.data.accessToken,
    })
  })

  test('4. GET /api/auth/me → 验证 OAuth 用户信息', async () => {
    // 先重新获取 token（因为 oauth/result 是一次性的，需要重新 mock）
    const newState = `test-state-verify-${Date.now()}`
    await apiRequest('POST', '/api/auth/test/mock-oauth-result', {
      body: {
        state: newState,
        email: oauthEmail,
        name: oauthName,
      },
    })

    const resultRes = await apiRequest('GET', `/api/auth/oauth/result?state=${newState}`)
    expect(resultRes.status).toBe(200)
    const token = resultRes.data.data.accessToken
    expect(token).toBeTruthy()

    // 用 token 获取用户信息
    const { status, data } = await apiRequest('GET', '/api/auth/me', {
      token,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.user.email).toBe(oauthEmail)
  })

  test('5. 轮询不存在的 state → 返回 pending', async () => {
    const { status, data } = await apiRequest(
      'GET',
      '/api/auth/oauth/result?state=nonexistent-state-12345'
    )

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.pending).toBe(true)
  })

  test('6. mock-oauth-result 缺少必填字段 → 400', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/test/mock-oauth-result', {
      body: { state: 'some-state' },
      // 缺少 email
    })

    expect(status).toBe(400)
    expect(data.success).toBe(false)
  })
})
