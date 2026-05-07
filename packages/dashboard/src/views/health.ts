/**
 * Shaar Dashboard — System Health View
 *
 * Displays operational status of every core service, driver, and active
 * agent. Data comes from the health endpoint (GET /health).
 * Connected to WebSocket for real-time health updates.
 *
 * Requirements: 9.1, 18.1, 18.4, 18.5
 */

import type { DashboardWebSocket, HealthData, WebSocketMessage } from '../api.js';
import { fetchHealth } from '../api.js';

export class HealthView {
  private container: HTMLElement;
  private ws: DashboardWebSocket;
  private health: HealthData | null = null;
  private loading = true;
  private error: string | null = null;
  private wsHandler: ((msg: WebSocketMessage) => void) | null = null;

  constructor(container: HTMLElement, ws: DashboardWebSocket) {
    this.container = container;
    this.ws = ws;
  }

  async mount(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.render();

    // Subscribe to real-time health updates
    this.wsHandler = (message: WebSocketMessage) => {
      const data = message.data;
      if (data.status) {
        this.health = data as unknown as HealthData;
        this.render();
      }
    };
    this.ws.on('system.health', this.wsHandler);

    try {
      this.health = await fetchHealth();
      this.loading = false;
    } catch (err) {
      this.loading = false;
      this.error = (err as Error).message;
    }
    this.render();
  }

  unmount(): void {
    if (this.wsHandler) {
      this.ws.off('system.health', this.wsHandler);
      this.wsHandler = null;
    }
  }

  private render(): void {
    if (this.loading) {
      this.container.innerHTML = '<div class="view-loading" role="status">Loading system health…</div>';
      return;
    }

    if (this.error) {
      this.container.innerHTML = `<div class="view-error" role="alert">Error loading health: ${escapeHtml(this.error)}</div>`;
      return;
    }

    if (!this.health) {
      this.container.innerHTML = '<div class="view-empty">No health data available.</div>';
      return;
    }

    const statusClass = this.health.status === 'healthy' ? 'status-healthy' : 'status-degraded';
    const timestamp = new Date(this.health.timestamp).toLocaleString();

    this.container.innerHTML = `
      <div class="view-header">
        <h2>System Health</h2>
        <span class="health-timestamp">Last updated: ${timestamp}</span>
      </div>

      <div class="health-overview">
        <div class="health-status-card ${statusClass}">
          <span class="status-indicator"></span>
          <span class="status-text">${escapeHtml(this.health.status.toUpperCase())}</span>
        </div>
        <div class="health-metric">
          <span class="metric-value">${this.health.totalAgents}</span>
          <span class="metric-label">Total Agents</span>
        </div>
        <div class="health-metric">
          <span class="metric-value">${this.health.healthyAgents}</span>
          <span class="metric-label">Healthy Agents</span>
        </div>
        <div class="health-metric">
          <span class="metric-value">${this.health.totalAgents - this.health.healthyAgents}</span>
          <span class="metric-label">Unhealthy Agents</span>
        </div>
      </div>

      ${this.renderServicesList()}
      ${this.renderDriversList()}
      ${this.renderAgentsList()}
    `;
  }

  private renderServicesList(): string {
    const services = this.health?.services;
    if (!services || services.length === 0) return '';

    const rows = services.map((svc) => {
      const statusClass = svc.status === 'healthy' ? 'status-healthy' : 'status-degraded';
      return `
        <tr>
          <td>${escapeHtml(svc.name)}</td>
          <td class="${statusClass}">${escapeHtml(svc.status)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="health-section">
        <h3>Core Services</h3>
        <table class="health-table">
          <thead><tr><th>Service</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  private renderDriversList(): string {
    const drivers = this.health?.drivers;
    if (!drivers || drivers.length === 0) return '';

    const rows = drivers.map((drv) => {
      const statusClass = drv.status === 'ready' ? 'status-healthy' : 'status-degraded';
      return `
        <tr>
          <td>${escapeHtml(drv.name)}</td>
          <td class="${statusClass}">${escapeHtml(drv.status)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="health-section">
        <h3>Drivers</h3>
        <table class="health-table">
          <thead><tr><th>Driver</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  private renderAgentsList(): string {
    const agents = this.health?.agents;
    if (!agents || agents.length === 0) return '';

    const rows = agents.map((agent) => {
      const stateClass = agent.state === 'ready' || agent.state === 'executing'
        ? 'status-healthy'
        : 'status-degraded';
      return `
        <tr>
          <td>${escapeHtml(agent.name || agent.id)}</td>
          <td class="${stateClass}">${escapeHtml(agent.state)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="health-section">
        <h3>Active Agents</h3>
        <table class="health-table">
          <thead><tr><th>Agent</th><th>State</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
