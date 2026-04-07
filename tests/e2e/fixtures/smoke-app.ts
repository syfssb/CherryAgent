/**
 * smoke-app.ts — Smoke 测试专用 Electron fixture
 *
 * 与 electron-app.ts 的区别：
 *   - 复制真实 userData（已登录 + 已完成引导）到临时目录
 *   - 删除 SingletonLock 避免冲突
 *   - 适用于需要真实 Claude API 的 real smoke 场景
 *
 * 认证恢复机制（auth recovery）：
 *   AppInitializer 在渲染进程里调用 verifyToken()，若生产 API 返回 401
 *   或网络超时，会触发 logout() 清空 Zustand 状态。
 *   本 fixture 检测到未登录时，走二次恢复路径：
 *     1. electronApp.evaluate() → 主进程 auth-service.refresh() 拿到新 access token
 *     2. BrowserWindow.webContents.send('auth:callback', { accessToken }) 推送到渲染进程
 *     3. useAuth() 监听到 auth:callback → login() → isAuthenticated=true → textarea 出现
 */
import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')

// 真实 userData 路径（dev 模式下 Electron 使用 app.getName() = cherry-agent）
const REAL_USER_DATA = path.join(
  os.homedir(),
  'Library/Application Support/cherry-agent'
)

type SmokeFixtures = {
  electronApp: ElectronApplication
  window: Page
}

/**
 * 通过主进程刷新 token 并推送到渲染进程
 * 返回是否成功恢复认证状态
 */
async function recoverAuth(electronApp: ElectronApplication, window: Page): Promise<boolean> {
  try {
    const freshToken = await electronApp.evaluate(async () => {
      const authPath = `${process.cwd()}/dist-electron/src/electron/libs/auth-service.js`
      try {
        const authModule = await import(`file://${authPath}`) as {
          refresh: () => Promise<{ success: boolean }>
          getToken: (key: string) => string | null
        }
        await authModule.refresh()
        return authModule.getToken('accessToken')
      } catch {
        return null
      }
    })

    if (!freshToken) return false

    await electronApp.evaluate(({ BrowserWindow }, token) => {
      const wins = BrowserWindow.getAllWindows()
      if (wins.length > 0) {
        wins[0].webContents.send('auth:callback', { accessToken: token })
      }
    }, freshToken)

    return await window.locator('textarea[data-prompt-input]')
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
  } catch {
    return false
  }
}

export const test = base.extend<SmokeFixtures>({
  electronApp: async ({}, use, testInfo) => {
    // 1. 复制真实 userData 到独立临时目录（保留登录态 + 引导完成标记）
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `smoke-electron-${testInfo.workerIndex}-`))

    if (fs.existsSync(REAL_USER_DATA)) {
      fs.cpSync(REAL_USER_DATA, tempDir, {
        recursive: true,
        filter: (src) => {
          // 跳过缓存、大型二进制，只保留关键状态文件
          const rel = path.relative(REAL_USER_DATA, src)
          const skip = ['Cache', 'Code Cache', 'GPUCache', 'DawnWebGPUCache',
                        'DawnGraphiteCache', 'CrashpadMetrics', 'blob_storage',
                        'backups', 'sessions.db-wal', 'sessions.db-shm']
          return !skip.some(s => rel.startsWith(s))
        }
      })
      // 删除 SingletonLock，否则新进程无法启动
      const lockFile = path.join(tempDir, 'SingletonLock')
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile)
      const cookieLock = path.join(tempDir, 'SingletonCookie')
      if (fs.existsSync(cookieLock)) fs.unlinkSync(cookieLock)
    } else {
      console.warn('[smoke-app] 未找到真实 userData，将以空白状态启动（测试可能因未登录而失败）')
      console.warn('[smoke-app] 期望路径：', REAL_USER_DATA)
    }

    const app = await electron.launch({
      args: [
        path.join(__dirname, 'test-main.cjs'),
        `--user-data-dir=${tempDir}`,
      ],
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',    // dev 模式读 vite dev server
        ELECTRON_DISABLE_GPU: '1',
        ELECTRON_USER_DATA_DIR: tempDir,
      },
      timeout: 30000,
    })

    await use(app)
    await app.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // 自动关闭新手引导弹窗（如果出现）
    try {
      const closeBtn = window.locator('button:has-text("跳过"), button[aria-label="关闭"], .onboarding-close, [data-testid="onboarding-skip"]')
      const guide = window.locator('text=欢迎使用 Cherry Agent')
      const isGuideVisible = await guide.isVisible({ timeout: 3000 }).catch(() => false)
      if (isGuideVisible) {
        const closable = await closeBtn.first().isVisible({ timeout: 1000 }).catch(() => false)
        if (closable) {
          await closeBtn.first().click()
        } else {
          await window.locator('button').filter({ hasText: /^[×✕x]$/i }).first().click().catch(() => {})
          await window.keyboard.press('Escape').catch(() => {})
        }
        await window.waitForTimeout(500)
      }
    } catch {
      // 引导弹窗不存在或已关闭，继续
    }

    // 等待 AppInitializer 完成认证流程（主路径：最多等 20 秒）
    // AppInitializer 完成后：若已登录则 textarea 可见；若未登录则显示登录提示
    const promptInput = window.locator('textarea[data-prompt-input]')
    const authOk = await promptInput
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true)
      .catch(() => false)

    if (!authOk) {
      await recoverAuth(electronApp, window)
    }

    await use(window)
  },
})

export { expect } from '@playwright/test'
