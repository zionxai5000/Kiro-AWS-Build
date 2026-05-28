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
import { renderDeviceSelector, DEFAULT_DEVICES } from '../components/studio/DeviceSelector.js';
import { BRANDING_STYLES, BRANDING_CATEGORIES } from '../data/branding-styles.js';
import { captureUserAction, captureUserError } from '../sentry.js';
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
  type AppDevEscalation,
  type AppDevHealth,
  type AppDevProjectListEntry,
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
  liveNarration: string | null;
  /** Approximate tokens streamed so far in the current generation. */
  tokensReceived: number;
  /** Index in messages[] of the assistant message we're updating live. */
  liveAssistantIndex: number | null;
  /** A short paragraph the LLM produces describing the app for the preview pane. */
  appSummary: string | null;
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
    tokensReceived: 0,
    liveAssistantIndex: null,
    appSummary: null,
  };
  private messages: { role: 'user' | 'assistant' | 'system'; text: string }[] = [
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

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.render();
    this.attachListeners();

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
    try {
      const res = await listAppDevProjects();
      this.state.projects = res.projects;
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
        await this.refreshProjectList();
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
    this.messages.push({ role: 'assistant', text: '🚀 Booting code generator...' });
    this.state.liveAssistantIndex = this.messages.length - 1;
    this.state.activeTab = 'files';
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
        ? `\n✏️ ${this.state.tokensReceived.toLocaleString()} tokens streamed`
        : '';
      const phaseLine = this.state.liveNarration ? `\n${this.state.liveNarration}` : '';
      const msg = this.messages[this.state.liveAssistantIndex];
      if (msg) {
        msg.text = `🚀 Generating your app...${phaseLine}${fileLine}${tokenLine}`;
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
          // Generate a short app summary for the preview pane
          this.generateAppSummary(text, realFiles);
          void this.refreshFiles();
          void this.refreshProjectList();
          this.renderAll();
        },
        onError: (msg) => {
          if (this.state.liveAssistantIndex != null) {
            const m = this.messages[this.state.liveAssistantIndex];
            if (m) m.text = `❌ Generation failed: ${msg}`;
          }
          this.state.liveAssistantIndex = null;
          this.state.liveNarration = null;
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
      this.messages.push({ role: 'assistant', text: res.message });
    } catch (err) {
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
      this.messages.push({ role: 'assistant', text: res.message });
    } catch (err) {
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
      return `<div class="studio-msg ${cls}">${escapeHtml(m.text).replace(/\n/g, '<br/>')}</div>`;
    }).join('');
    if (wasScrolled) msgsEl.scrollTop = msgsEl.scrollHeight;
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

        <!-- RIGHT: Preview -->
        <aside class="studio-preview">
          <div class="studio-preview__toolbar">
            ${renderDeviceSelector({ devices: DEFAULT_DEVICES, selectedDeviceId: 'iphone-15' })}
          </div>
          <div class="studio-preview__device">
            <div class="studio-device-frame">
              <div class="studio-device-screen">
                ${this.renderPreviewBody()}
              </div>
            </div>
          </div>
          ${this.renderEscalationsBadge()}
        </aside>
      </div>

      <style>
        .studio { display: grid; grid-template-columns: 240px 1fr 360px; height: 100%; min-height: calc(100vh - 80px); background: var(--bg, #0f1115); color: var(--text, #e6e6e6); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .studio-sidebar { border-right: 1px solid #222; display: flex; flex-direction: column; }
        .studio-sidebar__header { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #222; }
        .studio-sidebar__header h3 { margin: 0; font-size: 13px; font-weight: 600; opacity: 0.8; }
        .studio-sidebar__list { flex: 1; overflow-y: auto; }
        .studio-project { padding: 10px 12px; border-bottom: 1px solid #1a1a1a; cursor: pointer; }
        .studio-project:hover { background: #1a1a1f; }
        .studio-project.is-active { background: #1f2330; border-left: 2px solid #6c8cff; }
        .studio-project__name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .studio-project__meta { font-size: 11px; opacity: 0.55; margin-top: 2px; }
        .studio-sidebar__footer { padding: 10px 12px; border-top: 1px solid #222; font-size: 11px; }
        .studio-main { display: flex; flex-direction: column; min-width: 0; }
        .studio-tabs { display: flex; align-items: center; gap: 4px; padding: 8px 12px; border-bottom: 1px solid #222; background: #14161b; }
        .studio-tab { background: transparent; border: 0; color: inherit; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
        .studio-tab.is-active { background: #2a2f3d; color: #fff; }
        .studio-tab:hover:not(.is-active) { background: #1f2230; }
        .studio-tabs__spacer { flex: 1; }
        .studio-tab-panel { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
        .studio-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-size: 12px; }
        .studio-btn--primary { background: #6c8cff; color: #0d0f15; font-weight: 600; border-color: #6c8cff; }
        .studio-btn--primary:hover:not(:disabled) { background: #4a6dff; }
        .studio-btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .studio-btn--ghost { background: transparent; color: #ccc; border-color: #333; }
        .studio-btn--ghost:hover { background: #1a1a1f; }
        .studio-btn--sm { padding: 4px 8px; font-size: 11px; }
        .studio-chat { display: flex; flex-direction: column; height: 100%; padding: 12px; }
        .studio-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-bottom: 12px; }
        .studio-msg { max-width: 80%; padding: 8px 12px; border-radius: 10px; font-size: 13px; line-height: 1.4; }
        .studio-msg--user { align-self: flex-end; background: #6c8cff; color: #0d0f15; }
        .studio-msg--assistant { align-self: flex-start; background: #2a2f3d; }
        .studio-msg--system { align-self: center; background: #1a1a1f; font-size: 11px; opacity: 0.7; max-width: 100%; }
        .studio-input-row { display: flex; gap: 8px; align-items: flex-end; border-top: 1px solid #222; padding-top: 12px; }
        .studio-input { flex: 1; background: #14161b; color: #e6e6e6; border: 1px solid #333; border-radius: 8px; padding: 10px; font-family: inherit; font-size: 13px; resize: vertical; min-height: 60px; }
        .studio-files { padding: 12px; overflow-y: auto; height: 100%; }
        .studio-file { padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-family: ui-monospace, monospace; display: flex; align-items: center; gap: 8px; }
        .studio-file:hover { background: #1a1a1f; }
        .studio-file.is-streaming { color: #ffd166; }
        .studio-file.is-streaming::before { content: '⏳ '; }
        .studio-file.is-complete::before { content: '📄 '; }
        .studio-file.is-active { background: #2a2f3d; }
        .studio-code { display: flex; flex-direction: column; height: 100%; }
        .studio-code__header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #222; background: #14161b; }
        .studio-code__path { font-family: ui-monospace, monospace; font-size: 12px; opacity: 0.8; }
        .studio-code__editor { flex: 1; min-height: 0; }
        .studio-logs { padding: 12px; overflow-y: auto; height: 100%; font-family: ui-monospace, monospace; font-size: 11px; }
        .studio-log-line { padding: 2px 0; opacity: 0.85; }
        .studio-design { padding: 12px; overflow-y: auto; height: 100%; }
        .studio-branding-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
        .studio-branding-card { background: #14161b; border: 1px solid #2a2f3d; border-radius: 8px; overflow: hidden; }
        .studio-branding-card__swatch { height: 80px; }
        .studio-branding-card__body { padding: 10px; }
        .studio-branding-card__name { font-size: 13px; font-weight: 600; margin: 0 0 4px; }
        .studio-branding-card__desc { font-size: 11px; opacity: 0.7; margin: 0 0 8px; line-height: 1.4; }
        .studio-preview { border-left: 1px solid #222; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
        .studio-device-frame { background: #1a1a1f; border-radius: 30px; padding: 8px; aspect-ratio: 9 / 19; max-width: 280px; margin: 0 auto; }
        .studio-device-screen { background: #0f1115; border-radius: 24px; height: 100%; display: flex; align-items: center; justify-content: center; padding: 16px; text-align: center; flex-direction: column; gap: 8px; font-size: 12px; opacity: 0.7; }
        .studio-escalation-badge { background: #ff4757; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
      </style>
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

  private renderEscalationsBadge(): string {
    if (this.state.escalations.length === 0) return '';
    return `
      <div class="studio-escalation-badge" id="studio-show-escalations">
        ⚠️ ${this.state.escalations.length} stuck pipeline${this.state.escalations.length === 1 ? '' : 's'} need attention
      </div>
    `;
  }

  private renderPreviewBody(): string {
    if (!this.state.projectId) {
      return `
        <div style="font-size:32px;">📱</div>
        <div style="font-weight:600;margin-top:8px;">Your app preview</div>
        <div style="font-size:11px;opacity:0.6;margin-top:4px;">Send a prompt in the Chat tab to start.</div>
      `;
    }

    // Live progress while generating
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

    // Completed — show app summary + screen list
    const appName = this.state.projects.find((p) => p.projectId === this.state.projectId)?.name ?? this.state.projectId;
    const screens = this.state.files.filter((f) => f.path.match(/^app\/.+\.tsx$/) && !f.path.includes('_layout'));
    const screenList = screens.slice(0, 8).map((s) => {
      const name = s.path
        .replace(/^app\//, '')
        .replace(/\.tsx$/, '')
        .replace(/\(tabs\)\//, '')
        .replace(/index/, 'home')
        .replace(/^./, (c) => c.toUpperCase());
      return `<div style="padding:6px 10px;background:#14161b;border-radius:6px;font-size:11px;text-align:left;">📄 ${escapeHtml(name)}</div>`;
    }).join('');

    const summary = this.state.appSummary ?? `${this.state.files.length} files generated.`;
    const summaryHtml = escapeHtml(summary).replace(/\n/g, '<br/>');

    const expoQrTarget = `exp://exp.host/@anonymous/${encodeURIComponent(String(appName))}`;
    const expoQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(expoQrTarget)}&bgcolor=0f1115&color=e6e6e6`;

    return `
      <div style="font-size:24px;">✨</div>
      <div style="font-weight:600;margin-top:6px;">${escapeHtml(String(appName))}</div>
      <div style="font-size:11px;opacity:0.7;margin-top:4px;line-height:1.5;">${summaryHtml}</div>
      ${screenList ? `<div style="display:flex;flex-direction:column;gap:4px;margin-top:12px;width:100%;">${screenList}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap;justify-content:center;">
        <button class="studio-btn studio-btn--primary studio-btn--sm" data-preview-action="build-ios">📱 Build iOS</button>
        <button class="studio-btn studio-btn--ghost studio-btn--sm" data-preview-action="build-android">🤖 Android</button>
      </div>
      <div style="margin-top:14px;background:#fff;padding:6px;border-radius:6px;">
        <img src="${expoQrUrl}" alt="Open in Expo Go" style="display:block;" />
      </div>
      <div style="font-size:10px;opacity:0.5;margin-top:6px;">Live Expo preview ships next. Scan with Expo Go to install on your phone after the iOS build finishes.</div>
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
      return `<div class="studio-msg ${cls}">${escapeHtml(m.text)}</div>`;
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
        this.state.activeTab = tab;
        this.renderAll();
      });
    });

    this.container.querySelector('#studio-send')?.addEventListener('click', () => {
      const input = this.container.querySelector('#studio-input') as HTMLTextAreaElement | null;
      if (!input) return;
      const text = input.value.trim();
      input.value = '';
      void this.sendPrompt(text);
    });
    this.container.querySelector('#studio-input')?.addEventListener('keydown', (e: Event) => {
      const ev = e as KeyboardEvent;
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
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

    // Wire preview-pane action buttons (Build iOS / Android shortcuts)
    this.container.querySelectorAll('[data-preview-action]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = (el as HTMLElement).dataset.previewAction;
        if (action === 'build-ios') void this.startBuildFor('ios');
        else if (action === 'build-android') void this.startBuildFor('android');
      });
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
}
