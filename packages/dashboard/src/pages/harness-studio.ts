/**
 * Harness Studio page entry — mounts the new 3-column UI.
 *
 * Drop-in usage:
 *   import { mountHarnessStudio } from './pages/harness-studio.js';
 *   mountHarnessStudio({ container: document.getElementById('app')! });
 *
 * Until King flips the route from legacy `studio.ts` → here, this page is
 * reachable via `/dashboard/?harness=1` (the router checks the URL flag).
 * After the flip, this becomes the default Studio page.
 */

import { HarnessStudioController } from '../views/harness-studio-controller.js';

export interface MountOptions {
  container: HTMLElement;
  /** API base. Defaults to the same origin (recommended). */
  apiBase?: string;
  /** Bearer token (when not using cookie-based auth). */
  bearerToken?: string;
}

export function mountHarnessStudio(opts: MountOptions): HarnessStudioController {
  const controller = new HarnessStudioController(opts);
  void controller.mount();
  return controller;
}

/**
 * URL-flag bootstrap so King can preview the new view alongside the legacy
 * one without flipping the default. Add to your top-level entry:
 *
 *   import { bootstrapHarnessIfFlagged } from './pages/harness-studio.js';
 *   if (bootstrapHarnessIfFlagged()) return;  // mounted, skip legacy.
 */
export function bootstrapHarnessIfFlagged(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('harness') !== '1') return false;
  const target = document.getElementById('app') ?? document.body;
  mountHarnessStudio({ container: target });
  return true;
}
