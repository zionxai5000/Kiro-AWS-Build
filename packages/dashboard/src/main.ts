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

const root = document.getElementById('root');

if (!root) {
  throw new Error('Dashboard root element #root not found');
}

// Ensure user is authenticated before initializing the dashboard
async function bootstrap(): Promise<void> {
  await ensureAuthenticated();
  const app = new App(root!);
  void app.init();

  // Expose for debugging in development
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__seraphimApp = app;
  }
}

void bootstrap();
