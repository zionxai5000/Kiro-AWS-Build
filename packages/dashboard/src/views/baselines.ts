/**
 * Shaar Dashboard — Baseline Health View
 *
 * Shows current baselines per domain, version history, and confidence scores.
 * Displays dimension breakdowns with weighted scores.
 */

import type { BaselineData } from '../api.js';
import { fetchBaselines } from '../api.js';

export class BaselinesView {
  private container: HTMLElement;
  private baselines: BaselineData[] = [];
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
      this.baselines = await fetchBaselines();
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
      this.container.innerHTML = '<div class="view-loading" role="status">Loading baselines…</div>';
      return;
    }

    if (this.error) {
      this.container.innerHTML = `<div class="view-error" role="alert">Error loading baselines: ${escapeHtml(this.error)}</div>`;
      return;
    }

    if (this.baselines.length === 0) {
      this.container.innerHTML = `
        <div class="view-header"><h2>Baseline Health</h2></div>
        <div class="view-empty">No baselines have been generated yet.</div>
      `;
      return;
    }

    // Summary
    const totalDomains = new Set(this.baselines.map(b => b.domain)).size;
    const avgConfidence = this.baselines.reduce((sum, b) => sum + b.confidence, 0) / this.baselines.length;
    const totalRefs = this.baselines.reduce((sum, b) => sum + b.referenceCount, 0);
    const latestVersion = Math.max(...this.baselines.map(b => b.version));

    const cards = this.baselines.map(baseline => this.renderBaselineCard(baseline)).join('');

    this.container.innerHTML = `
      <div class="view-header">
        <h2>Baseline Health</h2>
        <span class="agent-count">${this.baselines.length} baseline${this.baselines.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="ref-summary-grid">
        <div class="ref-summary-card">
          <div class="ref-summary-label">Domains</div>
          <div class="ref-summary-value">${totalDomains}</div>
        </div>
        <div class="ref-summary-card">
          <div class="ref-summary-label">Avg Confidence</div>
          <div class="ref-summary-value">${(avgConfidence * 100).toFixed(0)}%</div>
        </div>
        <div class="ref-summary-card">
          <div class="ref-summary-label">Total References</div>
          <div class="ref-summary-value">${totalRefs}</div>
        </div>
        <div class="ref-summary-card">
          <div class="ref-summary-label">Latest Version</div>
          <div class="ref-summary-value">v${latestVersion}</div>
        </div>
      </div>
      <div class="baseline-cards-grid">${cards}</div>
    `;
  }

  private renderBaselineCard(baseline: BaselineData): string {
    const confidenceClass = baseline.confidence >= 0.8 ? 'confidence-high' :
      baseline.confidence >= 0.5 ? 'confidence-medium' : 'confidence-low';

    const dimensionRows = baseline.dimensions.map(dim => {
      const barWidth = Math.max(0, Math.min(100, dim.score * 100));
      return `
        <div class="baseline-dimension">
          <span class="baseline-dim-name">${escapeHtml(dim.name)}</span>
          <div class="baseline-dim-bar-container">
            <div class="baseline-dim-bar" style="width: ${barWidth}%"></div>
          </div>
          <span class="baseline-dim-score">${(dim.score * 100).toFixed(0)}%</span>
          <span class="baseline-dim-weight">(w: ${dim.weight.toFixed(2)})</span>
        </div>
      `;
    }).join('');

    return `
      <div class="baseline-card">
        <div class="baseline-card-header">
          <span class="baseline-domain">${escapeHtml(baseline.domain)}</span>
          <span class="baseline-version">v${baseline.version}</span>
        </div>
        <div class="baseline-card-meta">
          <span class="baseline-confidence ${confidenceClass}">Confidence: ${(baseline.confidence * 100).toFixed(0)}%</span>
          <span class="baseline-refs">${baseline.referenceCount} references</span>
          <span class="baseline-updated">Updated: ${formatDate(baseline.updatedAt)}</span>
        </div>
        <div class="baseline-dimensions">${dimensionRows}</div>
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
