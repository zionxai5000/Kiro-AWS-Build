/**
 * Shaar Dashboard — Vite Configuration
 *
 * Build configuration for the SeraphimOS web dashboard.
 * Uses vanilla TypeScript (no React) with Vite for fast dev server
 * and optimized production builds.
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'node:child_process';

// Resolve a short build SHA at config time so the bundle bakes it in.
// Falls back to a timestamp when git isn't available (e.g. CI fallback).
function resolveBuildSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return `dev-${Date.now()}`;
  }
}

const BUILD_SHA = resolveBuildSha();

export default defineConfig({
  root: '.',
  define: {
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
  },
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
