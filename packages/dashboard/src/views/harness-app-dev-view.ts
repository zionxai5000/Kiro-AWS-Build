/**
 * HarnessAppDevView — the new agent-harness studio, mounted INSIDE the
 * dashboard chrome (top nav + sidebar) when the user navigates to
 * ZionX → App Development.
 *
 * Replaces the legacy `StudioView` for that single tab only. The rest of
 * the dashboard (King's View, Agents, Eretz, ZXMG, Alpha, Shaar, SME,
 * Reference Ingestion) is untouched.
 *
 * Lazy-loads the harness controller on mount so the harness chunk only
 * downloads when the user actually opens the tab — keeps the
 * unrelated-tabs cold-start fast.
 */

import type { HarnessStudioController } from './harness-studio-controller.js';

export class HarnessAppDevView {
  private container: HTMLElement;
  private controller: HarnessStudioController | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    // The harness studio expects to own its container's whole layout (3-column
    // locked-viewport grid). Wipe whatever the dashboard left in there.
    this.container.innerHTML = '';

    // Resolve the API base from the same global the rest of the dashboard
    // uses. Falls back to same-origin /api in dev.
    const apiBase = (window as unknown as { __SERAPHIM_API_URL__?: string }).__SERAPHIM_API_URL__
      ?? `${window.location.origin}/api`;

    const { HarnessStudioController } = await import('./harness-studio-controller.js');
    this.controller = new HarnessStudioController({
      container: this.container,
      apiBase,
    });
    await this.controller.mount();
  }

  unmount(): void {
    // Controller has no explicit teardown today; the view's container is
    // wiped by the dashboard's view-switch code, which removes any DOM
    // event listeners attached via the rendered HTML. Streaming AbortController
    // is released when the next handleSubmit fires or the page reloads.
    this.controller = null;
    this.container.innerHTML = '';
  }
}
