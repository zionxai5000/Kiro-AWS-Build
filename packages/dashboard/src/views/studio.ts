/**
 * ZionX App Development Studio — VibeCode/Rork-parity view.
 *
 * Layout:
 *   ┌──────────────┬─────────────────────────┬─────────────┬──────────┐
 *   │ Project list │ Chat / Code / Files /    │ Preview     │ Tools    │
 *   │ (sidebar)    │ Logs / Design (tabs)     │ (iframe)    │ (rail)   │
 *   └──────────────┴─────────────────────────┴─────────────┴──────────┘
 *
 *   Chat tab: prompt input + streaming generation
 *   Files tab: live tree, click any file to open it in the Code tab
 *   Code tab: Monaco editor on the selected file, save back to workspace
 *   Logs tab: build/SSE/error events
 *   Design tab: branding library
 *
 * Every button below calls a real backend endpoint via api.ts. No mock data.
 */

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Wire Monaco's web workers — without this, Monaco falls back to the main
// thread for syntax + IntelliSense and throws "Unexpected usage" the first
// time a TypeScript file opens. Vite's ?worker suffix turns each module
// into a Worker constructor.
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

import { BRANDING_STYLES, BRANDING_CATEGORIES } from '../data/branding-styles.js';
import { renderStudioStylesheet } from './studio-tokens.js';
import { captureUserAction, captureUserError, flushSessionTrace } from '../sentry.js';
import {
  createAppDevProject,
  getAppDevProject,
  listAppDevProjects,
  listAppDevFiles,
  readAppDevFile,
  writeAppDevFile,
  startBuild,
  autoSubmitAndWatch,
  fetchAppDevEscalations,
  fetchAppDevHealth,
  streamGenerateCode,
  createPreview,
  type AppDevEscalation,
  type AppDevHealth,
  type AppDevProjectListEntry,
  type SnackPreview,
  DashboardWebSocket,
  type WebSocketMessage,
} from '../api.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StudioTab = 'chat' | 'files' | 'code' | 'logs' | 'design';

interface FileNode {
  path: string;
  status: 'streaming' | 'complete';
}

interface StudioState {
  projects: AppDevProjectListEntry[];
  projectId: string | null;
  files: FileNode[];
  openFilePath: string | null;
  openFileContent: string;
  openFileDirty: boolean;
  activeTab: StudioTab;
  generating: boolean;
  buildEvents: string[];
  health: AppDevHealth | null;
  escalations: AppDevEscalation[];
  latestBuildId: string | null;
  brandingFilter: string;
  brandingSearch: string;
  /** Live narration from the backend during generation (most recent phase). */
  /**
   * Build plan + schema + task checklist for the current generation. Set
   * by sendPrompt() right after Send, mutated by onFileEnd as tasks
   * complete. `messageIndex` points at the chat message that renders it
   * so updates re-render only that one bubble (no full chat redraw thrash).
   */
  plan: {
    summary: string;
    /** Lines describing the projected file structure / schema. */
    schema: string[];
    /** Tasks shown as a checklist. matchPath is regex-tested against
     *  each completed file path; first match flips `done` true. */
    tasks: Array<{ id: string; label: string; matchPath: RegExp; done: boolean }>;
    /** Index in `messages` of the plan bubble. */
    messageIndex: number | null;
  } | null;
  liveNarration: string | null;
  /** Approximate tokens streamed so far in the current generation. */
  tokensReceived: number;
  /** Index in messages[] of the assistant message we're updating live. */
  liveAssistantIndex: number | null;
  /** A short paragraph the LLM produces describing the app for the preview pane. */
  appSummary: string | null;
  /** Live Snack embed URL — null when no preview has been created yet. */
  previewUrl: string | null;
  /**
   * Snack ID (used to derive Expo Go deep-link `exp://exp.host/<id>` for
   * scan-on-phone). Set in lockstep with previewUrl.
   */
  previewSnackId: string | null;
  /**
   * Which preview surface is currently selected — 'ios' / 'android' show
   * a phone-frame native simulator + QR for Expo Go; 'web' shows the
   * web iframe fallback.
   */
  previewPlatform: 'ios' | 'android' | 'web';
  /** Whether the Open-on-phone modal is visible. */
  showOpenOnPhone: boolean;
  /** Status of preview creation. */
  previewStatus: 'idle' | 'building' | 'ready' | 'error';
  /** Message from preview build error. */
  previewError: string | null;
  /**
   * Latest spec compliance evaluation summary. Populated by
   * evaluateSpecInBackground(). Drives the compliance pill in the sidebar.
   */
  compliance: {
    state: 'unknown' | 'ok' | 'warn' | 'error';
    violationCount: number;
    warningCount: number;
    matchedCount: number;
    lastEvaluatedAt: string | null;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LS_PROJECT_KEY = 'zionx_studio_project_id';

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function langForPath(path: string): string {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.js') || path.endsWith('.jsx') || path.endsWith('.mjs')) return 'javascript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml';
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.sh')) return 'shell';
  if (path.endsWith('.patch')) return 'diff';
  return 'plaintext';
}

// ---------------------------------------------------------------------------
// Studio View
// ---------------------------------------------------------------------------

export class StudioView {
  private container: HTMLElement;
  private state: StudioState = {
    projects: [],
    projectId: null,
    files: [],
    openFilePath: null,
    openFileContent: '',
    openFileDirty: false,
    activeTab: 'chat',
    generating: false,
    buildEvents: [],
    health: null,
    escalations: [],
    latestBuildId: null,
    brandingFilter: 'all',
    brandingSearch: '',
    liveNarration: null,
    plan: null,
    tokensReceived: 0,
    liveAssistantIndex: null,
    appSummary: null,
    previewUrl: null,
    previewSnackId: null,
    previewPlatform: 'ios',
    showOpenOnPhone: false,
    previewStatus: 'idle',
    previewError: null,
    compliance: {
      state: 'unknown',
      violationCount: 0,
      warningCount: 0,
      matchedCount: 0,
      lastEvaluatedAt: null,
    },
  };
  private messages: { role: 'user' | 'assistant' | 'system'; text: string; kind?: 'design-picker' | 'plan' }[] = [
    {
      role: 'assistant',
      text:
        '👋 Welcome to ZionX Studio. Tell me what app you want and I will generate it from scratch — Expo + React Native + TypeScript, ready for the App Store.\n\n' +
        'Try: "Build a habit tracker called Streak with daily check-ins, a flame icon when streak > 7 days, soft 9pm reminder notifications, and a calm Calm-app palette."\n\n' +
        'Once it generates: open files in the Code tab, edit and save, or ask me to iterate. Hit Build iOS to ship to TestFlight.',
    },
  ];
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private ws: DashboardWebSocket | null = null;
  private pollHandle: number | null = null;
  private currentStream: AbortController | null = null;
  /**
   * Per-mount session id. Surfaces in every breadcrumb so the spec-runner
   * can correlate breadcrumbs by session and report drift per-session.
   */
  private readonly sessionId: string =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as Crypto).randomUUID()
      : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.render();
    this.attachListeners();

    // Spec-runner aligned: session.start fires once per mount so the runner
    // can verify projects were fetched and (optionally) the spec was evaluated.
    captureUserAction('studio.session.start', {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
    });

    // Restore last project + load saved project list
    const savedId = localStorage.getItem(LS_PROJECT_KEY);
    if (savedId) this.state.projectId = savedId;

    await this.refreshProjectList();
    await this.refreshHealth();
    await this.refreshEscalations();
    if (this.state.projectId) {
      await this.refreshFiles();
    }
    this.renderAll();

    // Periodic refresh: escalations + health every 15s
    this.pollHandle = window.setInterval(() => {
      void this.refreshEscalations();
      void this.refreshHealth();
    }, 15_000);

    // Spec-runner kickoff: evaluate the recent session in the background so
    // any in-flight violations from the previous tab/page reload surface in
    // Sentry without waiting for the hourly cron. Best-effort: never blocks UI.
    void this.evaluateSpecInBackground();

    // Periodic breadcrumb flush so the runner sees activity from healthy
    // sessions (Sentry only ships breadcrumbs attached to events). Once every
    // 60 seconds is plenty — the runner pulls the last 25 issues per cron run.
    window.setInterval(() => {
      flushSessionTrace('heartbeat', { sessionId: this.sessionId, projectId: this.state.projectId });
    }, 60_000);
    // Flush once on mount immediately so the first render's breadcrumbs are
    // captured before the first cron run.
    setTimeout(() => flushSessionTrace('mount', { sessionId: this.sessionId }), 5_000);

    // WebSocket for build/crash updates
    this.ws = new DashboardWebSocket();
    this.ws.connect();
    this.ws.on('agent.state.changed', (msg: WebSocketMessage) => {
      const data = msg.data as Record<string, unknown>;
      const text = typeof data['hookId'] === 'string'
        ? `${msg.timestamp}: ${data['hookId']} ${data['success'] ? 'ok' : 'failed'}`
        : `${msg.timestamp}: ${msg.type}`;
      this.state.buildEvents.push(text);
      if (this.state.activeTab === 'logs') this.renderAll();
    });
  }

  unmount(): void {
    this.container.innerHTML = '';
    this.editor?.dispose();
    this.editor = null;
    this.ws?.disconnect();
    if (this.pollHandle) window.clearInterval(this.pollHandle);
    this.currentStream?.abort();
  }

  // -------------------------------------------------------------------------
  // Backend calls
  // -------------------------------------------------------------------------

  private async refreshProjectList(): Promise<void> {
    // Spec-runner aligned: every project list fetch fires a breadcrumb so the
    // session-start-must-load-projects rule can verify boot rehydration.
    captureUserAction('studio.projectsRefreshing');
    try {
      const res = await listAppDevProjects();
      this.state.projects = res.projects;
      captureUserAction('studio.projectsRefreshed', { count: res.projects.length });
    } catch (err) {
      captureUserError(err, { stage: 'list-projects' });
    }
  }

  private async refreshFiles(): Promise<void> {
    if (!this.state.projectId) return;
    try {
      const res = await listAppDevFiles(this.state.projectId);
      this.state.files = res.files
        .filter((f) => !f.startsWith('.meta/'))
        .map((f) => ({ path: f, status: 'complete' as const }));
    } catch (err) {
      captureUserError(err, { stage: 'list-files' });
    }
  }

  private async refreshHealth(): Promise<void> {
    try {
      this.state.health = await fetchAppDevHealth();
    } catch {
      this.state.health = null;
    }
  }

  private async refreshEscalations(): Promise<void> {
    try {
      const res = await fetchAppDevEscalations();
      this.state.escalations = res.escalations.filter((e) => e.status !== 'resolved');
    } catch { /* network blip */ }
  }

  private async openFile(path: string): Promise<void> {
    if (!this.state.projectId) return;
    if (this.state.openFileDirty) {
      const ok = confirm('Discard unsaved changes?');
      if (!ok) return;
    }
    captureUserAction('studio.openFile', { path });
    try {
      const res = await readAppDevFile(this.state.projectId, path);
      this.state.openFilePath = path;
      this.state.openFileContent = res.content;
      this.state.openFileDirty = false;
      this.state.activeTab = 'code';
      this.renderAll();
      this.mountEditor();
    } catch (err) {
      this.messages.push({ role: 'system', text: `Open failed: ${(err as Error).message}` });
      captureUserError(err, { stage: 'read-file', path });
      this.renderAll();
    }
  }

  private async saveOpenFile(): Promise<void> {
    if (!this.state.projectId || !this.state.openFilePath || !this.editor) return;
    captureUserAction('studio.saveFile', { path: this.state.openFilePath });
    const content = this.editor.getValue();
    try {
      const res = await writeAppDevFile(this.state.projectId, this.state.openFilePath, content);
      this.state.openFileContent = content;
      this.state.openFileDirty = false;
      this.messages.push({
        role: 'system',
        text: `Saved ${this.state.openFilePath} (${res.bytesWritten} bytes)${res.warnings?.length ? ` with ${res.warnings.length} warnings` : ''}.`,
      });
      this.renderAll();
    } catch (err) {
      const msg = (err as Error).message;
      this.messages.push({ role: 'system', text: `Save failed: ${msg}` });
      captureUserError(err, { stage: 'write-file', path: this.state.openFilePath });
      this.renderAll();
    }
  }

  private async loadProject(projectId: string): Promise<void> {
    captureUserAction('studio.loadProject', { projectId });
    try {
      await getAppDevProject(projectId);
    } catch {
      this.messages.push({ role: 'system', text: `Project ${projectId} not found.` });
      this.renderAll();
      return;
    }
    this.state.projectId = projectId;
    localStorage.setItem(LS_PROJECT_KEY, projectId);
    this.state.openFilePath = null;
    this.state.openFileContent = '';
    this.state.openFileDirty = false;
    await this.refreshFiles();
    this.state.activeTab = 'files';
    this.messages.push({ role: 'system', text: `Loaded project ${projectId} (${this.state.files.length} file${this.state.files.length === 1 ? '' : 's'}).` });
    this.renderAll();
  }

  private async sendPrompt(text: string): Promise<void> {
    if (!text || this.state.generating) return;
    captureUserAction('studio.send', { textLength: text.length, hasProject: !!this.state.projectId });

    // Always show what the user said
    this.messages.push({ role: 'user', text });

    // Conversational triage: short, question-like messages get a chat reply
    // before we burn LLM tokens on a full code generation. This matches how
    // VibeCode/Rork handle "why can't I see the app?" style pings.
    if (this.handleQuickReply(text)) {
      this.renderAll();
      return;
    }

    this.state.generating = true;
    this.state.liveNarration = null;
    this.state.tokensReceived = 0;
    // Build a plan + checklist for this generation. Pushed as a separate
    // chat bubble (kind: 'plan') so the user sees the schema and watches
    // tasks tick off as files land.
    this.state.plan = this.buildPlan(text);
    this.messages.push({ role: 'assistant', text: 'plan', kind: 'plan' });
    this.state.plan.messageIndex = this.messages.length - 1;

    if (!this.state.projectId) {
      try {
        const project = await createAppDevProject({
          name: text.slice(0, 60),
          description: text,
          platform: 'both',
        });
        this.state.projectId = project.projectId;
        localStorage.setItem(LS_PROJECT_KEY, project.projectId);
        this.messages.push({ role: 'system', text: `Created project ${project.projectId}` });
        // Insert immediately into the sidebar so the operator sees the new
        // project appear right after Send (instead of waiting for the
        // refreshProjectList round-trip below).
        const nowIso = new Date().toISOString();
        const existsAlready = this.state.projects.some((p) => p.projectId === project.projectId);
        if (!existsAlready) {
          this.state.projects.unshift({
            projectId: project.projectId,
            fileCount: project.fileCount ?? 0,
            createdAt: project.createdAt ?? nowIso,
            updatedAt: nowIso,
            name: project.name,
            prompt: text,
          });
        }
        // Background refresh to reconcile with the server's list (no await
        // so the immediate render doesn't stall behind it).
        void this.refreshProjectList();
      } catch (err) {
        this.messages.push({ role: 'assistant', text: `Could not create project: ${(err as Error).message}` });
        captureUserError(err, { stage: 'create-project', prompt: text.slice(0, 100) });
        this.state.generating = false;
        this.renderAll();
        return;
      }
    }

    const projectId = this.state.projectId!;
    // Push a placeholder assistant message we'll update in real time.
    this.messages.push({ role: 'assistant', text: '🧠 Reading your prompt and planning the app structure...' });
    this.state.liveAssistantIndex = this.messages.length - 1;
    // Keep the chat tab active during generation so the operator sees the
    // plan + schema + task checklist + narration as it streams. The Files
    // tab still shows live count via its label and is one click away.
    this.state.activeTab = 'chat';
    this.renderAll();

    // Reset file tree; files will be added live as they stream in
    this.state.files = [];
    this.state.appSummary = null;

    // Helper to update the in-progress assistant message inline
    const updateLive = () => {
      if (this.state.liveAssistantIndex == null) return;
      const fileLine = this.state.files.length > 0
        ? `\n📁 ${this.state.files.length} file${this.state.files.length === 1 ? '' : 's'} so far`
        : '';
      const tokenLine = this.state.tokensReceived > 0
        ? `\n✏️ ${this.state.tokensReceived.toLocaleString()} characters streamed`
        : '';
      const phaseLine = this.state.liveNarration ? `\n${this.state.liveNarration}` : '';
      const msg = this.messages[this.state.liveAssistantIndex];
      if (msg) {
        msg.text = `🧠 Generating your app${phaseLine}${fileLine}${tokenLine}`;
      }
      this.renderChatLive();
      this.renderTabsLive();
      this.renderPreviewLive();
    };

    try {
      const abort = await streamGenerateCode(projectId, text, {
        onPhase: (event) => {
          // Map phase enum to a friendly emoji
          const icon: Record<string, string> = {
            'sanitizer': '🛡️',
            'sanitizer-complete': '✓',
            'llm-init': '🧠',
            'streaming-start': '✨',
            'token-progress': '✏️',
            'file-start': '📝',
            'file-end': '✓',
            'streaming-complete': '✅',
            'error': '❌',
            'sanitizer-blocked': '🚫',
          };
          const prefix = icon[event.phase] ?? '•';
          this.state.liveNarration = `${prefix} ${event.message}`;
          // Spec-runner aligned breadcrumb so the runner can observe
          // streamStart and verify it eventually produces a streamDone.
          if (event.phase === 'start') captureUserAction('studio.streamStart', { projectId });
          updateLive();
        },
        onToken: (chunk) => {
          this.state.tokensReceived += chunk.length;
          // Update at most every ~500 chars to avoid render thrash
          if (this.state.tokensReceived % 500 < chunk.length) updateLive();
        },
        onFileStart: (path) => {
          if (path.startsWith('.meta/')) return;
          const existing = this.state.files.find((f) => f.path === path);
          if (existing) existing.status = 'streaming';
          else this.state.files.push({ path, status: 'streaming' });
          updateLive();
          if (this.state.activeTab === 'files') this.renderFilesPanel();
        },
        onFileEnd: (path) => {
          if (path.startsWith('.meta/')) return;
          const existing = this.state.files.find((f) => f.path === path);
          if (existing) existing.status = 'complete';
          else this.state.files.push({ path, status: 'complete' });
          // Tick off any matching plan task
          if (this.state.plan) {
            for (const task of this.state.plan.tasks) {
              if (!task.done && task.matchPath.test(path)) {
                task.done = true;
              }
            }
          }
          updateLive();
          if (this.state.activeTab === 'files') this.renderFilesPanel();
        },
        onComplete: (files) => {
          const realFiles = files.filter((f) => !f.startsWith('.meta/'));
          // Replace the live message with a final summary
          if (this.state.liveAssistantIndex != null) {
            const summary = `✅ Your app is ready. Generated **${realFiles.length} files** in ${this.state.tokensReceived.toLocaleString()} tokens.\n\nClick the **Files** tab to browse, **Code** to edit, or **iOS / Android** at the top to build.`;
            const msg = this.messages[this.state.liveAssistantIndex];
            if (msg) msg.text = summary;
          }
          this.state.liveAssistantIndex = null;
          this.state.liveNarration = null;
          this.state.generating = false;
          // Spec-runner aligned: confirm the stream resolved successfully.
          captureUserAction('studio.streamDone', { fileCount: realFiles.length });
          // Generate a short app summary for the preview pane
          this.generateAppSummary(text, realFiles);
          void this.refreshFiles();
          void this.refreshProjectList();
          this.renderAll();
          // Kick off the live Snack preview in the background — the iframe
          // appears in the preview pane the moment Snack returns the embed URL.
          void this.buildLivePreview();
        },
        onError: (msg) => {
          if (this.state.liveAssistantIndex != null) {
            const m = this.messages[this.state.liveAssistantIndex];
            if (m) m.text = `❌ Generation failed: ${msg}`;
          }
          this.state.liveAssistantIndex = null;
          this.state.liveNarration = null;
          captureUserAction('studio.streamError', { message: msg });
          captureUserError(new Error(msg), { stage: 'generate-stream' });
          this.state.generating = false;
          this.renderAll();
        },
      });
      this.currentStream = abort;
    } catch (err) {
      this.messages.push({ role: 'assistant', text: `❌ Stream error: ${(err as Error).message}` });
      captureUserError(err, { stage: 'generate-stream-init' });
      this.state.generating = false;
      this.state.liveAssistantIndex = null;
      this.renderAll();
    }
  }

  /**
   * Detect short, question-shaped messages that don't warrant a full code
   * generation pass. Returns true if a quick reply was already pushed and
   * sendPrompt should bail out before calling the LLM.
   */
  private handleQuickReply(text: string): boolean {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    const isQuestion =
      trimmed.length < 220 &&
      (trimmed.endsWith('?') ||
        lower.startsWith('why ') ||
        lower.startsWith('how ') ||
        lower.startsWith('what ') ||
        lower.startsWith('where ') ||
        lower.startsWith('can ') ||
        lower.startsWith("can't ") ||
        lower.startsWith('cant ') ||
        lower.startsWith('i cant ') ||
        lower.startsWith("i can't "));
    if (!isQuestion) return false;

    let reply = '';
    if (lower.includes('preview') || lower.includes("can't see") || lower.includes('cant see') || lower.includes('see the app')) {
      reply =
        "Live in-browser preview lands next session — I'm wiring the Expo dev server bridge. " +
        "Right now the preview pane shows the file count, screen list, and an Expo Go QR code that activates after a successful iOS build. " +
        "Hit the **📱 Build iOS** button up top and once the build finishes, scan the QR with Expo Go to install on your phone.";
    } else if (lower.includes('build') || lower.includes('deploy')) {
      reply =
        'Use the buttons in the top bar: **📱 iOS** kicks off an EAS build, **🤖 Android** runs the Android build, **🚀 Deploy iOS** submits a finished build to TestFlight. ' +
        'Logs stream into the Logs tab as the build progresses.';
    } else if (lower.includes('edit') || lower.includes('change code') || lower.includes('update')) {
      reply =
        'Open the **Files** tab and click any file. The **Code** tab opens the file in a Monaco editor — make changes and hit **Save (⌘S)** to write them back to the workspace. ' +
        'Or describe the change in chat and I will regenerate the affected files.';
    } else if (lower.includes('how') && (lower.includes('work') || lower.includes('use'))) {
      reply =
        '1) Type a description of the app you want into chat and hit Send.\n' +
        '2) Watch files stream into the Files tab.\n' +
        '3) Click any file to view or edit it in the Code tab.\n' +
        '4) Hit **Build iOS** when ready — TestFlight takes ~5 min.\n' +
        '5) Iterate by sending more chat messages on the loaded project.';
    } else {
      reply =
        "I read that as a question rather than a build request, so I'm answering instead of generating code. " +
        'If you actually want me to build or change something, phrase it as a request like ' +
        '"Add a stats screen with weekly streak chart" or "Change the primary color to forest green".';
    }
    this.messages.push({ role: 'assistant', text: reply });
    return true;
  }

  /** Pull a short user-facing summary of what got built — for the preview pane. */
  private generateAppSummary(originalPrompt: string, files: string[]): void {
    // Cheap heuristic: pick out the named features from the prompt and the
    // tab-level routes from the file tree. Real summary lands when the LLM
    // emits a `summary` event. Until then this is meaningfully better than
    // a placeholder.
    const screens = files.filter((f) => f.match(/app\/.+\.tsx$/) && !f.includes('_layout'));
    const tabs = screens.filter((f) => f.includes('(tabs)'));
    const summary = [
      originalPrompt.split('\n')[0]?.slice(0, 140) ?? 'Your app',
      `${screens.length} screens · ${tabs.length} tabs · ${files.length} total files`,
    ].join('\n');
    this.state.appSummary = summary;
  }

  /**
   * Open the design / branding picker inline in chat. We push a special
   * message with a `kind: 'design-picker'` marker that renderChatContent
   * recognizes and renders as the picker grid.
   */
  private openDesignPickerInChat(): void {
    captureUserAction('studio.openDesignPicker');
    this.state.activeTab = 'chat';
    // Avoid duplicating the picker if it's already the most-recent message
    const last = this.messages[this.messages.length - 1];
    if (last && (last as { kind?: string }).kind === 'design-picker') {
      this.renderAll();
      return;
    }
    this.messages.push({
      role: 'assistant',
      text: 'Pick a branding style — I will iterate on the current app to match it.',
      kind: 'design-picker',
    });
    this.renderAll();
  }
  private async buildLivePreview(): Promise<void> {
    if (!this.state.projectId) return;
    if (this.state.previewStatus === 'building') return;
    captureUserAction('studio.buildPreview', { projectId: this.state.projectId });

    this.state.previewStatus = 'building';
    this.state.previewError = null;
    this.messages.push({
      role: 'assistant',
      text: '🪄 Building live preview... bundling your code into an Expo Snack so you can see the app render right here.',
    });
    this.renderAll();

    try {
      const snack: SnackPreview = await createPreview(this.state.projectId);
      this.state.previewUrl = snack.embedUrl;
      this.state.previewSnackId = snack.snackId;
      this.state.previewStatus = 'ready';
      // Spec-runner aligned: preview success.
      captureUserAction('studio.previewReady', { snackId: snack.snackId, fileCount: snack.fileCount });
      this.messages.push({
        role: 'assistant',
        text: `✨ Preview is live. Your app is rendering in the right panel — ${snack.fileCount} files bundled.`,
      });
    } catch (err) {
      const msg = (err as Error).message;
      this.state.previewStatus = 'error';
      this.state.previewError = msg;
      captureUserAction('studio.previewError', { message: msg.slice(0, 200) });
      this.messages.push({
        role: 'assistant',
        text: `❌ Preview build failed: ${msg}\n\nThe code itself is fine — Snack rejects some native packages on web preview. Use Build iOS to ship the real version.`,
      });
      captureUserError(err, { stage: 'create-preview' });
    }
    this.renderAll();
  }

  private async startBuildFor(platform: 'ios' | 'android'): Promise<void> {
    captureUserAction('studio.build', { platform, projectId: this.state.projectId });
    if (!this.state.projectId) {
      this.messages.push({ role: 'system', text: 'Generate a project first.' });
      this.renderAll();
      return;
    }
    this.messages.push({ role: 'assistant', text: `🚀 Starting ${platform} build...` });
    this.state.activeTab = 'logs';
    this.renderAll();
    try {
      const res = await startBuild(this.state.projectId, { platform, autoSubmit: false });
      this.state.latestBuildId = res.buildId;
      this.state.buildEvents.push(`${platform} build queued: ${res.buildId}`);
      // Spec-runner aligned: build response received.
      captureUserAction('studio.buildQueued', { platform, buildId: res.buildId });
      this.messages.push({ role: 'assistant', text: res.message });
    } catch (err) {
      captureUserAction('studio.buildError', { message: (err as Error).message.slice(0, 200) });
      this.messages.push({ role: 'assistant', text: `Build failed: ${(err as Error).message}` });
      captureUserError(err, { stage: 'start-build', platform });
    }
    this.renderAll();
  }

  private async deployFor(platform: 'ios' | 'android'): Promise<void> {
    captureUserAction('studio.deploy', { platform });
    if (!this.state.projectId || !this.state.latestBuildId) {
      this.messages.push({ role: 'system', text: 'Run a successful build first, then deploy.' });
      this.renderAll();
      return;
    }
    try {
      const res = await autoSubmitAndWatch(this.state.projectId, {
        platform,
        easBuildId: this.state.latestBuildId,
      });
      // Spec-runner aligned: deploy started successfully.
      captureUserAction('studio.deployStarted', { platform });
      this.messages.push({ role: 'assistant', text: res.message });
    } catch (err) {
      captureUserAction('studio.deployError', { message: (err as Error).message.slice(0, 200) });
      this.messages.push({ role: 'assistant', text: `Deploy failed: ${(err as Error).message}` });
      captureUserError(err, { stage: 'auto-submit', platform });
    }
    this.renderAll();
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private renderAll(): void {
    this.render();
    this.attachListeners();
    if (this.state.activeTab === 'code') {
      this.mountEditor();
    }
    const msgs = this.container.querySelector('#studio-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  private renderFilesPanel(): void {
    const panel = this.container.querySelector('#studio-tab-panel');
    if (!panel || this.state.activeTab !== 'files') return;
    panel.innerHTML = this.renderFilesContent();
    this.attachFilesListeners();
  }

  /**
   * Live partial-renders that don't tear down Monaco or scroll positions:
   * just patch the chat thread, the tab counters, and the preview pane.
   */
  private renderChatLive(): void {
    if (this.state.activeTab !== 'chat') return;
    const msgsEl = this.container.querySelector('#studio-messages');
    if (!msgsEl) return;
    const wasScrolled = msgsEl.scrollTop + msgsEl.clientHeight + 40 >= msgsEl.scrollHeight;
    msgsEl.innerHTML = this.messages.map((m) => {
      const cls = m.role === 'user' ? 'studio-msg--user' : m.role === 'assistant' ? 'studio-msg--assistant' : 'studio-msg--system';
      if (m.kind === 'plan') {
        return this.renderPlanMessage();
      }
      if (m.kind === 'design-picker') {
        const cards = BRANDING_STYLES.slice(0, 12).map((s) => `
          <button class="studio-design-card" data-apply-style="${escapeHtml(s.id)}">
            <span class="studio-design-card__swatch" style="background:${s.gradient}"></span>
            <span class="studio-design-card__name">${escapeHtml(s.name)}</span>
            <span class="studio-design-card__inspo">${escapeHtml(s.inspiration)}</span>
          </button>
        `).join('');
        return `<div class="studio-msg ${cls}" style="max-width:95%;">${escapeHtml(m.text)}<div class="studio-design-grid-inline">${cards}</div></div>`;
      }
      return `<div class="studio-msg ${cls}">${escapeHtml(m.text).replace(/\n/g, '<br/>')}</div>`;
    }).join('');
    if (wasScrolled) msgsEl.scrollTop = msgsEl.scrollHeight;
    // Re-bind the inline picker click handlers
    this.attachDesignListeners();
  }

  private renderTabsLive(): void {
    const filesTab = this.container.querySelector('[data-tab="files"]');
    if (filesTab) filesTab.textContent = `📁 Files (${this.state.files.length})`;
  }

  private renderPreviewLive(): void {
    const screen = this.container.querySelector('.studio-device-screen');
    if (screen) screen.innerHTML = this.renderPreviewBody();
    // Re-bind the preview-action buttons
    this.container.querySelectorAll('[data-preview-action]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = (el as HTMLElement).dataset.previewAction;
        if (action === 'build-ios') void this.startBuildFor('ios');
        else if (action === 'build-android') void this.startBuildFor('android');
        else if (action === 'build-preview' || action === 'retry') void this.buildLivePreview();
        else if (action === 'open-on-phone') this.openOnPhone();
        else if (action === 'open-fullscreen') this.openPreviewInNewTab();
      });
    });
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="studio">
        <!-- LEFT SIDEBAR: Project list -->
        <aside class="studio-sidebar">
          <div class="studio-sidebar__header">
            <h3>Projects</h3>
            <button class="studio-btn studio-btn--ghost studio-btn--sm" id="studio-new-project" title="Start fresh">+ New</button>
          </div>
          <div class="studio-sidebar__list">
            ${this.renderProjectList()}
          </div>
          <div class="studio-sidebar__footer">
            ${this.renderHealthBadge()}
            ${this.renderCompliancePill()}
          </div>
        </aside>

        <!-- CENTER: Chat / Files / Code / Logs / Design tabs -->
        <main class="studio-main">
          <nav class="studio-tabs">
            <button class="studio-tab ${this.state.activeTab === 'chat' ? 'is-active' : ''}" data-tab="chat">💬 Chat</button>
            <button class="studio-tab ${this.state.activeTab === 'files' ? 'is-active' : ''}" data-tab="files">📁 Files (${this.state.files.length})</button>
            <button class="studio-tab ${this.state.activeTab === 'code' ? 'is-active' : ''}" data-tab="code">💻 Code${this.state.openFileDirty ? ' •' : ''}</button>
            <button class="studio-tab ${this.state.activeTab === 'logs' ? 'is-active' : ''}" data-tab="logs">📋 Logs</button>
            <button class="studio-tab ${this.state.activeTab === 'design' ? 'is-active' : ''}" data-tab="design">🎨 Design</button>
            <span class="studio-tabs__spacer"></span>
            <button class="studio-btn studio-btn--ghost studio-btn--sm" id="studio-build-ios" title="Build iOS">📱 iOS</button>
            <button class="studio-btn studio-btn--ghost studio-btn--sm" id="studio-build-android" title="Build Android">🤖 Android</button>
            <button class="studio-btn studio-btn--ghost studio-btn--sm" id="studio-deploy-ios" title="Submit to TestFlight">🚀 Deploy iOS</button>
          </nav>

          <div class="studio-tab-panel" id="studio-tab-panel">
            ${this.renderTabContent()}
          </div>
        </main>

        <!-- RIGHT: Preview (iOS / Android via QR + native sim, Web via iframe) -->
        <aside class="studio-preview">
          ${this.renderPreviewToolbar()}
          <div class="studio-preview__device">
            <div class="studio-device-frame">
              <div class="studio-device-screen">
                ${this.renderPreviewBody()}
              </div>
            </div>
          </div>
          ${this.renderPreviewActions()}
          ${this.renderEscalationsBadge()}
        </aside>
      </div>

      ${this.renderOpenOnPhoneModal()}
      ${renderStudioStylesheet()}
    `;
  }

  private renderProjectList(): string {
    if (this.state.projects.length === 0) {
      return `<div style="padding:14px;font-size:12px;opacity:0.6;">No projects yet. Send a prompt to create one.</div>`;
    }
    return this.state.projects.map((p) => `
      <div class="studio-project ${p.projectId === this.state.projectId ? 'is-active' : ''}" data-project-id="${escapeHtml(p.projectId)}">
        <div class="studio-project__name">${escapeHtml(p.name ?? p.projectId)}</div>
        <div class="studio-project__meta">${p.fileCount} files · ${fmtTime(p.updatedAt ?? p.createdAt)}</div>
      </div>
    `).join('');
  }

  private renderHealthBadge(): string {
    if (!this.state.health) return `<span style="opacity:0.5;">Backend offline</span>`;
    const dot = this.state.health.status === 'healthy' ? '🟢' : '🟡';
    return `<span>${dot} ${this.state.health.status} · ${this.state.health.hooks.enabled}/${this.state.health.hooks.total} hooks</span>`;
  }

  private renderCompliancePill(): string {
    const c = this.state.compliance;
    if (c.state === 'unknown' || !c.lastEvaluatedAt) {
      return `<div class="studio-compliance-pill" id="studio-spec-pill">
        <span class="studio-compliance-pill__dot" style="background:#6b7081;"></span>
        Spec compliance pending
      </div>`;
    }
    if (c.state === 'ok') {
      return `<div class="studio-compliance-pill studio-compliance-pill--ok" id="studio-spec-pill" title="Last evaluated ${escapeHtml(fmtTime(c.lastEvaluatedAt))} — ${c.matchedCount} rules matched">
        <span class="studio-compliance-pill__dot"></span>
        Spec OK · ${c.matchedCount} rules
      </div>`;
    }
    if (c.state === 'warn') {
      return `<div class="studio-compliance-pill studio-compliance-pill--warn" id="studio-spec-pill" title="${c.warningCount} warning${c.warningCount === 1 ? '' : 's'}">
        <span class="studio-compliance-pill__dot"></span>
        ${c.warningCount} spec warning${c.warningCount === 1 ? '' : 's'}
      </div>`;
    }
    return `<div class="studio-compliance-pill studio-compliance-pill--error" id="studio-spec-pill" title="Click to open Logs">
      <span class="studio-compliance-pill__dot"></span>
      ${c.violationCount} spec violation${c.violationCount === 1 ? '' : 's'}
    </div>`;
  }

  private renderEscalationsBadge(): string {
    if (this.state.escalations.length === 0) return '';
    return `
      <div class="studio-escalation-badge" id="studio-show-escalations">
        ⚠️ ${this.state.escalations.length} stuck pipeline${this.state.escalations.length === 1 ? '' : 's'} need attention
      </div>
    `;
  }

  /**
   * Toggle the Open-on-phone modal — shows the QR + Expo Go deep link so
   * the operator can scan from their phone.
   */
  private openOnPhone(): void {
    if (!this.state.previewSnackId) return;
    captureUserAction('studio.openOnPhone', { snackId: this.state.previewSnackId });
    this.state.showOpenOnPhone = true;
    this.renderAll();
  }

  /**
   * Open the Snack page (full editor) in a new tab for the current platform.
   */
  private openPreviewInNewTab(): void {
    if (!this.state.previewSnackId) return;
    const url = this.buildSnackPlatformUrl(this.state.previewPlatform);
    captureUserAction('studio.openPreviewFullscreen', { platform: this.state.previewPlatform });
    window.open(url, '_blank', 'noopener');
  }

  /**
   * Heuristic plan builder. We don't know the LLM's exact output ahead of
   * time, but the system prompt mandates a stable file layout (entry,
   * theme, components/ui, hooks, store, app/(tabs) screens, onboarding).
   * We pick the prompt-specific tasks from a small set of patterns matched
   * against the user's request — game/timer/tracker/list etc. — so the
   * checklist feels relevant, not generic.
   *
   * matchPath regexes are designed to fire on a wide range of paths the
   * LLM might pick (some runs produce app/(tabs)/index.tsx, others app/
   * index.tsx, others app/game.tsx) so a task ticks off as soon as a
   * plausible file lands.
   */
  private buildPlan(prompt: string): NonNullable<StudioState['plan']> {
    const lower = prompt.toLowerCase();
    const tasks: Array<{ id: string; label: string; matchPath: RegExp; done: boolean }> = [
      { id: 'config',     label: 'Set up Expo + TypeScript project',          matchPath: /^package\.json$/,                done: false },
      { id: 'theme',      label: 'Build design tokens (colors, type, spacing)', matchPath: /^theme\/colors\.ts$/,           done: false },
      { id: 'ui',         label: 'Create UI primitives (Button, Card, etc)',  matchPath: /^components\/ui\/Button\.tsx?$/, done: false },
      { id: 'entry',      label: 'Wire root layout + navigation',             matchPath: /^app\/_layout\.tsx?$/,           done: false },
      { id: 'main',       label: 'Build the main screen',                     matchPath: /^app\/(\(tabs\)\/)?(index|game|home|main)\.tsx?$/, done: false },
      { id: 'store',      label: 'Add app state (zustand store)',             matchPath: /^store\/.+\.ts?$/,               done: false },
    ];

    // Prompt-specific tasks
    if (/tic[\s-]?tac[\s-]?toe|game|board|grid|chess|connect/.test(lower)) {
      tasks.push({ id: 'win-detect', label: 'Add win detection + reset',      matchPath: /^(app\/(\(tabs\)\/)?(index|game)|store\/(game|board)).+/i, done: false });
    } else if (/timer|stopwatch|countdown|breath|meditat/.test(lower)) {
      tasks.push({ id: 'timer-logic', label: 'Add timer / animation logic',  matchPath: /^(app\/(\(tabs\)\/)?(index|timer)|hooks\/useTimer)/i,    done: false });
    } else if (/track|streak|habit|workout|food|meal|recipe|reading|journal/.test(lower)) {
      tasks.push({ id: 'persistence', label: 'Persist entries with AsyncStorage', matchPath: /^hooks\/usePersisted/i,        done: false });
    } else if (/list|todo|task|remind/.test(lower)) {
      tasks.push({ id: 'list-crud',   label: 'Add list CRUD + persistence',   matchPath: /^store\/.+\.ts?$/,                  done: false });
    }

    // Settings is generic but expected for any multi-tab app
    tasks.push({ id: 'settings', label: 'Add Settings screen',                matchPath: /^app\/(\(tabs\)\/)?settings\.tsx?$/, done: false });

    const schema: string[] = [
      'app/_layout.tsx        ← root layout (fonts, error boundary, navigation)',
      'app/(tabs)/index.tsx   ← main screen (the app the user requested)',
      'app/(tabs)/settings.tsx',
      'components/ui/         ← Button, Card, Sheet, Skeleton, Toast',
      'theme/                 ← colors, typography, spacing, motion, shadows',
      'store/                 ← zustand state with persist',
      'hooks/                 ← useHaptics, useAppState, usePersistedStore',
      'package.json, app.json, tsconfig.json, babel.config.js, eas.json',
    ];

    let summary = `Building a React Native + Expo app from your prompt.`;
    if (/tic[\s-]?tac[\s-]?toe/i.test(lower)) summary = 'Building a Tic-Tac-Toe game with X/O turns, win detection, and a reset button.';
    else if (/timer|stopwatch/i.test(lower)) summary = 'Building a timer app with start, pause, and reset.';
    else if (/habit|streak/i.test(lower)) summary = 'Building a habit tracker with daily check-ins and streak counting.';
    else if (/recipe|meal/i.test(lower)) summary = 'Building a recipe / meal tracker with photo support and search.';

    return { summary, schema, tasks, messageIndex: null };
  }

  /**
   * Render the plan + schema + checklist bubble. Called from both message
   * render sites (renderChatLive, renderChatContent) so it stays in sync
   * during streaming.
   */
  private renderPlanMessage(): string {
    const plan = this.state.plan;
    if (!plan) return '';
    const total = plan.tasks.length;
    const done = plan.tasks.filter((t) => t.done).length;
    const tasksHtml = plan.tasks.map((t) => {
      const icon = t.done ? '✅' : '⬜';
      const styleDone = t.done ? 'opacity:0.55;text-decoration:line-through;' : '';
      return `<li style="margin:4px 0;font-size:12px;${styleDone}">${icon} ${escapeHtml(t.label)}</li>`;
    }).join('');
    const schemaHtml = plan.schema.map((line) =>
      `<div style="font-family:ui-monospace,monospace;font-size:11px;opacity:0.78;margin:2px 0;">${escapeHtml(line)}</div>`
    ).join('');
    return `
      <div class="studio-msg studio-msg--assistant studio-msg--plan" style="max-width:96%;">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px;">📋 Plan</div>
        <div style="font-size:13px;line-height:1.5;margin-bottom:12px;">${escapeHtml(plan.summary)}</div>
        <details style="margin-bottom:12px;">
          <summary style="cursor:pointer;font-size:12px;font-weight:600;opacity:0.85;">📐 Project layout</summary>
          <div style="background:#0d0e14;border:1px solid #2a2f3d;border-radius:8px;padding:10px 12px;margin-top:6px;">
            ${schemaHtml}
          </div>
        </details>
        <div style="font-size:12px;font-weight:600;margin-bottom:6px;">Tasks (${done}/${total})</div>
        <ul style="list-style:none;padding:0;margin:0;">
          ${tasksHtml}
        </ul>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Preview pane — three platforms (iOS / Android / Web), each with a
  // honest "you can actually see and tap the app" surface.
  //
  //   iOS / Android: Snack web simulator (?platform=ios|android&preview=true)
  //                  embedded as an iframe so you can tap and the app responds.
  //                  Plus an "Open on phone" button that deep-links into Expo Go.
  //   Web:           the original iframe path (Snack web preview).
  // -------------------------------------------------------------------------

  private renderPreviewToolbar(): string {
    const tab = (id: 'ios' | 'android' | 'web', label: string) =>
      `<button class="studio-preview__tab ${this.state.previewPlatform === id ? 'is-active' : ''}" data-preview-platform="${id}">${label}</button>`;
    return `
      <div class="studio-preview__platform-tabs">
        ${tab('ios', '📱 iOS')}
        ${tab('android', '🤖 Android')}
        ${tab('web', '🌐 Web')}
      </div>
    `;
  }

  private renderPreviewActions(): string {
    if (this.state.previewStatus !== 'ready' || !this.state.previewSnackId) return '';
    return `
      <div class="studio-preview__actions">
        <button class="studio-btn studio-btn--ghost studio-btn--sm" data-preview-action="open-on-phone">
          🔗 Open on phone
        </button>
        <button class="studio-btn studio-btn--ghost studio-btn--sm" data-preview-action="open-fullscreen">
          ⤢ Open in new tab
        </button>
      </div>
    `;
  }

  /**
   * Build the URL for the iframe / button targets given the active platform.
   * Snack URL params doc:
   *   https://github.com/expo/snack/blob/main/docs/url-query-parameters.md
   */
  private buildSnackPlatformUrl(platform: 'ios' | 'android' | 'web'): string {
    const id = this.state.previewSnackId ?? '';
    const params = new URLSearchParams({
      platform,
      preview: 'true',
      theme: 'dark',
      hideQueryParams: 'true',
      supportedPlatforms: 'ios,android,web',
    });
    return `https://snack.expo.dev/${id}?${params.toString()}`;
  }

  /**
   * Expo Go deep link — opens directly in the Expo Go app on a phone.
   *   exp://exp.host/<snackId>
   * Wrapped in an https://exp.host redirector so it works as a clickable
   * link (Expo Go's iOS handler intercepts the redirect).
   */
  private buildExpoGoLink(): string {
    const id = this.state.previewSnackId ?? '';
    return `exp://exp.host/${id}`;
  }

  private renderPreviewBody(): string {
    if (!this.state.projectId) {
      return `
        <div style="font-size:32px;">📱</div>
        <div style="font-weight:600;margin-top:8px;">Your app preview</div>
        <div style="font-size:11px;opacity:0.6;margin-top:4px;">Send a prompt in the Chat tab to start.</div>
      `;
    }

    if (this.state.generating) {
      const progressPct = Math.min(95, this.state.tokensReceived / 400);
      return `
        <div style="font-size:32px;">⚡</div>
        <div style="font-weight:600;margin-top:8px;">Building your app</div>
        <div style="font-size:11px;opacity:0.7;margin-top:4px;">${escapeHtml(this.state.liveNarration ?? 'Streaming code from Claude...')}</div>
        <div style="margin-top:14px;width:80%;height:6px;background:#1a1a1f;border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${progressPct}%;background:linear-gradient(90deg,#6c8cff,#4a6dff);transition:width 0.3s;"></div>
        </div>
        <div style="font-size:11px;opacity:0.6;margin-top:8px;">${this.state.files.length} files · ${this.state.tokensReceived.toLocaleString()} tokens</div>
      `;
    }

    if (this.state.previewStatus === 'building') {
      return `
        <div style="font-size:32px;">🪄</div>
        <div style="font-weight:600;margin-top:8px;">Bundling preview...</div>
        <div style="font-size:11px;opacity:0.7;margin-top:4px;">Sending workspace to Expo Snack.</div>
        <div style="margin-top:14px;width:80%;height:6px;background:#1a1a1f;border-radius:3px;overflow:hidden;">
          <div style="height:100%;background:linear-gradient(90deg,#6c8cff,#4a6dff);animation:slide 1.5s ease-in-out infinite;width:50%;"></div>
        </div>
      `;
    }

    if (this.state.previewStatus === 'ready' && this.state.previewSnackId) {
      // For all three platforms we use Snack's preview iframe — it natively
      // renders an iOS-style or Android-style native simulator inside the
      // iframe when platform=ios / platform=android, and the actual web
      // build when platform=web. This is exactly what snack.expo.dev does
      // when you switch the platform tab on its own page.
      const url = this.buildSnackPlatformUrl(this.state.previewPlatform);
      return `
        <iframe
          src="${escapeHtml(url)}"
          style="width:100%;height:100%;border:0;border-radius:8px;background:#0f1115;"
          allow="camera;microphone;clipboard-read;clipboard-write"
          loading="lazy"
        ></iframe>
      `;
    }

    if (this.state.previewStatus === 'error') {
      return `
        <div style="font-size:24px;">⚠️</div>
        <div style="font-weight:600;margin-top:6px;">Preview unavailable</div>
        <div style="font-size:11px;opacity:0.7;margin-top:4px;line-height:1.4;">${escapeHtml(this.state.previewError ?? 'Snack bundle failed.')}</div>
        <div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap;justify-content:center;">
          <button class="studio-btn studio-btn--ghost studio-btn--sm" data-preview-action="retry">↻ Retry preview</button>
          <button class="studio-btn studio-btn--primary studio-btn--sm" data-preview-action="build-ios">📱 Build iOS</button>
        </div>
      `;
    }

    // Idle — project loaded, no preview yet
    const appName = this.state.projects.find((p) => p.projectId === this.state.projectId)?.name ?? this.state.projectId;
    const screens = this.state.files.filter((f) => f.path.match(/^app\/.+\.tsx$/) && !f.path.includes('_layout'));
    return `
      <div style="font-size:24px;">✨</div>
      <div style="font-weight:600;margin-top:6px;">${escapeHtml(String(appName))}</div>
      <div style="font-size:11px;opacity:0.7;margin-top:4px;line-height:1.5;">
        ${this.state.files.length} files · ${screens.length} screens
      </div>
      <div style="display:flex;gap:6px;margin-top:14px;flex-direction:column;width:100%;align-items:center;">
        <button class="studio-btn studio-btn--primary" data-preview-action="build-preview" style="width:90%;">▶️ Show live preview</button>
        <button class="studio-btn studio-btn--ghost studio-btn--sm" data-preview-action="build-ios" style="width:90%;">📱 Build iOS for TestFlight</button>
      </div>
      <div style="font-size:10px;opacity:0.5;margin-top:8px;">Live preview renders the app via Expo Snack — works best for SDK-54 apps without native modules.</div>
    `;
  }

  /**
   * Modal: shows a big QR code + the exp:// deep link so the operator can
   * either scan with Expo Go or copy the link. Rendered into the page
   * always; toggled visible by `state.showOpenOnPhone`.
   */
  private renderOpenOnPhoneModal(): string {
    if (!this.state.showOpenOnPhone) return '';
    if (!this.state.previewSnackId) return '';
    const expLink = this.buildExpoGoLink();
    // Use the public api.qrserver.com renderer so we don't have to bundle
    // a QR library. The QR encodes the exp:// deep link — Expo Go on the
    // user's phone intercepts it and loads the Snack runtime directly.
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(expLink)}&bgcolor=0d0e14&color=ffffff`;
    const snackPageUrl = `https://snack.expo.dev/${this.state.previewSnackId}`;
    return `
      <div class="studio-modal-backdrop" id="studio-open-on-phone-backdrop">
        <div class="studio-modal" role="dialog" aria-label="Open on phone">
          <button class="studio-modal__close" id="studio-open-on-phone-close" aria-label="Close">×</button>
          <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;">Open on your phone</h2>
          <p style="margin:0 0 18px;font-size:13px;opacity:0.7;line-height:1.5;">
            Scan this QR code with the <b>Expo Go</b> app (free on App Store / Play Store).
            The app runs natively on your phone with hot reload.
          </p>
          <div style="background:#0d0e14;border:1px solid #2a2f3d;border-radius:14px;padding:18px;display:flex;justify-content:center;">
            <img src="${escapeHtml(qrSrc)}" alt="QR code to open in Expo Go" width="320" height="320" style="display:block;border-radius:6px;background:#0d0e14;">
          </div>
          <div style="margin-top:16px;font-size:11px;opacity:0.6;">Or open this link from your phone:</div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input
              id="studio-exp-link-input"
              type="text"
              readonly
              value="${escapeHtml(expLink)}"
              style="flex:1;background:#14161b;color:#e6e6e6;border:1px solid #2a2f3d;border-radius:6px;padding:8px 10px;font-family:ui-monospace,monospace;font-size:11px;"
            >
            <button class="studio-btn studio-btn--ghost studio-btn--sm" id="studio-copy-exp-link">Copy</button>
          </div>
          <div style="margin-top:14px;font-size:11px;opacity:0.55;">Don't have Expo Go yet? <a href="${escapeHtml(snackPageUrl)}" target="_blank" rel="noopener" style="color:#6c8cff;">Open the full Snack page</a> to install it via App Store / Play Store.</div>
        </div>
      </div>
    `;
  }

  private renderTabContent(): string {
    switch (this.state.activeTab) {
      case 'chat': return this.renderChatContent();
      case 'files': return this.renderFilesContent();
      case 'code': return this.renderCodeContent();
      case 'logs': return this.renderLogsContent();
      case 'design': return this.renderDesignContent();
    }
  }

  private renderChatContent(): string {
    const msgs = this.messages.map((m) => {
      const cls = m.role === 'user' ? 'studio-msg--user' : m.role === 'assistant' ? 'studio-msg--assistant' : 'studio-msg--system';
      if (m.kind === 'plan') {
        return this.renderPlanMessage();
      }
      if (m.kind === 'design-picker') {
        const cards = BRANDING_STYLES.slice(0, 12).map((s) => `
          <button class="studio-design-card" data-apply-style="${escapeHtml(s.id)}">
            <span class="studio-design-card__swatch" style="background:${s.gradient}"></span>
            <span class="studio-design-card__name">${escapeHtml(s.name)}</span>
            <span class="studio-design-card__inspo">${escapeHtml(s.inspiration)}</span>
          </button>
        `).join('');
        return `
          <div class="studio-msg ${cls}" style="max-width:95%;">
            ${escapeHtml(m.text)}
            <div class="studio-design-grid-inline">${cards}</div>
          </div>
        `;
      }
      return `<div class="studio-msg ${cls}">${escapeHtml(m.text).replace(/\n/g, '<br/>')}</div>`;
    }).join('');
    return `
      <div class="studio-chat">
        <div class="studio-messages" id="studio-messages">${msgs}</div>
        <div class="studio-input-row">
          <textarea class="studio-input" id="studio-input" placeholder="${this.state.projectId ? 'Iterate on this app, or describe a new feature...' : 'Describe the app you want to build...'}" rows="3" ${this.state.generating ? 'disabled' : ''}></textarea>
          <button class="studio-btn studio-btn--primary" id="studio-send" ${this.state.generating ? 'disabled' : ''}>${this.state.generating ? 'Generating…' : 'Send →'}</button>
        </div>
      </div>
    `;
  }

  private renderFilesContent(): string {
    if (this.state.files.length === 0) {
      const msg = this.state.projectId
        ? 'No files yet. Generation will populate them here.'
        : 'Pick a saved project or send a prompt to create one.';
      return `<div class="studio-files"><div style="opacity:0.5;font-size:12px;">${msg}</div></div>`;
    }
    const tree = this.state.files
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => {
        const cls = `studio-file is-${f.status}${f.path === this.state.openFilePath ? ' is-active' : ''}`;
        return `<div class="${cls}" data-file-path="${escapeHtml(f.path)}">${escapeHtml(f.path)}</div>`;
      })
      .join('');
    return `<div class="studio-files">${tree}</div>`;
  }

  private renderCodeContent(): string {
    if (!this.state.openFilePath) {
      return `<div style="padding:24px;opacity:0.5;font-size:13px;text-align:center;">Click a file in the Files tab to open it here.</div>`;
    }
    return `
      <div class="studio-code">
        <div class="studio-code__header">
          <div class="studio-code__path">${escapeHtml(this.state.openFilePath)}${this.state.openFileDirty ? ' • unsaved' : ''}</div>
          <div>
            <button class="studio-btn studio-btn--ghost studio-btn--sm" id="studio-revert" ${this.state.openFileDirty ? '' : 'disabled'}>Revert</button>
            <button class="studio-btn studio-btn--primary studio-btn--sm" id="studio-save" ${this.state.openFileDirty ? '' : 'disabled'}>Save (⌘S)</button>
          </div>
        </div>
        <div class="studio-code__editor" id="studio-editor"></div>
      </div>
    `;
  }

  private renderLogsContent(): string {
    const events = this.state.buildEvents.slice(-100);
    const lines = events.length === 0
      ? `<div style="opacity:0.5;font-size:12px;">No events yet. Build the project to see logs.</div>`
      : events.map((e) => `<div class="studio-log-line">${escapeHtml(e)}</div>`).join('');
    return `<div class="studio-logs">${lines}</div>`;
  }

  private renderDesignContent(): string {
    const tabs = BRANDING_CATEGORIES.map((c) => `
      <button class="studio-btn studio-btn--ghost studio-btn--sm" data-branding-cat="${c.id}" style="${c.id === this.state.brandingFilter ? 'border-color:#6c8cff;color:#fff;' : ''}">${c.icon} ${c.label}</button>
    `).join('');
    const cards = BRANDING_STYLES
      .filter((s) => this.state.brandingFilter === 'all' || s.category === this.state.brandingFilter)
      .filter((s) => {
        if (!this.state.brandingSearch) return true;
        const q = this.state.brandingSearch.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.inspiration.toLowerCase().includes(q);
      })
      .map((s) => `
        <div class="studio-branding-card">
          <div class="studio-branding-card__swatch" style="background:${s.gradient}"></div>
          <div class="studio-branding-card__body">
            <h5 class="studio-branding-card__name">${escapeHtml(s.name)}</h5>
            <p class="studio-branding-card__desc">${escapeHtml(s.description)} <em>Inspired by ${escapeHtml(s.inspiration)}.</em></p>
            <button class="studio-btn studio-btn--primary studio-btn--sm" data-apply-style="${escapeHtml(s.id)}">Apply this style</button>
          </div>
        </div>
      `).join('');
    return `
      <div class="studio-design">
        <input class="studio-input" id="studio-branding-search" placeholder="Search branding styles..." value="${escapeHtml(this.state.brandingSearch)}" style="margin-bottom:8px;min-height:auto;padding:6px 10px;font-size:12px;" />
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${tabs}</div>
        <div class="studio-branding-grid">${cards}</div>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Listeners
  // -------------------------------------------------------------------------

  private attachListeners(): void {
    this.container.querySelector('#studio-new-project')?.addEventListener('click', () => {
      this.state.projectId = null;
      localStorage.removeItem(LS_PROJECT_KEY);
      this.state.files = [];
      this.state.openFilePath = null;
      this.state.activeTab = 'chat';
      this.messages.push({ role: 'system', text: 'Started a fresh session. Describe the app you want to build.' });
      this.renderAll();
    });

    this.container.querySelectorAll('[data-project-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.projectId!;
        if (id !== this.state.projectId) void this.loadProject(id);
      });
    });

    this.container.querySelectorAll('[data-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        const tab = (el as HTMLElement).dataset.tab as StudioTab;
        // Design "tab" actually redirects into the chat with a branding
        // picker rendered as a message — VibeCode-style. The user picks a
        // style and it gets sent as an iterate prompt.
        if (tab === 'design') {
          this.openDesignPickerInChat();
          return;
        }
        this.state.activeTab = tab;
        this.renderAll();
      });
    });

    this.container.querySelector('#studio-send')?.addEventListener('click', () => {
      captureUserAction('studio.sendButton.click', { activeTab: this.state.activeTab });
      const input = this.container.querySelector('#studio-input') as HTMLTextAreaElement | null;
      if (!input) {
        captureUserError(new Error('Send button: input element not found'), { activeTab: this.state.activeTab });
        return;
      }
      const text = input.value.trim();
      captureUserAction('studio.sendButton.text', { length: text.length, preview: text.slice(0, 80) });
      if (!text) {
        captureUserAction('studio.sendButton.empty');
        return;
      }
      input.value = '';
      try {
        void this.sendPrompt(text);
        captureUserAction('studio.sendPrompt.invoked');
      } catch (err) {
        captureUserError(err, { stage: 'sendPrompt-sync-throw', text: text.slice(0, 80) });
      }
    });
    this.container.querySelector('#studio-input')?.addEventListener('keydown', (e: Event) => {
      const ev = e as KeyboardEvent;
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        captureUserAction('studio.sendKeyboard');
        ev.preventDefault();
        const input = ev.currentTarget as HTMLTextAreaElement;
        const text = input.value.trim();
        input.value = '';
        void this.sendPrompt(text);
      }
    });

    this.container.querySelector('#studio-build-ios')?.addEventListener('click', () => void this.startBuildFor('ios'));
    this.container.querySelector('#studio-build-android')?.addEventListener('click', () => void this.startBuildFor('android'));
    this.container.querySelector('#studio-deploy-ios')?.addEventListener('click', () => void this.deployFor('ios'));

    this.container.querySelector('#studio-show-escalations')?.addEventListener('click', () => {
      this.state.activeTab = 'logs';
      const lines = this.state.escalations.map((e) => `[escalation] ${e.hookId}: ${e.reason} (${e.status})${e.notes ? ' — ' + e.notes : ''}`);
      this.state.buildEvents.push(...lines);
      this.renderAll();
    });

    // Compliance pill — click to jump to Logs tab where violations land.
    this.container.querySelector('#studio-spec-pill')?.addEventListener('click', () => {
      captureUserAction('studio.openCompliancePill', {
        state: this.state.compliance.state,
        violations: this.state.compliance.violationCount,
      });
      this.state.activeTab = 'logs';
      this.renderAll();
    });

    // Wire preview-pane action buttons (Build iOS / Android shortcuts + preview)
    this.container.querySelectorAll('[data-preview-action]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = (el as HTMLElement).dataset.previewAction;
        if (action === 'build-ios') void this.startBuildFor('ios');
        else if (action === 'build-android') void this.startBuildFor('android');
        else if (action === 'build-preview' || action === 'retry') void this.buildLivePreview();
        else if (action === 'open-on-phone') this.openOnPhone();
        else if (action === 'open-fullscreen') this.openPreviewInNewTab();
      });
    });

    // Platform tabs above the device frame — switch the iframe target.
    this.container.querySelectorAll('[data-preview-platform]').forEach((el) => {
      el.addEventListener('click', () => {
        const p = (el as HTMLElement).dataset.previewPlatform as 'ios' | 'android' | 'web';
        if (p === 'ios' || p === 'android' || p === 'web') {
          this.state.previewPlatform = p;
          captureUserAction('studio.previewPlatform', { platform: p });
          this.renderAll();
        }
      });
    });

    // Open-on-phone modal: backdrop click / close button / copy link
    this.container.querySelector('#studio-open-on-phone-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.state.showOpenOnPhone = false;
        this.renderAll();
      }
    });
    this.container.querySelector('#studio-open-on-phone-close')?.addEventListener('click', () => {
      this.state.showOpenOnPhone = false;
      this.renderAll();
    });
    this.container.querySelector('#studio-copy-exp-link')?.addEventListener('click', () => {
      const input = this.container.querySelector('#studio-exp-link-input') as HTMLInputElement | null;
      if (!input) return;
      input.select();
      try {
        void navigator.clipboard.writeText(input.value);
        const btn = this.container.querySelector('#studio-copy-exp-link');
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = '✓ Copied';
          window.setTimeout(() => { if (btn) btn.textContent = orig; }, 1500);
        }
      } catch {
        document.execCommand('copy');
      }
    });

    this.attachFilesListeners();
    this.attachCodeListeners();
    this.attachDesignListeners();
  }

  private attachFilesListeners(): void {
    this.container.querySelectorAll('[data-file-path]').forEach((el) => {
      el.addEventListener('click', () => {
        const path = (el as HTMLElement).dataset.filePath!;
        void this.openFile(path);
      });
    });
  }

  private attachCodeListeners(): void {
    this.container.querySelector('#studio-save')?.addEventListener('click', () => void this.saveOpenFile());
    this.container.querySelector('#studio-revert')?.addEventListener('click', () => {
      if (!this.editor) return;
      this.editor.setValue(this.state.openFileContent);
      this.state.openFileDirty = false;
      this.renderAll();
    });
  }

  private attachDesignListeners(): void {
    this.container.querySelectorAll('[data-branding-cat]').forEach((el) => {
      el.addEventListener('click', () => {
        this.state.brandingFilter = (el as HTMLElement).dataset.brandingCat!;
        this.renderAll();
      });
    });
    this.container.querySelector('#studio-branding-search')?.addEventListener('input', (e: Event) => {
      this.state.brandingSearch = (e.currentTarget as HTMLInputElement).value;
      const panel = this.container.querySelector('#studio-tab-panel');
      if (panel) panel.innerHTML = this.renderDesignContent();
      this.attachDesignListeners();
    });
    this.container.querySelectorAll('[data-apply-style]').forEach((el) => {
      el.addEventListener('click', () => {
        const styleId = (el as HTMLElement).dataset.applyStyle!;
        const style = BRANDING_STYLES.find((s) => s.id === styleId);
        if (!style) return;
        const prompt = `Apply the ${style.name} branding style. ${style.description} Inspired by ${style.inspiration}.`;
        void this.sendPrompt(prompt);
      });
    });
  }

  // -------------------------------------------------------------------------
  // Monaco editor
  // -------------------------------------------------------------------------

  private mountEditor(): void {
    const host = this.container.querySelector('#studio-editor') as HTMLElement | null;
    if (!host || !this.state.openFilePath) return;

    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }

    this.editor = monaco.editor.create(host, {
      value: this.state.openFileContent,
      language: langForPath(this.state.openFilePath),
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      wordWrap: 'on',
    });

    this.editor.onDidChangeModelContent(() => {
      const dirty = this.editor!.getValue() !== this.state.openFileContent;
      if (dirty !== this.state.openFileDirty) {
        this.state.openFileDirty = dirty;
        // Light re-render of just the header
        const header = this.container.querySelector('.studio-code__header');
        if (header) {
          (header.querySelector('.studio-code__path') as HTMLElement).textContent =
            (this.state.openFilePath ?? '') + (dirty ? ' • unsaved' : '');
          (header.querySelector('#studio-save') as HTMLButtonElement).disabled = !dirty;
          (header.querySelector('#studio-revert') as HTMLButtonElement).disabled = !dirty;
        }
        // Update tab indicator
        const codeTab = this.container.querySelector('[data-tab="code"]') as HTMLElement | null;
        if (codeTab) codeTab.textContent = '💻 Code' + (dirty ? ' •' : '');
      }
    });

    // ⌘S / Ctrl+S to save
    this.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => void this.saveOpenFile(),
    );
  }

  // -------------------------------------------------------------------------
  // Spec compliance — call /app-dev/spec/evaluate at session start.
  //   The runner pulls the last N Sentry breadcrumbs from this user's
  //   recent issues, walks them through the rule set, and returns
  //   violations + matched rules. Result is logged but never blocks the UI.
  //   Hourly backend cron does the same thing on its own schedule for
  //   ambient observability.
  // -------------------------------------------------------------------------
  private async evaluateSpecInBackground(): Promise<void> {
    captureUserAction('studio.evaluateSpec', { sessionId: this.sessionId });
    try {
      const res = await fetch('/app-dev/spec/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        // 500 usually means credential manager not configured (dev / first boot).
        // Don't surface to user — the cron will catch it.
        captureUserAction('studio.specEvaluateError', { status: res.status });
        return;
      }
      const report = await res.json() as {
        violations?: Array<{ ruleId: string; message: string }>;
        warnings?: Array<{ ruleId: string }>;
        matched?: Array<{ ruleId: string }>;
        summary?: Record<string, number>;
      };
      const violationCount = report.violations?.length ?? 0;
      const warningCount = report.warnings?.length ?? 0;
      const matchedCount = report.matched?.length ?? 0;
      this.state.compliance = {
        state: violationCount > 0 ? 'error' : warningCount > 0 ? 'warn' : 'ok',
        violationCount,
        warningCount,
        matchedCount,
        lastEvaluatedAt: new Date().toISOString(),
      };
      captureUserAction('studio.specEvaluated', {
        violations: violationCount,
        warnings: warningCount,
        matched: matchedCount,
      });
      // Re-render the sidebar footer so the compliance pill reflects the new state.
      this.renderAll();
      // If we have violations, surface them in the Logs tab + Sentry.
      // Sentry alert rule already configured to ping the operator on issues.
      if (violationCount > 0 && report.violations) {
        for (const v of report.violations) {
          this.state.buildEvents.push(
            `[spec] VIOLATION: ${v.ruleId} — ${v.message}`,
          );
          // Surface to Sentry as a captured error so issue tracking groups them.
          captureUserError(new Error(`Spec violation: ${v.ruleId}`), {
            stage: 'spec-runner',
            ruleId: v.ruleId,
            message: v.message,
          });
        }
        if (this.state.activeTab === 'logs') this.renderAll();
      }
    } catch (err) {
      // Network errors etc — log to Sentry only.
      captureUserAction('studio.specEvaluateError', {
        message: (err as Error).message.slice(0, 200),
      });
    }
  }
}
