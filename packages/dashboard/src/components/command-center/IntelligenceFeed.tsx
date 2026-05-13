/**
 * Eretz Command Center — Intelligence Feed
 *
 * Real-time scrolling feed of agent-generated insights with priority badges.
 * King actions: approve (trigger execution), dismiss, bookmark.
 * Compounding Intelligence Score.
 *
 * Requirements: 46g.15, 46a.1
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InsightPriority = 'critical' | 'high' | 'medium' | 'low';
export type InsightAction = 'approve' | 'dismiss' | 'bookmark';

export interface AgentInsight {
  id: string;
  summary: string;
  detail: string;
  priority: InsightPriority;
  sourceAgent: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'dismissed' | 'bookmarked';
}

export interface IntelligenceScore {
  totalGenerated: number;
  actedOn: number;
  measuredImpact: number; // 0-100
}

export interface IntelligenceFeedData {
  insights: AgentInsight[];
  score: IntelligenceScore;
}

export interface IntelligenceFeedOptions {
  onApprove?: (insightId: string) => void;
  onDismiss?: (insightId: string) => void;
  onBookmark?: (insightId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_BADGES: Record<InsightPriority, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢',
};

// ---------------------------------------------------------------------------
// IntelligenceFeed
// ---------------------------------------------------------------------------

export class IntelligenceFeed {
  private container: HTMLElement;
  private data: IntelligenceFeedData;
  private options: IntelligenceFeedOptions;

  constructor(container: HTMLElement, data: IntelligenceFeedData, options: IntelligenceFeedOptions = {}) {
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

  update(data: IntelligenceFeedData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    const pendingInsights = this.data.insights.filter((i) => i.status === 'pending');
    const bookmarkedInsights = this.data.insights.filter((i) => i.status === 'bookmarked');

    this.container.innerHTML = `
      <div class="intelligence-feed" role="region" aria-label="Intelligence Feed">
        <div class="intelligence-feed__header">
          <h3 class="intelligence-feed__title">🧠 Intelligence Feed</h3>
          ${this.renderScore()}
        </div>
        <div class="intelligence-feed__list" role="log" aria-live="polite">
          ${pendingInsights.length > 0
            ? pendingInsights.map((insight) => this.renderInsight(insight)).join('')
            : '<div class="intelligence-feed__empty">No pending insights</div>'
          }
        </div>
        ${bookmarkedInsights.length > 0 ? this.renderBookmarked(bookmarkedInsights) : ''}
      </div>
    `;
  }

  private renderScore(): string {
    const { totalGenerated, actedOn, measuredImpact } = this.data.score;
    const compoundingScore = totalGenerated > 0
      ? Math.round((actedOn / totalGenerated) * measuredImpact)
      : 0;

    return `
      <div class="intelligence-feed__score">
        <span class="intelligence-feed__score-label">Compounding Score:</span>
        <span class="intelligence-feed__score-value" data-score="${compoundingScore}">${compoundingScore}</span>
        <span class="intelligence-feed__score-detail">(${actedOn}/${totalGenerated} acted, ${measuredImpact}% impact)</span>
      </div>
    `;
  }

  private renderInsight(insight: AgentInsight): string {
    const badge = PRIORITY_BADGES[insight.priority];
    const relativeTime = this.getRelativeTime(insight.timestamp);

    return `
      <div class="intelligence-feed__item" data-insight-id="${insight.id}">
        <div class="intelligence-feed__item-header">
          <span class="intelligence-feed__item-badge intelligence-feed__item-badge--${insight.priority}">${badge}</span>
          <span class="intelligence-feed__item-priority">${insight.priority}</span>
          <span class="intelligence-feed__item-source">${insight.sourceAgent}</span>
          <span class="intelligence-feed__item-time">${relativeTime}</span>
        </div>
        <div class="intelligence-feed__item-body">
          <span class="intelligence-feed__item-summary">${insight.summary}</span>
        </div>
        <div class="intelligence-feed__item-actions">
          <button class="intelligence-feed__btn intelligence-feed__btn--approve" data-approve-id="${insight.id}" aria-label="Approve insight">✓ Approve</button>
          <button class="intelligence-feed__btn intelligence-feed__btn--dismiss" data-dismiss-id="${insight.id}" aria-label="Dismiss insight">✗ Dismiss</button>
          <button class="intelligence-feed__btn intelligence-feed__btn--bookmark" data-bookmark-id="${insight.id}" aria-label="Bookmark insight">🔖 Bookmark</button>
        </div>
      </div>
    `;
  }

  private renderBookmarked(insights: AgentInsight[]): string {
    const items = insights.map((insight) => `
      <div class="intelligence-feed__bookmarked-item" data-bookmarked-id="${insight.id}">
        <span class="intelligence-feed__item-badge intelligence-feed__item-badge--${insight.priority}">${PRIORITY_BADGES[insight.priority]}</span>
        <span class="intelligence-feed__item-summary">${insight.summary}</span>
        <span class="intelligence-feed__item-source">${insight.sourceAgent}</span>
      </div>
    `).join('');

    return `
      <div class="intelligence-feed__bookmarks">
        <h4 class="intelligence-feed__bookmarks-title">🔖 Bookmarked (${insights.length})</h4>
        ${items}
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
        const insight = this.data.insights.find((i) => i.id === id);
        if (insight) {
          insight.status = 'approved';
          this.options.onApprove?.(id);
          this.render();
          this.attachListeners();
        }
      });
    });

    // Dismiss buttons
    this.container.querySelectorAll('[data-dismiss-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.dismissId!;
        const insight = this.data.insights.find((i) => i.id === id);
        if (insight) {
          insight.status = 'dismissed';
          this.options.onDismiss?.(id);
          this.render();
          this.attachListeners();
        }
      });
    });

    // Bookmark buttons
    this.container.querySelectorAll('[data-bookmark-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.bookmarkId!;
        const insight = this.data.insights.find((i) => i.id === id);
        if (insight) {
          insight.status = 'bookmarked';
          this.options.onBookmark?.(id);
          this.render();
          this.attachListeners();
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getRelativeTime(isoString: string): string {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;

    if (diffMs < 60000) return 'just now';
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
