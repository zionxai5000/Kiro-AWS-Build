/**
 * Unit tests for ZXMG Video Development Studio — Platform Distribution Engine
 *
 * Validates: Requirements 44c.17, 44c.18, 44c.19, 44c.20
 *
 * Tests multi-platform publishing, scheduling, optimal timing, content
 * repurposing, and platform configuration retrieval.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultPlatformDistributionEngine,
  type PlatformDistributionEngine,
  type PlatformPublisher,
  type ScheduleStore,
  type AudienceAnalyzer,
  type VideoRepurposer,
  type PublishRequest,
  type PublishResult,
  type DistributionPlatform,
} from '../distribution-engine.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockPublishRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    videoUrl: 'https://cdn.example.com/video-123.mp4',
    channelId: 'ch-1',
    platforms: ['youtube', 'tiktok', 'instagram'],
    metadata: {
      title: 'Amazing Tech Review',
      description: 'In-depth review of the latest gadget',
      tags: ['tech', 'review', 'gadget'],
    },
    thumbnailUrl: 'https://cdn.example.com/thumb-123.jpg',
    ...overrides,
  };
}

function createMockPublisher(): PlatformPublisher {
  return {
    publish: vi.fn(async (platform: DistributionPlatform) => ({
      platform,
      success: true,
      publishedUrl: `https://${platform}.com/video/abc123`,
    })),
  };
}

function createMockScheduleStore(): ScheduleStore {
  const entries = new Map<string, { scheduledId: string; request: PublishRequest; scheduledAt: Date }>();
  return {
    save: vi.fn(async (entry) => {
      entries.set(entry.scheduledId, entry);
    }),
    get: vi.fn(async (id) => entries.get(id) ?? null),
  };
}

function createMockAudienceAnalyzer(): AudienceAnalyzer {
  return {
    getOptimalPostTime: vi.fn().mockResolvedValue(new Date('2024-06-15T14:00:00Z')),
  };
}

function createMockRepurposer(): VideoRepurposer {
  return {
    repurpose: vi.fn(async (_videoUrl, _from, toFormat) =>
      `https://cdn.example.com/repurposed-${toFormat}.mp4`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultPlatformDistributionEngine', () => {
  let engine: PlatformDistributionEngine;
  let publisher: ReturnType<typeof createMockPublisher>;
  let scheduleStore: ReturnType<typeof createMockScheduleStore>;
  let audienceAnalyzer: ReturnType<typeof createMockAudienceAnalyzer>;
  let repurposer: ReturnType<typeof createMockRepurposer>;

  beforeEach(() => {
    publisher = createMockPublisher();
    scheduleStore = createMockScheduleStore();
    audienceAnalyzer = createMockAudienceAnalyzer();
    repurposer = createMockRepurposer();
    engine = new DefaultPlatformDistributionEngine(
      publisher,
      scheduleStore,
      audienceAnalyzer,
      repurposer,
    );
  });

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  describe('publish', () => {
    it('publishes to all specified platforms', async () => {
      const request = createMockPublishRequest({
        platforms: ['youtube', 'tiktok', 'instagram'],
      });

      const results = await engine.publish(request);

      expect(results.length).toBe(3);
      expect(publisher.publish).toHaveBeenCalledTimes(3);

      for (const result of results) {
        expect(result.success).toBe(true);
        expect(result.publishedUrl).toBeTruthy();
      }
    });

    it('returns results for each platform including failures', async () => {
      (publisher.publish as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ platform: 'youtube', success: true, publishedUrl: 'https://youtube.com/v/1' })
        .mockRejectedValueOnce(new Error('TikTok API rate limited'))
        .mockResolvedValueOnce({ platform: 'instagram', success: true, publishedUrl: 'https://instagram.com/p/1' });

      const request = createMockPublishRequest({
        platforms: ['youtube', 'tiktok', 'instagram'],
      });

      const results = await engine.publish(request);

      expect(results.length).toBe(3);

      const ytResult = results.find((r) => r.platform === 'youtube');
      expect(ytResult?.success).toBe(true);

      const ttResult = results.find((r) => r.platform === 'tiktok');
      expect(ttResult?.success).toBe(false);
      expect(ttResult?.error).toBe('TikTok API rate limited');

      const igResult = results.find((r) => r.platform === 'instagram');
      expect(igResult?.success).toBe(true);
    });

    it('passes metadata and thumbnail to publisher', async () => {
      const request = createMockPublishRequest();

      await engine.publish(request);

      expect(publisher.publish).toHaveBeenCalledWith(
        'youtube',
        request.videoUrl,
        request.metadata,
        request.thumbnailUrl,
      );
    });

    it('handles single platform publish', async () => {
      const request = createMockPublishRequest({ platforms: ['youtube'] });

      const results = await engine.publish(request);

      expect(results.length).toBe(1);
      expect(results[0].platform).toBe('youtube');
      expect(results[0].success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------------

  describe('schedule', () => {
    it('schedules a publish request with provided time', async () => {
      const scheduledAt = new Date('2024-07-01T10:00:00Z');
      const request = createMockPublishRequest({ scheduledAt });

      const result = await engine.schedule(request);

      expect(result.scheduledId).toBeTruthy();
      expect(result.scheduledId).toMatch(/^sched-/);
      expect(result.scheduledAt).toEqual(scheduledAt);
      expect(scheduleStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledId: result.scheduledId,
          scheduledAt,
        }),
      );
    });

    it('uses optimal time when no scheduledAt provided', async () => {
      const request = createMockPublishRequest({ scheduledAt: undefined });

      const result = await engine.schedule(request);

      expect(result.scheduledAt).toEqual(new Date('2024-06-15T14:00:00Z'));
      expect(audienceAnalyzer.getOptimalPostTime).toHaveBeenCalledWith('ch-1', 'youtube');
    });

    it('generates unique schedule IDs', async () => {
      const request = createMockPublishRequest();

      const result1 = await engine.schedule(request);
      const result2 = await engine.schedule(request);

      expect(result1.scheduledId).not.toBe(result2.scheduledId);
    });
  });

  // -------------------------------------------------------------------------
  // Optimal Schedule
  // -------------------------------------------------------------------------

  describe('getOptimalSchedule', () => {
    it('returns optimal posting time for channel and platform', async () => {
      const optimalTime = await engine.getOptimalSchedule('ch-1', 'youtube');

      expect(optimalTime).toBeInstanceOf(Date);
      expect(optimalTime).toEqual(new Date('2024-06-15T14:00:00Z'));
      expect(audienceAnalyzer.getOptimalPostTime).toHaveBeenCalledWith('ch-1', 'youtube');
    });

    it('queries different platforms independently', async () => {
      (audienceAnalyzer.getOptimalPostTime as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(new Date('2024-06-15T14:00:00Z'))
        .mockResolvedValueOnce(new Date('2024-06-15T18:00:00Z'));

      const ytTime = await engine.getOptimalSchedule('ch-1', 'youtube');
      const ttTime = await engine.getOptimalSchedule('ch-1', 'tiktok');

      expect(ytTime).not.toEqual(ttTime);
      expect(audienceAnalyzer.getOptimalPostTime).toHaveBeenCalledWith('ch-1', 'youtube');
      expect(audienceAnalyzer.getOptimalPostTime).toHaveBeenCalledWith('ch-1', 'tiktok');
    });
  });

  // -------------------------------------------------------------------------
  // Repurposing
  // -------------------------------------------------------------------------

  describe('repurpose', () => {
    it('repurposes long-form to multiple short formats', async () => {
      const results = await engine.repurpose(
        'https://cdn.example.com/longform.mp4',
        'youtube-long',
        ['tiktok-short', 'instagram-reel', 'x-clip'],
      );

      expect(results.length).toBe(3);
      expect(results[0].format).toBe('tiktok-short');
      expect(results[0].videoUrl).toContain('tiktok-short');
      expect(results[1].format).toBe('instagram-reel');
      expect(results[2].format).toBe('x-clip');
    });

    it('calls repurposer for each target format', async () => {
      await engine.repurpose(
        'https://cdn.example.com/video.mp4',
        'long-form',
        ['short-a', 'short-b'],
      );

      expect(repurposer.repurpose).toHaveBeenCalledTimes(2);
      expect(repurposer.repurpose).toHaveBeenCalledWith(
        'https://cdn.example.com/video.mp4',
        'long-form',
        'short-a',
      );
      expect(repurposer.repurpose).toHaveBeenCalledWith(
        'https://cdn.example.com/video.mp4',
        'long-form',
        'short-b',
      );
    });

    it('returns empty array for empty target formats', async () => {
      const results = await engine.repurpose(
        'https://cdn.example.com/video.mp4',
        'long-form',
        [],
      );

      expect(results).toEqual([]);
      expect(repurposer.repurpose).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Platform Configs
  // -------------------------------------------------------------------------

  describe('getPlatformConfigs', () => {
    it('returns configs for all supported platforms', async () => {
      const configs = engine.getPlatformConfigs();

      expect(configs.length).toBe(6);

      const platforms = configs.map((c) => c.platform);
      expect(platforms).toContain('youtube');
      expect(platforms).toContain('tiktok');
      expect(platforms).toContain('instagram');
      expect(platforms).toContain('x');
      expect(platforms).toContain('facebook');
      expect(platforms).toContain('rumble');
    });

    it('each config has required fields', async () => {
      const configs = engine.getPlatformConfigs();

      for (const config of configs) {
        expect(config.platform).toBeTruthy();
        expect(config.aspectRatio).toMatch(/^\d+:\d+$/);
        expect(config.maxDuration).toBeGreaterThan(0);
        expect(config.captionFormat).toBeTruthy();
        expect(config.hashtagConvention).toBeTruthy();
      }
    });

    it('returns a copy (not mutable reference)', async () => {
      const configs1 = engine.getPlatformConfigs();
      const configs2 = engine.getPlatformConfigs();

      expect(configs1).not.toBe(configs2);
      expect(configs1).toEqual(configs2);
    });
  });
});
