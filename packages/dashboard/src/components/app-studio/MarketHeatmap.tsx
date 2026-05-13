/**
 * ZionX App Studio — Market Opportunity Heatmap
 *
 * Bubble chart heatmap: X-axis = app categories, Y-axis = revenue potential tier,
 * bubble size = gap opportunity score (inverse competition × review gap).
 * Color coding: green = high opportunity, yellow = moderate, red = saturated.
 * Click-on-bubble drill-down, filter controls.
 *
 * Requirements: 45a.1, 45b.5
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpportunityLevel = 'high' | 'moderate' | 'saturated';
export type RevenueTier = 'tier1' | 'tier2' | 'tier3' | 'tier4';

export interface MarketOpportunity {
  id: string;
  category: string;
  revenueTier: RevenueTier;
  opportunityScore: number; // 0-100
  opportunityLevel: OpportunityLevel;
  competitorCount: number;
  reviewGap: number;
  estimatedDownloads: number;
  nicheDetails: {
    topCompetitors: string[];
    avgRating: number;
    marketSize: string;
  };
}

export interface MarketHeatmapFilters {
  minRevenue?: RevenueTier;
  maxCompetition?: number;
  categories?: string[];
}

export interface MarketHeatmapData {
  opportunities: MarketOpportunity[];
  categories: string[];
}

export interface MarketHeatmapOptions {
  onBubbleClick?: (opportunityId: string) => void;
  onFilterChange?: (filters: MarketHeatmapFilters) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REVENUE_TIER_LABELS: Record<RevenueTier, string> = {
  tier1: '$100K+/mo',
  tier2: '$50K-100K/mo',
  tier3: '$10K-50K/mo',
  tier4: '$1K-10K/mo',
};

const REVENUE_TIER_ORDER: Record<RevenueTier, number> = {
  tier1: 0,
  tier2: 1,
  tier3: 2,
  tier4: 3,
};

const OPPORTUNITY_COLORS: Record<OpportunityLevel, string> = {
  high: '#22c55e',
  moderate: '#eab308',
  saturated: '#ef4444',
};

// ---------------------------------------------------------------------------
// MarketOpportunityHeatmap
// ---------------------------------------------------------------------------

export class MarketOpportunityHeatmap {
  private container: HTMLElement;
  private data: MarketHeatmapData;
  private options: MarketHeatmapOptions;
  private filters: MarketHeatmapFilters = {};
  private selectedOpportunityId: string | null = null;

  constructor(container: HTMLElement, data: MarketHeatmapData, options: MarketHeatmapOptions = {}) {
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

  update(data: MarketHeatmapData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    const filtered = this.getFilteredOpportunities();
    const selected = this.selectedOpportunityId
      ? this.data.opportunities.find((o) => o.id === this.selectedOpportunityId) ?? null
      : null;

    this.container.innerHTML = `
      <div class="market-heatmap" role="region" aria-label="Market Opportunity Heatmap">
        <div class="market-heatmap__header">
          <h3 class="market-heatmap__title">🗺️ Market Opportunity Heatmap</h3>
          <span class="market-heatmap__count">${filtered.length} opportunities</span>
        </div>
        ${this.renderFilters()}
        <div class="market-heatmap__chart">
          ${this.renderChart(filtered)}
        </div>
        ${filtered.length === 0 ? '<div class="market-heatmap__empty">No opportunities match current filters</div>' : ''}
        ${selected ? this.renderDrillDown(selected) : ''}
      </div>
    `;
  }

  private renderFilters(): string {
    const categoryOptions = this.data.categories.map((cat) =>
      `<option value="${cat}" ${this.filters.categories?.includes(cat) ? 'selected' : ''}>${cat}</option>`
    ).join('');

    return `
      <div class="market-heatmap__filters">
        <select class="market-heatmap__filter-select" id="heatmap-revenue-filter" aria-label="Minimum revenue tier">
          <option value="">Revenue: Any</option>
          <option value="tier4" ${this.filters.minRevenue === 'tier4' ? 'selected' : ''}>$1K+/mo</option>
          <option value="tier3" ${this.filters.minRevenue === 'tier3' ? 'selected' : ''}>$10K+/mo</option>
          <option value="tier2" ${this.filters.minRevenue === 'tier2' ? 'selected' : ''}>$50K+/mo</option>
          <option value="tier1" ${this.filters.minRevenue === 'tier1' ? 'selected' : ''}>$100K+/mo</option>
        </select>
        <select class="market-heatmap__filter-select" id="heatmap-competition-filter" aria-label="Maximum competition">
          <option value="">Competition: Any</option>
          <option value="10" ${this.filters.maxCompetition === 10 ? 'selected' : ''}>≤10 competitors</option>
          <option value="25" ${this.filters.maxCompetition === 25 ? 'selected' : ''}>≤25 competitors</option>
          <option value="50" ${this.filters.maxCompetition === 50 ? 'selected' : ''}>≤50 competitors</option>
        </select>
        <select class="market-heatmap__filter-select" id="heatmap-category-filter" aria-label="Category filter">
          <option value="">Category: All</option>
          ${categoryOptions}
        </select>
      </div>
    `;
  }

  private renderChart(opportunities: MarketOpportunity[]): string {
    const categories = this.data.categories;
    const tiers: RevenueTier[] = ['tier1', 'tier2', 'tier3', 'tier4'];

    // Render as a grid-based bubble chart
    const bubbles = opportunities.map((opp) => {
      const xIndex = categories.indexOf(opp.category);
      const yIndex = REVENUE_TIER_ORDER[opp.revenueTier];
      const size = Math.max(20, Math.min(60, opp.opportunityScore * 0.6));
      const color = OPPORTUNITY_COLORS[opp.opportunityLevel];
      const x = (xIndex / Math.max(categories.length - 1, 1)) * 80 + 10;
      const y = (yIndex / 3) * 70 + 15;

      return `<div class="market-heatmap__bubble market-heatmap__bubble--${opp.opportunityLevel}"
                   data-opportunity-id="${opp.id}"
                   style="left: ${x}%; top: ${y}%; width: ${size}px; height: ${size}px; background-color: ${color};"
                   role="button"
                   tabindex="0"
                   aria-label="${opp.category} - ${REVENUE_TIER_LABELS[opp.revenueTier]} - Score: ${opp.opportunityScore}"
                   title="${opp.category}: Score ${opp.opportunityScore}">
                <span class="market-heatmap__bubble-score">${opp.opportunityScore}</span>
              </div>`;
    }).join('');

    // Y-axis labels
    const yLabels = tiers.map((tier, idx) =>
      `<span class="market-heatmap__y-label" style="top: ${(idx / 3) * 70 + 15}%">${REVENUE_TIER_LABELS[tier]}</span>`
    ).join('');

    // X-axis labels
    const xLabels = categories.map((cat, idx) =>
      `<span class="market-heatmap__x-label" style="left: ${(idx / Math.max(categories.length - 1, 1)) * 80 + 10}%">${cat}</span>`
    ).join('');

    return `
      <div class="market-heatmap__chart-area">
        <div class="market-heatmap__y-axis">${yLabels}</div>
        <div class="market-heatmap__plot-area">
          ${bubbles}
        </div>
        <div class="market-heatmap__x-axis">${xLabels}</div>
      </div>
    `;
  }

  private renderDrillDown(opp: MarketOpportunity): string {
    return `
      <div class="market-heatmap__drilldown" data-drilldown-id="${opp.id}">
        <div class="market-heatmap__drilldown-header">
          <h4 class="market-heatmap__drilldown-title">${opp.category} — ${REVENUE_TIER_LABELS[opp.revenueTier]}</h4>
          <button class="market-heatmap__drilldown-close" data-close-drilldown aria-label="Close drill-down">✕</button>
        </div>
        <div class="market-heatmap__drilldown-body">
          <div class="market-heatmap__drilldown-stat">
            <span class="market-heatmap__drilldown-label">Opportunity Score:</span>
            <span class="market-heatmap__drilldown-value">${opp.opportunityScore}/100</span>
          </div>
          <div class="market-heatmap__drilldown-stat">
            <span class="market-heatmap__drilldown-label">Competitors:</span>
            <span class="market-heatmap__drilldown-value">${opp.competitorCount}</span>
          </div>
          <div class="market-heatmap__drilldown-stat">
            <span class="market-heatmap__drilldown-label">Review Gap:</span>
            <span class="market-heatmap__drilldown-value">${opp.reviewGap}%</span>
          </div>
          <div class="market-heatmap__drilldown-stat">
            <span class="market-heatmap__drilldown-label">Est. Downloads:</span>
            <span class="market-heatmap__drilldown-value">${this.formatNumber(opp.estimatedDownloads)}/mo</span>
          </div>
          <div class="market-heatmap__drilldown-stat">
            <span class="market-heatmap__drilldown-label">Top Competitors:</span>
            <span class="market-heatmap__drilldown-value">${opp.nicheDetails.topCompetitors.join(', ')}</span>
          </div>
          <div class="market-heatmap__drilldown-stat">
            <span class="market-heatmap__drilldown-label">Avg Rating:</span>
            <span class="market-heatmap__drilldown-value">${opp.nicheDetails.avgRating}⭐</span>
          </div>
          <div class="market-heatmap__drilldown-stat">
            <span class="market-heatmap__drilldown-label">Market Size:</span>
            <span class="market-heatmap__drilldown-value">${opp.nicheDetails.marketSize}</span>
          </div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    // Bubble clicks
    this.container.querySelectorAll('[data-opportunity-id]').forEach((bubble) => {
      bubble.addEventListener('click', () => {
        const id = (bubble as HTMLElement).dataset.opportunityId!;
        this.selectedOpportunityId = this.selectedOpportunityId === id ? null : id;
        this.options.onBubbleClick?.(id);
        this.render();
        this.attachListeners();
      });
    });

    // Close drill-down
    this.container.querySelector('[data-close-drilldown]')?.addEventListener('click', () => {
      this.selectedOpportunityId = null;
      this.render();
      this.attachListeners();
    });

    // Revenue filter
    const revenueFilter = this.container.querySelector('#heatmap-revenue-filter') as HTMLSelectElement;
    revenueFilter?.addEventListener('change', () => {
      this.filters.minRevenue = revenueFilter.value ? revenueFilter.value as RevenueTier : undefined;
      this.options.onFilterChange?.(this.filters);
      this.render();
      this.attachListeners();
    });

    // Competition filter
    const competitionFilter = this.container.querySelector('#heatmap-competition-filter') as HTMLSelectElement;
    competitionFilter?.addEventListener('change', () => {
      this.filters.maxCompetition = competitionFilter.value ? parseInt(competitionFilter.value, 10) : undefined;
      this.options.onFilterChange?.(this.filters);
      this.render();
      this.attachListeners();
    });

    // Category filter
    const categoryFilter = this.container.querySelector('#heatmap-category-filter') as HTMLSelectElement;
    categoryFilter?.addEventListener('change', () => {
      this.filters.categories = categoryFilter.value ? [categoryFilter.value] : undefined;
      this.options.onFilterChange?.(this.filters);
      this.render();
      this.attachListeners();
    });
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  private getFilteredOpportunities(): MarketOpportunity[] {
    let filtered = [...this.data.opportunities];

    if (this.filters.minRevenue) {
      const minOrder = REVENUE_TIER_ORDER[this.filters.minRevenue];
      filtered = filtered.filter((o) => REVENUE_TIER_ORDER[o.revenueTier] <= minOrder);
    }

    if (this.filters.maxCompetition !== undefined) {
      filtered = filtered.filter((o) => o.competitorCount <= this.filters.maxCompetition!);
    }

    if (this.filters.categories && this.filters.categories.length > 0) {
      filtered = filtered.filter((o) => this.filters.categories!.includes(o.category));
    }

    return filtered;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  }
}
