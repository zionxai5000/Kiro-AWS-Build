/**
 * Eretz Command Center — Recommendation Queue Panel
 *
 * Displays pending recommendations with summary, priority, source agent,
 * date, and approve/reject/modify buttons. Supports inline editing for
 * modification before approval.
 *
 * Requirements: 46g.15, 46g.16, 46g.17, 46g.18
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';
export type RecommendationStatus = 'pending' | 'approved' | 'rejected' | 'modified';

export interface Recommendation {
  id: string;
  summary: string;
  priority: RecommendationPriority;
  sourceAgent: string;
  submittedDate: string;
  parameters: Record<string, string>;
  status: RecommendationStatus;
  rejectionReason?: string;
}

export interface RecommendationQueueData {
  recommendations: Recommendation[];
}

export interface RecommendationQueueOptions {
  onApprove?: (id: string) => void;
  onReject?: (id: string, reason?: string) => void;
  onModify?: (id: string, parameters: Record<string, string>) => void;
}

// ---------------------------------------------------------------------------
// RecommendationQueuePanel
// ---------------------------------------------------------------------------

export class RecommendationQueuePanel {
  private container: HTMLElement;
  private data: RecommendationQueueData;
  private options: RecommendationQueueOptions;
  private editingId: string | null = null;

  constructor(container: HTMLElement, data: RecommendationQueueData, options: RecommendationQueueOptions = {}) {
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

  update(data: RecommendationQueueData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    const pending = this.data.recommendations
      .filter((r) => r.status === 'pending')
      .sort((a, b) => this.priorityOrder(a.priority) - this.priorityOrder(b.priority));

    this.container.innerHTML = `
      <div class="recommendation-queue" role="region" aria-label="Recommendation Queue">
        <div class="recommendation-queue__header">
          <h4 class="recommendation-queue__title">📋 Pending Recommendations</h4>
          <span class="recommendation-queue__count">${pending.length} pending</span>
        </div>
        <div class="recommendation-queue__list">
          ${pending.length > 0
            ? pending.map((r) => this.renderRecommendation(r)).join('')
            : '<div class="recommendation-queue__empty">No pending recommendations.</div>'
          }
        </div>
      </div>
    `;
  }

  private renderRecommendation(rec: Recommendation): string {
    const priorityClass = `recommendation-queue__priority--${rec.priority}`;
    const isEditing = this.editingId === rec.id;

    return `
      <div class="recommendation-queue__item" data-recommendation-id="${rec.id}">
        <div class="recommendation-queue__item-header">
          <span class="recommendation-queue__item-priority ${priorityClass}">${rec.priority}</span>
          <span class="recommendation-queue__item-summary">${rec.summary}</span>
        </div>
        <div class="recommendation-queue__item-meta">
          <span class="recommendation-queue__item-source">From: ${rec.sourceAgent}</span>
          <span class="recommendation-queue__item-date">${new Date(rec.submittedDate).toLocaleDateString()}</span>
        </div>
        ${isEditing ? this.renderEditor(rec) : ''}
        <div class="recommendation-queue__item-actions">
          <button class="recommendation-queue__btn recommendation-queue__btn--approve" data-approve-id="${rec.id}" aria-label="Approve recommendation">✓ Approve</button>
          <button class="recommendation-queue__btn recommendation-queue__btn--reject" data-reject-id="${rec.id}" aria-label="Reject recommendation">✗ Reject</button>
          <button class="recommendation-queue__btn recommendation-queue__btn--modify" data-modify-id="${rec.id}" aria-label="Modify recommendation">✎ Modify</button>
        </div>
      </div>
    `;
  }

  private renderEditor(rec: Recommendation): string {
    const fields = Object.entries(rec.parameters).map(([key, value]) =>
      `<div class="recommendation-queue__editor-field">
        <label class="recommendation-queue__editor-label">${key}</label>
        <input class="recommendation-queue__editor-input" data-param-key="${key}" value="${value}" />
      </div>`,
    ).join('');

    return `
      <div class="recommendation-queue__editor" data-editor-id="${rec.id}">
        ${fields}
        <button class="recommendation-queue__btn recommendation-queue__btn--submit" data-submit-modify-id="${rec.id}">Submit Changes</button>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    // Approve buttons
    this.container.querySelectorAll('[data-approve-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.approveId!;
        const rec = this.data.recommendations.find((r) => r.id === id);
        if (rec) {
          rec.status = 'approved';
          this.options.onApprove?.(id);
          this.render();
          this.attachListeners();
        }
      });
    });

    // Reject buttons
    this.container.querySelectorAll('[data-reject-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.rejectId!;
        const rec = this.data.recommendations.find((r) => r.id === id);
        if (rec) {
          rec.status = 'rejected';
          rec.rejectionReason = 'Rejected by King';
          this.options.onReject?.(id, rec.rejectionReason);
          this.render();
          this.attachListeners();
        }
      });
    });

    // Modify buttons — toggle editor
    this.container.querySelectorAll('[data-modify-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.modifyId!;
        this.editingId = this.editingId === id ? null : id;
        this.render();
        this.attachListeners();
      });
    });

    // Submit modify buttons
    this.container.querySelectorAll('[data-submit-modify-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.submitModifyId!;
        const editor = this.container.querySelector(`[data-editor-id="${id}"]`);
        if (editor) {
          const inputs = editor.querySelectorAll<HTMLInputElement>('[data-param-key]');
          const params: Record<string, string> = {};
          inputs.forEach((input) => {
            params[input.dataset.paramKey!] = input.value;
          });
          const rec = this.data.recommendations.find((r) => r.id === id);
          if (rec) {
            rec.parameters = params;
            rec.status = 'approved';
            this.options.onModify?.(id, params);
            this.editingId = null;
            this.render();
            this.attachListeners();
          }
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private priorityOrder(priority: RecommendationPriority): number {
    const order: Record<RecommendationPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[priority];
  }
}
