/**
 * Unit tests for ZionX App Development Studio — Ad Studio Service
 *
 * Validates: Requirements 42i.28, 42i.29, 42i.30, 19.1
 *
 * Tests video ad creative generation (vertical, horizontal, bumper, playable),
 * ad network validation (AdMob, AppLovin, Unity Ads), and network-ready export.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DefaultAdStudioService,
  ADMOB_SPEC,
  APPLOVIN_SPEC,
  UNITY_ADS_SPEC,
  AD_NETWORK_SPECS,
  type VideoGenerator,
  type AdCreative,
  type AdNetwork,
} from '../ad-studio.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockVideoGenerator(overrides: Partial<VideoGenerator> = {}): VideoGenerator {
  return {
    async generateVerticalAd(_sessionId: string, _durationSeconds: number) {
      return { buffer: Buffer.alloc(5 * 1024 * 1024), fileSize: 5 * 1024 * 1024 };
    },
    async generateHorizontalAd(_sessionId: string, _durationSeconds: number) {
      return { buffer: Buffer.alloc(10 * 1024 * 1024), fileSize: 10 * 1024 * 1024 };
    },
    async generateBumperAd(_sessionId: string) {
      return { buffer: Buffer.alloc(2 * 1024 * 1024), fileSize: 2 * 1024 * 1024 };
    },
    async generatePlayableAd(_sessionId: string) {
      return { buffer: Buffer.alloc(3 * 1024 * 1024), fileSize: 3 * 1024 * 1024, hasInteractive: true };
    },
    ...overrides,
  };
}

function createService(generatorOverrides: Partial<VideoGenerator> = {}) {
  const generator = createMockVideoGenerator(generatorOverrides);
  const service = new DefaultAdStudioService(generator, '/tmp/ad-studio');
  return { service, generator };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdStudioService', () => {
  describe('generateVerticalAd', () => {
    it('produces correct 9:16 aspect ratio (1080×1920)', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');

      expect(creative.width).toBe(1080);
      expect(creative.height).toBe(1920);
    });

    it('produces 15-second duration', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');

      expect(creative.durationSeconds).toBe(15);
    });

    it('sets format to vertical-15s', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');

      expect(creative.format).toBe('vertical-15s');
    });

    it('sets mime type to video/mp4', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');

      expect(creative.mimeType).toBe('video/mp4');
    });

    it('does not have interactive elements', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');

      expect(creative.hasInteractiveElements).toBe(false);
    });

    it('assigns unique IDs to each creative', async () => {
      const { service } = createService();

      const c1 = await service.generateVerticalAd('session-1');
      const c2 = await service.generateVerticalAd('session-1');

      expect(c1.id).not.toBe(c2.id);
    });

    it('stores the creative in the session', async () => {
      const { service } = createService();

      await service.generateVerticalAd('session-1');
      const creatives = await service.getCreatives('session-1');

      expect(creatives).toHaveLength(1);
      expect(creatives[0].format).toBe('vertical-15s');
    });

    it('sets initial validation status to pending', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');

      expect(creative.validationStatus).toBe('pending');
    });
  });

  describe('generateHorizontalAd', () => {
    it('produces correct 16:9 aspect ratio (1920×1080)', async () => {
      const { service } = createService();

      const creative = await service.generateHorizontalAd('session-1');

      expect(creative.width).toBe(1920);
      expect(creative.height).toBe(1080);
    });

    it('produces 30-second duration', async () => {
      const { service } = createService();

      const creative = await service.generateHorizontalAd('session-1');

      expect(creative.durationSeconds).toBe(30);
    });

    it('sets format to horizontal-30s', async () => {
      const { service } = createService();

      const creative = await service.generateHorizontalAd('session-1');

      expect(creative.format).toBe('horizontal-30s');
    });

    it('sets mime type to video/mp4', async () => {
      const { service } = createService();

      const creative = await service.generateHorizontalAd('session-1');

      expect(creative.mimeType).toBe('video/mp4');
    });

    it('does not have interactive elements', async () => {
      const { service } = createService();

      const creative = await service.generateHorizontalAd('session-1');

      expect(creative.hasInteractiveElements).toBe(false);
    });
  });

  describe('generateBumperAd', () => {
    it('produces 6-second output', async () => {
      const { service } = createService();

      const creative = await service.generateBumperAd('session-1');

      expect(creative.durationSeconds).toBe(6);
    });

    it('produces correct 16:9 aspect ratio (1920×1080)', async () => {
      const { service } = createService();

      const creative = await service.generateBumperAd('session-1');

      expect(creative.width).toBe(1920);
      expect(creative.height).toBe(1080);
    });

    it('sets format to bumper-6s', async () => {
      const { service } = createService();

      const creative = await service.generateBumperAd('session-1');

      expect(creative.format).toBe('bumper-6s');
    });

    it('sets mime type to video/mp4', async () => {
      const { service } = createService();

      const creative = await service.generateBumperAd('session-1');

      expect(creative.mimeType).toBe('video/mp4');
    });
  });

  describe('generatePlayableAd', () => {
    it('includes interactive elements', async () => {
      const { service } = createService();

      const creative = await service.generatePlayableAd('session-1');

      expect(creative.hasInteractiveElements).toBe(true);
    });

    it('sets format to playable', async () => {
      const { service } = createService();

      const creative = await service.generatePlayableAd('session-1');

      expect(creative.format).toBe('playable');
    });

    it('sets mime type to text/html', async () => {
      const { service } = createService();

      const creative = await service.generatePlayableAd('session-1');

      expect(creative.mimeType).toBe('text/html');
    });

    it('produces 9:16 aspect ratio (1080×1920)', async () => {
      const { service } = createService();

      const creative = await service.generatePlayableAd('session-1');

      expect(creative.width).toBe(1080);
      expect(creative.height).toBe(1920);
    });

    it('reports no interactive elements when generator returns false', async () => {
      const { service } = createService({
        async generatePlayableAd(_sessionId: string) {
          return { buffer: Buffer.alloc(1024), fileSize: 1024, hasInteractive: false };
        },
      });

      const creative = await service.generatePlayableAd('session-1');

      expect(creative.hasInteractiveElements).toBe(false);
    });
  });

  describe('validateCreative — file size violations', () => {
    it('catches file size exceeding AdMob 150MB limit', async () => {
      const { service } = createService({
        async generateVerticalAd() {
          const size = 160 * 1024 * 1024; // 160MB
          return { buffer: Buffer.alloc(0), fileSize: size };
        },
      });

      const creative = await service.generateVerticalAd('session-1');
      const result = await service.validateCreative(creative.id, 'admob');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('File size');
      expect(result.errors[0]).toContain('150MB');
    });

    it('catches file size exceeding AppLovin 100MB limit', async () => {
      const { service } = createService({
        async generateVerticalAd() {
          const size = 110 * 1024 * 1024; // 110MB
          return { buffer: Buffer.alloc(0), fileSize: size };
        },
      });

      const creative = await service.generateVerticalAd('session-1');
      const result = await service.validateCreative(creative.id, 'applovin');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('File size');
      expect(result.errors[0]).toContain('100MB');
    });

    it('catches file size exceeding Unity Ads 100MB limit', async () => {
      const { service } = createService({
        async generateVerticalAd() {
          const size = 110 * 1024 * 1024; // 110MB
          return { buffer: Buffer.alloc(0), fileSize: size };
        },
      });

      const creative = await service.generateVerticalAd('session-1');
      const result = await service.validateCreative(creative.id, 'unity-ads');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('File size');
      expect(result.errors[0]).toContain('100MB');
    });

    it('passes validation when file size is within limits', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');
      const result = await service.validateCreative(creative.id, 'admob');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateCreative — aspect ratio violations', () => {
    it('catches incorrect aspect ratio for vertical ad', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');
      // Tamper with dimensions to simulate wrong aspect ratio
      const creatives = await service.getCreatives('session-1');
      creatives[0].width = 1920;
      creatives[0].height = 1080;

      const result = await service.validateCreative(creative.id, 'admob');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Aspect ratio');
      expect(result.errors[0]).toContain('1080×1920');
    });

    it('catches incorrect aspect ratio for horizontal ad', async () => {
      const { service } = createService();

      const creative = await service.generateHorizontalAd('session-1');
      const creatives = await service.getCreatives('session-1');
      creatives[0].width = 1080;
      creatives[0].height = 1920;

      const result = await service.validateCreative(creative.id, 'admob');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Aspect ratio');
      expect(result.errors[0]).toContain('1920×1080');
    });
  });

  describe('validateCreative — duration violations', () => {
    it('catches duration exceeding limit for bumper ad', async () => {
      const { service } = createService();

      const creative = await service.generateBumperAd('session-1');
      // Tamper with duration
      const creatives = await service.getCreatives('session-1');
      creatives[0].durationSeconds = 10;

      const result = await service.validateCreative(creative.id, 'admob');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Duration');
      expect(result.errors[0]).toContain('6s');
    });

    it('catches duration exceeding limit for vertical ad', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');
      const creatives = await service.getCreatives('session-1');
      creatives[0].durationSeconds = 20;

      const result = await service.validateCreative(creative.id, 'admob');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Duration');
      expect(result.errors[0]).toContain('15s');
    });
  });

  describe('validateCreative — interactive element requirements', () => {
    it('catches missing interactive elements for playable ad on AdMob', async () => {
      const { service } = createService({
        async generatePlayableAd() {
          return { buffer: Buffer.alloc(1024), fileSize: 1024, hasInteractive: false };
        },
      });

      const creative = await service.generatePlayableAd('session-1');
      const result = await service.validateCreative(creative.id, 'admob');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Playable ad for admob requires interactive elements',
      );
    });

    it('catches missing interactive elements for playable ad on AppLovin', async () => {
      const { service } = createService({
        async generatePlayableAd() {
          return { buffer: Buffer.alloc(1024), fileSize: 1024, hasInteractive: false };
        },
      });

      const creative = await service.generatePlayableAd('session-1');
      const result = await service.validateCreative(creative.id, 'applovin');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Playable ad for applovin requires interactive elements',
      );
    });

    it('passes validation when playable ad has interactive elements', async () => {
      const { service } = createService();

      const creative = await service.generatePlayableAd('session-1');
      const result = await service.validateCreative(creative.id, 'admob');

      expect(result.valid).toBe(true);
    });
  });

  describe('validateCreative — edge cases', () => {
    it('returns error for non-existent creative', async () => {
      const { service } = createService();

      const result = await service.validateCreative('non-existent', 'admob');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Creative not found');
    });

    it('updates creative validation status to valid on success', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');
      await service.validateCreative(creative.id, 'admob');

      const creatives = await service.getCreatives('session-1');
      expect(creatives[0].validationStatus).toBe('valid');
    });

    it('updates creative validation status to invalid on failure', async () => {
      const { service } = createService({
        async generateVerticalAd() {
          return { buffer: Buffer.alloc(0), fileSize: 200 * 1024 * 1024 };
        },
      });

      const creative = await service.generateVerticalAd('session-1');
      await service.validateCreative(creative.id, 'admob');

      const creatives = await service.getCreatives('session-1');
      expect(creatives[0].validationStatus).toBe('invalid');
      expect(creatives[0].validationErrors).toBeDefined();
    });

    it('adds network to compatibility list on successful validation', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');
      await service.validateCreative(creative.id, 'admob');
      await service.validateCreative(creative.id, 'applovin');

      const creatives = await service.getCreatives('session-1');
      expect(creatives[0].networkCompatibility).toContain('admob');
      expect(creatives[0].networkCompatibility).toContain('applovin');
    });
  });

  describe('validateAllCreatives', () => {
    it('validates all creatives in a session against all networks', async () => {
      const { service } = createService();

      await service.generateVerticalAd('session-1');
      await service.generateHorizontalAd('session-1');

      const result = await service.validateAllCreatives('session-1');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports errors for invalid creatives', async () => {
      const { service } = createService({
        async generateVerticalAd() {
          return { buffer: Buffer.alloc(0), fileSize: 200 * 1024 * 1024 };
        },
      });

      await service.generateVerticalAd('session-1');

      const result = await service.validateAllCreatives('session-1');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns valid for empty session', async () => {
      const { service } = createService();

      const result = await service.validateAllCreatives('session-1');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('exportForNetwork', () => {
    it('exports video ad as mp4 format', async () => {
      const { service } = createService();

      const creative = await service.generateVerticalAd('session-1');
      const result = await service.exportForNetwork(creative.id, 'admob');

      expect(result.ready).toBe(true);
      expect(result.format).toBe('mp4');
      expect(result.filePath).toContain('.mp4');
      expect(result.filePath).toContain('admob');
    });

    it('exports playable ad as html format', async () => {
      const { service } = createService();

      const creative = await service.generatePlayableAd('session-1');
      const result = await service.exportForNetwork(creative.id, 'admob');

      expect(result.ready).toBe(true);
      expect(result.format).toBe('html');
      expect(result.filePath).toContain('.html');
    });

    it('produces network-ready format without conversion needed', async () => {
      const { service } = createService();

      const creative = await service.generateHorizontalAd('session-1');
      const result = await service.exportForNetwork(creative.id, 'applovin');

      expect(result.ready).toBe(true);
      expect(result.filePath).toContain('applovin');
      expect(result.format).toBe('mp4');
    });

    it('returns not ready for invalid creative', async () => {
      const { service } = createService({
        async generateVerticalAd() {
          return { buffer: Buffer.alloc(0), fileSize: 200 * 1024 * 1024 };
        },
      });

      const creative = await service.generateVerticalAd('session-1');
      const result = await service.exportForNetwork(creative.id, 'admob');

      expect(result.ready).toBe(false);
    });

    it('returns not ready for non-existent creative', async () => {
      const { service } = createService();

      const result = await service.exportForNetwork('non-existent', 'admob');

      expect(result.ready).toBe(false);
    });

    it('exports for Unity Ads network', async () => {
      const { service } = createService();

      const creative = await service.generateBumperAd('session-1');
      const result = await service.exportForNetwork(creative.id, 'unity-ads');

      expect(result.ready).toBe(true);
      expect(result.filePath).toContain('unity-ads');
    });
  });

  describe('getCreatives', () => {
    it('returns empty array for unknown session', async () => {
      const { service } = createService();

      const creatives = await service.getCreatives('unknown-session');

      expect(creatives).toEqual([]);
    });

    it('returns all creatives for a session', async () => {
      const { service } = createService();

      await service.generateVerticalAd('session-1');
      await service.generateHorizontalAd('session-1');
      await service.generateBumperAd('session-1');
      await service.generatePlayableAd('session-1');

      const creatives = await service.getCreatives('session-1');

      expect(creatives).toHaveLength(4);
    });

    it('keeps creatives isolated between sessions', async () => {
      const { service } = createService();

      await service.generateVerticalAd('session-1');
      await service.generateHorizontalAd('session-2');

      const s1 = await service.getCreatives('session-1');
      const s2 = await service.getCreatives('session-2');

      expect(s1).toHaveLength(1);
      expect(s1[0].format).toBe('vertical-15s');
      expect(s2).toHaveLength(1);
      expect(s2[0].format).toBe('horizontal-30s');
    });
  });

  describe('getNetworkSpecs', () => {
    it('returns specs for all three networks', () => {
      const { service } = createService();

      const specs = service.getNetworkSpecs();

      expect(specs).toHaveLength(3);
      expect(specs.map((s) => s.network)).toEqual(['admob', 'applovin', 'unity-ads']);
    });

    it('returns a copy (not a reference to internal state)', () => {
      const { service } = createService();

      const specs1 = service.getNetworkSpecs();
      const specs2 = service.getNetworkSpecs();

      expect(specs1).not.toBe(specs2);
    });
  });

  describe('Network Specifications', () => {
    it('AdMob allows max 150MB file size', () => {
      expect(ADMOB_SPEC.maxFileSizeMB).toBe(150);
    });

    it('AppLovin allows max 100MB file size', () => {
      expect(APPLOVIN_SPEC.maxFileSizeMB).toBe(100);
    });

    it('Unity Ads allows max 100MB file size', () => {
      expect(UNITY_ADS_SPEC.maxFileSizeMB).toBe(100);
    });

    it('AdMob supports mp4 and html file types', () => {
      expect(ADMOB_SPEC.fileTypes).toContain('mp4');
      expect(ADMOB_SPEC.fileTypes).toContain('html');
    });

    it('AppLovin supports mp4 and html file types', () => {
      expect(APPLOVIN_SPEC.fileTypes).toContain('mp4');
      expect(APPLOVIN_SPEC.fileTypes).toContain('html');
    });

    it('Unity Ads supports mp4, html, and mraid file types', () => {
      expect(UNITY_ADS_SPEC.fileTypes).toContain('mp4');
      expect(UNITY_ADS_SPEC.fileTypes).toContain('html');
      expect(UNITY_ADS_SPEC.fileTypes).toContain('mraid');
    });

    it('all networks require interactive elements for playable ads', () => {
      for (const spec of AD_NETWORK_SPECS) {
        expect(spec.requiresInteractive).toBe(true);
      }
    });

    it('all networks define vertical as 1080×1920', () => {
      for (const spec of AD_NETWORK_SPECS) {
        expect(spec.aspectRatios['vertical-15s']).toEqual({ width: 1080, height: 1920 });
      }
    });

    it('all networks define horizontal as 1920×1080', () => {
      for (const spec of AD_NETWORK_SPECS) {
        expect(spec.aspectRatios['horizontal-30s']).toEqual({ width: 1920, height: 1080 });
      }
    });

    it('all networks limit bumper ads to 6 seconds', () => {
      for (const spec of AD_NETWORK_SPECS) {
        expect(spec.maxDurationSeconds['bumper-6s']).toBe(6);
      }
    });
  });
});
