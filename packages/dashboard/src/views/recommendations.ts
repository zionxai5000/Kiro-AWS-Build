/**
 * Shaar Dashboard — Recommendations View
 *
 * Displays pending SME recommendations grouped by domain with:
 * - Priority indicators
 * - World-class benchmark comparison
 * - Approve/reject controls per recommendation
 * - Batch operations (approve all / reject all)
 *
 * Data comes from GET /recommendations.
 *
 * Requirements: 22.3, 26.6
 */

export interface Recommendation {
  id: string;
  domain: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  currentScore: number;
  worldClassBenchmark: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

async function fetchRecommendations(): Promise<Recommendation[]> {
  const apiUrl = (window as any).__SERAPHIM_API_URL__ || (window.location.origin + '/api');
  const response = await fetch(`${apiUrl}/recommendations`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  const result = await response.json();
  return result.recommendations ?? [];
}

export class RecommendationsView {
  private container: HTMLElement;
  private recommendations: Recommendation[] = [];
  private loading = true;
  private error: string | null = null;
  private selected = new Set<string>();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.selected.clear();
    this.render();

    try {
      this.recommendations = await fetchRecommendations();
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
    this.container.innerHTML = `
      <div class="view-header">
        <h2>Recommendations</h2>
      </div>
      ${this.renderContent()}
    `;
    this.attachHandlers();
  }

  private renderContent(): string {
    if (this.loading) {
      return '<div class="view-loading" role="status">Loading recommendations…</div>';
    }

    if (this.error) {
      return `<div class="view-error" role="alert">No data available</div>`;
    }

    const pending = this.recommendations.filter((r) => r.status === 'pending');
    if (pending.length === 0) {
      return '<div class="view-empty">No pending recommendations.</div>';
    }

    // Group by domain
    const grouped = new Map<string, Recommendation[]>();
    for (const rec of pending) {
      if (!grouped.has(rec.domain)) grouped.set(rec.domain, []);
      grouped.get(rec.domain)!.push(rec);
    }

    let html = `
      <div class="recommendations-batch-controls">
        <button class="btn-batch-approve" id="batch-approve">Approve Selected</button>
        <button class="btn-batch-reject" id="batch-reject">Reject Selected</button>
        <span class="batch-count">${this.selected.size} selected</span>
      </div>
    `;

    for (const [domain, recs] of grouped) {
      html += `<div class="recommendations-domain-group">
        <h3 class="domain-header">${escapeHtml(domain)}</h3>
        <div class="recommendations-list">`;

      for (const rec of recs) {
        const checked = this.selected.has(rec.id) ? 'checked' : '';
        const priorityClass = `priority-${rec.priority}`;
        html += `
          <div class="recommendation-card ${priorityClass}" data-id="${rec.id}">
            <div class="recommendation-select">
              <input type="checkbox" class="rec-checkbox" data-rec-id="${rec.id}" ${checked} aria-label="Select ${escapeHtml(rec.title)}" />
            </div>
            <div class="recommendation-content">
              <div class="recommendation-title">${escapeHtml(rec.title)}</div>
              <div class="recommendation-description">${escapeHtml(rec.description)}</div>
              <div class="recommendation-meta">
                <span class="recommendation-priority ${priorityClass}">${rec.priority}</span>
                <span class="recommendation-benchmark">Current: ${rec.currentScore}% | World-class: ${rec.worldClassBenchmark}%</span>
              </div>
            </div>
            <div class="recommendation-actions">
              <button class="btn-approve" data-action="approve" data-rec-id="${rec.id}">Approve</button>
              <button class="btn-reject" data-action="reject" data-rec-id="${rec.id}">Reject</button>
            </div>
          </div>`;
      }

      html += `</div></div>`;
    }

    return html;
  }

  private attachHandlers(): void {
    // Checkbox selection
    const checkboxes = this.container.querySelectorAll<HTMLInputElement>('.rec-checkbox');
    for (const cb of checkboxes) {
      cb.addEventListener('change', () => {
        const id = cb.dataset.recId!;
        if (cb.checked) {
          this.selected.add(id);
        } else {
          this.selected.delete(id);
        }
        this.updateBatchCount();
      });
    }

    // Individual approve/reject
    const actionBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-action]');
    for (const btn of actionBtns) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.recId!;
        const action = btn.dataset.action as 'approve' | 'reject';
        this.handleAction(id, action);
      });
    }

    // Batch operations
    this.container.querySelector('#batch-approve')?.addEventListener('click', () => {
      for (const id of this.selected) {
        this.handleAction(id, 'approve');
      }
      this.selected.clear();
      this.render();
    });

    this.container.querySelector('#batch-reject')?.addEventListener('click', () => {
      for (const id of this.selected) {
        this.handleAction(id, 'reject');
      }
      this.selected.clear();
      this.render();
    });
  }

  private handleAction(id: string, action: 'approve' | 'reject'): void {
    const rec = this.recommendations.find((r) => r.id === id);
    if (rec) {
      rec.status = action === 'approve' ? 'approved' : 'rejected';
    }
    this.render();
  }

  private updateBatchCount(): void {
    const countEl = this.container.querySelector('.batch-count');
    if (countEl) {
      countEl.textContent = `${this.selected.size} selected`;
    }
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
