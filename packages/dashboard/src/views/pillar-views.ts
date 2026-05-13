/**
 * Pillar Views — Functional views for all SeraphimOS dashboard pillars.
 *
 * Replaces PlaceholderView with real content panels + agent chat for:
 * Seraphim Core, Eretz Business, ZionX, ZXMG, Zion Alpha.
 *
 * Each view implements { mount(): Promise<void>; unmount(): void; }
 */

// Phase 12 — UX Enhancement Component Imports
import { VisualPipelineBoard, type VisualPipelineBoardData, type PipelineApp } from '../components/app-studio/VisualPipelineBoard.js';
import { RejectionCrisisPanel, type RejectionCrisisPanelData } from '../components/app-studio/RejectionCrisisPanel.js';
import { MarketOpportunityHeatmap, type MarketHeatmapData } from '../components/app-studio/MarketHeatmap.js';
import { ContentDiversityDashboard, type ContentDiversityData } from '../components/video-studio/ContentDiversityDashboard.js';
import { EndToEndProductionTracker, type ProductionTrackerData } from '../components/video-studio/ProductionTracker.js';
import { IntelligenceFeed, type IntelligenceFeedData } from '../components/command-center/IntelligenceFeed.js';
import { StandingOrdersPanel, type StandingOrdersPanelData } from '../components/command-center/StandingOrdersPanel.js';

// ---------------------------------------------------------------------------
// Base Chat View
// ---------------------------------------------------------------------------

abstract class BasePillarView {
  protected container: HTMLElement;
  protected messages: { role: string; text: string; timestamp?: string }[] = [];
  protected sessions: Array<{ id: string; messageCount: number; startedAt: string; preview: string; isCurrent: boolean }> = [];
  protected viewingSessionId: string | null = null; // null = current session
  protected currentSessionId: string = `session-${Date.now()}`; // stable ID for current chat
  protected abstract title: string;
  protected abstract agentName: string;
  protected abstract agentProgramId: string;
  protected abstract welcomeMessage: string;

  private static agentIdCache: Map<string, string> = new Map();
  private static readonly API_BASE = (window as any).__SERAPHIM_API_URL__?.replace(/\/api$/, '') || 'http://seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.messages = [];
    
    // Restore current session ID from localStorage if available
    try {
      const sessionKey = `seraphim-current-session-${this.agentProgramId}`;
      const savedSessionId = localStorage.getItem(sessionKey);
      if (savedSessionId) {
        this.currentSessionId = savedSessionId;
      } else {
        localStorage.setItem(sessionKey, this.currentSessionId);
      }
    } catch { /* ignore */ }
    
    this.render();

    // Load conversation history — try backend first, fall back to localStorage
    await this.loadConversationHistory();

    // If backend returned nothing, try localStorage cache
    if (this.messages.length === 0) {
      this.loadFromLocalStorage();
    }

    if (this.messages.length === 0) {
      this.messages = [{ role: 'agent', text: this.welcomeMessage }];
    }

    this.render();
    this.attachListeners();
  }

  unmount(): void {
    // Save to localStorage before unmounting so it persists across tab switches
    this.saveToLocalStorage();
    this.container.innerHTML = '';
    this.messages = [];
  }

  /** Save current conversation to localStorage for persistence across tab switches */
  private saveToLocalStorage(): void {
    try {
      const key = `seraphim-chat-${this.agentProgramId}`;
      const sessions = this.loadAllSessions();
      // Update current session
      const currentIdx = sessions.findIndex(s => s.id === this.currentSessionId);
      if (currentIdx >= 0) {
        sessions[currentIdx].messages = this.messages;
        sessions[currentIdx].updatedAt = new Date().toISOString();
      } else if (this.messages.length > 0 && this.messages[0]?.text !== this.welcomeMessage) {
        // Create new session entry
        sessions.unshift({
          id: this.currentSessionId,
          title: this.generateTitle(this.messages),
          messages: this.messages,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      localStorage.setItem(key, JSON.stringify(sessions));
    } catch { /* localStorage unavailable or full */ }
  }

  /** Load all sessions from localStorage */
  private loadAllSessions(): Array<{ id: string; title: string; messages: typeof this.messages; createdAt: string; updatedAt: string }> {
    try {
      const key = `seraphim-chat-${this.agentProgramId}`;
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const data = JSON.parse(raw);
      // Handle old format (single session with {messages, savedAt})
      if (data.messages && !Array.isArray(data[0])) {
        const msgs = data.messages as typeof this.messages;
        const firstUserMsg = msgs.find((m: any) => m.role === 'user');
        const title = firstUserMsg ? firstUserMsg.text.substring(0, 50) + (firstUserMsg.text.length > 50 ? '...' : '') : `Chat ${new Date(data.savedAt || Date.now()).toLocaleDateString()}`;
        return [{ id: 'migrated-' + Date.now(), title, messages: msgs, createdAt: data.savedAt || new Date().toISOString(), updatedAt: data.savedAt || new Date().toISOString() }];
      }
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  /** Load conversation from localStorage cache (current session) */
  private loadFromLocalStorage(): void {
    try {
      const sessions = this.loadAllSessions();
      const current = sessions.find(s => s.id === this.currentSessionId);
      if (current && current.messages.length > 0) {
        this.messages = current.messages;
      }
      // Populate sidebar sessions
      this.sessions = sessions.map(s => ({
        id: s.id,
        messageCount: s.messages.length,
        startedAt: s.createdAt,
        preview: s.title,
        isCurrent: s.id === this.currentSessionId,
      }));
    } catch { /* parse error or unavailable */ }
  }

  /** Generate a title from the first user message in a conversation */
  private generateTitle(messages: typeof this.messages): string {
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      return firstUserMsg.text.substring(0, 50) + (firstUserMsg.text.length > 50 ? '...' : '');
    }
    return `Chat ${new Date().toLocaleDateString()}`;
  }

  /** Archive current session and start a new one */
  private archiveAndStartNew(): void {
    // Save current session first
    this.saveToLocalStorage();
    // Generate new session ID
    this.currentSessionId = `session-${Date.now()}`;
    try { localStorage.setItem(`seraphim-current-session-${this.agentProgramId}`, this.currentSessionId); } catch { /* ignore */ }
    // Start fresh
    this.messages = [{ role: 'agent', text: this.welcomeMessage }];
    this.viewingSessionId = null;
    // Reload sessions list for sidebar
    this.loadFromLocalStorage();
    // Re-render
    this.render();
    this.attachListeners();
  }

  /** Load a specific session by ID — switch to it as the active conversation */
  private loadArchivedSession(sessionId: string): void {
    // Save current session first
    this.saveToLocalStorage();
    // Switch to the selected session (it becomes the active one)
    this.currentSessionId = sessionId;
    try { localStorage.setItem(`seraphim-current-session-${this.agentProgramId}`, this.currentSessionId); } catch { /* ignore */ }
    // Load its messages
    const sessions = this.loadAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      this.messages = session.messages;
    } else {
      this.messages = [{ role: 'agent', text: this.welcomeMessage }];
    }
    this.viewingSessionId = null; // Not "viewing" — it's now the active session
    this.loadFromLocalStorage(); // Refresh sidebar
    this.render();
    this.attachListeners();
  }

  /** Load conversation history from the backend (Zikaron episodic memory). */
  protected async loadConversationHistory(): Promise<void> {
    try {
      let agentId = BasePillarView.agentIdCache.get(this.agentProgramId);
      if (!agentId) {
        const agentsRes = await fetch(`${BasePillarView.API_BASE}/api/agents`);
        if (agentsRes.ok) {
          const data = await agentsRes.json();
          for (const agent of (data.agents || [])) {
            BasePillarView.agentIdCache.set(agent.programId, agent.id);
          }
          agentId = BasePillarView.agentIdCache.get(this.agentProgramId);
        }
      }
      if (!agentId) return;

      const res = await fetch(`${BasePillarView.API_BASE}/api/agents/${agentId}/conversations`);
      if (!res.ok) return;

      const data = await res.json();
      this.sessions = data.sessions || [];

      // Load current session messages
      const currentMessages: Array<{ role: string; content: string; timestamp?: string }> = data.currentMessages || [];
      this.messages = currentMessages.map((m) => ({
        role: m.role === 'assistant' ? 'agent' : 'user',
        text: m.content,
        timestamp: m.timestamp,
      }));
    } catch {
      // Failed to load — start fresh
    }
  }

  /** Send a message to the agent via the backend API */
  protected async sendToAgent(message: string): Promise<string> {
    try {
      const API_BASE = (window as any).__SERAPHIM_API_URL__?.replace(/\/api$/, '') || 'http://seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com';

      // Resolve agent ID from program ID
      const agentsRes = await fetch(`${API_BASE}/api/agents`);
      if (!agentsRes.ok) {
        return `[Backend unreachable: ${agentsRes.status}. Is the ECS service running?]`;
      }

      const agentsData = await agentsRes.json();
      let agentId: string | undefined;
      for (const agent of agentsData.agents || []) {
        if (agent.programId === this.agentProgramId) {
          agentId = agent.id;
          break;
        }
      }

      if (!agentId) {
        return `[Agent "${this.agentProgramId}" not found in registry. ${(agentsData.agents || []).length} agents available.]`;
      }

      // Execute chat task on the agent
      const res = await fetch(`${API_BASE}/api/agents/${agentId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `chat-${Date.now()}`,
          type: 'chat',
          description: message,
          params: { input: message, source: 'dashboard', pillar: this.agentProgramId },
          priority: 'medium',
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return `[Backend error ${res.status}: ${errText.slice(0, 150)}]`;
      }

      const result = await res.json();
      const output = result?.result?.output;

      if (output?.response) {
        return output.response;
      }
      if (output?.message) {
        return output.message;
      }
      if (output?.error) {
        return `[Agent error: ${output.error}]`;
      }

      return `[${this.agentName}] Received response but no text content found.`;
    } catch (err) {
      return `[Connection error: ${err instanceof Error ? err.message : 'Unknown error'}. Ensure backend is reachable.]`;
    }
  }

  protected abstract renderContent(): string;

  protected render(): void {
    this.container.innerHTML = `
      <div class="view-with-chat">
        <div class="view-header">
          <h2>${this.title}</h2>
          <div class="presence-indicator"><span class="presence-dot"></span> ${this.agentName} Online</div>
        </div>
        <div class="view-content">${this.renderContent()}</div>
        <div class="chat-container">
          <div class="chat-sidebar">
            <button class="chat-new-btn">+ New Chat</button>
            <div class="chat-history-list">
              ${this.sessions.map(s => `
                <div class="chat-history-item${s.id === this.currentSessionId ? ' chat-history-item--active' : ''}" data-session-id="${s.id}">
                  <span class="chat-history-preview">${s.preview}</span>
                  <span class="chat-history-date">${new Date(s.startedAt).toLocaleDateString()} · ${s.messageCount} msgs</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="view-chat">
            <div class="chat-messages" role="log" aria-live="polite" aria-label="Conversation with ${this.agentName}">${this.renderMessages()}</div>
            <div class="chat-input-area">
              <textarea class="chat-input" placeholder="Message ${this.agentName}... (Enter to send)" rows="2"></textarea>
              <button class="chat-send-btn">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  protected renderMessages(): string {
    return this.messages
      .map(
        (m) => {
          const isThinking = m.text === '⏳ Thinking...';
          const roleClass = isThinking ? 'chat-msg--thinking' : `chat-msg--${m.role}`;
          return `<div class="chat-msg ${roleClass}"><span class="chat-msg-sender">${m.role === 'agent' ? this.agentName : 'You'}</span><span class="chat-msg-text">${m.text}</span></div>`;
        },
      )
      .join('');
  }

  protected attachListeners(): void {
    const textarea = this.container.querySelector('.chat-input') as HTMLTextAreaElement | null;
    const sendBtn = this.container.querySelector('.chat-send-btn') as HTMLButtonElement | null;

    const send = () => {
      if (!textarea) return;
      const text = textarea.value.trim();
      if (!text) return;
      this.messages.push({ role: 'user', text });
      textarea.value = '';
      // Show thinking indicator
      this.messages.push({ role: 'agent', text: '⏳ Thinking...' });
      this.render();
      this.attachListeners();
      // Call real backend agent
      this.sendToAgent(text).then((response) => {
        // Remove thinking indicator and add real response
        this.messages = this.messages.filter((m) => m.text !== '⏳ Thinking...');
        this.messages.push({ role: 'agent', text: response });
        this.saveToLocalStorage(); // Persist after every exchange
        this.render();
        this.attachListeners();
        const chatEl = this.container.querySelector('.chat-messages');
        if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
      });
    };

    sendBtn?.addEventListener('click', send);
    textarea?.addEventListener('keydown', (e) => {
      // Send on Enter (without shift for newline)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    // Dispatch to Kiro button
    const dispatchBtn = this.container.querySelector('.chat-dispatch-btn');
    dispatchBtn?.addEventListener('click', async () => {
      // Get the last agent message as the task
      const lastAgentMsg = [...this.messages].reverse().find(m => m.role === 'agent' && m.text !== '⏳ Thinking...' && !m.text.startsWith('['));
      if (!lastAgentMsg) return;

      try {
        const API_BASE = (window as any).__SERAPHIM_API_URL__?.replace(/\/api$/, '') || 'http://seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com';
        const res = await fetch(`${API_BASE}/api/agent-tasks/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: lastAgentMsg.text.substring(0, 60),
            description: lastAgentMsg.text,
            agent: this.agentName,
            instructions: [lastAgentMsg.text],
            criteria: ['Task completed successfully'],
          }),
        });

        if (res.ok) {
          this.messages.push({ role: 'agent', text: '✅ Task dispatched to Kiro for execution. Monitor progress in the IDE.' });
        } else {
          this.messages.push({ role: 'agent', text: '❌ Failed to dispatch task to Kiro.' });
        }
      } catch {
        this.messages.push({ role: 'agent', text: '❌ Could not reach backend to dispatch task.' });
      }

      this.saveToLocalStorage();
      this.render();
      this.attachListeners();
    });

    // New Chat button — archive current and start fresh
    const newChatBtn = this.container.querySelector('.chat-new-btn');
    newChatBtn?.addEventListener('click', () => {
      this.archiveAndStartNew();
    });

    // History items — view archived sessions
    const historyItems = this.container.querySelectorAll('.chat-history-item');
    historyItems.forEach(item => {
      item.addEventListener('click', () => {
        const sessionId = (item as HTMLElement).dataset.sessionId;
        if (sessionId) {
          this.loadArchivedSession(sessionId);
        }
      });
    });

    // Back to current button
    // Focus the textarea for immediate typing
    textarea?.focus();

    // Scroll chat to bottom
    const chatEl = this.container.querySelector('.chat-messages');
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  }
}

// ---------------------------------------------------------------------------
// Seraphim Core Views
// ---------------------------------------------------------------------------

export class SeraphimGovernanceView extends BasePillarView {
  protected title = 'Governance';
  protected agentName = 'Seraphim';
  protected agentProgramId = 'seraphim-core';
  protected welcomeMessage = 'Governance engine active. All authority levels operational. How can I assist with governance decisions?';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Authority Level</div>
          <div class="metric-value">L3</div>
          <div class="metric-trend metric-trend--neutral">Autonomous Operations</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Execution Tokens Active</div>
          <div class="metric-value">7</div>
          <div class="metric-trend metric-trend--up">↑ 2 new today</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Completion Contracts</div>
          <div class="metric-value">94%</div>
          <div class="metric-trend metric-trend--up">↑ 3% vs last week</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Pending Escalations</div>
          <div class="metric-value">1</div>
          <div class="metric-trend metric-trend--neutral">Budget override request</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Authority Matrix</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Level</span><span>Scope</span><span>Status</span></div>
          <div class="data-row"><span>L1 — Inform</span><span>Notifications only</span><span class="status-badge status-badge--active">Active</span></div>
          <div class="data-row"><span>L2 — Recommend</span><span>Suggest + await approval</span><span class="status-badge status-badge--active">Active</span></div>
          <div class="data-row"><span>L3 — Execute</span><span>Act within guardrails</span><span class="status-badge status-badge--active">Active</span></div>
          <div class="data-row"><span>L4 — Autonomous</span><span>Full autonomy (earned)</span><span class="status-badge status-badge--pending">Pending</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Recent Governance Decisions</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">✓</span><span class="pipeline-item-text">Approved ZionX budget increase ($500 → $750/mo)</span><span class="pipeline-item-time">2h ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">✓</span><span class="pipeline-item-text">Validated ZXMG content schedule compliance</span><span class="pipeline-item-time">5h ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">⏳</span><span class="pipeline-item-text">Pending: Zion Alpha position size increase request</span><span class="pipeline-item-time">1h ago</span></div>
        </div>
      </div>
    `;
  }
}

export class SeraphimMemoryView extends BasePillarView {
  protected title = 'Memory';
  protected agentName = 'Seraphim';
  protected agentProgramId = 'seraphim-core';
  protected welcomeMessage = 'Memory system online. 4 layers active: episodic, semantic, procedural, working. What would you like to recall or store?';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Episodic Entries</div>
          <div class="metric-value">1,247</div>
          <div class="metric-trend metric-trend--up">↑ 23 today</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Semantic Facts</div>
          <div class="metric-value">892</div>
          <div class="metric-trend metric-trend--up">↑ 8 this week</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Procedural Patterns</div>
          <div class="metric-value">156</div>
          <div class="metric-trend metric-trend--neutral">Stable</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Working Memory</div>
          <div class="metric-value">12/20</div>
          <div class="metric-trend metric-trend--neutral">60% utilized</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Recent Memory Entries</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--info">📝</span><span class="pipeline-item-text">Stored: User prefers conservative risk on Zion Alpha</span><span class="pipeline-item-time">30m ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--info">📝</span><span class="pipeline-item-text">Stored: ZionX app "FocusFlow" passed gate review</span><span class="pipeline-item-time">2h ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--info">📝</span><span class="pipeline-item-text">Stored: ZXMG video #47 outperformed by 3x on TikTok</span><span class="pipeline-item-time">4h ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--info">📝</span><span class="pipeline-item-text">Recalled: Eretz synergy pattern for cross-promotion</span><span class="pipeline-item-time">5h ago</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Memory Search</h3>
        <div class="search-box">
          <input type="text" class="search-input" placeholder="Search memory layers..." />
        </div>
      </div>
    `;
  }
}

export class SeraphimLearningView extends BasePillarView {
  protected title = 'Learning';
  protected agentName = 'Seraphim';
  protected agentProgramId = 'seraphim-core';
  protected welcomeMessage = 'Learning engine monitoring improvement metrics. Detecting patterns and proposing fixes autonomously.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Repeat Failure Rate</div>
          <div class="metric-value">4.2%</div>
          <div class="metric-trend metric-trend--down">↓ 1.8% vs last month</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Autonomous Resolution</div>
          <div class="metric-value">78%</div>
          <div class="metric-trend metric-trend--up">↑ 5% improvement</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Fix Success Rate</div>
          <div class="metric-value">91%</div>
          <div class="metric-trend metric-trend--up">↑ 3% this week</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Patterns Detected</div>
          <div class="metric-value">34</div>
          <div class="metric-trend metric-trend--up">↑ 6 new patterns</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Recent Patterns Detected</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🧠</span><span class="pipeline-item-text">Pattern: App store rejections correlate with missing privacy labels</span><span class="pipeline-item-time">1d ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🧠</span><span class="pipeline-item-text">Pattern: Videos posted at 6PM EST get 2.3x more engagement</span><span class="pipeline-item-time">2d ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🧠</span><span class="pipeline-item-text">Pattern: Prediction markets with >$50K volume have higher accuracy</span><span class="pipeline-item-time">3d ago</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Fix Proposals</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">💡</span><span class="pipeline-item-text">Proposal: Auto-add privacy labels to all ZionX submissions</span><span class="pipeline-item-time">Pending approval</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">💡</span><span class="pipeline-item-text">Proposal: Shift ZXMG upload schedule to 6PM EST default</span><span class="pipeline-item-time">Pending approval</span></div>
        </div>
      </div>
    `;
  }
}

export class SeraphimDecisionsView extends BasePillarView {
  protected title = 'Decisions';
  protected agentName = 'Seraphim';
  protected agentProgramId = 'seraphim-core';
  protected welcomeMessage = 'Decision log active. All autonomous and escalated decisions are tracked here with full reasoning chains.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Decisions Today</div>
          <div class="metric-value">14</div>
          <div class="metric-trend metric-trend--neutral">Normal volume</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Autonomous</div>
          <div class="metric-value">12</div>
          <div class="metric-trend metric-trend--up">86% autonomous rate</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Escalated</div>
          <div class="metric-value">2</div>
          <div class="metric-trend metric-trend--neutral">Within threshold</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Decision Time</div>
          <div class="metric-value">1.2s</div>
          <div class="metric-trend metric-trend--down">↓ 0.3s faster</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Recent Decisions</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">✓</span><span class="pipeline-item-text">Auto-approved: ZXMG video publish (within content guidelines)</span><span class="pipeline-item-time">15m ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">✓</span><span class="pipeline-item-text">Auto-approved: ZionX gate review pass for "MealPrep AI"</span><span class="pipeline-item-time">1h ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--escalated">⬆</span><span class="pipeline-item-text">Escalated: Zion Alpha wants to increase position size beyond limit</span><span class="pipeline-item-time">2h ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">✓</span><span class="pipeline-item-text">Auto-approved: Eretz cross-promotion directive</span><span class="pipeline-item-time">3h ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--escalated">⬆</span><span class="pipeline-item-text">Escalated: Budget reallocation request ($200 from ZXMG to ZionX)</span><span class="pipeline-item-time">5h ago</span></div>
        </div>
      </div>
    `;
  }
}


// ---------------------------------------------------------------------------
// Eretz Business Views
// ---------------------------------------------------------------------------

export class EretzSynergiesView extends BasePillarView {
  protected title = 'Synergies';
  protected agentName = 'Eretz';
  protected agentProgramId = 'eretz-business-orchestrator';
  protected welcomeMessage = 'Synergy engine active. Monitoring cross-subsidiary opportunities between ZionX, ZXMG, and Zion Alpha.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Active Synergies</div>
          <div class="metric-value">8</div>
          <div class="metric-trend metric-trend--up">↑ 2 new this week</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Revenue Impact</div>
          <div class="metric-value">+$1,840</div>
          <div class="metric-trend metric-trend--up">↑ 24% from synergies</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Missed Opportunities</div>
          <div class="metric-value">3</div>
          <div class="metric-trend metric-trend--neutral">Under review</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Cross-Promo Active</div>
          <div class="metric-value">5</div>
          <div class="metric-trend metric-trend--up">All performing</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Active Synergies</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🔗</span><span class="pipeline-item-text">ZXMG videos promote ZionX apps → +340 installs/mo</span><span class="pipeline-item-time">Active</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🔗</span><span class="pipeline-item-text">ZionX app data feeds Zion Alpha market signals</span><span class="pipeline-item-time">Active</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🔗</span><span class="pipeline-item-text">Zion Alpha profits fund ZXMG content production</span><span class="pipeline-item-time">Active</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">💡</span><span class="pipeline-item-text">Opportunity: ZionX user data could improve ZXMG targeting</span><span class="pipeline-item-time">Proposed</span></div>
        </div>
      </div>
    `;
  }
}

export class EretzPatternsView extends BasePillarView {
  protected title = 'Patterns Library';
  protected agentName = 'Eretz';
  protected agentProgramId = 'eretz-business-orchestrator';
  protected welcomeMessage = 'Pattern library loaded. Reusable business patterns available for all subsidiaries.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Total Patterns</div>
          <div class="metric-value">42</div>
          <div class="metric-trend metric-trend--up">↑ 5 new this month</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Effectiveness</div>
          <div class="metric-value">87%</div>
          <div class="metric-trend metric-trend--up">↑ 4% improvement</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Applied This Week</div>
          <div class="metric-value">11</div>
          <div class="metric-trend metric-trend--neutral">Across 3 subsidiaries</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Success Rate</div>
          <div class="metric-value">92%</div>
          <div class="metric-trend metric-trend--up">High confidence</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Top Patterns</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Pattern</span><span>Effectiveness</span><span>Uses</span></div>
          <div class="data-row"><span>Cross-promotion in content</span><span>94%</span><span>28</span></div>
          <div class="data-row"><span>Freemium → subscription upsell</span><span>89%</span><span>15</span></div>
          <div class="data-row"><span>Data-driven content scheduling</span><span>91%</span><span>22</span></div>
          <div class="data-row"><span>Market sentiment → app features</span><span>82%</span><span>8</span></div>
          <div class="data-row"><span>Audience overlap targeting</span><span>86%</span><span>12</span></div>
        </div>
      </div>
    `;
  }
}

export class EretzTrainingView extends BasePillarView {
  protected title = 'Training Cascade';
  protected agentName = 'Eretz';
  protected agentProgramId = 'eretz-business-orchestrator';
  protected welcomeMessage = 'Training cascade system active. Monitoring improvement trends across all subsidiaries.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">ZionX Improvement</div>
          <div class="metric-value">+18%</div>
          <div class="metric-trend metric-trend--up">↑ Gate pass rate</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">ZXMG Improvement</div>
          <div class="metric-value">+22%</div>
          <div class="metric-trend metric-trend--up">↑ Engagement rate</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Zion Alpha Improvement</div>
          <div class="metric-value">+9%</div>
          <div class="metric-trend metric-trend--up">↑ Win rate</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Feedback Processed</div>
          <div class="metric-value">67</div>
          <div class="metric-trend metric-trend--neutral">This month</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Training Status</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Subsidiary</span><span>Last Training</span><span>Status</span></div>
          <div class="data-row"><span>ZionX</span><span>2 hours ago</span><span class="status-badge status-badge--active">Up to date</span></div>
          <div class="data-row"><span>ZXMG</span><span>4 hours ago</span><span class="status-badge status-badge--active">Up to date</span></div>
          <div class="data-row"><span>Zion Alpha</span><span>1 day ago</span><span class="status-badge status-badge--pending">Pending update</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Recent Feedback</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📋</span><span class="pipeline-item-text">ZionX: Improved app description quality after training</span><span class="pipeline-item-time">2h ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📋</span><span class="pipeline-item-text">ZXMG: Better thumbnail selection after A/B test feedback</span><span class="pipeline-item-time">6h ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">📋</span><span class="pipeline-item-text">Zion Alpha: Needs calibration on low-liquidity markets</span><span class="pipeline-item-time">1d ago</span></div>
        </div>
      </div>
    `;
  }
}

export class EretzDirectivesView extends BasePillarView {
  protected title = 'Directives';
  protected agentName = 'Eretz';
  protected agentProgramId = 'eretz-business-orchestrator';
  protected welcomeMessage = 'Directive pipeline active. Enriching and routing directives from Seraphim to subsidiaries.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Active Directives</div>
          <div class="metric-value">12</div>
          <div class="metric-trend metric-trend--neutral">Across all subsidiaries</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Enriched Today</div>
          <div class="metric-value">4</div>
          <div class="metric-trend metric-trend--up">Context added</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Delivery Rate</div>
          <div class="metric-value">100%</div>
          <div class="metric-trend metric-trend--up">All delivered</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Enrichment Time</div>
          <div class="metric-value">2.4s</div>
          <div class="metric-trend metric-trend--down">↓ Faster processing</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Active Directives</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📨</span><span class="pipeline-item-text">→ ZionX: Prioritize health & fitness app category</span><span class="pipeline-item-time">Delivered</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📨</span><span class="pipeline-item-text">→ ZXMG: Increase short-form content ratio to 70%</span><span class="pipeline-item-time">Delivered</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📨</span><span class="pipeline-item-text">→ Zion Alpha: Reduce max position size to $200</span><span class="pipeline-item-time">Delivered</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">📨</span><span class="pipeline-item-text">→ All: Monthly performance review due in 3 days</span><span class="pipeline-item-time">Pending</span></div>
        </div>
      </div>
    `;
  }
}

export class EretzStandingOrdersView extends BasePillarView {
  protected title = 'Standing Orders';
  protected agentName = 'Eretz';
  protected agentProgramId = 'eretz-business-orchestrator';
  protected welcomeMessage = 'Standing orders enforced. Permanent rules that apply across all operations.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Active Rules</div>
          <div class="metric-value">9</div>
          <div class="metric-trend metric-trend--neutral">All enforced</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Compliance Rate</div>
          <div class="metric-value">97%</div>
          <div class="metric-trend metric-trend--up">↑ Near perfect</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Violations (30d)</div>
          <div class="metric-value">2</div>
          <div class="metric-trend metric-trend--down">↓ Improving</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Last Audit</div>
          <div class="metric-value">2h ago</div>
          <div class="metric-trend metric-trend--neutral">Automated</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Standing Rules</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Rule</span><span>Scope</span><span>Compliance</span></div>
          <div class="data-row"><span>Every ZXMG video includes ZionX app commercial</span><span>ZXMG</span><span class="status-badge status-badge--active">100%</span></div>
          <div class="data-row"><span>No position &gt; 10% of portfolio</span><span>Zion Alpha</span><span class="status-badge status-badge--active">100%</span></div>
          <div class="data-row"><span>All apps must pass gate review before submission</span><span>ZionX</span><span class="status-badge status-badge--active">100%</span></div>
          <div class="data-row"><span>Daily P&L report to Seraphim</span><span>All</span><span class="status-badge status-badge--active">100%</span></div>
          <div class="data-row"><span>Content must be original (no copyright violations)</span><span>ZXMG</span><span class="status-badge status-badge--warning">94%</span></div>
        </div>
      </div>
    `;
  }
}


// ---------------------------------------------------------------------------
// ZionX Views
// ---------------------------------------------------------------------------

export class ZionXPipelineView extends BasePillarView {
  protected title = 'App Pipeline';
  protected agentName = 'ZionX';
  protected agentProgramId = 'zionx-app-factory';
  protected welcomeMessage = 'Pipeline active. 6 apps in various stages. Ready to assist with app development lifecycle.';

  private pipelineBoard: VisualPipelineBoard | null = null;
  private crisisPanel: RejectionCrisisPanel | null = null;
  private heatmap: MarketOpportunityHeatmap | null = null;

  async mount(): Promise<void> {
    await super.mount();
    this.mountPhase12Components();
  }

  unmount(): void {
    this.pipelineBoard?.unmount();
    this.crisisPanel?.unmount();
    this.heatmap?.unmount();
    this.pipelineBoard = null;
    this.crisisPanel = null;
    this.heatmap = null;
    super.unmount();
  }

  private mountPhase12Components(): void {
    const contentArea = this.container.querySelector('.pillar-content') || this.container;

    // Create mount points
    const pipelineMountEl = document.createElement('div');
    pipelineMountEl.id = 'zionx-pipeline-board';
    const crisisMountEl = document.createElement('div');
    crisisMountEl.id = 'zionx-crisis-panel';
    const heatmapMountEl = document.createElement('div');
    heatmapMountEl.id = 'zionx-market-heatmap';

    contentArea.prepend(heatmapMountEl);
    contentArea.prepend(crisisMountEl);
    contentArea.prepend(pipelineMountEl);

    // Mount Visual Pipeline Board
    const pipelineData: VisualPipelineBoardData = {
      apps: [
        { id: 'a1', name: 'FocusFlow', stage: 'live', daysInStage: 45, gateCheck: { passed: 70, total: 70, warnings: 0 }, health: 'healthy', priority: 1 },
        { id: 'a2', name: 'MealPrep AI', stage: 'live', daysInStage: 30, gateCheck: { passed: 70, total: 70, warnings: 0 }, health: 'healthy', priority: 2 },
        { id: 'a3', name: 'HabitStack', stage: 'gate_review', daysInStage: 2, gateCheck: { passed: 65, total: 70, warnings: 3 }, health: 'warning', priority: 1 },
        { id: 'a4', name: 'QuickBudget', stage: 'development', daysInStage: 8, gateCheck: { passed: 40, total: 70, warnings: 0 }, health: 'healthy', priority: 1 },
        { id: 'a5', name: 'SleepScore', stage: 'testing', daysInStage: 3, gateCheck: { passed: 55, total: 70, warnings: 2 }, health: 'healthy', priority: 2 },
        { id: 'a6', name: 'PetTracker', stage: 'ideation', daysInStage: 5, gateCheck: { passed: 0, total: 70, warnings: 0 }, health: 'healthy', priority: 3 },
      ],
      gateCheckpoints: [
        { afterStage: 'testing', passCount: 5, failCount: 1 },
        { afterStage: 'gate_review', passCount: 3, failCount: 0 },
      ],
    };
    this.pipelineBoard = new VisualPipelineBoard(pipelineMountEl, pipelineData);
    this.pipelineBoard.mount();

    // Mount Rejection Crisis Panel (empty = hidden)
    const crisisData: RejectionCrisisPanelData = { activeRejections: [], historicalRejections: [] };
    this.crisisPanel = new RejectionCrisisPanel(crisisMountEl, crisisData);
    this.crisisPanel.mount();

    // Mount Market Heatmap
    const heatmapData: MarketHeatmapData = {
      categories: ['Productivity', 'Health', 'Finance', 'Education', 'Lifestyle', 'Entertainment'],
      opportunities: [
        { id: 'o1', category: 'Productivity', revenueTier: 'tier2', opportunityScore: 82, opportunityLevel: 'high', competitorCount: 8, reviewGap: 35, estimatedDownloads: 75000, nicheDetails: { topCompetitors: ['Todoist', 'TickTick'], avgRating: 4.2, marketSize: '$2.1B' } },
        { id: 'o2', category: 'Health', revenueTier: 'tier3', opportunityScore: 71, opportunityLevel: 'high', competitorCount: 12, reviewGap: 28, estimatedDownloads: 45000, nicheDetails: { topCompetitors: ['MyFitnessPal', 'Noom'], avgRating: 4.0, marketSize: '$1.5B' } },
        { id: 'o3', category: 'Finance', revenueTier: 'tier2', opportunityScore: 45, opportunityLevel: 'moderate', competitorCount: 25, reviewGap: 15, estimatedDownloads: 30000, nicheDetails: { topCompetitors: ['Mint', 'YNAB'], avgRating: 4.5, marketSize: '$3.2B' } },
        { id: 'o4', category: 'Education', revenueTier: 'tier3', opportunityScore: 88, opportunityLevel: 'high', competitorCount: 5, reviewGap: 42, estimatedDownloads: 60000, nicheDetails: { topCompetitors: ['Duolingo', 'Coursera'], avgRating: 3.8, marketSize: '$800M' } },
        { id: 'o5', category: 'Lifestyle', revenueTier: 'tier4', opportunityScore: 30, opportunityLevel: 'saturated', competitorCount: 50, reviewGap: 8, estimatedDownloads: 15000, nicheDetails: { topCompetitors: ['Pinterest', 'Canva'], avgRating: 4.6, marketSize: '$5B' } },
      ],
    };
    this.heatmap = new MarketOpportunityHeatmap(heatmapMountEl, heatmapData);
    this.heatmap.mount();
  }

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Apps in Pipeline</div>
          <div class="metric-value">6</div>
          <div class="metric-trend metric-trend--up">↑ 2 new this month</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Gate Pass Rate</div>
          <div class="metric-value">83%</div>
          <div class="metric-trend metric-trend--up">↑ 8% improvement</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Time to Live</div>
          <div class="metric-value">18d</div>
          <div class="metric-trend metric-trend--down">↓ 3d faster</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Live Apps</div>
          <div class="metric-value">4</div>
          <div class="metric-trend metric-trend--up">Revenue generating</div>
        </div>
      </div>
    `;
  }
}

export class ZionXAppStoreView extends BasePillarView {
  protected title = 'App Store';
  protected agentName = 'ZionX';
  protected agentProgramId = 'zionx-app-factory';
  protected welcomeMessage = 'App Store management active. Monitoring submissions, reviews, and approval status across Apple and Google.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Submitted Apps</div>
          <div class="metric-value">5</div>
          <div class="metric-trend metric-trend--neutral">Apple + Google</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Approval Rate</div>
          <div class="metric-value">80%</div>
          <div class="metric-trend metric-trend--up">↑ Improving</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Review Time</div>
          <div class="metric-value">2.1d</div>
          <div class="metric-trend metric-trend--neutral">Apple avg</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Rejections (90d)</div>
          <div class="metric-value">2</div>
          <div class="metric-trend metric-trend--down">↓ Fewer rejections</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Submission Status</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>App</span><span>Platform</span><span>Status</span></div>
          <div class="data-row"><span>FocusFlow v2.1</span><span>Apple</span><span class="status-badge status-badge--active">Approved</span></div>
          <div class="data-row"><span>FocusFlow v2.1</span><span>Google</span><span class="status-badge status-badge--active">Approved</span></div>
          <div class="data-row"><span>MealPrep AI v1.3</span><span>Apple</span><span class="status-badge status-badge--pending">In Review</span></div>
          <div class="data-row"><span>HabitStack v1.0</span><span>Apple</span><span class="status-badge status-badge--pending">Preparing</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Rejection History</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--rejected">✗</span><span class="pipeline-item-text">MealPrep AI v1.2 — Missing privacy nutrition data disclosure</span><span class="pipeline-item-time">Fixed & resubmitted</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--rejected">✗</span><span class="pipeline-item-text">FocusFlow v2.0 — Guideline 4.3: Spam (duplicate functionality claim)</span><span class="pipeline-item-time">Resolved on appeal</span></div>
        </div>
      </div>
    `;
  }
}

export class ZionXMarketingView extends BasePillarView {
  protected title = 'Marketing';
  protected agentName = 'ZionX';
  protected agentProgramId = 'zionx-app-factory';
  protected welcomeMessage = 'Marketing intelligence active. Tracking GTM campaigns, ASO metrics, and ROAS across channels.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Monthly Ad Spend</div>
          <div class="metric-value">$340</div>
          <div class="metric-trend metric-trend--neutral">Within budget</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">ROAS</div>
          <div class="metric-value">3.2x</div>
          <div class="metric-trend metric-trend--up">↑ Profitable</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Organic Installs</div>
          <div class="metric-value">1,240</div>
          <div class="metric-trend metric-trend--up">↑ 18% growth</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">ASO Score</div>
          <div class="metric-value">72/100</div>
          <div class="metric-trend metric-trend--up">↑ 5 points</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Campaign Performance</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Campaign</span><span>Channel</span><span>ROAS</span><span>Status</span></div>
          <div class="data-row"><span>FocusFlow — Productivity</span><span>Apple Search Ads</span><span>4.1x</span><span class="status-badge status-badge--active">Active</span></div>
          <div class="data-row"><span>MealPrep — Health</span><span>Instagram</span><span>2.8x</span><span class="status-badge status-badge--active">Active</span></div>
          <div class="data-row"><span>FocusFlow — Students</span><span>TikTok</span><span>1.9x</span><span class="status-badge status-badge--pending">Testing</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">ASO Keywords</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📈</span><span class="pipeline-item-text">"focus timer" — Rank #8 (↑3)</span><span class="pipeline-item-time">FocusFlow</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📈</span><span class="pipeline-item-text">"meal planner ai" — Rank #12 (↑5)</span><span class="pipeline-item-time">MealPrep AI</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">📊</span><span class="pipeline-item-text">"habit tracker" — Rank #34 (new)</span><span class="pipeline-item-time">HabitStack</span></div>
        </div>
      </div>
    `;
  }
}

export class ZionXDesignView extends BasePillarView {
  protected title = 'Design Intelligence';
  protected agentName = 'ZionX';
  protected agentProgramId = 'zionx-app-factory';
  protected welcomeMessage = 'Design intelligence active. Analyzing top-performing app designs and maintaining template library.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Design Templates</div>
          <div class="metric-value">24</div>
          <div class="metric-trend metric-trend--up">↑ 4 new templates</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Quality Score</div>
          <div class="metric-value">8.4/10</div>
          <div class="metric-trend metric-trend--up">↑ 0.6 improvement</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Designs Analyzed</div>
          <div class="metric-value">156</div>
          <div class="metric-trend metric-trend--neutral">Top 100 apps studied</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">A/B Tests Active</div>
          <div class="metric-value">3</div>
          <div class="metric-trend metric-trend--neutral">Running</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Quality Scores</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>App</span><span>UI Score</span><span>UX Score</span><span>Overall</span></div>
          <div class="data-row"><span>FocusFlow</span><span>9.1</span><span>8.7</span><span>8.9</span></div>
          <div class="data-row"><span>MealPrep AI</span><span>8.2</span><span>8.5</span><span>8.4</span></div>
          <div class="data-row"><span>HabitStack</span><span>7.8</span><span>8.1</span><span>8.0</span></div>
          <div class="data-row"><span>QuickBudget</span><span>7.5</span><span>7.2</span><span>7.4</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Design Findings</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🎨</span><span class="pipeline-item-text">Trend: Glassmorphism declining, neo-brutalism rising in productivity apps</span><span class="pipeline-item-time">This week</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🎨</span><span class="pipeline-item-text">Finding: Apps with onboarding < 3 screens have 40% better retention</span><span class="pipeline-item-time">Analysis</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🎨</span><span class="pipeline-item-text">Template: Dark mode health dashboard (high conversion)</span><span class="pipeline-item-time">Added</span></div>
        </div>
      </div>
    `;
  }
}

export class ZionXRevenueView extends BasePillarView {
  protected title = 'Revenue';
  protected agentName = 'ZionX';
  protected agentProgramId = 'zionx-app-factory';
  protected welcomeMessage = 'Revenue tracking active. Monitoring per-app MRR, downloads, ARPU, LTV, and churn metrics.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Portfolio MRR</div>
          <div class="metric-value">$2,400</div>
          <div class="metric-trend metric-trend--up">↑ 12% vs last month</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Total Downloads</div>
          <div class="metric-value">8,420</div>
          <div class="metric-trend metric-trend--up">↑ 890 this month</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg ARPU</div>
          <div class="metric-value">$4.80</div>
          <div class="metric-trend metric-trend--up">↑ $0.40</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Churn Rate</div>
          <div class="metric-value">6.2%</div>
          <div class="metric-trend metric-trend--down">↓ 1.1% improvement</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Per-App Revenue</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>App</span><span>MRR</span><span>LTV</span><span>Recommendation</span></div>
          <div class="data-row"><span>FocusFlow</span><span>$1,420</span><span>$38</span><span class="status-badge status-badge--active">Scale</span></div>
          <div class="data-row"><span>MealPrep AI</span><span>$680</span><span>$24</span><span class="status-badge status-badge--active">Optimize</span></div>
          <div class="data-row"><span>SleepScore</span><span>$180</span><span>$12</span><span class="status-badge status-badge--pending">Monitor</span></div>
          <div class="data-row"><span>QuickBudget</span><span>$120</span><span>$8</span><span class="status-badge status-badge--warning">Review</span></div>
        </div>
      </div>
    `;
  }
}


// ---------------------------------------------------------------------------
// ZXMG Views
// ---------------------------------------------------------------------------

export class ZXMGContentPipelineView extends BasePillarView {
  protected title = 'Content Pipeline';
  protected agentName = 'ZXMG';
  protected agentProgramId = 'zxmg-media-production';
  protected welcomeMessage = 'Content pipeline active. Managing content from planning through upload and monitoring.';

  private diversityDashboard: ContentDiversityDashboard | null = null;

  async mount(): Promise<void> {
    await super.mount();
    this.mountDiversityDashboard();
  }

  unmount(): void {
    this.diversityDashboard?.unmount();
    this.diversityDashboard = null;
    super.unmount();
  }

  private mountDiversityDashboard(): void {
    const contentArea = this.container.querySelector('.pillar-content') || this.container;
    const mountEl = document.createElement('div');
    mountEl.id = 'zxmg-diversity-dashboard';
    contentArea.appendChild(mountEl);

    const diversityData: ContentDiversityData = {
      assets: [
        { id: 'av1', name: 'Sofia (Latina)', type: 'avatar', lastUsedVideoIndex: 1, usageCount: 5 },
        { id: 'av2', name: 'Marcus (Black Male)', type: 'avatar', lastUsedVideoIndex: 6, usageCount: 3 },
        { id: 'av3', name: 'Yuki (Asian Female)', type: 'avatar', lastUsedVideoIndex: 8, usageCount: 2 },
        { id: 'v1', name: 'Soft Soothe', type: 'voice', lastUsedVideoIndex: 2, usageCount: 4 },
        { id: 'v2', name: 'Epic Narrator', type: 'voice', lastUsedVideoIndex: 7, usageCount: 2 },
        { id: 's1', name: 'Cozy Morning', type: 'style', lastUsedVideoIndex: 3, usageCount: 3 },
        { id: 's2', name: 'Tech Office', type: 'style', lastUsedVideoIndex: 9, usageCount: 2 },
        { id: 'm1', name: 'Epic Cinematic', type: 'music', lastUsedVideoIndex: 4, usageCount: 3 },
        { id: 'm2', name: 'Calm Piano', type: 'music', lastUsedVideoIndex: 10, usageCount: 1 },
      ],
      channels: [
        { channelId: 'ch1', channelName: 'Tech Reviews', diversityScore: 72 },
        { channelId: 'ch2', channelName: 'AI Tutorials', diversityScore: 85 },
        { channelId: 'ch3', channelName: 'Lifestyle', diversityScore: 58 },
      ],
      recentVideoCount: 20,
    };
    this.diversityDashboard = new ContentDiversityDashboard(mountEl, diversityData);
    this.diversityDashboard.mount();
  }

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Content in Pipeline</div>
          <div class="metric-value">14</div>
          <div class="metric-trend metric-trend--up">↑ 4 new this week</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Published This Week</div>
          <div class="metric-value">7</div>
          <div class="metric-trend metric-trend--up">On schedule</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Production Time</div>
          <div class="metric-value">3.2d</div>
          <div class="metric-trend metric-trend--down">↓ 0.5d faster</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Quality Pass Rate</div>
          <div class="metric-value">94%</div>
          <div class="metric-trend metric-trend--up">↑ High quality</div>
        </div>
      </div>
    `;
  }
}

export class ZXMGPerformanceView extends BasePillarView {
  protected title = 'Performance';
  protected agentName = 'ZXMG';
  protected agentProgramId = 'zxmg-media-production';
  protected welcomeMessage = 'Performance analytics active. Tracking views, engagement, and revenue across all content.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Total Views (30d)</div>
          <div class="metric-value">124K</div>
          <div class="metric-trend metric-trend--up">↑ 34% growth</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Engagement</div>
          <div class="metric-value">8.2%</div>
          <div class="metric-trend metric-trend--up">↑ 1.4% improvement</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Content Revenue (30d)</div>
          <div class="metric-value">$890</div>
          <div class="metric-trend metric-trend--up">↑ 22% growth</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Subscriber Growth</div>
          <div class="metric-value">+2,340</div>
          <div class="metric-trend metric-trend--up">↑ Strong growth</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Top Performers</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Content</span><span>Views</span><span>Engagement</span><span>Revenue</span></div>
          <div class="data-row"><span>"5 Apps That Pay You"</span><span>45K</span><span>12.1%</span><span>$340</span></div>
          <div class="data-row"><span>"AI Money Machine"</span><span>32K</span><span>9.4%</span><span>$220</span></div>
          <div class="data-row"><span>"Side Hustle Stack"</span><span>28K</span><span>7.8%</span><span>$180</span></div>
          <div class="data-row"><span>"Prediction Market 101"</span><span>19K</span><span>6.2%</span><span>$150</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Trends</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📈</span><span class="pipeline-item-text">Short-form content outperforming long-form by 2.3x on engagement</span><span class="pipeline-item-time">This week</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📈</span><span class="pipeline-item-text">Tutorial content has highest revenue per view ($0.008)</span><span class="pipeline-item-time">30d avg</span></div>
        </div>
      </div>
    `;
  }
}

export class ZXMGDistributionView extends BasePillarView {
  protected title = 'Distribution';
  protected agentName = 'ZXMG';
  protected agentProgramId = 'zxmg-media-production';
  protected welcomeMessage = 'Distribution engine active. Managing multi-platform uploads, scheduling, and optimization.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Platforms Active</div>
          <div class="metric-value">5</div>
          <div class="metric-trend metric-trend--neutral">All connected</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Scheduled Posts</div>
          <div class="metric-value">12</div>
          <div class="metric-trend metric-trend--neutral">Next 7 days</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Upload Success</div>
          <div class="metric-value">100%</div>
          <div class="metric-trend metric-trend--up">No failures</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Cross-Post Rate</div>
          <div class="metric-value">85%</div>
          <div class="metric-trend metric-trend--up">↑ Multi-platform</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Platform Status</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Platform</span><span>Followers</span><span>Last Upload</span><span>Status</span></div>
          <div class="data-row"><span>YouTube</span><span>12.4K</span><span>2h ago</span><span class="status-badge status-badge--active">Connected</span></div>
          <div class="data-row"><span>TikTok</span><span>8.9K</span><span>4h ago</span><span class="status-badge status-badge--active">Connected</span></div>
          <div class="data-row"><span>Instagram Reels</span><span>5.2K</span><span>6h ago</span><span class="status-badge status-badge--active">Connected</span></div>
          <div class="data-row"><span>X (Twitter)</span><span>3.1K</span><span>1d ago</span><span class="status-badge status-badge--active">Connected</span></div>
          <div class="data-row"><span>LinkedIn</span><span>1.8K</span><span>2d ago</span><span class="status-badge status-badge--active">Connected</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Upload Queue</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">⏰</span><span class="pipeline-item-text">"AI Side Hustle Guide" → YouTube, TikTok, IG</span><span class="pipeline-item-time">Tomorrow 6PM EST</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">⏰</span><span class="pipeline-item-text">"Quick Budget Tips" → TikTok, IG Reels</span><span class="pipeline-item-time">Wed 6PM EST</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">⏰</span><span class="pipeline-item-text">"Market Prediction Tutorial" → YouTube</span><span class="pipeline-item-time">Fri 6PM EST</span></div>
        </div>
      </div>
    `;
  }
}

export class ZXMGMonetizationView extends BasePillarView {
  protected title = 'Monetization';
  protected agentName = 'ZXMG';
  protected agentProgramId = 'zxmg-media-production';
  protected welcomeMessage = 'Monetization tracking active. Monitoring CPM, RPM, sponsorships, and ad revenue across all content.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Monthly Revenue</div>
          <div class="metric-value">$890</div>
          <div class="metric-trend metric-trend--up">↑ 22% growth</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg CPM</div>
          <div class="metric-value">$7.20</div>
          <div class="metric-trend metric-trend--up">↑ $0.80 increase</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg RPM</div>
          <div class="metric-value">$4.50</div>
          <div class="metric-trend metric-trend--up">↑ Good niche</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Sponsorship Pipeline</div>
          <div class="metric-value">2</div>
          <div class="metric-trend metric-trend--neutral">In negotiation</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Revenue Breakdown</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Source</span><span>Revenue</span><span>% of Total</span></div>
          <div class="data-row"><span>YouTube Ad Revenue</span><span>$520</span><span>58%</span></div>
          <div class="data-row"><span>Sponsorships</span><span>$200</span><span>22%</span></div>
          <div class="data-row"><span>Affiliate Links</span><span>$120</span><span>14%</span></div>
          <div class="data-row"><span>TikTok Creator Fund</span><span>$50</span><span>6%</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Top Earning Videos</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">💰</span><span class="pipeline-item-text">"5 Apps That Pay You" — $340 (CPM $9.20)</span><span class="pipeline-item-time">This month</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">💰</span><span class="pipeline-item-text">"AI Money Machine" — $220 (CPM $7.80)</span><span class="pipeline-item-time">This month</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">💰</span><span class="pipeline-item-text">"Side Hustle Stack" — $180 (CPM $6.40)</span><span class="pipeline-item-time">This month</span></div>
        </div>
      </div>
    `;
  }
}

export class ZXMGIntelligenceView extends BasePillarView {
  protected title = 'Intelligence';
  protected agentName = 'ZXMG';
  protected agentProgramId = 'zxmg-media-production';
  protected welcomeMessage = 'Content intelligence active. Researching trends, analyzing competitors, and detecting algorithm signals.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Trending Topics</div>
          <div class="metric-value">8</div>
          <div class="metric-trend metric-trend--up">↑ 3 new opportunities</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Competitors Tracked</div>
          <div class="metric-value">15</div>
          <div class="metric-trend metric-trend--neutral">Active monitoring</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Algorithm Signals</div>
          <div class="metric-value">5</div>
          <div class="metric-trend metric-trend--up">Actionable insights</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Research Queue</div>
          <div class="metric-value">4</div>
          <div class="metric-trend metric-trend--neutral">In progress</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Trending Topics</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🔥</span><span class="pipeline-item-text">"AI agents for passive income" — Rising fast, low competition</span><span class="pipeline-item-time">High priority</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🔥</span><span class="pipeline-item-text">"Prediction markets explained" — Steady growth, medium competition</span><span class="pipeline-item-time">Medium priority</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🔥</span><span class="pipeline-item-text">"No-code app building" — Evergreen, high search volume</span><span class="pipeline-item-time">Content planned</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Competitor Analysis</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Competitor</span><span>Subscribers</span><span>Avg Views</span><span>Posting Freq</span></div>
          <div class="data-row"><span>TechHustle</span><span>45K</span><span>18K</span><span>3x/week</span></div>
          <div class="data-row"><span>AIMoneyMaker</span><span>28K</span><span>12K</span><span>2x/week</span></div>
          <div class="data-row"><span>SideIncomeKing</span><span>67K</span><span>25K</span><span>4x/week</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Algorithm Signals</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--info">📡</span><span class="pipeline-item-text">YouTube: Shorts with hooks in first 2s getting 3x more impressions</span><span class="pipeline-item-time">Detected today</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--info">📡</span><span class="pipeline-item-text">TikTok: Finance content getting boosted in "Learn" feed</span><span class="pipeline-item-time">This week</span></div>
        </div>
      </div>
    `;
  }
}


// ---------------------------------------------------------------------------
// Zion Alpha Views
// ---------------------------------------------------------------------------

export class ZionAlphaPositionsView extends BasePillarView {
  protected title = 'Positions';
  protected agentName = 'Zion Alpha';
  protected agentProgramId = 'zion-alpha-trading';
  protected welcomeMessage = 'Position tracker active. Monitoring open positions on Kalshi and Polymarket with real-time P&L.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Open Positions</div>
          <div class="metric-value">7</div>
          <div class="metric-trend metric-trend--neutral">Across 2 platforms</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Total Invested</div>
          <div class="metric-value">$1,240</div>
          <div class="metric-trend metric-trend--neutral">Within limits</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Unrealized P&L</div>
          <div class="metric-value">+$186</div>
          <div class="metric-trend metric-trend--up">↑ 15% return</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Position Size</div>
          <div class="metric-value">$177</div>
          <div class="metric-trend metric-trend--neutral">Below $200 limit</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Open Positions</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Market</span><span>Platform</span><span>Entry</span><span>Current</span><span>P&L</span></div>
          <div class="data-row"><span>Fed rate cut by June</span><span>Kalshi</span><span>$0.42</span><span>$0.58</span><span class="status-badge status-badge--active">+$32</span></div>
          <div class="data-row"><span>BTC above $80K EOY</span><span>Polymarket</span><span>$0.35</span><span>$0.52</span><span class="status-badge status-badge--active">+$51</span></div>
          <div class="data-row"><span>US GDP > 3% Q2</span><span>Kalshi</span><span>$0.61</span><span>$0.68</span><span class="status-badge status-badge--active">+$14</span></div>
          <div class="data-row"><span>Apple Vision Pro 2 in 2025</span><span>Polymarket</span><span>$0.72</span><span>$0.65</span><span class="status-badge status-badge--warning">-$14</span></div>
          <div class="data-row"><span>TikTok ban upheld</span><span>Kalshi</span><span>$0.28</span><span>$0.41</span><span class="status-badge status-badge--active">+$26</span></div>
        </div>
      </div>
    `;
  }
}

export class ZionAlphaPerformanceView extends BasePillarView {
  protected title = 'Performance';
  protected agentName = 'Zion Alpha';
  protected agentProgramId = 'zion-alpha-trading';
  protected welcomeMessage = 'Performance analytics active. Tracking win rate, ROI, Sharpe ratio, and drawdown metrics.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Win Rate</div>
          <div class="metric-value">68%</div>
          <div class="metric-trend metric-trend--up">↑ 4% this month</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Total ROI</div>
          <div class="metric-value">+34%</div>
          <div class="metric-trend metric-trend--up">↑ Since inception</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Sharpe Ratio</div>
          <div class="metric-value">1.8</div>
          <div class="metric-trend metric-trend--up">↑ Good risk-adjusted</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Max Drawdown</div>
          <div class="metric-value">-12%</div>
          <div class="metric-trend metric-trend--neutral">Within tolerance</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Monthly Performance</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Month</span><span>Trades</span><span>Win Rate</span><span>P&L</span></div>
          <div class="data-row"><span>This Month</span><span>12</span><span>75%</span><span class="status-badge status-badge--active">+$420</span></div>
          <div class="data-row"><span>Last Month</span><span>18</span><span>67%</span><span class="status-badge status-badge--active">+$310</span></div>
          <div class="data-row"><span>2 Months Ago</span><span>15</span><span>60%</span><span class="status-badge status-badge--active">+$180</span></div>
          <div class="data-row"><span>3 Months Ago</span><span>10</span><span>70%</span><span class="status-badge status-badge--active">+$260</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Equity Curve</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📊</span><span class="pipeline-item-text">Starting capital: $2,000 → Current: $2,680 (+34%)</span><span class="pipeline-item-time">4 months</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📊</span><span class="pipeline-item-text">Longest winning streak: 8 trades</span><span class="pipeline-item-time">Last month</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--info">📊</span><span class="pipeline-item-text">Longest losing streak: 3 trades</span><span class="pipeline-item-time">2 months ago</span></div>
        </div>
      </div>
    `;
  }
}

export class ZionAlphaMarketsView extends BasePillarView {
  protected title = 'Markets';
  protected agentName = 'Zion Alpha';
  protected agentProgramId = 'zion-alpha-trading';
  protected welcomeMessage = 'Market scanner active. Analyzing available markets for liquidity, opportunity scores, and edge detection.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Markets Scanned</div>
          <div class="metric-value">342</div>
          <div class="metric-trend metric-trend--neutral">Kalshi + Polymarket</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Opportunities Found</div>
          <div class="metric-value">12</div>
          <div class="metric-trend metric-trend--up">↑ 4 high-confidence</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Liquidity</div>
          <div class="metric-value">$48K</div>
          <div class="metric-trend metric-trend--neutral">Filtered markets</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Edge Detected</div>
          <div class="metric-value">6</div>
          <div class="metric-trend metric-trend--up">Mispriced markets</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Top Opportunities</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Market</span><span>Platform</span><span>Liquidity</span><span>Score</span></div>
          <div class="data-row"><span>Inflation below 3% by Q3</span><span>Kalshi</span><span>$120K</span><span class="status-badge status-badge--active">92</span></div>
          <div class="data-row"><span>SpaceX Starship success</span><span>Polymarket</span><span>$85K</span><span class="status-badge status-badge--active">87</span></div>
          <div class="data-row"><span>AI regulation bill passes</span><span>Polymarket</span><span>$62K</span><span class="status-badge status-badge--active">84</span></div>
          <div class="data-row"><span>Unemployment stays below 4%</span><span>Kalshi</span><span>$95K</span><span class="status-badge status-badge--pending">78</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Market Scanner Results</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🎯</span><span class="pipeline-item-text">Mispricing detected: "Fed rate cut" at $0.42, model says $0.58</span><span class="pipeline-item-time">High confidence</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🎯</span><span class="pipeline-item-text">Arbitrage: Same event priced differently across platforms ($0.12 spread)</span><span class="pipeline-item-time">Medium confidence</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">🎯</span><span class="pipeline-item-text">New market: "Apple AI announcement at WWDC" — monitoring</span><span class="pipeline-item-time">Watching</span></div>
        </div>
      </div>
    `;
  }
}

export class ZionAlphaRiskView extends BasePillarView {
  protected title = 'Risk Management';
  protected agentName = 'Zion Alpha';
  protected agentProgramId = 'zion-alpha-trading';
  protected welcomeMessage = 'Risk management active. Enforcing position limits, daily loss limits, and exposure controls.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Current Exposure</div>
          <div class="metric-value">62%</div>
          <div class="metric-trend metric-trend--neutral">Of max allowed</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Daily P&L</div>
          <div class="metric-value">+$45</div>
          <div class="metric-trend metric-trend--up">Within daily limit</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Max Position Size</div>
          <div class="metric-value">$200</div>
          <div class="metric-trend metric-trend--neutral">Hard limit</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Risk Budget Used</div>
          <div class="metric-value">58%</div>
          <div class="metric-trend metric-trend--neutral">Healthy margin</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Risk Limits</h3>
        <div class="data-table">
          <div class="data-row data-row--header"><span>Limit</span><span>Max</span><span>Current</span><span>Status</span></div>
          <div class="data-row"><span>Position Size</span><span>$200</span><span>$177 avg</span><span class="status-badge status-badge--active">OK</span></div>
          <div class="data-row"><span>Daily Loss Limit</span><span>-$100</span><span>+$45</span><span class="status-badge status-badge--active">OK</span></div>
          <div class="data-row"><span>Total Exposure</span><span>$2,000</span><span>$1,240</span><span class="status-badge status-badge--active">OK</span></div>
          <div class="data-row"><span>Correlated Positions</span><span>3 max</span><span>2</span><span class="status-badge status-badge--active">OK</span></div>
          <div class="data-row"><span>Single Market Max</span><span>15%</span><span>12%</span><span class="status-badge status-badge--active">OK</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Risk Events</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🛡️</span><span class="pipeline-item-text">All positions within risk parameters</span><span class="pipeline-item-time">Now</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--pending">⚠️</span><span class="pipeline-item-text">Warning: 2 positions in correlated political markets</span><span class="pipeline-item-time">Monitoring</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">🛡️</span><span class="pipeline-item-text">Auto-rejected: Position request exceeded $200 limit</span><span class="pipeline-item-time">Yesterday</span></div>
        </div>
      </div>
    `;
  }
}

export class ZionAlphaJournalView extends BasePillarView {
  protected title = 'Trade Journal';
  protected agentName = 'Zion Alpha';
  protected agentProgramId = 'zion-alpha-trading';
  protected welcomeMessage = 'Trade journal active. Every decision logged with reasoning, market data, and outcome for pattern analysis.';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Total Entries</div>
          <div class="metric-value">89</div>
          <div class="metric-trend metric-trend--neutral">Since inception</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">This Month</div>
          <div class="metric-value">12</div>
          <div class="metric-trend metric-trend--neutral">Trades logged</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Patterns Found</div>
          <div class="metric-value">7</div>
          <div class="metric-trend metric-trend--up">↑ Actionable insights</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Confidence</div>
          <div class="metric-value">74%</div>
          <div class="metric-trend metric-trend--up">↑ Calibrating well</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Recent Journal Entries</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📖</span><span class="pipeline-item-text"><strong>BUY</strong> "Fed rate cut by June" @ $0.42 — Reasoning: CPI trending down, Fed language softening. Confidence: 72%</span><span class="pipeline-item-time">2d ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📖</span><span class="pipeline-item-text"><strong>SELL</strong> "Tesla $300 by March" @ $0.65 — Reasoning: Target hit, taking profit. Outcome: +$38</span><span class="pipeline-item-time">4d ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--rejected">📖</span><span class="pipeline-item-text"><strong>LOSS</strong> "UK election before Oct" @ $0.55 → $0.32 — Reasoning was wrong, PM confirmed no early election. Loss: -$23</span><span class="pipeline-item-time">1w ago</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--approved">📖</span><span class="pipeline-item-text"><strong>BUY</strong> "BTC above $80K EOY" @ $0.35 — Reasoning: ETF inflows accelerating, halving effect. Confidence: 68%</span><span class="pipeline-item-time">1w ago</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Pattern Analysis</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--info">🔍</span><span class="pipeline-item-text">Pattern: Higher win rate on economic markets (76%) vs political (58%)</span><span class="pipeline-item-time">Insight</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--info">🔍</span><span class="pipeline-item-text">Pattern: Positions held > 14 days have better outcomes (+22% vs +8%)</span><span class="pipeline-item-time">Insight</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status pipeline-item-status--info">🔍</span><span class="pipeline-item-text">Pattern: Confidence > 70% correlates with 82% win rate</span><span class="pipeline-item-time">Insight</span></div>
        </div>
      </div>
    `;
  }
}

// ---------------------------------------------------------------------------
// Shaar Agent
// ---------------------------------------------------------------------------

export class ShaarAgentView extends BasePillarView {
  protected title = 'Shaar Guardian';
  protected agentName = 'Shaar Guardian';
  protected agentProgramId = 'shaar-guardian';
  protected welcomeMessage = 'Shaar Guardian online. I autonomously observe and evaluate the dashboard from the human perspective. I detect UX friction, evaluate visual design quality, audit data truth, verify agentic behavior visibility, and assess revenue workflow effectiveness.\n\nI generate a Readiness Score (0-100) across all dimensions and provide specific, evidence-based improvement recommendations.\n\nTry asking me:\n• "Review the King\'s View tab"\n• "What\'s the current readiness score?"\n• "What are the top UX issues?"\n• "How can we improve revenue workflows?"';

  protected renderContent(): string {
    return `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Readiness Score</div>
          <div class="metric-value" id="shaar-readiness-score">—</div>
          <div class="metric-trend metric-trend--neutral" id="shaar-readiness-grade">Ask me to run a review</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">UX Quality</div>
          <div class="metric-value" id="shaar-ux-score">—</div>
          <div class="metric-trend metric-trend--neutral">Friction detection</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Data Truth</div>
          <div class="metric-value" id="shaar-data-score">—</div>
          <div class="metric-trend metric-trend--neutral">Mock data detection</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Revenue Readiness</div>
          <div class="metric-value" id="shaar-revenue-score">—</div>
          <div class="metric-trend metric-trend--neutral">Workflow completeness</div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Evaluation Dimensions</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status">🔍</span><span class="pipeline-item-text"><strong>UX Friction</strong> — Missing labels, dead-ends, hidden status, cognitive overload</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status">🎨</span><span class="pipeline-item-text"><strong>Visual Design</strong> — Layout, hierarchy, spacing, typography, color, CTAs</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status">📊</span><span class="pipeline-item-text"><strong>Data Truth</strong> — Mock data, placeholders, stale metrics, disconnected sources</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status">🤖</span><span class="pipeline-item-text"><strong>Agentic Visibility</strong> — Execution traces, memory, tools, delegation status</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status">💰</span><span class="pipeline-item-text"><strong>Revenue Workflows</strong> — Pipeline completeness, monetization, conversion paths</span></div>
        </div>
      </div>
      <div class="data-section">
        <h3 class="data-section-title">Quick Commands</h3>
        <div class="pipeline-list">
          <div class="pipeline-item"><span class="pipeline-item-status">📋</span><span class="pipeline-item-text">"Review the [tab name] tab" — Full page analysis</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status">📊</span><span class="pipeline-item-text">"What's the readiness score?" — Overall system readiness</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status">🚨</span><span class="pipeline-item-text">"What are the top issues?" — Critical improvements needed</span></div>
          <div class="pipeline-item"><span class="pipeline-item-status">📤</span><span class="pipeline-item-text">"Send that to Kiro" — Dispatch approved recommendation</span></div>
        </div>
      </div>
    `;
  }
}
