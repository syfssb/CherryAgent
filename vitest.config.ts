import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    projects: [
      // ── 主项目 (Electron/UI) 单元测试 ──
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: [
            'src/**/*.integration.test.ts',
            'src/**/*.integration.test.tsx',
            'src/**/*.e2e.test.ts',
            'src/**/*.e2e.test.tsx',
          ],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            reportsDirectory: 'coverage/unit',
            exclude: [
              'node_modules',
              'dist',
              'dist-electron',
              '**/*.d.ts',
              'vitest.config*.ts',
              'src/ui/examples/**',
              'src/ui/USAGE_EXAMPLES.ts',
            ],
            thresholds: {
              statements: 80,
              functions: 80,
              lines: 80,
              branches: 70,
            },
          },
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, 'src'),
          },
        },
      },
      // ── 主项目 (Electron/UI) 集成测试 ──
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'jsdom',
          include: [
            'src/**/*.integration.test.ts',
            'src/**/*.integration.test.tsx',
          ],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            reportsDirectory: 'coverage/integration',
            exclude: [
              'node_modules',
              'dist',
              'dist-electron',
              '**/*.d.ts',
              'vitest.config*.ts',
            ],
            thresholds: {
              statements: 70,
              functions: 70,
              lines: 70,
              branches: 65,
            },
          },
          testTimeout: 15000,
          hookTimeout: 15000,
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, 'src'),
          },
        },
      },
      // ── API Server 单元测试 ──
      {
        test: {
          name: 'api-unit',
          root: './api-server',
          environment: 'node',
          globals: true,
          include: ['src/**/*.test.ts'],
          exclude: [
            'src/**/*.integration.test.ts',
            'src/**/*.e2e.test.ts',
            'src/__tests__/setup.ts',
          ],
          setupFiles: ['./src/__tests__/setup.ts'],
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
              statements: 80,
              functions: 80,
              lines: 80,
              branches: 70,
            },
          },
          testTimeout: 10000,
          hookTimeout: 10000,
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, 'api-server/src'),
          },
        },
      },
      // ── API Server 集成测试 ──
      {
        test: {
          name: 'api-integration',
          root: './api-server',
          environment: 'node',
          globals: true,
          include: ['src/**/*.integration.test.ts'],
          exclude: ['src/__tests__/setup.ts'],
          setupFiles: ['./src/__tests__/setup.ts'],
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
              statements: 70,
              functions: 70,
              lines: 70,
              branches: 65,
            },
          },
          testTimeout: 30000,
          hookTimeout: 30000,
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, 'api-server/src'),
          },
        },
      },
    ],
  },
});
