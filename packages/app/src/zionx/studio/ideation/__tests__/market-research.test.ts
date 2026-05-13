/**
 * Unit tests for ZionX Market Research Engine
 *
 * Validates: Requirements 45a.1, 45a.2, 45a.3, 45a.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MarketResearchEngineImpl,
  type EventBusPublisher,
  type ZikaronStorage,
  type AppStoreDataProvider,
  type AppStore,
  type RankedApp,
} from '../market-research.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusPublisher & { published: any[] } {
  const published: any[] = [];
  return {
    published,
    async publish(event: any) {
      published.push(event);
    },
  };
}

function createMockZikaron(): ZikaronStorage & { stored: any[] } {
  const stored: any[] = [];
  return {
    stored,
    async store(entry: any) {
      stored.push(entry);
    },
  };
}

function createMockDataProvider(): AppStoreDataProvider & { calls: any[] } {
  const calls: any[] = [];
  const mockApps: RankedApp[] = [
    { name: 'TopApp1', rank: 1, rating: 4.5, reviewCount: 1000, revenueEstimate: 50000, downloads: 100000 },
    { name: 'TopApp2', rank: 2, rating: 4.2, reviewCount: 800, revenueEstimate: 30000, downloads: 80000 },
    { name: 'TopApp3', rank: 3, rating: 3.8, reviewCount: 500, revenueEstimate: 20000, downloads: 60000 },
  ];

  const mockReviews = [
    { text: 'Great app but I wish it had dark mode', rating: 3 },
    { text: 'Crashes frequently, needs bug fixes', rating: 2 },
    { text: 'Missing offline support, please add this feature', rating: 3 },
    { text: 'Love it!', rating: 5 },
    { text: 'Need better notifications', rating: 2 },
  ];

  return {
    calls,
    async getCategories(_store: AppStore) {
      calls.push({ method: 'getCategories', store: _store });
      return ['productivity', 'health-fitness'];
    },
    async getCategoryRankings(_store: AppStore, _category: string) {
      calls.push({ method: 'getCategoryRankings', store: _store, category: _category });
      return mockApps;
    },
    async getAppReviews(_store: AppStore, _appName: string) {
      calls.push({ method: 'getAppReviews', store: _store, appName: _appName });
      return mockReviews;
    },
    async getTrendingApps(_store: AppStore) {
      calls.push({ method: 'getTrendingApps', store: _store });
      return [mockApps[0]];
    },
  };
}

function createEngine(categories?: string[]) {
  const eventBus = createMockEventBus();
  const zikaron = createMockZikaron();
  const dataProvider = createMockDataProvider();

  const engine = new MarketResearchEngineImpl({
    eventBus,
    zikaron,
    dataProvider,
    categories: categories ?? ['productivity'],
  });

  return { engine, eventBus, zikaron, dataProvider };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarketResearchEngine', () => {
  describe('runResearchCycle', () => {
    it('orchestrates scans across both stores and aggregates results', async () => {
      const { engine, dataProvider } = createEngine();

      const result = await engine.runResearchCycle();

      // Should scan both apple and google stores
      const rankingCalls = dataProvider.calls.filter((c) => c.method === 'getCategoryRankings');
      const appleRankings = rankingCalls.filter((c) => c.store === 'apple');
      const googleRankings = rankingCalls.filter((c) => c.store === 'google');
      expect(appleRankings.length).toBeGreaterThan(0);
      expect(googleRankings.length).toBeGreaterThan(0);

      expect(result.categoryRankings.length).toBe(2); // 1 category × 2 stores
      expect(result.competitorAnalyses.length).toBeGreaterThan(0);
      expect(result.reviewGaps.length).toBeGreaterThan(0);
      expect(result.emergingNiches.length).toBeGreaterThan(0);
    });

    it('returns a complete result with timing and findings count', async () => {
      const { engine } = createEngine();

      const result = await engine.runResearchCycle();

      expect(result.id).toBeDefined();
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());
      expect(result.findingsCount).toBeGreaterThan(0);
    });

    it('emits app.idea.researched hook when research cycle completes', async () => {
      const { engine, eventBus } = createEngine();

      const result = await engine.runResearchCycle();

      const hookEvent = eventBus.published.find((e) => e.type === 'app.idea.researched');
      expect(hookEvent).toBeDefined();
      expect(hookEvent.source).toBe('zionx.ideation');
      expect(hookEvent.detail.cycleId).toBe(result.id);
      expect(hookEvent.detail.findingsCount).toBe(result.findingsCount);
      expect(hookEvent.detail.emergingNichesCount).toBe(result.emergingNiches.length);
    });

    it('stores all findings in Zikaron', async () => {
      const { engine, zikaron } = createEngine();

      const result = await engine.runResearchCycle();

      expect(zikaron.stored.length).toBe(result.findingsCount);
    });
  });

  describe('scanAppStoreCategory', () => {
    it('produces correct structure with rankings, revenue, and competition density', async () => {
      const { engine } = createEngine();

      const ranking = await engine.scanAppStoreCategory('apple', 'productivity');

      expect(ranking.category).toBe('productivity');
      expect(ranking.store).toBe('apple');
      expect(ranking.topApps).toHaveLength(3);
      expect(ranking.revenueEstimate).toBe(100000); // 50000 + 30000 + 20000
      expect(ranking.competitionDensity).toBeGreaterThanOrEqual(0);
      expect(ranking.competitionDensity).toBeLessThanOrEqual(1);
      expect(['rising', 'stable', 'declining']).toContain(ranking.growthTrend);
    });

    it('calculates competition density from high-rated apps ratio', async () => {
      const { engine } = createEngine();

      const ranking = await engine.scanAppStoreCategory('google', 'productivity');

      // 2 out of 3 apps have rating >= 4.0
      expect(ranking.competitionDensity).toBeCloseTo(2 / 3, 1);
    });
  });

  describe('analyzeCompetitorApps', () => {
    it('identifies gaps and user complaints from review data', async () => {
      const { engine } = createEngine();

      const analyses = await engine.analyzeCompetitorApps('apple', 'productivity');

      expect(analyses.length).toBeGreaterThan(0);
      for (const analysis of analyses) {
        expect(analysis.store).toBe('apple');
        expect(analysis.appName).toBeDefined();
        expect(Array.isArray(analysis.weaknesses)).toBe(true);
        expect(Array.isArray(analysis.missingFeatures)).toBe(true);
        expect(Array.isArray(analysis.userComplaints)).toBe(true);
      }
    });

    it('extracts missing features from negative reviews', async () => {
      const { engine } = createEngine();

      const analyses = await engine.analyzeCompetitorApps('apple', 'productivity');

      // Our mock reviews contain "wish", "missing", "please add" keywords
      const allMissing = analyses.flatMap((a) => a.missingFeatures);
      expect(allMissing.length).toBeGreaterThan(0);
    });

    it('identifies weaknesses for low-rated apps', async () => {
      const { engine } = createEngine();

      const analyses = await engine.analyzeCompetitorApps('apple', 'productivity');

      // TopApp3 has rating 3.8 < 4.0
      const lowRatedAnalysis = analyses.find((a) => a.appName === 'TopApp3');
      if (lowRatedAnalysis) {
        expect(lowRatedAnalysis.weaknesses).toContain('Below average rating');
      }
    });
  });

  describe('identifyReviewGaps', () => {
    it('identifies unmet needs with correct sentiment scoring', async () => {
      const { engine } = createEngine();

      const gaps = await engine.identifyReviewGaps('apple', 'productivity');

      expect(gaps.length).toBeGreaterThan(0);
      for (const gap of gaps) {
        expect(gap.category).toBe('productivity');
        expect(gap.store).toBe('apple');
        expect(gap.unmetNeed).toBeDefined();
        expect(gap.sentimentScore).toBeGreaterThanOrEqual(0);
        expect(gap.sentimentScore).toBeLessThanOrEqual(1);
        expect(gap.mentionCount).toBeGreaterThanOrEqual(2);
        expect(gap.confidence).toBeGreaterThanOrEqual(0);
        expect(gap.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('detectEmergingNiches', () => {
    it('identifies rising niches with growth velocity', async () => {
      const { engine } = createEngine();

      const niches = await engine.detectEmergingNiches('apple');

      expect(niches.length).toBeGreaterThan(0);
      for (const niche of niches) {
        expect(niche.store).toBe('apple');
        expect(niche.category).toBeDefined();
        expect(niche.demandSignal).toBeGreaterThan(0);
        expect(niche.growthVelocity).toBeGreaterThan(0);
        expect(niche.confidence).toBeGreaterThanOrEqual(0);
        expect(niche.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('storeResearchFindings', () => {
    it('stores findings in Zikaron with correct metadata structure', async () => {
      const { engine, zikaron } = createEngine();

      await engine.runResearchCycle();

      expect(zikaron.stored.length).toBeGreaterThan(0);
      for (const entry of zikaron.stored) {
        expect(entry.tenantId).toBe('house-of-zion');
        expect(entry.layer).toBe('procedural');
        expect(entry.sourceAgentId).toBe('zionx-ideation-engine');
        expect(entry.tags).toContain('market-research');
        expect(entry.createdAt).toBeInstanceOf(Date);
        expect(entry.metadata).toBeDefined();
        expect(entry.metadata.source).toBeDefined();
        expect(entry.metadata.confidence).toBeDefined();
        expect(entry.metadata.category).toBeDefined();
      }
    });

    it('includes correct tags for different finding types', async () => {
      const { engine, zikaron } = createEngine();

      await engine.runResearchCycle();

      const types = zikaron.stored.map((e) => e.metadata.type);
      expect(types).toContain('category_ranking');
      expect(types).toContain('competitor_analysis');
    });
  });
});
