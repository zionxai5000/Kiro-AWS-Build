/**
 * Shaar Dashboard — Alert Notification Banner
 *
 * Displays real-time alerts received via WebSocket prominently at the
 * top of the dashboard. Alerts auto-dismiss after a configurable timeout
 * and can be manually dismissed.
 *
 * Requirements: 9.1, 9.3, 18.3
 */

import type { DashboardWebSocket, WebSocketMessage } from '../api.js';

export interface AlertItem {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
}

const ALERT_DISMISS_MS = 30_000;

export class AlertBanner {
  private container: HTMLElement;
  private alerts: AlertItem[] = [];
  private dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private ws: DashboardWebSocket;

  constructor(container: HTMLElement, ws: DashboardWebSocket) {
    this.container = container;
    this.ws = ws;
    this.render();
    this.subscribe();
  }

  /** Add an alert programmatically. */
  addAlert(alert: AlertItem): void {
    this.alerts.unshift(alert);
    this.render();
    this.scheduleDismiss(alert.id);
  }

  /** Remove an alert by id. */
  dismissAlert(id: string): void {
    this.alerts = this.alerts.filter((a) => a.id !== id);
    const timer = this.dismissTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.dismissTimers.delete(id);
    }
    this.render();
  }

  /** Clean up timers and WebSocket subscription. */
  destroy(): void {
    for (const timer of this.dismissTimers.values()) {
      clearTimeout(timer);
    }
    this.dismissTimers.clear();
  }

  private subscribe(): void {
    this.ws.on('alert.triggered', (message: WebSocketMessage) => {
      const data = message.data;
      const alert: AlertItem = {
        id: (data.alertId as string) ?? `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message: (data.message as string) ?? 'System alert triggered',
        severity: (data.severity as AlertItem['severity']) ?? 'warning',
        timestamp: message.timestamp,
      };
      this.addAlert(alert);
    });
  }

  private scheduleDismiss(id: string): void {
    const timer = setTimeout(() => {
      this.dismissAlert(id);
    }, ALERT_DISMISS_MS);
    this.dismissTimers.set(id, timer);
  }

  private render(): void {
    if (this.alerts.length === 0) {
      this.container.innerHTML = '';
      return;
    }

    const alertsHtml = this.alerts.map((alert) => {
      const severityClass = `alert-${alert.severity}`;
      const time = new Date(alert.timestamp).toLocaleTimeString();
      return `
        <div class="alert-item ${severityClass}" role="alert" data-alert-id="${alert.id}">
          <span class="alert-severity">${alert.severity.toUpperCase()}</span>
          <span class="alert-message">${escapeHtml(alert.message)}</span>
          <span class="alert-time">${time}</span>
          <button class="alert-dismiss" data-dismiss="${alert.id}" aria-label="Dismiss alert">&times;</button>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `<div class="alert-banner">${alertsHtml}</div>`;

    // Attach dismiss handlers
    const buttons = this.container.querySelectorAll<HTMLButtonElement>('button[data-dismiss]');
    for (const btn of buttons) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.dismiss!;
        this.dismissAlert(id);
      });
    }
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
