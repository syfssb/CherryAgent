/**
 * J4: 充值 + 支付回调 E2E 测试
 *
 * 使用 /api/webhooks/payment-success 开发环境端点模拟支付
 */
import { test, expect } from '@playwright/test'
import pg from 'pg'
import {
  apiRequest,
  createVerifiedTestUser,
  simulatePaymentSuccess,
  cleanupTestUsers,
  createE2EPool,
} from '../fixtures/test-helpers.js'

test.describe('J4: 充值 + 支付回调', () => {
  let pool: pg.Pool
  let testUser: Awaited<ReturnType<typeof createVerifiedTestUser>>

  test.beforeAll(async () => {
    pool = createE2EPool()
    // 创建测试用户，初始积分为 0
    testUser = await createVerifiedTestUser(pool, { credits: 0 })
  })

  test.afterAll(async () => {
    await cleanupTestUsers(pool)
    await pool.end()
  })

  test('1. GET /api/billing/credits → credits: 0', async () => {
    const { status, data } = await apiRequest('GET', '/api/billing/credits', {
      token: testUser.accessToken,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.credits).toBe(0)
  })

  test('2. POST /api/webhooks/payment-success → 200, 充值成功', async () => {
    const orderId = `test-order-${Date.now()}`
    const amount = 10 // 10 元

    const { status, data } = await simulatePaymentSuccess({
      orderId,
      amount,
      userId: testUser.id,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  test('3. GET /api/billing/credits → credits > 0', async () => {
    const { status, data } = await apiRequest('GET', '/api/billing/credits', {
      token: testUser.accessToken,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    // 10 元 * 10 积分/元 = 100 积分
    expect(data.data.credits).toBeGreaterThan(0)
    expect(data.data.credits).toBe(100)
  })

  test('4. GET /api/billing/transactions → 包含 deposit 记录', async () => {
    const { status, data } = await apiRequest('GET', '/api/billing/transactions', {
      token: testUser.accessToken,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBeGreaterThan(0)

    // 查找 deposit 类型的记录
    const depositRecord = data.data.find(
      (tx: { type: string }) => tx.type === 'deposit'
    )
    expect(depositRecord).toBeDefined()
  })

  test('5. 多次充值累加', async () => {
    const orderId2 = `test-order-2-${Date.now()}`
    const { status } = await simulatePaymentSuccess({
      orderId: orderId2,
      amount: 5, // 5 元 = 50 积分
      userId: testUser.id,
    })
    expect(status).toBe(200)

    const { data } = await apiRequest('GET', '/api/billing/credits', {
      token: testUser.accessToken,
    })

    expect(data.success).toBe(true)
    // 100 + 50 = 150 积分
    expect(data.data.credits).toBe(150)
  })

  test('6. GET /api/billing/balance → 兼容旧版接口', async () => {
    const { status, data } = await apiRequest('GET', '/api/billing/balance', {
      token: testUser.accessToken,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.credits).toBeDefined()
    expect(data.data.credits).toBeGreaterThan(0)
  })
})
