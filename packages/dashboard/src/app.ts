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
import { StudioView } from './views/studio.js';
import { VideoStudioView } from './views/video-studio.js';
import { OV1View } from './views/seraphim-core/ov1-view.js';
import { SV1View } from './views/seraphim-core/sv1-view.js';
import { RequirementsView as SeraphimRequirementsView } from './views/seraphim-core/requirements-view.js';
import { DesignView as SeraphimDesignView } from './views/seraphim-core/design-view.js';
import { CapabilitiesView as SeraphimCapabilitiesView } from './views/seraphim-core/capabilities-view.js';

// Phase 12 — UX Enhancement Components
import { KingsBriefingCard, type BriefingCardData } from './components/kings-view/BriefingCard.js';
import { VisualPipelineBoard, type VisualPipelineBoardData } from './components/app-studio/VisualPipelineBoard.js';
import { RejectionCrisisPanel, type RejectionCrisisPanelData } from './components/app-studio/RejectionCrisisPanel.js';
import { MarketOpportunityHeatmap, type MarketHeatmapData } from './components/app-studio/MarketHeatmap.js';
import { ContentDiversityDashboard, type ContentDiversityData } from './components/video-studio/ContentDiversityDashboard.js';
import { PreGenerationComplianceCheck, type PreGenerationCheckData } from './components/video-studio/PreGenerationCheck.js';
import { EndToEndProductionTracker, type ProductionTrackerData } from './components/video-studio/ProductionTracker.js';
import { IntelligenceFeed, type IntelligenceFeedData } from './components/command-center/IntelligenceFeed.js';
import { StandingOrdersPanel, type StandingOrdersPanelData } from './components/command-center/StandingOrdersPanel.js';
import {
  SeraphimGovernanceView,
  SeraphimMemoryView,
  SeraphimLearningView,
  SeraphimDecisionsView,
  EretzSynergiesView,
  EretzPatternsView,
  EretzTrainingView,
  EretzDirectivesView,
  EretzStandingOrdersView,
  ZionXPipelineView,
  ZionXAppStoreView,
  ZionXMarketingView,
  ZionXDesignView,
  ZionXRevenueView,
  ZXMGContentPipelineView,
  ZXMGPerformanceView,
  ZXMGDistributionView,
  ZXMGMonetizationView,
  ZXMGIntelligenceView,
  ZionAlphaPositionsView,
  ZionAlphaPerformanceView,
  ZionAlphaMarketsView,
  ZionAlphaRiskView,
  ZionAlphaJournalView,
  ShaarAgentView,
} from './views/pillar-views.js';

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

/** King's View — executive summary landing page with Briefing Card */
class KingsView implements ViewInstance {
  private container: HTMLElement;
  private briefingCard: KingsBriefingCard | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.container.innerHTML = `
      <div class="view-header">
        <h2>King's View</h2>
      </div>
      <div id="kings-briefing-card"></div>
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

    // Mount the Briefing Card
    const briefingEl = this.container.querySelector('#kings-briefing-card') as HTMLElement;
    if (briefingEl) {
      const briefingData: BriefingCardData = {
        priorities: [
          { id: 'p1', title: 'Scale ZionX app pipeline to 20 apps', urgency: 'high' },
          { id: 'p2', title: 'Optimize ZXMG content-to-revenue', urgency: 'medium' },
          { id: 'p3', title: 'Maintain Zion Alpha win rate >65%', urgency: 'low' },
        ],
        blockers: [],
        revenue: { mrr: 0, trend: 'flat', changePercent: 0 },
        recentEvents: [],
        lastLoginAt: new Date(Date.now() - 3600000).toISOString(),
        sessionContinuity: { hasGap: false },
      };
      this.briefingCard = new KingsBriefingCard(briefingEl, briefingData);
      this.briefingCard.mount();
    }
  }

  unmount(): void {
    this.briefingCard?.unmount();
    this.briefingCard = null;
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
        return new SeraphimGovernanceView(this.viewContainer);
      case 'seraphim-memory':
        return new SeraphimMemoryView(this.viewContainer);
      case 'seraphim-resources':
        return new CostsView(this.viewContainer, this.ws);
      case 'seraphim-audit-trail':
        return new AuditView(this.viewContainer);
      case 'seraphim-learning':
        return new SeraphimLearningView(this.viewContainer);
      case 'seraphim-self-improvement':
        return new HealthView(this.viewContainer, this.ws);
      case 'seraphim-decisions':
        return new SeraphimDecisionsView(this.viewContainer);
      case 'seraphim-ov1':
        return new OV1View(this.viewContainer);
      case 'seraphim-sv1':
        return new SV1View(this.viewContainer);
      case 'seraphim-requirements':
        return new SeraphimRequirementsView(this.viewContainer);
      case 'seraphim-design':
        return new SeraphimDesignView(this.viewContainer);
      case 'seraphim-capabilities':
        return new SeraphimCapabilitiesView(this.viewContainer);

      // Eretz Business
      case 'eretz-portfolio':
        return new PillarsView(this.viewContainer);
      case 'eretz-synergies':
        return new EretzSynergiesView(this.viewContainer);
      case 'eretz-patterns':
        return new EretzPatternsView(this.viewContainer);
      case 'eretz-training':
        return new EretzTrainingView(this.viewContainer);
      case 'eretz-directives':
        return new EretzDirectivesView(this.viewContainer);
      case 'eretz-standing-orders':
        return new EretzStandingOrdersView(this.viewContainer);

      // ZionX
      case 'zionx-pipeline':
        return new ZionXPipelineView(this.viewContainer);
      case 'zionx-app-development':
        return new StudioView(this.viewContainer);
      case 'zionx-app-store':
        return new ZionXAppStoreView(this.viewContainer);
      case 'zionx-marketing':
        return new ZionXMarketingView(this.viewContainer);
      case 'zionx-design':
        return new ZionXDesignView(this.viewContainer);
      case 'zionx-revenue':
        return new ZionXRevenueView(this.viewContainer);

      // ZXMG
      case 'zxmg-video-production':
        return new VideoStudioView(this.viewContainer);
      case 'zxmg-content-pipeline':
        return new ZXMGContentPipelineView(this.viewContainer);
      case 'zxmg-performance':
        return new ZXMGPerformanceView(this.viewContainer);
      case 'zxmg-distribution':
        return new ZXMGDistributionView(this.viewContainer);
      case 'zxmg-monetization':
        return new ZXMGMonetizationView(this.viewContainer);
      case 'zxmg-intelligence':
        return new ZXMGIntelligenceView(this.viewContainer);

      // Zion Alpha
      case 'alpha-positions':
        return new ZionAlphaPositionsView(this.viewContainer);
      case 'alpha-performance':
        return new ZionAlphaPerformanceView(this.viewContainer);
      case 'alpha-markets':
        return new ZionAlphaMarketsView(this.viewContainer);
      case 'alpha-risk':
        return new ZionAlphaRiskView(this.viewContainer);
      case 'alpha-journal':
        return new ZionAlphaJournalView(this.viewContainer);

      // Shaar Agent
      case 'shaar-agent':
        return new ShaarAgentView(this.viewContainer);

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
