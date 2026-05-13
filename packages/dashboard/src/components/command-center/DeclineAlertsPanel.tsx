/**
 * Eretz Command Center — Decline Alerts Panel
 *
 * Real-time alerts showing: affected subsidiary, declining metric, severity,
 * decline percentage, and intervention plan summary. Supports acknowledgment
 * and full intervention plan view.
 *
 * Requirements: 46h.19, 46h.20, 46h.21
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSeverity = 'warning' | 'critical';

export interface DeclineAlert {
  id: string;
  subsidiary: string;
  metric: string;
  severity: AlertSeverity;
  declinePercentage: number;
  interventionPlan: string;
  acknowledged: boolean;
  timestamp: string;
}

export interface DeclineAlertsData {
  alerts: DeclineAlert[];
}

export interface DeclineAlertsOptions {
  onAcknowledge?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// DeclineAlertsPanel
// ---------------------------------------------------------------------------

export class DeclineAlertsPanel {
  private container: HTMLElement;
  private data: DeclineAlertsData;
  private options: DeclineAlertsOptions;
  private expandedAlertId: string | null = null;

  constructor(container: HTMLElement, data: DeclineAlertsData, options: DeclineAlertsOptions = {}) {
    this.container = container;
    this.data = data;
    this.options = options;
  }

  mount(): void {
    this.render();
    this.attachListeners();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  update(data: DeclineAlertsData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  /** Add a new alert (e.g., from WebSocket push) */
  addAlert(alert: DeclineAlert): void {
    this.data.alerts.unshift(alert);
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    const unacknowledged = this.data.alerts.filter((a) => !a.acknowledged);

    this.container.innerHTML = `
      <div class="decline-alerts" role="region" aria-label="Decline Alerts">
        <div class="decline-alerts__header">
          <h4 class="decline-alerts__title">🚨 Decline Alerts</h4>
          <span class="decline-alerts__count">${unacknowledged.length} active</span>
        </div>
        <div class="decline-alerts__list">
          ${this.data.alerts.length > 0
            ? this.data.alerts.map((a) => this.renderAlert(a)).join('')
            : '<div class="decline-alerts__empty">No decline alerts. All metrics healthy.</div>'
          }
        </div>
      </div>
    `;
  }

  private renderAlert(alert: DeclineAlert): string {
    const severityClass = `decline-alerts__severity--${alert.severity}`;
    const acknowledgedClass = alert.acknowledged ? 'decline-alerts__item--acknowledged' : '';
    const isExpanded = this.expandedAlertId === alert.id;

    return `
      <div class="decline-alerts__item ${acknowledgedClass}" data-alert-id="${alert.id}">
        <div class="decline-alerts__item-header">
          <span class="decline-alerts__item-severity ${severityClass}">${alert.severity.toUpperCase()}</span>
          <span class="decline-alerts__item-subsidiary">${alert.subsidiary}</span>
          <span class="decline-alerts__item-metric">${alert.metric}</span>
          <span class="decline-alerts__item-decline">-${alert.declinePercentage}%</span>
        </div>
        ${isExpanded ? this.renderInterventionPlan(alert) : ''}
        <div class="decline-alerts__item-actions">
          ${!alert.acknowledged
            ? `<button class="decline-alerts__btn decline-alerts__btn--acknowledge" data-acknowledge-id="${alert.id}" aria-label="Acknowledge alert">Acknowledge</button>`
            : '<span class="decline-alerts__acknowledged-label">✓ Acknowledged</span>'
          }
          <button class="decline-alerts__btn decline-alerts__btn--plan" data-plan-id="${alert.id}" aria-label="View intervention plan">
            ${isExpanded ? 'Hide Plan' : 'View Plan'}
          </button>
        </div>
      </div>
    `;
  }

  private renderInterventionPlan(alert: DeclineAlert): string {
    return `
      <div class="decline-alerts__plan" data-plan-content="${alert.id}">
        <h5 class="decline-alerts__plan-title">Intervention Plan</h5>
        <p class="decline-alerts__plan-content">${alert.interventionPlan}</p>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    // Acknowledge buttons
    this.container.querySelectorAll('[data-acknowledge-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.acknowledgeId!;
        const alert = this.data.alerts.find((a) => a.id === id);
        if (alert) {
          alert.acknowledged = true;
          this.options.onAcknowledge?.(id);
          this.render();
          this.attachListeners();
        }
      });
    });

    // View plan buttons
    this.container.querySelectorAll('[data-plan-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.planId!;
        this.expandedAlertId = this.expandedAlertId === id ? null : id;
        this.render();
        this.attachListeners();
      });
    });
  }
}
