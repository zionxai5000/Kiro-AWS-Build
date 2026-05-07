/**
 * Unit tests for Eretz Portfolio Intelligence Dashboard
 *
 * Validates: Requirements 29d.13, 29d.14, 29d.15, 29d.16, 19.1
 *
 * Tests portfolio metrics aggregation, subsidiary metrics with benchmarks,
 * weekly report generation, decline alert detection, and portfolio strategy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EretzPortfolioDashboardImpl,
} from '../portfolio-dashboard.js';
import type {
  PortfolioDashboardConfig,
  SubsidiaryData,
  IndustryBenchmarks,
} from '../portfolio-dashboard.js';
import type { EventBusService } from '@seraphim/core';
import type { RecommendationQueue } from '@seraphim/services/sme/heartbeat-scheduler.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-1'),
    publishBatch: vi.fn().mockResolvedValue(['event-id-1']),
    subscribe: vi.fn().mockResolvedValue('sub-id-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRecommendationQueue(): RecommendationQueue {
  return {
    submit: vi.fn().mockResolvedValue('rec-id-001'),
  };
}

function createConfig(overrides?: Partial<PortfolioDashboardConfig>): PortfolioDashboardConfig {
  return {
    eventBus: createMockEventBus(),
    recommendationQueue: createMockRecommendationQueue(),
    ...overrides,
  };
}

function createSubsidiaryData(overrides?: Partial<SubsidiaryData>): SubsidiaryData {
  return {
    subsidiary: 'zionx',
    mrr: 10000,
    previousMrr: 9000,
    cac: 40,
    ltv: 400,
    arpu: 12,
    churn: 2.5,
    marketingSpend: 3000,
    roas: 3.5,
    revenue: 10500,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Portfolio Metrics Aggregation Tests
// ---------------------------------------------------------------------------

describe('EretzPortfolioDashboard — Portfolio Metrics', () => {
  let dashboard: EretzPortfolioDashboardImpl;
  let config: PortfolioDashboardConfig;

  beforeEach(() => {
    config = createConfig();
    dashboard = new EretzPortfolioDashboardImpl(config);
  });

  it('should aggregate total MRR across all subsidiaries', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({ subsidiary: 'zionx', mrr: 10000 }));
    dashboard.updateSubsidiaryData(createSubsidiaryData({ subsidiary: 'zxmg', mrr: 5000 }));
    dashboard.updateSubsidiaryData(createSubsidiaryData({ subsidiary: 'zion_alpha', mrr: 3000 }));

    const metrics = await dashboard.getPortfolioMetrics();

    expect(metrics.totalMRR).toBe(18000);
    expect(metrics.mrrBySubsidiary.zionx).toBe(10000);
    expect(metrics.mrrBySubsidiary.zxmg).toBe(5000);
    expect(metrics.mrrBySubsidiary.zion_alpha).toBe(3000);
  });

  it('should calculate per-subsidiary growth rates', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 11000,
      previousMrr: 10000,
    }));
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zxmg',
      mrr: 6000,
      previousMrr: 5000,
    }));

    const metrics = await dashboard.getPortfolioMetrics();

    expect(metrics.growthBySubsidiary.zionx).toBe(10); // 10% growth
    expect(metrics.growthBySubsidiary.zxmg).toBe(20); // 20% growth
  });

  it('should calculate total growth rate', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 11000,
      previousMrr: 10000,
    }));
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zxmg',
      mrr: 5500,
      previousMrr: 5000,
    }));

    const metrics = await dashboard.getPortfolioMetrics();

    // Total: 16500 from 15000 = 10% growth
    expect(metrics.totalGrowthRate).toBe(10);
  });

  it('should include unit economics (CAC, LTV, churn)', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 10000,
      cac: 40,
      ltv: 400,
      churn: 2,
    }));
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zxmg',
      mrr: 10000,
      cac: 60,
      ltv: 600,
      churn: 4,
    }));

    const metrics = await dashboard.getPortfolioMetrics();

    // Weighted average by MRR (equal MRR so simple average)
    expect(metrics.portfolioCAC).toBe(50);
    expect(metrics.portfolioLTV).toBe(500);
    expect(metrics.portfolioChurn).toBe(3);
  });

  it('should include marketing spend and ROAS', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      marketingSpend: 3000,
      revenue: 9000,
    }));
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zxmg',
      marketingSpend: 2000,
      revenue: 6000,
    }));

    const metrics = await dashboard.getPortfolioMetrics();

    expect(metrics.totalMarketingSpend).toBe(5000);
    expect(metrics.portfolioROAS).toBe(3); // 15000 / 5000
  });

  it('should include trading P&L, content revenue, and app revenue', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      revenue: 8000,
    }));
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zxmg',
      revenue: 5000,
    }));
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zion_alpha',
      revenue: 3000,
    }));

    const metrics = await dashboard.getPortfolioMetrics();

    expect(metrics.appRevenue).toBe(8000);
    expect(metrics.contentRevenue).toBe(5000);
    expect(metrics.tradingPnL).toBe(3000);
  });

  it('should publish portfolio.metrics_updated event', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({ subsidiary: 'zionx' }));

    await dashboard.getPortfolioMetrics();

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'portfolio.metrics_updated',
        detail: expect.objectContaining({
          totalMRR: expect.any(Number),
          totalGrowthRate: expect.any(Number),
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: expect.any(String),
          timestamp: expect.any(Date),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Subsidiary Metrics Tests
// ---------------------------------------------------------------------------

describe('EretzPortfolioDashboard — Subsidiary Metrics', () => {
  let dashboard: EretzPortfolioDashboardImpl;
  let config: PortfolioDashboardConfig;

  beforeEach(() => {
    config = createConfig();
    dashboard = new EretzPortfolioDashboardImpl(config);
  });

  it('should return detailed metrics for a subsidiary', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 10000,
      previousMrr: 9000,
      cac: 40,
      ltv: 400,
      arpu: 12,
      churn: 2.5,
      marketingSpend: 3000,
      roas: 3.5,
      revenue: 10500,
    }));

    const metrics = await dashboard.getSubsidiaryMetrics('zionx');

    expect(metrics.subsidiary).toBe('zionx');
    expect(metrics.mrr).toBe(10000);
    expect(metrics.cac).toBe(40);
    expect(metrics.ltv).toBe(400);
    expect(metrics.arpu).toBe(12);
    expect(metrics.churn).toBe(2.5);
    expect(metrics.marketingSpend).toBe(3000);
    expect(metrics.roas).toBe(3.5);
    expect(metrics.revenue).toBe(10500);
  });

  it('should include benchmark comparisons', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      cac: 40,
      ltv: 400,
      arpu: 12,
      churn: 2.5,
      roas: 3.5,
    }));
    dashboard.setBenchmarks({
      cac: 50,
      ltv: 500,
      arpu: 15,
      churn: 3,
      roas: 3.0,
      growthRate: 10,
    });

    const metrics = await dashboard.getSubsidiaryMetrics('zionx');

    expect(metrics.benchmarkComparison.cac).toEqual({
      current: 40,
      benchmark: 50,
      gap: -10, // below benchmark (good for CAC)
    });
    expect(metrics.benchmarkComparison.ltv).toEqual({
      current: 400,
      benchmark: 500,
      gap: -100,
    });
    expect(metrics.benchmarkComparison.roas).toEqual({
      current: 3.5,
      benchmark: 3.0,
      gap: 0.5, // above benchmark (good)
    });
  });

  it('should include strategy recommendation (scale/maintain/optimize/deprecate)', async () => {
    // High growth + good economics = scale
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 12000,
      previousMrr: 10000, // 20% growth
      cac: 30,
      ltv: 500, // LTV/CAC > 3
      churn: 2, // below threshold
    }));

    const metrics = await dashboard.getSubsidiaryMetrics('zionx');

    expect(metrics.strategyRecommendation).toBe('scale');
    expect(metrics.strategyRationale).toBeTruthy();
  });

  it('should recommend optimize when unit economics are poor', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zxmg',
      mrr: 5500,
      previousMrr: 5000, // 10% growth
      cac: 200,
      ltv: 400, // LTV/CAC = 2 (below 3)
      churn: 6, // above threshold
      roas: 1.5,
    }));

    const metrics = await dashboard.getSubsidiaryMetrics('zxmg');

    expect(metrics.strategyRecommendation).toBe('optimize');
  });

  it('should recommend deprecate for severe decline with poor economics', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zion_alpha',
      mrr: 2000,
      previousMrr: 3000, // -33% growth
      cac: 500,
      ltv: 300, // LTV/CAC < 1
      churn: 12, // very high
      roas: 0.5,
    }));

    const metrics = await dashboard.getSubsidiaryMetrics('zion_alpha');

    expect(metrics.strategyRecommendation).toBe('deprecate');
  });

  it('should throw error for unknown subsidiary', async () => {
    await expect(dashboard.getSubsidiaryMetrics('unknown')).rejects.toThrow(
      'No data available for subsidiary: unknown',
    );
  });
});

// ---------------------------------------------------------------------------
// Weekly Report Tests
// ---------------------------------------------------------------------------

describe('EretzPortfolioDashboard — Weekly Report', () => {
  let dashboard: EretzPortfolioDashboardImpl;
  let config: PortfolioDashboardConfig;

  beforeEach(() => {
    config = createConfig();
    dashboard = new EretzPortfolioDashboardImpl(config);

    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 10000,
      previousMrr: 9000,
      cac: 40,
      ltv: 400,
      churn: 2.5,
      roas: 3.5,
      revenue: 10500,
    }));
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zxmg',
      mrr: 5000,
      previousMrr: 4500,
      cac: 60,
      ltv: 300,
      churn: 4,
      roas: 2.5,
      revenue: 5000,
    }));

    dashboard.setTargets('zionx', {
      mrr: 12000,
      growthRate: 15,
      cac: 35,
      churn: 2,
      roas: 4.0,
    });
  });

  it('should generate report with correct structure', async () => {
    const report = await dashboard.generateWeeklyReport();

    expect(report.reportDate).toBeInstanceOf(Date);
    expect(report.subsidiaryReports).toBeInstanceOf(Array);
    expect(report.subsidiaryReports.length).toBe(2);
    expect(report.portfolioSummary).toBeDefined();
    expect(report.recommendations).toBeInstanceOf(Array);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('should include subsidiary reports with metrics', async () => {
    const report = await dashboard.generateWeeklyReport();

    const zionxReport = report.subsidiaryReports.find((r) => r.subsidiary === 'zionx');
    expect(zionxReport).toBeDefined();
    expect(zionxReport!.metrics.mrr).toBe(10000);
    expect(zionxReport!.metrics.cac).toBe(40);
  });

  it('should include target comparison when targets are set', async () => {
    const report = await dashboard.generateWeeklyReport();

    const zionxReport = report.subsidiaryReports.find((r) => r.subsidiary === 'zionx');
    expect(zionxReport!.targetComparison.mrr).toEqual({
      actual: 10000,
      target: 12000,
      gap: -2000,
    });
  });

  it('should include benchmark comparison in subsidiary reports', async () => {
    const report = await dashboard.generateWeeklyReport();

    const zionxReport = report.subsidiaryReports.find((r) => r.subsidiary === 'zionx');
    expect(zionxReport!.benchmarkComparison.cac).toBeDefined();
    expect(zionxReport!.benchmarkComparison.churn).toBeDefined();
    expect(zionxReport!.benchmarkComparison.roas).toBeDefined();
  });

  it('should include portfolio summary with total MRR and health', async () => {
    const report = await dashboard.generateWeeklyReport();

    expect(report.portfolioSummary.totalMRR).toBe(15000);
    expect(report.portfolioSummary.totalGrowthRate).toBeGreaterThan(0);
    expect(['strong', 'stable', 'at_risk', 'critical']).toContain(report.portfolioSummary.overallHealth);
    expect(report.portfolioSummary.topPerformer).toBe('zionx');
    expect(report.portfolioSummary.bottomPerformer).toBe('zxmg');
  });

  it('should identify highlights and concerns per subsidiary', async () => {
    // zxmg has churn > benchmark (3%) at 4%
    const report = await dashboard.generateWeeklyReport();

    const zxmgReport = report.subsidiaryReports.find((r) => r.subsidiary === 'zxmg');
    expect(zxmgReport!.concerns.length).toBeGreaterThan(0);
    expect(zxmgReport!.concerns.some((c) => c.toLowerCase().includes('churn'))).toBe(true);
  });

  it('should publish portfolio.weekly_report_generated event', async () => {
    await dashboard.generateWeeklyReport();

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'portfolio.weekly_report_generated',
        detail: expect.objectContaining({
          subsidiaryCount: 2,
          totalMRR: 15000,
          overallHealth: expect.any(String),
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: expect.any(String),
          timestamp: expect.any(Date),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Decline Alert Tests
// ---------------------------------------------------------------------------

describe('EretzPortfolioDashboard — Decline Alerts', () => {
  let dashboard: EretzPortfolioDashboardImpl;
  let config: PortfolioDashboardConfig;

  beforeEach(() => {
    config = createConfig();
    dashboard = new EretzPortfolioDashboardImpl(config);
  });

  it('should detect MRR decline exceeding 10% threshold', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 8000,
      previousMrr: 10000, // -20% decline
      churn: 2,
      roas: 3.0,
      marketingSpend: 1000,
    }));

    const alerts = await dashboard.checkDeclineAlerts();

    const mrrAlert = alerts.find((a) => a.metric === 'mrr');
    expect(mrrAlert).toBeDefined();
    expect(mrrAlert!.subsidiary).toBe('zionx');
    expect(mrrAlert!.declinePercentage).toBe(20);
    expect(mrrAlert!.threshold).toBe(10);
  });

  it('should not trigger MRR alert for decline below threshold', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 9500,
      previousMrr: 10000, // -5% decline (below 10% threshold)
      churn: 2,
      roas: 3.0,
      marketingSpend: 1000,
    }));

    const alerts = await dashboard.checkDeclineAlerts();

    const mrrAlert = alerts.find((a) => a.metric === 'mrr');
    expect(mrrAlert).toBeUndefined();
  });

  it('should detect churn exceeding 5% threshold', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zxmg',
      mrr: 5000,
      previousMrr: 5000,
      churn: 7, // exceeds 5% threshold
      roas: 3.0,
      marketingSpend: 1000,
    }));

    const alerts = await dashboard.checkDeclineAlerts();

    const churnAlert = alerts.find((a) => a.metric === 'churn');
    expect(churnAlert).toBeDefined();
    expect(churnAlert!.subsidiary).toBe('zxmg');
    expect(churnAlert!.currentValue).toBe(7);
    expect(churnAlert!.threshold).toBe(5);
  });

  it('should detect ROAS below 1.0 threshold', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zion_alpha',
      mrr: 3000,
      previousMrr: 3000,
      churn: 2,
      roas: 0.7, // below 1.0 threshold
      marketingSpend: 2000,
    }));

    const alerts = await dashboard.checkDeclineAlerts();

    const roasAlert = alerts.find((a) => a.metric === 'roas');
    expect(roasAlert).toBeDefined();
    expect(roasAlert!.subsidiary).toBe('zion_alpha');
    expect(roasAlert!.currentValue).toBe(0.7);
    expect(roasAlert!.threshold).toBe(1.0);
  });

  it('should assign critical severity for severe declines', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 7000,
      previousMrr: 10000, // -30% decline (>20% = critical)
      churn: 2,
      roas: 3.0,
      marketingSpend: 1000,
    }));

    const alerts = await dashboard.checkDeclineAlerts();

    const mrrAlert = alerts.find((a) => a.metric === 'mrr');
    expect(mrrAlert!.severity).toBe('critical');
  });

  it('should include intervention plan in alerts', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 8000,
      previousMrr: 10000,
      churn: 2,
      roas: 3.0,
      marketingSpend: 1000,
    }));

    const alerts = await dashboard.checkDeclineAlerts();

    const mrrAlert = alerts.find((a) => a.metric === 'mrr');
    expect(mrrAlert!.interventionPlan).toBeTruthy();
    expect(mrrAlert!.interventionPlan).toContain('zionx');
  });

  it('should escalate alerts to Recommendation Queue', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 8000,
      previousMrr: 10000,
      churn: 2,
      roas: 3.0,
      marketingSpend: 1000,
    }));

    const alerts = await dashboard.checkDeclineAlerts();

    expect(config.recommendationQueue.submit).toHaveBeenCalled();
    expect(alerts[0].recommendationId).toBe('rec-id-001');
  });

  it('should publish portfolio.decline_alerts event', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 8000,
      previousMrr: 10000,
      churn: 7,
      roas: 0.5,
      marketingSpend: 1000,
    }));

    await dashboard.checkDeclineAlerts();

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'portfolio.decline_alerts',
        detail: expect.objectContaining({
          alertCount: expect.any(Number),
          criticalCount: expect.any(Number),
          affectedSubsidiaries: expect.any(Array),
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: expect.any(String),
          timestamp: expect.any(Date),
        }),
      }),
    );
  });

  it('should return empty array when no thresholds are exceeded', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 10000,
      previousMrr: 9500, // ~5% growth (no decline)
      churn: 2, // below 5%
      roas: 3.0, // above 1.0
      marketingSpend: 1000,
    }));

    const alerts = await dashboard.checkDeclineAlerts();

    expect(alerts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Portfolio Strategy Tests
// ---------------------------------------------------------------------------

describe('EretzPortfolioDashboard — Portfolio Strategy', () => {
  let dashboard: EretzPortfolioDashboardImpl;
  let config: PortfolioDashboardConfig;

  beforeEach(() => {
    config = createConfig();
    dashboard = new EretzPortfolioDashboardImpl(config);
  });

  it('should generate strategy with per-subsidiary recommendations', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 12000,
      previousMrr: 10000, // 20% growth
      cac: 30,
      ltv: 500,
      churn: 2,
      roas: 4.0,
    }));
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zxmg',
      mrr: 5000,
      previousMrr: 4800, // ~4% growth
      cac: 100,
      ltv: 250, // LTV/CAC = 2.5 (below 3)
      churn: 6, // above threshold
      roas: 2.0,
    }));

    const strategy = await dashboard.getPortfolioStrategy();

    expect(strategy.subsidiaryStrategies.zionx.strategy).toBe('scale');
    expect(strategy.subsidiaryStrategies.zxmg.strategy).toBe('optimize');
  });

  it('should include resource allocation percentages', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 10000,
      previousMrr: 8000,
      cac: 30,
      ltv: 500,
      churn: 2,
    }));
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zxmg',
      mrr: 5000,
      previousMrr: 5000,
      cac: 50,
      ltv: 400,
      churn: 3,
      roas: 3.0,
    }));

    const strategy = await dashboard.getPortfolioStrategy();

    expect(strategy.subsidiaryStrategies.zionx.resourceAllocation).toBeGreaterThan(0);
    expect(strategy.subsidiaryStrategies.zxmg.resourceAllocation).toBeGreaterThan(0);
  });

  it('should include key actions per subsidiary', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 12000,
      previousMrr: 10000,
      cac: 30,
      ltv: 500,
      churn: 2,
    }));

    const strategy = await dashboard.getPortfolioStrategy();

    expect(strategy.subsidiaryStrategies.zionx.keyActions.length).toBeGreaterThan(0);
  });

  it('should include portfolio thesis', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 10000,
      previousMrr: 9000,
    }));

    const strategy = await dashboard.getPortfolioStrategy();

    expect(strategy.portfolioThesis).toBeTruthy();
    expect(strategy.portfolioThesis.length).toBeGreaterThan(10);
  });

  it('should include risk factors based on real metrics', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zxmg',
      mrr: 4000,
      previousMrr: 5000, // -20% decline
      churn: 8, // high churn
      roas: 0.5, // below 1.0
      marketingSpend: 2000,
    }));

    const strategy = await dashboard.getPortfolioStrategy();

    expect(strategy.riskFactors.length).toBeGreaterThan(0);
    expect(strategy.riskFactors.some((r) => r.includes('churn'))).toBe(true);
    expect(strategy.riskFactors.some((r) => r.includes('MRR'))).toBe(true);
  });

  it('should include top priorities', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 12000,
      previousMrr: 10000,
      cac: 30,
      ltv: 500,
      churn: 2,
    }));

    const strategy = await dashboard.getPortfolioStrategy();

    expect(strategy.topPriorities.length).toBeGreaterThan(0);
    expect(strategy.topPriorities.some((p) => p.includes('zionx'))).toBe(true);
  });

  it('should include lastReviewed timestamp', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({ subsidiary: 'zionx' }));

    const strategy = await dashboard.getPortfolioStrategy();

    expect(strategy.lastReviewed).toBeInstanceOf(Date);
  });

  it('should publish portfolio.strategy_updated event', async () => {
    dashboard.updateSubsidiaryData(createSubsidiaryData({ subsidiary: 'zionx' }));

    await dashboard.getPortfolioStrategy();

    expect(config.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'portfolio.strategy_updated',
        detail: expect.objectContaining({
          subsidiaryCount: 1,
          strategies: expect.any(Object),
          riskCount: expect.any(Number),
          priorityCount: expect.any(Number),
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: expect.any(String),
          timestamp: expect.any(Date),
        }),
      }),
    );
  });

  it('should inform strategy recommendations from real metrics', async () => {
    // A subsidiary with great metrics should get "scale"
    dashboard.updateSubsidiaryData(createSubsidiaryData({
      subsidiary: 'zionx',
      mrr: 15000,
      previousMrr: 12000, // 25% growth
      cac: 20,
      ltv: 800, // LTV/CAC = 40
      churn: 1.5,
      roas: 5.0,
    }));

    const strategy = await dashboard.getPortfolioStrategy();

    expect(strategy.subsidiaryStrategies.zionx.strategy).toBe('scale');
    expect(strategy.subsidiaryStrategies.zionx.rationale).toContain('growth');
  });
});
