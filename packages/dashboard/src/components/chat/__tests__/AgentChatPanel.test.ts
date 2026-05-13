/**
 * Unit tests for AgentChatPanel component.
 *
 * Requirements: 37a.1, 37a.4, 37b.6, 37e.15, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentChatPanel } from '../AgentChatPanel.js';
import type { ChatMessageData } from '../AgentChatPanel.js';

describe('AgentChatPanel', () => {
  let container: HTMLElement;
  let onSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    onSendMessage = vi.fn();
  });

  function createPanel() {
    return new AgentChatPanel(container, {
      agentId: 'agent-seraphim',
      agentName: 'Seraphim',
      onSendMessage,
    });
  }

  function makeMessage(overrides: Partial<ChatMessageData> = {}): ChatMessageData {
    return {
      id: 'msg-1',
      sender: 'user',
      senderName: 'King',
      content: 'Hello Seraphim',
      timestamp: new Date('2024-01-15T10:00:00Z'),
      source: 'dashboard',
      priority: 'normal',
      ...overrides,
    };
  }

  it('renders the chat panel with agent name', () => {
    createPanel();
    expect(container.querySelector('.chat-agent-name')?.textContent).toBe('Seraphim');
  });

  it('renders empty state when no messages', () => {
    createPanel();
    expect(container.querySelector('.chat-empty')).not.toBeNull();
  });

  it('renders messages with correct attribution', () => {
    const panel = createPanel();
    panel.addMessage(makeMessage({ senderName: 'King', sender: 'user' }));

    const senderEl = container.querySelector('.chat-sender');
    expect(senderEl?.textContent).toBe('King');
  });

  it('renders messages with source indicators', () => {
    const panel = createPanel();
    panel.addMessage(makeMessage({ source: 'telegram' }));

    const sourceEl = container.querySelector('.chat-source-badge');
    expect(sourceEl?.textContent).toBe('telegram');
  });

  it('renders priority badges for non-normal priorities', () => {
    const panel = createPanel();
    panel.addMessage(makeMessage({ priority: 'critical' }));

    const badge = container.querySelector('.chat-priority-badge');
    expect(badge?.textContent).toBe('critical');
    expect(badge?.classList.contains('chat-priority--critical')).toBe(true);
  });

  it('does not render priority badge for normal priority', () => {
    const panel = createPanel();
    panel.addMessage(makeMessage({ priority: 'normal' }));

    expect(container.querySelector('.chat-priority-badge')).toBeNull();
  });

  it('renders delegation indicators', () => {
    const panel = createPanel();
    panel.addMessage(
      makeMessage({
        delegations: [
          { delegatedTo: 'Eretz', taskDescription: 'Analyze portfolio', status: 'in_progress' },
        ],
      }),
    );

    const delegation = container.querySelector('.chat-delegation');
    expect(delegation).not.toBeNull();
    expect(delegation?.textContent).toContain('Eretz');
    expect(delegation?.textContent).toContain('Analyze portfolio');
  });

  it('toggles unified history view', () => {
    const panel = createPanel();
    expect(panel.isUnifiedHistoryEnabled()).toBe(false);

    panel.toggleUnifiedHistory();
    expect(panel.isUnifiedHistoryEnabled()).toBe(true);

    const toggleBtn = container.querySelector('.chat-toggle-history');
    expect(toggleBtn?.textContent).toContain('My Messages');
  });

  it('sets messages from history', () => {
    const panel = createPanel();
    panel.setMessages([
      makeMessage({ id: 'msg-1', content: 'First' }),
      makeMessage({ id: 'msg-2', content: 'Second' }),
    ]);

    const messages = container.querySelectorAll('.chat-message');
    expect(messages.length).toBe(2);
  });

  it('destroy cleans up the container', () => {
    const panel = createPanel();
    panel.addMessage(makeMessage());
    panel.destroy();

    expect(container.innerHTML).toBe('');
  });
});
