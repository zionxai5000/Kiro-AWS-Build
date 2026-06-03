/**
 * Hermes Agents View — Chat interface to Docker-based autonomous agents
 *
 * Each agent runs in its own Docker container and is accessible via HTTP.
 * This view provides a chat panel that sends messages to the selected agent
 * and displays responses in real-time.
 *
 * Agents:
 * - ZXMG Scout (port 3001) — YouTube content research
 * - Zion Alpha (port 3002) — Prediction market scanning
 * - ZionX Scout (port 3003) — App store research
 * - Personal Assistant (port 3004) — Executive aide
 */

interface HermesAgentConfig {
  id: string;
  name: string;
  port: number;
  description: string;
  icon: string;
  status: 'running' | 'stopped' | 'error';
}

const HERMES_AGENTS: HermesAgentConfig[] = [
  {
    id: 'zxmg',
    name: 'ZXMG Scout',
    port: 3001,
    description: 'YouTube content research, trend analysis, production formulas',
    icon: '🎬',
    status: 'running',
  },
  {
    id: 'zion-alpha',
    name: 'Zion Alpha',
    port: 3002,
    description: 'Prediction market scanning, edge detection, trade recommendations',
    icon: '📈',
    status: 'running',
  },
  {
    id: 'zionx',
    name: 'ZionX Scout',
    port: 3003,
    description: 'App store research, niche analysis, competitor tracking',
    icon: '📱',
    status: 'running',
  },
  {
    id: 'personal',
    name: 'Personal Assistant',
    port: 3004,
    description: 'Daily briefings, directive drafting, priority management',
    icon: '👑',
    status: 'running',
  },
];

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

export class HermesAgentView {
  private container: HTMLElement;
  private activeAgent: HermesAgentConfig;
  private messages: ChatMessage[] = [];
  private isLoading = false;

  constructor(container: HTMLElement, agentId: string) {
    this.container = container;
    this.activeAgent = HERMES_AGENTS.find(a => a.id === agentId) ?? HERMES_AGENTS[0];
  }

  async mount(): Promise<void> {
    this.render();
    await this.checkAgentHealth();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="hermes-view">
        <div class="hermes-header">
          <div class="hermes-agent-info">
            <span class="hermes-agent-icon">${this.activeAgent.icon}</span>
            <div>
              <h2>${this.activeAgent.name}</h2>
              <p class="hermes-agent-desc">${this.activeAgent.description}</p>
            </div>
          </div>
          <div class="hermes-agent-status" id="agent-status">
            <span class="status-dot status-checking"></span>
            <span>Checking...</span>
          </div>
        </div>

        <div class="hermes-agent-selector">
          ${HERMES_AGENTS.map(agent => `
            <button class="agent-tab ${agent.id === this.activeAgent.id ? 'active' : ''}"
                    data-agent-id="${agent.id}">
              ${agent.icon} ${agent.name}
            </button>
          `).join('')}
        </div>

        <div class="hermes-chat" id="hermes-chat-messages">
          <div class="chat-welcome">
            <p>Connected to <strong>${this.activeAgent.name}</strong>. This agent writes output to your Obsidian vault automatically.</p>
            <p>Try: <em>"Research the top 3 trends in your domain and write findings to the vault"</em></p>
          </div>
        </div>

        <div class="hermes-input-area">
          <textarea id="hermes-input" placeholder="Message ${this.activeAgent.name}..." rows="2"></textarea>
          <button id="hermes-send" class="send-btn">Send</button>
        </div>

        <div class="hermes-actions">
          <button class="action-btn" id="btn-telegram">📱 Connect Telegram</button>
          <button class="action-btn" id="btn-cron">⏰ Set Cron Schedule</button>
          <button class="action-btn" id="btn-vault">📂 View Vault Output</button>
        </div>
      </div>

      <style>
        .hermes-view {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 60px);
          padding: 1rem;
          gap: 0.75rem;
        }
        .hermes-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #333;
        }
        .hermes-agent-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .hermes-agent-icon {
          font-size: 2rem;
        }
        .hermes-agent-info h2 {
          margin: 0;
          font-size: 1.25rem;
        }
        .hermes-agent-desc {
          margin: 0;
          color: #888;
          font-size: 0.85rem;
        }
        .hermes-agent-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .status-dot.status-running { background: #10b981; }
        .status-dot.status-stopped { background: #ef4444; }
        .status-dot.status-checking { background: #f59e0b; animation: pulse 1s infinite; }
        @keyframes pulse { 50% { opacity: 0.5; } }

        .hermes-agent-selector {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .agent-tab {
          padding: 0.4rem 0.75rem;
          border: 1px solid #444;
          border-radius: 6px;
          background: #1a1a2e;
          color: #ccc;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }
        .agent-tab:hover { border-color: #7c3aed; color: #fff; }
        .agent-tab.active { border-color: #7c3aed; background: #7c3aed22; color: #fff; }

        .hermes-chat {
          flex: 1;
          overflow-y: auto;
          background: #0d0d1a;
          border-radius: 8px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .chat-welcome {
          color: #666;
          font-size: 0.9rem;
          text-align: center;
          padding: 2rem;
        }
        .chat-welcome em { color: #7c3aed; }
        .chat-msg {
          padding: 0.6rem 0.9rem;
          border-radius: 8px;
          max-width: 85%;
          font-size: 0.9rem;
          line-height: 1.5;
          white-space: pre-wrap;
        }
        .chat-msg.user {
          background: #7c3aed;
          color: #fff;
          align-self: flex-end;
        }
        .chat-msg.agent {
          background: #1e1e3a;
          color: #e0e0e0;
          align-self: flex-start;
          border: 1px solid #333;
        }
        .chat-msg.loading {
          color: #888;
          font-style: italic;
        }

        .hermes-input-area {
          display: flex;
          gap: 0.5rem;
          align-items: flex-end;
        }
        #hermes-input {
          flex: 1;
          padding: 0.6rem;
          background: #1a1a2e;
          border: 1px solid #444;
          border-radius: 6px;
          color: #fff;
          font-size: 0.9rem;
          resize: none;
          font-family: inherit;
        }
        #hermes-input:focus { border-color: #7c3aed; outline: none; }
        .send-btn {
          padding: 0.6rem 1.2rem;
          background: #7c3aed;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
        }
        .send-btn:hover { background: #6d28d9; }
        .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .hermes-actions {
          display: flex;
          gap: 0.5rem;
        }
        .action-btn {
          padding: 0.4rem 0.75rem;
          background: #1a1a2e;
          border: 1px solid #444;
          border-radius: 6px;
          color: #ccc;
          cursor: pointer;
          font-size: 0.8rem;
        }
        .action-btn:hover { border-color: #7c3aed; color: #fff; }
      </style>
    `;

    // Event listeners
    this.container.querySelectorAll('.agent-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const agentId = (btn as HTMLElement).dataset.agentId!;
        this.switchAgent(agentId);
      });
    });

    const input = this.container.querySelector('#hermes-input') as HTMLTextAreaElement;
    const sendBtn = this.container.querySelector('#hermes-send') as HTMLButtonElement;

    sendBtn.addEventListener('click', () => this.sendMessage(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage(input);
      }
    });

    // Action buttons
    this.container.querySelector('#btn-telegram')?.addEventListener('click', () => {
      this.showTelegramSetup();
    });
    this.container.querySelector('#btn-cron')?.addEventListener('click', () => {
      this.showCronSetup();
    });
    this.container.querySelector('#btn-vault')?.addEventListener('click', () => {
      window.open('obsidian://open?vault=vault', '_blank');
    });
  }

  private switchAgent(agentId: string): void {
    this.activeAgent = HERMES_AGENTS.find(a => a.id === agentId) ?? HERMES_AGENTS[0];
    this.messages = [];
    this.render();
    this.checkAgentHealth();
  }

  private async sendMessage(input: HTMLTextAreaElement): Promise<void> {
    const text = input.value.trim();
    if (!text || this.isLoading) return;

    input.value = '';
    this.messages.push({ role: 'user', content: text, timestamp: new Date() });
    this.renderMessages();

    this.isLoading = true;
    const sendBtn = this.container.querySelector('#hermes-send') as HTMLButtonElement;
    sendBtn.disabled = true;

    try {
      // Call the Hermes container's API
      const response = await fetch(`http://localhost:${this.activeAgent.port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (response.ok) {
        const data = await response.json();
        this.messages.push({
          role: 'agent',
          content: data.response ?? data.message ?? 'Done.',
          timestamp: new Date(),
        });
      } else {
        this.messages.push({
          role: 'agent',
          content: `Error: ${response.status} — ${response.statusText}. The agent may need to be accessed via terminal: docker exec -it seraphim-${this.activeAgent.id} hermes`,
          timestamp: new Date(),
        });
      }
    } catch {
      this.messages.push({
        role: 'agent',
        content: `Cannot reach agent on port ${this.activeAgent.port}. Use terminal instead:\n\ndocker exec -it seraphim-${this.activeAgent.id} hermes`,
        timestamp: new Date(),
      });
    }

    this.isLoading = false;
    sendBtn.disabled = false;
    this.renderMessages();
  }

  private renderMessages(): void {
    const chat = this.container.querySelector('#hermes-chat-messages');
    if (!chat) return;

    if (this.messages.length === 0) {
      chat.innerHTML = `
        <div class="chat-welcome">
          <p>Connected to <strong>${this.activeAgent.name}</strong>. This agent writes output to your Obsidian vault automatically.</p>
          <p>Try: <em>"Research the top 3 trends in your domain and write findings to the vault"</em></p>
        </div>
      `;
      return;
    }

    chat.innerHTML = this.messages.map(msg => `
      <div class="chat-msg ${msg.role}">
        ${msg.content}
      </div>
    `).join('');

    if (this.isLoading) {
      chat.innerHTML += `<div class="chat-msg agent loading">Thinking...</div>`;
    }

    chat.scrollTop = chat.scrollHeight;
  }

  private async checkAgentHealth(): Promise<void> {
    const statusEl = this.container.querySelector('#agent-status');
    if (!statusEl) return;

    try {
      const response = await fetch(`http://localhost:${this.activeAgent.port}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        statusEl.innerHTML = `<span class="status-dot status-running"></span><span>Running</span>`;
      } else {
        statusEl.innerHTML = `<span class="status-dot status-stopped"></span><span>Error</span>`;
      }
    } catch {
      statusEl.innerHTML = `<span class="status-dot status-stopped"></span><span>Use terminal</span>`;
    }
  }

  private showTelegramSetup(): void {
    const chat = this.container.querySelector('#hermes-chat-messages');
    if (!chat) return;
    this.messages.push({
      role: 'agent',
      content: `To connect ${this.activeAgent.name} to Telegram:\n\n1. Open terminal: docker exec -it seraphim-${this.activeAgent.id} hermes\n2. Run: hermes gateway setup\n3. Select Telegram\n4. Enter bot token from AWS Secrets Manager\n\nOnce connected, you can message this agent directly from your phone.`,
      timestamp: new Date(),
    });
    this.renderMessages();
  }

  private showCronSetup(): void {
    const chat = this.container.querySelector('#hermes-chat-messages');
    if (!chat) return;
    this.messages.push({
      role: 'agent',
      content: `To set a cron for ${this.activeAgent.name}:\n\n1. Open terminal: docker exec -it seraphim-${this.activeAgent.id} hermes\n2. Tell it: "Every 6 hours, research [your topic] and write findings to /opt/vault/02 - Knowledge/${this.activeAgent.name}/"\n\nThe agent will create the cron automatically and run it on schedule.`,
      timestamp: new Date(),
    });
    this.renderMessages();
  }
}
