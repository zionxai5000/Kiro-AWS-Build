/**
 * Shaar Dashboard — Quality Gate Results View
 *
 * Shows recent quality gate evaluations with pass/fail status,
 * overall scores, and per-dimension breakdowns.
 */

import type { QualityGateResult } from '../api.js';
import { fetchQualityGateResults } from '../api.js';

export class QualityGateView {
  private container: HTMLElement;
  private results: QualityGateResult[] = [];
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
      this.results = await fetchQualityGateResults();
      this.loading = false;
    } catch (err) {
      this.loading = false;
      this.error = (err as Error).message;
    }
    this.render();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  private render(): void {
    if (this.loading) {
      this.container.innerHTML = '<div class="view-loading" role="status">Loading quality gate results…</div>';
      return;
    }

    if (this.error) {
      this.container.innerHTML = `<div class="view-error" role="alert">Error loading quality gate results: ${escapeHtml(this.error)}</div>`;
      return;
    }

    if (this.results.length === 0) {
      this.container.innerHTML = `
        <div class="view-header"><h2>Quality Gate Results</h2></div>
        <div class="view-empty">No quality gate evaluations have been run yet.</div>
      `;
      return;
    }

    // Summary
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(0) : '0';

    const cards = this.results.map(result => this.renderResultCard(result)).join('');

    this.container.innerHTML = `
      <div class="view-header">
        <h2>Quality Gate Results</h2>
        <span class="agent-count">${total} evaluation${total !== 1 ? 's' : ''}</span>
      </div>
      <div class="ref-summary-grid">
        <div class="ref-summary-card">
          <div class="ref-summary-label">Total Evaluations</div>
          <div class="ref-summary-value">${total}</div>
        </div>
        <div class="ref-summary-card">
          <div class="ref-summary-label">Passed</div>
          <div class="ref-summary-value qg-passed">${passed}</div>
        </div>
        <div class="ref-summary-card">
          <div class="ref-summary-label">Failed</div>
          <div class="ref-summary-value qg-failed">${failed}</div>
        </div>
        <div class="ref-summary-card">
          <div class="ref-summary-label">Pass Rate</div>
          <div class="ref-summary-value">${passRate}%</div>
        </div>
      </div>
      <div class="qg-results-list">${cards}</div>
    `;
  }

  private renderResultCard(result: QualityGateResult): string {
    const passClass = result.passed ? 'qg-card-passed' : 'qg-card-failed';
    const passLabel = result.passed ? '✓ PASSED' : '✗ FAILED';

    const dimensionBars = result.dimensionScores.map(dim => {
      const barWidth = Math.max(0, Math.min(100, dim.score * 100));
      const dimClass = dim.passed ? 'dim-passed' : 'dim-failed';
      return `
        <div class="qg-dimension ${dimClass}">
          <span class="qg-dim-name">${escapeHtml(dim.dimension)}</span>
          <div class="qg-dim-bar-container">
            <div class="qg-dim-bar" style="width: ${barWidth}%"></div>
          </div>
          <span class="qg-dim-score">${(dim.score * 100).toFixed(0)}%</span>
        </div>
      `;
    }).join('');

    return `
      <div class="qg-result-card ${passClass}">
        <div class="qg-card-header">
          <div class="qg-card-title">
            <span class="qg-agent">${escapeHtml(result.agentId)}</span>
            <span class="qg-domain">${escapeHtml(result.domain)}</span>
          </div>
          <div class="qg-card-status">
            <span class="qg-pass-badge ${passClass}">${passLabel}</span>
            <span class="qg-overall-score">${(result.overallScore * 100).toFixed(0)}% / ${(result.threshold * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div class="qg-card-meta">
          <span>Evaluated: ${formatDate(result.evaluatedAt)}</span>
          <span>Baseline v${result.baselineVersion}</span>
        </div>
        <div class="qg-dimensions">${dimensionBars}</div>
      </div>
    `;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
