/**
 * King's View — Briefing Card
 *
 * Instant state recovery card displayed at the top of the King's View tab.
 * Shows: current top 3 priorities, active blockers (count + severity),
 * revenue status (MRR + trend), key events since last login.
 *
 * Includes session continuity indicator and "since last login" relative time.
 * Auto-refreshes via WebSocket on `portfolio.metrics_updated` events.
 *
 * Requirements: 46a.1, 9.1
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlockerSeverity = 'critical' | 'high' | 'medium' | 'low';
export type RevenueTrend = 'up' | 'down' | 'flat';

export interface Priority {
  id: string;
  title: string;
  urgency: BlockerSeverity;
}

export interface Blocker {
  id: string;
  title: string;
  severity: BlockerSeverity;
  source: string;
}

export interface RevenueStatus {
  mrr: number;
  trend: RevenueTrend;
  changePercent: number;
}

export interface RecentEvent {
  id: string;
  description: string;
  timestamp: string;
  source: string;
}

export interface SessionContinuity {
  hasGap: boolean;
  gapStart?: string;
  gapEnd?: string;
  recoveredAt?: string;
}

export interface BriefingCardData {
  priorities: Priority[];
  blockers: Blocker[];
  revenue: RevenueStatus;
  recentEvents: RecentEvent[];
  lastLoginAt: string;
  sessionContinuity: SessionContinuity;
}

export interface BriefingCardOptions {
  onPriorityClick?: (id: string) => void;
  onBlockerClick?: (id: string) => void;
  onEventClick?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// KingsBriefingCard
// ---------------------------------------------------------------------------

export class KingsBriefingCard {
  private container: HTMLElement;
  private data: BriefingCardData;
  private options: BriefingCardOptions;
  private wsUnsubscribe: (() => void) | null = null;

  constructor(container: HTMLElement, data: BriefingCardData, options: BriefingCardOptions = {}) {
    this.container = container;
    this.data = data;
    this.options = options;
  }

  mount(): void {
    this.render();
    this.attachListeners();
  }

  unmount(): void {
    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = null;
    }
    this.container.innerHTML = '';
  }

  update(data: BriefingCardData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    const topPriorities = this.data.priorities.slice(0, 3);
    const blockerCount = this.data.blockers.length;
    const highestSeverity = this.getHighestSeverity(this.data.blockers);
    const sinceLastLogin = this.getRelativeTime(this.data.lastLoginAt);

    this.container.innerHTML = `
      <div class="briefing-card" role="region" aria-label="King's Briefing">
        <div class="briefing-card__header">
          <h3 class="briefing-card__title">👑 King's Briefing</h3>
          <span class="briefing-card__last-login" title="${this.data.lastLoginAt}">Since last login: ${sinceLastLogin}</span>
        </div>

        ${this.renderSessionContinuity()}

        <div class="briefing-card__grid">
          ${this.renderPriorities(topPriorities)}
          ${this.renderBlockers(blockerCount, highestSeverity)}
          ${this.renderRevenue()}
          ${this.renderRecentEvents()}
        </div>
      </div>
    `;
  }

  private renderSessionContinuity(): string {
    const { sessionContinuity } = this.data;
    if (!sessionContinuity.hasGap) return '';

    const gapDuration = sessionContinuity.gapStart && sessionContinuity.gapEnd
      ? this.getRelativeTime(sessionContinuity.gapStart)
      : 'unknown duration';

    return `
      <div class="briefing-card__continuity briefing-card__continuity--gap" role="alert">
        <span class="briefing-card__continuity-icon">⚠️</span>
        <span class="briefing-card__continuity-text">Session gap detected — context recovered at ${sessionContinuity.recoveredAt ? new Date(sessionContinuity.recoveredAt).toLocaleTimeString() : 'now'}</span>
      </div>
    `;
  }

  private renderPriorities(priorities: Priority[]): string {
    if (priorities.length === 0) {
      return `
        <div class="briefing-card__section briefing-card__section--priorities">
          <h4 class="briefing-card__section-title">🎯 Top Priorities</h4>
          <div class="briefing-card__empty">No active priorities</div>
        </div>
      `;
    }

    const items = priorities.map((p) => `
      <li class="briefing-card__priority-item" data-priority-id="${p.id}">
        <span class="briefing-card__priority-urgency briefing-card__priority-urgency--${p.urgency}">${p.urgency}</span>
        <span class="briefing-card__priority-title">${p.title}</span>
      </li>
    `).join('');

    return `
      <div class="briefing-card__section briefing-card__section--priorities">
        <h4 class="briefing-card__section-title">🎯 Top Priorities</h4>
        <ol class="briefing-card__priority-list">${items}</ol>
      </div>
    `;
  }

  private renderBlockers(count: number, highestSeverity: BlockerSeverity | null): string {
    if (count === 0) {
      return `
        <div class="briefing-card__section briefing-card__section--blockers">
          <h4 class="briefing-card__section-title">🚧 Active Blockers</h4>
          <div class="briefing-card__empty">No active blockers</div>
        </div>
      `;
    }

    const severityClass = highestSeverity ? `briefing-card__blocker-count--${highestSeverity}` : '';

    return `
      <div class="briefing-card__section briefing-card__section--blockers">
        <h4 class="briefing-card__section-title">🚧 Active Blockers</h4>
        <div class="briefing-card__blocker-summary">
          <span class="briefing-card__blocker-count ${severityClass}" data-blocker-count="${count}">${count} blocker${count !== 1 ? 's' : ''}</span>
          <span class="briefing-card__blocker-severity">Highest: ${highestSeverity || 'none'}</span>
        </div>
        <ul class="briefing-card__blocker-list">
          ${this.data.blockers.slice(0, 3).map((b) => `
            <li class="briefing-card__blocker-item" data-blocker-id="${b.id}">
              <span class="briefing-card__blocker-sev briefing-card__blocker-sev--${b.severity}">●</span>
              <span class="briefing-card__blocker-title">${b.title}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  private renderRevenue(): string {
    const { mrr, trend, changePercent } = this.data.revenue;
    const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
    const trendClass = `briefing-card__revenue-trend--${trend}`;

    return `
      <div class="briefing-card__section briefing-card__section--revenue">
        <h4 class="briefing-card__section-title">💰 Revenue Status</h4>
        <div class="briefing-card__revenue-display">
          <span class="briefing-card__revenue-mrr" data-metric="mrr">${this.formatCurrency(mrr)}</span>
          <span class="briefing-card__revenue-trend ${trendClass}">
            ${trendIcon} ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%
          </span>
        </div>
      </div>
    `;
  }

  private renderRecentEvents(): string {
    const events = this.data.recentEvents.slice(0, 5);

    if (events.length === 0) {
      return `
        <div class="briefing-card__section briefing-card__section--events">
          <h4 class="briefing-card__section-title">📋 Recent Events</h4>
          <div class="briefing-card__empty">No events since last login</div>
        </div>
      `;
    }

    const items = events.map((e) => `
      <li class="briefing-card__event-item" data-event-id="${e.id}">
        <span class="briefing-card__event-time">${this.getRelativeTime(e.timestamp)}</span>
        <span class="briefing-card__event-desc">${e.description}</span>
        <span class="briefing-card__event-source">${e.source}</span>
      </li>
    `).join('');

    return `
      <div class="briefing-card__section briefing-card__section--events">
        <h4 class="briefing-card__section-title">📋 Recent Events</h4>
        <ul class="briefing-card__event-list">${items}</ul>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    this.container.querySelectorAll('[data-priority-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.priorityId!;
        this.options.onPriorityClick?.(id);
      });
    });

    this.container.querySelectorAll('[data-blocker-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.blockerId!;
        this.options.onBlockerClick?.(id);
      });
    });

    this.container.querySelectorAll('[data-event-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.eventId!;
        this.options.onEventClick?.(id);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getHighestSeverity(blockers: Blocker[]): BlockerSeverity | null {
    if (blockers.length === 0) return null;
    const order: Record<BlockerSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return blockers.reduce((highest, b) =>
      order[b.severity] < order[highest.severity] ? b : highest
    ).severity;
  }

  private getRelativeTime(isoString: string): string {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;

    if (diffMs < 0) return 'just now';

    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return new Date(isoString).toLocaleDateString();
  }

  private formatCurrency(amount: number): string {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  }
}
