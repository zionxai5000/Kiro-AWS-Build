/**
 * Unit tests for ZionX Ads — Ad Monetization Manager
 *
 * Validates: Requirements 11d.3, 19.1
 *
 * Tests ad SDK placement integration, frequency capping, mediation across
 * networks, report generation, optimization recommendations, persistence,
 * and subscriber ad disabling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AdMonetizationManager,
  type AdMonetizationConfig,
  type AdPlacement,
  type FrequencyCap,
} from '../ads/ad-monetization-manager.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

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

function createTestPlacement(overrides?: Partial<AdPlacement>): AdPlacement {
  return {
    id: 'test-placement-1',
    name: 'Test Placement',
    format: 'banner',
    screenRef: 'screen-home',
    position: 'bottom',
    frequencyCap: {
      maxImpressionsPerSession: 5,
      maxImpressionsPerDay: 20,
      minIntervalSeconds: 30,
      cooldownAfterPurchase: true,
      respectUserPreference: true,
    },
    priority: 1,
    enabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdMonetizationManager', () => {
  let manager: AdMonetizationManager;
  let mockZikaron: ZikaronService;

  beforeEach(() => {
    mockZikaron = createMockZikaronService();
    manager = new AdMonetizationManager(mockZikaron);
  });

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  describe('configuration', () => {
    it('should store config via configure() and retrieve it via getConfig()', () => {
      const config = manager.createDefaultConfig('app-1');
      manager.configure(config);

      const retrieved = manager.getConfig('app-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.appId).toBe('app-1');
    });

    it('should return undefined for unknown appId', () => {
      expect(manager.getConfig('unknown-app')).toBeUndefined();
    });

    it('should create a default config with 4 placements', () => {
      const config = manager.createDefaultConfig('app-1');

      expect(config.appId).toBe('app-1');
      expect(config.placements).toHaveLength(4);
    });

    it('should store the default config so getConfig returns it', () => {
      manager.createDefaultConfig('app-2');

      const retrieved = manager.getConfig('app-2');
      expect(retrieved).toBeDefined();
      expect(retrieved!.appId).toBe('app-2');
    });
  });

  // -------------------------------------------------------------------------
  // Ad SDK placements
  // -------------------------------------------------------------------------

  describe('ad SDK placements', () => {
    it('should have banner, interstitial, rewarded_video, and native placements', () => {
      const config = manager.createDefaultConfig('app-1');
      const formats = config.placements.map((p) => p.format);

      expect(formats).toContain('banner');
      expect(formats).toContain('interstitial');
      expect(formats).toContain('rewarded_video');
      expect(formats).toContain('native');
    });

    it('banner placement should have bottom position and screen-home ref', () => {
      const config = manager.createDefaultConfig('app-1');
      const banner = config.placements.find((p) => p.format === 'banner')!;

      expect(banner.position).toBe('bottom');
      expect(banner.screenRef).toBe('screen-home');
    });

    it('interstitial placement should have fullscreen position and screen-transition ref', () => {
      const config = manager.createDefaultConfig('app-1');
      const interstitial = config.placements.find((p) => p.format === 'interstitial')!;

      expect(interstitial.position).toBe('fullscreen');
      expect(interstitial.screenRef).toBe('screen-transition');
    });

    it('rewarded_video placement should have fullscreen position and screen-feature-gate ref', () => {
      const config = manager.createDefaultConfig('app-1');
      const rewarded = config.placements.find((p) => p.format === 'rewarded_video')!;

      expect(rewarded.position).toBe('fullscreen');
      expect(rewarded.screenRef).toBe('screen-feature-gate');
    });

    it('native placement should have inline position and screen-feed ref', () => {
      const config = manager.createDefaultConfig('app-1');
      const native = config.placements.find((p) => p.format === 'native')!;

      expect(native.position).toBe('inline');
      expect(native.screenRef).toBe('screen-feed');
    });
  });

  // -------------------------------------------------------------------------
  // Frequency capping
  // -------------------------------------------------------------------------

  describe('frequency capping', () => {
    it('should allow impression when within all caps', () => {
      const placement = createTestPlacement();
      manager.createDefaultConfig('app-1');

      const result = manager.checkFrequencyCap(
        placement,
        0,   // sessionImpressions
        0,   // dailyImpressions
        0,   // lastImpressionTimestamp (long ago)
        false, // isSubscriber
        'app-1',
      );

      expect(result.allowed).toBe(true);
    });

    it('should block impression when session cap is reached', () => {
      const placement = createTestPlacement();
      manager.createDefaultConfig('app-1');

      const result = manager.checkFrequencyCap(
        placement,
        5,   // sessionImpressions = maxImpressionsPerSession
        0,
        0,
        false,
        'app-1',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Session cap');
    });

    it('should block impression when daily cap is reached', () => {
      const placement = createTestPlacement();
      manager.createDefaultConfig('app-1');

      const result = manager.checkFrequencyCap(
        placement,
        0,
        20,  // dailyImpressions = maxImpressionsPerDay
        0,
        false,
        'app-1',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily cap');
    });

    it('should block impression when minimum interval is not met', () => {
      const placement = createTestPlacement();
      manager.createDefaultConfig('app-1');

      const result = manager.checkFrequencyCap(
        placement,
        0,
        0,
        Date.now() - 5000, // 5 seconds ago, less than 30s minInterval
        false,
        'app-1',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Minimum interval');
    });

    it('should block ads for subscribers when disableAdsForSubscribers is true', () => {
      const placement = createTestPlacement();
      manager.createDefaultConfig('app-1');

      const result = manager.checkFrequencyCap(
        placement,
        0,
        0,
        0,
        true, // isSubscriber
        'app-1',
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('subscribers');
    });
  });

  // -------------------------------------------------------------------------
  // Mediation across networks
  // -------------------------------------------------------------------------

  describe('mediation across networks', () => {
    it('should return a mediation result with winning network', async () => {
      const config = manager.createDefaultConfig('app-1');
      const placementId = config.placements[0]!.id;

      const result = await manager.mediate('app-1', placementId);

      expect(result.placementId).toBe(placementId);
      expect(result.winningNetwork).toBeDefined();
      expect(result.ecpm).toBeGreaterThanOrEqual(0);
      expect(result.bidResponses.length).toBeGreaterThan(0);
    });

    it('should return fill rate and latency', async () => {
      const config = manager.createDefaultConfig('app-1');
      const placementId = config.placements[0]!.id;

      const result = await manager.mediate('app-1', placementId);

      expect(typeof result.fillRate).toBe('number');
      expect(result.fillRate).toBeGreaterThanOrEqual(0);
      expect(result.fillRate).toBeLessThanOrEqual(1);
      expect(typeof result.latencyMs).toBe('number');
    });

    it('should throw for unknown app', async () => {
      await expect(manager.mediate('unknown-app', 'some-placement')).rejects.toThrow(
        'No ad config found for app unknown-app',
      );
    });

    it('should throw for unknown placement', async () => {
      manager.createDefaultConfig('app-1');

      await expect(manager.mediate('app-1', 'nonexistent-placement')).rejects.toThrow(
        'Placement nonexistent-placement not found',
      );
    });

    it('should include bid responses from all enabled networks', async () => {
      const config = manager.createDefaultConfig('app-1');
      const placementId = config.placements[0]!.id;

      const result = await manager.mediate('app-1', placementId);
      const enabledNetworks = config.mediation.networks.filter((n) => n.enabled).length;

      expect(result.bidResponses).toHaveLength(enabledNetworks);
    });
  });

  // -------------------------------------------------------------------------
  // Default mediation config
  // -------------------------------------------------------------------------

  describe('default mediation config', () => {
    it('should use hybrid strategy', () => {
      const config = manager.createDefaultConfig('app-1');

      expect(config.mediation.strategy).toBe('hybrid');
    });

    it('should have 4 networks: admob, applovin, unity_ads, ironsource', () => {
      const config = manager.createDefaultConfig('app-1');
      const networks = config.mediation.networks.map((n) => n.network);

      expect(networks).toHaveLength(4);
      expect(networks).toContain('admob');
      expect(networks).toContain('applovin');
      expect(networks).toContain('unity_ads');
      expect(networks).toContain('ironsource');
    });

    it('should have floor prices set for each network', () => {
      const config = manager.createDefaultConfig('app-1');

      for (const network of config.mediation.networks) {
        expect(network.floorPriceCpm).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Report generation
  // -------------------------------------------------------------------------

  describe('report generation', () => {
    it('should produce an AdMonetizationReport with byFormat, byNetwork, recommendations', async () => {
      manager.createDefaultConfig('app-1');

      const report = await manager.generateReport('app-1', '2024-01-01', '2024-01-31');

      expect(report.appId).toBe('app-1');
      expect(report.byFormat).toBeDefined();
      expect(report.byFormat.banner).toBeDefined();
      expect(report.byFormat.interstitial).toBeDefined();
      expect(report.byFormat.rewarded_video).toBeDefined();
      expect(report.byFormat.native).toBeDefined();
      expect(report.byNetwork).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.period.start).toBe('2024-01-01');
      expect(report.period.end).toBe('2024-01-31');
      expect(report.generatedAt).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Optimization recommendations
  // -------------------------------------------------------------------------

  describe('optimization recommendations', () => {
    it('should include type, description, estimatedRevenueImpact, and priority', async () => {
      manager.createDefaultConfig('app-1');

      const report = await manager.generateReport('app-1', '2024-01-01', '2024-01-31');

      for (const rec of report.recommendations) {
        expect(rec.type).toBeDefined();
        expect(['add_placement', 'remove_placement', 'adjust_frequency', 'change_network_priority', 'enable_bidding']).toContain(rec.type);
        expect(rec.description).toBeTruthy();
        expect(typeof rec.estimatedRevenueImpact).toBe('number');
        expect(['high', 'medium', 'low']).toContain(rec.priority);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Persistence — Zikaron storeEpisodic
  // -------------------------------------------------------------------------

  describe('persistence', () => {
    it('should store report in Zikaron via storeEpisodic', async () => {
      manager.createDefaultConfig('app-1');

      await manager.generateReport('app-1', '2024-01-01', '2024-01-31');

      expect(mockZikaron.storeEpisodic).toHaveBeenCalledTimes(1);
    });

    it('should store with correct metadata', async () => {
      manager.createDefaultConfig('app-1');

      await manager.generateReport('app-1', '2024-01-01', '2024-01-31');

      const call = (mockZikaron.storeEpisodic as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.layer).toBe('episodic');
      expect(call.content).toContain('app-1');
      expect(call.tags).toContain('ad-monetization');
      expect(call.tags).toContain('report');
      expect(call.tags).toContain('app-1');
      expect(call.sourceAgentId).toBe('zionx-app-factory');
      expect(call.eventType).toBe('ad_monetization_report');
      expect(call.outcome).toBe('success');
    });
  });

  // -------------------------------------------------------------------------
  // Subscriber ad disabling
  // -------------------------------------------------------------------------

  describe('subscriber ad disabling', () => {
    it('should block ads for subscribers when disableAdsForSubscribers is true', () => {
      const config = manager.createDefaultConfig('app-1');
      expect(config.disableAdsForSubscribers).toBe(true);

      const placement = config.placements[0]!;
      const result = manager.checkFrequencyCap(placement, 0, 0, 0, true, 'app-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('subscribers');
    });

    it('should allow ads for non-subscribers even when disableAdsForSubscribers is true', () => {
      const config = manager.createDefaultConfig('app-1');
      const placement = config.placements[0]!;

      const result = manager.checkFrequencyCap(placement, 0, 0, 0, false, 'app-1');

      expect(result.allowed).toBe(true);
    });

    it('should allow ads for subscribers when disableAdsForSubscribers is false', () => {
      const config = manager.createDefaultConfig('app-1');
      config.disableAdsForSubscribers = false;
      manager.configure(config);

      const placement = config.placements[0]!;
      const result = manager.checkFrequencyCap(placement, 0, 0, 0, true, 'app-1');

      expect(result.allowed).toBe(true);
    });
  });
});
