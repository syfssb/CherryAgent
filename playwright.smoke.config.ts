/**
 * Smoke 测试专用 Playwright 配置
 * 不启动 API server（smoke 测试直接操作真实 Electron app，不需要本地 API）
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,   // 真实 AI 调用最长 3 分钟
  retries: 0,         // smoke 不重试，失败即失败
  workers: 1,
  // 无 globalSetup / globalTeardown — 不启动 API server
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'smoke',
      testMatch: ['p1-smoke-*.spec.ts'],
    },
  ],
  outputDir: './tests/e2e/results',
})
