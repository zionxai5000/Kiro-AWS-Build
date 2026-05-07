/**
 * Shaar Dashboard — Reference Ingestion Status View
 *
 * Displays ingested references, their analysis status, and generated baselines.
 * Shows a table of all references with status indicators and domain grouping.
 */

import type { ReferenceData } from '../api.js';
import { fetchReferences } from '../api.js';

export class ReferencesView {
  private container: HTMLElement;
  private references: ReferenceData[] = [];
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
      this.references = await fetchReferences();
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
      this.container.innerHTML = '<div class="view-loading" role="status">Loading references…</div>';
      return;
    }

    if (this.error) {
      this.container.innerHTML = `<div class="view-error" role="alert">Error loading references: ${escapeHtml(this.error)}</div>`;
      return;
    }

    if (this.references.length === 0) {
      this.container.innerHTML = `
        <div class="view-header"><h2>Reference Ingestion</h2></div>
        <div class="view-empty">No references have been ingested yet.</div>
      `;
      return;
    }

    // Group by domain
    const domains = new Map<string, ReferenceData[]>();
    for (const ref of this.references) {
      const list = domains.get(ref.domain) ?? [];
      list.push(ref);
      domains.set(ref.domain, list);
    }

    // Summary stats
    const total = this.references.length;
    const analyzed = this.references.filter(r => r.status === 'analyzed' || r.status === 'baselined').length;
    const baselined = this.references.filter(r => r.status === 'baselined').length;
    const pending = this.references.filter(r => r.status === 'pending' || r.status === 'ingesting').length;
    const failed = this.references.filter(r => r.status === 'failed').length;

    const rows = this.references.map(ref => `
      <tr>
        <td>${escapeHtml(ref.title)}</td>
        <td>${escapeHtml(ref.domain)}</td>
        <td><span class="status-badge status-${ref.status}">${ref.status}</span></td>
        <td>${ref.dimensions.length > 0 ? ref.dimensions.join(', ') : '—'}</td>
        <td>${(ref.confidence * 100).toFixed(0)}%</td>
        <td>${formatDate(ref.ingestedAt)}</td>
      </tr>
    `).join('');

    this.container.innerHTML = `
      <div class="view-header">
        <h2>Reference Ingestion</h2>
        <span class="agent-count">${total} reference${total !== 1 ? 's' : ''}</span>
      </div>
      <div class="ref-summary-grid">
        <div class="ref-summary-card">
          <div class="ref-summary-label">Total Ingested</div>
          <div class="ref-summary-value">${total}</div>
        </div>
        <div class="ref-summary-card">
          <div class="ref-summary-label">Analyzed</div>
          <div class="ref-summary-value">${analyzed}</div>
        </div>
        <div class="ref-summary-card">
          <div class="ref-summary-label">Baselined</div>
          <div class="ref-summary-value">${baselined}</div>
        </div>
        <div class="ref-summary-card">
          <div class="ref-summary-label">Pending</div>
          <div class="ref-summary-value">${pending}</div>
        </div>
        ${failed > 0 ? `<div class="ref-summary-card ref-summary-error"><div class="ref-summary-label">Failed</div><div class="ref-summary-value">${failed}</div></div>` : ''}
      </div>
      <div class="ref-table-container">
        <table class="ref-table" role="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Domain</th>
              <th>Status</th>
              <th>Dimensions</th>
              <th>Confidence</th>
              <th>Ingested</th>
            </tr>
          </thead>
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

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
