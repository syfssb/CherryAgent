import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [
      'src/**/*.integration.test.ts',
      'src/**/*.e2e.test.ts',
      'src/__tests__/setup.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage/unit',
      exclude: [
        'node_modules',
        'dist',
        'src/db/migrations',
        '**/*.d.ts',
        'vitest.config*.ts',
      ],
      thresholds: {
        global: {
          statements: 80,
          functions: 80,
          lines: 80,
          branches: 70,
        },
      },
    },
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
