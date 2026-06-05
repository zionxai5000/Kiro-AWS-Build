/**
 * SeraphimOS Dashboard — Entry Point
 *
 * Initializes the Shaar web dashboard application. Mounts the App
 * into the #root element and establishes WebSocket connection for
 * real-time updates.
 *
 * Requirements: 9.1, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import { ensureAuthenticated } from './auth.js';
import { App } from './app.js';
import { initSentry } from './sentry.js';

// Initialize Sentry FIRST so we capture any errors that happen during
// authentication or app bootstrap.
initSentry();

// Build-time SHA banner so we can verify which bundle the user is loading.
// Vite injects __BUILD_SHA__ at build time via define config.
declare const __BUILD_SHA__: string;
const buildSha = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev';
console.log(`%c[ZionX] dashboard build: ${buildSha}`, 'color:#6c8cff;font-weight:bold');
(window as unknown as { __ZIONX_BUILD__?: string }).__ZIONX_BUILD__ = buildSha;

const root = document.getElementById('root');

if (!root) {
  throw new Error('Dashboard root element #root not found');
}

// Ensure user is authenticated before initializing the dashboard
async function bootstrap(): Promise<void> {
  await ensureAuthenticated();

  // Phase 10 — `?harness=1` opts into the new 3-column harness studio,
  // alongside the legacy dashboard. Once Phase 12 decommissions legacy,
  // this branch becomes the default path.
  const params = new URLSearchParams(window.location.search);
  if (params.get('harness') === '1') {
    const { mountHarnessStudio } = await import('./pages/harness-studio.js');
    mountHarnessStudio({ container: root! });
    return;
  }

  const app = new App(root!);
  void app.init();

  // Expose for debugging in development
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__seraphimApp = app;
  }
}

void bootstrap();
