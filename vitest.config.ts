import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    exclude: ['packages/dashboard/**', 'node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'packages/infra/**', 'packages/dashboard/**'],
    },
  },
  resolve: {
    alias: {
      '@seraphim/core': path.resolve(__dirname, 'packages/core/src'),
      '@seraphim/services': path.resolve(__dirname, 'packages/services/src'),
      '@seraphim/drivers': path.resolve(__dirname, 'packages/drivers/src'),
      '@seraphim/app': path.resolve(__dirname, 'packages/app/src'),
    },
  },
});
