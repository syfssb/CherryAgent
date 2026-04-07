/**
 * Playwright globalSetup — 启动测试数据库和 api-server
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')

export default async function globalSetup() {
  // 加载 .env.e2e
  dotenv.config({ path: path.join(projectRoot, '.env.e2e') })
  // 也加载 .env.e2e.local（覆盖）
  dotenv.config({ path: path.join(projectRoot, '.env.e2e.local'), override: true })

  // 1. 创建测试数据库并运行迁移
  const { setupTestDatabase, getTestDatabaseUrl } = await import('./test-db.js')
  const dbUrl = await setupTestDatabase()
  console.log(`[E2E globalSetup] Test database ready: ${dbUrl}`)

  // 2. 启动 api-server
  const { startApiServer } = await import('./api-server-setup.js')
  const baseUrl = await startApiServer()
  console.log(`[E2E globalSetup] API server ready: ${baseUrl}`)
}
