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

  // Phase 12.7 — harness studio is now the default; `?legacy=1` opts INTO
  // the old dashboard for one release while we soak the new one.
  // Pre-flip behavior was the inverse — kept here as a soft-fallback signal.
  const params = new URLSearchParams(window.location.search);
  const wantLegacy = params.get('legacy') === '1';
  const wantHarness = params.get('harness') !== '0' && !wantLegacy;

  if (wantHarness) {
    const { mountHarnessStudio } = await import('./pages/harness-studio.js');
    // The dashboard is hosted on S3, the API on the ALB. We pass the API
    // URL through so the controller knows where to fetch from. Without this,
    // every fetch resolves against the S3 origin and 404s.
    const apiBase = (window as unknown as { __SERAPHIM_API_URL__?: string }).__SERAPHIM_API_URL__ ?? `${window.location.origin}/api`;
    mountHarnessStudio({ container: root!, apiBase });
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
