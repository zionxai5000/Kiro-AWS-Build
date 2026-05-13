/**
 * Eretz Command Center — Synergy Map Visualization
 *
 * Visual synergy map showing active synergies between subsidiaries with
 * connecting lines indicating data flow direction and revenue impact annotations.
 * Displays total additional revenue from cross-subsidiary synergies.
 *
 * Requirements: 46d.9, 46d.10
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Synergy {
  id: string;
  source: string;
  target: string;
  type: string;
  description: string;
  revenueImpact: number;
  active: boolean;
}

export interface SynergyMapData {
  synergies: Synergy[];
  totalSynergyRevenue: number;
}

// ---------------------------------------------------------------------------
// SynergyMapVisualization
// ---------------------------------------------------------------------------

export class SynergyMapVisualization {
  private container: HTMLElement;
  private data: SynergyMapData;

  constructor(container: HTMLElement, data: SynergyMapData) {
    this.container = container;
    this.data = data;
  }

  mount(): void {
    this.render();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  update(data: SynergyMapData): void {
    this.data = data;
    this.render();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    const activeSynergies = this.data.synergies.filter((s) => s.active);

    this.container.innerHTML = `
      <div class="synergy-map" role="region" aria-label="Synergy Map">
        <div class="synergy-map__header">
          <h4 class="synergy-map__title">🔗 Cross-Subsidiary Synergies</h4>
          <div class="synergy-map__total-revenue" data-metric="synergy-revenue">
            <span class="synergy-map__revenue-label">Synergy Revenue Impact</span>
            <span class="synergy-map__revenue-value">${this.formatCurrency(this.data.totalSynergyRevenue)}</span>
          </div>
        </div>

        <div class="synergy-map__visualization">
          <div class="synergy-map__nodes">
            <div class="synergy-map__node" data-node="zionx">⚡ ZionX</div>
            <div class="synergy-map__node" data-node="zxmg">🎬 ZXMG</div>
            <div class="synergy-map__node" data-node="zion-alpha">📈 Zion Alpha</div>
          </div>
          <div class="synergy-map__connections">
            ${activeSynergies.map((s) => this.renderConnection(s)).join('')}
          </div>
        </div>

        <div class="synergy-map__list">
          ${activeSynergies.length > 0
            ? activeSynergies.map((s) => this.renderSynergyItem(s)).join('')
            : '<div class="synergy-map__empty">No active synergies detected.</div>'
          }
        </div>
      </div>
    `;
  }

  private renderConnection(synergy: Synergy): string {
    return `
      <div class="synergy-map__connection" data-synergy-id="${synergy.id}" data-source="${synergy.source}" data-target="${synergy.target}">
        <span class="synergy-map__connection-flow">${synergy.source} → ${synergy.target}</span>
        <span class="synergy-map__connection-impact">+${this.formatCurrency(synergy.revenueImpact)}</span>
      </div>
    `;
  }

  private renderSynergyItem(synergy: Synergy): string {
    return `
      <div class="synergy-map__item" data-synergy-id="${synergy.id}">
        <div class="synergy-map__item-header">
          <span class="synergy-map__item-type">${synergy.type}</span>
          <span class="synergy-map__item-flow">${synergy.source} → ${synergy.target}</span>
        </div>
        <p class="synergy-map__item-description">${synergy.description}</p>
        <span class="synergy-map__item-revenue">+${this.formatCurrency(synergy.revenueImpact)}/mo</span>
      </div>
    `;
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
