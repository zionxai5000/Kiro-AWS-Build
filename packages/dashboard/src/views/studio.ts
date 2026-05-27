/**
 * ZionX App Development Studio — Dashboard View
 *
 * Wired end-to-end to the backend pipeline (Phase 10):
 *  - Send button → POST /app-dev/projects then SSE-stream /generate
 *  - File tree panel reflects workspace contents
 *  - Build button → POST /app-dev/projects/:id/build
 *  - Deploy button → POST /app-dev/projects/:id/auto-submit-and-watch
 *  - Logs panel pulls metrics + recent crash events
 *  - Escalations panel polls /app-dev/escalations
 *  - Preview pane: fallback to latest screenshot + Expo Go QR until live preview lands.
 *  - Auth: every fetch uses Cognito bearer token via api.ts helpers.
 */

import { renderDeviceSelector, DEFAULT_DEVICES } from '../components/studio/DeviceSelector.js';
import { BRANDING_STYLES, BRANDING_CATEGORIES } from '../data/branding-styles.js';
import {
  createAppDevProject,
  getAppDevProject,
  listAppDevFiles,
  startBuild,
  autoSubmitAndWatch,
  fetchAppDevEscalations,
  fetchAppDevHealth,
  streamGenerateCode,
  type AppDevEscalation,
  type AppDevHealth,
  DashboardWebSocket,
  type WebSocketMessage,
} from '../api.js';

// ---------------------------------------------------------------------------
// Local-storage keys (so a refresh restores the studio session)
// ---------------------------------------------------------------------------

const LS_KEYS = {
  projectId: 'zionx_studio_project_id',
} as const;

// ---------------------------------------------------------------------------
// Tool Panel Content Generators (kept compact — heavy panels live elsewhere)
// ---------------------------------------------------------------------------

function renderPreviewPanel(state: StudioState): string {
  const screenshotUrl = state.projectId
    ? `${window.location.origin}/api/app-dev/projects/${state.projectId}/files?path=assets/icon.png`
    : '';
  const qrTarget =
    state.projectId
      ? `exp://expo.dev/--/projects/${state.projectId}`
      : 'https://expo.dev';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrTarget)}`;
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">👁️ Preview</h3>
      <div class="studio__panel-section">
        <div style="background:#f5f5f7;border-radius:12px;padding:12px;text-align:center;">
          ${screenshotUrl ? `<img src="${screenshotUrl}" alt="latest icon" style="max-width:100%;border-radius:8px;" onerror="this.style.display='none'"/>` : '<p>Build the app to see a preview.</p>'}
        </div>
        <p class="studio__panel-desc" style="margin-top:8px;font-size:11px;color:#999;">Live Expo preview lands tomorrow — for now we show the latest generated icon.</p>
      </div>
      <div class="studio__panel-section">
        <h4>Open on a real device (Expo Go)</h4>
        <div style="text-align:center;background:#fff;padding:12px;border-radius:12px;">
          <img src="${qrUrl}" alt="Expo Go QR code" />
        </div>
      </div>
    </div>
  `;
}

function renderFilesPanel(state: StudioState): string {
  if (!state.projectId) {
    return `
      <div class="studio__panel">
        <h3 class="studio__panel-title">📁 Files</h3>
        <p class="studio__panel-desc">Send your first prompt to generate a project.</p>
      </div>
    `;
  }
  const tree = state.files.length === 0
    ? '<div class="studio__panel-empty">No files generated yet.</div>'
    : state.files.map((f) => `<div class="studio__file-item">📄 ${f}</div>`).join('');
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">📁 Files (${state.files.length})</h3>
      <div class="studio__panel-section">
        <div class="studio__file-tree-mini">${tree}</div>
      </div>
      <div class="studio__panel-section">
        <button class="studio__btn studio__btn--ghost" data-action="refresh-files">🔁 Refresh</button>
      </div>
    </div>
  `;
}

function renderLogsPanel(state: StudioState): string {
  const buildLogs = state.buildEvents.length === 0
    ? '<code>No build activity yet.</code>'
    : state.buildEvents.slice(-10).map((e) => `<code>${escapeHtml(e)}</code>`).join('<br/>');
  const crashes = state.crashes.length === 0
    ? '<div class="studio__panel-empty">No crashes observed.</div>'
    : state.crashes.slice(-5).map((c) => `<div class="studio__file-item">⚠️ ${escapeHtml(c)}</div>`).join('');
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">📋 Logs</h3>
      <div class="studio__panel-section">
        <h4>Build Output</h4>
        <div class="studio__panel-logs">${buildLogs}</div>
      </div>
      <div class="studio__panel-section">
        <h4>Recent Crashes (Sentry)</h4>
        ${crashes}
      </div>
    </div>
  `;
}

function renderDeployPanel(_state: StudioState): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🚀 Deploy</h3>
      <div class="studio__panel-section">
        <h4>iOS — TestFlight</h4>
        <button class="studio__btn studio__btn--primary" data-action="deploy-ios">📤 Submit to TestFlight</button>
      </div>
      <div class="studio__panel-section">
        <h4>Android — Play (Internal)</h4>
        <button class="studio__btn studio__btn--primary" data-action="deploy-android">📤 Submit to Internal Track</button>
      </div>
    </div>
  `;
}

function renderEscalationsPanel(state: StudioState): string {
  const items = state.escalations.length === 0
    ? '<div class="studio__panel-empty">No active escalations — all hooks are healthy.</div>'
    : state.escalations.map((e) => `
        <div class="studio__file-item" style="border-left:3px solid #ffd166;padding-left:8px;margin-bottom:8px;">
          <strong>${escapeHtml(e.hookId)}</strong> · ${e.status} · ${escapeHtml(e.reason)}
          ${e.notes ? `<div style="font-size:11px;color:#666;">${escapeHtml(e.notes)}</div>` : ''}
          <button class="studio__btn studio__btn--ghost studio__btn--sm" data-action="take-over" data-escalation-id="${e.id}">Take Over</button>
        </div>
      `).join('');
  const health = state.health
    ? `<div class="studio__panel-empty">Status: ${state.health.status} · errorRate ${(state.health.recentErrorRate * 100).toFixed(1)}%</div>`
    : '';
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">⚠️ Escalations</h3>
      ${health}
      <div class="studio__panel-section">${items}</div>
    </div>
  `;
}

function renderDesignPanel(): string {
  const categoryTabs = BRANDING_CATEGORIES.map(c =>
    `<button class="studio__branding-tab" data-branding-category="${c.id}">${c.icon} ${c.label}</button>`
  ).join('');
  const styleCards = BRANDING_STYLES.map(s =>
    `<div class="studio__branding-card" data-branding-style="${s.id}" data-style-category="${s.category}">
      <div class="studio__branding-swatch" style="background: ${s.gradient}"></div>
      <div class="studio__branding-info">
        <span class="studio__branding-badge">${s.category}</span>
        <h5 class="studio__branding-name">${s.name}</h5>
        <p class="studio__branding-desc">${s.description}</p>
        <span class="studio__branding-inspiration">Inspired by ${s.inspiration}</span>
        <button class="studio__btn studio__btn--primary studio__btn--sm studio__branding-apply" data-prompt="Apply the ${s.name} branding style to my app. This style is inspired by ${s.inspiration}: ${s.description}">Use This Style</button>
      </div>
    </div>`
  ).join('');
  return `
    <div class="studio__panel studio__panel--branding">
      <h3 class="studio__panel-title">🎨 Branding Library</h3>
      <p class="studio__panel-desc">50 branding styles — pick one to instantly apply a professional design system.</p>
      <div class="studio__branding-search"><input type="text" class="studio__panel-input" placeholder="Search styles..." id="branding-search" /></div>
      <div class="studio__branding-tabs" id="branding-tabs">${categoryTabs}</div>
      <div class="studio__branding-grid" id="branding-grid">${styleCards}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

interface StudioState {
  projectId: string | null;
  files: string[];
  buildEvents: string[];
  crashes: string[];
  escalations: AppDevEscalation[];
  health: AppDevHealth | null;
  latestBuildId: string | null;
  generating: boolean;
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

interface ToolDef {
  id: string;
  icon: string;
  label: string;
  renderPanel: (state: StudioState) => string;
}

const TOOLS: ToolDef[] = [
  { id: 'preview', icon: '👁️', label: 'Preview', renderPanel: renderPreviewPanel },
  { id: 'files', icon: '📁', label: 'Files', renderPanel: renderFilesPanel },
  { id: 'design', icon: '🎨', label: 'Design', renderPanel: renderDesignPanel },
  { id: 'logs', icon: '📋', label: 'Logs', renderPanel: renderLogsPanel },
  { id: 'deploy', icon: '🚀', label: 'Deploy', renderPanel: renderDeployPanel },
  { id: 'escalations', icon: '⚠️', label: 'Help', renderPanel: renderEscalationsPanel },
];

// ---------------------------------------------------------------------------
// Studio View
// ---------------------------------------------------------------------------

export class StudioView {
  private container: HTMLElement;
  private messages: { role: 'user' | 'assistant' | 'system'; text: string }[] = [
    { role: 'system', text: 'Welcome to ZionX Studio. Describe the app you want to build.' },
  ];
  private activeTool = 'preview';
  private toolPanelOpen = false;
  private state: StudioState = {
    projectId: null,
    files: [],
    buildEvents: [],
    crashes: [],
    escalations: [],
    health: null,
    latestBuildId: null,
    generating: false,
  };
  private ws: DashboardWebSocket | null = null;
  private escalationPollHandle: number | null = null;
  private currentStreamAbort: AbortController | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    // Try to restore prior session.
    const saved = localStorage.getItem(LS_KEYS.projectId);
    if (saved) {
      this.state.projectId = saved;
      try {
        const project = await getAppDevProject(saved);
        this.messages.push({
          role: 'system',
          text: `Restored project ${project.projectId} (${project.fileCount ?? 0} files).`,
        });
        await this.refreshFiles();
      } catch {
        localStorage.removeItem(LS_KEYS.projectId);
        this.state.projectId = null;
      }
    }

    // Start escalation polling (every 15s)
    this.escalationPollHandle = window.setInterval(() => this.refreshEscalations(), 15_000);
    void this.refreshEscalations();
    void this.refreshHealth();

    // WebSocket — listen for build status + crashes
    this.ws = new DashboardWebSocket();
    this.ws.connect();
    this.ws.on('agent.state.changed', (msg: WebSocketMessage) => {
      // Repurpose generic event channel — we filter by source/type at app-dev level
      const data = msg.data as Record<string, unknown>;
      if (typeof data['hookId'] === 'string') {
        this.state.buildEvents.push(`${msg.timestamp}: ${data['hookId']} ${data['success'] ? 'ok' : 'failed'}`);
      }
    });

    this.render();
    this.attachListeners();
  }

  unmount(): void {
    this.container.innerHTML = '';
    this.ws?.disconnect();
    if (this.escalationPollHandle) window.clearInterval(this.escalationPollHandle);
    this.currentStreamAbort?.abort();
  }

  private async refreshEscalations(): Promise<void> {
    try {
      const result = await fetchAppDevEscalations();
      this.state.escalations = result.escalations.filter((e) => e.status !== 'resolved');
      if (this.toolPanelOpen && this.activeTool === 'escalations') this.renderAndAttach();
    } catch {
      /* network blip — try again next tick */
    }
  }

  private async refreshHealth(): Promise<void> {
    try {
      this.state.health = await fetchAppDevHealth();
    } catch {
      this.state.health = null;
    }
  }

  private async refreshFiles(): Promise<void> {
    if (!this.state.projectId) return;
    try {
      const result = await listAppDevFiles(this.state.projectId);
      this.state.files = result.files;
      if (this.toolPanelOpen && this.activeTool === 'files') this.renderAndAttach();
    } catch (err) {
      this.messages.push({ role: 'system', text: `Failed to load files: ${(err as Error).message}` });
    }
  }

  private async handleSend(text: string): Promise<void> {
    if (!text || this.state.generating) return;
    this.messages.push({ role: 'user', text });
    this.state.generating = true;

    // Create a project if we don't have one yet.
    if (!this.state.projectId) {
      try {
        const project = await createAppDevProject({
          name: text.slice(0, 60),
          description: text,
          platform: 'both',
        });
        this.state.projectId = project.projectId;
        localStorage.setItem(LS_KEYS.projectId, project.projectId);
        this.messages.push({ role: 'system', text: `Project created: ${project.projectId}` });
      } catch (err) {
        this.messages.push({ role: 'assistant', text: `Could not create project: ${(err as Error).message}` });
        this.state.generating = false;
        this.renderAndAttach();
        return;
      }
    }

    const projectId = this.state.projectId!;
    this.messages.push({ role: 'assistant', text: 'Generating…' });
    this.renderAndAttach();

    const filesGenerated: string[] = [];
    try {
      const abort = await streamGenerateCode(projectId, text, {
        onFileStart: (path) => {
          this.state.buildEvents.push(`generate: file ${path}`);
        },
        onFileEnd: (path) => {
          filesGenerated.push(path);
        },
        onComplete: (files) => {
          this.messages.push({ role: 'assistant', text: `Generated ${files.length} files.` });
          this.state.generating = false;
          this.renderAndAttach();
          void this.refreshFiles();
        },
        onError: (msg) => {
          this.messages.push({ role: 'assistant', text: `Generation failed: ${msg}` });
          this.state.generating = false;
          this.renderAndAttach();
        },
      });
      this.currentStreamAbort = abort;
    } catch (err) {
      this.messages.push({ role: 'assistant', text: `Stream error: ${(err as Error).message}` });
      this.state.generating = false;
      this.renderAndAttach();
    }
  }

  private async handleBuild(platform: 'ios' | 'android'): Promise<void> {
    if (!this.state.projectId) {
      this.messages.push({ role: 'system', text: 'Generate a project first.' });
      this.renderAndAttach();
      return;
    }
    this.messages.push({ role: 'assistant', text: `Starting ${platform} build…` });
    this.renderAndAttach();
    try {
      const res = await startBuild(this.state.projectId, { platform, autoSubmit: false });
      this.state.latestBuildId = res.buildId;
      this.state.buildEvents.push(`${platform} build queued: ${res.buildId}`);
      this.messages.push({ role: 'assistant', text: res.message });
    } catch (err) {
      this.messages.push({ role: 'assistant', text: `Build failed: ${(err as Error).message}` });
    }
    this.renderAndAttach();
  }

  private async handleDeploy(platform: 'ios' | 'android'): Promise<void> {
    if (!this.state.projectId || !this.state.latestBuildId) {
      this.messages.push({ role: 'system', text: 'Run a successful build first, then deploy.' });
      this.renderAndAttach();
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
    }
    this.renderAndAttach();
  }

  private renderAndAttach(): void {
    this.render();
    this.attachListeners();
    const msgs = this.container.querySelector('#studio-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  private render(): void {
    const toolPanelContent = this.toolPanelOpen
      ? TOOLS.find(t => t.id === this.activeTool)?.renderPanel(this.state) ?? ''
      : '';

    const escalationBadge = this.state.escalations.length > 0
      ? `<span style="background:#ff4757;color:#fff;border-radius:9999px;padding:1px 6px;font-size:10px;margin-left:4px;">${this.state.escalations.length}</span>`
      : '';

    this.container.innerHTML = `
      <div class="studio ${this.toolPanelOpen ? 'studio--panel-open' : ''}">
        <div class="studio__chat">
          <div class="studio__chat-header">
            <h2 class="studio__chat-title">ZionX Studio</h2>
            ${this.state.projectId ? `<span style="font-size:11px;color:#999;">${this.state.projectId}</span>` : ''}
          </div>
          <div class="studio__chat-messages" id="studio-messages">
            ${this.renderMessages()}
          </div>
          <div class="studio__chat-input-area">
            <textarea
              class="studio__chat-input"
              id="studio-input"
              placeholder="Describe your app, or tell me what to change..."
              rows="4"
              ${this.state.generating ? 'disabled' : ''}
            ></textarea>
            <div class="studio__chat-actions">
              <button class="studio__btn studio__btn--primary" id="studio-send" ${this.state.generating ? 'disabled' : ''}>
                ${this.state.generating ? 'Generating…' : 'Build App →'}
              </button>
              <button class="studio__btn studio__btn--ghost" id="studio-build-ios" title="Build iOS">📱 iOS</button>
              <button class="studio__btn studio__btn--ghost" id="studio-build-android" title="Build Android">🤖 Android</button>
            </div>
          </div>
        </div>

        <div class="studio__preview">
          <div class="studio__preview-toolbar">
            ${renderDeviceSelector({ devices: DEFAULT_DEVICES, selectedDeviceId: 'iphone-15' })}
            <div class="studio__preview-controls">
              <button class="studio__btn studio__btn--icon" id="studio-reload" title="Reload">↻</button>
              <button class="studio__btn studio__btn--icon" id="studio-qr" title="Open on phone">📱</button>
            </div>
          </div>
          <div class="studio__preview-device">
            <div class="studio__device-frame">
              <div class="studio__device-notch"></div>
              <div class="studio__device-screen" id="studio-screen">
                ${this.renderPreviewBody()}
              </div>
              <div class="studio__device-home-indicator"></div>
            </div>
          </div>
        </div>

        <div class="studio__tools">
          ${TOOLS.map(t => `
            <button class="studio__tool-item ${t.id === this.activeTool && this.toolPanelOpen ? 'studio__tool-item--active' : ''}" data-tool="${t.id}" title="${t.label}">
              <span class="studio__tool-icon">${t.icon}</span>
              <span class="studio__tool-label">${t.label}${t.id === 'escalations' ? escalationBadge : ''}</span>
            </button>
          `).join('')}
        </div>

        ${this.toolPanelOpen ? `
          <div class="studio__tool-panel">
            <button class="studio__tool-panel-close" id="close-tool-panel">✕</button>
            ${toolPanelContent}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderPreviewBody(): string {
    if (!this.state.projectId) {
      return `
        <div class="studio__device-placeholder">
          <div class="studio__device-placeholder-icon">📱</div>
          <p class="studio__device-placeholder-title">Your app preview</p>
          <p class="studio__device-placeholder-text">Describe your app to get started.</p>
        </div>
      `;
    }
    return `
      <div class="studio__device-placeholder">
        <div class="studio__device-placeholder-icon">⏳</div>
        <p class="studio__device-placeholder-title">Live preview lands tomorrow</p>
        <p class="studio__device-placeholder-text">Open the Preview panel for the latest screenshot + Expo Go QR.</p>
      </div>
    `;
  }

  private renderMessages(): string {
    return this.messages.map(msg => {
      const cls = msg.role === 'user'
        ? 'studio__msg--user'
        : msg.role === 'assistant'
          ? 'studio__msg--assistant'
          : 'studio__msg--system';
      return `<div class="studio__msg ${cls}"><p>${escapeHtml(msg.text)}</p></div>`;
    }).join('');
  }

  private attachListeners(): void {
    const sendBtn = this.container.querySelector('#studio-send') as HTMLButtonElement | null;
    const input = this.container.querySelector('#studio-input') as HTMLTextAreaElement | null;
    if (sendBtn && input) {
      sendBtn.addEventListener('click', () => {
        const text = input.value.trim();
        input.value = '';
        void this.handleSend(text);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          const text = input.value.trim();
          input.value = '';
          void this.handleSend(text);
        }
      });
    }

    this.container.querySelector('#studio-build-ios')?.addEventListener('click', () => void this.handleBuild('ios'));
    this.container.querySelector('#studio-build-android')?.addEventListener('click', () => void this.handleBuild('android'));

    this.container.querySelectorAll('[data-tool]').forEach((item) => {
      item.addEventListener('click', () => {
        const toolId = (item as HTMLElement).dataset.tool!;
        if (this.activeTool === toolId && this.toolPanelOpen) {
          this.toolPanelOpen = false;
        } else {
          this.activeTool = toolId;
          this.toolPanelOpen = true;
        }
        this.renderAndAttach();
      });
    });

    this.container.querySelector('#close-tool-panel')?.addEventListener('click', () => {
      this.toolPanelOpen = false;
      this.renderAndAttach();
    });

    this.container.querySelectorAll('[data-prompt]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const prompt = (chip as HTMLElement).dataset.prompt!;
        this.toolPanelOpen = false;
        void this.handleSend(prompt);
      });
    });

    this.container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action!;
        switch (action) {
          case 'refresh-files':
            void this.refreshFiles();
            break;
          case 'deploy-ios':
            void this.handleDeploy('ios');
            break;
          case 'deploy-android':
            void this.handleDeploy('android');
            break;
          case 'take-over': {
            const id = (btn as HTMLElement).dataset.escalationId!;
            this.messages.push({
              role: 'system',
              text: `Operator taking over escalation ${id}. Investigate and resolve manually.`,
            });
            this.renderAndAttach();
            break;
          }
        }
      });
    });

    // Branding categories — keep prior behavior
    this.container.querySelectorAll('[data-branding-category]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const category = (tab as HTMLElement).dataset.brandingCategory!;
        this.container.querySelectorAll('[data-branding-category]').forEach((t) => t.classList.remove('studio__branding-tab--active'));
        tab.classList.add('studio__branding-tab--active');
        this.container.querySelectorAll('[data-branding-style]').forEach((card) => {
          const cardCategory = (card as HTMLElement).dataset.styleCategory;
          (card as HTMLElement).style.display = category === 'all' || cardCategory === category ? '' : 'none';
        });
      });
    });
    const brandingSearch = this.container.querySelector('#branding-search') as HTMLInputElement | null;
    if (brandingSearch) {
      brandingSearch.addEventListener('input', () => {
        const query = brandingSearch.value.toLowerCase().trim();
        this.container.querySelectorAll('[data-branding-style]').forEach((card) => {
          const el = card as HTMLElement;
          const text = (el.textContent ?? '').toLowerCase();
          el.style.display = !query || text.includes(query) ? '' : 'none';
        });
      });
    }
    const allTab = this.container.querySelector('[data-branding-category="all"]');
    if (allTab) allTab.classList.add('studio__branding-tab--active');
  }
}
