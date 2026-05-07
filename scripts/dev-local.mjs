#!/usr/bin/env node
/**
 * SeraphimOS — Local Development Launcher
 *
 * Starts both the real-services API server (port 3000) and the Vite
 * dashboard dev server (port 5173) in a single command.
 *
 * Usage: node scripts/dev-local.mjs
 *        npm run dev:local
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Use npx on PATH — works on both Windows (cmd) and Unix shells
const isWindows = process.platform === 'win32';
const shell = isWindows;

// ── API Server (port 3000) ──────────────────────────────────────────
const api = spawn('npx', ['tsx', 'packages/services/src/shaar/local-server.ts'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell,
});

api.stdout.on('data', (chunk) => {
  for (const line of chunk.toString().split('\n')) {
    if (line.trim()) console.log(`[api]  ${line}`);
  }
});

api.stderr.on('data', (chunk) => {
  for (const line of chunk.toString().split('\n')) {
    if (line.trim()) console.error(`[api]  ${line}`);
  }
});

api.on('error', (err) => {
  console.error('[api]  Failed to start:', err.message);
  process.exit(1);
});

// Wait briefly for the API server to bind port 3000 before starting Vite,
// so the proxy target is available immediately.
const STARTUP_DELAY_MS = 3000;

// ── Vite Dashboard Dev Server (port 5173) ───────────────────────────
setTimeout(() => {
  const vite = spawn('npx', ['vite'], {
    cwd: resolve(root, 'packages/dashboard'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell,
  });

  vite.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) console.log(`[dash] ${line}`);
    }
  });

  vite.stderr.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) console.error(`[dash] ${line}`);
    }
  });

  vite.on('error', (err) => {
    console.error('[dash] Failed to start:', err.message);
  });

  // Graceful shutdown — kill both on SIGINT / SIGTERM
  const cleanup = () => {
    console.log('\nShutting down...');
    vite.kill();
    api.kill();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // If either process exits unexpectedly, tear down the other
  api.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[api]  Exited with code ${code}`);
    }
    vite.kill();
    process.exit(code ?? 1);
  });

  vite.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[dash] Exited with code ${code}`);
    }
    api.kill();
    process.exit(code ?? 1);
  });
}, STARTUP_DELAY_MS);

console.log('🔥 SeraphimOS dev:local — starting API server + Dashboard...\n');
