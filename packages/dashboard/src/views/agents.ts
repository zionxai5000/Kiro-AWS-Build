/**
 * Shaar Dashboard — Agents View
 *
 * Displays live agent status cards showing state, pillar, resource
 * consumption, and health. Connected to WebSocket for real-time updates
 * when agent state changes.
 *
 * Clicking an agent card opens the AgentDetailPanel modal with full
 * identity, status, and activity information.
 *
 * Requirements: 9.1, 18.1, 18.5, 48a.1, 48g.26
 */

import type { AgentData, DashboardWebSocket, WebSocketMessage } from '../api.js';
import { fetchAgents } from '../api.js';
import { AgentDetailPanel } from '../components/command-center/AgentDetailPanel.js';
import type { AgentDetailData } from '../components/command-center/AgentDetailPanel.js';

export class AgentsView {
  private container: HTMLElement;
  private ws: DashboardWebSocket;
  private agents: AgentData[] = [];
  private loading = true;
  private error: string | null = null;
  private wsHandler: ((msg: WebSocketMessage) => void) | null = null;

  constructor(container: HTMLElement, ws: DashboardWebSocket) {
    this.container = container;
    this.ws = ws;
  }

  async mount(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.render();

    // Subscribe to real-time agent state changes
    this.wsHandler = (message: WebSocketMessage) => {
      const data = message.data;
      const agentId = data.agentId as string | undefined;
      if (!agentId) return;

      const idx = this.agents.findIndex((a) => a.id === agentId);
      if (idx >= 0) {
        // Update existing agent
        if (data.state !== undefined) this.agents[idx]!.state = data.state as AgentData['state'];
        if (data.pillar !== undefined) this.agents[idx]!.pillar = data.pillar as string;
        if (data.resourceUsage !== undefined) this.agents[idx]!.resourceUsage = data.resourceUsage as AgentData['resourceUsage'];
        if (data.lastHeartbeat !== undefined) this.agents[idx]!.lastHeartbeat = data.lastHeartbeat as string;
      } else {
        // New agent appeared
        this.agents.push(data as unknown as AgentData);
      }
      this.render();
    };
    this.ws.on('agent.state.changed', this.wsHandler);

    try {
      this.agents = await fetchAgents();
      this.loading = false;
    } catch (err) {
      this.loading = false;
      this.error = (err as Error).message;
    }
    this.render();
  }

  unmount(): void {
    if (this.wsHandler) {
      this.ws.off('agent.state.changed', this.wsHandler);
      this.wsHandler = null;
    }
  }

  private render(): void {
    if (this.loading) {
      this.container.innerHTML = '<div class="view-loading" role="status">Loading agents…</div>';
      return;
    }

    if (this.error) {
      this.container.innerHTML = `<div class="view-error" role="alert">Error loading agents: ${escapeHtml(this.error)}</div>`;
      return;
    }

    if (this.agents.length === 0) {
      this.container.innerHTML = '<div class="view-empty">No agents are currently registered.</div>';
      return;
    }

    const cards = this.agents.map((agent) => this.renderCard(agent)).join('');

    this.container.innerHTML = `
      <div class="view-header">
        <h2>Agents</h2>
        <span class="agent-count">${this.agents.length} agent${this.agents.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="agent-grid">${cards}</div>
    `;

    this.attachCardClickHandlers();
  }

  private attachCardClickHandlers(): void {
    const cards = this.container.querySelectorAll('.agent-card');
    cards.forEach((card) => {
      (card as HTMLElement).style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const agentId = (card as HTMLElement).dataset.agentId;
        const agent = this.agents.find((a) => a.id === agentId);
        if (!agent) return;
        this.showAgentDetail(agent);
      });
    });
  }

  private async showAgentDetail(agent: AgentData): Promise<void> {
    // Attempt to fetch identity profile from backend
    let identityProfile: AgentDetailData['identityProfile'] | undefined;
    try {
      const API_BASE =
        (window as any).__SERAPHIM_API_URL__?.replace(/\/api$/, '') ||
        '';
      const res = await fetch(`${API_BASE}/api/agents/${agent.id}/profile`);
      if (res.ok) {
        const data = await res.json();
        identityProfile = data.identityProfile;
      }
    } catch {
      /* Profile not available — panel will show without identity section */
    }

    const detailContainer = document.createElement('div');
    document.body.appendChild(detailContainer);

    const detailData: AgentDetailData = {
      id: agent.id,
      name: agent.name ?? agent.programId,
      programId: agent.programId,
      version: agent.version,
      state: agent.state,
      pillar: agent.pillar,
      lastHeartbeat: agent.lastHeartbeat,
      resourceUsage: {
        cpuPercent: agent.resourceUsage?.cpuPercent ?? 0,
        memoryMB: agent.resourceUsage?.memoryMB ?? 0,
        tokensUsed: agent.resourceUsage?.tokensUsed ?? 0,
      },
      identityProfile,
    };

    const panel = new AgentDetailPanel(detailContainer, detailData, {
      onClose: () => {
        panel.destroy();
        detailContainer.remove();
      },
      onChat: (_programId) => {
        panel.destroy();
        detailContainer.remove();
        // Navigate to the agent's pillar chat view
        // This can be wired to the app router when chat views are available
      },
    });
  }

  private renderCard(agent: AgentData): string {
    const stateClass = `state-${agent.state}`;
    const heartbeatAge = agent.lastHeartbeat
      ? formatTimeSince(new Date(agent.lastHeartbeat))
      : 'unknown';
    const cpu = agent.resourceUsage?.cpuPercent ?? 0;
    const mem = agent.resourceUsage?.memoryMB ?? 0;
    const tokens = agent.resourceUsage?.tokensUsed ?? 0;

    return `
      <div class="agent-card ${stateClass}" data-agent-id="${agent.id}">
        <div class="agent-card-header">
          <span class="agent-name">${escapeHtml(agent.name ?? agent.programId)}</span>
          <span class="agent-state-badge ${stateClass}">${agent.state}</span>
        </div>
        <div class="agent-card-body">
          <div class="agent-detail"><span class="label">Pillar:</span> ${escapeHtml(agent.pillar)}</div>
          <div class="agent-detail"><span class="label">Version:</span> ${escapeHtml(agent.version)}</div>
          <div class="agent-detail"><span class="label">CPU:</span> ${cpu.toFixed(1)}%</div>
          <div class="agent-detail"><span class="label">Memory:</span> ${mem.toFixed(0)} MB</div>
          <div class="agent-detail"><span class="label">Tokens:</span> ${tokens.toLocaleString()}</div>
          <div class="agent-detail"><span class="label">Heartbeat:</span> ${heartbeatAge}</div>
        </div>
      </div>
    `;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTimeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
