import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    exclude: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage/integration',
      exclude: [
        'node_modules',
        'dist',
        'src/db/migrations',
        '**/*.d.ts',
        'vitest.config*.ts',
      ],
      thresholds: {
        global: {
          statements: 70,
          functions: 70,
          lines: 70,
          branches: 65,
        },
      },
    },
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
