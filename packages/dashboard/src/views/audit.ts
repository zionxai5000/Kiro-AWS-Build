/**
 * Shaar Dashboard — Audit View
 *
 * Searchable audit trail with filters:
 * - Agent
 * - Time range
 * - Action type
 * - Pillar
 * - Outcome
 *
 * Data comes from the XO Audit query API (GET /audit).
 *
 * Requirements: 9.1, 7.4, 18.5
 */

import type { AuditEntry, AuditQueryParams } from '../api.js';
import { fetchAudit } from '../api.js';

export class AuditView {
  private container: HTMLElement;
  private entries: AuditEntry[] = [];
  private loading = true;
  private error: string | null = null;
  private filters: AuditQueryParams = {};

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.filters = {};
    this.render();

    try {
      this.entries = await fetchAudit();
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

  private async applyFilters(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.render();

    try {
      this.entries = await fetchAudit(this.filters);
      this.loading = false;
    } catch (err) {
      this.loading = false;
      this.error = (err as Error).message;
    }
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="view-header">
        <h2>Audit Trail</h2>
      </div>
      ${this.renderFilters()}
      ${this.renderContent()}
    `;
    this.attachFilterHandlers();
  }

  private renderFilters(): string {
    return `
      <div class="audit-filters">
        <div class="filter-group">
          <label for="filter-agent">Agent ID</label>
          <input type="text" id="filter-agent" placeholder="Agent ID" value="${escapeHtml(this.filters.agentId ?? '')}" />
        </div>
        <div class="filter-group">
          <label for="filter-action">Action Type</label>
          <input type="text" id="filter-action" placeholder="Action type" value="${escapeHtml(this.filters.actionType ?? '')}" />
        </div>
        <div class="filter-group">
          <label for="filter-pillar">Pillar</label>
          <input type="text" id="filter-pillar" placeholder="Pillar" value="${escapeHtml(this.filters.pillar ?? '')}" />
        </div>
        <div class="filter-group">
          <label for="filter-start">Start Time</label>
          <input type="datetime-local" id="filter-start" value="${this.filters.startTime ?? ''}" />
        </div>
        <div class="filter-group">
          <label for="filter-end">End Time</label>
          <input type="datetime-local" id="filter-end" value="${this.filters.endTime ?? ''}" />
        </div>
        <button class="filter-apply" id="apply-filters">Apply Filters</button>
        <button class="filter-clear" id="clear-filters">Clear</button>
      </div>
    `;
  }

  private renderContent(): string {
    if (this.loading) {
      return '<div class="view-loading" role="status">Loading audit entries…</div>';
    }

    if (this.error) {
      return `<div class="view-error" role="alert">Error loading audit: ${escapeHtml(this.error)}</div>`;
    }

    if (this.entries.length === 0) {
      return '<div class="view-empty">No audit entries match the current filters.</div>';
    }

    const rows = this.entries.map((entry) => {
      const time = new Date(entry.timestamp).toLocaleString();
      const outcomeClass = `outcome-${entry.outcome}`;
      return `
        <tr>
          <td>${time}</td>
          <td>${escapeHtml(entry.actingAgentName || entry.actingAgentId)}</td>
          <td>${escapeHtml(entry.actionType)}</td>
          <td>${escapeHtml(entry.target)}</td>
          <td>${escapeHtml(entry.pillar ?? '—')}</td>
          <td class="${outcomeClass}">${entry.outcome}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="audit-results">
        <span class="result-count">${this.entries.length} entries</span>
        <table class="audit-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Agent</th>
              <th>Action</th>
              <th>Target</th>
              <th>Pillar</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  private attachFilterHandlers(): void {
    const applyBtn = this.container.querySelector('#apply-filters');
    const clearBtn = this.container.querySelector('#clear-filters');

    applyBtn?.addEventListener('click', () => {
      const agentInput = this.container.querySelector<HTMLInputElement>('#filter-agent');
      const actionInput = this.container.querySelector<HTMLInputElement>('#filter-action');
      const pillarInput = this.container.querySelector<HTMLInputElement>('#filter-pillar');
      const startInput = this.container.querySelector<HTMLInputElement>('#filter-start');
      const endInput = this.container.querySelector<HTMLInputElement>('#filter-end');

      this.filters = {
        agentId: agentInput?.value || undefined,
        actionType: actionInput?.value || undefined,
        pillar: pillarInput?.value || undefined,
        startTime: startInput?.value ? new Date(startInput.value).toISOString() : undefined,
        endTime: endInput?.value ? new Date(endInput.value).toISOString() : undefined,
      };

      void this.applyFilters();
    });

    clearBtn?.addEventListener('click', () => {
      this.filters = {};
      void this.applyFilters();
    });
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
