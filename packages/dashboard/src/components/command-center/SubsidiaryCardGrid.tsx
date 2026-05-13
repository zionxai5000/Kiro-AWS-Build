/**
 * Eretz Command Center — Subsidiary Card Grid
 *
 * Grid of per-subsidiary cards showing key metrics:
 * - ZionX: apps count, total app revenue, top 3 apps, pipeline count, growth trend
 * - ZXMG: channels count, total views, revenue, top 3 channels, content pipeline count
 * - Zion Alpha: active positions, P&L, win rate, strategy, risk exposure
 *
 * Requirements: 46c.6, 46c.7, 46c.8
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZionXCardData {
  appsCount: number;
  totalAppRevenue: number;
  topApps: Array<{ name: string; revenue: number }>;
  pipelineCount: number;
  growthTrend: 'up' | 'down' | 'flat';
}

export interface ZXMGCardData {
  channelsCount: number;
  totalViews: number;
  totalRevenue: number;
  topChannels: Array<{ name: string; revenue: number }>;
  contentPipelineCount: number;
}

export interface ZionAlphaCardData {
  activePositions: number;
  totalPnL: number;
  winRate: number;
  currentStrategy: string;
  riskExposure: 'low' | 'medium' | 'high';
}

export interface SubsidiaryCardsData {
  zionx: ZionXCardData;
  zxmg: ZXMGCardData;
  zionAlpha: ZionAlphaCardData;
}

// ---------------------------------------------------------------------------
// SubsidiaryCardGrid
// ---------------------------------------------------------------------------

export interface SubsidiaryCardGridOptions {
  onNavigate?: (subsidiary: string) => void;
}

export class SubsidiaryCardGrid {
  private container: HTMLElement;
  private data: SubsidiaryCardsData;
  private options: SubsidiaryCardGridOptions;

  constructor(container: HTMLElement, data: SubsidiaryCardsData, options: SubsidiaryCardGridOptions = {}) {
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

  update(data: SubsidiaryCardsData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    this.container.innerHTML = `
      <div class="subsidiary-grid" role="region" aria-label="Subsidiary Overview">
        ${this.renderZionXCard(this.data.zionx)}
        ${this.renderZXMGCard(this.data.zxmg)}
        ${this.renderZionAlphaCard(this.data.zionAlpha)}
      </div>
    `;
  }

  private renderZionXCard(data: ZionXCardData): string {
    const trendIcon = data.growthTrend === 'up' ? '↑' : data.growthTrend === 'down' ? '↓' : '→';
    const trendClass = `subsidiary-card__trend--${data.growthTrend}`;

    const topAppsHtml = data.topApps.slice(0, 3).map((app) =>
      `<li class="subsidiary-card__top-item">${app.name} — ${this.formatCurrency(app.revenue)}</li>`,
    ).join('');

    return `
      <div class="subsidiary-card subsidiary-card--zionx" data-subsidiary="zionx" role="article" aria-label="ZionX subsidiary">
        <div class="subsidiary-card__header">
          <h4 class="subsidiary-card__title">⚡ ZionX</h4>
          <span class="subsidiary-card__trend ${trendClass}">${trendIcon}</span>
        </div>
        <div class="subsidiary-card__metrics">
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">Apps</span>
            <span class="subsidiary-card__metric-value" data-metric="apps-count">${data.appsCount}</span>
          </div>
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">Revenue</span>
            <span class="subsidiary-card__metric-value" data-metric="app-revenue">${this.formatCurrency(data.totalAppRevenue)}</span>
          </div>
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">Pipeline</span>
            <span class="subsidiary-card__metric-value" data-metric="pipeline-count">${data.pipelineCount}</span>
          </div>
        </div>
        <div class="subsidiary-card__top-list">
          <span class="subsidiary-card__top-label">Top Apps</span>
          <ol class="subsidiary-card__top-items">${topAppsHtml}</ol>
        </div>
      </div>
    `;
  }

  private renderZXMGCard(data: ZXMGCardData): string {
    const topChannelsHtml = data.topChannels.slice(0, 3).map((ch) =>
      `<li class="subsidiary-card__top-item">${ch.name} — ${this.formatCurrency(ch.revenue)}</li>`,
    ).join('');

    return `
      <div class="subsidiary-card subsidiary-card--zxmg" data-subsidiary="zxmg" role="article" aria-label="ZXMG subsidiary">
        <div class="subsidiary-card__header">
          <h4 class="subsidiary-card__title">🎬 ZXMG</h4>
        </div>
        <div class="subsidiary-card__metrics">
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">Channels</span>
            <span class="subsidiary-card__metric-value" data-metric="channels-count">${data.channelsCount}</span>
          </div>
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">Views (30d)</span>
            <span class="subsidiary-card__metric-value" data-metric="total-views">${this.formatNumber(data.totalViews)}</span>
          </div>
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">Revenue</span>
            <span class="subsidiary-card__metric-value" data-metric="zxmg-revenue">${this.formatCurrency(data.totalRevenue)}</span>
          </div>
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">Pipeline</span>
            <span class="subsidiary-card__metric-value" data-metric="content-pipeline-count">${data.contentPipelineCount}</span>
          </div>
        </div>
        <div class="subsidiary-card__top-list">
          <span class="subsidiary-card__top-label">Top Channels</span>
          <ol class="subsidiary-card__top-items">${topChannelsHtml}</ol>
        </div>
      </div>
    `;
  }

  private renderZionAlphaCard(data: ZionAlphaCardData): string {
    const riskClass = `subsidiary-card__risk--${data.riskExposure}`;
    const pnlClass = data.totalPnL >= 0 ? 'subsidiary-card__pnl--positive' : 'subsidiary-card__pnl--negative';

    return `
      <div class="subsidiary-card subsidiary-card--alpha" data-subsidiary="zion-alpha" role="article" aria-label="Zion Alpha subsidiary">
        <div class="subsidiary-card__header">
          <h4 class="subsidiary-card__title">📈 Zion Alpha</h4>
        </div>
        <div class="subsidiary-card__metrics">
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">Positions</span>
            <span class="subsidiary-card__metric-value" data-metric="active-positions">${data.activePositions}</span>
          </div>
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">P&L</span>
            <span class="subsidiary-card__metric-value ${pnlClass}" data-metric="total-pnl">${data.totalPnL >= 0 ? '+' : ''}${this.formatCurrency(data.totalPnL)}</span>
          </div>
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">Win Rate</span>
            <span class="subsidiary-card__metric-value" data-metric="win-rate">${data.winRate}%</span>
          </div>
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">Strategy</span>
            <span class="subsidiary-card__metric-value" data-metric="strategy">${data.currentStrategy}</span>
          </div>
          <div class="subsidiary-card__metric">
            <span class="subsidiary-card__metric-label">Risk</span>
            <span class="subsidiary-card__metric-value ${riskClass}" data-metric="risk-exposure">${data.riskExposure}</span>
          </div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    this.container.querySelectorAll('[data-subsidiary]').forEach((card) => {
      card.addEventListener('click', () => {
        const subsidiary = (card as HTMLElement).dataset.subsidiary!;
        this.options.onNavigate?.(subsidiary);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private formatCurrency(amount: number): string {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  }
}
