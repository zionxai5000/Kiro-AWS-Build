/**
 * Unit tests for PresenceIndicator component.
 *
 * Requirements: 37e.15, 37e.16, 19.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PresenceIndicator } from '../PresenceIndicator.js';
import type { AgentPresenceStatus } from '../PresenceIndicator.js';

describe('PresenceIndicator', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('renders with idle status', () => {
    new PresenceIndicator(container, { agentId: 'agent-1', status: 'idle' });
    expect(container.querySelector('.presence-label')?.textContent).toBe('Idle');
    expect(container.querySelector('.presence-indicator--idle')).not.toBeNull();
  });

  it('renders with working status', () => {
    new PresenceIndicator(container, { agentId: 'agent-1', status: 'working' });
    expect(container.querySelector('.presence-label')?.textContent).toBe('Working');
  });

  it('renders with thinking status', () => {
    new PresenceIndicator(container, { agentId: 'agent-1', status: 'thinking' });
    expect(container.querySelector('.presence-label')?.textContent).toBe('Thinking');
  });

  it('renders current task when provided', () => {
    new PresenceIndicator(container, {
      agentId: 'agent-1',
      status: 'working',
      currentTask: 'Analyzing portfolio',
    });
    expect(container.querySelector('.presence-task')?.textContent).toBe('Analyzing portfolio');
  });

  it('renders parallel task count when > 1', () => {
    new PresenceIndicator(container, {
      agentId: 'agent-1',
      status: 'parallel_processing',
      parallelTaskCount: 3,
    });
    expect(container.querySelector('.presence-parallel')?.textContent).toContain('3 tasks');
  });

  it('renders queue depth when > 0', () => {
    new PresenceIndicator(container, {
      agentId: 'agent-1',
      status: 'working',
      queueDepth: 5,
    });
    expect(container.querySelector('.presence-queue')?.textContent).toContain('5 queued');
  });

  it('updateStatus changes the displayed status', () => {
    const indicator = new PresenceIndicator(container, { agentId: 'agent-1', status: 'idle' });
    indicator.updateStatus('working', { currentTask: 'Processing' });

    expect(container.querySelector('.presence-label')?.textContent).toBe('Working');
    expect(container.querySelector('.presence-task')?.textContent).toBe('Processing');
  });

  it('setQueueDepth updates the queue display', () => {
    const indicator = new PresenceIndicator(container, { agentId: 'agent-1', status: 'idle' });
    indicator.setQueueDepth(3);

    expect(container.querySelector('.presence-queue')?.textContent).toContain('3 queued');
  });

  it('getStatus returns current status', () => {
    const indicator = new PresenceIndicator(container, { agentId: 'agent-1', status: 'degraded' });
    expect(indicator.getStatus()).toBe('degraded');
  });

  it('has proper aria-label for accessibility', () => {
    new PresenceIndicator(container, { agentId: 'agent-1', status: 'working' });
    const el = container.querySelector('[role="status"]');
    expect(el?.getAttribute('aria-label')).toBe('Agent status: Working');
  });

  it('destroy cleans up the container', () => {
    const indicator = new PresenceIndicator(container, { agentId: 'agent-1', status: 'idle' });
    indicator.destroy();
    expect(container.innerHTML).toBe('');
  });
});
