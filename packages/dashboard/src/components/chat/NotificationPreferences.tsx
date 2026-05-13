/**
 * NotificationPreferences — Notification routing rule configuration component.
 *
 * Allows users to configure notification routing rules including
 * agent filters, priority thresholds, delivery channels, and escalation.
 *
 * Requirements: 41.5, 41.1, 41.2
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationRuleConfig {
  id: string;
  agentIds?: string[];
  priorityMin?: 'low' | 'normal' | 'high' | 'critical';
  notificationType?: string[];
  channels: ('dashboard' | 'telegram' | 'email' | 'imessage')[];
  escalation?: {
    timeout: number;
    escalateToChannel: string;
  };
}

export interface NotificationPreferencesOptions {
  userId: string;
  rules: NotificationRuleConfig[];
  availableAgents: Array<{ id: string; name: string }>;
  onSaveRules: (rules: NotificationRuleConfig[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class NotificationPreferences {
  private container: HTMLElement;
  private options: NotificationPreferencesOptions;
  private rules: NotificationRuleConfig[];

  constructor(container: HTMLElement, options: NotificationPreferencesOptions) {
    this.container = container;
    this.options = options;
    this.rules = [...options.rules];
    this.render();
  }

  /** Get the current rules. */
  getRules(): NotificationRuleConfig[] {
    return [...this.rules];
  }

  /** Add a new rule. */
  addRule(rule: NotificationRuleConfig): void {
    this.rules.push(rule);
    this.render();
  }

  /** Remove a rule by ID. */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
    this.render();
  }

  /** Update an existing rule. */
  updateRule(ruleId: string, updates: Partial<NotificationRuleConfig>): void {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index >= 0) {
      this.rules[index] = { ...this.rules[index], ...updates };
      this.render();
    }
  }

  /** Save the current rules via the callback. */
  save(): void {
    this.options.onSaveRules(this.rules);
  }

  /** Render the notification preferences UI. */
  render(): void {
    const rulesHtml = this.rules.length > 0
      ? this.rules.map((rule) => this.renderRule(rule)).join('')
      : '<div class="notification-empty">No notification rules configured.</div>';

    this.container.innerHTML = `
      <div class="notification-preferences">
        <div class="notification-header">
          <h4 class="notification-title">Notification Preferences</h4>
          <button class="notification-add-btn" aria-label="Add notification rule">+ Add Rule</button>
        </div>
        <div class="notification-rules-list">
          ${rulesHtml}
        </div>
        <div class="notification-footer">
          <button class="notification-save-btn">Save Preferences</button>
        </div>
      </div>
    `;

    this.attachHandlers();
  }

  private renderRule(rule: NotificationRuleConfig): string {
    const channelBadges = rule.channels
      .map((ch) => `<span class="channel-badge channel-badge--${ch}">${ch}</span>`)
      .join('');

    const priorityLabel = rule.priorityMin || 'any';
    const agentLabel = rule.agentIds?.length
      ? `${rule.agentIds.length} agent(s)`
      : 'All agents';

    return `
      <div class="notification-rule" data-rule-id="${rule.id}">
        <div class="rule-summary">
          <span class="rule-agents">${agentLabel}</span>
          <span class="rule-priority">≥ ${priorityLabel}</span>
          <div class="rule-channels">${channelBadges}</div>
          ${rule.escalation ? `<span class="rule-escalation">Escalate after ${rule.escalation.timeout}s → ${rule.escalation.escalateToChannel}</span>` : ''}
        </div>
        <button class="rule-remove-btn" data-rule-id="${rule.id}" aria-label="Remove rule">✕</button>
      </div>
    `;
  }

  private attachHandlers(): void {
    const addBtn = this.container.querySelector('.notification-add-btn');
    addBtn?.addEventListener('click', () => {
      const newRule: NotificationRuleConfig = {
        id: `rule-${Date.now()}`,
        channels: ['dashboard'],
      };
      this.addRule(newRule);
    });

    const saveBtn = this.container.querySelector('.notification-save-btn');
    saveBtn?.addEventListener('click', () => this.save());

    const removeBtns = this.container.querySelectorAll('.rule-remove-btn');
    removeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const ruleId = (btn as HTMLElement).dataset.ruleId!;
        this.removeRule(ruleId);
      });
    });
  }

  /** Destroy the component. */
  destroy(): void {
    this.container.innerHTML = '';
    this.rules = [];
  }
}
