/**
 * Unit tests for ZXMG Video Development Studio — Video Analytics Service
 *
 * Validates: Requirements 44e.25, 44e.26, 44e.27, 44e.28
 *
 * Tests performance tracking, retention heatmap generation, performance
 * pattern retrieval, and Zikaron storage integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultVideoAnalyticsService,
  type VideoAnalyticsService,
  type MetricsProvider,
  type PatternAnalyzer,
  type ZikaronStore,
  type VideoPerformance,
} from '../analytics-service.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockMetricsProvider(): MetricsProvider {
  return {
    fetchVideoMetrics: vi.fn().mockResolvedValue({
      views: 150000,
      watchTime: 45000,
      engagementRate: 8.5,
      ctr: 6.2,
      revenue: 1200,
      retentionCurve: [100, 95, 88, 80, 72, 65, 58, 50, 45, 40],
      publishedAt: new Date('2024-03-15'),
    }),
  };
}

function createMockPatternAnalyzer(): PatternAnalyzer {
  return {
    analyzePatterns: vi.fn().mockResolvedValue([
      {
        pattern: 'tutorial-format',
        avgViews: 120000,
        avgEngagement: 7.8,
        confidence: 0.85,
      },
      {
        pattern: 'listicle-format',
        avgViews: 95000,
        avgEngagement: 6.5,
        confidence: 0.72,
      },
    ]),
  };
}

function createMockZikaronStore(): ZikaronStore {
  const store = new Map<string, Record<string, unknown>>();
  return {
    store: vi.fn(async (key: string, data: Record<string, unknown>) => {
      store.set(key, data);
    }),
    retrieve: vi.fn(async (key: string) => store.get(key) ?? null),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultVideoAnalyticsService', () => {
  let service: VideoAnalyticsService;
  let metricsProvider: ReturnType<typeof createMockMetricsProvider>;
  let patternAnalyzer: ReturnType<typeof createMockPatternAnalyzer>;
  let zikaronStore: ReturnType<typeof createMockZikaronStore>;

  beforeEach(() => {
    metricsProvider = createMockMetricsProvider();
    patternAnalyzer = createMockPatternAnalyzer();
    zikaronStore = createMockZikaronStore();
    service = new DefaultVideoAnalyticsService(metricsProvider, patternAnalyzer, zikaronStore);
  });

  // -------------------------------------------------------------------------
  // Performance Tracking
  // -------------------------------------------------------------------------

  describe('trackPerformance', () => {
    it('returns video performance metrics', async () => {
      const performance = await service.trackPerformance('vid-1');

      expect(performance.videoId).toBe('vid-1');
      expect(performance.views).toBe(150000);
      expect(performance.watchTime).toBe(45000);
      expect(performance.engagementRate).toBe(8.5);
      expect(performance.ctr).toBe(6.2);
      expect(performance.revenue).toBe(1200);
      expect(performance.retentionCurve).toHaveLength(10);
      expect(performance.publishedAt).toEqual(new Date('2024-03-15'));
    });

    it('calls metrics provider with correct video ID', async () => {
      await service.trackPerformance('vid-42');

      expect(metricsProvider.fetchVideoMetrics).toHaveBeenCalledWith('vid-42');
    });
  });

  // -------------------------------------------------------------------------
  // Retention Heatmap
  // -------------------------------------------------------------------------

  describe('getRetentionHeatmap', () => {
    it('returns second-by-second retention data', async () => {
      const heatmap = await service.getRetentionHeatmap('vid-1');

      expect(heatmap).toHaveLength(10);
      expect(heatmap[0]).toEqual({ second: 0, retention: 100 });
      expect(heatmap[1]).toEqual({ second: 1, retention: 95 });
      expect(heatmap[9]).toEqual({ second: 9, retention: 40 });
    });

    it('maps each retention curve value to its second index', async () => {
      const heatmap = await service.getRetentionHeatmap('vid-1');

      heatmap.forEach((point, index) => {
        expect(point.second).toBe(index);
        expect(typeof point.retention).toBe('number');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Performance Patterns
  // -------------------------------------------------------------------------

  describe('getPerformancePatterns', () => {
    it('returns patterns from pattern analyzer', async () => {
      const patterns = await service.getPerformancePatterns('ch-1');

      expect(patterns).toHaveLength(2);
      expect(patterns[0].pattern).toBe('tutorial-format');
      expect(patterns[0].avgViews).toBe(120000);
      expect(patterns[0].avgEngagement).toBe(7.8);
      expect(patterns[0].confidence).toBe(0.85);
    });

    it('calls pattern analyzer with correct channel ID', async () => {
      await service.getPerformancePatterns('ch-99');

      expect(patternAnalyzer.analyzePatterns).toHaveBeenCalledWith('ch-99');
    });
  });

  // -------------------------------------------------------------------------
  // Zikaron Storage
  // -------------------------------------------------------------------------

  describe('storePerformanceInZikaron', () => {
    it('stores performance data in Zikaron with correct key', async () => {
      const performance: VideoPerformance = {
        videoId: 'vid-1',
        views: 150000,
        watchTime: 45000,
        engagementRate: 8.5,
        ctr: 6.2,
        revenue: 1200,
        retentionCurve: [100, 95, 88, 80, 72],
        publishedAt: new Date('2024-03-15'),
      };

      await service.storePerformanceInZikaron('vid-1', performance);

      expect(zikaronStore.store).toHaveBeenCalledWith(
        'video-performance:vid-1',
        expect.objectContaining({
          videoId: 'vid-1',
          views: 150000,
          watchTime: 45000,
          engagementRate: 8.5,
          ctr: 6.2,
          revenue: 1200,
        }),
      );
    });

    it('serializes publishedAt as ISO string', async () => {
      const performance: VideoPerformance = {
        videoId: 'vid-2',
        views: 5000,
        watchTime: 1500,
        engagementRate: 4.0,
        ctr: 3.5,
        revenue: 100,
        retentionCurve: [100, 80, 60],
        publishedAt: new Date('2024-06-01T12:00:00.000Z'),
      };

      await service.storePerformanceInZikaron('vid-2', performance);

      const call = (zikaronStore.store as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].publishedAt).toBe('2024-06-01T12:00:00.000Z');
    });
  });
});
