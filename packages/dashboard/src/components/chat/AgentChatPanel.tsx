/**
 * AgentChatPanel — Main chat panel component for agent communication.
 *
 * Displays a per-agent chat interface with message list, input area,
 * presence indicator, and priority selector.
 *
 * Requirements: 37a.1, 37a.4, 37b.6, 37e.15
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessageData {
  id: string;
  sender: 'user' | 'agent';
  senderName: string;
  content: string;
  timestamp: Date;
  source: 'dashboard' | 'telegram' | 'api';
  priority: 'low' | 'normal' | 'high' | 'critical';
  delegations?: Array<{
    delegatedTo: string;
    taskDescription: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
  }>;
}

export interface AgentChatPanelOptions {
  agentId: string;
  agentName: string;
  onSendMessage: (content: string, priority: string, taggedAgents?: string[]) => void;
  onLoadHistory?: (filter?: { userId?: string }) => Promise<ChatMessageData[]>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class AgentChatPanel {
  private container: HTMLElement;
  private options: AgentChatPanelOptions;
  private messages: ChatMessageData[] = [];
  private showUnifiedHistory = false;

  constructor(container: HTMLElement, options: AgentChatPanelOptions) {
    this.container = container;
    this.options = options;
    this.render();
  }

  /** Add a new message to the chat panel. */
  addMessage(message: ChatMessageData): void {
    this.messages.push(message);
    this.render();
  }

  /** Set all messages (e.g., after loading history). */
  setMessages(messages: ChatMessageData[]): void {
    this.messages = messages;
    this.render();
  }

  /** Toggle between unified history and personal messages. */
  toggleUnifiedHistory(): void {
    this.showUnifiedHistory = !this.showUnifiedHistory;
    this.render();
  }

  /** Get the current unified history toggle state. */
  isUnifiedHistoryEnabled(): boolean {
    return this.showUnifiedHistory;
  }

  /** Render the chat panel. */
  render(): void {
    this.container.innerHTML = `
      <div class="agent-chat-panel" data-agent-id="${this.options.agentId}">
        <div class="chat-header">
          <h3 class="chat-agent-name">${this.options.agentName}</h3>
          <div class="chat-presence-slot"></div>
          <button class="chat-toggle-history" aria-label="Toggle unified history">
            ${this.showUnifiedHistory ? 'My Messages' : 'All Messages'}
          </button>
        </div>
        <div class="chat-messages" role="log" aria-live="polite">
          ${this.renderMessages()}
        </div>
        <div class="chat-input-area">
          <div class="chat-mention-input-slot"></div>
          <div class="chat-priority-slot"></div>
          <button class="chat-send-btn" aria-label="Send message">Send</button>
        </div>
      </div>
    `;

    this.attachHandlers();
  }

  private renderMessages(): string {
    if (this.messages.length === 0) {
      return '<div class="chat-empty">No messages yet. Start a conversation.</div>';
    }

    return this.messages
      .map(
        (msg) => `
        <div class="chat-message chat-message--${msg.sender}" data-message-id="${msg.id}">
          <div class="chat-message-header">
            <span class="chat-sender">${msg.senderName}</span>
            <span class="chat-timestamp">${msg.timestamp.toLocaleTimeString()}</span>
            <span class="chat-source-badge">${msg.source}</span>
            ${msg.priority !== 'normal' ? `<span class="chat-priority-badge chat-priority--${msg.priority}">${msg.priority}</span>` : ''}
          </div>
          <div class="chat-message-content">${msg.content}</div>
          ${msg.delegations ? this.renderDelegations(msg.delegations) : ''}
        </div>
      `,
      )
      .join('');
  }

  private renderDelegations(
    delegations: NonNullable<ChatMessageData['delegations']>,
  ): string {
    return `
      <div class="chat-delegations">
        ${delegations
          .map(
            (d) => `
          <div class="chat-delegation chat-delegation--${d.status}">
            <span class="delegation-icon">→</span>
            <span class="delegation-to">${d.delegatedTo}</span>
            <span class="delegation-task">${d.taskDescription}</span>
            <span class="delegation-status">${d.status}</span>
          </div>
        `,
          )
          .join('')}
      </div>
    `;
  }

  private attachHandlers(): void {
    const sendBtn = this.container.querySelector('.chat-send-btn');
    sendBtn?.addEventListener('click', () => {
      // Placeholder: actual input wiring done via AgentMentionInput
      this.options.onSendMessage('', 'normal');
    });

    const toggleBtn = this.container.querySelector('.chat-toggle-history');
    toggleBtn?.addEventListener('click', () => {
      this.toggleUnifiedHistory();
    });
  }

  /** Destroy the component and clean up. */
  destroy(): void {
    this.container.innerHTML = '';
    this.messages = [];
  }
}
