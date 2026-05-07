/**
 * Shaar Dashboard — Costs View
 *
 * Displays cost data from Otzar cost reports:
 * - Per-agent spend
 * - Per-pillar spend
 * - Model utilization breakdown
 * - Projected daily/monthly costs
 *
 * Connected to WebSocket for real-time cost updates.
 *
 * Requirements: 9.1, 18.2, 18.5
 */

import type { CostReport, DashboardWebSocket, WebSocketMessage } from '../api.js';
import { fetchCosts } from '../api.js';

export class CostsView {
  private container: HTMLElement;
  private ws: DashboardWebSocket;
  private costs: CostReport | null = null;
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

    // Subscribe to real-time cost updates
    this.wsHandler = (message: WebSocketMessage) => {
      const data = message.data;
      if (data.costs) {
        this.costs = data.costs as unknown as CostReport;
        this.render();
      }
    };
    this.ws.on('cost.updated', this.wsHandler);

    try {
      this.costs = await fetchCosts();
      this.loading = false;
    } catch (err) {
      this.loading = false;
      this.error = (err as Error).message;
    }
    this.render();
  }

  unmount(): void {
    if (this.wsHandler) {
      this.ws.off('cost.updated', this.wsHandler);
      this.wsHandler = null;
    }
  }

  private render(): void {
    if (this.loading) {
      this.container.innerHTML = '<div class="view-loading" role="status">Loading costs…</div>';
      return;
    }

    if (this.error) {
      this.container.innerHTML = `<div class="view-error" role="alert">Error loading costs: ${escapeHtml(this.error)}</div>`;
      return;
    }

    if (!this.costs) {
      this.container.innerHTML = '<div class="view-empty">No cost data available.</div>';
      return;
    }

    this.container.innerHTML = `
      <div class="view-header">
        <h2>Costs</h2>
      </div>

      <div class="costs-summary">
        <div class="cost-summary-card">
          <span class="metric-value">${formatUsd(this.costs.totalSpend)}</span>
          <span class="metric-label">Total Spend</span>
        </div>
        <div class="cost-summary-card">
          <span class="metric-value">${formatUsd(this.costs.projectedDaily)}</span>
          <span class="metric-label">Projected Daily</span>
        </div>
        <div class="cost-summary-card">
          <span class="metric-value">${formatUsd(this.costs.projectedMonthly)}</span>
          <span class="metric-label">Projected Monthly</span>
        </div>
      </div>

      <div class="costs-sections">
        ${this.renderPerAgentSpend()}
        ${this.renderPerPillarSpend()}
        ${this.renderModelUtilization()}
      </div>
    `;
  }

  private renderPerAgentSpend(): string {
    const agents = this.costs?.perAgent ?? [];
    if (agents.length === 0) return '';

    const rows = agents.map((a) => `
      <tr>
        <td>${escapeHtml(a.agentId)}</td>
        <td class="numeric">${formatUsd(a.spend)}</td>
      </tr>
    `).join('');

    return `
      <div class="costs-section">
        <h3>Per-Agent Spend</h3>
        <table class="costs-table">
          <thead><tr><th>Agent</th><th class="numeric">Spend</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  private renderPerPillarSpend(): string {
    const pillars = this.costs?.perPillar ?? [];
    if (pillars.length === 0) return '';

    const rows = pillars.map((p) => `
      <tr>
        <td>${escapeHtml(p.pillar)}</td>
        <td class="numeric">${formatUsd(p.spend)}</td>
      </tr>
    `).join('');

    return `
      <div class="costs-section">
        <h3>Per-Pillar Spend</h3>
        <table class="costs-table">
          <thead><tr><th>Pillar</th><th class="numeric">Spend</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  private renderModelUtilization(): string {
    const models = this.costs?.modelUtilization ?? [];
    if (models.length === 0) return '';

    const rows = models.map((m) => `
      <tr>
        <td>${escapeHtml(m.model)}</td>
        <td class="numeric">${m.tokens.toLocaleString()}</td>
        <td class="numeric">${formatUsd(m.cost)}</td>
      </tr>
    `).join('');

    return `
      <div class="costs-section">
        <h3>Model Utilization</h3>
        <table class="costs-table">
          <thead><tr><th>Model</th><th class="numeric">Tokens</th><th class="numeric">Cost</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
