/**
 * Unit tests for NotificationPreferences component.
 *
 * Requirements: 41.5, 41.1, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationPreferences } from '../NotificationPreferences.js';
import type { NotificationRuleConfig } from '../NotificationPreferences.js';

describe('NotificationPreferences', () => {
  let container: HTMLElement;
  let onSaveRules: ReturnType<typeof vi.fn>;

  const sampleRules: NotificationRuleConfig[] = [
    {
      id: 'rule-1',
      agentIds: ['agent-seraphim'],
      priorityMin: 'high',
      channels: ['dashboard', 'telegram'],
      escalation: { timeout: 300, escalateToChannel: 'imessage' },
    },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    onSaveRules = vi.fn();
  });

  function createPreferences(rules: NotificationRuleConfig[] = sampleRules) {
    return new NotificationPreferences(container, {
      userId: 'user-king',
      rules,
      availableAgents: [
        { id: 'agent-seraphim', name: 'Seraphim' },
        { id: 'agent-eretz', name: 'Eretz' },
      ],
      onSaveRules,
    });
  }

  it('renders the notification preferences panel', () => {
    createPreferences();
    expect(container.querySelector('.notification-preferences')).not.toBeNull();
    expect(container.querySelector('.notification-title')?.textContent).toBe('Notification Preferences');
  });

  it('renders existing rules', () => {
    createPreferences();
    const rules = container.querySelectorAll('.notification-rule');
    expect(rules.length).toBe(1);
  });

  it('renders empty state when no rules', () => {
    createPreferences([]);
    expect(container.querySelector('.notification-empty')).not.toBeNull();
  });

  it('renders channel badges for rules', () => {
    createPreferences();
    const badges = container.querySelectorAll('.channel-badge');
    expect(badges.length).toBe(2); // dashboard + telegram
  });

  it('renders escalation info when configured', () => {
    createPreferences();
    const escalation = container.querySelector('.rule-escalation');
    expect(escalation?.textContent).toContain('300s');
    expect(escalation?.textContent).toContain('imessage');
  });

  it('getRules returns current rules', () => {
    const prefs = createPreferences();
    expect(prefs.getRules()).toHaveLength(1);
    expect(prefs.getRules()[0].id).toBe('rule-1');
  });

  it('addRule adds a new rule and re-renders', () => {
    const prefs = createPreferences();
    prefs.addRule({ id: 'rule-2', channels: ['email'] });

    expect(prefs.getRules()).toHaveLength(2);
    const rules = container.querySelectorAll('.notification-rule');
    expect(rules.length).toBe(2);
  });

  it('removeRule removes a rule by ID', () => {
    const prefs = createPreferences();
    prefs.removeRule('rule-1');

    expect(prefs.getRules()).toHaveLength(0);
    expect(container.querySelector('.notification-empty')).not.toBeNull();
  });

  it('updateRule updates an existing rule', () => {
    const prefs = createPreferences();
    prefs.updateRule('rule-1', { priorityMin: 'critical' });

    const rules = prefs.getRules();
    expect(rules[0].priorityMin).toBe('critical');
  });

  it('save calls onSaveRules with current rules', () => {
    const prefs = createPreferences();
    prefs.save();

    expect(onSaveRules).toHaveBeenCalledWith(sampleRules);
  });

  it('destroy cleans up the container', () => {
    const prefs = createPreferences();
    prefs.destroy();
    expect(container.innerHTML).toBe('');
  });
});
