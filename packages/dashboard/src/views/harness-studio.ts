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
  /** File list (lazy-loaded when the Code or Files tab is opened). */
  files?: string[];
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

/**
 * Ship-tab state — covers Build, Listing, Submit, Crashes, Cost.
 * Each section has its own status field so they can update independently.
 */
export interface ShipState {
  // Build (Hook 6)
  buildStatus: 'idle' | 'queued' | 'in_progress' | 'finished' | 'errored';
  buildPlatform: 'ios' | 'android' | 'all';
  buildEasId?: string;
  buildArtifacts?: { ios?: string; android?: string };
  buildError?: string;

  // Listing (Hook 8)
  listingStatus: 'idle' | 'generating' | 'ready' | 'errored';
  listing?: {
    name: string;
    subtitle: string;
    description: string;
    keywords: string;
    category: string;
  };
  listingError?: string;

  // Preflight (Hook 9)
  preflightStatus: 'idle' | 'checking' | 'ready' | 'blocked';
  preflightChecklist?: Array<{ id: string; label: string; status: 'pass' | 'fail' | 'warn'; detail?: string }>;
  preflightPlatform: 'ios' | 'android';

  // Submit (Hook 9b)
  submitStatus: 'idle' | 'submitting' | 'submitted' | 'failed';
  submitResult?: { submissionId?: string; status: string; errorMessage?: string };

  // Crashes (Hook 10)
  crashes: Array<{
    sentryEventId: string;
    errorMessage: string;
    platform: 'ios' | 'android' | 'unknown';
    observedAt: string;
  }>;

  // Cost (Use case 15)
  cost?: {
    todayUsd: number;
    dailyLimitUsd: number;
    perHook?: Record<string, { count: number; durationMs: number; failureRate: number }>;
  };
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
  /** Bottom-tab content swap. */
  paneTab: 'preview' | 'logs' | 'files' | 'code' | 'ship' | 'image' | 'audio' | 'db' | 'request' | 'deploy';
  /** Preview pane render mode — scale-to-fit a 390x844 device frame, or
   *  scroll the iframe inside the column. */
  viewMode: 'scale' | 'scroll';
  /** Active file in the Code tab + buffered edit content. */
  codeOpenPath: string | null;
  codeContent: string;
  codeSavedAt: number | null;
  codeIsDirty: boolean;
  /** Build / submit / listing state for the Ship tab. */
  ship: ShipState;
  /** Plan card collapsed state. */
  planCollapsed: boolean;
  /** Files tab — search + type filter. */
  filesSearch: string;
  filesFilter: 'all' | 'code' | 'image' | 'audio' | 'data' | 'config';
  /** Image gallery — populated from project files matching image extensions. */
  imagePrompt: string;
  imageGenerating: boolean;
  /** Audio panel — populated from project files matching audio extensions. */
  audioPrompt: string;
  /** Database — list of detected schemas / data files. */
  dbTables: Array<{ name: string; columns: string[]; rowCount: number; source: string }>;
  /** Logs panel — runtime + build streams (subscribed via WebSocket from controller). */
  logs: Array<{ id: string; level: 'info' | 'warn' | 'error' | 'debug'; source: 'agent' | 'build' | 'runtime' | 'system'; text: string; ts: string; traceId?: string }>;
  logsFilter: 'all' | 'info' | 'warn' | 'error' | 'debug';
  logsSearch: string;
  /** Request inspector — captured API/network requests with replay. */
  requests: Array<{ id: string; method: string; url: string; status: number; ms: number; ts: string; reqBody?: string; resBody?: string; traceId?: string; byMessageId?: string }>;
  requestsFilter: 'all' | '2xx' | '4xx' | '5xx';
  requestsSearch: string;
  selectedRequestId: string | null;
  /** Deploy snapshot list — versions, current, rollback. */
  deploySnapshots: Array<{ id: string; version: string; env: 'preview' | 'prod'; createdAt: string; status: 'live' | 'archived' | 'building'; commitSha?: string; bundleHash?: string; sizeBytes?: number; ipaUrl?: string; aabUrl?: string }>;
  deployActiveEnv: 'preview' | 'prod';
  /** Two-way linking: which message-id is currently highlighted in the Code/Files/etc tabs. */
  highlightedMessageId: string | null;
  /** Streaming "thinking" — the current tokens streaming before the agent acts. */
  thinking: { text: string; collapsed: boolean; visible: boolean };
  /** Agents Live presence cards — Builder, Critic, Marketing. */
  agents: Array<{ id: string; name: string; role: 'builder' | 'critic' | 'marketing'; status: 'idle' | 'thinking' | 'working' | 'done' | 'failed'; task?: string; lastHeartbeat: string }>;
  /** Memory & context panel — what AI knows about this project. */
  memoryOpen: boolean;
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
  /** Switch between preview / logs / files / code / ship / image / audio / db / request / deploy tabs. */
  onPaneTab: (tab: 'preview' | 'logs' | 'files' | 'code' | 'ship' | 'image' | 'audio' | 'db' | 'request' | 'deploy') => void;
  /** Toggle plan card collapsed. */
  onPlanToggle: () => void;
  /** Code tab — file/edit/save. */
  onCodeFileOpen?: (path: string) => void;
  onCodeContentChange?: (path: string, content: string) => void;
  onCodeSave?: (path: string, content: string) => void;
  /** Ship tab — build, listing, submit. */
  onBuild?: (platform: 'ios' | 'android' | 'all') => void;
  onGenerateListing?: () => void;
  onPreflight?: (platform: 'ios' | 'android') => void;
  onSubmitConfirm?: (platform: 'ios' | 'android', easBuildId: string) => void;
  /** G2.B — Files / Image / Audio / Database tabs. */
  onFileOpen?: (path: string) => void;
  onImageGenerate?: (prompt: string) => void;
  onImageUseAsIcon?: (path: string) => void;
  onImageUseInApp?: (path: string) => void;
  onAudioTts?: (prompt: string) => void;
  onAudioRecord?: () => void;
  onAudioWire?: (path: string) => void;
  /** G2.C — Logs / Request — "Ask AI" deep-link to Chat. */
  onAskAiAboutLog?: (logId: string) => void;
  onRequestReplay?: (requestId: string) => void;
  /** G2.D — Deploy snapshot + rollback. */
  onDeployNow?: (env: 'preview' | 'prod') => void;
  onDeployRollback?: (snapshotId: string) => void;
  /** G2.E — Two-way linking: jump to chat message that produced an artifact. */
  onLinkBackToMessage?: (messageId: string) => void;
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
    viewMode: 'scale',
    codeOpenPath: null,
    codeContent: '',
    codeSavedAt: null,
    codeIsDirty: false,
    ship: {
      buildStatus: 'idle',
      buildPlatform: 'all',
      listingStatus: 'idle',
      preflightStatus: 'idle',
      preflightPlatform: 'ios',
      submitStatus: 'idle',
      crashes: [],
    },
    planCollapsed: false,
    filesSearch: '',
    filesFilter: 'all',
    imagePrompt: '',
    imageGenerating: false,
    audioPrompt: '',
    dbTables: [],
    logs: [],
    logsFilter: 'all',
    logsSearch: '',
    requests: [],
    requestsFilter: 'all',
    requestsSearch: '',
    selectedRequestId: null,
    deploySnapshots: [],
    deployActiveEnv: 'preview',
    highlightedMessageId: null,
    thinking: { text: '', collapsed: false, visible: false },
    agents: [
      { id: 'builder', name: 'Builder', role: 'builder', status: 'idle', lastHeartbeat: new Date().toISOString() },
      { id: 'critic', name: 'Critic / QA', role: 'critic', status: 'idle', lastHeartbeat: new Date().toISOString() },
      { id: 'marketing', name: 'Marketing', role: 'marketing', status: 'idle', lastHeartbeat: new Date().toISOString() },
    ],
    memoryOpen: false,
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

  /** Read the current state. */
  getState(): HarnessStudioState {
    return this.state;
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
          <div class="harness-sidebar__group-label">Workspace</div>
          <button data-action="pane-tab" data-pane-tab="preview"  ${this.state.paneTab === 'preview' ? 'aria-pressed="true"' : ''}>👁 Preview</button>
          <button data-action="pane-tab" data-pane-tab="code"     ${this.state.paneTab === 'code' ? 'aria-pressed="true"' : ''}>📄 Code</button>
          <button data-action="pane-tab" data-pane-tab="files"    ${this.state.paneTab === 'files' ? 'aria-pressed="true"' : ''}>📁 Files</button>
          <button data-action="pane-tab" data-pane-tab="image"    ${this.state.paneTab === 'image' ? 'aria-pressed="true"' : ''}>🖼 Image</button>
          <button data-action="pane-tab" data-pane-tab="audio"    ${this.state.paneTab === 'audio' ? 'aria-pressed="true"' : ''}>🔊 Audio</button>
          <button data-action="pane-tab" data-pane-tab="db"       ${this.state.paneTab === 'db' ? 'aria-pressed="true"' : ''}>🗄 Database</button>
          <div class="harness-sidebar__group-label">Observe</div>
          <button data-action="pane-tab" data-pane-tab="logs"     ${this.state.paneTab === 'logs' ? 'aria-pressed="true"' : ''}>📋 Logs</button>
          <button data-action="pane-tab" data-pane-tab="request"  ${this.state.paneTab === 'request' ? 'aria-pressed="true"' : ''}>🌐 Request</button>
          <div class="harness-sidebar__group-label">Deliver</div>
          <button data-action="pane-tab" data-pane-tab="ship"     ${this.state.paneTab === 'ship' ? 'aria-pressed="true"' : ''}>🚀 Ship</button>
          <button data-action="pane-tab" data-pane-tab="deploy"   ${this.state.paneTab === 'deploy' ? 'aria-pressed="true"' : ''}>☁ Deploy</button>
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
        ${this.renderAgentsLive()}
        ${this.renderThinkingStrip()}
        <div class="harness-chat__stream" data-region="messages">
          ${this.state.messages.length === 0 ? this.renderEmptyChat() : this.state.messages.map((m) => this.renderMessage(m)).join('')}
        </div>
        ${this.renderInput()}
      </section>
    `;
  }

  /** G2.F — Agents Live presence cards (Builder · Critic · Marketing). */
  private renderAgentsLive(): string {
    if (!this.state.agents.length) return '';
    return `<div class="harness-agents-live">
      ${this.state.agents.map((a) => {
        const dotClass = a.status === 'thinking' || a.status === 'working' ? 'awake' : a.status === 'failed' ? 'error' : '';
        return `<div class="harness-agent-card" data-agent-id="${escapeHtml(a.id)}">
          <span class="harness-status-dot" data-state="${dotClass}"></span>
          <span class="harness-agent-card__name">${escapeHtml(a.name)}</span>
          <span class="harness-agent-card__task">${escapeHtml(a.task ?? a.status)}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  /** G2.F — Streaming "thinking" strip that shows the agent's plan tokens
   *  before action. Collapsible. */
  private renderThinkingStrip(): string {
    const t = this.state.thinking;
    if (!t.visible || !t.text) return '';
    if (t.collapsed) {
      return `<div class="harness-thinking is-collapsed">
        <button data-action="thinking-toggle" type="button">▸ Reasoning (${t.text.length} chars)</button>
      </div>`;
    }
    return `<div class="harness-thinking">
      <div class="harness-thinking__head">
        <span>✦ Reasoning…</span>
        <button data-action="thinking-toggle" type="button">▾ collapse</button>
      </div>
      <div class="harness-thinking__body">${escapeHtml(t.text)}</div>
    </div>`;
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
    const idAttr = `data-message-id="${escapeHtml(m.id)}"`;
    switch (m.kind) {
      case 'user':
        return `<div class="harness-chat__row" ${idAttr}><div class="harness-chat__icon">›</div><div class="harness-chat__text harness-chat__text--user">${escapeHtml(m.text ?? '')}</div></div>`;
      case 'agent-text':
        return `<div class="harness-chat__row" ${idAttr}><div class="harness-chat__icon">✦</div><div class="harness-chat__text harness-chat__text--agent">${escapeHtml(m.text ?? '')}</div></div>`;
      case 'tool-chip': {
        const cls = m.toolKind ?? 'read';
        const icon = ICON_FOR_KIND[cls] ?? '·';
        return `<div class="harness-chat__row" ${idAttr}><div class="harness-chat__icon">${icon}</div><div class="harness-chat__text"><span class="harness-chat__chip harness-chat__chip--${cls}">${escapeHtml(m.label ?? cls)}</span></div></div>`;
      }
      case 'reviewer': {
        const passed = (m.scores ?? []).every((s) => s.passed);
        const klass = passed ? 'harness-quality-pill--pass' : 'harness-quality-pill--fail';
        const text = (m.scores ?? []).map((s) => `${s.name}: ${s.score ?? '–'}`).join(' · ');
        return `<div class="harness-chat__row" ${idAttr}><div class="harness-chat__icon">${passed ? '✓' : '✗'}</div><div class="harness-chat__text"><span class="harness-quality-pill ${klass}">${escapeHtml(text || 'Quality gate')}</span></div></div>`;
      }
      case 'plan':
        return this.renderPlanCard(m.plan);
      case 'phase':
        return `<div class="harness-chat__row" ${idAttr}><div class="harness-chat__icon">·</div><div class="harness-chat__text">${escapeHtml(m.text ?? '')}</div></div>`;
      case 'error':
        return `<div class="harness-chat__row" ${idAttr}><div class="harness-chat__icon">⚠</div><div class="harness-chat__text" style="color:${harnessTokens.status.danger}">${escapeHtml(m.text ?? '')}</div></div>`;
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
      viewportContent = this.renderLogsTab();
    } else if (this.state.paneTab === 'files') {
      viewportContent = this.renderFilesTab();
    } else if (this.state.paneTab === 'image') {
      viewportContent = this.renderImageTab();
    } else if (this.state.paneTab === 'audio') {
      viewportContent = this.renderAudioTab();
    } else if (this.state.paneTab === 'db') {
      viewportContent = this.renderDatabaseTab();
    } else if (this.state.paneTab === 'request') {
      viewportContent = this.renderRequestTab();
    } else if (this.state.paneTab === 'deploy') {
      viewportContent = this.renderDeployTab();
    } else if (this.state.paneTab === 'code') {
      viewportContent = this.renderCodeTab();
    } else if (this.state.paneTab === 'ship') {
      viewportContent = this.renderShipTab();
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
      // The iframe loads the auth-proxied preview URL. Wrap it in a
      // .harness-device-frame so the scale/scroll modes (set on the
      // viewport via .is-scale / .is-scroll) can size it predictably.
      viewportContent = `<div class="harness-device-frame"><iframe src="${escapeHtml(previewSrc)}" title="App preview" sandbox="allow-scripts allow-same-origin allow-forms"></iframe></div>`;
    }

    const reloadLabel = this.state.preview.lastReloadMs
      ? `last reload ${(this.state.preview.lastReloadMs / 1000).toFixed(1)}s ago`
      : '–';

    // The Fit/Scroll mode pill only makes sense when an actual preview is
    // showing — hide it on tabs like code/files/ship.
    const showViewModePill = this.state.paneTab === 'preview' && !!previewSrc && this.state.preview.status === 'live';
    const viewportClass = this.state.paneTab === 'preview' && !!previewSrc && this.state.preview.status === 'live'
      ? `harness-preview__viewport is-${this.state.viewMode}`
      : 'harness-preview__viewport';

    return `
      <section class="harness-preview" aria-label="Live preview">
        <div class="harness-preview__toolbar">
          <div class="harness-preview__platform" role="tablist" aria-label="Platform">
            <button data-action="platform" data-platform="web"     aria-pressed="${this.state.platform === 'web'}">🌐 Web</button>
            <button data-action="platform" data-platform="ios"     aria-pressed="${this.state.platform === 'ios'}">📱 iOS</button>
            <button data-action="platform" data-platform="android" aria-pressed="${this.state.platform === 'android'}">🤖 Android</button>
          </div>
          ${showViewModePill ? `<div class="harness-preview__viewmode" role="tablist" aria-label="Preview view mode">
            <button data-action="view-mode" data-view-mode="scale"  aria-pressed="${this.state.viewMode === 'scale'}"  title="Scale phone to fit the column">⬛ Fit</button>
            <button data-action="view-mode" data-view-mode="scroll" aria-pressed="${this.state.viewMode === 'scroll'}" title="Scroll inside the pane">↕ Scroll</button>
          </div>` : ''}
          <span class="harness-preview__spacer"></span>
          <button class="harness-preview__action" data-action="refresh"    aria-label="Refresh"   type="button">↻</button>
          <button class="harness-preview__action" data-action="fullscreen" aria-label="Fullscreen" type="button">⛶</button>
          <button class="harness-preview__action" data-action="phone"      aria-label="Open on phone" type="button">📲</button>
        </div>
        <div class="${viewportClass}" data-view-mode="${this.state.viewMode}">${viewportContent}</div>
        <div class="harness-preview__statusbar">
          <span class="harness-status-dot" data-state="${this.state.preview.status === 'live' ? 'awake' : this.state.preview.status === 'waking' ? 'waking' : this.state.preview.status === 'error' ? 'error' : ''}"></span>
          <span>${this.formatPreviewStatus()}</span>
          <span class="harness-preview__spacer"></span>
          <span>${escapeHtml(reloadLabel)}</span>
        </div>
      </section>
    `;
  }

  private renderCodeTab(): string {
    const project = this.activeProject();
    if (!project) {
      return `<div class="harness-pane-empty">Select a project to view its code.</div>`;
    }
    const files = (project.files ?? []).filter((f) => !f.startsWith('.meta/') && !f.startsWith('node_modules/') && !f.startsWith('dist/')).sort();
    const fileListHtml = files.length
      ? files.map((f) => {
          const active = this.state.codeOpenPath === f ? ' is-active' : '';
          return `<button class="harness-file-row${active}" data-action="code-open" data-path="${escapeHtml(f)}" type="button">${escapeHtml(f)}</button>`;
        }).join('')
      : '<div class="harness-pane-empty" style="padding:12px;font-size:12px;">No files yet — generate some via chat.</div>';

    const dirty = this.state.codeIsDirty;
    const hasFile = !!this.state.codeOpenPath;

    return `<div class="harness-code-tab">
      <div class="harness-code-files">${fileListHtml}</div>
      <div class="harness-code-editor">
        <div class="harness-code-toolbar">
          <span class="harness-code-path">${escapeHtml(this.state.codeOpenPath ?? '(no file)')}${dirty ? ' •' : ''}</span>
          <span class="harness-preview__spacer"></span>
          <button class="harness-input-button" data-action="code-save" type="button" ${!hasFile || !dirty ? 'disabled' : ''}>Save</button>
        </div>
        ${hasFile
          ? `<textarea class="harness-code-textarea" data-input="code-content" spellcheck="false">${escapeHtml(this.state.codeContent)}</textarea>`
          : `<div class="harness-pane-empty">Click a file on the left to open it.</div>`}
      </div>
    </div>`;
  }

  private renderShipTab(): string {
    const project = this.activeProject();
    if (!project) {
      return `<div class="harness-pane-empty">Select a project to ship.</div>`;
    }
    const ship = this.state.ship;

    const buildCard = `<div class="harness-ship-card">
      <h3>Build for stores</h3>
      <p class="harness-ship-sub">EAS produces an .ipa for iOS and an .aab for Android.</p>
      <div class="harness-ship-actions">
        <button class="harness-input-button" data-action="ship-build" data-platform="ios"     type="button" ${ship.buildStatus === 'in_progress' ? 'disabled' : ''}>Build iOS</button>
        <button class="harness-input-button" data-action="ship-build" data-platform="android" type="button" ${ship.buildStatus === 'in_progress' ? 'disabled' : ''}>Build Android</button>
        <button class="harness-input-button" data-action="ship-build" data-platform="all"     type="button" ${ship.buildStatus === 'in_progress' ? 'disabled' : ''}>Build both</button>
      </div>
      <div class="harness-ship-status">Status: ${escapeHtml(ship.buildStatus)}${ship.buildEasId ? ` · build ${escapeHtml(ship.buildEasId.slice(0, 8))}` : ''}${ship.buildError ? ` · ${escapeHtml(ship.buildError.slice(0, 200))}` : ''}</div>
      ${ship.buildArtifacts?.ios     ? `<div class="harness-ship-artifact"><a href="${escapeHtml(ship.buildArtifacts.ios)}"     target="_blank" rel="noopener">Download .ipa</a></div>` : ''}
      ${ship.buildArtifacts?.android ? `<div class="harness-ship-artifact"><a href="${escapeHtml(ship.buildArtifacts.android)}" target="_blank" rel="noopener">Download .aab</a></div>` : ''}
    </div>`;

    const listingCard = `<div class="harness-ship-card">
      <h3>Store listing</h3>
      <p class="harness-ship-sub">LLM-generated title, subtitle, description, keywords, category.</p>
      <div class="harness-ship-actions">
        <button class="harness-input-button" data-action="ship-listing" type="button" ${ship.listingStatus === 'generating' ? 'disabled' : ''}>${ship.listing ? 'Regenerate' : 'Generate listing'}</button>
      </div>
      <div class="harness-ship-status">Status: ${escapeHtml(ship.listingStatus)}${ship.listingError ? ` · ${escapeHtml(ship.listingError.slice(0, 200))}` : ''}</div>
      ${ship.listing ? `<div class="harness-ship-listing">
        <div><strong>${escapeHtml(ship.listing.name)}</strong> — <em>${escapeHtml(ship.listing.subtitle)}</em></div>
        <div class="harness-ship-listing-desc">${escapeHtml(ship.listing.description.slice(0, 600))}${ship.listing.description.length > 600 ? '…' : ''}</div>
        <div class="harness-ship-listing-meta">Keywords: ${escapeHtml(ship.listing.keywords)} · Category: ${escapeHtml(ship.listing.category)}</div>
      </div>` : ''}
    </div>`;

    const checklistRowsHtml = (ship.preflightChecklist ?? []).map((item) => {
      const icon = item.status === 'pass' ? '✅' : item.status === 'warn' ? '⚠' : '❌';
      return `<div class="harness-ship-check"><span>${icon}</span><span>${escapeHtml(item.label)}${item.detail ? ` — ${escapeHtml(item.detail)}` : ''}</span></div>`;
    }).join('');
    const canSubmit = ship.preflightStatus === 'ready' && ship.buildEasId;
    const submitCard = `<div class="harness-ship-card">
      <h3>Submit to App Store / Play Store</h3>
      <p class="harness-ship-sub">Pre-flight runs Hook 9. After all checks pass, Confirm runs eas submit.</p>
      <div class="harness-ship-actions">
        <button class="harness-input-button" data-action="ship-preflight" data-platform="ios"     type="button">Pre-flight iOS</button>
        <button class="harness-input-button" data-action="ship-preflight" data-platform="android" type="button">Pre-flight Android</button>
      </div>
      ${ship.preflightChecklist ? `<div class="harness-ship-checklist">${checklistRowsHtml}</div>` : ''}
      ${ship.preflightChecklist ? `<div class="harness-ship-actions">
        <button class="harness-input-button harness-input-button--send" data-action="ship-submit" data-platform="${ship.preflightPlatform}" type="button" ${canSubmit ? '' : 'disabled'}>${canSubmit ? `Confirm submit (${ship.preflightPlatform})` : 'Pre-flight must pass first'}</button>
      </div>` : ''}
      <div class="harness-ship-status">Status: ${escapeHtml(ship.submitStatus)}${ship.submitResult?.errorMessage ? ` · ${escapeHtml(ship.submitResult.errorMessage.slice(0, 200))}` : ''}${ship.submitResult?.submissionId ? ` · submission ${escapeHtml(ship.submitResult.submissionId.slice(0, 8))}` : ''}</div>
    </div>`;

    const crashesCard = `<div class="harness-ship-card">
      <h3>Crashes</h3>
      <p class="harness-ship-sub">Sentry-reported runtime crashes for this project.</p>
      ${ship.crashes.length === 0
        ? `<div class="harness-pane-empty" style="padding:8px;font-size:12px;">No crashes reported. ✓</div>`
        : ship.crashes.slice(0, 10).map((c) => `<div class="harness-ship-crash"><strong>${escapeHtml(c.platform)}</strong> · ${escapeHtml(c.errorMessage.slice(0, 200))} <span style="opacity:.6;">${escapeHtml(c.observedAt)}</span></div>`).join('')}
    </div>`;

    const costCard = ship.cost ? `<div class="harness-ship-card">
      <h3>Cost & observability</h3>
      <p class="harness-ship-sub">Today: $${ship.cost.todayUsd.toFixed(4)} of $${ship.cost.dailyLimitUsd.toFixed(2)} daily limit.</p>
    </div>` : '';

    return `<div class="harness-ship-tab">
      ${buildCard}
      ${listingCard}
      ${submitCard}
      ${crashesCard}
      ${costCard}
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // G2.B — Workspace tabs (Files · Image · Audio · Database)
  // ---------------------------------------------------------------------------

  private renderFilesTab(): string {
    const project = this.activeProject();
    if (!project) return `<div class="harness-pane-empty">Select a project to view its files.</div>`;
    const allFiles = (project.files ?? []).filter((f) => !f.startsWith('.meta/') && !f.startsWith('node_modules/') && !f.startsWith('dist/'));
    const search = this.state.filesSearch.toLowerCase();
    const filter = this.state.filesFilter;
    const filtered = allFiles.filter((f) => {
      if (search && !f.toLowerCase().includes(search)) return false;
      if (filter === 'all') return true;
      const lower = f.toLowerCase();
      switch (filter) {
        case 'code':   return /\.(ts|tsx|js|jsx|json|md|css|html)$/.test(lower);
        case 'image':  return /\.(png|jpg|jpeg|gif|svg|webp|ico)$/.test(lower);
        case 'audio':  return /\.(mp3|wav|m4a|ogg|aac|flac)$/.test(lower);
        case 'data':   return /\.(json|csv|xml|yaml|yml|sqlite|db)$/.test(lower);
        case 'config': return /(\.env|\.config|app\.json|eas\.json|package\.json|tsconfig|babel\.config|metro\.config)/.test(lower);
        default: return true;
      }
    }).sort();

    const filterPills = ['all', 'code', 'image', 'audio', 'data', 'config'].map((f) =>
      `<button class="harness-pane-filter" data-action="files-filter" data-filter="${f}" aria-pressed="${filter === f}" type="button">${f}</button>`
    ).join('');

    const fileRows = filtered.length === 0
      ? `<div class="harness-pane-empty" style="padding:18px;font-size:13px;">No files match.</div>`
      : filtered.map((f) => {
          const ext = f.split('.').pop() ?? '';
          const icon = iconForExt(ext);
          return `<button class="harness-file-row" data-action="file-open" data-path="${escapeHtml(f)}" type="button">
            <span class="harness-file-row__icon">${icon}</span>
            <span class="harness-file-row__path">${escapeHtml(f)}</span>
          </button>`;
        }).join('');

    return `<div class="harness-files-tab">
      <div class="harness-pane-toolbar">
        <input class="harness-pane-search" data-input="files-search" placeholder="Search files…" value="${escapeHtml(this.state.filesSearch)}" type="search" />
        <span class="harness-preview__spacer"></span>
        <span class="harness-pane-meta">${filtered.length} of ${allFiles.length}</span>
      </div>
      <div class="harness-pane-filters">${filterPills}</div>
      <div class="harness-pane-list">${fileRows}</div>
    </div>`;
  }

  private renderImageTab(): string {
    const project = this.activeProject();
    if (!project) return `<div class="harness-pane-empty">Select a project to manage images.</div>`;
    const all = (project.files ?? []).filter((f) => /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(f));
    const grid = all.length === 0
      ? `<div class="harness-pane-empty" style="padding:18px;font-size:13px;">No images yet — generate one with the prompt above.</div>`
      : `<div class="harness-image-grid">${all.map((path) => `
          <div class="harness-image-tile">
            <button class="harness-image-tile__preview" data-action="file-open" data-path="${escapeHtml(path)}" type="button" title="Open in Code">
              <span class="harness-image-tile__icon">🖼</span>
            </button>
            <div class="harness-image-tile__path">${escapeHtml(path)}</div>
            <div class="harness-image-tile__actions">
              <button class="harness-input-button" data-action="image-use-icon" data-path="${escapeHtml(path)}" type="button" title="Set as app icon">As icon</button>
              <button class="harness-input-button" data-action="image-use-app"  data-path="${escapeHtml(path)}" type="button" title="Insert reference into Code">Use in app</button>
            </div>
          </div>
        `).join('')}</div>`;

    const generating = this.state.imageGenerating;
    return `<div class="harness-image-tab">
      <div class="harness-pane-toolbar">
        <input class="harness-pane-search" data-input="image-prompt" placeholder="Describe an image to generate…" value="${escapeHtml(this.state.imagePrompt)}" />
        <button class="harness-input-button harness-input-button--send" data-action="image-generate" type="button" ${generating ? 'disabled' : ''}>${generating ? 'Generating…' : 'Generate'}</button>
      </div>
      ${grid}
    </div>`;
  }

  private renderAudioTab(): string {
    const project = this.activeProject();
    if (!project) return `<div class="harness-pane-empty">Select a project to manage audio.</div>`;
    const all = (project.files ?? []).filter((f) => /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(f));
    const list = all.length === 0
      ? `<div class="harness-pane-empty" style="padding:18px;font-size:13px;">No audio yet — record a clip or generate TTS above.</div>`
      : all.map((path) => `
          <div class="harness-audio-row">
            <button class="harness-audio-row__path" data-action="file-open" data-path="${escapeHtml(path)}" type="button" title="Open in Code">🔊 ${escapeHtml(path)}</button>
            <div class="harness-audio-row__actions">
              <button class="harness-input-button" data-action="audio-wire" data-path="${escapeHtml(path)}" type="button" title="Wire to an event in Code">Wire to event</button>
            </div>
          </div>
        `).join('');

    return `<div class="harness-audio-tab">
      <div class="harness-pane-toolbar">
        <input class="harness-pane-search" data-input="audio-prompt" placeholder="Describe a sound (TTS / SFX)…" value="${escapeHtml(this.state.audioPrompt)}" />
        <button class="harness-input-button" data-action="audio-tts" type="button">Generate TTS</button>
        <button class="harness-input-button" data-action="audio-record" type="button">Record</button>
      </div>
      <div class="harness-pane-list">${list}</div>
    </div>`;
  }

  private renderDatabaseTab(): string {
    const project = this.activeProject();
    if (!project) return `<div class="harness-pane-empty">Select a project to view its data.</div>`;
    const tables = this.state.dbTables;
    if (tables.length === 0) {
      // Surface common data files that look schema-like as a fallback so
      // users can still see *something* even before the backend wires up.
      const dataFiles = (project.files ?? []).filter((f) => /\.(json|csv|sqlite|db)$/i.test(f) && !f.includes('package.json') && !f.includes('eas.json') && !f.includes('app.json') && !f.includes('tsconfig'));
      if (dataFiles.length === 0) {
        return `<div class="harness-pane-empty">No tables detected yet. Use chat: "create a table for high scores".</div>`;
      }
      const rows = dataFiles.map((f) => `<button class="harness-file-row" data-action="file-open" data-path="${escapeHtml(f)}" type="button"><span class="harness-file-row__icon">🗄</span><span class="harness-file-row__path">${escapeHtml(f)}</span></button>`).join('');
      return `<div class="harness-db-tab">
        <div class="harness-pane-toolbar">
          <span class="harness-pane-meta">No live schema yet — showing detected data files</span>
        </div>
        <div class="harness-pane-list">${rows}</div>
      </div>`;
    }
    return `<div class="harness-db-tab">
      <div class="harness-pane-toolbar">
        <span class="harness-pane-meta">${tables.length} table${tables.length === 1 ? '' : 's'}</span>
      </div>
      <div class="harness-pane-list">
        ${tables.map((t) => `
          <div class="harness-db-table">
            <div class="harness-db-table__header">
              <strong>${escapeHtml(t.name)}</strong>
              <span class="harness-pane-meta">${t.rowCount} row${t.rowCount === 1 ? '' : 's'} · ${escapeHtml(t.source)}</span>
            </div>
            <div class="harness-db-table__cols">${t.columns.map((c) => `<span class="harness-db-col">${escapeHtml(c)}</span>`).join('')}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // G2.C — Observe (Logs · Request)
  // ---------------------------------------------------------------------------

  private renderLogsTab(): string {
    const search = this.state.logsSearch.toLowerCase();
    const filter = this.state.logsFilter;
    const filtered = this.state.logs.filter((l) => {
      if (filter !== 'all' && l.level !== filter) return false;
      if (search && !l.text.toLowerCase().includes(search)) return false;
      return true;
    });
    const filterPills = ['all', 'info', 'warn', 'error', 'debug'].map((f) =>
      `<button class="harness-pane-filter" data-action="logs-filter" data-filter="${f}" aria-pressed="${filter === f}" type="button">${f}</button>`
    ).join('');
    const lines = filtered.length === 0
      ? `<div class="harness-pane-empty" style="padding:18px;font-size:13px;">No logs yet. They stream here while the agent runs and the sandbox boots.</div>`
      : filtered.slice(-500).map((l) => `
          <div class="harness-log-line harness-log-line--${l.level}" data-trace-id="${escapeHtml(l.traceId ?? '')}">
            <span class="harness-log-time">${formatTime(l.ts)}</span>
            <span class="harness-log-level harness-log-level--${l.level}">${l.level}</span>
            <span class="harness-log-source">${escapeHtml(l.source)}</span>
            <span class="harness-log-text">${escapeHtml(l.text)}</span>
            <button class="harness-log-ask" data-action="ask-ai-log" data-log-id="${escapeHtml(l.id)}" title="Ask AI about this line" type="button">Ask AI</button>
          </div>
        `).join('');
    return `<div class="harness-logs-tab">
      <div class="harness-pane-toolbar">
        <input class="harness-pane-search" data-input="logs-search" placeholder="Search logs…" value="${escapeHtml(this.state.logsSearch)}" type="search" />
        <span class="harness-preview__spacer"></span>
        <span class="harness-pane-meta">${filtered.length} of ${this.state.logs.length}</span>
      </div>
      <div class="harness-pane-filters">${filterPills}</div>
      <div class="harness-pane-list harness-logs-list">${lines}</div>
    </div>`;
  }

  private renderRequestTab(): string {
    const search = this.state.requestsSearch.toLowerCase();
    const filter = this.state.requestsFilter;
    const filtered = this.state.requests.filter((r) => {
      if (search && !`${r.method} ${r.url}`.toLowerCase().includes(search)) return false;
      if (filter === '2xx' && (r.status < 200 || r.status >= 300)) return false;
      if (filter === '4xx' && (r.status < 400 || r.status >= 500)) return false;
      if (filter === '5xx' && (r.status < 500 || r.status >= 600)) return false;
      return true;
    });
    const filterPills = ['all', '2xx', '4xx', '5xx'].map((f) =>
      `<button class="harness-pane-filter" data-action="requests-filter" data-filter="${f}" aria-pressed="${filter === f}" type="button">${f}</button>`
    ).join('');

    const selected = this.state.requests.find((r) => r.id === this.state.selectedRequestId);
    const list = filtered.length === 0
      ? `<div class="harness-pane-empty" style="padding:18px;font-size:13px;">No requests captured yet.</div>`
      : filtered.slice(-200).map((r) => {
          const statusClass = r.status >= 500 ? 'err' : r.status >= 400 ? 'warn' : r.status >= 200 ? 'ok' : 'pending';
          const sel = r.id === this.state.selectedRequestId ? ' is-active' : '';
          return `<button class="harness-req-row${sel}" data-action="request-select" data-request-id="${escapeHtml(r.id)}" type="button">
            <span class="harness-req-method">${escapeHtml(r.method)}</span>
            <span class="harness-req-status harness-req-status--${statusClass}">${r.status}</span>
            <span class="harness-req-url">${escapeHtml(r.url)}</span>
            <span class="harness-req-ms">${r.ms}ms</span>
          </button>`;
        }).join('');

    const detail = selected ? `<div class="harness-req-detail">
      <div class="harness-req-detail__header">
        <strong>${escapeHtml(selected.method)} ${escapeHtml(selected.url)}</strong>
        <span class="harness-pane-meta">${selected.status} · ${selected.ms}ms · ${formatTime(selected.ts)}${selected.traceId ? ` · trace ${escapeHtml(selected.traceId.slice(0, 8))}` : ''}</span>
      </div>
      ${selected.reqBody ? `<details open><summary>Request body</summary><pre>${escapeHtml(selected.reqBody.slice(0, 4000))}</pre></details>` : ''}
      ${selected.resBody ? `<details><summary>Response body</summary><pre>${escapeHtml(selected.resBody.slice(0, 4000))}</pre></details>` : ''}
      <div class="harness-req-detail__actions">
        <button class="harness-input-button" data-action="request-replay" data-request-id="${escapeHtml(selected.id)}" type="button">Replay</button>
        ${selected.byMessageId ? `<button class="harness-input-button" data-action="link-back" data-message-id="${escapeHtml(selected.byMessageId)}" type="button">← made by</button>` : ''}
      </div>
    </div>` : '';

    return `<div class="harness-request-tab">
      <div class="harness-pane-toolbar">
        <input class="harness-pane-search" data-input="requests-search" placeholder="Search method or URL…" value="${escapeHtml(this.state.requestsSearch)}" type="search" />
        <span class="harness-preview__spacer"></span>
        <span class="harness-pane-meta">${filtered.length} of ${this.state.requests.length}</span>
      </div>
      <div class="harness-pane-filters">${filterPills}</div>
      <div class="harness-request-split">
        <div class="harness-pane-list">${list}</div>
        ${detail}
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // G2.D — Deploy (snapshot + rollback)
  // ---------------------------------------------------------------------------

  private renderDeployTab(): string {
    const project = this.activeProject();
    if (!project) return `<div class="harness-pane-empty">Select a project to deploy.</div>`;
    const snaps = this.state.deploySnapshots;
    const env = this.state.deployActiveEnv;
    const live = snaps.find((s) => s.status === 'live' && s.env === env);

    const envPill = `<div class="harness-preview__viewmode" role="tablist" aria-label="Environment">
      <button data-action="deploy-env" data-env="preview" aria-pressed="${env === 'preview'}" type="button">Preview</button>
      <button data-action="deploy-env" data-env="prod"    aria-pressed="${env === 'prod'}"    type="button">Production</button>
    </div>`;

    const head = `<div class="harness-ship-card">
      <h3>Deploy snapshot</h3>
      <p class="harness-ship-sub">Each deploy captures Code + Files + DB at a point in time. Roll back to any version with one click.</p>
      <div class="harness-ship-actions">
        ${envPill}
        <button class="harness-input-button harness-input-button--send" data-action="deploy-now" data-env="${env}" type="button">Deploy ${env}</button>
      </div>
      ${live ? `<div class="harness-ship-status">Live: ${escapeHtml(live.version)} · ${formatTime(live.createdAt)}${live.bundleHash ? ` · ${escapeHtml(live.bundleHash.slice(0, 10))}` : ''}</div>` : `<div class="harness-ship-status">No active ${env} deploy yet.</div>`}
    </div>`;

    const versionsBody = snaps.length === 0
      ? `<div class="harness-pane-empty" style="padding:18px;font-size:13px;">No snapshots yet.</div>`
      : snaps.filter((s) => s.env === env).map((s) => `
          <div class="harness-deploy-snap">
            <div class="harness-deploy-snap__head">
              <strong>${escapeHtml(s.version)}</strong>
              <span class="harness-pane-meta">${formatTime(s.createdAt)}${s.commitSha ? ` · ${escapeHtml(s.commitSha.slice(0, 7))}` : ''}${s.sizeBytes ? ` · ${humanSize(s.sizeBytes)}` : ''}</span>
              <span class="harness-deploy-snap__status harness-deploy-snap__status--${s.status}">${s.status}</span>
            </div>
            <div class="harness-deploy-snap__actions">
              ${s.ipaUrl ? `<a class="harness-input-button" href="${escapeHtml(s.ipaUrl)}" target="_blank" rel="noopener">.ipa</a>` : ''}
              ${s.aabUrl ? `<a class="harness-input-button" href="${escapeHtml(s.aabUrl)}" target="_blank" rel="noopener">.aab</a>` : ''}
              ${s.status !== 'live' ? `<button class="harness-input-button" data-action="deploy-rollback" data-snap-id="${escapeHtml(s.id)}" type="button">Rollback</button>` : ''}
            </div>
          </div>
        `).join('');

    return `<div class="harness-deploy-tab">
      ${head}
      <div class="harness-ship-card">
        <h3>Versions (${env})</h3>
        <div class="harness-pane-list">${versionsBody}</div>
      </div>
    </div>`;
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
        case 'thinking-toggle':
          this.setState({ thinking: { ...this.state.thinking, collapsed: !this.state.thinking.collapsed } });
          break;
        case 'pane-tab': {
          const tab = actionEl.dataset.paneTab as 'preview' | 'logs' | 'files' | 'code' | 'ship' | 'image' | 'audio' | 'db' | 'request' | 'deploy';
          if (tab) this.callbacks.onPaneTab(tab);
          break;
        }
        case 'view-mode': {
          const mode = actionEl.dataset.viewMode as 'scale' | 'scroll';
          if (mode && (mode === 'scale' || mode === 'scroll')) {
            this.setState({ viewMode: mode });
          }
          break;
        }
        case 'code-open': {
          const path = actionEl.dataset.path;
          if (path && this.callbacks.onCodeFileOpen) this.callbacks.onCodeFileOpen(path);
          break;
        }
        case 'code-save': {
          if (this.state.codeOpenPath && this.callbacks.onCodeSave) {
            this.callbacks.onCodeSave(this.state.codeOpenPath, this.state.codeContent);
          }
          break;
        }
        case 'ship-build': {
          const platform = (actionEl.dataset.platform as 'ios' | 'android' | 'all') ?? 'all';
          if (this.callbacks.onBuild) this.callbacks.onBuild(platform);
          break;
        }
        case 'ship-listing': {
          if (this.callbacks.onGenerateListing) this.callbacks.onGenerateListing();
          break;
        }
        case 'ship-preflight': {
          const platform = (actionEl.dataset.platform as 'ios' | 'android') ?? 'ios';
          if (this.callbacks.onPreflight) this.callbacks.onPreflight(platform);
          break;
        }
        case 'ship-submit': {
          const platform = (actionEl.dataset.platform as 'ios' | 'android') ?? 'ios';
          const easBuildId = this.state.ship.buildEasId;
          if (easBuildId && this.callbacks.onSubmitConfirm) {
            this.callbacks.onSubmitConfirm(platform, easBuildId);
          }
          break;
        }
        case 'modal-close':
          // Ignore clicks on the inner card.
          if ((target as HTMLElement).closest('[data-stop-propagation]') && actionEl.classList.contains('harness-modal__backdrop')) {
            return;
          }
          this.callbacks.onModalClose();
          break;
        case 'files-filter': {
          const f = actionEl.dataset.filter as HarnessStudioState['filesFilter'];
          if (f) this.setState({ filesFilter: f });
          break;
        }
        case 'file-open': {
          const path = actionEl.dataset.path;
          if (path) {
            // Opening from any tab routes to Code with that file loaded.
            this.callbacks.onPaneTab('code');
            if (this.callbacks.onCodeFileOpen) this.callbacks.onCodeFileOpen(path);
            if (this.callbacks.onFileOpen) this.callbacks.onFileOpen(path);
          }
          break;
        }
        case 'image-generate': {
          const prompt = (root.querySelector<HTMLInputElement>('[data-input="image-prompt"]')?.value ?? this.state.imagePrompt).trim();
          if (prompt && this.callbacks.onImageGenerate) {
            this.callbacks.onImageGenerate(prompt);
          }
          break;
        }
        case 'image-use-icon': {
          const path = actionEl.dataset.path;
          if (path && this.callbacks.onImageUseAsIcon) this.callbacks.onImageUseAsIcon(path);
          break;
        }
        case 'image-use-app': {
          const path = actionEl.dataset.path;
          if (path && this.callbacks.onImageUseInApp) this.callbacks.onImageUseInApp(path);
          break;
        }
        case 'audio-tts': {
          const prompt = (root.querySelector<HTMLInputElement>('[data-input="audio-prompt"]')?.value ?? this.state.audioPrompt).trim();
          if (prompt && this.callbacks.onAudioTts) this.callbacks.onAudioTts(prompt);
          break;
        }
        case 'audio-record':
          if (this.callbacks.onAudioRecord) this.callbacks.onAudioRecord();
          break;
        case 'audio-wire': {
          const path = actionEl.dataset.path;
          if (path && this.callbacks.onAudioWire) this.callbacks.onAudioWire(path);
          break;
        }
        case 'logs-filter': {
          const f = actionEl.dataset.filter as HarnessStudioState['logsFilter'];
          if (f) this.setState({ logsFilter: f });
          break;
        }
        case 'requests-filter': {
          const f = actionEl.dataset.filter as HarnessStudioState['requestsFilter'];
          if (f) this.setState({ requestsFilter: f });
          break;
        }
        case 'request-select': {
          const id = actionEl.dataset.requestId;
          if (id) this.setState({ selectedRequestId: id });
          break;
        }
        case 'request-replay': {
          const id = actionEl.dataset.requestId;
          if (id && this.callbacks.onRequestReplay) this.callbacks.onRequestReplay(id);
          break;
        }
        case 'ask-ai-log': {
          const logId = actionEl.dataset.logId;
          if (logId && this.callbacks.onAskAiAboutLog) this.callbacks.onAskAiAboutLog(logId);
          break;
        }
        case 'deploy-env': {
          const env = actionEl.dataset.env as 'preview' | 'prod';
          if (env) this.setState({ deployActiveEnv: env });
          break;
        }
        case 'deploy-now': {
          const env = (actionEl.dataset.env as 'preview' | 'prod') ?? 'preview';
          if (this.callbacks.onDeployNow) this.callbacks.onDeployNow(env);
          break;
        }
        case 'deploy-rollback': {
          const snapId = actionEl.dataset.snapId;
          if (snapId && this.callbacks.onDeployRollback) this.callbacks.onDeployRollback(snapId);
          break;
        }
        case 'link-back': {
          const messageId = actionEl.dataset.messageId;
          if (messageId && this.callbacks.onLinkBackToMessage) this.callbacks.onLinkBackToMessage(messageId);
          break;
        }
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

    // Code-tab editor: track input changes and notify controller.
    const codeTa = root.querySelector<HTMLTextAreaElement>('[data-input="code-content"]');
    if (codeTa) {
      codeTa.addEventListener('input', () => {
        const path = this.state.codeOpenPath;
        if (path && this.callbacks.onCodeContentChange) {
          this.callbacks.onCodeContentChange(path, codeTa.value);
        }
      });
    }

    // Files-search / logs-search / requests-search — debounced state updates.
    const filesSearch = root.querySelector<HTMLInputElement>('[data-input="files-search"]');
    if (filesSearch) {
      filesSearch.addEventListener('input', () => {
        this.state.filesSearch = filesSearch.value;
        // Cheap re-render: update the visible list region without re-binding everything.
        // Full re-render is fine here since the lists are small.
        this.render();
        const next = this.container.querySelector<HTMLInputElement>('[data-input="files-search"]');
        if (next) { next.focus(); next.setSelectionRange(filesSearch.value.length, filesSearch.value.length); }
      });
    }
    const logsSearch = root.querySelector<HTMLInputElement>('[data-input="logs-search"]');
    if (logsSearch) {
      logsSearch.addEventListener('input', () => {
        this.state.logsSearch = logsSearch.value;
        this.render();
        const next = this.container.querySelector<HTMLInputElement>('[data-input="logs-search"]');
        if (next) { next.focus(); next.setSelectionRange(logsSearch.value.length, logsSearch.value.length); }
      });
    }
    const requestsSearch = root.querySelector<HTMLInputElement>('[data-input="requests-search"]');
    if (requestsSearch) {
      requestsSearch.addEventListener('input', () => {
        this.state.requestsSearch = requestsSearch.value;
        this.render();
        const next = this.container.querySelector<HTMLInputElement>('[data-input="requests-search"]');
        if (next) { next.focus(); next.setSelectionRange(requestsSearch.value.length, requestsSearch.value.length); }
      });
    }
    const imagePrompt = root.querySelector<HTMLInputElement>('[data-input="image-prompt"]');
    if (imagePrompt) {
      imagePrompt.addEventListener('input', () => {
        this.state.imagePrompt = imagePrompt.value;
      });
    }
    const audioPrompt = root.querySelector<HTMLInputElement>('[data-input="audio-prompt"]');
    if (audioPrompt) {
      audioPrompt.addEventListener('input', () => {
        this.state.audioPrompt = audioPrompt.value;
      });
    }

    // Auto-scroll the chat to the bottom on each render.
    const stream = root.querySelector<HTMLElement>('[data-region="messages"]');
    if (stream) {
      requestAnimationFrame(() => { stream.scrollTop = stream.scrollHeight; });
    }

    // Preview pane scale-to-fit. In `is-scale` mode we render a 390x844
    // device frame and scale it down to fit the viewport. The CSS variable
    // `--harness-scale` is set on the viewport from a ResizeObserver so the
    // phone reflows when the column resizes (window resize, dev tools open,
    // etc.). In `is-scroll` mode we leave it alone — the viewport scrolls.
    const viewport = root.querySelector<HTMLElement>('.harness-preview__viewport.is-scale');
    if (viewport) {
      const fit = (): void => {
        const rect = viewport.getBoundingClientRect();
        // Wait for layout — first measurements after innerHTML can be 0.
        if (rect.width <= 1 || rect.height <= 1) return;
        const FRAME_W = 390;
        const FRAME_H = 844;
        const PAD = 24; // breathing room
        const sx = (rect.width - PAD) / FRAME_W;
        const sy = (rect.height - PAD) / FRAME_H;
        // Take the smaller (so the frame fits both dimensions). Don't upscale
        // beyond 1.0 — at large screens we want the phone at native size.
        // Don't floor too high — at very narrow columns we still want to
        // show *something* even if it's small.
        let scale = Math.min(sx, sy, 1);
        if (!Number.isFinite(scale) || scale <= 0) scale = 1;
        if (scale < 0.3) scale = 0.3; // unreadably small below this
        viewport.style.setProperty('--harness-scale', String(scale));
      };
      // Run after layout settles.
      requestAnimationFrame(() => requestAnimationFrame(fit));
      // Reflow on column / window resize.
      const prior = (viewport as unknown as { __resizeObs?: ResizeObserver }).__resizeObs;
      prior?.disconnect();
      const ro = new ResizeObserver(() => fit());
      ro.observe(viewport);
      (viewport as unknown as { __resizeObs?: ResizeObserver }).__resizeObs = ro;
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

function iconForExt(ext: string): string {
  const e = ext.toLowerCase();
  if (['ts','tsx','js','jsx','mjs'].includes(e)) return '𝙏𝙎';
  if (['json','yaml','yml','xml','csv'].includes(e)) return '⌥';
  if (['md','txt'].includes(e)) return '📄';
  if (['png','jpg','jpeg','gif','svg','webp','ico'].includes(e)) return '🖼';
  if (['mp3','wav','m4a','ogg','aac','flac'].includes(e)) return '🔊';
  if (['css','scss','sass','less'].includes(e)) return '𝘾𝘚𝘚';
  if (['html','htm'].includes(e)) return '⟨⟩';
  if (['sqlite','db'].includes(e)) return '🗄';
  return '·';
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return iso;
  }
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
