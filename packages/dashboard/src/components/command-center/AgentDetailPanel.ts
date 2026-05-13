/**
 * AgentDetailPanel — Shows full agent identity, status, and activity.
 * Opens when a user clicks on an agent card in the Command Center.
 *
 * Requirements: 48a.1, 48g.26, 18.1, 18.5
 */

export interface AgentDetailData {
  id: string;
  name: string;
  programId: string;
  version: string;
  state: string;
  pillar: string;
  lastHeartbeat: string;
  resourceUsage: { cpuPercent: number; memoryMB: number; tokensUsed: number };
  identityProfile?: {
    role: string;
    hierarchyPosition: string;
    personality: { tone: string; verbosity: string; proactivity: string; formality: string };
    expertise: string[];
    domainLanguage: string[];
    decisionPrinciples: string[];
    relationships: Array<{ agentId: string; relationship: string; description: string }>;
  };
}

export class AgentDetailPanel {
  private container: HTMLElement;
  private data: AgentDetailData;
  private onClose: () => void;
  private onChat: (agentId: string) => void;

  constructor(
    container: HTMLElement,
    data: AgentDetailData,
    options: { onClose: () => void; onChat: (agentId: string) => void },
  ) {
    this.container = container;
    this.data = data;
    this.onClose = options.onClose;
    this.onChat = options.onChat;
    this.render();
  }

  render(): void {
    const profile = this.data.identityProfile;
    const stateClass = `state-${this.data.state}`;

    this.container.innerHTML = `
      <div class="agent-detail-overlay" role="dialog" aria-modal="true" aria-label="Agent Details: ${this.escapeHtml(this.data.name)}">
        <div class="agent-detail-modal">
          <div class="agent-detail-header">
            <div class="agent-detail-title-row">
              <h2 class="agent-detail-name">${this.escapeHtml(this.data.name)}</h2>
              <span class="agent-state-badge ${stateClass}">${this.data.state}</span>
            </div>
            <button class="agent-detail-close" aria-label="Close">&times;</button>
          </div>

          <div class="agent-detail-body">
            ${profile ? this.renderIdentity(profile) : '<p class="agent-detail-no-profile">Identity profile not available.</p>'}

            <div class="agent-detail-section">
              <h3>Status</h3>
              <div class="agent-detail-status-grid">
                <div class="agent-detail-stat"><span class="stat-label">State</span><span class="stat-value ${stateClass}">${this.data.state}</span></div>
                <div class="agent-detail-stat"><span class="stat-label">Pillar</span><span class="stat-value">${this.escapeHtml(this.data.pillar)}</span></div>
                <div class="agent-detail-stat"><span class="stat-label">Version</span><span class="stat-value">${this.escapeHtml(this.data.version)}</span></div>
                <div class="agent-detail-stat"><span class="stat-label">Heartbeat</span><span class="stat-value">${this.data.lastHeartbeat || 'N/A'}</span></div>
                <div class="agent-detail-stat"><span class="stat-label">CPU</span><span class="stat-value">${this.data.resourceUsage.cpuPercent.toFixed(1)}%</span></div>
                <div class="agent-detail-stat"><span class="stat-label">Tokens Today</span><span class="stat-value">${this.data.resourceUsage.tokensUsed.toLocaleString()}</span></div>
              </div>
            </div>
          </div>

          <div class="agent-detail-footer">
            <button class="agent-detail-chat-btn">💬 Chat with ${this.escapeHtml(this.data.name)}</button>
          </div>
        </div>
      </div>
    `;

    this.attachHandlers();
  }

  private renderIdentity(profile: NonNullable<AgentDetailData['identityProfile']>): string {
    return `
      <div class="agent-detail-section">
        <h3>Identity</h3>
        <p class="agent-detail-role">${this.escapeHtml(profile.role)}</p>
        <p class="agent-detail-hierarchy">${this.escapeHtml(profile.hierarchyPosition)}</p>
      </div>

      <div class="agent-detail-section">
        <h3>Personality</h3>
        <div class="agent-detail-traits">
          <span class="trait-badge">Tone: ${this.escapeHtml(profile.personality.tone)}</span>
          <span class="trait-badge">Verbosity: ${this.escapeHtml(profile.personality.verbosity)}</span>
          <span class="trait-badge">Proactivity: ${this.escapeHtml(profile.personality.proactivity)}</span>
          <span class="trait-badge">Formality: ${this.escapeHtml(profile.personality.formality)}</span>
        </div>
      </div>

      <div class="agent-detail-section">
        <h3>Expertise</h3>
        <div class="agent-detail-tags">${profile.expertise.map((e) => `<span class="expertise-tag">${this.escapeHtml(e)}</span>`).join('')}</div>
      </div>

      <div class="agent-detail-section">
        <h3>Decision Principles</h3>
        <ol class="agent-detail-principles">${profile.decisionPrinciples.map((p) => `<li>${this.escapeHtml(p)}</li>`).join('')}</ol>
      </div>

      <div class="agent-detail-section">
        <h3>Relationships</h3>
        <div class="agent-detail-relationships">
          ${profile.relationships.map((r) => `
            <div class="relationship-item">
              <span class="relationship-type">${this.escapeHtml(r.relationship)}</span>
              <span class="relationship-agent">${this.escapeHtml(r.agentId)}</span>
              <span class="relationship-desc">${this.escapeHtml(r.description)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private attachHandlers(): void {
    const closeBtn = this.container.querySelector('.agent-detail-close');
    closeBtn?.addEventListener('click', () => this.onClose());

    const overlay = this.container.querySelector('.agent-detail-overlay');
    overlay?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('agent-detail-overlay')) {
        this.onClose();
      }
    });

    const chatBtn = this.container.querySelector('.agent-detail-chat-btn');
    chatBtn?.addEventListener('click', () => this.onChat(this.data.programId));

    // Close on Escape key
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', keyHandler);
        this.onClose();
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
