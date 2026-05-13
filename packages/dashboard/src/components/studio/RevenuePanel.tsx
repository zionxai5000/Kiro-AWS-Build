/**
 * ZionX App Development Studio — Revenue Panel Component
 *
 * Displays downloads, revenue (subscription + ad), ratings, reviews,
 * crash rate, retention metrics. Cost-per-app and cost-per-edit metrics
 * from Otzar. Scale/optimize/kill recommendation display with confidence indicator.
 *
 * Requirements: 42g.19, 42g.20, 42g.21
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Recommendation = 'scale' | 'optimize' | 'kill';

export interface RevenueMetrics {
  downloads: number;
  subscriptionRevenue: number;
  adRevenue: number;
  totalRevenue: number;
  ratings: number;
  reviewCount: number;
  crashRate: number;
  retentionDay1: number;
  retentionDay7: number;
  retentionDay30: number;
}

export interface CostMetrics {
  costPerApp: number;
  costPerEdit: number;
  totalSpend: number;
  tokenUsage: number;
}

export interface RecommendationResult {
  action: Recommendation;
  confidence: number;
  reasoning: string;
}

export interface RevenuePanelProps {
  metrics: RevenueMetrics;
  costs: CostMetrics;
  recommendation: RecommendationResult;
  currency?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECOMMENDATION_COLORS: Record<Recommendation, string> = {
  scale: 'var(--color-success, #22c55e)',
  optimize: 'var(--color-warning, #f59e0b)',
  kill: 'var(--color-error, #ef4444)',
};

const RECOMMENDATION_ICONS: Record<Recommendation, string> = {
  scale: '🚀',
  optimize: '🔧',
  kill: '🛑',
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function formatCurrency(value: number, currency: string): string {
  return `${currency}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

function renderMetricCard(label: string, value: string, sublabel?: string): string {
  return `
    <div class="revenue-panel__metric-card">
      <span class="revenue-panel__metric-value">${value}</span>
      <span class="revenue-panel__metric-label">${label}</span>
      ${sublabel ? `<span class="revenue-panel__metric-sublabel">${sublabel}</span>` : ''}
    </div>
  `;
}

function renderRevenueMetrics(metrics: RevenueMetrics, currency: string): string {
  return `
    <div class="revenue-panel__section">
      <h4 class="revenue-panel__section-title">Revenue &amp; Downloads</h4>
      <div class="revenue-panel__metrics-grid">
        ${renderMetricCard('Downloads', formatNumber(metrics.downloads))}
        ${renderMetricCard('Subscription Revenue', formatCurrency(metrics.subscriptionRevenue, currency))}
        ${renderMetricCard('Ad Revenue', formatCurrency(metrics.adRevenue, currency))}
        ${renderMetricCard('Total Revenue', formatCurrency(metrics.totalRevenue, currency))}
      </div>
    </div>
  `;
}

function renderQualityMetrics(metrics: RevenueMetrics): string {
  return `
    <div class="revenue-panel__section">
      <h4 class="revenue-panel__section-title">Quality &amp; Engagement</h4>
      <div class="revenue-panel__metrics-grid">
        ${renderMetricCard('Rating', `⭐ ${metrics.ratings.toFixed(1)}`, `${formatNumber(metrics.reviewCount)} reviews`)}
        ${renderMetricCard('Crash Rate', formatPercentage(metrics.crashRate))}
        ${renderMetricCard('Day 1 Retention', formatPercentage(metrics.retentionDay1))}
        ${renderMetricCard('Day 7 Retention', formatPercentage(metrics.retentionDay7))}
        ${renderMetricCard('Day 30 Retention', formatPercentage(metrics.retentionDay30))}
      </div>
    </div>
  `;
}

function renderCostMetrics(costs: CostMetrics, currency: string): string {
  return `
    <div class="revenue-panel__section">
      <h4 class="revenue-panel__section-title">Otzar Cost Metrics</h4>
      <div class="revenue-panel__metrics-grid">
        ${renderMetricCard('Cost per App', formatCurrency(costs.costPerApp, currency))}
        ${renderMetricCard('Cost per Edit', formatCurrency(costs.costPerEdit, currency))}
        ${renderMetricCard('Total Spend', formatCurrency(costs.totalSpend, currency))}
        ${renderMetricCard('Token Usage', formatNumber(costs.tokenUsage), 'tokens')}
      </div>
    </div>
  `;
}

function renderRecommendation(rec: RecommendationResult): string {
  const confidencePercentage = Math.round(rec.confidence * 100);
  const color = RECOMMENDATION_COLORS[rec.action];
  const icon = RECOMMENDATION_ICONS[rec.action];

  return `
    <div class="revenue-panel__recommendation" data-recommendation="${rec.action}">
      <div class="revenue-panel__recommendation-header">
        <span class="revenue-panel__recommendation-icon">${icon}</span>
        <span class="revenue-panel__recommendation-action" style="color: ${color};">
          ${rec.action.toUpperCase()}
        </span>
        <div class="revenue-panel__confidence">
          <div class="revenue-panel__confidence-bar">
            <div class="revenue-panel__confidence-fill" style="width: ${confidencePercentage}%; background-color: ${color};"></div>
          </div>
          <span class="revenue-panel__confidence-label">${confidencePercentage}% confidence</span>
        </div>
      </div>
      <p class="revenue-panel__recommendation-reasoning">${rec.reasoning}</p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Main Render
// ---------------------------------------------------------------------------

/**
 * Renders the revenue panel as an HTML string.
 */
export function renderRevenuePanel(props: RevenuePanelProps): string {
  const currency = props.currency ?? '$';

  return `
    <div class="studio-revenue-panel">
      <h3 class="revenue-panel__title">Revenue &amp; Performance</h3>
      ${renderRevenueMetrics(props.metrics, currency)}
      ${renderQualityMetrics(props.metrics)}
      ${renderCostMetrics(props.costs, currency)}
      <div class="revenue-panel__section">
        <h4 class="revenue-panel__section-title">Recommendation</h4>
        ${renderRecommendation(props.recommendation)}
      </div>
    </div>
  `;
}

/**
 * Creates a DOM element for the revenue panel.
 */
export function createRevenuePanelElement(props: RevenuePanelProps): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderRevenuePanel(props);
  return container.firstElementChild as HTMLElement;
}
