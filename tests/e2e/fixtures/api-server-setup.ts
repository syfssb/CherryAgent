/**
 * E2E 测试 api-server 启动/停止
 * 在 globalSetup 中启动，globalTeardown 中关闭
 */
import type { Server } from 'http'
import { getTestDatabaseUrl } from './test-db.js'

let server: Server | null = null

/**
 * 设置测试环境变量（必须在 import app 之前调用）
 */
function setTestEnv(dbUrl: string, port: number) {
  process.env.NODE_ENV = 'test' // test 环境：阻止 app.ts 自动 listen，且 test-only 端点仍可用
  process.env.PORT = String(port)
  process.env.API_BASE_URL = `http://localhost:${port}`
  process.env.FRONTEND_URL = 'http://127.0.0.1:5173'
  process.env.LANDING_URL = 'http://localhost:3002'
  process.env.DATABASE_URL = dbUrl
  process.env.JWT_SECRET = 'e2e-test-jwt-secret-must-be-at-least-32-characters-long'
  process.env.JWT_EXPIRES_IN = '1h'
  process.env.JWT_REFRESH_EXPIRES_IN = '7d'
  process.env.API_KEY_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  process.env.CORS_ORIGINS = `http://localhost:${port},http://127.0.0.1:5173,http://localhost:5173`
  process.env.RATE_LIMIT_MAX_REQUESTS = '10000'
  process.env.LOG_LEVEL = 'error'
  process.env.LOG_FORMAT = 'dev'

  // 迅虎支付测试密钥
  const xunhupaySecret = process.env.E2E_XUNHUPAY_APPSECRET || 'e2e-test-xunhupay-secret'
  process.env.XUNHUPAY_APPID = 'e2e-test-appid'
  process.env.XUNHUPAY_APPSECRET = xunhupaySecret
  process.env.XUNHUPAY_NOTIFY_URL = `http://localhost:${port}/api/webhooks/xunhupay`

  // Google OAuth 测试配置
  if (process.env.E2E_GOOGLE_CLIENT_ID) {
    process.env.GOOGLE_CLIENT_ID = process.env.E2E_GOOGLE_CLIENT_ID
    process.env.GOOGLE_CLIENT_SECRET = process.env.E2E_GOOGLE_CLIENT_SECRET
    process.env.GOOGLE_OAUTH_REDIRECT_URI = `http://localhost:${port}/api/auth/oauth/google/callback`
  }
}

export const E2E_PORT = 3099
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`

export async function startApiServer(): Promise<string> {
  const dbUrl = getTestDatabaseUrl()
  setTestEnv(dbUrl, E2E_PORT)

  // 动态 import app（环境变量必须在 import 前设置好）
  const { createApp } = await import('../../../api-server/src/app.js')
  const app = createApp()

  return new Promise((resolve, reject) => {
    server = app.listen(E2E_PORT, () => {
      console.log(`[E2E] api-server started on port ${E2E_PORT}`)
      resolve(E2E_BASE_URL)
    })
    server.on('error', reject)
  })
}

export async function stopApiServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => {
        console.log('[E2E] api-server stopped')
        resolve()
      })
    })
    server = null
  }
}
