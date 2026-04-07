/**
 * J3: 真实 LLM 对话代理 E2E 测试
 *
 * 需要 E2E_ANTHROPIC_API_KEY 环境变量
 * 如果未配置则全部跳过
 */
import { test, expect } from '@playwright/test'
import pg from 'pg'
import {
  apiRequest,
  createVerifiedTestUser,
  setupTestChannel,
  cleanupTestUsers,
  createE2EPool,
} from '../fixtures/test-helpers.js'
import { E2E_BASE_URL } from '../fixtures/api-server-setup.js'

const ANTHROPIC_API_KEY = process.env.E2E_ANTHROPIC_API_KEY

test.describe('J3: 真实 LLM 对话代理', () => {
  let pool: pg.Pool
  let testUser: Awaited<ReturnType<typeof createVerifiedTestUser>>

  test.beforeAll(async () => {
    if (!ANTHROPIC_API_KEY) {
      return
    }

    pool = createE2EPool()

    // 创建测试用户（1000 积分）
    testUser = await createVerifiedTestUser(pool, { credits: 1000 })

    // 配置 Anthropic 渠道
    await setupTestChannel(pool, {
      provider: 'anthropic',
      apiKey: ANTHROPIC_API_KEY,
      models: ['claude-sonnet-4-20250514'],
    })
  })

  test.afterAll(async () => {
    if (pool) {
      await cleanupTestUsers(pool)
      await pool.end()
    }
  })

  test('1. POST /api/proxy/v1/messages (非流式) → 200, 有 content', async () => {
    test.skip(!ANTHROPIC_API_KEY, 'E2E_ANTHROPIC_API_KEY 未配置')

    const { status, data } = await apiRequest('POST', '/api/proxy/v1/messages', {
      token: testUser.accessToken,
      body: {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
      },
    })

    expect(status).toBe(200)
    // 非流式返回 Claude 原生格式
    expect(data.content).toBeDefined()
    expect(Array.isArray(data.content)).toBe(true)
    expect(data.content.length).toBeGreaterThan(0)

    const textBlock = data.content.find((b: { type: string }) => b.type === 'text')
    expect(textBlock).toBeDefined()
    expect(textBlock.text.toLowerCase()).toContain('hello')

    // 应包含 usage 信息
    expect(data.usage).toBeDefined()
    expect(data.usage.input_tokens).toBeGreaterThan(0)
    expect(data.usage.output_tokens).toBeGreaterThan(0)
  })

  test('2. POST /api/proxy/v1/messages (流式) → SSE 事件流', async () => {
    test.skip(!ANTHROPIC_API_KEY, 'E2E_ANTHROPIC_API_KEY 未配置')

    const url = `${E2E_BASE_URL}/api/proxy/v1/messages`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUser.accessToken}`,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 50,
        stream: true,
        messages: [{ role: 'user', content: 'Say "world" and nothing else.' }],
      }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    // 读取 SSE 流
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let hasContentDelta = false
    let hasDone = false

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      fullText += chunk

      if (chunk.includes('content_block_delta')) {
        hasContentDelta = true
      }
      if (chunk.includes('[DONE]')) {
        hasDone = true
        break
      }
    }

    expect(hasContentDelta).toBe(true)
    expect(hasDone).toBe(true)
    expect(fullText.toLowerCase()).toContain('world')
  })

  test('3. GET /api/billing/credits → credits < 1000 (积分已扣减)', async () => {
    test.skip(!ANTHROPIC_API_KEY, 'E2E_ANTHROPIC_API_KEY 未配置')

    const { status, data } = await apiRequest('GET', '/api/billing/credits', {
      token: testUser.accessToken,
    })

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    // 经过前面两次对话，积分应该有所扣减
    expect(data.data.credits).toBeLessThan(1000)
  })

  test('4. 余额为 0 时发送对话 → 余额不足错误', async () => {
    test.skip(!ANTHROPIC_API_KEY, 'E2E_ANTHROPIC_API_KEY 未配置')

    // 将积分设为 0
    await pool.query(
      `UPDATE user_balances SET credits = 0 WHERE user_id = $1`,
      [testUser.id]
    )

    const { status, data } = await apiRequest('POST', '/api/proxy/v1/messages', {
      token: testUser.accessToken,
      body: {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Hello' }],
      },
    })

    // 应返回余额不足错误 (402 或 403)
    expect([402, 403]).toContain(status)
  })
})
