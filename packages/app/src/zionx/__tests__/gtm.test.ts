/**
 * Unit tests for ZionX GTM Engine components
 *
 * Validates: Requirements 11b.1, 11b.2, 11b.3, 11b.5, 11b.6, 19.1
 *
 * Tests market research, ASO engine, campaign manager, revenue optimizer,
 * and portfolio manager.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DriverResult } from '@seraphim/core';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

function mockDriverResult(data?: unknown): DriverResult {
  return {
    success: true,
    operationId: `op-${Date.now()}`,
    retryable: false,
    data: data ?? {},
  };
}

function mockFailedDriverResult(): DriverResult {
  return {
    success: false,
    operationId: `op-${Date.now()}`,
    retryable: false,
    error: { message: 'Driver error', code: 'ERR', retryable: false },
  };
}

function createMockDriver() {
  return { execute: vi.fn().mockResolvedValue(mockDriverResult()) };
}

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue(undefined),
    storeSemantic: vi.fn().mockResolvedValue(undefined),
    storeProcedural: vi.fn().mockResolvedValue(undefined),
    storeWorking: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({ working: [], episodic: [], procedural: [] }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  } as unknown as ZikaronService;
}

function createMockOtzar(): OtzarService {
  return {
    routeTask: vi.fn().mockResolvedValue({ model: 'gpt-4o-mini', provider: 'openai' }),
    checkBudget: vi.fn().mockResolvedValue({ allowed: true, remaining: 100000 }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getCostReport: vi.fn().mockResolvedValue({
      totalCost: 100,
      byAgent: { 'zionx-app-factory': 50 },
      byPillar: { eretz: 100 },
    }),
    getDailyOptimizationReport: vi.fn().mockResolvedValue({}),
    checkCache: vi.fn().mockResolvedValue(null),
    storeCache: vi.fn().mockResolvedValue(undefined),
  } as unknown as OtzarService;
}

// ===========================================================================
// Market Research Engine
// ===========================================================================

describe('MarketResearchEngine', () => {
  let engine: Awaited<typeof import('../gtm/market-research.js')>['MarketResearchEngine'] extends new (...args: infer _A) => infer _R ? _R : never;
  let mockLLM: ReturnType<typeof createMockDriver>;
  let mockBrowser: ReturnType<typeof createMockDriver>;
  let mockZikaron: ZikaronService;

  beforeEach(async () => {
    const { MarketResearchEngine } = await import('../gtm/market-research.js');
    mockLLM = createMockDriver();
    mockBrowser = createMockDriver();
    mockBrowser.execute.mockResolvedValue(mockDriverResult([]));
    mockZikaron = createMockZikaron();
    engine = new MarketResearchEngine(mockLLM, mockBrowser, mockZikaron);
  });

  it('should calculate demand score from niche and competitive analysis', () => {
    const score = engine.calculateDemandScore(
      {
        name: 'Meditation Timer',
        category: 'Health & Fitness',
        targetPlatforms: ['ios', 'android'],
        keywords: ['meditation', 'timer', 'mindfulness', 'relaxation'],
        targetAudience: 'Adults 25-45',
      },
      {
        competitors: [
          {
            name: 'Calm',
            bundleId: 'com.calm',
            platform: 'ios' as const,
            rating: 4.8,
            reviewCount: 50000,
            price: 0,
            hasSubscription: true,
            features: ['guided meditation'],
            lastUpdated: new Date().toISOString(),
          },
          {
            name: 'Headspace',
            bundleId: 'com.headspace',
            platform: 'ios' as const,
            rating: 4.7,
            reviewCount: 40000,
            price: 0,
            hasSubscription: true,
            features: ['sleep sounds'],
            lastUpdated: new Date().toISOString(),
          },
        ],
        ratingGaps: [],
        featureGaps: [],
        pricingGap: {
          priceRange: { min: 0, max: 0 },
          averagePrice: 0,
          medianPrice: 0,
          freeCompetitors: 2,
          premiumCompetitors: 0,
          suggestedPricePoint: 0,
          suggestedModel: 'freemium',
        },
        analyzedAt: new Date().toISOString(),
      },
    );

    expect(score.overall).toBeGreaterThan(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score.searchVolume).toBeGreaterThan(0);
    expect(score.competitionIntensity).toBeGreaterThan(0);
    expect(score.monetizationPotential).toBeGreaterThan(0);
  });

  it('should perform full niche research', async () => {
    const result = await engine.researchNiche({
      name: 'Habit Tracker',
      category: 'Productivity',
      targetPlatforms: ['ios'],
      keywords: ['habits', 'tracker'],
      targetAudience: 'Young professionals',
    });

    expect(result.niche.name).toBe('Habit Tracker');
    expect(result.demandScore).toBeDefined();
    expect(result.competitiveAnalysis).toBeDefined();
    expect(['proceed', 'pivot', 'abandon']).toContain(result.recommendation);
    expect(result.researchedAt).toBeDefined();

    // Should store research in Zikaron
    expect(mockZikaron.storeSemantic).toHaveBeenCalled();
  });
});

// ===========================================================================
// ASO Engine
// ===========================================================================

describe('ASOEngine', () => {
  let engine: Awaited<typeof import('../gtm/aso-engine.js')>['ASOEngine'] extends new (...args: infer _A) => infer _R ? _R : never;
  let mockLLM: ReturnType<typeof createMockDriver>;
  let mockBrowser: ReturnType<typeof createMockDriver>;
  let mockZikaron: ZikaronService;

  beforeEach(async () => {
    const { ASOEngine } = await import('../gtm/aso-engine.js');
    mockLLM = createMockDriver();
    mockBrowser = createMockDriver();
    mockZikaron = createMockZikaron();
    engine = new ASOEngine(mockLLM, mockBrowser, mockZikaron);
  });

  it('should research keywords and generate strategy', async () => {
    const strategy = await engine.researchKeywords({
      appId: 'app-1',
      appName: 'FocusTimer',
      category: 'Productivity',
      seedKeywords: ['focus', 'timer', 'pomodoro'],
      targetLocales: ['en-US'],
      platform: 'apple',
    });

    expect(strategy.appId).toBe('app-1');
    expect(strategy.platform).toBe('apple');
    expect(strategy.primaryKeywords.length).toBeGreaterThan(0);
    expect(strategy.suggestedTitle).toBeDefined();
    expect(strategy.suggestedSubtitle).toBeDefined();
  });

  it('should generate A/B test variants for title and subtitle', async () => {
    const strategy = await engine.researchKeywords({
      appId: 'app-1',
      appName: 'FocusTimer',
      category: 'Productivity',
      seedKeywords: ['focus', 'timer'],
      targetLocales: ['en-US'],
      platform: 'apple',
    });

    const abTests = await engine.generateABTests(
      {
        appId: 'app-1',
        appName: 'FocusTimer',
        category: 'Productivity',
        seedKeywords: ['focus', 'timer'],
        targetLocales: ['en-US'],
        platform: 'apple',
      },
      strategy,
    );

    expect(abTests.length).toBeGreaterThanOrEqual(2);
    const titleTest = abTests.find((t) => t.variants[0]?.type === 'title');
    expect(titleTest).toBeDefined();
    expect(titleTest!.variants.length).toBeGreaterThanOrEqual(2);
    expect(titleTest!.status).toBe('draft');
  });

  it('should generate screenshots for Apple platform', async () => {
    const screenshots = await engine.generateScreenshots({
      appId: 'app-1',
      appName: 'FocusTimer',
      category: 'Productivity',
      seedKeywords: ['focus'],
      targetLocales: ['en-US'],
      platform: 'apple',
    });

    expect(screenshots.length).toBeGreaterThanOrEqual(3);
    expect(screenshots[0].spec.deviceType).toContain('iPhone');
  });

  it('should generate screenshots for Google platform', async () => {
    const screenshots = await engine.generateScreenshots({
      appId: 'app-1',
      appName: 'FocusTimer',
      category: 'Productivity',
      seedKeywords: ['focus'],
      targetLocales: ['en-US'],
      platform: 'google',
    });

    expect(screenshots.length).toBeGreaterThanOrEqual(3);
    expect(screenshots[0].spec.deviceType).toBe('Phone');
  });

  it('should run full ASO optimization', async () => {
    const result = await engine.optimize({
      appId: 'app-1',
      appName: 'FocusTimer',
      category: 'Productivity',
      seedKeywords: ['focus', 'timer', 'pomodoro'],
      targetLocales: ['en-US', 'es-ES'],
      platform: 'apple',
    });

    expect(result.appId).toBe('app-1');
    expect(result.keywordStrategy).toBeDefined();
    expect(result.abTests.length).toBeGreaterThan(0);
    expect(result.screenshots.length).toBeGreaterThan(0);
    expect(result.previewVideo).toBeDefined();
    expect(result.localizedListings.length).toBe(2); // en-US and es-ES
    expect(result.optimizedAt).toBeDefined();

    // Should store strategy in Zikaron
    expect(mockZikaron.storeProcedural).toHaveBeenCalled();
  });
});

// ===========================================================================
// Campaign Manager
// ===========================================================================

describe('CampaignManager', () => {
  let manager: Awaited<typeof import('../gtm/campaign-manager.js')>['CampaignManager'] extends new (...args: infer _A) => infer _R ? _R : never;
  let mockLLM: ReturnType<typeof createMockDriver>;
  let mockHeyGen: ReturnType<typeof createMockDriver>;
  let mockGoogleAds: ReturnType<typeof createMockDriver>;
  let socialDrivers: Map<string, ReturnType<typeof createMockDriver>>;
  let mockOtzar: OtzarService;
  let mockZikaron: ZikaronService;

  beforeEach(async () => {
    const { CampaignManager } = await import('../gtm/campaign-manager.js');
    mockLLM = createMockDriver();
    mockLLM.execute.mockResolvedValue(mockDriverResult({ text: 'Check out this amazing app!' }));
    mockHeyGen = createMockDriver();
    mockHeyGen.execute.mockResolvedValue(mockDriverResult({ videoUrl: 'https://video.example.com/v1.mp4' }));
    mockGoogleAds = createMockDriver();
    mockGoogleAds.execute.mockResolvedValue(mockDriverResult({ id: 'gads-campaign-1' }));

    socialDrivers = new Map();
    const tiktokDriver = createMockDriver();
    const instagramDriver = createMockDriver();
    socialDrivers.set('tiktok', tiktokDriver);
    socialDrivers.set('instagram', instagramDriver);

    mockOtzar = createMockOtzar();
    mockZikaron = createMockZikaron();

    manager = new CampaignManager(
      mockLLM,
      mockHeyGen,
      mockGoogleAds,
      socialDrivers as any,
      mockOtzar,
      mockZikaron,
    );
  });

  it('should launch social media campaigns across configured platforms', async () => {
    const result = await manager.launchCampaign({
      appId: 'app-1',
      appName: 'FocusTimer',
      type: 'social_organic',
      platforms: ['tiktok', 'instagram'],
      startDate: new Date().toISOString(),
      targetAudience: { interests: ['productivity'] },
    });

    expect(result.campaign.status).toBe('active');
    expect(result.postsCreated).toBe(2);
    expect(result.campaign.socialPosts).toHaveLength(2);
  });

  it('should handle missing social media driver gracefully', async () => {
    const result = await manager.launchCampaign({
      appId: 'app-1',
      appName: 'FocusTimer',
      type: 'social_organic',
      platforms: ['reddit' as any], // No reddit driver configured
      startDate: new Date().toISOString(),
      targetAudience: {},
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('reddit');
  });

  it('should create Google Ads campaign for paid campaigns', async () => {
    const result = await manager.launchCampaign({
      appId: 'app-1',
      appName: 'FocusTimer',
      type: 'google_ads',
      platforms: [],
      budget: 100,
      startDate: new Date().toISOString(),
      targetAudience: { interests: ['productivity'] },
    });

    expect(result.adCampaignCreated).toBe(true);
    expect(result.campaign.googleAdsCampaignId).toBeDefined();
  });

  it('should record budget usage in Otzar', async () => {
    await manager.launchCampaign({
      appId: 'app-1',
      appName: 'FocusTimer',
      type: 'social_paid',
      platforms: ['tiktok'],
      budget: 200,
      startDate: new Date().toISOString(),
      targetAudience: {},
    });

    expect(mockOtzar.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ costUsd: 200 }),
    );
  });
});

// ===========================================================================
// Revenue Optimizer
// ===========================================================================

describe('RevenueOptimizer', () => {
  let optimizer: Awaited<typeof import('../gtm/revenue-optimizer.js')>['RevenueOptimizer'] extends new (...args: infer _A) => infer _R ? _R : never;
  let mockAppleDriver: ReturnType<typeof createMockDriver>;
  let mockGoogleDriver: ReturnType<typeof createMockDriver>;
  let mockRevenueCat: ReturnType<typeof createMockDriver>;
  let mockLLM: ReturnType<typeof createMockDriver>;
  let mockOtzar: OtzarService;
  let mockZikaron: ZikaronService;

  beforeEach(async () => {
    const { RevenueOptimizer } = await import('../gtm/revenue-optimizer.js');
    mockAppleDriver = createMockDriver();
    mockAppleDriver.execute.mockResolvedValue(
      mockDriverResult({
        metrics: {
          downloads: { value: 1000 },
          revenue: { value: 500 },
        },
      }),
    );
    mockGoogleDriver = createMockDriver();
    mockRevenueCat = createMockDriver();
    mockLLM = createMockDriver();
    mockOtzar = createMockOtzar();
    mockZikaron = createMockZikaron();

    optimizer = new RevenueOptimizer(
      mockAppleDriver,
      mockGoogleDriver,
      mockRevenueCat,
      mockLLM,
      mockOtzar,
      mockZikaron,
    );
  });

  describe('assessHealth', () => {
    it('should return critical for high churn and no activity', () => {
      const status = optimizer.assessHealth({
        appId: 'app-1',
        period: { start: '', end: '' },
        downloads: 0,
        activeUsers: 0,
        conversionRate: 0,
        retention: { day1: 0, day7: 0, day30: 0 },
        arpu: 0,
        ltv: 0,
        churnRate: 0.6,
        revenue: 0,
        adRevenue: 0,
        subscriptionRevenue: 0,
        collectedAt: '',
      });
      expect(status).toBe('critical');
    });

    it('should return declining for moderate churn', () => {
      const status = optimizer.assessHealth({
        appId: 'app-1',
        period: { start: '', end: '' },
        downloads: 100,
        activeUsers: 50,
        conversionRate: 0.02,
        retention: { day1: 0.3, day7: 0.05, day30: 0.01 },
        arpu: 1,
        ltv: 5,
        churnRate: 0.35,
        revenue: 100,
        adRevenue: 0,
        subscriptionRevenue: 100,
        collectedAt: '',
      });
      expect(status).toBe('declining');
    });

    it('should return growing for good metrics', () => {
      const status = optimizer.assessHealth({
        appId: 'app-1',
        period: { start: '', end: '' },
        downloads: 1000,
        activeUsers: 500,
        conversionRate: 0.08,
        retention: { day1: 0.6, day7: 0.4, day30: 0.2 },
        arpu: 3,
        ltv: 20,
        churnRate: 0.1,
        revenue: 1500,
        adRevenue: 200,
        subscriptionRevenue: 1300,
        collectedAt: '',
      });
      expect(status).toBe('growing');
    });
  });

  it('should generate re-engagement plan for declining apps', async () => {
    const plan = await optimizer.createReEngagementPlan('app-1', {
      appId: 'app-1',
      period: { start: '', end: '' },
      downloads: 50,
      activeUsers: 10,
      conversionRate: 0.01,
      retention: { day1: 0.2, day7: 0.05, day30: 0.01 },
      arpu: 0.5,
      ltv: 2,
      churnRate: 0.4,
      revenue: 25,
      adRevenue: 0,
      subscriptionRevenue: 25,
      collectedAt: '',
    });

    expect(plan.appId).toBe('app-1');
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.actions.some((a) => a.type === 'push_notification')).toBe(true);
    expect(plan.estimatedImpact).toBeDefined();
  });

  it('should create pricing experiments for stable/declining apps', () => {
    const experiments = optimizer.createPricingExperiments('app-1', {
      appId: 'app-1',
      period: { start: '', end: '' },
      downloads: 100,
      activeUsers: 50,
      conversionRate: 0.02,
      retention: { day1: 0.3, day7: 0.1, day30: 0.05 },
      arpu: 2,
      ltv: 10,
      churnRate: 0.2,
      revenue: 200,
      adRevenue: 0,
      subscriptionRevenue: 200,
      collectedAt: '',
    });

    expect(experiments.length).toBeGreaterThan(0);
    expect(experiments[0].testPrices.length).toBeGreaterThanOrEqual(3);
    expect(experiments[0].status).toBe('draft');
  });
});

// ===========================================================================
// Portfolio Manager
// ===========================================================================

describe('PortfolioManager', () => {
  let manager: Awaited<typeof import('../gtm/portfolio-manager.js')>['PortfolioManager'] extends new (...args: infer _A) => infer _R ? _R : never;
  let mockRevenueOptimizer: any;
  let mockOtzar: OtzarService;
  let mockZikaron: ZikaronService;

  beforeEach(async () => {
    const { PortfolioManager } = await import('../gtm/portfolio-manager.js');
    mockOtzar = createMockOtzar();
    mockZikaron = createMockZikaron();

    mockRevenueOptimizer = {
      collectMetrics: vi.fn().mockResolvedValue({
        appId: 'app-1',
        period: { start: '', end: '' },
        downloads: 500,
        activeUsers: 200,
        conversionRate: 0.06,
        retention: { day1: 0.5, day7: 0.35, day30: 0.15 },
        arpu: 2.5,
        ltv: 15,
        churnRate: 0.15,
        revenue: 1250,
        adRevenue: 100,
        subscriptionRevenue: 1150,
        collectedAt: new Date().toISOString(),
      }),
      assessHealth: vi.fn().mockReturnValue('growing'),
    };

    manager = new PortfolioManager(mockRevenueOptimizer, mockOtzar, mockZikaron);
  });

  describe('generateRecommendation', () => {
    it('should recommend scale for growing app with good ROAS', () => {
      const { recommendation } = manager.generateRecommendation(
        { revenue: 1000, downloads: 500 } as any,
        'growing',
        4.0,
      );
      expect(recommendation).toBe('scale');
    });

    it('should recommend deprecate for critical app with no activity', () => {
      const { recommendation } = manager.generateRecommendation(
        { revenue: 0, downloads: 0 } as any,
        'critical',
        0,
      );
      expect(recommendation).toBe('deprecate');
    });

    it('should recommend optimize for declining app', () => {
      const { recommendation } = manager.generateRecommendation(
        { revenue: 100, downloads: 50 } as any,
        'declining',
        1.5,
      );
      expect(recommendation).toBe('optimize');
    });

    it('should recommend maintain for stable app with acceptable ROAS', () => {
      const { recommendation } = manager.generateRecommendation(
        { revenue: 500, downloads: 200 } as any,
        'stable',
        3.0,
      );
      expect(recommendation).toBe('maintain');
    });
  });

  it('should generate a full portfolio health report', async () => {
    const report = await manager.generateReport('tenant-1', [
      { appId: 'app-1', appName: 'FocusTimer', platform: 'apple' },
      { appId: 'app-2', appName: 'HabitTracker', platform: 'google' },
    ]);

    expect(report.tenantId).toBe('tenant-1');
    expect(report.apps).toHaveLength(2);
    expect(report.summary.totalApps).toBe(2);
    expect(report.summary.totalRevenue).toBeGreaterThan(0);
    expect(report.generatedAt).toBeDefined();

    // Should store report in Zikaron
    expect(mockZikaron.storeEpisodic).toHaveBeenCalled();
  });
});
