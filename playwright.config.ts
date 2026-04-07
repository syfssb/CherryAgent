import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 1,
  workers: 1,
  globalSetup: './tests/e2e/fixtures/global-setup.ts',
  globalTeardown: './tests/e2e/fixtures/global-teardown.ts',
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'api',
      testMatch: 'api/**/*.spec.ts',
      fullyParallel: false,
    },
    {
      name: 'electron',
      testMatch: ['p0-*.spec.ts', 'p1-*.spec.ts', 'p2-*.spec.ts', 'diag.spec.ts'],
    },
    {
      name: 'electron-ui',
      testMatch: 'electron/**/*.spec.ts',
      fullyParallel: false,
    },
  ],
  outputDir: './tests/e2e/results',
})
