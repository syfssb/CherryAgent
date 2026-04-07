import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../..')

type ElectronFixtures = {
  electronApp: ElectronApplication
  window: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use, testInfo) => {
    // Each worker gets a unique userData dir to avoid SingletonLock conflicts
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `e2e-electron-${testInfo.workerIndex}-`))
    const app = await electron.launch({
      args: [
        path.join(__dirname, 'test-main.cjs'),
        `--user-data-dir=${userDataDir}`,
      ],
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_DISABLE_GPU: '1',
        ELECTRON_USER_DATA_DIR: userDataDir,
      },
      timeout: 30000,
    })
    await use(app)
    await app.close()
    // Cleanup temp dir
    fs.rmSync(userDataDir, { recursive: true, force: true })
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await use(window)
  },
})

export { expect } from '@playwright/test'
