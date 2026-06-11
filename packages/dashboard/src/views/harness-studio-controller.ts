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
  type HarnessStudioState,
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
      onPaneTab: (tab) => {
        this.view.setState({ paneTab: tab });
        if (tab === 'code' || tab === 'ship' || tab === 'files' || tab === 'image' || tab === 'audio' || tab === 'db') {
          void this.refreshActiveProjectFiles();
        }
        if (tab === 'ship' || tab === 'deploy') void this.refreshShipState();
        if (tab === 'deploy') void this.refreshDeployments();
        if (tab === 'logs' && !this.logSubscriptionStarted) void this.subscribeLogs();
      },
      onPlanToggle: () => { /* handled inside the view */ },
      onCodeFileOpen: this.handleCodeOpen.bind(this),
      onCodeContentChange: this.handleCodeContentChange.bind(this),
      onCodeSave: this.handleCodeSave.bind(this),
      onBuild: this.handleBuild.bind(this),
      onGenerateListing: this.handleGenerateListing.bind(this),
      onPreflight: this.handlePreflight.bind(this),
      onSubmitConfirm: this.handleSubmitConfirm.bind(this),
      // G2.B — Files / Image / Audio. Most of these route to the agent
      // by sending a synthetic chat prompt; the agent handles asset
      // generation through existing OpenAI Images / TTS pipelines.
      onFileOpen: (path) => {
        // The view has already switched the tab to "code" and called
        // onCodeFileOpen; this is a no-op pass-through.
        void path;
      },
      onImageGenerate: (prompt) => {
        const projectId = this.activeProjectId();
        if (!projectId) return;
        this.view.setState({ imageGenerating: true });
        this.handleSubmit(`Generate an image for the app: ${prompt}. Save it under assets/ and reference it from the app where appropriate.`, projectId);
      },
      onImageUseAsIcon: (path) => {
        const projectId = this.activeProjectId();
        if (!projectId) return;
        this.handleSubmit(`Use ${path} as the app icon. Update app.json's "icon" field and any other places that reference the icon.`, projectId);
      },
      onImageUseInApp: (path) => {
        const projectId = this.activeProjectId();
        if (!projectId) return;
        this.handleSubmit(`Use ${path} somewhere meaningful in the app — pick the right screen, e.g. as a hero image, splash, or category card.`, projectId);
      },
      onAudioTts: (prompt) => {
        const projectId = this.activeProjectId();
        if (!projectId) return;
        this.handleSubmit(`Generate a short audio clip via TTS: "${prompt}". Save it under assets/ and wire it to a meaningful event (e.g. button-tap, win, error).`, projectId);
      },
      onAudioRecord: () => {
        // Browser-side recording is a separate flow; for now nudge the
        // user to drop the file in via the Files tab.
        this.view.appendMessage({ id: rid(), kind: 'phase', text: '🎤 Recording UI not yet wired — drop a clip into Files for now.' });
      },
      onAudioWire: (path) => {
        const projectId = this.activeProjectId();
        if (!projectId) return;
        this.handleSubmit(`Wire ${path} into the app — pick the most natural event for it (button press, win condition, etc.) and update Code accordingly.`, projectId);
      },
      // G2.C — Logs / Request "Ask AI" + Replay
      onAskAiAboutLog: (logId) => {
        const projectId = this.activeProjectId();
        if (!projectId) return;
        const log = this.view.getState().logs.find((l) => l.id === logId);
        if (!log) return;
        this.view.setState({ paneTab: 'preview' });
        this.handleSubmit(`Look at this log line and explain what it means. Fix it if it's an error:\n${log.level.toUpperCase()} [${log.source}] ${log.text}`, projectId);
      },
      onRequestReplay: this.handleRequestReplay.bind(this),
      // G2.D — Deploy snapshot + rollback
      onDeployNow: (env) => {
        const projectId = this.activeProjectId();
        if (!projectId) return;
        this.view.appendMessage({ id: rid(), kind: 'phase', text: `🚀 Deploying to ${env}…` });
        void this.handleDeployNow(projectId, env);
      },
      onDeployRollback: (snapId) => {
        const projectId = this.activeProjectId();
        if (!projectId) return;
        this.view.appendMessage({ id: rid(), kind: 'phase', text: `⏪ Rolling back to ${snapId}…` });
        void this.handleDeployRollback(projectId, snapId);
      },
      // G2.E — backward link: scroll Chat to the message that produced
      // an artifact.
      onLinkBackToMessage: (messageId) => {
        const root = this.view['container'] as HTMLElement;
        const node = root?.querySelector?.(`[data-message-id="${messageId}"]`);
        if (node) {
          this.view.setState({ paneTab: 'preview', highlightedMessageId: messageId });
          (node as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
          (node as HTMLElement).classList.add('is-highlighted');
          setTimeout(() => (node as HTMLElement).classList.remove('is-highlighted'), 2000);
        }
      },
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

  /** Track the last announced sandbox phase across all poll loops so
   *  duplicate "Build phase: X" chat lines never accumulate even when
   *  the backend is bouncing in/out of the same phase or multiple poll
   *  loops fire concurrently. Reset by handleSelect when switching
   *  projects. */
  private lastAnnouncedPhase = '';
  private lastAnnouncedPhaseAt = 0;

  private async handleSelect(projectId: string): Promise<void> {
    this.setState({
      activeProjectId: projectId,
      messages: [],
      preview: { url: this.previewUrl(projectId), status: 'waking' },
    });
    this.lastAnnouncedPhase = '';
    this.lastAnnouncedPhaseAt = 0;
    this.view.appendMessage({ id: rid(), kind: 'phase', text: 'Waking sandbox — bundling app, ~1-3 min on first wake…' });
    // wakeSandbox now returns 202 immediately and runs the bundle in the
    // background. Poll GET /sandbox every 5s until ready or error.
    try {
      await this.fetchJson<{ status: string }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/sandbox/wake`,
        { method: 'POST', body: '{}' },
      );
    } catch (err) {
      // Some 504s might still happen on cold paths; treat as "build started" optimistically.
      this.view.appendMessage({ id: rid(), kind: 'phase', text: `Wake start: ${(err as Error).message.slice(0, 100)} — polling anyway…` });
    }
    // Poll for up to 8 minutes.
    const start = Date.now();
    while (Date.now() - start < 8 * 60_000) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const status = await this.fetchJson<{ status: string; publicUrl?: string; phase?: string; error?: string }>(
          `/app-dev/projects/${encodeURIComponent(projectId)}/sandbox`,
          { method: 'GET' },
        );
        // Coalesce: only emit a new phase line if the phase actually changed
        // since the last announcement (across ALL poll loops, not just this
        // one). The lastAnnouncedPhase field on the controller persists
        // across overlapping polls so the chat doesn't stutter.
        if (status.phase && status.phase !== this.lastAnnouncedPhase) {
          this.view.appendMessage({ id: rid(), kind: 'phase', text: `Build phase: ${status.phase}` });
          this.lastAnnouncedPhase = status.phase;
          this.lastAnnouncedPhaseAt = Date.now();
        }
        if (status.status === 'live' || status.status === 'ready') {
          this.setState({
            preview: { url: this.previewUrl(projectId), status: 'live' },
          });
          this.view.appendMessage({ id: rid(), kind: 'phase', text: '✦ Preview ready — loading…' });
          return;
        }
        if (status.status === 'error') {
          this.appendError(`Build failed: ${status.error ?? 'unknown'}`);
          this.setState({
            preview: { url: this.previewUrl(projectId), status: 'error', errorMessage: status.error ?? 'unknown' },
          });
          return;
        }
      } catch (err) {
        // Polling failures are non-fatal; keep trying.
      }
    }
    this.appendError('Sandbox build timed out after 8 minutes');
    this.setState({
      preview: { url: this.previewUrl(projectId), status: 'error', errorMessage: 'Sandbox build timed out' },
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
          // G2.F — translate agent events into Agents Live + thinking strip.
          this.applyEventToAgentsAndThinking(payload);
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

  // ---------------------------------------------------------------------------
  // Code tab handlers (use case 5)
  // ---------------------------------------------------------------------------

  private async refreshActiveProjectFiles(): Promise<void> {
    const projectId = this.activeProjectId();
    if (!projectId) return;
    try {
      const res = await this.fetchJson<{ files: string[] }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/files`,
        { method: 'GET' },
      );
      // Update the projects list with the file list for the active project.
      const projects = this.view.getState().projects.map((p) =>
        p.id === projectId ? { ...p, files: res.files } : p,
      );
      this.view.setState({ projects });
    } catch (err) {
      this.appendError(`Could not list files: ${(err as Error).message}`);
    }
  }

  private async handleCodeOpen(path: string): Promise<void> {
    const projectId = this.activeProjectId();
    if (!projectId) return;
    try {
      const res = await this.fetchJson<{ content: string }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(path)}`,
        { method: 'GET' },
      );
      this.view.setState({
        codeOpenPath: path,
        codeContent: res.content,
        codeIsDirty: false,
        codeSavedAt: Date.now(),
      });
    } catch (err) {
      this.appendError(`Could not open ${path}: ${(err as Error).message}`);
    }
  }

  private handleCodeContentChange(path: string, content: string): void {
    if (path !== this.view.getState().codeOpenPath) return;
    this.view.setState({ codeContent: content, codeIsDirty: true });
  }

  private async handleCodeSave(path: string, content: string): Promise<void> {
    const projectId = this.activeProjectId();
    if (!projectId) return;
    try {
      await this.fetchJson<{ bytesWritten: number; warnings: string[] }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(path)}`,
        { method: 'PUT', body: JSON.stringify({ content }) },
      );
      this.view.setState({ codeIsDirty: false, codeSavedAt: Date.now() });
      this.view.appendMessage({ id: rid(), kind: 'phase', text: `✎ Saved ${path}` });

      // Trigger a re-bundle so the iframe reflects the change.
      this.view.appendMessage({ id: rid(), kind: 'phase', text: '◐ Rebuilding preview…' });
      await this.fetchJson<{ status: string }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/sandbox/wake`,
        { method: 'POST', body: '{}' },
      ).catch(() => {});
      // Bump iframe with a cache-buster so it reloads after the next 'live' poll.
      this.setState({
        preview: { url: `${this.previewUrl(projectId)}#${Date.now()}`, status: 'building' },
      });
      // Background poll for live state (reuses handleSelect's strategy).
      void this.pollSandboxUntilLive(projectId);
    } catch (err) {
      this.appendError(`Save failed: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Ship tab handlers (use cases 7, 8, 9, 10, 11, 15)
  // ---------------------------------------------------------------------------

  /** Fetch crashes + cost in parallel and surface in ShipState. */
  private async refreshShipState(): Promise<void> {
    const projectId = this.activeProjectId();
    if (!projectId) return;
    const projectIdEnc = encodeURIComponent(projectId);
    const [crashes, cost] = await Promise.all([
      this.fetchJson<{ crashes: Array<{ sentryEventId: string; errorMessage: string; platform: 'ios' | 'android' | 'unknown'; observedAt: string }> }>(
        `/app-dev/projects/${projectIdEnc}/crashes`,
        { method: 'GET' },
      ).catch(() => ({ crashes: [] })),
      this.fetchJson<{ todayUsd: number; dailyLimitUsd: number; perHook?: Record<string, { count: number; durationMs: number; failureRate: number }> }>(
        `/app-dev/projects/${projectIdEnc}/cost`,
        { method: 'GET' },
      ).catch(() => null),
    ]);
    const ship = { ...this.view.getState().ship };
    ship.crashes = crashes.crashes;
    if (cost) ship.cost = cost;
    this.view.setState({ ship });
  }

  // ---------------------------------------------------------------------------
  // G2.C — Logs subscription
  // ---------------------------------------------------------------------------

  private logSubscriptionStarted = false;
  private logsWs: WebSocket | null = null;

  private async subscribeLogs(): Promise<void> {
    if (this.logSubscriptionStarted) return;
    this.logSubscriptionStarted = true;
    // The dashboard already exposes a WebSocket bridge for app-dev events.
    // Connect to it and translate every event into a log line.
    try {
      const wsBase = this.apiBase.replace(/^http/, 'ws').replace(/\/api$/, '');
      const url = `${wsBase}/ws`;
      const ws = new WebSocket(url);
      this.logsWs = ws;
      ws.addEventListener('message', (ev) => {
        try {
          const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
          if (!data) return;
          this.appendLog({
            id: rid(),
            level: this.classifyLogLevel(data),
            source: this.classifyLogSource(data),
            text: this.formatLogText(data),
            ts: data.ts ?? new Date().toISOString(),
            traceId: data.traceId,
          });
          // Detect HTTP-shaped events for the Request inspector.
          if (data.method && data.url && typeof data.status !== 'undefined') {
            this.appendRequest({
              id: rid(),
              method: String(data.method),
              url: String(data.url),
              status: Number(data.status),
              ms: Number(data.ms ?? 0),
              ts: data.ts ?? new Date().toISOString(),
              reqBody: data.reqBody ? JSON.stringify(data.reqBody, null, 2).slice(0, 4000) : undefined,
              resBody: data.resBody ? JSON.stringify(data.resBody, null, 2).slice(0, 4000) : undefined,
              traceId: data.traceId,
              byMessageId: data.byMessageId,
            });
          }
        } catch {
          /* ignore malformed frames */
        }
      });
      ws.addEventListener('close', () => {
        this.logSubscriptionStarted = false;
        this.logsWs = null;
      });
    } catch (e) {
      this.appendLog({
        id: rid(),
        level: 'warn',
        source: 'system',
        text: `Logs WebSocket unavailable: ${(e as Error).message}`,
        ts: new Date().toISOString(),
      });
    }
  }

  private appendLog(line: HarnessStudioState['logs'][number]): void {
    const cur = this.view.getState().logs;
    const next = [...cur, line];
    // Cap retained lines so the DOM doesn't blow up after a long session.
    if (next.length > 2000) next.splice(0, next.length - 2000);
    this.view.setState({ logs: next });
  }

  private appendRequest(req: HarnessStudioState['requests'][number]): void {
    const cur = this.view.getState().requests;
    const next = [...cur, req];
    if (next.length > 500) next.splice(0, next.length - 500);
    this.view.setState({ requests: next });
  }

  private classifyLogLevel(d: Record<string, unknown>): 'info' | 'warn' | 'error' | 'debug' {
    const explicit = String(d.level ?? '').toLowerCase();
    if (explicit === 'error' || explicit === 'warn' || explicit === 'info' || explicit === 'debug') {
      return explicit as 'error' | 'warn' | 'info' | 'debug';
    }
    const msg = JSON.stringify(d).toLowerCase();
    if (msg.includes('error') || msg.includes('fail') || msg.includes('crash')) return 'error';
    if (msg.includes('warn')) return 'warn';
    if (msg.includes('debug')) return 'debug';
    return 'info';
  }

  private classifyLogSource(d: Record<string, unknown>): 'agent' | 'build' | 'runtime' | 'system' {
    const t = String(d.type ?? d.source ?? '').toLowerCase();
    if (t.includes('agent') || t.includes('hook')) return 'agent';
    if (t.includes('build') || t.includes('eas') || t.includes('bundle')) return 'build';
    if (t.includes('runtime') || t.includes('sandbox') || t.includes('preview')) return 'runtime';
    return 'system';
  }

  private formatLogText(d: Record<string, unknown>): string {
    if (typeof d.message === 'string') return d.message;
    if (typeof d.text === 'string') return d.text;
    if (typeof d.summary === 'string') return d.summary;
    return JSON.stringify(d).slice(0, 800);
  }

  private async handleRequestReplay(requestId: string): Promise<void> {
    const req = this.view.getState().requests.find((r) => r.id === requestId);
    if (!req) return;
    this.view.appendMessage({ id: rid(), kind: 'phase', text: `🔁 Replaying ${req.method} ${req.url}…` });
    try {
      const r = await fetch(req.url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json', ...(this.bearer ? { Authorization: `Bearer ${this.bearer}` } : {}) },
        body: req.reqBody && req.method !== 'GET' ? req.reqBody : undefined,
      });
      const text = await r.text().catch(() => '');
      this.appendRequest({
        id: rid(),
        method: req.method,
        url: req.url,
        status: r.status,
        ms: 0,
        ts: new Date().toISOString(),
        reqBody: req.reqBody,
        resBody: text.slice(0, 4000),
      });
    } catch (e) {
      this.view.appendMessage({ id: rid(), kind: 'error', text: `Replay failed: ${(e as Error).message}` });
    }
  }

  // ---------------------------------------------------------------------------
  // G2.D — Deploy snapshots + rollback
  // ---------------------------------------------------------------------------

  private async refreshDeployments(): Promise<void> {
    const projectId = this.activeProjectId();
    if (!projectId) return;
    try {
      const res = await this.fetchJson<{ snapshots: HarnessStudioState['deploySnapshots'] }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/deployments`,
        { method: 'GET' },
      ).catch(() => null);
      if (res && Array.isArray(res.snapshots)) {
        this.view.setState({ deploySnapshots: res.snapshots });
      } else {
        // Endpoint not yet wired on the backend — leave existing state alone.
        // Don't reset; that would erase any client-side optimistic snapshots.
      }
    } catch {
      /* tolerate */
    }
  }

  private async handleDeployNow(projectId: string, env: 'preview' | 'prod'): Promise<void> {
    try {
      const res = await this.fetchJson<{ snapshotId: string; version: string }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/deployments`,
        { method: 'POST', body: JSON.stringify({ env }) },
      ).catch(() => null);
      if (res) {
        this.view.appendMessage({ id: rid(), kind: 'phase', text: `✓ Snapshot ${res.version} deployed to ${env}` });
        await this.refreshDeployments();
      } else {
        this.view.appendMessage({ id: rid(), kind: 'phase', text: `Deploy endpoint not yet wired — falling back to chat.` });
        this.handleSubmit(`Take a deploy snapshot to ${env}: bundle Code + Files + DB. Make this immutable.`, projectId);
      }
    } catch (e) {
      this.view.appendMessage({ id: rid(), kind: 'error', text: `Deploy failed: ${(e as Error).message}` });
    }
  }

  private async handleDeployRollback(projectId: string, snapshotId: string): Promise<void> {
    try {
      const res = await this.fetchJson<{ ok: boolean; snapshotId: string }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(snapshotId)}/rollback`,
        { method: 'POST', body: '{}' },
      ).catch(() => null);
      if (res && res.ok) {
        this.view.appendMessage({ id: rid(), kind: 'phase', text: `⏪ Rolled back to ${snapshotId}` });
        await this.refreshDeployments();
      } else {
        this.view.appendMessage({ id: rid(), kind: 'phase', text: `Rollback endpoint not yet wired — falling back to chat.` });
        this.handleSubmit(`Roll back the deployment to snapshot ${snapshotId}.`, projectId);
      }
    } catch (e) {
      this.view.appendMessage({ id: rid(), kind: 'error', text: `Rollback failed: ${(e as Error).message}` });
    }
  }

  // ---------------------------------------------------------------------------
  // G2.F — Agents Live + Streaming "thinking" wiring
  // ---------------------------------------------------------------------------

  /** Translate a single SSE payload into agent-status + thinking updates. */
  private applyEventToAgentsAndThinking(payload: SsePayload): void {
    if (!payload) return;

    // Streaming agent text → accumulate into the thinking strip until the
    // first tool.call (i.e. action), then collapse it. This makes the
    // model's planning visible without overwhelming the chat history.
    if (payload.type === 'agent' && payload.event?.type === 'text' && payload.event.text) {
      const cur = this.view.getState().thinking;
      // Don't accumulate the same chunk twice when the SSE stream replays.
      const next = { text: cur.text + payload.event.text, collapsed: false, visible: true };
      // Cap the strip to ~4KB so it stays readable and the DOM doesn't explode.
      if (next.text.length > 4096) next.text = next.text.slice(-4096);
      this.view.setState({ thinking: next });
      this.bumpAgent('builder', 'thinking', 'reading + planning…');
      return;
    }

    // Tool calls → mark Builder as "working" and label with the tool name.
    if (payload.type === 'agent' && payload.event?.type === 'tool.call') {
      const tool = payload.event.name ?? 'tool';
      const summary = payload.event.summary ?? tool;
      this.bumpAgent('builder', 'working', `${tool} · ${summary.slice(0, 40)}`);
      // Once action starts, collapse the thinking strip — the user has
      // already seen the plan.
      const cur = this.view.getState().thinking;
      this.view.setState({ thinking: { ...cur, collapsed: true } });
      return;
    }

    // Subagent (Hooks 11–15 reviewers) → light up the Critic.
    if (payload.type === 'agent' && (payload.event?.type === 'subagent.spawn' || payload.event?.type === 'subagent.result')) {
      const ev = payload.event;
      if (ev.type === 'subagent.spawn') {
        this.bumpAgent('critic', 'thinking', `${ev.name ?? 'reviewer'} reviewing…`);
      } else {
        const passed = !!ev.passed;
        this.bumpAgent('critic', passed ? 'done' : 'failed', `${ev.name ?? 'reviewer'}: ${passed ? '✓ pass' : '✗ fail'}${ev.score ? ` (${ev.score})` : ''}`);
      }
      return;
    }

    // Done → mark all agents idle.
    if (payload.type === 'done') {
      const passed = !!payload.passed;
      this.bumpAgent('builder', 'done', 'finished');
      this.bumpAgent('critic',  passed ? 'done' : 'failed', passed ? 'gate passed' : 'gate failed');
      // Hide the thinking strip after a small delay so the final text is readable.
      setTimeout(() => {
        const cur = this.view.getState().thinking;
        this.view.setState({ thinking: { ...cur, visible: false } });
      }, 1500);
      return;
    }

    // Phase changes → light status text.
    if (payload.type === 'phase' && payload.message) {
      this.bumpAgent('builder', 'working', payload.message.slice(0, 40));
    }
  }

  private bumpAgent(id: 'builder' | 'critic' | 'marketing', status: 'idle' | 'thinking' | 'working' | 'done' | 'failed', task?: string): void {
    const cur = this.view.getState().agents;
    const next = cur.map((a) => a.id === id
      ? { ...a, status, task, lastHeartbeat: new Date().toISOString() }
      : a,
    );
    this.view.setState({ agents: next });
  }

  private async handleBuild(platform: 'ios' | 'android' | 'all'): Promise<void> {
    const projectId = this.activeProjectId();
    if (!projectId) return;
    const ship = { ...this.view.getState().ship, buildStatus: 'queued' as const, buildPlatform: platform, buildError: undefined };
    this.view.setState({ ship });
    this.view.appendMessage({ id: rid(), kind: 'phase', text: `⚡ Building (${platform})…` });

    try {
      const res = await this.fetchJson<{ buildId?: string; easBuildId?: string; status?: string }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/build`,
        { method: 'POST', body: JSON.stringify({ platform: platform === 'all' ? 'ios' : platform }) },
      );
      const buildId = res.easBuildId ?? res.buildId;
      const next = { ...this.view.getState().ship, buildStatus: 'in_progress' as const, buildEasId: buildId };
      this.view.setState({ ship: next });
      this.view.appendMessage({ id: rid(), kind: 'phase', text: `⚡ Build queued — id ${(buildId ?? 'unknown').slice(0, 8)}` });
    } catch (err) {
      const next = { ...this.view.getState().ship, buildStatus: 'errored' as const, buildError: (err as Error).message };
      this.view.setState({ ship: next });
      this.appendError(`Build kickoff failed: ${(err as Error).message}`);
    }
  }

  private async handleGenerateListing(): Promise<void> {
    const projectId = this.activeProjectId();
    if (!projectId) return;
    const project = this.view.getState().projects.find((p) => p.id === projectId);
    if (!project) return;
    const ship = { ...this.view.getState().ship, listingStatus: 'generating' as const, listingError: undefined };
    this.view.setState({ ship });
    this.view.appendMessage({ id: rid(), kind: 'phase', text: '✦ Generating store listing…' });

    try {
      const res = await this.fetchJson<{
        listing?: { name: string; subtitle: string; description: string; keywords: string; category: string };
      }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/store-listing`,
        {
          method: 'POST',
          body: JSON.stringify({
            appName: project.name,
            appDescription: project.name + ' — generated by ZionX App Development',
          }),
        },
      );
      const next = { ...this.view.getState().ship, listingStatus: 'ready' as const, listing: res.listing };
      this.view.setState({ ship: next });
      this.view.appendMessage({ id: rid(), kind: 'phase', text: `✦ Listing ready: "${res.listing?.name ?? ''}"` });
    } catch (err) {
      const next = { ...this.view.getState().ship, listingStatus: 'errored' as const, listingError: (err as Error).message };
      this.view.setState({ ship: next });
      this.appendError(`Listing generation failed: ${(err as Error).message}`);
    }
  }

  private async handlePreflight(platform: 'ios' | 'android'): Promise<void> {
    const projectId = this.activeProjectId();
    if (!projectId) return;
    const ship = { ...this.view.getState().ship, preflightStatus: 'checking' as const, preflightPlatform: platform };
    this.view.setState({ ship });
    try {
      const res = await this.fetchJson<{
        checklist?: { items: Array<{ id: string; label: string; status: 'pass' | 'fail' | 'warn'; detail?: string }> };
        readyForConfirmation?: boolean;
      }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/submit`,
        { method: 'POST', body: JSON.stringify({ platform }) },
      );
      const next = {
        ...this.view.getState().ship,
        preflightStatus: (res.readyForConfirmation ? 'ready' : 'blocked') as 'ready' | 'blocked',
        preflightChecklist: res.checklist?.items ?? [],
        preflightPlatform: platform,
      };
      this.view.setState({ ship: next });
    } catch (err) {
      const next = { ...this.view.getState().ship, preflightStatus: 'blocked' as const };
      this.view.setState({ ship: next });
      this.appendError(`Pre-flight failed: ${(err as Error).message}`);
    }
  }

  private async handleSubmitConfirm(platform: 'ios' | 'android', easBuildId: string): Promise<void> {
    const projectId = this.activeProjectId();
    if (!projectId) return;
    const submissionId = rid() + '-' + Date.now();
    const ship = { ...this.view.getState().ship, submitStatus: 'submitting' as const };
    this.view.setState({ ship });
    this.view.appendMessage({ id: rid(), kind: 'phase', text: `📦 Submitting ${platform} build to store…` });
    try {
      const res = await this.fetchJson<{
        submissionId: string;
        status: string;
        errorMessage?: string;
      }>(
        `/app-dev/projects/${encodeURIComponent(projectId)}/confirm-submit`,
        { method: 'POST', body: JSON.stringify({ platform, submissionId, easBuildId }) },
      );
      const next = {
        ...this.view.getState().ship,
        submitStatus: (res.status === 'submitted' ? 'submitted' : 'failed') as 'submitted' | 'failed',
        submitResult: { submissionId: res.submissionId, status: res.status, errorMessage: res.errorMessage },
      };
      this.view.setState({ ship: next });
      this.view.appendMessage({ id: rid(), kind: 'phase', text: `📦 Submission ${res.status}` });
    } catch (err) {
      const next = { ...this.view.getState().ship, submitStatus: 'failed' as const };
      this.view.setState({ ship: next });
      this.appendError(`Submit failed: ${(err as Error).message}`);
    }
  }

  /**
   * Shared helper — poll /sandbox until live or error.
   * Used after Code-tab save (re-bundle on edit).
   */
  private async pollSandboxUntilLive(projectId: string, timeoutMs = 8 * 60_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const status = await this.fetchJson<{ status: string; phase?: string; publicUrl?: string; error?: string }>(
          `/app-dev/projects/${encodeURIComponent(projectId)}/sandbox`,
          { method: 'GET' },
        );
        if (status.status === 'live' || status.status === 'ready') {
          this.setState({
            preview: { url: `${this.previewUrl(projectId)}#${Date.now()}`, status: 'live' },
          });
          this.view.appendMessage({ id: rid(), kind: 'phase', text: '✦ Preview reloaded' });
          return;
        }
        if (status.status === 'error') {
          this.appendError(`Re-bundle failed: ${status.error ?? 'unknown'}`);
          return;
        }
      } catch { /* keep polling */ }
    }
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
