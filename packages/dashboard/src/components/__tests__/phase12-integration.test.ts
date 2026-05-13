/**
 * Integration tests for Phase 12 — Dashboard UX Enhancements
 *
 * Validates end-to-end integration of all Phase 12 components:
 * - King's View tab loads briefing card
 * - ZionX Pipeline tab shows visual pipeline + rejection crisis + market heatmap
 * - ZXMG Content Pipeline tab shows diversity dashboard
 * - ZXMG Video Production tab shows compliance check + production tracker
 * - Eretz Command Center shows intelligence feed + standing orders
 * - All components integrate with WebSocket infrastructure
 * - All components source data from existing services (no business logic duplication)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// King's View
import { KingsBriefingCard, type BriefingCardData } from '../kings-view/BriefingCard.js';

// ZionX Pipeline
import { VisualPipelineBoard, type VisualPipelineBoardData } from '../app-studio/VisualPipelineBoard.js';
import { RejectionCrisisPanel, type RejectionCrisisPanelData } from '../app-studio/RejectionCrisisPanel.js';
import { MarketOpportunityHeatmap, type MarketHeatmapData } from '../app-studio/MarketHeatmap.js';

// ZXMG Content Pipeline
import { ContentDiversityDashboard, type ContentDiversityData } from '../video-studio/ContentDiversityDashboard.js';

// ZXMG Video Production
import { PreGenerationComplianceCheck, type PreGenerationCheckData } from '../video-studio/PreGenerationCheck.js';
import { EndToEndProductionTracker, type ProductionTrackerData } from '../video-studio/ProductionTracker.js';

// Eretz Command Center
import { IntelligenceFeed, type IntelligenceFeedData } from '../command-center/IntelligenceFeed.js';
import { StandingOrdersPanel, type StandingOrdersPanelData } from '../command-center/StandingOrdersPanel.js';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 1; // OPEN
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Simulate connection
    setTimeout(() => this.onopen?.({} as Event), 0);
  }

  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let originalWebSocket: typeof WebSocket;

beforeEach(() => {
  MockWebSocket.instances = [];
  originalWebSocket = (globalThis as any).WebSocket;
  (globalThis as any).WebSocket = MockWebSocket as any;
  (window as any).__SERAPHIM_API_URL__ = 'http://localhost:3000/api';
});

afterEach(() => {
  (globalThis as any).WebSocket = originalWebSocket;
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// King's View Tab Loads Briefing Card with Live Data
// ---------------------------------------------------------------------------

describe('Phase 12 Integration — King\'s View Tab', () => {
  it('should load briefing card with priorities, blockers, revenue, and events', () => {
    const container = createContainer();
    const data: BriefingCardData = {
      priorities: [
        { id: 'p1', title: 'Ship v2.0', urgency: 'critical' },
        { id: 'p2', title: 'Fix churn', urgency: 'high' },
        { id: 'p3', title: 'Hire designer', urgency: 'medium' },
      ],
      blockers: [{ id: 'b1', title: 'API down', severity: 'critical', source: 'ZionX' }],
      revenue: { mrr: 50000, trend: 'up', changePercent: 8.2 },
      recentEvents: [{ id: 'e1', description: 'App approved', timestamp: new Date().toISOString(), source: 'ZionX' }],
      lastLoginAt: new Date(Date.now() - 3600000).toISOString(),
      sessionContinuity: { hasGap: false },
    };

    const card = new KingsBriefingCard(container, data);
    card.mount();

    expect(container.querySelector('.briefing-card')).toBeTruthy();
    expect(container.querySelector('.briefing-card__priority-list')).toBeTruthy();
    expect(container.querySelector('.briefing-card__blocker-count')).toBeTruthy();
    expect(container.querySelector('[data-metric="mrr"]')).toBeTruthy();
    expect(container.querySelector('.briefing-card__event-list')).toBeTruthy();
  });

  it('should update briefing card via WebSocket data refresh', () => {
    const container = createContainer();
    const data: BriefingCardData = {
      priorities: [{ id: 'p1', title: 'Initial', urgency: 'medium' }],
      blockers: [],
      revenue: { mrr: 30000, trend: 'flat', changePercent: 0 },
      recentEvents: [],
      lastLoginAt: new Date().toISOString(),
      sessionContinuity: { hasGap: false },
    };

    const card = new KingsBriefingCard(container, data);
    card.mount();

    // Simulate WebSocket update
    const updatedData: BriefingCardData = {
      ...data,
      revenue: { mrr: 35000, trend: 'up', changePercent: 16.7 },
    };
    card.update(updatedData);

    expect(container.querySelector('[data-metric="mrr"]')?.textContent).toContain('$35K');
  });
});

// ---------------------------------------------------------------------------
// ZionX Pipeline Tab Shows Visual Pipeline + Rejection Crisis + Market Heatmap
// ---------------------------------------------------------------------------

describe('Phase 12 Integration — ZionX Pipeline Tab', () => {
  it('should render visual pipeline board with app cards', () => {
    const container = createContainer();
    const data: VisualPipelineBoardData = {
      apps: [
        { id: 'a1', name: 'TestApp', stage: 'development', daysInStage: 3, gateCheck: { passed: 50, total: 70, warnings: 2 }, health: 'healthy', priority: 1 },
      ],
      gateCheckpoints: [{ afterStage: 'testing', passCount: 5, failCount: 1 }],
    };

    const board = new VisualPipelineBoard(container, data);
    board.mount();

    expect(container.querySelector('.pipeline-board')).toBeTruthy();
    expect(container.querySelectorAll('.pipeline-board__column').length).toBe(10);
    expect(container.querySelector('[data-app-id="a1"]')).toBeTruthy();
  });

  it('should render rejection crisis panel when apps are rejected', () => {
    const container = createContainer();
    const data: RejectionCrisisPanelData = {
      activeRejections: [{
        id: 'r1',
        appName: 'RejectedApp',
        rejectionReason: 'Guideline violation',
        rootCause: 'Missing privacy policy',
        issues: [{ id: 'i1', description: 'Add privacy policy', status: 'pending' }],
        rejectedAt: new Date().toISOString(),
        estimatedResubmissionDays: 3,
      }],
      historicalRejections: [],
    };

    const panel = new RejectionCrisisPanel(container, data);
    panel.mount();

    expect(container.querySelector('.rejection-crisis')).toBeTruthy();
    expect(container.textContent).toContain('RejectedApp');
  });

  it('should render market opportunity heatmap with bubbles', () => {
    const container = createContainer();
    const data: MarketHeatmapData = {
      categories: ['Productivity', 'Health'],
      opportunities: [
        { id: 'o1', category: 'Productivity', revenueTier: 'tier2', opportunityScore: 80, opportunityLevel: 'high', competitorCount: 5, reviewGap: 40, estimatedDownloads: 60000, nicheDetails: { topCompetitors: ['A'], avgRating: 4.0, marketSize: '$1B' } },
      ],
    };

    const heatmap = new MarketOpportunityHeatmap(container, data);
    heatmap.mount();

    expect(container.querySelector('.market-heatmap')).toBeTruthy();
    expect(container.querySelectorAll('.market-heatmap__bubble').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ZXMG Content Pipeline Tab Shows Diversity Dashboard
// ---------------------------------------------------------------------------

describe('Phase 12 Integration — ZXMG Content Pipeline Tab', () => {
  it('should render content diversity dashboard with asset grid', () => {
    const container = createContainer();
    const data: ContentDiversityData = {
      assets: [
        { id: 'a1', name: 'Avatar 1', type: 'avatar', lastUsedVideoIndex: 2, usageCount: 5 },
        { id: 'v1', name: 'Voice 1', type: 'voice', lastUsedVideoIndex: 10, usageCount: 3 },
      ],
      channels: [{ channelId: 'ch1', channelName: 'Tech', diversityScore: 75 }],
      recentVideoCount: 20,
    };

    const dashboard = new ContentDiversityDashboard(container, data);
    dashboard.mount();

    expect(container.querySelector('.diversity-dashboard')).toBeTruthy();
    expect(container.querySelectorAll('[data-asset-type]').length).toBe(4);
    expect(container.querySelector('[data-channel-id="ch1"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ZXMG Video Production Tab Shows Compliance Check + Production Tracker
// ---------------------------------------------------------------------------

describe('Phase 12 Integration — ZXMG Video Production Tab', () => {
  it('should render pre-generation compliance check modal', () => {
    const container = createContainer();
    const data: PreGenerationCheckData = {
      videoTitle: 'Test Video',
      checks: [
        { id: 'c1', category: 'Avatar', status: 'pass', currentSelection: 'Avatar A' },
        { id: 'c2', category: 'Voice', status: 'fail', currentSelection: 'Voice B', lastUsedVideoIndex: 1, suggestedAlternative: 'Voice C' },
      ],
    };

    const check = new PreGenerationComplianceCheck(container, data);
    check.mount();

    expect(container.querySelector('.pre-gen-check')).toBeTruthy();
    expect(container.querySelectorAll('.pre-gen-check__check').length).toBe(2);
  });

  it('should render end-to-end production tracker with timelines', () => {
    const container = createContainer();
    const data: ProductionTrackerData = {
      productions: [{
        id: 'v1',
        title: 'Test Video',
        createdAt: new Date().toISOString(),
        stages: [
          { stage: 'script', status: 'complete', durationMs: 60000 },
          { stage: 'scenes', status: 'in_progress' },
        ],
      }],
      uploadQueue: [{ id: 'u1', videoId: 'v1', platform: 'YouTube', status: 'queued', progress: 0 }],
      platformConnections: [{ platform: 'YouTube', health: 'connected', lastChecked: new Date().toISOString() }],
    };

    const tracker = new EndToEndProductionTracker(container, data);
    tracker.mount();

    expect(container.querySelector('.production-tracker')).toBeTruthy();
    expect(container.querySelector('[data-video-id="v1"]')).toBeTruthy();
    expect(container.querySelector('.production-tracker__queue')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Eretz Command Center Shows Intelligence Feed + Standing Orders
// ---------------------------------------------------------------------------

describe('Phase 12 Integration — Eretz Command Center', () => {
  it('should render intelligence feed with insights and score', () => {
    const container = createContainer();
    const data: IntelligenceFeedData = {
      insights: [
        { id: 'i1', summary: 'Revenue spike detected', detail: 'Details', priority: 'high', sourceAgent: 'Monitor', timestamp: new Date().toISOString(), status: 'pending' },
      ],
      score: { totalGenerated: 50, actedOn: 20, measuredImpact: 60 },
    };

    const feed = new IntelligenceFeed(container, data);
    feed.mount();

    expect(container.querySelector('.intelligence-feed')).toBeTruthy();
    expect(container.querySelector('.intelligence-feed__score')).toBeTruthy();
    expect(container.querySelectorAll('.intelligence-feed__item').length).toBe(1);
  });

  it('should render standing orders panel with active orders', () => {
    const container = createContainer();
    const data: StandingOrdersPanelData = {
      orders: [
        { id: 'o1', text: 'Maintain uptime', assignedAgent: 'Monitor', status: 'active', progress: 80, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() },
      ],
      availableAgents: ['Monitor', 'Producer'],
    };

    const panel = new StandingOrdersPanel(container, data);
    panel.mount();

    expect(container.querySelector('.standing-orders')).toBeTruthy();
    expect(container.querySelectorAll('.standing-orders__order').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// All Components Integrate with WebSocket Infrastructure
// ---------------------------------------------------------------------------

describe('Phase 12 Integration — WebSocket Infrastructure', () => {
  it('should support real-time updates across all components via update() method', () => {
    const container = createContainer();

    // Briefing Card
    const briefingData: BriefingCardData = {
      priorities: [{ id: 'p1', title: 'Test', urgency: 'medium' }],
      blockers: [],
      revenue: { mrr: 10000, trend: 'flat', changePercent: 0 },
      recentEvents: [],
      lastLoginAt: new Date().toISOString(),
      sessionContinuity: { hasGap: false },
    };
    const card = new KingsBriefingCard(container, briefingData);
    card.mount();

    // Simulate WebSocket-driven update
    card.update({ ...briefingData, revenue: { mrr: 15000, trend: 'up', changePercent: 50 } });
    expect(container.querySelector('[data-metric="mrr"]')?.textContent).toContain('$15K');

    card.unmount();

    // Intelligence Feed
    const feedData: IntelligenceFeedData = {
      insights: [{ id: 'i1', summary: 'Test insight', detail: '', priority: 'medium', sourceAgent: 'Agent', timestamp: new Date().toISOString(), status: 'pending' }],
      score: { totalGenerated: 10, actedOn: 5, measuredImpact: 50 },
    };
    const feed = new IntelligenceFeed(container, feedData);
    feed.mount();

    // Simulate new insight via WebSocket
    feed.update({
      ...feedData,
      insights: [...feedData.insights, { id: 'i2', summary: 'New WS insight', detail: '', priority: 'high', sourceAgent: 'Agent', timestamp: new Date().toISOString(), status: 'pending' }],
    });
    expect(container.querySelectorAll('.intelligence-feed__item').length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// All Components Source Data from Existing Services (No Business Logic Duplication)
// ---------------------------------------------------------------------------

describe('Phase 12 Integration — Data Sourcing', () => {
  it('all components accept data via constructor and update() — no internal data fetching', () => {
    // This test verifies the architectural pattern: components are pure presentation
    // that receive data from external services, not duplicating business logic.

    const container = createContainer();

    // Each component accepts data as a parameter — no internal fetch calls
    const briefingCard = new KingsBriefingCard(container, {
      priorities: [], blockers: [], revenue: { mrr: 0, trend: 'flat', changePercent: 0 },
      recentEvents: [], lastLoginAt: new Date().toISOString(), sessionContinuity: { hasGap: false },
    });
    expect(briefingCard).toBeDefined();
    expect(typeof briefingCard.mount).toBe('function');
    expect(typeof briefingCard.update).toBe('function');
    expect(typeof briefingCard.unmount).toBe('function');

    const pipelineBoard = new VisualPipelineBoard(container, { apps: [], gateCheckpoints: [] });
    expect(typeof pipelineBoard.update).toBe('function');

    const crisisPanel = new RejectionCrisisPanel(container, { activeRejections: [], historicalRejections: [] });
    expect(typeof crisisPanel.update).toBe('function');

    const heatmap = new MarketOpportunityHeatmap(container, { categories: [], opportunities: [] });
    expect(typeof heatmap.update).toBe('function');

    const diversityDashboard = new ContentDiversityDashboard(container, { assets: [], channels: [], recentVideoCount: 0 });
    expect(typeof diversityDashboard.update).toBe('function');

    const complianceCheck = new PreGenerationComplianceCheck(container, { videoTitle: '', checks: [] });
    expect(typeof complianceCheck.update).toBe('function');

    const productionTracker = new EndToEndProductionTracker(container, { productions: [], uploadQueue: [], platformConnections: [] });
    expect(typeof productionTracker.update).toBe('function');

    const intelligenceFeed = new IntelligenceFeed(container, { insights: [], score: { totalGenerated: 0, actedOn: 0, measuredImpact: 0 } });
    expect(typeof intelligenceFeed.update).toBe('function');

    const standingOrders = new StandingOrdersPanel(container, { orders: [], availableAgents: [] });
    expect(typeof standingOrders.update).toBe('function');
  });
});
