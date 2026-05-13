/**
 * ZXMG Video Development Studio — Video Analytics Service
 *
 * Tracks video performance metrics, generates retention heatmaps,
 * identifies performance patterns across channels, and stores
 * performance data in Zikaron for long-term memory retrieval.
 *
 * Requirements: 44e.25, 44e.26, 44e.27, 44e.28
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoPerformance {
  videoId: string;
  views: number;
  watchTime: number;
  engagementRate: number;
  ctr: number;
  revenue: number;
  retentionCurve: number[];
  publishedAt: Date;
}

export interface PerformancePattern {
  pattern: string;
  avgViews: number;
  avgEngagement: number;
  confidence: number;
}

export interface RetentionPoint {
  second: number;
  retention: number;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface MetricsProvider {
  fetchVideoMetrics(videoId: string): Promise<{
    views: number;
    watchTime: number;
    engagementRate: number;
    ctr: number;
    revenue: number;
    retentionCurve: number[];
    publishedAt: Date;
  }>;
}

export interface PatternAnalyzer {
  analyzePatterns(channelId: string): Promise<PerformancePattern[]>;
}

export interface ZikaronStore {
  store(key: string, data: Record<string, unknown>): Promise<void>;
  retrieve(key: string): Promise<Record<string, unknown> | null>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface VideoAnalyticsService {
  trackPerformance(videoId: string): Promise<VideoPerformance>;
  getRetentionHeatmap(videoId: string): Promise<RetentionPoint[]>;
  getPerformancePatterns(channelId: string): Promise<PerformancePattern[]>;
  storePerformanceInZikaron(videoId: string, performance: VideoPerformance): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

/**
 * Default implementation of VideoAnalyticsService.
 *
 * Uses dependency injection for metrics retrieval, pattern analysis,
 * and Zikaron memory storage. Converts raw retention curves into
 * second-by-second heatmap data.
 */
export class DefaultVideoAnalyticsService implements VideoAnalyticsService {
  constructor(
    private readonly metricsProvider: MetricsProvider,
    private readonly patternAnalyzer: PatternAnalyzer,
    private readonly zikaronStore: ZikaronStore,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Tracks and returns current performance metrics for a video.
   */
  async trackPerformance(videoId: string): Promise<VideoPerformance> {
    const metrics = await this.metricsProvider.fetchVideoMetrics(videoId);

    return {
      videoId,
      views: metrics.views,
      watchTime: metrics.watchTime,
      engagementRate: metrics.engagementRate,
      ctr: metrics.ctr,
      revenue: metrics.revenue,
      retentionCurve: metrics.retentionCurve,
      publishedAt: metrics.publishedAt,
    };
  }

  /**
   * Generates a retention heatmap from the video's retention curve.
   * Each entry maps a second to its retention percentage.
   */
  async getRetentionHeatmap(videoId: string): Promise<RetentionPoint[]> {
    const metrics = await this.metricsProvider.fetchVideoMetrics(videoId);

    return metrics.retentionCurve.map((retention, index) => ({
      second: index,
      retention,
    }));
  }

  /**
   * Retrieves performance patterns for a channel from the pattern analyzer.
   */
  async getPerformancePatterns(channelId: string): Promise<PerformancePattern[]> {
    return this.patternAnalyzer.analyzePatterns(channelId);
  }

  /**
   * Stores video performance data in Zikaron for long-term memory.
   */
  async storePerformanceInZikaron(videoId: string, performance: VideoPerformance): Promise<void> {
    await this.zikaronStore.store(`video-performance:${videoId}`, {
      videoId: performance.videoId,
      views: performance.views,
      watchTime: performance.watchTime,
      engagementRate: performance.engagementRate,
      ctr: performance.ctr,
      revenue: performance.revenue,
      retentionCurve: performance.retentionCurve,
      publishedAt: performance.publishedAt.toISOString(),
    });
  }
}
