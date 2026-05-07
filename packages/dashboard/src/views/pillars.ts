/**
 * Shaar Dashboard — Pillars View
 *
 * Displays pillar metrics from live data via REST API:
 * - ZionX: app count and status
 * - ZXMG: content metrics
 * - Zion Alpha: positions and P&L
 *
 * Requirements: 9.1, 18.1, 18.5
 */

import type { PillarData } from '../api.js';
import { fetchPillars } from '../api.js';

export class PillarsView {
  private container: HTMLElement;
  private pillars: PillarData[] = [];
  private loading = true;
  private error: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.render();

    try {
      this.pillars = await fetchPillars();
      this.loading = false;
    } catch (err) {
      this.loading = false;
      this.error = (err as Error).message;
    }
    this.render();
  }

  unmount(): void {
    // No subscriptions to clean up
  }

  private render(): void {
    if (this.loading) {
      this.container.innerHTML = '<div class="view-loading" role="status">Loading pillars…</div>';
      return;
    }

    if (this.error) {
      this.container.innerHTML = `<div class="view-error" role="alert">Error loading pillars: ${escapeHtml(this.error)}</div>`;
      return;
    }

    if (this.pillars.length === 0) {
      this.container.innerHTML = '<div class="view-empty">No pillars are currently active.</div>';
      return;
    }

    const cards = this.pillars.map((pillar) => this.renderPillarCard(pillar)).join('');

    this.container.innerHTML = `
      <div class="view-header">
        <h2>Pillars</h2>
        <span class="pillar-count">${this.pillars.length} pillar${this.pillars.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="pillar-grid">${cards}</div>
    `;
  }

  private renderPillarCard(pillar: PillarData): string {
    const activeRate = pillar.agentCount > 0
      ? ((pillar.activeAgents / pillar.agentCount) * 100).toFixed(0)
      : '0';

    return `
      <div class="pillar-card" data-pillar="${escapeHtml(pillar.name)}">
        <div class="pillar-card-header">
          <span class="pillar-name">${escapeHtml(formatPillarName(pillar.name))}</span>
        </div>
        <div class="pillar-card-body">
          <div class="pillar-metric">
            <span class="metric-value">${pillar.agentCount}</span>
            <span class="metric-label">Total Agents</span>
          </div>
          <div class="pillar-metric">
            <span class="metric-value">${pillar.activeAgents}</span>
            <span class="metric-label">Active Agents</span>
          </div>
          <div class="pillar-metric">
            <span class="metric-value">${activeRate}%</span>
            <span class="metric-label">Active Rate</span>
          </div>
        </div>
      </div>
    `;
  }
}

function formatPillarName(name: string): string {
  const names: Record<string, string> = {
    zionx: 'ZionX — App Factory',
    zxmg: 'ZXMG — Media Production',
    'zion-alpha': 'Zion Alpha — Trading',
    'zion_alpha': 'Zion Alpha — Trading',
    otzar: 'Otzar — Finance',
    eretz: 'Eretz — Business',
  };
  return names[name.toLowerCase()] ?? name;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
