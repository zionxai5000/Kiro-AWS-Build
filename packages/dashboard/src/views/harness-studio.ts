/**
 * Harness Studio — the new 3-column UI for the agent harness.
 *
 * Talks to `POST /app-dev/projects/:id/agent-message` (the new endpoint from
 * Phase 9). Renders the SSE event stream as plan card + narration with tool
 * activity chips + reviewer scores. Preview pane points at the auth proxy
 * `/api/preview/:projectId`.
 *
 * The legacy `studio.ts` keeps working — this view sits alongside it.
 * Switching the route is a one-line change in `pages/`.
 */

import { harnessTokens, renderHarnessStylesheet } from './harness-studio-tokens.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HarnessProject {
  id: string;
  name: string;
  status: 'idle' | 'building' | 'ready' | 'error';
  /** Visual polish / persistence / domain / onboarding scores 0-100, if any. */
  scores?: { visual: number; persistence: number; domain: number; onboarding: number };
  /** Whether the project shipped with a quality-bar-failed badge. */
  qualityBarFailed?: boolean;
  /** ISO timestamp of last write. */
  updatedAt?: string;
}

export interface AgentChunk {
  /** From the SSE 'agent' event payload. */
  type: 'text' | 'tool.call' | 'tool.result' | 'skill.loaded' | 'subagent.spawn' | 'subagent.result' | 'iteration' | 'done';
  text?: string;
  name?: string;
  summary?: string;
  passed?: boolean;
  score?: number;
  durationMs?: number;
  isError?: boolean;
}

export interface PlanCard {
  domain: string;
  userGoal: string;
  screens: string[];
  stateModel: string;
  seed: string;
  persistence: string;
  visualAnchor: string;
  hero: string;
  emptyState: string;
  failCheck: string;
}

export interface ChatMessage {
  id: string;
  kind: 'user' | 'plan' | 'agent-text' | 'tool-chip' | 'reviewer' | 'phase' | 'error';
  text?: string;
  /** Tool / reviewer label. */
  label?: string;
  toolKind?: 'read' | 'write' | 'edit' | 'run' | 'review' | 'error';
  /** Quality reviewer scores rendered as a pill row. */
  scores?: Array<{ name: string; passed: boolean; score?: number }>;
  /** Plan card payload. */
  plan?: PlanCard;
}

export interface PreviewState {
  url: string | null;        // /api/preview/<id>/  or null if no project selected
  status: 'idle' | 'waking' | 'live' | 'building' | 'error';
  lastReloadMs?: number;
  errorMessage?: string;
}

export interface HarnessStudioState {
  projects: HarnessProject[];
  activeProjectId: string | null;
  messages: ChatMessage[];
  /** Set while an agent run is streaming. */
  streaming: boolean;
  /** Active platform tab. */
  platform: 'web' | 'ios' | 'android';
  preview: PreviewState;
  /** Showing the QR modal? */
  qrModalOpen: boolean;
  /** Bottom-tab content swap (preview | logs | files). */
  paneTab: 'preview' | 'logs' | 'files';
  /** Plan card collapsed state. */
  planCollapsed: boolean;
}

export interface HarnessStudioCallbacks {
  /** Called when the user submits a prompt. */
  onSubmit: (prompt: string, projectId: string | null) => void;
  /** Cancel the running agent. */
  onStop: () => void;
  /** Click a project in the sidebar. */
  onSelectProject: (projectId: string) => void;
  /** Click + New App. */
  onNewProject: () => void;
  /** Toggle preview platform. */
  onPlatform: (platform: 'web' | 'ios' | 'android') => void;
  /** Refresh / fullscreen / phone QR. */
  onRefresh: () => void;
  onFullscreen: () => void;
  onPhone: () => void;
  /** Close the QR modal. */
  onModalClose: () => void;
  /** Switch between preview / logs / files tabs. */
  onPaneTab: (tab: 'preview' | 'logs' | 'files') => void;
  /** Toggle plan card collapsed. */
  onPlanToggle: () => void;
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

const EXAMPLE_PROMPTS = [
  'Build a habit tracker',
  'Build a todo list',
  'Build a recipe collection',
  'Build a tic-tac-toe game',
] as const;

const ICON_FOR_KIND: Record<NonNullable<ChatMessage['toolKind']>, string> = {
  read: '⚙',
  write: '✎',
  edit: '✎',
  run: '⚡',
  review: '✦',
  error: '⚠',
};

export class HarnessStudioView {
  private container: HTMLElement;
  private state: HarnessStudioState = {
    projects: [],
    activeProjectId: null,
    messages: [],
    streaming: false,
    platform: 'web',
    preview: { url: null, status: 'idle' },
    qrModalOpen: false,
    paneTab: 'preview',
    planCollapsed: false,
  };
  private callbacks: HarnessStudioCallbacks;

  constructor(container: HTMLElement, callbacks: HarnessStudioCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  setState(partial: Partial<HarnessStudioState>): void {
    this.state = { ...this.state, ...partial };
    this.render();
  }

  /** Append a chat message and re-render. */
  appendMessage(message: ChatMessage): void {
    this.state = { ...this.state, messages: [...this.state.messages, message] };
    this.render();
  }

  /** Replace every message (e.g. on project switch). */
  setMessages(messages: ChatMessage[]): void {
    this.state = { ...this.state, messages };
    this.render();
  }

  /** Render the entire shell. */
  render(): void {
    const styleHtml = renderHarnessStylesheet();
    const navHtml = this.renderNav();
    const sidebarHtml = this.renderSidebar();
    const chatHtml = this.renderChat();
    const previewHtml = this.renderPreview();
    const modalHtml = this.state.qrModalOpen ? this.renderQrModal() : '';

    this.container.innerHTML = `${styleHtml}
      <div class="harness-studio">
        ${navHtml}
        <div class="harness-body">
          ${sidebarHtml}
          ${chatHtml}
          ${previewHtml}
        </div>
      </div>
      ${modalHtml}
    `;

    this.bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Sub-renderers
  // ---------------------------------------------------------------------------

  private renderNav(): string {
    return `
      <nav class="harness-nav" aria-label="Top navigation">
        <span class="harness-nav__logo">
          <span class="harness-nav__logo-mark" aria-hidden="true"></span>
          ZIONX
        </span>
        <div class="harness-nav__tabs" role="tablist">
          <button class="harness-nav__tab" aria-current="page" role="tab">Studio</button>
          <button class="harness-nav__tab" role="tab">Projects</button>
          <button class="harness-nav__tab" role="tab">Design</button>
        </div>
        <span class="harness-nav__spacer"></span>
        <button class="harness-nav__cta" data-action="new-project" type="button">+ New App</button>
        <button class="harness-nav__icon-button" aria-label="Toggle theme" type="button">◐</button>
        <button class="harness-nav__icon-button" aria-label="Account" type="button">👤</button>
      </nav>
    `;
  }

  private renderSidebar(): string {
    const projects = this.state.projects.slice().sort(
      (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
    );
    const projectsHtml = projects.length === 0
      ? `<div class="harness-sidebar__empty"><span style="color:${harnessTokens.text.tertiary};font-size:${harnessTokens.type.sizes.xs}px;">No projects yet.</span></div>`
      : projects.map((p) => this.renderProjectRow(p)).join('');

    return `
      <aside class="harness-sidebar" aria-label="Projects sidebar">
        <button class="harness-sidebar__new" data-action="new-project" type="button">+ New App</button>
        <div class="harness-sidebar__section-title">Projects</div>
        <div class="harness-sidebar__projects">${projectsHtml}</div>
        <div class="harness-sidebar__util">
          <button data-action="pane-tab" data-pane-tab="preview"  ${this.state.paneTab === 'preview' ? 'aria-pressed="true"' : ''}>Preview</button>
          <button data-action="pane-tab" data-pane-tab="logs"     ${this.state.paneTab === 'logs' ? 'aria-pressed="true"' : ''}>Logs</button>
          <button data-action="pane-tab" data-pane-tab="files"    ${this.state.paneTab === 'files' ? 'aria-pressed="true"' : ''}>Files</button>
          <div class="harness-sidebar__status">
            <span class="harness-status-dot" data-state="${this.state.preview.status === 'live' ? 'awake' : this.state.preview.status === 'waking' ? 'waking' : this.state.preview.status === 'error' ? 'error' : ''}"></span>
            ${this.formatSandboxStatus()}
          </div>
        </div>
      </aside>
    `;
  }

  private renderProjectRow(p: HarnessProject): string {
    const active = p.id === this.state.activeProjectId;
    const score = p.scores
      ? `<span class="harness-project-row__pill ${p.qualityBarFailed ? 'harness-pill--warn' : 'harness-pill--ok'}">${Math.min(p.scores.visual, p.scores.persistence, p.scores.domain, p.scores.onboarding)}/100</span>`
      : `<span class="harness-project-row__pill harness-pill--stub">stub</span>`;
    const saved = p.updatedAt
      ? `<span class="harness-project-row__pill harness-pill--saved">💾 saved</span>`
      : '';
    return `
      <button class="harness-project-row" data-action="select-project" data-project-id="${escapeHtml(p.id)}" data-active="${active}" type="button">
        <span class="harness-project-row__name">${escapeHtml(p.name)}</span>
        <span class="harness-project-row__meta">${score}${saved}</span>
      </button>
    `;
  }

  private renderChat(): string {
    return `
      <section class="harness-chat" aria-label="Agent chat">
        <div class="harness-chat__stream" data-region="messages">
          ${this.state.messages.length === 0 ? this.renderEmptyChat() : this.state.messages.map((m) => this.renderMessage(m)).join('')}
        </div>
        ${this.renderInput()}
      </section>
    `;
  }

  private renderEmptyChat(): string {
    return `
      <div class="harness-empty">
        <div class="harness-empty__title">Describe an app and I'll build it</div>
        <div class="harness-empty__sub">Real-time tool activity, live preview, designed quality gates. Try one of these to start:</div>
        <div class="harness-empty__chips">
          ${EXAMPLE_PROMPTS.map((ex) => `<button class="harness-input-examples" data-action="example" data-prompt="${escapeHtml(ex)}" type="button" style="all:unset;cursor:pointer;padding:8px 14px;border:1px solid ${harnessTokens.border.subtle};border-radius:${harnessTokens.radius.pill}px;color:${harnessTokens.text.secondary};font-size:${harnessTokens.type.sizes.sm}px;">${escapeHtml(ex)}</button>`).join('')}
        </div>
      </div>
    `;
  }

  private renderMessage(m: ChatMessage): string {
    switch (m.kind) {
      case 'user':
        return `<div class="harness-chat__row"><div class="harness-chat__icon">›</div><div class="harness-chat__text harness-chat__text--user">${escapeHtml(m.text ?? '')}</div></div>`;
      case 'agent-text':
        return `<div class="harness-chat__row"><div class="harness-chat__icon">✦</div><div class="harness-chat__text harness-chat__text--agent">${escapeHtml(m.text ?? '')}</div></div>`;
      case 'tool-chip': {
        const cls = m.toolKind ?? 'read';
        const icon = ICON_FOR_KIND[cls] ?? '·';
        return `<div class="harness-chat__row"><div class="harness-chat__icon">${icon}</div><div class="harness-chat__text"><span class="harness-chat__chip harness-chat__chip--${cls}">${escapeHtml(m.label ?? cls)}</span></div></div>`;
      }
      case 'reviewer': {
        const passed = (m.scores ?? []).every((s) => s.passed);
        const klass = passed ? 'harness-quality-pill--pass' : 'harness-quality-pill--fail';
        const text = (m.scores ?? []).map((s) => `${s.name}: ${s.score ?? '–'}`).join(' · ');
        return `<div class="harness-chat__row"><div class="harness-chat__icon">${passed ? '✓' : '✗'}</div><div class="harness-chat__text"><span class="harness-quality-pill ${klass}">${escapeHtml(text || 'Quality gate')}</span></div></div>`;
      }
      case 'plan':
        return this.renderPlanCard(m.plan);
      case 'phase':
        return `<div class="harness-chat__row"><div class="harness-chat__icon">·</div><div class="harness-chat__text">${escapeHtml(m.text ?? '')}</div></div>`;
      case 'error':
        return `<div class="harness-chat__row"><div class="harness-chat__icon">⚠</div><div class="harness-chat__text" style="color:${harnessTokens.status.danger}">${escapeHtml(m.text ?? '')}</div></div>`;
    }
  }

  private renderPlanCard(plan?: PlanCard): string {
    if (!plan) return '';
    const collapsed = this.state.planCollapsed;
    const body = collapsed ? '' : `
      <div class="harness-chat__plan-body">
        <div class="harness-chat__plan-keys">
          <div class="harness-chat__plan-key"><b>Domain</b><span>${escapeHtml(plan.domain)}</span></div>
          <div class="harness-chat__plan-key"><b>Goal</b><span>${escapeHtml(plan.userGoal)}</span></div>
          <div class="harness-chat__plan-key"><b>Screens</b><span>${escapeHtml(plan.screens.join(' · '))}</span></div>
          <div class="harness-chat__plan-key"><b>State</b><span>${escapeHtml(plan.stateModel)}</span></div>
          <div class="harness-chat__plan-key"><b>Seed</b><span>${escapeHtml(plan.seed)}</span></div>
          <div class="harness-chat__plan-key"><b>Persist</b><span>${escapeHtml(plan.persistence)}</span></div>
          <div class="harness-chat__plan-key"><b>Visual</b><span>${escapeHtml(plan.visualAnchor)}</span></div>
          <div class="harness-chat__plan-key"><b>Hero</b><span>${escapeHtml(plan.hero)}</span></div>
          <div class="harness-chat__plan-key"><b>Empty</b><span>${escapeHtml(plan.emptyState)}</span></div>
        </div>
      </div>
    `;
    return `
      <div class="harness-chat__plan">
        <div class="harness-chat__plan-header">
          <span>📋 Build plan ✓ accepted</span>
          <button class="harness-chat__plan-toggle" data-action="plan-toggle" type="button">${collapsed ? '▸ expand' : '▾ collapse'}</button>
        </div>
        ${body}
      </div>
    `;
  }

  private renderInput(): string {
    const stop = this.state.streaming
      ? `<button class="harness-input-button harness-input-button--stop" data-action="stop" aria-label="Stop generation" type="button">■</button>`
      : '';
    return `
      <div class="harness-chat__input">
        <form data-form="prompt" autocomplete="off">
          <div class="harness-input-row">
            <textarea class="harness-input-textarea"
              data-input="prompt"
              placeholder="Tell me what to build, or what to change…"
              rows="2"></textarea>
            <div class="harness-input-buttons">
              <button class="harness-input-button" type="button" aria-label="Attach">📎</button>
              ${stop}
              <button class="harness-input-button harness-input-button--send" type="submit" aria-label="Send" ${this.state.streaming ? 'disabled' : ''}>↑</button>
            </div>
          </div>
        </form>
      </div>
    `;
  }

  private renderPreview(): string {
    const previewSrc = this.state.preview.url ?? '';
    let viewportContent = '';
    if (this.state.paneTab === 'logs') {
      viewportContent = `<pre style="margin:0;padding:${harnessTokens.space.lg}px;color:${harnessTokens.text.secondary};font-family:${harnessTokens.type.mono};font-size:${harnessTokens.type.sizes.sm}px;line-height:1.5;height:100%;overflow:auto;background:${harnessTokens.bg.elevated};">Logs will stream here when the sandbox is provisioned.</pre>`;
    } else if (this.state.paneTab === 'files') {
      viewportContent = `<div style="padding:${harnessTokens.space.lg}px;color:${harnessTokens.text.secondary};font-size:${harnessTokens.type.sizes.sm}px;">File tree will show here.</div>`;
    } else if (!previewSrc) {
      viewportContent = `<div class="harness-preview__overlay">
        <div style="font-size:${harnessTokens.type.sizes.lg}px;font-weight:${harnessTokens.type.weights.semibold};">No preview yet</div>
        <div style="color:${harnessTokens.text.secondary};font-size:${harnessTokens.type.sizes.sm}px;text-align:center;max-width:320px;line-height:1.5;">
          Send a message and your app will spin up here.
        </div>
        <div class="harness-skeleton"></div>
      </div>`;
    } else if (this.state.preview.status === 'building') {
      viewportContent = `<div class="harness-preview__overlay">
        <div class="harness-spinner"></div>
        <div style="color:${harnessTokens.text.secondary};font-size:${harnessTokens.type.sizes.sm}px;">Building your app…</div>
      </div>`;
    } else if (this.state.preview.status === 'waking') {
      viewportContent = `<div class="harness-preview__overlay">
        <div class="harness-spinner"></div>
        <div style="color:${harnessTokens.accent.warm};font-size:${harnessTokens.type.sizes.sm}px;">Waking sandbox…</div>
      </div>`;
    } else if (this.state.preview.status === 'error') {
      viewportContent = `<div class="harness-preview__overlay">
        <div style="color:${harnessTokens.status.danger};font-size:${harnessTokens.type.sizes.lg}px;font-weight:${harnessTokens.type.weights.semibold};">Preview crashed</div>
        <div style="color:${harnessTokens.text.secondary};font-size:${harnessTokens.type.sizes.sm}px;text-align:center;max-width:360px;line-height:1.5;">${escapeHtml(this.state.preview.errorMessage ?? 'Open Logs to see what happened.')}</div>
        <button class="harness-input-button harness-input-button--send" data-action="pane-tab" data-pane-tab="logs" type="button" style="width:auto;padding:0 16px;">Open Logs</button>
      </div>`;
    } else {
      viewportContent = `<iframe src="${escapeHtml(previewSrc)}" title="App preview" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`;
    }

    const reloadLabel = this.state.preview.lastReloadMs
      ? `last reload ${(this.state.preview.lastReloadMs / 1000).toFixed(1)}s ago`
      : '–';

    return `
      <section class="harness-preview" aria-label="Live preview">
        <div class="harness-preview__toolbar">
          <div class="harness-preview__platform" role="tablist" aria-label="Platform">
            <button data-action="platform" data-platform="web"     aria-pressed="${this.state.platform === 'web'}">🌐 Web</button>
            <button data-action="platform" data-platform="ios"     aria-pressed="${this.state.platform === 'ios'}">📱 iOS</button>
            <button data-action="platform" data-platform="android" aria-pressed="${this.state.platform === 'android'}">🤖 Android</button>
          </div>
          <span class="harness-preview__spacer"></span>
          <button class="harness-preview__action" data-action="refresh"    aria-label="Refresh"   type="button">↻</button>
          <button class="harness-preview__action" data-action="fullscreen" aria-label="Fullscreen" type="button">⛶</button>
          <button class="harness-preview__action" data-action="phone"      aria-label="Open on phone" type="button">📲</button>
        </div>
        <div class="harness-preview__viewport">${viewportContent}</div>
        <div class="harness-preview__statusbar">
          <span class="harness-status-dot" data-state="${this.state.preview.status === 'live' ? 'awake' : this.state.preview.status === 'waking' ? 'waking' : this.state.preview.status === 'error' ? 'error' : ''}"></span>
          <span>${this.formatPreviewStatus()}</span>
          <span class="harness-preview__spacer"></span>
          <span>${escapeHtml(reloadLabel)}</span>
        </div>
      </section>
    `;
  }

  private renderQrModal(): string {
    const project = this.activeProject();
    const qrData = encodeURIComponent(this.state.preview.url ?? '');
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${qrData}`;
    return `
      <div class="harness-modal__backdrop" data-action="modal-close">
        <div class="harness-modal" data-stop-propagation>
          <h3>Open on phone</h3>
          <p>Scan with the Expo Go app to open <b>${escapeHtml(project?.name ?? 'this app')}</b> on your real device. Hot reload connects through the auth proxy.</p>
          <img class="harness-modal__qr" src="${qrSrc}" alt="QR code" width="240" height="240" />
          <p style="font-size:${harnessTokens.type.sizes.xs}px;color:${harnessTokens.text.tertiary};">Token expires in 1 hour.</p>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="harness-input-button" data-action="modal-close" type="button" style="width:auto;padding:0 16px;">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private activeProject(): HarnessProject | null {
    return this.state.projects.find((p) => p.id === this.state.activeProjectId) ?? null;
  }

  private formatPreviewStatus(): string {
    switch (this.state.preview.status) {
      case 'live':     return `● Live · ${this.activeProject()?.id.slice(0, 12) ?? 'no project'}`;
      case 'waking':   return '◐ Waking sandbox…';
      case 'building': return '◐ Building…';
      case 'error':    return '● Error';
      default:         return '● Idle';
    }
  }

  private formatSandboxStatus(): string {
    switch (this.state.preview.status) {
      case 'live':     return 'Sandbox awake';
      case 'waking':   return 'Sandbox waking';
      case 'building': return 'Building';
      case 'error':    return 'Sandbox error';
      default:         return 'Sandbox idle';
    }
  }

  // ---------------------------------------------------------------------------
  // Event binding
  // ---------------------------------------------------------------------------

  private bindEvents(): void {
    const root = this.container;

    root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const actionEl = target.closest('[data-action]') as HTMLElement | null;
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      switch (action) {
        case 'new-project':
          this.callbacks.onNewProject(); break;
        case 'select-project': {
          const id = actionEl.dataset.projectId;
          if (id) this.callbacks.onSelectProject(id);
          break;
        }
        case 'platform': {
          const p = actionEl.dataset.platform as 'web' | 'ios' | 'android';
          if (p) this.callbacks.onPlatform(p);
          break;
        }
        case 'refresh':    this.callbacks.onRefresh(); break;
        case 'fullscreen': this.callbacks.onFullscreen(); break;
        case 'phone':      this.callbacks.onPhone(); break;
        case 'stop':       this.callbacks.onStop(); break;
        case 'plan-toggle':
          this.setState({ planCollapsed: !this.state.planCollapsed });
          break;
        case 'pane-tab': {
          const tab = actionEl.dataset.paneTab as 'preview' | 'logs' | 'files';
          if (tab) this.callbacks.onPaneTab(tab);
          break;
        }
        case 'modal-close':
          // Ignore clicks on the inner card.
          if ((target as HTMLElement).closest('[data-stop-propagation]') && actionEl.classList.contains('harness-modal__backdrop')) {
            return;
          }
          this.callbacks.onModalClose();
          break;
        case 'example': {
          const prompt = actionEl.dataset.prompt;
          if (prompt) {
            const ta = root.querySelector<HTMLTextAreaElement>('[data-input="prompt"]');
            if (ta) {
              ta.value = prompt;
              ta.focus();
            }
          }
          break;
        }
      }
    });

    const form = root.querySelector('[data-form="prompt"]') as HTMLFormElement | null;
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const ta = form.querySelector<HTMLTextAreaElement>('[data-input="prompt"]');
        const prompt = ta?.value.trim();
        if (!prompt) return;
        this.callbacks.onSubmit(prompt, this.state.activeProjectId);
        if (ta) ta.value = '';
      });
    }

    // Auto-grow textarea + cmd/ctrl-enter to submit.
    const ta = root.querySelector<HTMLTextAreaElement>('[data-input="prompt"]');
    if (ta) {
      ta.addEventListener('input', () => {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
      });
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          const prompt = ta.value.trim();
          if (prompt) {
            this.callbacks.onSubmit(prompt, this.state.activeProjectId);
            ta.value = '';
          }
        }
      });
    }

    // Auto-scroll the chat to the bottom on each render.
    const stream = root.querySelector<HTMLElement>('[data-region="messages"]');
    if (stream) {
      requestAnimationFrame(() => { stream.scrollTop = stream.scrollHeight; });
    }
  }
}

// ---------------------------------------------------------------------------
// SSE bridge — converts the agent's SSE stream into ChatMessage events.
//
// The new endpoint emits:
//   { type: 'phase',  phase, message, ... }
//   { type: 'agent',  event: AgentEvent }
//   { type: 'done',   passed, reviewers, ... }
//   { type: 'error',  message }
// ---------------------------------------------------------------------------

export interface SsePayload {
  type: 'phase' | 'agent' | 'done' | 'error';
  message?: string;
  phase?: string;
  event?: AgentChunk;
  passed?: boolean;
  reviewers?: Array<{ name: string; passed: boolean; score?: number }>;
}

export function ssePayloadToMessages(payload: SsePayload): ChatMessage[] {
  const out: ChatMessage[] = [];
  switch (payload.type) {
    case 'phase':
      out.push({ id: rid(), kind: 'phase', text: payload.message ?? '' });
      break;
    case 'agent': {
      const ev = payload.event;
      if (!ev) break;
      switch (ev.type) {
        case 'text':
          if (ev.text) out.push({ id: rid(), kind: 'agent-text', text: ev.text });
          break;
        case 'tool.call': {
          const summary = ev.summary ?? ev.name ?? 'tool';
          const toolKind = toolKindFor(ev.name ?? '');
          out.push({ id: rid(), kind: 'tool-chip', toolKind, label: summary });
          break;
        }
        case 'subagent.result':
          out.push({
            id: rid(),
            kind: 'reviewer',
            scores: [{ name: ev.name ?? 'reviewer', passed: !!ev.passed, score: ev.score }],
          });
          break;
        case 'done':
          out.push({ id: rid(), kind: 'phase', text: 'Agent finished.' });
          break;
      }
      break;
    }
    case 'done':
      if (payload.reviewers && payload.reviewers.length) {
        out.push({
          id: rid(),
          kind: 'reviewer',
          scores: payload.reviewers,
        });
      }
      out.push({
        id: rid(),
        kind: 'agent-text',
        text: payload.passed
          ? 'Done. Quality gate passed.'
          : 'Done. Quality gate failed; shipping with badge.',
      });
      break;
    case 'error':
      out.push({ id: rid(), kind: 'error', text: payload.message ?? 'Unknown error' });
      break;
  }
  return out;
}

function toolKindFor(name: string): NonNullable<ChatMessage['toolKind']> {
  if (name === 'read_file' || name === 'list_files' || name === 'search') return 'read';
  if (name === 'write_file') return 'write';
  if (name === 'edit_file') return 'edit';
  if (name === 'run_command' || name === 'screenshot') return 'run';
  if (name === 'spawn_subagent' || name === 'load_skill') return 'review';
  return 'read';
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
