/**
 * Unit tests for ChatMessage component.
 *
 * Requirements: 37a.1, 37a.4, 37b.6, 19.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChatMessage } from '../ChatMessage.js';
import type { ChatMessageProps } from '../ChatMessage.js';

describe('ChatMessage', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  function makeProps(overrides: Partial<ChatMessageProps> = {}): ChatMessageProps {
    return {
      id: 'msg-1',
      sender: 'user',
      senderName: 'King',
      content: 'Hello agent',
      timestamp: new Date('2024-01-15T10:00:00Z'),
      source: 'dashboard',
      priority: 'normal',
      ...overrides,
    };
  }

  it('renders message with sender name', () => {
    new ChatMessage(container, makeProps({ senderName: 'King' }));
    expect(container.querySelector('.chat-message-sender')?.textContent).toBe('King');
  });

  it('renders message content', () => {
    new ChatMessage(container, makeProps({ content: 'Test message' }));
    expect(container.querySelector('.chat-message-body')?.textContent).toBe('Test message');
  });

  it('renders source indicator for telegram', () => {
    new ChatMessage(container, makeProps({ source: 'telegram' }));
    const indicator = container.querySelector('.chat-source-indicator');
    expect(indicator?.textContent).toBe('📱');
    expect(indicator?.getAttribute('title')).toBe('via telegram');
  });

  it('renders source indicator for dashboard', () => {
    new ChatMessage(container, makeProps({ source: 'dashboard' }));
    const indicator = container.querySelector('.chat-source-indicator');
    expect(indicator?.textContent).toBe('💻');
  });

  it('renders priority badge for high priority', () => {
    new ChatMessage(container, makeProps({ priority: 'high' }));
    const badge = container.querySelector('.chat-priority-badge');
    expect(badge?.textContent).toBe('high');
    expect(badge?.classList.contains('chat-priority--high')).toBe(true);
  });

  it('does not render priority badge for normal priority', () => {
    new ChatMessage(container, makeProps({ priority: 'normal' }));
    expect(container.querySelector('.chat-priority-badge')).toBeNull();
  });

  it('renders delegation indicators when present', () => {
    new ChatMessage(
      container,
      makeProps({
        delegations: [
          { delegatedTo: 'ZionX', taskDescription: 'Build feature', status: 'completed' },
        ],
      }),
    );

    const delegations = container.querySelector('.chat-message-delegations');
    expect(delegations).not.toBeNull();
    expect(delegations?.textContent).toContain('ZionX');
    expect(delegations?.textContent).toContain('Build feature');
  });

  it('applies correct CSS class for sender type', () => {
    new ChatMessage(container, makeProps({ sender: 'agent' }));
    expect(container.querySelector('.chat-message--agent')).not.toBeNull();
  });

  it('update() re-renders with new props', () => {
    const msg = new ChatMessage(container, makeProps({ content: 'Original' }));
    msg.update({ content: 'Updated' });
    expect(container.querySelector('.chat-message-body')?.textContent).toBe('Updated');
  });

  it('getId() returns the message ID', () => {
    const msg = new ChatMessage(container, makeProps({ id: 'msg-42' }));
    expect(msg.getId()).toBe('msg-42');
  });

  it('destroy cleans up the container', () => {
    const msg = new ChatMessage(container, makeProps());
    msg.destroy();
    expect(container.innerHTML).toBe('');
  });
});
