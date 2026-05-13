/**
 * Unit tests for Eretz Business Command Center — Layout and Portfolio Overview
 *
 * Validates: Requirements 46a.1, 46a.2, 46a.3, 46b.4, 46b.5, 46c.6, 46c.7, 46c.8, 21.1
 *
 * Tests full-page layout, portfolio header metrics, per-subsidiary breakdown,
 * subsidiary cards, and WebSocket real-time updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EretzCommandCenter, type EretzCommandCenterData } from './EretzCommandCenter.js';
import { PortfolioOverviewHeader, type PortfolioOverviewData } from '../components/command-center/PortfolioOverviewHeader.js';
import { SubsidiaryCardGrid, type SubsidiaryCardsData } from '../components/command-center/SubsidiaryCardGrid.js';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

function createPortfolioData(overrides?: Partial<PortfolioOverviewData>): PortfolioOverviewData {
  return {
    totalMRR: 18000,
    totalRevenue: 22500,
    growthRate: 12.5,
    growthHistory: [14000, 15000, 16000, 17000, 18000],
    health: 'strong',
    subsidiaryContributions: [
      { name: 'zionx', label: 'ZionX', mrr: 10000, percentage: 55.6, trend: 'up', revenue: 12000 },
      { name: 'zxmg', label: 'ZXMG', mrr: 5000, percentage: 27.8, trend: 'flat', revenue: 6000 },
      { name: 'zion-alpha', label: 'Zion Alpha', mrr: 3000, percentage: 16.6, trend: 'up', revenue: 4500 },
    ],
    ...overrides,
  };
}

function createSubsidiaryData(overrides?: Partial<SubsidiaryCardsData>): SubsidiaryCardsData {
  return {
    zionx: {
      appsCount: 8,
      totalAppRevenue: 12000,
      topApps: [
        { name: 'ZenFocus', revenue: 4500 },
        { name: 'PetPal', revenue: 3200 },
        { name: 'MealPrep AI', revenue: 2100 },
      ],
      pipelineCount: 5,
      growthTrend: 'up',
    },
    zxmg: {
      channelsCount: 4,
      totalViews: 850000,
      totalRevenue: 6000,
      topChannels: [
        { name: 'Tech Reviews', revenue: 2500 },
        { name: 'AI Tutorials', revenue: 2000 },
        { name: 'Lifestyle', revenue: 1500 },
      ],
      contentPipelineCount: 12,
    },
    zionAlpha: {
      activePositions: 15,
      totalPnL: 4500,
      winRate: 68,
      currentStrategy: 'Momentum',
      riskExposure: 'medium',
    },
    ...overrides,
  };
}

function createCommandCenterData(): EretzCommandCenterData {
  return {
    portfolio: createPortfolioData(),
    subsidiaries: createSubsidiaryData(),
  };
}

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
// Full-Page Layout Tests (Req 46a.1, 46a.2)
// ---------------------------------------------------------------------------

describe('EretzCommandCenter — Full-Page Layout', () => {
  it('should render as a dedicated full-page layout (not a sub-view)', () => {
    const container = createContainer();
    const center = new EretzCommandCenter(container, createCommandCenterData());
    center.mount();

    const mainEl = container.querySelector('.command-center[role="main"]');
    expect(mainEl).toBeTruthy();
    expect(mainEl?.getAttribute('aria-label')).toBe('Eretz Business Command Center');
  });

  it('should render responsive grid layout with all sections', () => {
    const container = createContainer();
    const center = new EretzCommandCenter(container, createCommandCenterData());
    center.mount();

    expect(container.querySelector('.command-center__grid')).toBeTruthy();
    expect(container.querySelector('.command-center__header-section')).toBeTruthy();
    expect(container.querySelector('.command-center__subsidiary-section')).toBeTruthy();
    expect(container.querySelector('.command-center__synergy-section')).toBeTruthy();
    expect(container.querySelector('.command-center__pattern-section')).toBeTruthy();
    expect(container.querySelector('.command-center__training-section')).toBeTruthy();
    expect(container.querySelector('.command-center__recommendations-section')).toBeTruthy();
    expect(container.querySelector('.command-center__alerts-section')).toBeTruthy();
    expect(container.querySelector('.command-center__allocation-section')).toBeTruthy();
    expect(container.querySelector('.command-center__strategy-section')).toBeTruthy();
  });

  it('should clean up on unmount', () => {
    const container = createContainer();
    const center = new EretzCommandCenter(container, createCommandCenterData());
    center.mount();

    center.unmount();

    expect(container.innerHTML).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Portfolio Header Tests (Req 46b.4, 46b.5)
// ---------------------------------------------------------------------------

describe('PortfolioOverviewHeader — Metrics Display', () => {
  it('should display total MRR correctly', () => {
    const container = createContainer();
    const header = new PortfolioOverviewHeader(container, createPortfolioData({ totalMRR: 18000 }));
    header.mount();

    const mrrEl = container.querySelector('[data-metric="total-mrr"]');
    expect(mrrEl?.textContent?.trim()).toBe('$18K');
  });

  it('should display total revenue correctly', () => {
    const container = createContainer();
    const header = new PortfolioOverviewHeader(container, createPortfolioData({ totalRevenue: 22500 }));
    header.mount();

    const revenueEl = container.querySelector('[data-metric="total-revenue"]');
    expect(revenueEl?.textContent?.trim()).toBe('$23K');
  });

  it('should display growth rate with sign', () => {
    const container = createContainer();
    const header = new PortfolioOverviewHeader(container, createPortfolioData({ growthRate: 12.5 }));
    header.mount();

    const growthEl = container.querySelector('[data-metric="growth-rate"]');
    expect(growthEl?.textContent?.trim()).toBe('+12.5%');
  });

  it('should display negative growth rate', () => {
    const container = createContainer();
    const header = new PortfolioOverviewHeader(container, createPortfolioData({ growthRate: -5.2 }));
    header.mount();

    const growthEl = container.querySelector('[data-metric="growth-rate"]');
    expect(growthEl?.textContent?.trim()).toBe('-5.2%');
  });

  it('should display growth trajectory sparkline', () => {
    const container = createContainer();
    const header = new PortfolioOverviewHeader(container, createPortfolioData({
      growthHistory: [10, 12, 14, 16, 18],
    }));
    header.mount();

    const sparkline = container.querySelector('[data-metric="growth-sparkline"]');
    expect(sparkline).toBeTruthy();
    expect(sparkline?.querySelector('svg')).toBeTruthy();
  });

  it('should display portfolio health indicator', () => {
    const container = createContainer();
    const header = new PortfolioOverviewHeader(container, createPortfolioData({ health: 'strong' }));
    header.mount();

    const healthEl = container.querySelector('[data-metric="health"]');
    expect(healthEl?.textContent).toContain('Strong');
    expect(healthEl?.classList.contains('portfolio-header__health--strong')).toBe(true);
  });

  it('should display at_risk health indicator', () => {
    const container = createContainer();
    const header = new PortfolioOverviewHeader(container, createPortfolioData({ health: 'at_risk' }));
    header.mount();

    const healthEl = container.querySelector('[data-metric="health"]');
    expect(healthEl?.textContent).toContain('At Risk');
    expect(healthEl?.classList.contains('portfolio-header__health--at-risk')).toBe(true);
  });
});

describe('PortfolioOverviewHeader — Subsidiary Breakdown', () => {
  it('should display per-subsidiary contribution percentages', () => {
    const container = createContainer();
    const header = new PortfolioOverviewHeader(container, createPortfolioData());
    header.mount();

    const contributions = container.querySelectorAll('.portfolio-header__contribution');
    expect(contributions.length).toBe(3);

    const zionxContrib = container.querySelector('[data-subsidiary="zionx"]');
    expect(zionxContrib?.querySelector('.portfolio-header__contribution-pct')?.textContent?.trim()).toBe('55.6%');
  });

  it('should display MRR per subsidiary', () => {
    const container = createContainer();
    const header = new PortfolioOverviewHeader(container, createPortfolioData());
    header.mount();

    const zionxContrib = container.querySelector('[data-subsidiary="zionx"]');
    expect(zionxContrib?.querySelector('.portfolio-header__contribution-mrr')?.textContent?.trim()).toBe('$10K');
  });

  it('should display trend indicators per subsidiary', () => {
    const container = createContainer();
    const header = new PortfolioOverviewHeader(container, createPortfolioData());
    header.mount();

    const zionxTrend = container.querySelector('[data-subsidiary="zionx"] .portfolio-header__contribution-trend');
    expect(zionxTrend?.textContent?.trim()).toBe('↑');
    expect(zionxTrend?.classList.contains('portfolio-header__trend--up')).toBe(true);
  });

  it('should update when new data is provided', () => {
    const container = createContainer();
    const header = new PortfolioOverviewHeader(container, createPortfolioData({ totalMRR: 18000 }));
    header.mount();

    header.update(createPortfolioData({ totalMRR: 25000 }));

    const mrrEl = container.querySelector('[data-metric="total-mrr"]');
    expect(mrrEl?.textContent?.trim()).toBe('$25K');
  });
});

// ---------------------------------------------------------------------------
// Subsidiary Card Tests (Req 46c.6, 46c.7, 46c.8)
// ---------------------------------------------------------------------------

describe('SubsidiaryCardGrid — ZionX Card', () => {
  it('should display apps count', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const appsCount = container.querySelector('[data-metric="apps-count"]');
    expect(appsCount?.textContent?.trim()).toBe('8');
  });

  it('should display total app revenue', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const revenue = container.querySelector('[data-metric="app-revenue"]');
    expect(revenue?.textContent?.trim()).toBe('$12K');
  });

  it('should display top 3 apps', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const zionxCard = container.querySelector('.subsidiary-card--zionx');
    const topItems = zionxCard?.querySelectorAll('.subsidiary-card__top-item');
    expect(topItems?.length).toBe(3);
    expect(topItems?.[0].textContent).toContain('ZenFocus');
  });

  it('should display pipeline count', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const pipeline = container.querySelector('[data-metric="pipeline-count"]');
    expect(pipeline?.textContent?.trim()).toBe('5');
  });

  it('should display growth trend', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const zionxCard = container.querySelector('.subsidiary-card--zionx');
    const trend = zionxCard?.querySelector('.subsidiary-card__trend');
    expect(trend?.textContent?.trim()).toBe('↑');
  });
});

describe('SubsidiaryCardGrid — ZXMG Card', () => {
  it('should display channels count', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const channels = container.querySelector('[data-metric="channels-count"]');
    expect(channels?.textContent?.trim()).toBe('4');
  });

  it('should display total views', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const views = container.querySelector('[data-metric="total-views"]');
    expect(views?.textContent?.trim()).toBe('850K');
  });

  it('should display revenue', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const revenue = container.querySelector('[data-metric="zxmg-revenue"]');
    expect(revenue?.textContent?.trim()).toBe('$6K');
  });

  it('should display top 3 channels', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const zxmgCard = container.querySelector('.subsidiary-card--zxmg');
    const topItems = zxmgCard?.querySelectorAll('.subsidiary-card__top-item');
    expect(topItems?.length).toBe(3);
    expect(topItems?.[0].textContent).toContain('Tech Reviews');
  });

  it('should display content pipeline count', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const pipeline = container.querySelector('[data-metric="content-pipeline-count"]');
    expect(pipeline?.textContent?.trim()).toBe('12');
  });
});

describe('SubsidiaryCardGrid — Zion Alpha Card', () => {
  it('should display active positions', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const positions = container.querySelector('[data-metric="active-positions"]');
    expect(positions?.textContent?.trim()).toBe('15');
  });

  it('should display total P&L with sign', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const pnl = container.querySelector('[data-metric="total-pnl"]');
    expect(pnl?.textContent?.trim()).toContain('+');
    expect(pnl?.textContent?.trim()).toContain('$5K');
  });

  it('should display win rate percentage', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const winRate = container.querySelector('[data-metric="win-rate"]');
    expect(winRate?.textContent?.trim()).toBe('68%');
  });

  it('should display current strategy', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const strategy = container.querySelector('[data-metric="strategy"]');
    expect(strategy?.textContent?.trim()).toBe('Momentum');
  });

  it('should display risk exposure level', () => {
    const container = createContainer();
    const grid = new SubsidiaryCardGrid(container, createSubsidiaryData());
    grid.mount();

    const risk = container.querySelector('[data-metric="risk-exposure"]');
    expect(risk?.textContent?.trim()).toBe('medium');
    expect(risk?.classList.contains('subsidiary-card__risk--medium')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WebSocket Real-Time Updates (Req 46a.3)
// ---------------------------------------------------------------------------

describe('EretzCommandCenter — WebSocket Updates', () => {
  it('should connect to WebSocket on mount', () => {
    const container = createContainer();
    const center = new EretzCommandCenter(container, createCommandCenterData());
    center.mount();

    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toContain('/ws');
  });

  it('should update portfolio metrics on WebSocket message', () => {
    const container = createContainer();
    const center = new EretzCommandCenter(container, createCommandCenterData());
    center.mount();

    const ws = MockWebSocket.instances[0];
    const updatedPortfolio = createPortfolioData({ totalMRR: 25000 });

    ws.simulateMessage({
      type: 'portfolio.metrics_updated',
      data: updatedPortfolio,
    });

    const mrrEl = container.querySelector('[data-metric="total-mrr"]');
    expect(mrrEl?.textContent?.trim()).toBe('$25K');
  });

  it('should close WebSocket on unmount', () => {
    const container = createContainer();
    const center = new EretzCommandCenter(container, createCommandCenterData());
    center.mount();

    const ws = MockWebSocket.instances[0];
    center.unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it('should ignore malformed WebSocket messages', () => {
    const container = createContainer();
    const center = new EretzCommandCenter(container, createCommandCenterData());
    center.mount();

    const ws = MockWebSocket.instances[0];
    const mrrBefore = container.querySelector('[data-metric="total-mrr"]')?.textContent;

    if (ws.onmessage) {
      ws.onmessage({ data: 'invalid-json{{{' } as MessageEvent);
    }

    const mrrAfter = container.querySelector('[data-metric="total-mrr"]')?.textContent;
    expect(mrrAfter).toBe(mrrBefore);
  });
});
