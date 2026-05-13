/**
 * Unit tests for AgentMentionInput component.
 *
 * Requirements: 37c.10, 37a.4, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentMentionInput } from '../AgentMentionInput.js';
import type { AgentInfo } from '../AgentMentionInput.js';

describe('AgentMentionInput', () => {
  let container: HTMLElement;
  let onSubmit: ReturnType<typeof vi.fn>;
  const agents: AgentInfo[] = [
    { id: 'agent-seraphim', name: 'Seraphim', pillar: 'Core' },
    { id: 'agent-eretz', name: 'Eretz', pillar: 'Business' },
    { id: 'agent-zionx', name: 'ZionX', pillar: 'Product' },
    { id: 'agent-zxmg', name: 'ZXMG', pillar: 'Marketing' },
    { id: 'agent-alpha', name: 'Alpha', pillar: 'Trading' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    onSubmit = vi.fn();
  });

  function createInput() {
    return new AgentMentionInput(container, {
      availableAgents: agents,
      onSubmit,
    });
  }

  it('renders the input field', () => {
    createInput();
    const input = container.querySelector('.mention-input-field');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('aria-label')).toBe('Message input with agent mentions');
  });

  it('renders with placeholder text', () => {
    new AgentMentionInput(container, {
      availableAgents: agents,
      placeholder: 'Custom placeholder',
      onSubmit,
    });
    const input = container.querySelector<HTMLInputElement>('.mention-input-field');
    expect(input?.placeholder).toBe('Custom placeholder');
  });

  it('getValue returns current input value', () => {
    const mentionInput = createInput();
    mentionInput.setValue('Hello @Seraphim');
    expect(mentionInput.getValue()).toBe('Hello @Seraphim');
  });

  it('getTaggedAgents extracts mentioned agent IDs', () => {
    const mentionInput = createInput();
    mentionInput.setValue('Hey @Seraphim and @Eretz please help');
    const tagged = mentionInput.getTaggedAgents();
    expect(tagged).toContain('agent-seraphim');
    expect(tagged).toContain('agent-eretz');
  });

  it('getTaggedAgents returns empty array when no mentions', () => {
    const mentionInput = createInput();
    mentionInput.setValue('Hello world');
    expect(mentionInput.getTaggedAgents()).toEqual([]);
  });

  it('clear resets the input value', () => {
    const mentionInput = createInput();
    mentionInput.setValue('Some text');
    mentionInput.clear();
    expect(mentionInput.getValue()).toBe('');
  });

  it('setAvailableAgents updates the agent list', () => {
    const mentionInput = createInput();
    mentionInput.setAvailableAgents([{ id: 'new-agent', name: 'NewAgent', pillar: 'Test' }]);
    mentionInput.setValue('@NewAgent');
    const tagged = mentionInput.getTaggedAgents();
    expect(tagged).toContain('new-agent');
  });

  it('destroy cleans up the container', () => {
    const mentionInput = createInput();
    mentionInput.destroy();
    expect(container.innerHTML).toBe('');
  });
});
