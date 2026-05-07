/**
 * Shaar Dashboard — Vite Configuration
 *
 * Build configuration for the SeraphimOS web dashboard.
 * Uses vanilla TypeScript (no React) with Vite for fast dev server
 * and optimized production builds.
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  resolve: {
    alias: {
      '@seraphim/core': resolve(__dirname, '../core/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
