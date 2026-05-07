/**
 * Shaar Dashboard — Main Application
 *
 * Orchestrates the dashboard layout, navigation routing, WebSocket
 * connection, and alert banner. Each view is lazily mounted when
 * navigated to and unmounted when leaving.
 *
 * Requirements: 9.1, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import { DashboardWebSocket } from './api.js';
import { AlertBanner } from './components/alert-banner.js';
import { Nav, type ViewName } from './components/nav.js';
import { AgentsView } from './views/agents.js';
import { AuditView } from './views/audit.js';
import { CostsView } from './views/costs.js';
import { HealthView } from './views/health.js';
import { PillarsView } from './views/pillars.js';
import { RecommendationsView } from './views/recommendations.js';
import { WorldClassView } from './views/world-class.js';
import { IndustryScannerView } from './views/industry-scanner.js';
import { CapabilityMaturityView } from './views/capability-maturity.js';
import { HeartbeatHistoryView } from './views/heartbeat-history.js';
import { ReferencesView } from './views/references.js';
import { QualityGateView } from './views/quality-gate.js';
import { BaselinesView } from './views/baselines.js';

interface ViewInstance {
  mount(): Promise<void>;
  unmount(): void;
}

/** Placeholder view for tabs that are not yet implemented */
class PlaceholderView implements ViewInstance {
  private container: HTMLElement;
  private title: string;

  constructor(container: HTMLElement, title: string) {
    this.container = container;
    this.title = title;
  }

  async mount(): Promise<void> {
    this.container.innerHTML = `
      <div class="view-placeholder">
        <h2>${this.title}</h2>
        <p>Coming soon</p>
      </div>
    `;
  }

  unmount(): void {
    this.container.innerHTML = '';
  }
}

/** King's View — executive summary landing page */
class KingsView implements ViewInstance {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.container.innerHTML = `
      <div class="view-header">
        <h2>King's View</h2>
      </div>
      <div class="kings-view-grid">
        <div class="kings-card">
          <div class="kings-card-label">Total MRR</div>
          <div class="kings-card-value">$0</div>
        </div>
        <div class="kings-card">
          <div class="kings-card-label">System Health</div>
          <div class="kings-card-value kings-healthy">Operational</div>
        </div>
        <div class="kings-card">
          <div class="kings-card-label">Pending Recommendations</div>
          <div class="kings-card-value">0</div>
        </div>
        <div class="kings-card">
          <div class="kings-card-label">Active Alerts</div>
          <div class="kings-card-value">0</div>
        </div>
        <div class="kings-card kings-card-wide">
          <div class="kings-card-label">Top Priority Action</div>
          <div class="kings-card-value kings-priority">No pending actions</div>
        </div>
      </div>
    `;
  }

  unmount(): void {
    this.container.innerHTML = '';
  }
}

export class App {
  private root: HTMLElement;
  private ws: DashboardWebSocket;
  private nav!: Nav;
  private alertBanner!: AlertBanner;
  private currentView: ViewInstance | null = null;
  private currentViewName: ViewName | null = null;

  // DOM containers
  private navContainer!: HTMLElement;
  private alertContainer!: HTMLElement;
  private viewContainer!: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.ws = new DashboardWebSocket();
  }

  /** Initialize the app: build layout, connect WebSocket, mount default view. */
  async init(): Promise<void> {
    this.buildLayout();
    this.ws.connect();

    this.nav = new Nav(this.navContainer, {
      onNavigate: (view) => void this.navigateTo(view),
    });

    this.alertBanner = new AlertBanner(this.alertContainer, this.ws);

    // Detect whether a real backend is connected
    await this.detectBackend();

    // Default to King's View
    await this.navigateTo('kings-view');
  }

  /**
   * Probe the /api/health endpoint to determine if a REAL backend is running.
   * Removes the connecting banner when the backend responds.
   * Retries every 5 minutes if unreachable.
   */
  private async detectBackend(): Promise<void> {
    try {
      // Use the configured API URL (ALB/API Gateway), not window.location.origin (S3)
      const apiUrl = (window as any).__SERAPHIM_API_URL__ || (window.location.origin + '/api');
      const healthUrl = apiUrl.replace(/\/api$/, '') + '/health';
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const runtimeHeader = response.headers.get('x-seraphim-runtime');
        if (runtimeHeader === 'live') {
          // Real backend detected — remove connecting banner
          const banner = this.root.querySelector('#connecting-banner');
          if (banner) {
            banner.remove();
          }
        }
      }
    } catch {
      // Backend not reachable — retry in 5 minutes
      setTimeout(() => this.detectBackend(), 300_000);
    }
  }

  /** Navigate to a specific view. Unmounts the current view first. */
  async navigateTo(viewName: ViewName): Promise<void> {
    if (this.currentViewName === viewName) return;

    // Unmount current view
    if (this.currentView) {
      this.currentView.unmount();
      this.currentView = null;
    }

    this.currentViewName = viewName;
    this.nav.setActive(viewName);
    this.viewContainer.innerHTML = '';

    const view = this.createView(viewName);
    this.currentView = view;
    await view.mount();
  }

  /** Tear down the app. */
  destroy(): void {
    if (this.currentView) {
      this.currentView.unmount();
    }
    this.alertBanner.destroy();
    this.ws.disconnect();
  }

  private buildLayout(): void {
    this.root.innerHTML = `
      <div class="dashboard-app">
        <div class="connecting-banner" id="connecting-banner">⏳ Connecting to SeraphimOS backend...</div>
        <div class="dashboard-layout">
          <div id="dashboard-nav"></div>
          <div class="dashboard-main">
            <div id="dashboard-alerts"></div>
            <main id="dashboard-view" role="main"></main>
          </div>
        </div>
      </div>
    `;

    this.navContainer = this.root.querySelector('#dashboard-nav')!;
    this.alertContainer = this.root.querySelector('#dashboard-alerts')!;
    this.viewContainer = this.root.querySelector('#dashboard-view')!;
  }

  private createView(viewName: ViewName): ViewInstance {
    switch (viewName) {
      // King's View
      case 'kings-view':
        return new KingsView(this.viewContainer);

      // Seraphim Core — wire existing views to new tabs
      case 'seraphim-command-center':
        return new AgentsView(this.viewContainer, this.ws);
      case 'seraphim-governance':
        return new PlaceholderView(this.viewContainer, 'Governance');
      case 'seraphim-memory':
        return new PlaceholderView(this.viewContainer, 'Memory');
      case 'seraphim-resources':
        return new CostsView(this.viewContainer, this.ws);
      case 'seraphim-audit-trail':
        return new AuditView(this.viewContainer);
      case 'seraphim-learning':
        return new PlaceholderView(this.viewContainer, 'Learning');
      case 'seraphim-self-improvement':
        return new HealthView(this.viewContainer, this.ws);
      case 'seraphim-decisions':
        return new PlaceholderView(this.viewContainer, 'Decisions');

      // Eretz Business
      case 'eretz-portfolio':
        return new PillarsView(this.viewContainer);
      case 'eretz-synergies':
        return new PlaceholderView(this.viewContainer, 'Synergies');
      case 'eretz-patterns':
        return new PlaceholderView(this.viewContainer, 'Patterns');
      case 'eretz-training':
        return new PlaceholderView(this.viewContainer, 'Training');
      case 'eretz-directives':
        return new PlaceholderView(this.viewContainer, 'Directives');
      case 'eretz-standing-orders':
        return new PlaceholderView(this.viewContainer, 'Standing Orders');

      // ZionX
      case 'zionx-pipeline':
        return new PlaceholderView(this.viewContainer, 'Pipeline');
      case 'zionx-app-store':
        return new PlaceholderView(this.viewContainer, 'App Store');
      case 'zionx-marketing':
        return new PlaceholderView(this.viewContainer, 'Marketing');
      case 'zionx-design':
        return new PlaceholderView(this.viewContainer, 'Design');
      case 'zionx-revenue':
        return new PlaceholderView(this.viewContainer, 'Revenue');

      // ZXMG
      case 'zxmg-content-pipeline':
        return new PlaceholderView(this.viewContainer, 'Content Pipeline');
      case 'zxmg-performance':
        return new PlaceholderView(this.viewContainer, 'Performance');
      case 'zxmg-distribution':
        return new PlaceholderView(this.viewContainer, 'Distribution');
      case 'zxmg-monetization':
        return new PlaceholderView(this.viewContainer, 'Monetization');
      case 'zxmg-intelligence':
        return new PlaceholderView(this.viewContainer, 'Intelligence');

      // Zion Alpha
      case 'alpha-positions':
        return new PlaceholderView(this.viewContainer, 'Positions');
      case 'alpha-performance':
        return new PlaceholderView(this.viewContainer, 'Performance');
      case 'alpha-markets':
        return new PlaceholderView(this.viewContainer, 'Markets');
      case 'alpha-risk':
        return new PlaceholderView(this.viewContainer, 'Risk');
      case 'alpha-journal':
        return new PlaceholderView(this.viewContainer, 'Journal');

      // SME Intelligence
      case 'sme-recommendations':
        return new RecommendationsView(this.viewContainer);
      case 'sme-world-class':
        return new WorldClassView(this.viewContainer);
      case 'sme-industry-scanner':
        return new IndustryScannerView(this.viewContainer);
      case 'sme-capability-maturity':
        return new CapabilityMaturityView(this.viewContainer);
      case 'sme-heartbeat-history':
        return new HeartbeatHistoryView(this.viewContainer);

      // Reference Ingestion
      case 'ref-ingestion-status':
        return new ReferencesView(this.viewContainer);
      case 'ref-quality-gate':
        return new QualityGateView(this.viewContainer);
      case 'ref-baselines':
        return new BaselinesView(this.viewContainer);

      // Legacy views (backward compat)
      case 'agents':
        return new AgentsView(this.viewContainer, this.ws);
      case 'pillars':
        return new PillarsView(this.viewContainer);
      case 'costs':
        return new CostsView(this.viewContainer, this.ws);
      case 'audit':
        return new AuditView(this.viewContainer);
      case 'health':
        return new HealthView(this.viewContainer, this.ws);
      case 'recommendations':
        return new RecommendationsView(this.viewContainer);
      case 'world-class':
        return new WorldClassView(this.viewContainer);
      case 'industry-scanner':
        return new IndustryScannerView(this.viewContainer);
      case 'capability-maturity':
        return new CapabilityMaturityView(this.viewContainer);
      case 'heartbeat-history':
        return new HeartbeatHistoryView(this.viewContainer);

      default:
        return new PlaceholderView(this.viewContainer, viewName);
    }
  }
}
