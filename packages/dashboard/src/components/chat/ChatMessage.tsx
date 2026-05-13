/**
 * ChatMessage — Individual message display component.
 *
 * Renders a single chat message with user attribution, timestamps,
 * source indicators, priority badges, and delegation indicators.
 *
 * Requirements: 37a.1, 37a.4, 37b.6
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessageProps {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class ChatMessage {
  private container: HTMLElement;
  private props: ChatMessageProps;

  constructor(container: HTMLElement, props: ChatMessageProps) {
    this.container = container;
    this.props = props;
    this.render();
  }

  /** Update the message props and re-render. */
  update(props: Partial<ChatMessageProps>): void {
    this.props = { ...this.props, ...props };
    this.render();
  }

  /** Get the message ID. */
  getId(): string {
    return this.props.id;
  }

  /** Get the message sender type. */
  getSender(): 'user' | 'agent' {
    return this.props.sender;
  }

  /** Render the message element. */
  render(): void {
    const { id, sender, senderName, content, timestamp, source, priority, delegations } =
      this.props;

    const priorityBadge =
      priority !== 'normal'
        ? `<span class="chat-priority-badge chat-priority--${priority}" role="status">${priority}</span>`
        : '';

    const sourceIndicator = `<span class="chat-source-indicator" title="via ${source}">${source === 'telegram' ? '📱' : source === 'api' ? '🔌' : '💻'}</span>`;

    const delegationHtml = delegations?.length
      ? `<div class="chat-message-delegations">
          ${delegations
            .map(
              (d) =>
                `<div class="delegation-item delegation--${d.status}">
              <span class="delegation-arrow">↳</span>
              <span class="delegation-agent">${d.delegatedTo}</span>: ${d.taskDescription}
              <span class="delegation-badge">${d.status}</span>
            </div>`,
            )
            .join('')}
        </div>`
      : '';

    this.container.innerHTML = `
      <article class="chat-message chat-message--${sender}" data-message-id="${id}" aria-label="Message from ${senderName}">
        <header class="chat-message-header">
          <span class="chat-message-sender">${senderName}</span>
          ${sourceIndicator}
          <time class="chat-message-time" datetime="${timestamp.toISOString()}">${timestamp.toLocaleTimeString()}</time>
          ${priorityBadge}
        </header>
        <div class="chat-message-body">${content}</div>
        ${delegationHtml}
      </article>
    `;
  }

  /** Destroy the component. */
  destroy(): void {
    this.container.innerHTML = '';
  }
}
