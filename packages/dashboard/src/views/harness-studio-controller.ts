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
  /**
   * API base URL — must end in `/api` to match the legacy convention.
   * For S3-hosted production: `http://<alb>/api`.
   * For same-origin dev: `/api`.
   * If omitted, falls back to `window.__SERAPHIM_API_URL__` then to
   * `${window.location.origin}/api`.
   */
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
    this.apiBase = (opts.apiBase
      ?? (typeof window !== 'undefined' ? (window as unknown as { __SERAPHIM_API_URL__?: string }).__SERAPHIM_API_URL__ : undefined)
      ?? (typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api')
    ).replace(/\/+$/, '');
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
    // While the backend may still be booting, show a non-error breadcrumb
    // instead of a blank list — the fetchProjects retry handles 503s
    // automatically.
    this.view.appendMessage({ id: rid(), kind: 'phase', text: 'Loading projects…' });
    try {
      const projects = await this.fetchProjects();
      this.view.setState({ projects });
      // Replace the loading breadcrumb with a confirmation only if there's
      // something to confirm; an empty workspace is its own friendly state.
      if (projects.length === 0) {
        this.view.appendMessage({ id: rid(), kind: 'phase', text: 'No projects yet — start by typing a prompt below.' });
      }
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
      this.setState({
        projects,
        activeProjectId: res.projectId,
        messages: [],
        preview: { url: this.previewUrl(res.projectId), status: 'idle' },
      });
    } catch (err) {
      this.appendError(`Could not create project: ${(err as Error).message}`);
    }
  }

  private async handleSelect(projectId: string): Promise<void> {
    this.setState({
      activeProjectId: projectId,
      messages: [],
      preview: { url: this.previewUrl(projectId), status: 'waking' },
    });
    // Old projects whose sandbox timed out show "Sandbox Not Found" in the
    // preview proxy. Hit /sandbox/wake to spin up a fresh sandbox + Metro
    // so selecting a saved project actually loads its app.
    try {
      const res = await this.fetchJson<{ status: string; publicUrl?: string }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/sandbox/wake`,
        { method: 'POST', body: '{}' },
      );
      this.setState({
        preview: { url: this.previewUrl(projectId), status: res.status === 'live' ? 'live' : 'building' },
      });
    } catch (err) {
      this.appendError(`Could not wake sandbox: ${(err as Error).message}`);
      this.setState({
        preview: { url: this.previewUrl(projectId), status: 'error', errorMessage: (err as Error).message },
      });
    }
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
    this.setState({
      preview: {
        ...this.viewState().preview,
        url: `${this.previewUrl(project)}#${Date.now()}`,
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
        `/preview/${project}/token`,
        { method: 'POST', body: '{}' },
      );
      // urlPattern from the server is `/api/preview/<id>/?token=...`.
      // We host the dashboard on a different origin than the API in production,
      // so prepend the API origin (apiBase already ends in `/api`).
      const apiOrigin = this.apiBase.replace(/\/api$/, '');
      this.setState({
        preview: { ...this.viewState().preview, url: `${apiOrigin}${res.urlPattern}` },
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
        this.setState({
          projects,
          activeProjectId: projectId,
          preview: { url: this.previewUrl(projectId), status: 'building' },
        });
      } catch (err) {
        this.appendError(`Could not start a new project: ${(err as Error).message}`);
        return;
      }
    }

    this.view.appendMessage({ id: rid(), kind: 'user', text: prompt });
    this.setState({ streaming: true, preview: { ...this.viewState().preview, status: 'building' } });
    this.abortController = new AbortController();

    try {
      await this.streamAgent(projectId, prompt, this.abortController.signal);
      this.setState({
        streaming: false,
        preview: { ...this.viewState().preview, status: 'live', lastReloadMs: 0 },
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      this.appendError((err as Error).message);
      this.setState({
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
    // Retry on 503 boot responses. The backend ECS task may be restarting
    // when the user lands on the page; the agent loop endpoints return
    // {"error":"Service starting","status":"booting"} with 503 until the
    // task is ready (~75-90s). Without this retry the harness shows a
    // permanent "Failed to load projects" the moment it mounts.
    const maxAttempts = 6; // 6 * (1+2+3+4+5+5)s ≈ 20s of patient retries
    let lastBody = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch(`${this.apiBase}${path}`, {
        ...init,
        headers: this.headers(init.headers as Record<string, string> ?? { 'content-type': 'application/json' }),
      });
      if (res.ok) return res.json() as Promise<T>;
      lastBody = await res.text().catch(() => '');
      const isBoot = res.status === 503 && /booting|starting/i.test(lastBody);
      if (!isBoot || attempt === maxAttempts) {
        throw new Error(`HTTP ${res.status}${lastBody ? `: ${lastBody.slice(0, 200)}` : ''}`);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, attempt * 1_000)));
    }
    // Unreachable.
    throw new Error(`HTTP 503 after ${maxAttempts} attempts: ${lastBody.slice(0, 200)}`);
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
    return this._shadow.activeProjectId;
  }

  private viewState(): { activeProjectId: string | null; preview: { url: string | null; status: 'idle' | 'waking' | 'live' | 'building' | 'error'; lastReloadMs?: number; errorMessage?: string } } {
    return this._shadow;
  }

  /**
   * Shadow-state setter. Mirrors a subset of what we send to the view so
   * callers can read back the most-recently-set `activeProjectId` and
   * `preview` without round-tripping through the DOM. This is the only
   * place `view.setState` is forwarded.
   */
  private setState(patch: Partial<Parameters<HarnessStudioView['setState']>[0]>): void {
    if ('activeProjectId' in patch && typeof patch.activeProjectId !== 'undefined') {
      this._shadow.activeProjectId = patch.activeProjectId as string | null;
    }
    if ('preview' in patch && patch.preview) {
      this._shadow.preview = { ...this._shadow.preview, ...patch.preview as typeof this._shadow.preview };
    }
    this.view.setState(patch);
  }

  private _shadow: ReturnType<HarnessStudioController['viewState']> = {
    activeProjectId: null,
    preview: { url: null, status: 'idle' },
  };

  private appendError(message: string): void {
    const err: ChatMessage = { id: rid(), kind: 'error', text: message };
    this.view.appendMessage(err);
  }

  /**
   * Build the public preview URL for a project.
   * Public path is always `/api/preview/<id>` regardless of where the
   * dashboard is hosted. We need to hit the API origin (the ALB), not the
   * dashboard origin (S3), so we use `apiBase` minus the trailing `/api`.
   */
  private previewUrl(projectId: string): string {
    const apiOrigin = this.apiBase.replace(/\/api$/, '');
    return `${apiOrigin}/api/preview/${projectId}`;
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
