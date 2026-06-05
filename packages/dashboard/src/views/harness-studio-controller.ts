/**
 * Harness Studio controller — glues `HarnessStudioView` to the backend.
 *
 * Responsibilities:
 *   1. Fetch the project list once on mount, populate the sidebar.
 *   2. On submit: open an SSE stream against
 *      `POST /app-dev/projects/:id/agent-message`, translate every event
 *      into ChatMessages and append to the view.
 *   3. Manage preview pane src — `/api/preview/:projectId/`.
 *   4. Wire the QR modal to `POST /api/preview/:projectId/token`.
 *   5. Forward Stop clicks to AbortController.
 */

import {
  HarnessStudioView,
  ssePayloadToMessages,
  type HarnessProject,
  type ChatMessage,
  type SsePayload,
} from './harness-studio.js';

export interface HarnessStudioControllerOptions {
  /** API base, e.g. `''` for same-origin or `https://api.example.com`. */
  apiBase?: string;
  /** Optional bearer token. When omitted, cookie-based auth is assumed. */
  bearerToken?: string;
  /** Container element the view renders into. */
  container: HTMLElement;
}

export class HarnessStudioController {
  private view: HarnessStudioView;
  private apiBase: string;
  private bearer: string | undefined;
  private abortController: AbortController | null = null;

  constructor(opts: HarnessStudioControllerOptions) {
    this.apiBase = opts.apiBase ?? '';
    this.bearer = opts.bearerToken;

    this.view = new HarnessStudioView(opts.container, {
      onSubmit: this.handleSubmit.bind(this),
      onStop: this.handleStop.bind(this),
      onSelectProject: this.handleSelect.bind(this),
      onNewProject: this.handleNew.bind(this),
      onPlatform: (p) => this.view.setState({ platform: p }),
      onRefresh: this.handleRefresh.bind(this),
      onFullscreen: this.handleFullscreen.bind(this),
      onPhone: this.handlePhone.bind(this),
      onModalClose: () => this.view.setState({ qrModalOpen: false }),
      onPaneTab: (tab) => this.view.setState({ paneTab: tab }),
      onPlanToggle: () => { /* handled inside the view */ },
    });
    this.view.render();
  }

  /** Mount: load project list, render shell. Idempotent. */
  async mount(): Promise<void> {
    try {
      const projects = await this.fetchProjects();
      this.view.setState({ projects });
    } catch (err) {
      this.view.setState({
        projects: [],
        messages: [{ id: rid(), kind: 'error', text: `Failed to load projects: ${(err as Error).message}` }],
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  private async handleNew(): Promise<void> {
    const name = prompt('Project name?')?.trim();
    if (!name) return;
    const description = prompt('What should it do? (one line)')?.trim() ?? '';

    try {
      const res = await this.fetchJson<{ projectId: string }>('/app-dev/projects', {
        method: 'POST',
        body: JSON.stringify({ name, description, platform: 'both' }),
      });
      const projects = await this.fetchProjects();
      this.view.setState({
        projects,
        activeProjectId: res.projectId,
        messages: [],
        preview: { url: `${this.apiBase}/api/preview/${res.projectId}`, status: 'idle' },
      });
    } catch (err) {
      this.appendError(`Could not create project: ${(err as Error).message}`);
    }
  }

  private async handleSelect(projectId: string): Promise<void> {
    this.view.setState({
      activeProjectId: projectId,
      messages: [],
      preview: { url: `${this.apiBase}/api/preview/${projectId}`, status: 'idle' },
    });
  }

  private handleStop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.view.setState({ streaming: false });
      this.view.appendMessage({ id: rid(), kind: 'phase', text: 'Cancelled.' });
    }
  }

  private handleRefresh(): void {
    // Bump the iframe by appending a cache-buster fragment.
    const project = this.activeProjectId();
    if (!project) return;
    this.view.setState({
      preview: {
        ...this.viewState().preview,
        url: `${this.apiBase}/api/preview/${project}#${Date.now()}`,
        status: this.viewState().preview.status,
      },
    });
  }

  private handleFullscreen(): void {
    const iframe = document.querySelector('.harness-preview__viewport iframe');
    if (iframe instanceof HTMLIFrameElement && iframe.requestFullscreen) {
      iframe.requestFullscreen().catch(() => { /* user denied */ });
    }
  }

  private async handlePhone(): Promise<void> {
    const project = this.activeProjectId();
    if (!project) {
      this.appendError('Select a project first.');
      return;
    }
    try {
      const res = await this.fetchJson<{ urlPattern: string }>(
        `/api/preview/${project}/token`,
        { method: 'POST', body: '{}' },
      );
      this.view.setState({
        preview: { ...this.viewState().preview, url: `${this.apiBase}${res.urlPattern}` },
        qrModalOpen: true,
      });
    } catch (err) {
      this.appendError(`Could not issue phone token: ${(err as Error).message}`);
    }
  }

  private async handleSubmit(prompt: string, projectIdMaybe: string | null): Promise<void> {
    let projectId = projectIdMaybe;
    if (!projectId) {
      // Auto-create on first submission so the user doesn't have to ask first.
      try {
        const created = await this.fetchJson<{ projectId: string }>('/app-dev/projects', {
          method: 'POST',
          body: JSON.stringify({ name: deriveName(prompt), description: prompt, platform: 'both' }),
        });
        projectId = created.projectId;
        const projects = await this.fetchProjects();
        this.view.setState({
          projects,
          activeProjectId: projectId,
          preview: { url: `${this.apiBase}/api/preview/${projectId}`, status: 'building' },
        });
      } catch (err) {
        this.appendError(`Could not start a new project: ${(err as Error).message}`);
        return;
      }
    }

    this.view.appendMessage({ id: rid(), kind: 'user', text: prompt });
    this.view.setState({ streaming: true, preview: { ...this.viewState().preview, status: 'building' } });
    this.abortController = new AbortController();

    try {
      await this.streamAgent(projectId, prompt, this.abortController.signal);
      this.view.setState({
        streaming: false,
        preview: { ...this.viewState().preview, status: 'live', lastReloadMs: 0 },
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      this.appendError((err as Error).message);
      this.view.setState({
        streaming: false,
        preview: { ...this.viewState().preview, status: 'error', errorMessage: (err as Error).message },
      });
    } finally {
      this.abortController = null;
    }
  }

  // ---------------------------------------------------------------------------
  // SSE streaming
  // ---------------------------------------------------------------------------

  private async streamAgent(projectId: string, promptText: string, signal: AbortSignal): Promise<void> {
    const res = await fetch(`${this.apiBase}/app-dev/projects/${projectId}/agent-message`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json', accept: 'text/event-stream' }),
      body: JSON.stringify({ prompt: promptText }),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`agent-message HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const evt of events) {
        const dataLine = evt.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        try {
          const payload = JSON.parse(dataLine.slice(6)) as SsePayload;
          for (const m of ssePayloadToMessages(payload)) {
            this.view.appendMessage(m);
          }
        } catch {
          /* malformed event line, ignore */
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // API helpers
  // ---------------------------------------------------------------------------

  private async fetchProjects(): Promise<HarnessProject[]> {
    const list = await this.fetchJson<{ projects: Array<Record<string, unknown>> }>(
      '/app-dev/projects',
      { method: 'GET' },
    );
    return (list.projects ?? []).map((p): HarnessProject => ({
      id: String(p.projectId ?? p.id ?? ''),
      name: String(p.name ?? p.projectId ?? 'Untitled'),
      status: (String(p.status ?? 'idle')) as HarnessProject['status'],
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : undefined,
      qualityBarFailed: !!(p.qualityBarFailed ?? false),
      scores: p.qualityGate && typeof p.qualityGate === 'object' ? extractScores(p.qualityGate as Record<string, unknown>) : undefined,
    }));
  }

  private async fetchJson<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.apiBase}${path}`, {
      ...init,
      headers: this.headers(init.headers as Record<string, string> ?? { 'content-type': 'application/json' }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
    return res.json() as Promise<T>;
  }

  private headers(extra: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this.bearer) h['authorization'] = `Bearer ${this.bearer}`;
    return h;
  }

  // ---------------------------------------------------------------------------
  // Internal accessors
  // ---------------------------------------------------------------------------

  private activeProjectId(): string | null {
    return this.viewState().activeProjectId;
  }

  private viewState(): { activeProjectId: string | null; preview: { url: string | null; status: 'idle' | 'waking' | 'live' | 'building' | 'error'; lastReloadMs?: number; errorMessage?: string } } {
    // The view owns state; we read it back via a render side-channel.
    // Use a hidden-but-stable reference: the view exports `setState` already,
    // so we keep a shadow copy here that mirrors what we last set.
    return this._shadow;
  }

  private _shadow: ReturnType<HarnessStudioController['viewState']> = {
    activeProjectId: null,
    preview: { url: null, status: 'idle' },
  };

  private appendError(message: string): void {
    const err: ChatMessage = { id: rid(), kind: 'error', text: message };
    this.view.appendMessage(err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function deriveName(prompt: string): string {
  const cleaned = prompt
    .replace(/^build (me )?(an? |the )?/i, '')
    .replace(/\.$/, '')
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 4).join(' ');
  return words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : 'New project';
}

function extractScores(qg: Record<string, unknown>): { visual: number; persistence: number; domain: number; onboarding: number } | undefined {
  const v = num(qg.visualPolishScore ?? qg.visual);
  const p = num(qg.persistenceScore ?? qg.persistence);
  const d = num(qg.domainFitnessScore ?? qg.domain);
  const o = num(qg.onboardingScore ?? qg.onboarding);
  if (v == null && p == null && d == null && o == null) return undefined;
  return { visual: v ?? 0, persistence: p ?? 0, domain: d ?? 0, onboarding: o ?? 0 };
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
