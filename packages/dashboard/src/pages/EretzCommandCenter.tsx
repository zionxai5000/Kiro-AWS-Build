/**
 * Eretz Business Command Center — Full-Page Dedicated Tab
 *
 * The single pane of glass for the entire business portfolio. Displays:
 * - Portfolio overview header (total MRR, revenue, growth, health)
 * - Per-subsidiary cards (ZionX, ZXMG, Zion Alpha)
 * - Synergy map, pattern library, training cascade
 * - Recommendation queue, decline alerts
 * - Resource allocation, strategic priorities
 *
 * This is a presentation layer only — all data sourced from existing
 * Eretz services via WebSocket/REST.
 *
 * Requirements: 46a.1, 46a.2, 46a.3, 46b.4, 46b.5, 46c.6, 46c.7, 46c.8
 */

import { PortfolioOverviewHeader, type PortfolioOverviewData } from '../components/command-center/PortfolioOverviewHeader.js';
import { SubsidiaryCardGrid, type SubsidiaryCardsData } from '../components/command-center/SubsidiaryCardGrid.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortfolioHealth = 'strong' | 'stable' | 'at_risk' | 'critical';

export interface EretzCommandCenterData {
  portfolio: PortfolioOverviewData;
  subsidiaries: SubsidiaryCardsData;
}

// ---------------------------------------------------------------------------
// EretzCommandCenter
// ---------------------------------------------------------------------------

export interface EretzCommandCenterOptions {
  onNavigateToSubsidiary?: (subsidiary: string) => void;
}

export class EretzCommandCenter {
  private container: HTMLElement;
  private data: EretzCommandCenterData;
  private options: EretzCommandCenterOptions;
  private headerComponent: PortfolioOverviewHeader | null = null;
  private cardGridComponent: SubsidiaryCardGrid | null = null;
  private ws: WebSocket | null = null;

  constructor(
    container: HTMLElement,
    data: EretzCommandCenterData,
    options: EretzCommandCenterOptions = {},
  ) {
    this.container = container;
    this.data = data;
    this.options = options;
  }

  mount(): void {
    this.render();
    this.mountSubComponents();
    this.connectWebSocket();
  }

  unmount(): void {
    this.headerComponent?.unmount();
    this.cardGridComponent?.unmount();
    this.disconnectWebSocket();
    this.container.innerHTML = '';
  }

  /** Update portfolio data from external source (e.g., WebSocket push) */
  updateData(data: Partial<EretzCommandCenterData>): void {
    if (data.portfolio) {
      this.data.portfolio = data.portfolio;
      this.headerComponent?.update(data.portfolio);
    }
    if (data.subsidiaries) {
      this.data.subsidiaries = data.subsidiaries;
      this.cardGridComponent?.update(data.subsidiaries);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    this.container.innerHTML = `
      <div class="command-center" role="main" aria-label="Eretz Business Command Center">
        <div class="command-center__header-section" id="cc-portfolio-header"></div>
        <div class="command-center__grid">
          <div class="command-center__subsidiary-section" id="cc-subsidiary-cards"></div>
          <div class="command-center__synergy-section" id="cc-synergy-map">
            <div class="command-center__placeholder">Synergy Map</div>
          </div>
          <div class="command-center__pattern-section" id="cc-pattern-library">
            <div class="command-center__placeholder">Pattern Library</div>
          </div>
          <div class="command-center__training-section" id="cc-training-cascade">
            <div class="command-center__placeholder">Training Cascade</div>
          </div>
          <div class="command-center__recommendations-section" id="cc-recommendations">
            <div class="command-center__placeholder">Recommendation Queue</div>
          </div>
          <div class="command-center__alerts-section" id="cc-decline-alerts">
            <div class="command-center__placeholder">Decline Alerts</div>
          </div>
          <div class="command-center__allocation-section" id="cc-resource-allocation">
            <div class="command-center__placeholder">Resource Allocation</div>
          </div>
          <div class="command-center__strategy-section" id="cc-strategic-priorities">
            <div class="command-center__placeholder">Strategic Priorities</div>
          </div>
        </div>
      </div>
    `;
  }

  private mountSubComponents(): void {
    const headerEl = this.container.querySelector('#cc-portfolio-header') as HTMLElement;
    if (headerEl) {
      this.headerComponent = new PortfolioOverviewHeader(headerEl, this.data.portfolio);
      this.headerComponent.mount();
    }

    const cardsEl = this.container.querySelector('#cc-subsidiary-cards') as HTMLElement;
    if (cardsEl) {
      this.cardGridComponent = new SubsidiaryCardGrid(cardsEl, this.data.subsidiaries, {
        onNavigate: this.options.onNavigateToSubsidiary,
      });
      this.cardGridComponent.mount();
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket Connection
  // ---------------------------------------------------------------------------

  private connectWebSocket(): void {
    try {
      const apiUrl = (window as any).__SERAPHIM_API_URL__ || (window.location.origin + '/api');
      const wsBase = apiUrl.replace(/\/api$/, '').replace(/^http/, 'ws');
      const wsUrl = `${wsBase}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data as string);
          if (message.type === 'portfolio.metrics_updated' && message.data) {
            this.updateData({ portfolio: message.data as PortfolioOverviewData });
          }
          if (message.type === 'subsidiary.metrics_updated' && message.data) {
            this.updateData({ subsidiaries: message.data as SubsidiaryCardsData });
          }
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onerror = () => {
        // Silent — command center still works with provided data
      };
    } catch {
      // WebSocket not available
    }
  }

  private disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
