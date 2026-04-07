import { defineConfig } from '@playwright/test'

/**
 * Electron UI 测试专用配置
 * 不依赖 globalSetup（不需要数据库和 api-server）
 */
export default defineConfig({
  testDir: './tests/e2e/electron',
  timeout: 60000,
  retries: 1,
  workers: 1,
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'electron-ui',
      testMatch: '**/*.spec.ts',
      fullyParallel: false,
    },
  ],
  outputDir: './tests/e2e/results',
})
