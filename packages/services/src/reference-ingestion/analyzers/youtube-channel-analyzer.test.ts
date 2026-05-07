/**
 * Unit tests for YouTube Channel Analyzer.
 *
 * Requirements: 34c.13, 34c.14, 34c.15, 34c.16, 34c.17, 34c.18, 34c.19, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { OtzarService } from '@seraphim/core';
import type { DriverResult } from '@seraphim/core/types/driver.js';
import type { ChannelReferenceReport } from '../types.js';

/** YouTube driver interface (from @seraphim/drivers) */
interface YouTubeDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

import { YouTubeChannelAnalyzerImpl, YouTubeChannelAnalysisError } from './youtube-channel-analyzer.js';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

function createMockYouTubeDriver(overrides: Partial<Record<string, unknown>> = {}): YouTubeDriver {
  const mockDriver = {
    name: 'youtube',
    version: '1.0.0',
    status: 'ready',
    execute: vi.fn().mockImplementation(async (operation: { type: string; params: Record<string, unknown> }) => {
      switch (operation.type) {
        case 'getChannelInfo':
          return createChannelInfoResult();
        case 'getChannelVideos':
          return createChannelVideosResult();
        case 'getVideoTranscript':
          return createVideoTranscriptResult(operation.params.videoId as string);
        case 'getVideoAnalytics':
          return createVideoAnalyticsResult();
        default:
          return {
            success: false,
            error: { code: 'YT_UNSUPPORTED_OPERATION', message: 'Unsupported operation', retryable: false },
            retryable: false,
            operationId: 'op-err',
          } satisfies DriverResult;
      }
    }),
    connect: vi.fn().mockResolvedValue({ success: true, status: 'ready' }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, status: 'ready' }),
    verify: vi.fn().mockResolvedValue({ verified: true, operationId: 'op-1' }),
    getRetryPolicy: vi.fn().mockReturnValue({ maxAttempts: 3, initialDelayMs: 2000, maxDelayMs: 16000, backoffMultiplier: 2 }),
    getCircuitBreakerState: vi.fn().mockReturnValue('closed'),
    getCircuitBreakerFailureCount: vi.fn().mockReturnValue(0),
    getUploadSession: vi.fn().mockReturnValue(undefined),
    resumeUploadSession: vi.fn().mockReturnValue({ success: false, error: 'Not found' }),
    cancelUploadSession: vi.fn().mockReturnValue(false),
    ...overrides,
  };

  return mockDriver as unknown as YouTubeDriver;
}

function createChannelInfoResult(): DriverResult {
  return {
    success: true,
    data: {
      channelId: 'UC_test_channel_123',
      title: 'TestCreator',
      subscriberCount: 500000,
      totalVideos: 200,
      totalViews: 50000000,
      createdAt: '2020-01-15T00:00:00Z',
    },
    retryable: false,
    operationId: 'op-channel-info',
  };
}

function createChannelVideosResult(): DriverResult {
  return {
    success: true,
    data: {
      videos: generateMockVideos(25),
    },
    retryable: false,
    operationId: 'op-channel-videos',
  };
}

function generateMockVideos(count: number): Array<Record<string, unknown>> {
  const videos = [];
  const baseDate = new Date('2024-01-01T00:00:00Z');

  for (let i = 0; i < count; i++) {
    const publishDate = new Date(baseDate.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const views = Math.floor(10000 + Math.random() * 990000);
    videos.push({
      videoId: `video-${i}`,
      title: i % 3 === 0
        ? `How to Master ${i} Amazing Techniques?`
        : i % 3 === 1
          ? `The Secret Nobody Tells You About Topic ${i}`
          : `${i * 10} Things That Will Shock You`,
      duration: 300 + i * 60,
      views,
      likes: Math.floor(views * 0.04),
      comments: Math.floor(views * 0.01),
      publishedAt: publishDate.toISOString(),
      thumbnailUrl: `https://i.ytimg.com/vi/video-${i}/maxresdefault.jpg`,
    });
  }
  return videos;
}

function createVideoTranscriptResult(videoId: string): DriverResult {
  const videoIndex = parseInt(videoId.replace('video-', ''), 10);
  let hookText: string;

  if (videoIndex % 3 === 0) {
    hookText = 'Have you ever wondered what if you could master this?';
  } else if (videoIndex % 3 === 1) {
    hookText = 'Nobody tells you the secret truth about this topic';
  } else {
    hookText = 'Today I want to share a story about what happened last week';
  }

  return {
    success: true,
    data: {
      segments: [
        { text: hookText, startTime: 0, endTime: 4 },
        { text: 'Let me explain what I mean by that.', startTime: 5, endTime: 8 },
        { text: 'First, we need to understand the basics.', startTime: 9, endTime: 12 },
        { text: 'This is where it gets interesting.', startTime: 14, endTime: 17 },
        { text: 'Now pay attention to this next part.', startTime: 19, endTime: 22 },
        { text: 'And that brings us to the conclusion.', startTime: 25, endTime: 28 },
      ],
    },
    retryable: false,
    operationId: `op-transcript-${videoId}`,
  };
}

function createVideoAnalyticsResult(): DriverResult {
  return {
    success: true,
    data: {
      retentionCurve: [100, 85, 72, 65, 58, 52, 48, 45, 42, 40],
      avgViewDuration: 180,
      clickThroughRate: 0.08,
    },
    retryable: false,
    operationId: 'op-analytics',
  };
}

function createMockOtzarService(): OtzarService {
  return {
    routeTask: vi.fn().mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      estimatedCost: 0.01,
      rationale: 'Best for analysis tasks',
    }),
    checkBudget: vi.fn().mockResolvedValue({ allowed: true, remainingDaily: 50, remainingMonthly: 500 }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getCostReport: vi.fn().mockResolvedValue({ totalCostUsd: 5, byAgent: {}, byPillar: {}, byModel: {}, period: { start: new Date(), end: new Date() } }),
    getDailyOptimizationReport: vi.fn().mockResolvedValue({ date: new Date(), totalSpend: 5, wastePatterns: [], savingsOpportunities: [], estimatedSavings: 0 }),
    checkCache: vi.fn().mockResolvedValue(null),
    storeCache: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('YouTubeChannelAnalyzerImpl', () => {
  let youtubeDriver: YouTubeDriver;
  let otzarService: OtzarService;
  let analyzer: YouTubeChannelAnalyzerImpl;

  beforeEach(() => {
    youtubeDriver = createMockYouTubeDriver();
    otzarService = createMockOtzarService();
    analyzer = new YouTubeChannelAnalyzerImpl(youtubeDriver, otzarService);
  });

  // -------------------------------------------------------------------------
  // Channel Metrics Extraction
  // -------------------------------------------------------------------------

  describe('channel metrics extraction from YouTube API responses', () => {
    it('extracts subscriber count from channel info', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(report.channelMetrics.subscriberCount).toBe(500000);
    });

    it('extracts total video count from channel info', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(report.channelMetrics.totalVideos).toBe(200);
    });

    it('computes upload frequency from video publish dates', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(report.channelMetrics.uploadFrequency).toBeGreaterThan(0);
      expect(typeof report.channelMetrics.uploadFrequency).toBe('number');
    });

    it('computes average views per video', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(report.channelMetrics.avgViewsPerVideo).toBeGreaterThan(0);
      expect(typeof report.channelMetrics.avgViewsPerVideo).toBe('number');
    });

    it('computes engagement rate from likes and comments', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(report.channelMetrics.engagementRate).toBeGreaterThan(0);
      expect(report.channelMetrics.engagementRate).toBeLessThan(1);
    });

    it('assesses growth trajectory', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(report.channelMetrics.growthTrajectory).toBeTruthy();
      expect(typeof report.channelMetrics.growthTrajectory).toBe('string');
    });

    it('handles @username URL format', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/@TestCreator');

      expect(report.channelMetrics.subscriberCount).toBe(500000);
    });
  });

  // -------------------------------------------------------------------------
  // Video Selection Logic
  // -------------------------------------------------------------------------

  describe('video selection logic (10-20 videos, mix of top-performing and recent)', () => {
    it('selects between 10 and 20 videos from a larger set', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(report.videoBreakdowns.length).toBeGreaterThanOrEqual(10);
      expect(report.videoBreakdowns.length).toBeLessThanOrEqual(20);
    });

    it('includes highest-performing videos by view count', () => {
      const videos = generateMockVideos(25).map((v) => ({
        videoId: String(v.videoId),
        title: String(v.title),
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        duration: Number(v.duration),
        views: Number(v.views),
        likes: Number(v.likes),
        comments: Number(v.comments),
        publishedAt: String(v.publishedAt),
        thumbnailUrl: String(v.thumbnailUrl),
      }));

      const selected = analyzer.selectVideosForAnalysis(videos);

      // The top performer by views should be included
      const topByViews = [...videos].sort((a, b) => b.views - a.views)[0];
      expect(selected.some(v => v.videoId === topByViews.videoId)).toBe(true);
    });

    it('includes most recent videos by publish date', () => {
      const videos = generateMockVideos(25).map((v) => ({
        videoId: String(v.videoId),
        title: String(v.title),
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        duration: Number(v.duration),
        views: Number(v.views),
        likes: Number(v.likes),
        comments: Number(v.comments),
        publishedAt: String(v.publishedAt),
        thumbnailUrl: String(v.thumbnailUrl),
      }));

      const selected = analyzer.selectVideosForAnalysis(videos);

      // The most recent video should be included
      const mostRecent = [...videos].sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      )[0];
      expect(selected.some(v => v.videoId === mostRecent.videoId)).toBe(true);
    });

    it('returns all videos when fewer than 10 are available', () => {
      const videos = generateMockVideos(5).map((v) => ({
        videoId: String(v.videoId),
        title: String(v.title),
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        duration: Number(v.duration),
        views: Number(v.views),
        likes: Number(v.likes),
        comments: Number(v.comments),
        publishedAt: String(v.publishedAt),
        thumbnailUrl: String(v.thumbnailUrl),
      }));

      const selected = analyzer.selectVideosForAnalysis(videos);

      expect(selected.length).toBe(5);
    });

    it('deduplicates videos that are both top-performing and recent', () => {
      const videos = generateMockVideos(25).map((v) => ({
        videoId: String(v.videoId),
        title: String(v.title),
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        duration: Number(v.duration),
        views: Number(v.views),
        likes: Number(v.likes),
        comments: Number(v.comments),
        publishedAt: String(v.publishedAt),
        thumbnailUrl: String(v.thumbnailUrl),
      }));

      const selected = analyzer.selectVideosForAnalysis(videos);

      // No duplicates
      const ids = selected.map(v => v.videoId);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  // -------------------------------------------------------------------------
  // Per-Video Analysis
  // -------------------------------------------------------------------------

  describe('per-video analysis extracts all required dimensions', () => {
    it('extracts hook structure from transcript first 5 seconds', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      for (const breakdown of report.videoBreakdowns) {
        expect(breakdown.hookStructure).toBeTruthy();
        expect(typeof breakdown.hookStructure).toBe('string');
      }
    });

    it('classifies hook types correctly (question, bold-claim, story)', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      const hookTypes = report.videoBreakdowns.map(b => b.hookStructure);
      // Our mock data produces question, bold-claim, and story hooks
      expect(hookTypes).toContain('question');
      expect(hookTypes).toContain('bold-claim');
      expect(hookTypes).toContain('story');
    });

    it('computes editing pace (cuts per minute) from transcript timing', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      for (const breakdown of report.videoBreakdowns) {
        expect(typeof breakdown.editingPace).toBe('number');
        expect(breakdown.editingPace).toBeGreaterThanOrEqual(0);
      }
    });

    it('analyzes thumbnail composition via LLM vision routing', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      for (const breakdown of report.videoBreakdowns) {
        expect(Array.isArray(breakdown.thumbnailComposition)).toBe(true);
        expect(breakdown.thumbnailComposition.length).toBeGreaterThan(0);
      }
    });

    it('includes video duration in breakdown', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      for (const breakdown of report.videoBreakdowns) {
        expect(typeof breakdown.duration).toBe('number');
        expect(breakdown.duration).toBeGreaterThan(0);
      }
    });

    it('includes video title and URL in breakdown', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      for (const breakdown of report.videoBreakdowns) {
        expect(breakdown.title).toBeTruthy();
        expect(breakdown.url).toContain('youtube.com/watch?v=');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Production Quality Assessment
  // -------------------------------------------------------------------------

  describe('production quality assessment produces valid classifications', () => {
    it('editing pace is a non-negative number', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      for (const breakdown of report.videoBreakdowns) {
        expect(breakdown.editingPace).toBeGreaterThanOrEqual(0);
      }
    });

    it('thumbnail composition contains recognized patterns', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      const validPatterns = [
        'face-present', 'text-overlay', 'high-contrast',
        'exaggerated-expression', 'neutral-expression', 'arrow-annotation',
        'no-thumbnail',
      ];

      for (const breakdown of report.videoBreakdowns) {
        for (const pattern of breakdown.thumbnailComposition) {
          expect(validPatterns).toContain(pattern);
        }
      }
    });

    it('uses Otzar for vision analysis routing', async () => {
      await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(otzarService.routeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'analysis',
          agentId: 'youtube-channel-analyzer',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Production Formula Synthesis
  // -------------------------------------------------------------------------

  describe('Production_Formula synthesis identifies common patterns across videos', () => {
    it('identifies common hook patterns across videos', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(Array.isArray(report.productionFormula.commonHookPatterns)).toBe(true);
      expect(report.productionFormula.commonHookPatterns.length).toBeGreaterThan(0);
    });

    it('computes optimal video length range', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(typeof report.productionFormula.optimalLengthRange.min).toBe('number');
      expect(typeof report.productionFormula.optimalLengthRange.max).toBe('number');
      expect(report.productionFormula.optimalLengthRange.max).toBeGreaterThanOrEqual(
        report.productionFormula.optimalLengthRange.min,
      );
    });

    it('extracts thumbnail composition rules from common patterns', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(Array.isArray(report.productionFormula.thumbnailRules)).toBe(true);
      expect(report.productionFormula.thumbnailRules.length).toBeGreaterThan(0);
    });

    it('identifies title construction patterns', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(Array.isArray(report.productionFormula.titlePatterns)).toBe(true);
      expect(report.productionFormula.titlePatterns.length).toBeGreaterThan(0);
    });

    it('determines pacing rhythm classification', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(report.productionFormula.pacingRhythm).toBeTruthy();
      const validRhythms = ['rapid-fire', 'fast-paced', 'moderate', 'slow-deliberate', 'minimal-editing', 'unknown'];
      expect(validRhythms).toContain(report.productionFormula.pacingRhythm);
    });

    it('identifies engagement triggers', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(Array.isArray(report.productionFormula.engagementTriggers)).toBe(true);
      expect(report.productionFormula.engagementTriggers.length).toBeGreaterThan(0);
    });

    it('uses Otzar for production formula synthesis routing', async () => {
      await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(otzarService.routeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'analysis',
          complexity: 'high',
          agentId: 'youtube-channel-analyzer',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Failure Handling
  // -------------------------------------------------------------------------

  describe('failure handling for private/deleted channels', () => {
    it('throws YouTubeChannelAnalysisError with channel_private reason', async () => {
      const failDriver = createMockYouTubeDriver();
      (failDriver.execute as ReturnType<typeof vi.fn>).mockImplementation(async (op: { type: string }) => {
        if (op.type === 'getChannelInfo') {
          return {
            success: false,
            error: { code: 'YT_FORBIDDEN', message: 'Channel is private', retryable: false },
            retryable: false,
            operationId: 'op-fail',
          };
        }
        return { success: true, data: {}, retryable: false, operationId: 'op-x' };
      });

      const failAnalyzer = new YouTubeChannelAnalyzerImpl(failDriver, otzarService);

      await expect(
        failAnalyzer.analyze('https://www.youtube.com/channel/UC_private_123'),
      ).rejects.toThrow(YouTubeChannelAnalysisError);

      try {
        await failAnalyzer.analyze('https://www.youtube.com/channel/UC_private_123');
      } catch (err) {
        const error = err as YouTubeChannelAnalysisError;
        expect(error.reason).toBe('channel_private');
        expect(error.suggestions).toBeDefined();
        expect(error.suggestions!.length).toBeGreaterThan(0);
      }
    });

    it('throws YouTubeChannelAnalysisError with channel_deleted reason', async () => {
      const failDriver = createMockYouTubeDriver();
      (failDriver.execute as ReturnType<typeof vi.fn>).mockImplementation(async (op: { type: string }) => {
        if (op.type === 'getChannelInfo') {
          return {
            success: false,
            error: { code: 'YT_NOT_FOUND', message: 'Channel has been deleted or terminated', retryable: false },
            retryable: false,
            operationId: 'op-fail',
          };
        }
        return { success: true, data: {}, retryable: false, operationId: 'op-x' };
      });

      const failAnalyzer = new YouTubeChannelAnalyzerImpl(failDriver, otzarService);

      await expect(
        failAnalyzer.analyze('https://www.youtube.com/channel/UC_deleted_123'),
      ).rejects.toThrow(YouTubeChannelAnalysisError);

      try {
        await failAnalyzer.analyze('https://www.youtube.com/channel/UC_deleted_123');
      } catch (err) {
        const error = err as YouTubeChannelAnalysisError;
        expect(error.reason).toBe('channel_deleted');
        expect(error.suggestions).toBeDefined();
        expect(error.suggestions!.length).toBeGreaterThan(0);
      }
    });

    it('throws YouTubeChannelAnalysisError with channel_not_found for invalid URLs', async () => {
      const failAnalyzer = new YouTubeChannelAnalyzerImpl(youtubeDriver, otzarService);

      await expect(
        failAnalyzer.analyze('https://www.youtube.com/invalid-path'),
      ).rejects.toThrow(YouTubeChannelAnalysisError);

      try {
        await failAnalyzer.analyze('https://www.youtube.com/invalid-path');
      } catch (err) {
        const error = err as YouTubeChannelAnalysisError;
        expect(error.reason).toBe('channel_not_found');
      }
    });

    it('throws YouTubeChannelAnalysisError with api_failed for generic API errors', async () => {
      const failDriver = createMockYouTubeDriver();
      (failDriver.execute as ReturnType<typeof vi.fn>).mockImplementation(async (op: { type: string }) => {
        if (op.type === 'getChannelInfo') {
          return {
            success: false,
            error: { code: 'YT_RATE_LIMITED', message: 'API rate limit exceeded', retryable: true },
            retryable: true,
            operationId: 'op-fail',
          };
        }
        return { success: true, data: {}, retryable: false, operationId: 'op-x' };
      });

      const failAnalyzer = new YouTubeChannelAnalyzerImpl(failDriver, otzarService);

      await expect(
        failAnalyzer.analyze('https://www.youtube.com/channel/UC_test_123'),
      ).rejects.toThrow(YouTubeChannelAnalysisError);

      try {
        await failAnalyzer.analyze('https://www.youtube.com/channel/UC_test_123');
      } catch (err) {
        const error = err as YouTubeChannelAnalysisError;
        expect(error.reason).toBe('api_failed');
      }
    });

    it('includes specific reason message in error', async () => {
      const failDriver = createMockYouTubeDriver();
      (failDriver.execute as ReturnType<typeof vi.fn>).mockImplementation(async (op: { type: string }) => {
        if (op.type === 'getChannelInfo') {
          return {
            success: false,
            error: { code: 'YT_FORBIDDEN', message: 'Channel is private and cannot be accessed', retryable: false },
            retryable: false,
            operationId: 'op-fail',
          };
        }
        return { success: true, data: {}, retryable: false, operationId: 'op-x' };
      });

      const failAnalyzer = new YouTubeChannelAnalyzerImpl(failDriver, otzarService);

      try {
        await failAnalyzer.analyze('https://www.youtube.com/channel/UC_private_123');
      } catch (err) {
        const error = err as YouTubeChannelAnalysisError;
        expect(error.message).toContain('private');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Output Structure Conformance
  // -------------------------------------------------------------------------

  describe('output conforms to Channel_Reference_Report structure', () => {
    it('includes all required top-level fields', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(report.url).toBe('https://www.youtube.com/channel/UC_test_channel_123');
      expect(report.type).toBe('youtube-channel');
      expect(report.analyzedAt).toBeInstanceOf(Date);
      expect(report.channelMetrics).toBeDefined();
      expect(report.videoBreakdowns).toBeDefined();
      expect(report.productionFormula).toBeDefined();
    });

    it('channelMetrics has all required fields', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(typeof report.channelMetrics.subscriberCount).toBe('number');
      expect(typeof report.channelMetrics.totalVideos).toBe('number');
      expect(typeof report.channelMetrics.uploadFrequency).toBe('number');
      expect(typeof report.channelMetrics.avgViewsPerVideo).toBe('number');
      expect(typeof report.channelMetrics.engagementRate).toBe('number');
      expect(typeof report.channelMetrics.growthTrajectory).toBe('string');
    });

    it('videoBreakdowns is an array with per-video data', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(Array.isArray(report.videoBreakdowns)).toBe(true);
      expect(report.videoBreakdowns.length).toBeGreaterThan(0);

      for (const breakdown of report.videoBreakdowns) {
        expect(typeof breakdown.title).toBe('string');
        expect(typeof breakdown.url).toBe('string');
        expect(typeof breakdown.duration).toBe('number');
        expect(typeof breakdown.views).toBe('number');
        expect(typeof breakdown.hookStructure).toBe('string');
        expect(typeof breakdown.editingPace).toBe('number');
        expect(Array.isArray(breakdown.thumbnailComposition)).toBe(true);
      }
    });

    it('productionFormula has all required fields', async () => {
      const report = await analyzer.analyze('https://www.youtube.com/channel/UC_test_channel_123');

      expect(Array.isArray(report.productionFormula.commonHookPatterns)).toBe(true);
      expect(typeof report.productionFormula.optimalLengthRange.min).toBe('number');
      expect(typeof report.productionFormula.optimalLengthRange.max).toBe('number');
      expect(Array.isArray(report.productionFormula.thumbnailRules)).toBe(true);
      expect(Array.isArray(report.productionFormula.titlePatterns)).toBe(true);
      expect(typeof report.productionFormula.pacingRhythm).toBe('string');
      expect(Array.isArray(report.productionFormula.engagementTriggers)).toBe(true);
    });

    it('report satisfies ChannelReferenceReport type', async () => {
      const report: ChannelReferenceReport = await analyzer.analyze(
        'https://www.youtube.com/channel/UC_test_channel_123',
      );

      // TypeScript compilation validates the type; runtime check for completeness
      expect(report).toBeDefined();
      expect(report.type).toBe('youtube-channel');
    });
  });
});
