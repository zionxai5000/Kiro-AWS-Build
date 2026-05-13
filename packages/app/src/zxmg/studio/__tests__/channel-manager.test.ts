/**
 * Unit tests for ZXMG Video Development Studio — Channel Manager
 *
 * Validates: Requirements 44a.1, 44a.2, 44a.3
 *
 * Tests channel CRUD operations, analytics retrieval, health status computation,
 * and alert generation for declining metrics.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultChannelManager,
  type ChannelManager,
  type ChannelStore,
  type AnalyticsProvider,
  type ChannelConfig,
  type ChannelAnalytics,
} from '../channel-manager.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockChannelConfig(overrides: Partial<ChannelConfig> = {}): ChannelConfig {
  return {
    channelId: 'ch-1',
    channelName: 'Tech Reviews',
    niche: 'technology',
    toneOfVoice: 'informative and casual',
    postingCadence: '3x per week',
    targetAudience: 'tech enthusiasts 18-35',
    contentPillars: ['reviews', 'tutorials', 'news'],
    platform: 'youtube',
    youtubeChannelId: 'UC123abc',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createMockAnalytics(overrides: Partial<ChannelAnalytics> = {}): ChannelAnalytics {
  return {
    channelId: 'ch-1',
    subscribers: 50000,
    totalViews: 2000000,
    avgRetention: 55,
    clickThroughRate: 6.5,
    growthRate: 3.2,
    revenue: 4500,
    lastUpdated: new Date('2024-06-01'),
    ...overrides,
  };
}

function createMockStore(): ChannelStore {
  const channels = new Map<string, ChannelConfig>();
  return {
    save: vi.fn(async (config: ChannelConfig) => {
      channels.set(config.channelId, config);
    }),
    get: vi.fn(async (channelId: string) => channels.get(channelId) ?? null),
    delete: vi.fn(async (channelId: string) => {
      channels.delete(channelId);
    }),
    list: vi.fn(async () => Array.from(channels.values())),
  };
}

function createMockAnalyticsProvider(): AnalyticsProvider {
  return {
    fetchAnalytics: vi.fn().mockResolvedValue(createMockAnalytics()),
    fetchHistoricalGrowth: vi.fn().mockResolvedValue([2.0, 2.5, 3.0, 4.0]),
    fetchHistoricalEngagement: vi.fn().mockResolvedValue([5.0, 6.0, 6.5, 7.5]),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultChannelManager', () => {
  let manager: ChannelManager;
  let store: ReturnType<typeof createMockStore>;
  let analyticsProvider: ReturnType<typeof createMockAnalyticsProvider>;

  beforeEach(() => {
    store = createMockStore();
    analyticsProvider = createMockAnalyticsProvider();
    manager = new DefaultChannelManager(store, analyticsProvider);
  });

  // -------------------------------------------------------------------------
  // Channel CRUD
  // -------------------------------------------------------------------------

  describe('createChannel', () => {
    it('creates a channel with generated ID and timestamp', async () => {
      const config = await manager.createChannel({
        channelName: 'Tech Reviews',
        niche: 'technology',
        toneOfVoice: 'informative',
        postingCadence: '3x per week',
        targetAudience: 'tech enthusiasts',
        contentPillars: ['reviews', 'tutorials'],
        platform: 'youtube',
      });

      expect(config.channelId).toBeTruthy();
      expect(config.channelId).toMatch(/^ch-/);
      expect(config.channelName).toBe('Tech Reviews');
      expect(config.niche).toBe('technology');
      expect(config.createdAt).toBeInstanceOf(Date);
      expect(store.save).toHaveBeenCalledWith(config);
    });

    it('generates unique IDs for multiple channels', async () => {
      const ch1 = await manager.createChannel({
        channelName: 'Channel 1',
        niche: 'tech',
        toneOfVoice: 'casual',
        postingCadence: '2x per week',
        targetAudience: 'developers',
        contentPillars: ['coding'],
        platform: 'youtube',
      });

      const ch2 = await manager.createChannel({
        channelName: 'Channel 2',
        niche: 'gaming',
        toneOfVoice: 'energetic',
        postingCadence: 'daily',
        targetAudience: 'gamers',
        contentPillars: ['gameplay'],
        platform: 'youtube',
      });

      expect(ch1.channelId).not.toBe(ch2.channelId);
    });
  });

  describe('getChannel', () => {
    it('returns channel config when found', async () => {
      const created = await manager.createChannel({
        channelName: 'My Channel',
        niche: 'tech',
        toneOfVoice: 'professional',
        postingCadence: '2x per week',
        targetAudience: 'professionals',
        contentPillars: ['insights'],
        platform: 'youtube',
      });

      const retrieved = await manager.getChannel(created.channelId);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.channelName).toBe('My Channel');
      expect(retrieved!.channelId).toBe(created.channelId);
    });

    it('returns null when channel not found', async () => {
      const result = await manager.getChannel('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('updateChannel', () => {
    it('updates channel fields while preserving ID and createdAt', async () => {
      const created = await manager.createChannel({
        channelName: 'Original Name',
        niche: 'tech',
        toneOfVoice: 'casual',
        postingCadence: '2x per week',
        targetAudience: 'developers',
        contentPillars: ['coding'],
        platform: 'youtube',
      });

      const updated = await manager.updateChannel(created.channelId, {
        channelName: 'Updated Name',
        postingCadence: 'daily',
      });

      expect(updated.channelName).toBe('Updated Name');
      expect(updated.postingCadence).toBe('daily');
      expect(updated.channelId).toBe(created.channelId);
      expect(updated.createdAt).toEqual(created.createdAt);
      expect(updated.niche).toBe('tech'); // unchanged field preserved
    });

    it('throws error when channel not found', async () => {
      await expect(
        manager.updateChannel('nonexistent', { channelName: 'New' }),
      ).rejects.toThrow('Channel not found: nonexistent');
    });
  });

  describe('deleteChannel', () => {
    it('removes channel from store', async () => {
      const created = await manager.createChannel({
        channelName: 'To Delete',
        niche: 'tech',
        toneOfVoice: 'casual',
        postingCadence: 'weekly',
        targetAudience: 'everyone',
        contentPillars: ['misc'],
        platform: 'youtube',
      });

      await manager.deleteChannel(created.channelId);

      const result = await manager.getChannel(created.channelId);
      expect(result).toBeNull();
      expect(store.delete).toHaveBeenCalledWith(created.channelId);
    });
  });

  describe('listChannels', () => {
    it('returns all channels', async () => {
      await manager.createChannel({
        channelName: 'Channel A',
        niche: 'tech',
        toneOfVoice: 'casual',
        postingCadence: 'daily',
        targetAudience: 'devs',
        contentPillars: ['code'],
        platform: 'youtube',
      });

      await manager.createChannel({
        channelName: 'Channel B',
        niche: 'gaming',
        toneOfVoice: 'energetic',
        postingCadence: 'daily',
        targetAudience: 'gamers',
        contentPillars: ['gameplay'],
        platform: 'youtube',
      });

      const channels = await manager.listChannels();

      expect(channels.length).toBe(2);
      expect(channels.map((c) => c.channelName)).toContain('Channel A');
      expect(channels.map((c) => c.channelName)).toContain('Channel B');
    });

    it('returns empty array when no channels exist', async () => {
      const channels = await manager.listChannels();

      expect(channels).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  describe('getAnalytics', () => {
    it('returns analytics data from provider', async () => {
      const analytics = await manager.getAnalytics('ch-1');

      expect(analytics.channelId).toBe('ch-1');
      expect(analytics.subscribers).toBe(50000);
      expect(analytics.totalViews).toBe(2000000);
      expect(analytics.avgRetention).toBe(55);
      expect(analytics.clickThroughRate).toBe(6.5);
      expect(analytics.growthRate).toBe(3.2);
      expect(analytics.revenue).toBe(4500);
      expect(analytics.lastUpdated).toBeInstanceOf(Date);
      expect(analyticsProvider.fetchAnalytics).toHaveBeenCalledWith('ch-1');
    });
  });

  // -------------------------------------------------------------------------
  // Health Status
  // -------------------------------------------------------------------------

  describe('getHealth', () => {
    it('returns healthy status when all metrics are good', async () => {
      const health = await manager.getHealth('ch-1');

      expect(health.channelId).toBe('ch-1');
      expect(health.status).toBe('healthy');
      expect(health.growthTrend).toBe('up');
      expect(health.engagementTrend).toBe('up');
      expect(health.alerts).toEqual([]);
    });

    it('returns warning status when growth is declining', async () => {
      (analyticsProvider.fetchHistoricalGrowth as ReturnType<typeof vi.fn>)
        .mockResolvedValue([5.0, 4.0, 3.0, 2.0]);

      const health = await manager.getHealth('ch-1');

      expect(health.growthTrend).toBe('down');
      expect(health.status).toBe('warning');
      expect(health.alerts).toContain('Growth trend is declining over recent months');
    });

    it('returns declining status when both growth and engagement are down', async () => {
      (analyticsProvider.fetchHistoricalGrowth as ReturnType<typeof vi.fn>)
        .mockResolvedValue([5.0, 4.0, 3.0, 2.0]);
      (analyticsProvider.fetchHistoricalEngagement as ReturnType<typeof vi.fn>)
        .mockResolvedValue([8.0, 7.0, 5.5, 4.0]);

      const health = await manager.getHealth('ch-1');

      expect(health.status).toBe('declining');
      expect(health.growthTrend).toBe('down');
      expect(health.engagementTrend).toBe('down');
    });

    it('generates alert for negative growth rate', async () => {
      (analyticsProvider.fetchAnalytics as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createMockAnalytics({ growthRate: -2.0 }));

      const health = await manager.getHealth('ch-1');

      expect(health.alerts).toContain('Subscriber growth rate is negative');
    });

    it('generates alert for low click-through rate', async () => {
      (analyticsProvider.fetchAnalytics as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createMockAnalytics({ clickThroughRate: 1.5 }));

      const health = await manager.getHealth('ch-1');

      expect(health.alerts).toContain('Click-through rate below 3% threshold');
    });

    it('generates alert for low retention', async () => {
      (analyticsProvider.fetchAnalytics as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createMockAnalytics({ avgRetention: 30 }));

      const health = await manager.getHealth('ch-1');

      expect(health.alerts).toContain('Average retention below 40% threshold');
    });

    it('returns declining status when multiple alerts are present', async () => {
      (analyticsProvider.fetchAnalytics as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createMockAnalytics({
          growthRate: -1.0,
          clickThroughRate: 2.0,
          avgRetention: 35,
        }));

      const health = await manager.getHealth('ch-1');

      expect(health.status).toBe('declining');
      expect(health.alerts.length).toBeGreaterThanOrEqual(2);
    });
  });
});
