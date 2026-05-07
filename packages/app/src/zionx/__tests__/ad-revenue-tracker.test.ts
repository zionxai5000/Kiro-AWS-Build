/**
 * Unit tests for ZionX Ads — Ad Revenue Tracker
 *
 * Validates: Requirements 11d.5, 11d.6, 19.1
 *
 * Tests combined ad + subscription ARPU tracking, auto-reinvest threshold
 * logic, revenue snapshot generation, reinvestment cooldown, report
 * generation, and Zikaron persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AdRevenueTracker,
  type RevenueEntry,
  type ReinvestmentConfig,
} from '../ads/ad-revenue-tracker.js';
import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockOtzarService(): OtzarService {
  return {
    routeTask: vi.fn(async () => ({
      provider: 'anthropic' as const,
      model: 'claude-haiku',
      estimatedCost: 0.001,
      rationale: 'mock',
    })),
    checkBudget: vi.fn(async () => ({
      allowed: true,
      remainingDaily: 10000,
      remainingMonthly: 100000,
    })),
    recordUsage: vi.fn(async () => {}),
    getCostReport: vi.fn(async () => ({
      totalCost: 0,
      byAgent: {},
      byPillar: {},
      byModel: {},
      period: { start: '', end: '' },
    })),
    getDailyOptimizationReport: vi.fn(async () => ({
      date: '',
      wastePatterns: [],
      routingInefficiencies: [],
      savingsOpportunities: [],
      totalWaste: 0,
    })),
    checkCache: vi.fn(async () => null),
    storeCache: vi.fn(async () => {}),
  } as unknown as OtzarService;
}

function createMockZikaronService(): ZikaronService {
  return {
    storeEpisodic: vi.fn(async () => 'id'),
    storeSemantic: vi.fn(async () => 'id'),
    storeProcedural: vi.fn(async () => 'id'),
    storeWorking: vi.fn(async () => 'id'),
    query: vi.fn(async () => []),
    queryByAgent: vi.fn(async () => []),
    loadAgentContext: vi.fn(async () => ({
      agentId: '',
      episodic: [],
      semantic: [],
      procedural: [],
      working: null,
    })),
    flagConflict: vi.fn(async () => {}),
  } as unknown as ZikaronService;
}

function makeEntry(overrides: Partial<RevenueEntry> = {}): RevenueEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    appId: 'app-1',
    source: 'ad_banner',
    amount: 10,
    currency: 'USD',
    timestamp: '2024-01-15T12:00:00Z',
    ...overrides,
  };
}

function makeReinvestConfig(overrides: Partial<ReinvestmentConfig> = {}): ReinvestmentConfig {
  return {
    appId: 'app-1',
    enabled: true,
    thresholdAmount: 100,
    thresholdCurrency: 'USD',
    reinvestmentPercent: 20,
    maxReinvestmentAmount: 500,
    targetChannel: 'google_ads',
    cooldownDays: 7,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdRevenueTracker', () => {
  let tracker: AdRevenueTracker;
  let mockOtzar: OtzarService;
  let mockZikaron: ZikaronService;

  beforeEach(() => {
    mockOtzar = createMockOtzarService();
    mockZikaron = createMockZikaronService();
    tracker = new AdRevenueTracker(mockOtzar, mockZikaron);
  });

  // -------------------------------------------------------------------------
  // Combined ARPU tracking
  // -------------------------------------------------------------------------

  describe('combined ARPU tracking', () => {
    it('should calculate combined ARPU from ad + subscription revenue', () => {
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 50 }));
      tracker.recordRevenue(makeEntry({ source: 'ad_interstitial', amount: 30 }));
      tracker.recordRevenue(makeEntry({ source: 'subscription', amount: 120 }));

      const snapshot = tracker.getSnapshot('app-1', '2024-01-01', '2024-01-31', 100);

      expect(snapshot.adRevenue).toBe(80);
      expect(snapshot.subscriptionRevenue).toBe(120);
      expect(snapshot.totalRevenue).toBe(200);
      expect(snapshot.combinedArpu).toBe(2); // 200 / 100
    });

    it('should calculate separate ad ARPU and subscription ARPU', () => {
      tracker.recordRevenue(makeEntry({ source: 'ad_rewarded', amount: 60 }));
      tracker.recordRevenue(makeEntry({ source: 'subscription', amount: 140 }));

      const snapshot = tracker.getSnapshot('app-1', '2024-01-01', '2024-01-31', 200);

      expect(snapshot.adArpu).toBe(0.3);           // 60 / 200
      expect(snapshot.subscriptionArpu).toBe(0.7);  // 140 / 200
      expect(snapshot.combinedArpu).toBe(1);         // 200 / 200
    });

    it('should include IAP revenue in total but not in ad or subscription ARPU', () => {
      tracker.recordRevenue(makeEntry({ source: 'ad_native', amount: 20 }));
      tracker.recordRevenue(makeEntry({ source: 'subscription', amount: 30 }));
      tracker.recordRevenue(makeEntry({ source: 'iap', amount: 50 }));

      const snapshot = tracker.getSnapshot('app-1', '2024-01-01', '2024-01-31', 100);

      expect(snapshot.adRevenue).toBe(20);
      expect(snapshot.subscriptionRevenue).toBe(30);
      expect(snapshot.iapRevenue).toBe(50);
      expect(snapshot.totalRevenue).toBe(100);
      expect(snapshot.combinedArpu).toBe(1);         // 100 / 100
      expect(snapshot.adArpu).toBe(0.2);             // 20 / 100
      expect(snapshot.subscriptionArpu).toBe(0.3);   // 30 / 100
    });

    it('should handle zero active users without dividing by zero', () => {
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 50 }));

      const snapshot = tracker.getSnapshot('app-1', '2024-01-01', '2024-01-31', 0);

      // Implementation uses Math.max(activeUsers, 1) to avoid division by zero
      expect(snapshot.combinedArpu).toBe(50);
      expect(snapshot.activeUsers).toBe(0);
    });

    it('should filter entries by date range', () => {
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 10, timestamp: '2024-01-05T00:00:00Z' }));
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 20, timestamp: '2024-01-15T00:00:00Z' }));
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 30, timestamp: '2024-02-05T00:00:00Z' }));

      const snapshot = tracker.getSnapshot('app-1', '2024-01-01', '2024-01-31', 10);

      expect(snapshot.adRevenue).toBe(30); // only Jan entries
      expect(snapshot.combinedArpu).toBe(3); // 30 / 10
    });

    it('should return zero revenue when no entries exist for the app', () => {
      const snapshot = tracker.getSnapshot('app-1', '2024-01-01', '2024-01-31', 50);

      expect(snapshot.adRevenue).toBe(0);
      expect(snapshot.subscriptionRevenue).toBe(0);
      expect(snapshot.iapRevenue).toBe(0);
      expect(snapshot.totalRevenue).toBe(0);
      expect(snapshot.combinedArpu).toBe(0);
    });

    it('should provide ad revenue breakdown by source type', () => {
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 10 }));
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 15 }));
      tracker.recordRevenue(makeEntry({ source: 'ad_interstitial', amount: 25 }));
      tracker.recordRevenue(makeEntry({ source: 'ad_rewarded', amount: 40 }));

      const snapshot = tracker.getSnapshot('app-1', '2024-01-01', '2024-01-31', 100);

      expect(snapshot.adRevenueBreakdown['ad_banner']).toBe(25);
      expect(snapshot.adRevenueBreakdown['ad_interstitial']).toBe(25);
      expect(snapshot.adRevenueBreakdown['ad_rewarded']).toBe(40);
      expect(snapshot.adRevenueBreakdown['ad_native']).toBeUndefined(); // no native entries
    });

    it('should provide network breakdown', () => {
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 10, network: 'admob' }));
      tracker.recordRevenue(makeEntry({ source: 'ad_interstitial', amount: 20, network: 'admob' }));
      tracker.recordRevenue(makeEntry({ source: 'ad_rewarded', amount: 30, network: 'applovin' }));

      const snapshot = tracker.getSnapshot('app-1', '2024-01-01', '2024-01-31', 100);

      expect(snapshot.networkBreakdown['admob']).toBe(30);
      expect(snapshot.networkBreakdown['applovin']).toBe(30);
    });
  });

  // -------------------------------------------------------------------------
  // Auto-reinvest threshold
  // -------------------------------------------------------------------------

  describe('auto-reinvest threshold', () => {
    it('should trigger reinvestment when accumulated ad revenue exceeds threshold', async () => {
      tracker.configureReinvestment(makeReinvestConfig({ thresholdAmount: 100, reinvestmentPercent: 20 }));

      // Record ad revenue totaling 150 (above 100 threshold)
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 80, timestamp: new Date().toISOString() }));
      tracker.recordRevenue(makeEntry({ source: 'ad_interstitial', amount: 70, timestamp: new Date().toISOString() }));

      const action = await tracker.checkAndReinvest('app-1');

      expect(action).not.toBeNull();
      expect(action!.adRevenueAccumulated).toBe(150);
      expect(action!.reinvestmentAmount).toBe(30); // 150 * 20%
      expect(action!.status).toBe('executed');
      expect(action!.targetChannel).toBe('google_ads');
    });

    it('should not trigger reinvestment when ad revenue is below threshold', async () => {
      tracker.configureReinvestment(makeReinvestConfig({ thresholdAmount: 100 }));

      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 50, timestamp: new Date().toISOString() }));

      const action = await tracker.checkAndReinvest('app-1');

      expect(action).toBeNull();
    });

    it('should not trigger reinvestment when config is disabled', async () => {
      tracker.configureReinvestment(makeReinvestConfig({ enabled: false }));

      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 200, timestamp: new Date().toISOString() }));

      const action = await tracker.checkAndReinvest('app-1');

      expect(action).toBeNull();
    });

    it('should return null when no reinvestment config exists', async () => {
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 200, timestamp: new Date().toISOString() }));

      const action = await tracker.checkAndReinvest('app-1');

      expect(action).toBeNull();
    });

    it('should cap reinvestment at maxReinvestmentAmount', async () => {
      tracker.configureReinvestment(makeReinvestConfig({
        thresholdAmount: 100,
        reinvestmentPercent: 50,
        maxReinvestmentAmount: 40,
      }));

      // 500 * 50% = 250, but max is 40
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 500, timestamp: new Date().toISOString() }));

      const action = await tracker.checkAndReinvest('app-1');

      expect(action).not.toBeNull();
      expect(action!.reinvestmentAmount).toBe(40);
    });

    it('should only count ad revenue sources, not subscription or IAP', async () => {
      tracker.configureReinvestment(makeReinvestConfig({ thresholdAmount: 100 }));

      // 50 from ads, 200 from subscription — should NOT trigger
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 50, timestamp: new Date().toISOString() }));
      tracker.recordRevenue(makeEntry({ source: 'subscription', amount: 200, timestamp: new Date().toISOString() }));

      const action = await tracker.checkAndReinvest('app-1');

      expect(action).toBeNull();
    });

    it('should record reinvestment usage in Otzar', async () => {
      tracker.configureReinvestment(makeReinvestConfig({ thresholdAmount: 50, reinvestmentPercent: 25 }));

      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 100, timestamp: new Date().toISOString() }));

      await tracker.checkAndReinvest('app-1');

      expect(mockOtzar.recordUsage).toHaveBeenCalledTimes(1);
      const call = (mockOtzar.recordUsage as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.costUsd).toBe(25); // 100 * 25%
      expect(call.provider).toBe('ad_reinvestment');
      expect(call.taskType).toBe('ad_reinvestment');
      expect(call.pillar).toBe('eretz');
    });

    it('should store reinvestment action in Zikaron', async () => {
      tracker.configureReinvestment(makeReinvestConfig({ thresholdAmount: 50 }));

      tracker.recordRevenue(makeEntry({ source: 'ad_rewarded', amount: 100, timestamp: new Date().toISOString() }));

      await tracker.checkAndReinvest('app-1');

      expect(mockZikaron.storeEpisodic).toHaveBeenCalledTimes(1);
      const call = (mockZikaron.storeEpisodic as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.layer).toBe('episodic');
      expect(call.eventType).toBe('ad_reinvestment');
      expect(call.outcome).toBe('success');
      expect(call.tags).toContain('reinvestment');
      expect(call.tags).toContain('app-1');
      expect(call.content).toContain('app-1');
      expect(call.content).toContain('google_ads');
    });
  });

  // -------------------------------------------------------------------------
  // Reinvestment cooldown
  // -------------------------------------------------------------------------

  describe('reinvestment cooldown', () => {
    it('should respect cooldown period between reinvestments', async () => {
      tracker.configureReinvestment(makeReinvestConfig({ thresholdAmount: 50, cooldownDays: 7 }));

      // First reinvestment
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 100, timestamp: new Date().toISOString() }));
      const first = await tracker.checkAndReinvest('app-1');
      expect(first).not.toBeNull();

      // Add more revenue immediately — should be blocked by cooldown
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 100, timestamp: new Date().toISOString() }));
      const second = await tracker.checkAndReinvest('app-1');
      expect(second).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Report generation
  // -------------------------------------------------------------------------

  describe('report generation', () => {
    it('should generate a combined revenue report with snapshot and trends', async () => {
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 50 }));
      tracker.recordRevenue(makeEntry({ source: 'subscription', amount: 100 }));

      const report = await tracker.generateReport('app-1', '2024-01-01', '2024-01-31', 200);

      expect(report.appId).toBe('app-1');
      expect(report.period.start).toBe('2024-01-01');
      expect(report.period.end).toBe('2024-01-31');
      expect(report.snapshot.adRevenue).toBe(50);
      expect(report.snapshot.subscriptionRevenue).toBe(100);
      expect(report.snapshot.totalRevenue).toBe(150);
      expect(report.snapshot.combinedArpu).toBe(0.75); // 150 / 200
      expect(report.trends).toBeDefined();
      expect(report.trends.length).toBeGreaterThan(0);
      expect(report.generatedAt).toBeDefined();
    });

    it('should include reinvestment actions within the report period', async () => {
      tracker.configureReinvestment(makeReinvestConfig({ thresholdAmount: 50 }));
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 100, timestamp: new Date().toISOString() }));

      await tracker.checkAndReinvest('app-1');

      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const end = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const report = await tracker.generateReport('app-1', start, end, 100);

      expect(report.reinvestmentActions.length).toBeGreaterThanOrEqual(1);
      expect(report.reinvestmentActions[0]!.status).toBe('executed');
    });

    it('should store report in Zikaron via storeEpisodic', async () => {
      tracker.recordRevenue(makeEntry({ source: 'ad_banner', amount: 50 }));

      await tracker.generateReport('app-1', '2024-01-01', '2024-01-31', 100);

      expect(mockZikaron.storeEpisodic).toHaveBeenCalledTimes(1);
      const call = (mockZikaron.storeEpisodic as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.layer).toBe('episodic');
      expect(call.eventType).toBe('combined_revenue_report');
      expect(call.tags).toContain('revenue-report');
      expect(call.tags).toContain('app-1');
      expect(call.content).toContain('app-1');
      expect(call.outcome).toBe('success');
    });

    it('should include revenue trends with metric, direction, and changePercent', async () => {
      const report = await tracker.generateReport('app-1', '2024-01-01', '2024-01-31', 100);

      for (const trend of report.trends) {
        expect(trend.metric).toBeDefined();
        expect(['up', 'down', 'stable']).toContain(trend.direction);
        expect(typeof trend.changePercent).toBe('number');
        expect(trend.period).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Multiple apps isolation
  // -------------------------------------------------------------------------

  describe('multiple apps isolation', () => {
    it('should track revenue independently per app', () => {
      tracker.recordRevenue(makeEntry({ appId: 'app-1', source: 'ad_banner', amount: 100 }));
      tracker.recordRevenue(makeEntry({ appId: 'app-2', source: 'ad_banner', amount: 50 }));

      const snap1 = tracker.getSnapshot('app-1', '2024-01-01', '2024-01-31', 100);
      const snap2 = tracker.getSnapshot('app-2', '2024-01-01', '2024-01-31', 100);

      expect(snap1.adRevenue).toBe(100);
      expect(snap2.adRevenue).toBe(50);
    });

    it('should trigger reinvestment independently per app', async () => {
      tracker.configureReinvestment(makeReinvestConfig({ appId: 'app-1', thresholdAmount: 50 }));
      tracker.configureReinvestment(makeReinvestConfig({ appId: 'app-2', thresholdAmount: 200 }));

      tracker.recordRevenue(makeEntry({ appId: 'app-1', source: 'ad_banner', amount: 100, timestamp: new Date().toISOString() }));
      tracker.recordRevenue(makeEntry({ appId: 'app-2', source: 'ad_banner', amount: 100, timestamp: new Date().toISOString() }));

      const action1 = await tracker.checkAndReinvest('app-1');
      const action2 = await tracker.checkAndReinvest('app-2');

      expect(action1).not.toBeNull(); // 100 > 50 threshold
      expect(action2).toBeNull();     // 100 < 200 threshold
    });
  });
});
