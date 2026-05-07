/**
 * Unit tests for ZionX Ads — Playable Ad Generator
 *
 * Validates: Requirements 11d.1, 19.1
 *
 * Tests interactive ad demo generation for all target ad networks,
 * duration clamping, network compatibility, validation, interactive
 * elements, end card config, LLM driver calls, and Zikaron persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PlayableAdGenerator,
  NETWORK_SPECS,
  type LLMDriver,
  type PlayableAdConfig,
  type InteractiveElement,
  type EndCardConfig,
  type GeneratedPlayableAd,
  type AdNetwork,
} from '../ads/playable-ad-generator.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { DriverResult } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockLLMDriver(): LLMDriver {
  return {
    execute: vi.fn(async (): Promise<DriverResult> => ({
      success: true,
      data: 'Generated playable ad HTML5 content',
      retryable: false,
      operationId: `op-${Date.now()}`,
    })),
  };
}

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

function createInteractiveElements(count: number): InteractiveElement[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'tap' as const,
    description: `Tap element ${i + 1}`,
    triggerArea: { x: 10 * i, y: 10 * i, width: 50, height: 50 },
    response: `Response ${i + 1}`,
    order: i + 1,
  }));
}

function createEndCard(): EndCardConfig {
  return {
    headline: 'Download Now!',
    ctaText: 'Install Free',
    appStoreUrl: 'https://apps.apple.com/app/test',
    googlePlayUrl: 'https://play.google.com/store/apps/details?id=test',
    showRating: true,
    showDownloadCount: false,
  };
}

function createDefaultConfig(overrides?: Partial<PlayableAdConfig>): PlayableAdConfig {
  return {
    appId: 'test-app-1',
    appName: 'TestApp',
    coreValueProposition: 'The best test app ever',
    targetNetworks: ['admob', 'unity_ads', 'applovin', 'ironsource'],
    durationSeconds: 20,
    interactiveElements: createInteractiveElements(3),
    endCard: createEndCard(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlayableAdGenerator', () => {
  let generator: PlayableAdGenerator;
  let mockLLM: LLMDriver;
  let mockZikaron: ZikaronService;

  beforeEach(() => {
    mockLLM = createMockLLMDriver();
    mockZikaron = createMockZikaronService();
    generator = new PlayableAdGenerator(mockLLM, mockZikaron);
  });

  // -------------------------------------------------------------------------
  // Ad generation — correct structure
  // -------------------------------------------------------------------------

  describe('ad generation', () => {
    it('should generate ads for all target networks with correct structure', async () => {
      const config = createDefaultConfig();
      const result = await generator.generate(config);

      expect(result.appId).toBe('test-app-1');
      expect(result.networkCoverage).toEqual(config.targetNetworks);
      expect(result.generatedAt).toBeDefined();

      for (const ad of result.ads) {
        expect(ad.id).toBeTruthy();
        expect(ad.appId).toBe('test-app-1');
        expect(config.targetNetworks).toContain(ad.network);
        expect(ad.status).toBe('ready');
        expect(ad.durationSeconds).toBeGreaterThanOrEqual(15);
        expect(ad.durationSeconds).toBeLessThanOrEqual(30);
        expect(ad.filePath).toBeTruthy();
        expect(ad.dimensions).toBeDefined();
        expect(ad.dimensions.width).toBeGreaterThan(0);
        expect(ad.dimensions.height).toBeGreaterThan(0);
        expect(ad.interactiveElements).toBe(config.interactiveElements.length);
        expect(ad.endCard).toEqual(config.endCard);
      }
    });

    it('should produce the correct total number of ads across all networks', async () => {
      const config = createDefaultConfig();
      const result = await generator.generate(config);

      // admob: 2 dims + unity_ads: 3 dims + applovin: 2 dims + ironsource: 3 dims = 10
      const expectedTotal = config.targetNetworks.reduce(
        (sum, net) => sum + NETWORK_SPECS[net].requiredDimensions.length,
        0,
      );
      expect(result.totalAds).toBe(expectedTotal);
      expect(result.ads.length).toBe(expectedTotal);
    });

    it('should generate ads for a single target network', async () => {
      const config = createDefaultConfig({ targetNetworks: ['admob'] });
      const result = await generator.generate(config);

      expect(result.ads.length).toBe(NETWORK_SPECS.admob.requiredDimensions.length);
      expect(result.networkCoverage).toEqual(['admob']);
      for (const ad of result.ads) {
        expect(ad.network).toBe('admob');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Duration clamping
  // -------------------------------------------------------------------------

  describe('duration clamping', () => {
    it('should clamp duration below 15 seconds to 15', async () => {
      const config = createDefaultConfig({ durationSeconds: 5, targetNetworks: ['admob'] });
      const result = await generator.generate(config);

      for (const ad of result.ads) {
        expect(ad.durationSeconds).toBe(15);
      }
    });

    it('should clamp duration above 30 seconds to 30', async () => {
      const config = createDefaultConfig({ durationSeconds: 60, targetNetworks: ['admob'] });
      const result = await generator.generate(config);

      for (const ad of result.ads) {
        expect(ad.durationSeconds).toBe(30);
      }
    });

    it('should keep duration within range unchanged', async () => {
      const config = createDefaultConfig({ durationSeconds: 22, targetNetworks: ['admob'] });
      const result = await generator.generate(config);

      for (const ad of result.ads) {
        expect(ad.durationSeconds).toBe(22);
      }
    });

    it('should keep duration at boundary value 15', async () => {
      const config = createDefaultConfig({ durationSeconds: 15, targetNetworks: ['admob'] });
      const result = await generator.generate(config);

      for (const ad of result.ads) {
        expect(ad.durationSeconds).toBe(15);
      }
    });

    it('should keep duration at boundary value 30', async () => {
      const config = createDefaultConfig({ durationSeconds: 30, targetNetworks: ['admob'] });
      const result = await generator.generate(config);

      for (const ad of result.ads) {
        expect(ad.durationSeconds).toBe(30);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Network compatibility — required dimensions per network
  // -------------------------------------------------------------------------

  describe('network compatibility', () => {
    it('admob should generate 2 ads with correct dimensions', async () => {
      const config = createDefaultConfig({ targetNetworks: ['admob'] });
      const result = await generator.generate(config);

      expect(result.ads.length).toBe(2);
      const dims = result.ads.map((a) => `${a.dimensions.width}x${a.dimensions.height}`);
      expect(dims).toContain('320x480');
      expect(dims).toContain('480x320');
    });

    it('unity_ads should generate 3 ads with correct dimensions', async () => {
      const config = createDefaultConfig({ targetNetworks: ['unity_ads'] });
      const result = await generator.generate(config);

      expect(result.ads.length).toBe(3);
      const dims = result.ads.map((a) => `${a.dimensions.width}x${a.dimensions.height}`);
      expect(dims).toContain('320x480');
      expect(dims).toContain('480x320');
      expect(dims).toContain('768x1024');
    });

    it('applovin should generate 2 ads with correct dimensions', async () => {
      const config = createDefaultConfig({ targetNetworks: ['applovin'] });
      const result = await generator.generate(config);

      expect(result.ads.length).toBe(2);
      const dims = result.ads.map((a) => `${a.dimensions.width}x${a.dimensions.height}`);
      expect(dims).toContain('320x480');
      expect(dims).toContain('480x320');
    });

    it('ironsource should generate 3 ads with correct dimensions', async () => {
      const config = createDefaultConfig({ targetNetworks: ['ironsource'] });
      const result = await generator.generate(config);

      expect(result.ads.length).toBe(3);
      const dims = result.ads.map((a) => `${a.dimensions.width}x${a.dimensions.height}`);
      expect(dims).toContain('320x480');
      expect(dims).toContain('480x320');
      expect(dims).toContain('1024x768');
    });
  });

  // -------------------------------------------------------------------------
  // Network validation — validateForNetwork
  // -------------------------------------------------------------------------

  describe('network validation', () => {
    it('should validate a compliant ad as valid', async () => {
      const config = createDefaultConfig({ targetNetworks: ['admob'] });
      const result = await generator.generate(config);

      for (const ad of result.ads) {
        // Force file size to be within limits for deterministic test
        const testAd: GeneratedPlayableAd = { ...ad, fileSizeKb: 1000 };
        const validation = generator.validateForNetwork(testAd);
        expect(validation.valid).toBe(true);
        expect(validation.issues).toHaveLength(0);
      }
    });

    it('should flag file size exceeding network limit', () => {
      const ad: GeneratedPlayableAd = {
        id: 'test-ad',
        appId: 'test-app',
        network: 'admob',
        status: 'ready',
        durationSeconds: 20,
        filePath: 'assets/ads/test.html',
        fileSizeKb: 6000, // 6MB > 5MB limit
        dimensions: { width: 320, height: 480 },
        interactiveElements: 3,
        endCard: createEndCard(),
        generatedAt: new Date().toISOString(),
      };

      const validation = generator.validateForNetwork(ad);
      expect(validation.valid).toBe(false);
      expect(validation.issues.some((i) => i.includes('File size'))).toBe(true);
    });

    it('should flag duration exceeding network limit', () => {
      const ad: GeneratedPlayableAd = {
        id: 'test-ad',
        appId: 'test-app',
        network: 'admob',
        status: 'ready',
        durationSeconds: 45, // > 30s limit
        filePath: 'assets/ads/test.html',
        fileSizeKb: 1000,
        dimensions: { width: 320, height: 480 },
        interactiveElements: 3,
        endCard: createEndCard(),
        generatedAt: new Date().toISOString(),
      };

      const validation = generator.validateForNetwork(ad);
      expect(validation.valid).toBe(false);
      expect(validation.issues.some((i) => i.includes('Duration'))).toBe(true);
    });

    it('should flag unsupported dimensions', () => {
      const ad: GeneratedPlayableAd = {
        id: 'test-ad',
        appId: 'test-app',
        network: 'admob',
        status: 'ready',
        durationSeconds: 20,
        filePath: 'assets/ads/test.html',
        fileSizeKb: 1000,
        dimensions: { width: 1920, height: 1080 }, // not in admob specs
        interactiveElements: 3,
        endCard: createEndCard(),
        generatedAt: new Date().toISOString(),
      };

      const validation = generator.validateForNetwork(ad);
      expect(validation.valid).toBe(false);
      expect(validation.issues.some((i) => i.includes('Dimensions'))).toBe(true);
    });

    it('should report multiple issues at once', () => {
      const ad: GeneratedPlayableAd = {
        id: 'test-ad',
        appId: 'test-app',
        network: 'admob',
        status: 'ready',
        durationSeconds: 45,
        filePath: 'assets/ads/test.html',
        fileSizeKb: 6000,
        dimensions: { width: 1920, height: 1080 },
        interactiveElements: 3,
        endCard: createEndCard(),
        generatedAt: new Date().toISOString(),
      };

      const validation = generator.validateForNetwork(ad);
      expect(validation.valid).toBe(false);
      expect(validation.issues.length).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Interactive elements
  // -------------------------------------------------------------------------

  describe('interactive elements', () => {
    it('should set interactiveElements count matching config', async () => {
      const elements = createInteractiveElements(5);
      const config = createDefaultConfig({
        interactiveElements: elements,
        targetNetworks: ['admob'],
      });
      const result = await generator.generate(config);

      for (const ad of result.ads) {
        expect(ad.interactiveElements).toBe(5);
      }
    });

    it('should handle zero interactive elements', async () => {
      const config = createDefaultConfig({
        interactiveElements: [],
        targetNetworks: ['admob'],
      });
      const result = await generator.generate(config);

      for (const ad of result.ads) {
        expect(ad.interactiveElements).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // End card
  // -------------------------------------------------------------------------

  describe('end card', () => {
    it('should preserve end card config in generated ads', async () => {
      const endCard = createEndCard();
      const config = createDefaultConfig({ endCard, targetNetworks: ['admob'] });
      const result = await generator.generate(config);

      for (const ad of result.ads) {
        expect(ad.endCard).toEqual(endCard);
        expect(ad.endCard.headline).toBe('Download Now!');
        expect(ad.endCard.ctaText).toBe('Install Free');
        expect(ad.endCard.showRating).toBe(true);
        expect(ad.endCard.showDownloadCount).toBe(false);
      }
    });

    it('should preserve end card with optional fields omitted', async () => {
      const endCard: EndCardConfig = {
        headline: 'Try It',
        ctaText: 'Get',
        showRating: false,
        showDownloadCount: true,
      };
      const config = createDefaultConfig({ endCard, targetNetworks: ['admob'] });
      const result = await generator.generate(config);

      for (const ad of result.ads) {
        expect(ad.endCard.headline).toBe('Try It');
        expect(ad.endCard.appStoreUrl).toBeUndefined();
        expect(ad.endCard.googlePlayUrl).toBeUndefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // LLM driver calls
  // -------------------------------------------------------------------------

  describe('LLM driver calls', () => {
    it('should call LLM driver for each ad generation', async () => {
      const config = createDefaultConfig({ targetNetworks: ['admob'] });
      const result = await generator.generate(config);

      // admob has 2 required dimensions, so 2 LLM calls
      expect(mockLLM.execute).toHaveBeenCalledTimes(result.ads.length);
    });

    it('should call LLM driver with correct operation type', async () => {
      const config = createDefaultConfig({ targetNetworks: ['admob'] });
      await generator.generate(config);

      const calls = (mockLLM.execute as ReturnType<typeof vi.fn>).mock.calls;
      for (const call of calls) {
        expect(call[0].type).toBe('generate');
        expect(call[0].params.prompt).toBeTruthy();
        expect(call[0].params.maxTokens).toBe(2000);
      }
    });

    it('should call LLM driver once per network dimension across all networks', async () => {
      const config = createDefaultConfig();
      await generator.generate(config);

      // Total: admob(2) + unity_ads(3) + applovin(2) + ironsource(3) = 10
      expect(mockLLM.execute).toHaveBeenCalledTimes(10);
    });
  });

  // -------------------------------------------------------------------------
  // Persistence — Zikaron storeProcedural
  // -------------------------------------------------------------------------

  describe('persistence', () => {
    it('should store ads in Zikaron via storeProcedural', async () => {
      const config = createDefaultConfig();
      await generator.generate(config);

      expect(mockZikaron.storeProcedural).toHaveBeenCalledTimes(1);
    });

    it('should store with correct metadata', async () => {
      const config = createDefaultConfig();
      await generator.generate(config);

      const call = (mockZikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.content).toContain('test-app-1');
      expect(call.tags).toContain('playable-ads');
      expect(call.tags).toContain('test-app-1');
      expect(call.sourceAgentId).toBe('zionx-app-factory');
      expect(call.layer).toBe('procedural');
      expect(call.workflowPattern).toBe('playable_ad_generation');
      expect(call.steps.length).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // NETWORK_SPECS constant
  // -------------------------------------------------------------------------

  describe('NETWORK_SPECS constant', () => {
    it('should define specs for all 4 networks', () => {
      const networks: AdNetwork[] = ['admob', 'unity_ads', 'applovin', 'ironsource'];
      for (const network of networks) {
        expect(NETWORK_SPECS[network]).toBeDefined();
        expect(NETWORK_SPECS[network].network).toBe(network);
      }
    });

    it('admob should have correct specs', () => {
      const spec = NETWORK_SPECS.admob;
      expect(spec.maxFileSizeMb).toBe(5);
      expect(spec.maxDurationSeconds).toBe(30);
      expect(spec.supportedFormats).toContain('html5');
      expect(spec.supportedFormats).toContain('mraid');
      expect(spec.requiredDimensions.length).toBe(2);
      expect(spec.htmlRequired).toBe(true);
    });

    it('unity_ads should have correct specs', () => {
      const spec = NETWORK_SPECS.unity_ads;
      expect(spec.maxFileSizeMb).toBe(5);
      expect(spec.maxDurationSeconds).toBe(30);
      expect(spec.requiredDimensions.length).toBe(3);
      expect(spec.htmlRequired).toBe(true);
    });

    it('applovin should have correct specs', () => {
      const spec = NETWORK_SPECS.applovin;
      expect(spec.maxFileSizeMb).toBe(5);
      expect(spec.maxDurationSeconds).toBe(30);
      expect(spec.requiredDimensions.length).toBe(2);
      expect(spec.htmlRequired).toBe(true);
    });

    it('ironsource should have correct specs', () => {
      const spec = NETWORK_SPECS.ironsource;
      expect(spec.maxFileSizeMb).toBe(5);
      expect(spec.maxDurationSeconds).toBe(30);
      expect(spec.supportedFormats).toContain('dapi');
      expect(spec.requiredDimensions.length).toBe(3);
      expect(spec.htmlRequired).toBe(true);
    });
  });
});
