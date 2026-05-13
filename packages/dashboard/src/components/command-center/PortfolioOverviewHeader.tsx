/**
 * Eretz Command Center — Portfolio Overview Header
 *
 * Displays: total MRR, total revenue, growth trajectory sparkline,
 * portfolio health indicator (strong/stable/at_risk/critical),
 * and per-subsidiary MRR contribution breakdown.
 *
 * Requirements: 46b.4, 46b.5
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortfolioHealth = 'strong' | 'stable' | 'at_risk' | 'critical';

export interface SubsidiaryContribution {
  name: string;
  label: string;
  mrr: number;
  percentage: number;
  trend: 'up' | 'down' | 'flat';
  revenue: number;
}

export interface PortfolioOverviewData {
  totalMRR: number;
  totalRevenue: number;
  growthRate: number;
  growthHistory: number[]; // last N periods for sparkline
  health: PortfolioHealth;
  subsidiaryContributions: SubsidiaryContribution[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEALTH_LABELS: Record<PortfolioHealth, string> = {
  strong: '💪 Strong',
  stable: '✅ Stable',
  at_risk: '⚠️ At Risk',
  critical: '🚨 Critical',
};

const HEALTH_CLASSES: Record<PortfolioHealth, string> = {
  strong: 'portfolio-header__health--strong',
  stable: 'portfolio-header__health--stable',
  at_risk: 'portfolio-header__health--at-risk',
  critical: 'portfolio-header__health--critical',
};

const TREND_ICONS: Record<string, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

// ---------------------------------------------------------------------------
// PortfolioOverviewHeader
// ---------------------------------------------------------------------------

export class PortfolioOverviewHeader {
  private container: HTMLElement;
  private data: PortfolioOverviewData;

  constructor(container: HTMLElement, data: PortfolioOverviewData) {
    this.container = container;
    this.data = data;
  }

  mount(): void {
    this.render();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  update(data: PortfolioOverviewData): void {
    this.data = data;
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    this.container.innerHTML = `
      <div class="portfolio-header" role="banner" aria-label="Portfolio Overview">
        <div class="portfolio-header__metrics">
          <div class="portfolio-header__metric">
            <span class="portfolio-header__metric-label">Total MRR</span>
            <span class="portfolio-header__metric-value" data-metric="total-mrr">
              ${this.formatCurrency(this.data.totalMRR)}
            </span>
          </div>
          <div class="portfolio-header__metric">
            <span class="portfolio-header__metric-label">Total Revenue</span>
            <span class="portfolio-header__metric-value" data-metric="total-revenue">
              ${this.formatCurrency(this.data.totalRevenue)}
            </span>
          </div>
          <div class="portfolio-header__metric">
            <span class="portfolio-header__metric-label">Growth</span>
            <span class="portfolio-header__metric-value portfolio-header__growth" data-metric="growth-rate">
              ${this.data.growthRate >= 0 ? '+' : ''}${this.data.growthRate.toFixed(1)}%
            </span>
            <div class="portfolio-header__sparkline" data-metric="growth-sparkline" aria-label="Growth trajectory">
              ${this.renderSparkline(this.data.growthHistory)}
            </div>
          </div>
          <div class="portfolio-header__metric">
            <span class="portfolio-header__metric-label">Portfolio Health</span>
            <span class="portfolio-header__metric-value ${HEALTH_CLASSES[this.data.health]}" data-metric="health">
              ${HEALTH_LABELS[this.data.health]}
            </span>
          </div>
        </div>

        <div class="portfolio-header__breakdown" aria-label="Per-subsidiary breakdown">
          <h4 class="portfolio-header__breakdown-title">Subsidiary Contributions</h4>
          <div class="portfolio-header__contributions">
            ${this.data.subsidiaryContributions.map((sub) => this.renderContribution(sub)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private renderContribution(sub: SubsidiaryContribution): string {
    const trendClass = `portfolio-header__trend--${sub.trend}`;
    return `
      <div class="portfolio-header__contribution" data-subsidiary="${sub.name}">
        <span class="portfolio-header__contribution-name">${sub.label}</span>
        <span class="portfolio-header__contribution-mrr">${this.formatCurrency(sub.mrr)}</span>
        <span class="portfolio-header__contribution-pct">${sub.percentage.toFixed(1)}%</span>
        <span class="portfolio-header__contribution-trend ${trendClass}">
          ${TREND_ICONS[sub.trend]}
        </span>
      </div>
    `;
  }

  private renderSparkline(values: number[]): string {
    if (!values || values.length === 0) return '';
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const height = 24;
    const width = values.length * 6;

    const points = values
      .map((v, i) => {
        const x = i * 6;
        const y = height - ((v - min) / range) * height;
        return `${x},${y}`;
      })
      .join(' ');

    return `<svg class="portfolio-header__sparkline-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private formatCurrency(amount: number): string {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  }
}
