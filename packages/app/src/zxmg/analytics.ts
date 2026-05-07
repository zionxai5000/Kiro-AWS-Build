/**
 * ZXMG Media Production — Analytics
 *
 * Tracks content performance metrics (views, engagement, revenue) via
 * platform drivers, stores in Zikaron for pattern analysis.
 *
 * Requirements: 12.3, 12.4
 */

import type { DriverResult } from '@seraphim/core';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { ContentPlatform, PlatformDriver } from './pipeline.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentPerformanceMetrics {
  contentId: string;
  platform: ContentPlatform;
  views: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  clickThroughRate: number;
  impressions: number;
  subscribersGained: number;
  estimatedRevenue: number;
  collectedAt: string;
}

export interface ContentPerformanceTrend {
  contentId: string;
  platform: ContentPlatform;
  dataPoints: ContentPerformanceMetrics[];
  trend: 'growing' | 'stable' | 'declining';
  peakViews: number;
  totalViews: number;
  totalRevenue: number;
  analyzedAt: string;
}

export interface ChannelAnalytics {
  platform: ContentPlatform;
  totalSubscribers: number;
  totalViews: number;
  totalRevenue: number;
  topContent: { contentId: string; views: number }[];
  averageEngagementRate: number;
  collectedAt: string;
}

// ---------------------------------------------------------------------------
// Analytics Tracker
// ---------------------------------------------------------------------------

export class ContentAnalyticsTracker {
  constructor(
    private readonly platformDrivers: Map<ContentPlatform, PlatformDriver>,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Collect performance metrics for a specific piece of content.
   */
  async collectMetrics(
    contentId: string,
    platform: ContentPlatform,
  ): Promise<ContentPerformanceMetrics> {
    const driver = this.platformDrivers.get(platform);
    if (!driver) {
      return this.emptyMetrics(contentId, platform);
    }

    const result = await driver.execute({
      type: 'getAnalytics',
      params: { videoId: contentId },
    });

    if (!result.success) {
      return this.emptyMetrics(contentId, platform);
    }

    const data = (result.data ?? {}) as Record<string, unknown>;
    const metrics: ContentPerformanceMetrics = {
      contentId,
      platform,
      views: (data.views as number) ?? 0,
      likes: (data.likes as number) ?? 0,
      dislikes: (data.dislikes as number) ?? 0,
      comments: (data.comments as number) ?? 0,
      shares: (data.shares as number) ?? 0,
      watchTimeMinutes: (data.watchTimeMinutes as number) ?? 0,
      averageViewDurationSeconds: (data.averageViewDurationSeconds as number) ?? 0,
      clickThroughRate: (data.clickThroughRate as number) ?? 0,
      impressions: (data.impressions as number) ?? 0,
      subscribersGained: (data.subscribersGained as number) ?? 0,
      estimatedRevenue: (data.estimatedRevenue as number) ?? 0,
      collectedAt: new Date().toISOString(),
    };

    // Store metrics in Zikaron
    await this.storeMetrics(metrics);

    return metrics;
  }

  /**
   * Analyze performance trend for a piece of content over time.
   */
  analyzeTrend(dataPoints: ContentPerformanceMetrics[]): ContentPerformanceTrend {
    if (dataPoints.length === 0) {
      return {
        contentId: '',
        platform: 'youtube',
        dataPoints: [],
        trend: 'stable',
        peakViews: 0,
        totalViews: 0,
        totalRevenue: 0,
        analyzedAt: new Date().toISOString(),
      };
    }

    const contentId = dataPoints[0].contentId;
    const platform = dataPoints[0].platform;
    const totalViews = dataPoints.reduce((sum, dp) => sum + dp.views, 0);
    const totalRevenue = dataPoints.reduce((sum, dp) => sum + dp.estimatedRevenue, 0);
    const peakViews = Math.max(...dataPoints.map((dp) => dp.views));

    // Determine trend by comparing first half to second half
    const midpoint = Math.floor(dataPoints.length / 2);
    const firstHalfViews = dataPoints.slice(0, midpoint).reduce((sum, dp) => sum + dp.views, 0);
    const secondHalfViews = dataPoints.slice(midpoint).reduce((sum, dp) => sum + dp.views, 0);

    let trend: 'growing' | 'stable' | 'declining';
    if (dataPoints.length < 2) {
      trend = 'stable';
    } else if (secondHalfViews > firstHalfViews * 1.1) {
      trend = 'growing';
    } else if (secondHalfViews < firstHalfViews * 0.9) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    return {
      contentId,
      platform,
      dataPoints,
      trend,
      peakViews,
      totalViews,
      totalRevenue,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Collect channel-level analytics for a platform.
   */
  async collectChannelAnalytics(platform: ContentPlatform): Promise<ChannelAnalytics> {
    const driver = this.platformDrivers.get(platform);
    if (!driver) {
      return {
        platform,
        totalSubscribers: 0,
        totalViews: 0,
        totalRevenue: 0,
        topContent: [],
        averageEngagementRate: 0,
        collectedAt: new Date().toISOString(),
      };
    }

    const result = await driver.execute({
      type: 'getChannelAnalytics',
      params: {},
    });

    const data = (result.data ?? {}) as Record<string, unknown>;

    return {
      platform,
      totalSubscribers: (data.subscribers as number) ?? 0,
      totalViews: (data.totalViews as number) ?? 0,
      totalRevenue: (data.totalRevenue as number) ?? 0,
      topContent: ((data.topContent as { contentId: string; views: number }[]) ?? []),
      averageEngagementRate: (data.engagementRate as number) ?? 0,
      collectedAt: new Date().toISOString(),
    };
  }

  /**
   * Store metrics in Zikaron for pattern analysis.
   */
  private async storeMetrics(metrics: ContentPerformanceMetrics): Promise<void> {
    await this.zikaronService.storeEpisodic({
      id: `content-metrics-${metrics.contentId}-${Date.now()}`,
      tenantId: 'system',
      layer: 'episodic',
      content: `Content ${metrics.contentId} on ${metrics.platform}: ${metrics.views} views, ${metrics.likes} likes, $${metrics.estimatedRevenue.toFixed(2)} revenue`,
      embedding: [],
      sourceAgentId: 'zxmg-media-production',
      tags: ['content-metrics', metrics.platform],
      createdAt: new Date(),
      eventType: 'content_performance',
      participants: ['zxmg-media-production'],
      outcome: 'success',
      relatedEntities: [{ entityId: metrics.contentId, entityType: 'content', role: 'target' }],
    });
  }

  /**
   * Return empty metrics when driver is unavailable.
   */
  private emptyMetrics(contentId: string, platform: ContentPlatform): ContentPerformanceMetrics {
    return {
      contentId,
      platform,
      views: 0,
      likes: 0,
      dislikes: 0,
      comments: 0,
      shares: 0,
      watchTimeMinutes: 0,
      averageViewDurationSeconds: 0,
      clickThroughRate: 0,
      impressions: 0,
      subscribersGained: 0,
      estimatedRevenue: 0,
      collectedAt: new Date().toISOString(),
    };
  }
}
