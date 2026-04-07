import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
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
        global: {
          statements: 70,
          functions: 70,
          lines: 70,
          branches: 65,
        },
      },
    },
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
