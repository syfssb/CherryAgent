import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
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
        global: {
          statements: 80,
          functions: 80,
          lines: 80,
          branches: 70,
        },
      },
    },
  },
});
