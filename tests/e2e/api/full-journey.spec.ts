/**
 * J5: 完整用户旅程 E2E 测试
 *
 * 串联注册 → 验证 → 登录 → 充值 → 对话 → 查记录 → 刷新 Token → 登出
 */
import { test, expect } from '@playwright/test'
import pg from 'pg'
import {
  apiRequest,
  setupTestChannel,
  simulatePaymentSuccess,
  cleanupTestUsers,
  createE2EPool,
} from '../fixtures/test-helpers.js'
import { E2E_BASE_URL } from '../fixtures/api-server-setup.js'

const ANTHROPIC_API_KEY = process.env.E2E_ANTHROPIC_API_KEY

test.describe('J5: 完整用户旅程', () => {
  let pool: pg.Pool
  const journeyEmail = `e2e-journey-${Date.now()}@test.local`
  const journeyPassword = 'JourneyPass123!'

  // 在整个旅程中传递的状态
  let userId: string
  let accessToken: string
  let refreshToken: string

  test.beforeAll(async () => {
    pool = createE2EPool()

    // 如果有 Anthropic API Key，配置渠道
    if (ANTHROPIC_API_KEY) {
      await setupTestChannel(pool, {
        provider: 'anthropic',
        apiKey: ANTHROPIC_API_KEY,
        models: ['claude-sonnet-4-20250514'],
      })
    }
  })

  test.afterAll(async () => {
    await cleanupTestUsers(pool)
    await pool.end()
  })

  test('Step 1: 注册', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/register', {
      body: { email: journeyEmail, password: journeyPassword, name: 'Journey User' },
    })

    expect(status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.data.emailVerificationSent).toBe(true)
    userId = data.data.user.id
  })

  test('Step 2: 查库获取 verification token', async () => {
    const result = await pool.query(
      `SELECT evt.token
       FROM email_verification_tokens evt
       WHERE evt.user_id = $1
       ORDER BY evt.created_at DESC
       LIMIT 1`,
      [userId]
    )
    expect(result.rows.length).toBeGreaterThan(0)

    const token = (result.rows[0] as { token: string }).token
    expect(token).toBeTruthy()

    // 保存 token 到测试上下文
    test.info().annotations.push({ type: 'verify_token', description: token })
  })

  test('Step 3: 验证邮箱', async () => {
    // 重新查询 token（因为 Playwright 测试间不共享 annotations）
    const result = await pool.query(
      `SELECT evt.token
       FROM email_verification_tokens evt
       WHERE evt.user_id = $1
       ORDER BY evt.created_at DESC
       LIMIT 1`,
      [userId]
    )
    const verifyToken = (result.rows[0] as { token: string }).token

    const { status, data } = await apiRequest('GET', `/api/auth/verify-email/${verifyToken}`)

    expect(status).toBe(200)
    expect(typeof data).toBe('string')
    expect(data).toMatch(/验证成功|success/i)
  })

  test('Step 4: 登录', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/login/password', {
      body: { email: journeyEmail, password: journeyPassword },
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)

    accessToken = data.data.accessToken
    refreshToken = data.data.refreshToken

    expect(accessToken).toBeTruthy()
    expect(refreshToken).toBeTruthy()
  })

  test('Step 5: 查看余额', async () => {
    const { status, data } = await apiRequest('GET', '/api/billing/credits', {
      token: accessToken,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.credits).toBeDefined()
  })

  test('Step 6: 模拟充值', async () => {
    const orderId = `journey-order-${Date.now()}`
    const { status, data } = await simulatePaymentSuccess({
      orderId,
      amount: 20, // 20 元 = 200 积分
      userId,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  test('Step 7: 验证余额增加', async () => {
    const { status, data } = await apiRequest('GET', '/api/billing/credits', {
      token: accessToken,
    })

    expect(status).toBe(200)
    expect(data.data.credits).toBeGreaterThanOrEqual(200)
  })

  test('Step 8: 发送对话（如果有 ANTHROPIC_API_KEY）', async () => {
    test.skip(!ANTHROPIC_API_KEY, 'E2E_ANTHROPIC_API_KEY 未配置')
    test.skip(!apiKey, '未获取到 API Key')

    const creditsBefore = await getCredits()

    const { status, data } = await apiRequest('POST', '/api/proxy/v1/messages', {
      apiKey,
      body: {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 30,
        messages: [{ role: 'user', content: 'Reply with just "ok".' }],
      },
    })

    expect(status).toBe(200)
    expect(data.content).toBeDefined()

    // 验证积分扣减
    const creditsAfter = await getCredits()
    expect(creditsAfter).toBeLessThan(creditsBefore)
  })

  test('Step 9: 查看交易记录', async () => {
    const { status, data } = await apiRequest('GET', '/api/billing/transactions', {
      token: accessToken,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    // 至少有充值记录
    expect(data.data.length).toBeGreaterThan(0)
  })

  test('Step 10: 刷新 Token', async () => {
    const { status, data } = await apiRequest('POST', '/api/auth/refresh', {
      body: { refreshToken },
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.accessToken).toBeTruthy()

    // 更新 token（不断言 !== 旧值，同一秒内 JWT iat 相同会生成相同 token）
    const newAccessToken = data.data.accessToken
    accessToken = newAccessToken
    refreshToken = data.data.refreshToken
  })

  test('Step 11: 用新 Token 验证身份', async () => {
    const { status, data } = await apiRequest('GET', '/api/auth/me', {
      token: accessToken,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.user.email).toBe(journeyEmail)
  })

  // ---- 辅助函数 ----

  async function getCredits(): Promise<number> {
    const { data } = await apiRequest('GET', '/api/billing/credits', {
      token: accessToken,
    })
    return data.data.credits
  }
})
