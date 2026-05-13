/**
 * ZionX App Studio — Rejection Crisis Panel
 *
 * Activates when any app enters "rejected" state. Displays rejection reason,
 * root cause analysis, fix status checklist, resubmission timeline estimate.
 * Shows historical rejections with resolution times.
 *
 * Requirements: 11.3, 11.4, 2.3
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FixStatus = 'pending' | 'in_progress' | 'fixed' | 'verified';

export interface RejectionIssue {
  id: string;
  description: string;
  status: FixStatus;
}

export interface RejectedApp {
  id: string;
  appName: string;
  rejectionReason: string;
  rootCause: string;
  issues: RejectionIssue[];
  rejectedAt: string;
  estimatedResubmissionDays: number;
}

export interface HistoricalRejection {
  id: string;
  appName: string;
  reason: string;
  rejectedAt: string;
  resolvedAt: string;
  resolutionDays: number;
}

export interface RejectionCrisisPanelData {
  activeRejections: RejectedApp[];
  historicalRejections: HistoricalRejection[];
}

export interface RejectionCrisisPanelOptions {
  onResubmit?: (appId: string) => void;
  onFixStatusChange?: (appId: string, issueId: string, status: FixStatus) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIX_STATUS_LABELS: Record<FixStatus, string> = {
  pending: '⏳ Pending',
  in_progress: '🔧 In Progress',
  fixed: '✅ Fixed',
  verified: '✓ Verified',
};

// ---------------------------------------------------------------------------
// RejectionCrisisPanel
// ---------------------------------------------------------------------------

export class RejectionCrisisPanel {
  private container: HTMLElement;
  private data: RejectionCrisisPanelData;
  private options: RejectionCrisisPanelOptions;

  constructor(container: HTMLElement, data: RejectionCrisisPanelData, options: RejectionCrisisPanelOptions = {}) {
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

  update(data: RejectionCrisisPanelData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    if (this.data.activeRejections.length === 0) {
      this.container.innerHTML = '';
      return;
    }

    this.container.innerHTML = `
      <div class="rejection-crisis" role="region" aria-label="Rejection Crisis Panel">
        <div class="rejection-crisis__header">
          <h3 class="rejection-crisis__title">🚨 Rejection Crisis</h3>
          <span class="rejection-crisis__count">${this.data.activeRejections.length} app${this.data.activeRejections.length !== 1 ? 's' : ''} rejected</span>
        </div>
        <div class="rejection-crisis__active">
          ${this.data.activeRejections.map((app) => this.renderRejectedApp(app)).join('')}
        </div>
        ${this.renderHistorical()}
      </div>
    `;
  }

  private renderRejectedApp(app: RejectedApp): string {
    const fixedCount = app.issues.filter((i) => i.status === 'fixed' || i.status === 'verified').length;
    const totalIssues = app.issues.length;
    const progressPercent = totalIssues > 0 ? Math.round((fixedCount / totalIssues) * 100) : 0;
    const allFixed = fixedCount === totalIssues && totalIssues > 0;

    return `
      <div class="rejection-crisis__app" data-rejected-app-id="${app.id}">
        <div class="rejection-crisis__app-header">
          <span class="rejection-crisis__app-name">${app.appName}</span>
          <span class="rejection-crisis__app-date">Rejected ${this.getRelativeTime(app.rejectedAt)}</span>
        </div>
        <div class="rejection-crisis__reason">
          <span class="rejection-crisis__reason-label">Reason:</span>
          <span class="rejection-crisis__reason-text">${app.rejectionReason}</span>
        </div>
        <div class="rejection-crisis__root-cause">
          <span class="rejection-crisis__root-cause-label">Root Cause:</span>
          <span class="rejection-crisis__root-cause-text">${app.rootCause}</span>
        </div>
        <div class="rejection-crisis__progress">
          <span class="rejection-crisis__progress-label">Fix Progress: ${fixedCount}/${totalIssues} (${progressPercent}%)</span>
          <div class="rejection-crisis__progress-bar">
            <div class="rejection-crisis__progress-fill" style="width: ${progressPercent}%"></div>
          </div>
        </div>
        <div class="rejection-crisis__checklist">
          ${app.issues.map((issue) => this.renderIssue(app.id, issue)).join('')}
        </div>
        <div class="rejection-crisis__timeline">
          <span class="rejection-crisis__timeline-label">Estimated resubmission:</span>
          <span class="rejection-crisis__timeline-value">${app.estimatedResubmissionDays} days</span>
        </div>
        <div class="rejection-crisis__actions">
          <button class="rejection-crisis__btn rejection-crisis__btn--resubmit"
                  data-resubmit-id="${app.id}"
                  ${!allFixed ? 'disabled' : ''}
                  aria-label="Resubmit ${app.appName}">
            🚀 Resubmit
          </button>
        </div>
      </div>
    `;
  }

  private renderIssue(appId: string, issue: RejectionIssue): string {
    return `
      <div class="rejection-crisis__issue" data-issue-id="${issue.id}" data-issue-app="${appId}">
        <span class="rejection-crisis__issue-status rejection-crisis__issue-status--${issue.status}">
          ${FIX_STATUS_LABELS[issue.status]}
        </span>
        <span class="rejection-crisis__issue-desc">${issue.description}</span>
      </div>
    `;
  }

  private renderHistorical(): string {
    if (this.data.historicalRejections.length === 0) return '';

    const items = this.data.historicalRejections.map((h) => `
      <tr class="rejection-crisis__history-row">
        <td class="rejection-crisis__history-app">${h.appName}</td>
        <td class="rejection-crisis__history-reason">${h.reason}</td>
        <td class="rejection-crisis__history-resolution">${h.resolutionDays}d</td>
      </tr>
    `).join('');

    return `
      <div class="rejection-crisis__historical">
        <h4 class="rejection-crisis__historical-title">📜 Historical Rejections</h4>
        <table class="rejection-crisis__history-table">
          <thead>
            <tr>
              <th>App</th>
              <th>Reason</th>
              <th>Resolution Time</th>
            </tr>
          </thead>
          <tbody>${items}</tbody>
        </table>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    this.container.querySelectorAll('[data-resubmit-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const appId = (btn as HTMLElement).dataset.resubmitId!;
        this.options.onResubmit?.(appId);
      });
    });

    this.container.querySelectorAll('[data-issue-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const issueId = (el as HTMLElement).dataset.issueId!;
        const appId = (el as HTMLElement).dataset.issueApp!;
        const app = this.data.activeRejections.find((a) => a.id === appId);
        const issue = app?.issues.find((i) => i.id === issueId);
        if (issue) {
          const nextStatus = this.getNextStatus(issue.status);
          issue.status = nextStatus;
          this.options.onFixStatusChange?.(appId, issueId, nextStatus);
          this.render();
          this.attachListeners();
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getNextStatus(current: FixStatus): FixStatus {
    const order: FixStatus[] = ['pending', 'in_progress', 'fixed', 'verified'];
    const idx = order.indexOf(current);
    return order[Math.min(idx + 1, order.length - 1)];
  }

  private getRelativeTime(isoString: string): string {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const days = Math.floor(diffMs / 86400000);
    if (days < 1) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  }
}
