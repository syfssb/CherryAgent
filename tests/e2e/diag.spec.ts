import { test, _electron as electron, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

test('诊断 Electron 启动环境', async () => {
  const testMain = path.join(projectRoot, 'tests/e2e/fixtures/test-main.cjs')
  console.log('testMain:', testMain)

  const app = await electron.launch({
    args: [testMain],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_DISABLE_GPU: '1',
    },
    cwd: projectRoot,
    timeout: 30000,
  })

  const appPath = await app.evaluate(async ({ app }) => app.getAppPath())
  console.log('app.getAppPath():', appPath)

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const electronAPI = await window.evaluate(() => {
    return {
      hasElectron: typeof (window as any).electron !== 'undefined',
      electronKeys: typeof (window as any).electron === 'object' ? Object.keys((window as any).electron) : [],
    }
  })
  console.log('electronAPI:', JSON.stringify(electronAPI, null, 2))

  await window.screenshot({ path: 'tests/e2e/results/diag-window.png' })

  expect(electronAPI.hasElectron).toBe(true)

  await app.close()
})
