/**
 * Unit tests for ZionX App Development Studio — Store Asset Generator
 *
 * Validates: Requirements 42h.24, 42h.25, 42h.26, 42h.27, 19.1
 *
 * Tests screenshot capture across device profiles, app icon generation,
 * feature graphic generation, platform-specific validation, caption generation,
 * and the app.screenflow.changed hook for regeneration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultStoreAssetGeneratorService,
  APPLE_REQUIREMENTS,
  GOOGLE_REQUIREMENTS,
  type ScreenshotCapturer,
  type ImageGenerator,
  type CaptionGenerator,
  type HookEmitter,
  type StoreAssetGeneratorConfig,
  type StoreAsset,
} from '../store-assets.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockScreenshotCapturer(): ScreenshotCapturer & {
  calls: Array<{ previewUrl: string; width: number; height: number }>;
} {
  const calls: Array<{ previewUrl: string; width: number; height: number }> = [];
  return {
    calls,
    async capture(previewUrl: string, width: number, height: number): Promise<Buffer> {
      calls.push({ previewUrl, width, height });
      return Buffer.alloc(width * height * 4);
    },
  };
}

function createMockImageGenerator(): ImageGenerator & {
  iconCalls: Array<{ appName: string; designSystem: Record<string, unknown> }>;
  featureGraphicCalls: Array<{
    appName: string;
    description: string;
    designSystem: Record<string, unknown>;
  }>;
  promoBannerCalls: Array<{
    appName: string;
    tagline: string;
    designSystem: Record<string, unknown>;
  }>;
} {
  const iconCalls: Array<{ appName: string; designSystem: Record<string, unknown> }> = [];
  const featureGraphicCalls: Array<{
    appName: string;
    description: string;
    designSystem: Record<string, unknown>;
  }> = [];
  const promoBannerCalls: Array<{
    appName: string;
    tagline: string;
    designSystem: Record<string, unknown>;
  }> = [];

  return {
    iconCalls,
    featureGraphicCalls,
    promoBannerCalls,
    async generateIcon(appName: string, designSystem: Record<string, unknown>): Promise<Buffer> {
      iconCalls.push({ appName, designSystem });
      return Buffer.alloc(1024 * 1024 * 4);
    },
    async generateFeatureGraphic(
      appName: string,
      description: string,
      designSystem: Record<string, unknown>,
    ): Promise<Buffer> {
      featureGraphicCalls.push({ appName, description, designSystem });
      return Buffer.alloc(1024 * 500 * 4);
    },
    async generatePromoBanner(
      appName: string,
      tagline: string,
      designSystem: Record<string, unknown>,
    ): Promise<Buffer> {
      promoBannerCalls.push({ appName, tagline, designSystem });
      return Buffer.alloc(1024 * 500 * 4);
    },
  };
}

function createMockCaptionGenerator(): CaptionGenerator & {
  calls: Array<{ screenshots: StoreAsset[]; appDescription: string; locale: string }>;
} {
  const calls: Array<{ screenshots: StoreAsset[]; appDescription: string; locale: string }> = [];
  return {
    calls,
    async generateCaptions(
      screenshots: StoreAsset[],
      appDescription: string,
      locale: string,
    ): Promise<Map<string, string>> {
      calls.push({ screenshots, appDescription, locale });
      const captions = new Map<string, string>();
      for (const screenshot of screenshots) {
        captions.set(screenshot.id, `Caption for ${screenshot.deviceSize} in ${locale}`);
      }
      return captions;
    },
  };
}

function createMockHookEmitter(): HookEmitter & {
  emittedHooks: Array<{ hookName: string; payload: Record<string, unknown> }>;
} {
  const emittedHooks: Array<{ hookName: string; payload: Record<string, unknown> }> = [];
  return {
    emittedHooks,
    emit(hookName: string, payload: Record<string, unknown>): void {
      emittedHooks.push({ hookName, payload });
    },
  };
}

function createDefaultConfig(
  overrides: Partial<StoreAssetGeneratorConfig> = {},
): StoreAssetGeneratorConfig {
  return {
    previewBaseUrl: 'http://localhost:19000',
    outputDir: '/tmp/store-assets',
    appName: 'TestApp',
    appDescription: 'A test application',
    appTagline: 'Build better apps',
    designSystem: { primaryColor: '#007AFF' },
    targetPlatforms: ['apple', 'google'],
    ...overrides,
  };
}

function createService(configOverrides: Partial<StoreAssetGeneratorConfig> = {}) {
  const capturer = createMockScreenshotCapturer();
  const imageGen = createMockImageGenerator();
  const captionGen = createMockCaptionGenerator();
  const hookEmitter = createMockHookEmitter();
  const config = createDefaultConfig(configOverrides);

  const service = new DefaultStoreAssetGeneratorService(
    capturer,
    imageGen,
    captionGen,
    hookEmitter,
    config,
  );

  return { service, capturer, imageGen, captionGen, hookEmitter, config };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StoreAssetGenerator', () => {
  describe('captureScreenshot', () => {
    it('captures screenshot with correct dimensions for iphone-6.7', async () => {
      const { service, capturer } = createService();

      const asset = await service.captureScreenshot('session-1', 'iphone-6.7');

      expect(capturer.calls).toHaveLength(1);
      expect(capturer.calls[0].width).toBe(1290);
      expect(capturer.calls[0].height).toBe(2796);
      expect(asset.width).toBe(1290);
      expect(asset.height).toBe(2796);
    });

    it('captures screenshot with correct dimensions for iphone-6.5', async () => {
      const { service, capturer } = createService();

      const asset = await service.captureScreenshot('session-1', 'iphone-6.5');

      expect(capturer.calls).toHaveLength(1);
      expect(capturer.calls[0].width).toBe(1284);
      expect(capturer.calls[0].height).toBe(2778);
      expect(asset.width).toBe(1284);
      expect(asset.height).toBe(2778);
    });

    it('captures screenshot with correct dimensions for ipad', async () => {
      const { service, capturer } = createService();

      const asset = await service.captureScreenshot('session-1', 'ipad');

      expect(capturer.calls).toHaveLength(1);
      expect(capturer.calls[0].width).toBe(2048);
      expect(capturer.calls[0].height).toBe(2732);
      expect(asset.width).toBe(2048);
      expect(asset.height).toBe(2732);
    });

    it('captures screenshot with correct dimensions for google-play-phone', async () => {
      const { service, capturer } = createService();

      const asset = await service.captureScreenshot('session-1', 'google-play-phone');

      expect(capturer.calls).toHaveLength(1);
      expect(capturer.calls[0].width).toBe(1080);
      expect(capturer.calls[0].height).toBe(1920);
      expect(asset.width).toBe(1080);
      expect(asset.height).toBe(1920);
    });

    it('captures screenshot with correct dimensions for google-play-tablet', async () => {
      const { service, capturer } = createService();

      const asset = await service.captureScreenshot('session-1', 'google-play-tablet');

      expect(capturer.calls).toHaveLength(1);
      expect(capturer.calls[0].width).toBe(1200);
      expect(capturer.calls[0].height).toBe(1920);
      expect(asset.width).toBe(1200);
      expect(asset.height).toBe(1920);
    });

    it('passes the correct preview URL to the capturer', async () => {
      const { service, capturer } = createService();

      await service.captureScreenshot('session-1', 'iphone-6.7');

      expect(capturer.calls[0].previewUrl).toBe('http://localhost:19000/session-1');
    });

    it('returns asset with correct platform for Apple devices', async () => {
      const { service } = createService();

      const asset = await service.captureScreenshot('session-1', 'iphone-6.7');

      expect(asset.platform).toBe('apple');
      expect(asset.type).toBe('screenshot');
    });

    it('returns asset with correct platform for Google devices', async () => {
      const { service } = createService();

      const asset = await service.captureScreenshot('session-1', 'google-play-phone');

      expect(asset.platform).toBe('google');
      expect(asset.type).toBe('screenshot');
    });

    it('assigns unique IDs to each captured screenshot', async () => {
      const { service } = createService();

      const asset1 = await service.captureScreenshot('session-1', 'iphone-6.7');
      const asset2 = await service.captureScreenshot('session-1', 'iphone-6.5');

      expect(asset1.id).not.toBe(asset2.id);
    });

    it('throws for unknown device size', async () => {
      const { service } = createService();

      await expect(service.captureScreenshot('session-1', 'unknown-device')).rejects.toThrow(
        'Unknown device size: unknown-device',
      );
    });

    it('sets initial validation status to pending', async () => {
      const { service } = createService();

      const asset = await service.captureScreenshot('session-1', 'iphone-6.7');

      expect(asset.validationStatus).toBe('pending');
    });
  });

  describe('captureAllScreenshots', () => {
    it('captures screenshots for all required device sizes when targeting both platforms', async () => {
      const { service, capturer } = createService({ targetPlatforms: ['apple', 'google'] });

      const assets = await service.captureAllScreenshots('session-1');

      // Apple: iphone-6.7, iphone-6.5, ipad; Google: google-play-phone, google-play-tablet
      expect(assets).toHaveLength(5);
      expect(capturer.calls).toHaveLength(5);
    });

    it('captures only Apple screenshots when targeting Apple only', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      const assets = await service.captureAllScreenshots('session-1');

      expect(assets).toHaveLength(3);
      expect(assets.every((a) => a.platform === 'apple')).toBe(true);
    });

    it('captures only Google screenshots when targeting Google only', async () => {
      const { service } = createService({ targetPlatforms: ['google'] });

      const assets = await service.captureAllScreenshots('session-1');

      expect(assets).toHaveLength(2);
      expect(assets.every((a) => a.platform === 'google')).toBe(true);
    });

    it('stores all captured assets in the session', async () => {
      const { service } = createService({ targetPlatforms: ['apple', 'google'] });

      await service.captureAllScreenshots('session-1');
      const stored = await service.getAssets('session-1');

      expect(stored).toHaveLength(5);
    });
  });

  describe('generateAppIcon', () => {
    it('generates app icon with 1024×1024 dimensions', async () => {
      const { service, imageGen } = createService();

      const asset = await service.generateAppIcon('session-1');

      expect(asset.width).toBe(1024);
      expect(asset.height).toBe(1024);
      expect(asset.type).toBe('app-icon');
    });

    it('passes app name and design system to the image generator', async () => {
      const { service, imageGen } = createService();

      await service.generateAppIcon('session-1');

      expect(imageGen.iconCalls).toHaveLength(1);
      expect(imageGen.iconCalls[0].appName).toBe('TestApp');
      expect(imageGen.iconCalls[0].designSystem).toEqual({ primaryColor: '#007AFF' });
    });

    it('stores the generated icon in the session assets', async () => {
      const { service } = createService();

      await service.generateAppIcon('session-1');
      const assets = await service.getAssets('session-1');

      expect(assets).toHaveLength(1);
      expect(assets[0].type).toBe('app-icon');
    });

    it('sets file path with png extension', async () => {
      const { service } = createService();

      const asset = await service.generateAppIcon('session-1');

      expect(asset.filePath).toContain('.png');
      expect(asset.filePath).toContain('session-1');
    });
  });

  describe('generateFeatureGraphic', () => {
    it('generates feature graphic with 1024×500 dimensions', async () => {
      const { service } = createService();

      const asset = await service.generateFeatureGraphic('session-1');

      expect(asset.width).toBe(1024);
      expect(asset.height).toBe(500);
      expect(asset.type).toBe('feature-graphic');
    });

    it('sets platform to google for feature graphics', async () => {
      const { service } = createService();

      const asset = await service.generateFeatureGraphic('session-1');

      expect(asset.platform).toBe('google');
    });

    it('passes app name and description to the image generator', async () => {
      const { service, imageGen } = createService();

      await service.generateFeatureGraphic('session-1');

      expect(imageGen.featureGraphicCalls).toHaveLength(1);
      expect(imageGen.featureGraphicCalls[0].appName).toBe('TestApp');
      expect(imageGen.featureGraphicCalls[0].description).toBe('A test application');
    });
  });

  describe('generatePromoBanner', () => {
    it('generates promotional banner', async () => {
      const { service } = createService();

      const asset = await service.generatePromoBanner('session-1');

      expect(asset.type).toBe('promo-banner');
      expect(asset.width).toBe(1024);
      expect(asset.height).toBe(500);
    });

    it('passes app name and tagline to the image generator', async () => {
      const { service, imageGen } = createService();

      await service.generatePromoBanner('session-1');

      expect(imageGen.promoBannerCalls).toHaveLength(1);
      expect(imageGen.promoBannerCalls[0].appName).toBe('TestApp');
      expect(imageGen.promoBannerCalls[0].tagline).toBe('Build better apps');
    });
  });

  describe('generateCaptions', () => {
    it('generates captions for all screenshots in a session', async () => {
      const { service, captionGen } = createService({ targetPlatforms: ['apple'] });

      await service.captureAllScreenshots('session-1');
      const captions = await service.generateCaptions('session-1');

      expect(captions.size).toBe(3);
      expect(captionGen.calls).toHaveLength(1);
    });

    it('uses default locale en-US when not specified', async () => {
      const { service, captionGen } = createService({ targetPlatforms: ['apple'] });

      await service.captureAllScreenshots('session-1');
      await service.generateCaptions('session-1');

      expect(captionGen.calls[0].locale).toBe('en-US');
    });

    it('uses specified locale', async () => {
      const { service, captionGen } = createService({ targetPlatforms: ['apple'] });

      await service.captureAllScreenshots('session-1');
      await service.generateCaptions('session-1', 'ja-JP');

      expect(captionGen.calls[0].locale).toBe('ja-JP');
    });

    it('applies captions to screenshot assets', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      await service.captureAllScreenshots('session-1');
      await service.generateCaptions('session-1', 'fr-FR');

      const assets = await service.getAssets('session-1');
      const screenshots = assets.filter((a) => a.type === 'screenshot');

      for (const screenshot of screenshots) {
        expect(screenshot.caption).toBeDefined();
        expect(screenshot.locale).toBe('fr-FR');
      }
    });

    it('returns empty map when no screenshots exist', async () => {
      const { service } = createService();

      const captions = await service.generateCaptions('session-1');

      expect(captions.size).toBe(0);
    });
  });

  describe('validateAssets', () => {
    it('validates correct Apple screenshots as valid', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      await service.captureAllScreenshots('session-1');
      const result = await service.validateAssets('session-1');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates correct Google screenshots as valid', async () => {
      const { service } = createService({ targetPlatforms: ['google'] });

      await service.captureAllScreenshots('session-1');
      const result = await service.validateAssets('session-1');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('catches incorrect screenshot dimensions', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      // Manually add an asset with wrong dimensions
      await service.captureScreenshot('session-1', 'iphone-6.7');
      const assets = await service.getAssets('session-1');
      // Tamper with dimensions
      assets[0].width = 800;
      assets[0].height = 600;

      const result = await service.validateAssets('session-1');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errors[0]).toContain('dimensions');
    });

    it('catches incorrect app icon dimensions', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      await service.generateAppIcon('session-1');
      const assets = await service.getAssets('session-1');
      // Tamper with dimensions
      assets[0].width = 512;
      assets[0].height = 512;

      const result = await service.validateAssets('session-1');

      expect(result.valid).toBe(false);
      expect(result.errors[0].errors[0]).toContain('1024×1024');
    });

    it('catches incorrect feature graphic dimensions', async () => {
      const { service } = createService({ targetPlatforms: ['google'] });

      await service.generateFeatureGraphic('session-1');
      const assets = await service.getAssets('session-1');
      // Tamper with dimensions
      assets[0].width = 800;
      assets[0].height = 400;

      const result = await service.validateAssets('session-1');

      expect(result.valid).toBe(false);
      expect(result.errors[0].errors[0]).toContain('1024×500');
    });

    it('validates feature graphic not required for Apple platform', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      await service.generateFeatureGraphic('session-1');
      const assets = await service.getAssets('session-1');
      // Force platform to apple to test validation
      assets[0].platform = 'apple';

      const result = await service.validateAssets('session-1');

      expect(result.valid).toBe(false);
      expect(result.errors[0].errors[0]).toContain('not required');
    });

    it('marks assets as valid after successful validation', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      await service.captureAllScreenshots('session-1');
      await service.validateAssets('session-1');

      const assets = await service.getAssets('session-1');
      for (const asset of assets) {
        expect(asset.validationStatus).toBe('valid');
      }
    });

    it('marks assets as invalid and stores errors after failed validation', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      await service.captureScreenshot('session-1', 'iphone-6.7');
      const assets = await service.getAssets('session-1');
      assets[0].width = 100;

      await service.validateAssets('session-1');

      expect(assets[0].validationStatus).toBe('invalid');
      expect(assets[0].validationErrors).toBeDefined();
      expect(assets[0].validationErrors!.length).toBeGreaterThan(0);
    });

    it('returns valid when no assets exist', async () => {
      const { service } = createService();

      const result = await service.validateAssets('session-1');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('regenerateOnScreenflowChange', () => {
    it('emits app.screenflow.changed hook', async () => {
      const { service, hookEmitter } = createService({ targetPlatforms: ['apple'] });

      await service.captureAllScreenshots('session-1');
      await service.regenerateOnScreenflowChange('session-1');

      expect(hookEmitter.emittedHooks).toHaveLength(1);
      expect(hookEmitter.emittedHooks[0].hookName).toBe('app.screenflow.changed');
      expect(hookEmitter.emittedHooks[0].payload.sessionId).toBe('session-1');
    });

    it('includes timestamp and reason in hook payload', async () => {
      const { service, hookEmitter } = createService({ targetPlatforms: ['apple'] });

      const before = Date.now();
      await service.regenerateOnScreenflowChange('session-1');
      const after = Date.now();

      const payload = hookEmitter.emittedHooks[0].payload;
      expect(payload.reason).toBe('navigation-change');
      expect(payload.timestamp).toBeGreaterThanOrEqual(before);
      expect(payload.timestamp).toBeLessThanOrEqual(after);
    });

    it('recaptures all screenshots after screenflow change', async () => {
      const { service, capturer } = createService({ targetPlatforms: ['apple'] });

      await service.captureAllScreenshots('session-1');
      expect(capturer.calls).toHaveLength(3);

      await service.regenerateOnScreenflowChange('session-1');
      // Should have captured 3 more screenshots (total 6)
      expect(capturer.calls).toHaveLength(6);
    });

    it('replaces old screenshots with new ones', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      await service.captureAllScreenshots('session-1');
      const originalAssets = await service.getAssets('session-1');
      const originalIds = originalAssets.map((a) => a.id);

      await service.regenerateOnScreenflowChange('session-1');
      const newAssets = await service.getAssets('session-1');
      const newIds = newAssets.map((a) => a.id);

      // New assets should have different IDs
      for (const id of newIds) {
        expect(originalIds).not.toContain(id);
      }
    });

    it('preserves non-screenshot assets during regeneration', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      await service.captureAllScreenshots('session-1');
      await service.generateAppIcon('session-1');

      await service.regenerateOnScreenflowChange('session-1');
      const assets = await service.getAssets('session-1');

      const icons = assets.filter((a) => a.type === 'app-icon');
      expect(icons).toHaveLength(1);
    });
  });

  describe('getAssets', () => {
    it('returns empty array for unknown session', async () => {
      const { service } = createService();

      const assets = await service.getAssets('unknown-session');

      expect(assets).toEqual([]);
    });

    it('returns all assets for a session', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      await service.captureAllScreenshots('session-1');
      await service.generateAppIcon('session-1');
      await service.generateFeatureGraphic('session-1');

      const assets = await service.getAssets('session-1');

      expect(assets).toHaveLength(5); // 3 screenshots + 1 icon + 1 feature graphic
    });

    it('keeps assets isolated between sessions', async () => {
      const { service } = createService({ targetPlatforms: ['apple'] });

      await service.captureScreenshot('session-1', 'iphone-6.7');
      await service.captureScreenshot('session-2', 'ipad');

      const assets1 = await service.getAssets('session-1');
      const assets2 = await service.getAssets('session-2');

      expect(assets1).toHaveLength(1);
      expect(assets2).toHaveLength(1);
      expect(assets1[0].deviceSize).toBe('iphone-6.7');
      expect(assets2[0].deviceSize).toBe('ipad');
    });
  });

  describe('Platform Requirements', () => {
    it('Apple requirements define correct iPhone 6.7" dimensions', () => {
      const iphone67 = APPLE_REQUIREMENTS.screenshotSizes.find(
        (s) => s.deviceSize === 'iphone-6.7',
      );
      expect(iphone67).toBeDefined();
      expect(iphone67!.width).toBe(1290);
      expect(iphone67!.height).toBe(2796);
      expect(iphone67!.required).toBe(true);
    });

    it('Apple requirements define correct iPhone 6.5" dimensions', () => {
      const iphone65 = APPLE_REQUIREMENTS.screenshotSizes.find(
        (s) => s.deviceSize === 'iphone-6.5',
      );
      expect(iphone65).toBeDefined();
      expect(iphone65!.width).toBe(1284);
      expect(iphone65!.height).toBe(2778);
      expect(iphone65!.required).toBe(true);
    });

    it('Apple requirements define correct iPad dimensions', () => {
      const ipad = APPLE_REQUIREMENTS.screenshotSizes.find((s) => s.deviceSize === 'ipad');
      expect(ipad).toBeDefined();
      expect(ipad!.width).toBe(2048);
      expect(ipad!.height).toBe(2732);
    });

    it('Apple requirements define 1024×1024 app icon', () => {
      expect(APPLE_REQUIREMENTS.appIcon.width).toBe(1024);
      expect(APPLE_REQUIREMENTS.appIcon.height).toBe(1024);
      expect(APPLE_REQUIREMENTS.appIcon.format).toBe('png');
      expect(APPLE_REQUIREMENTS.appIcon.maxSizeBytes).toBe(1024 * 1024);
    });

    it('Google requirements define correct phone dimensions', () => {
      const phone = GOOGLE_REQUIREMENTS.screenshotSizes.find(
        (s) => s.deviceSize === 'google-play-phone',
      );
      expect(phone).toBeDefined();
      expect(phone!.width).toBe(1080);
      expect(phone!.height).toBe(1920);
    });

    it('Google requirements define correct tablet dimensions', () => {
      const tablet = GOOGLE_REQUIREMENTS.screenshotSizes.find(
        (s) => s.deviceSize === 'google-play-tablet',
      );
      expect(tablet).toBeDefined();
      expect(tablet!.width).toBe(1200);
      expect(tablet!.height).toBe(1920);
    });

    it('Google requirements define 1024×500 feature graphic', () => {
      expect(GOOGLE_REQUIREMENTS.featureGraphic).toBeDefined();
      expect(GOOGLE_REQUIREMENTS.featureGraphic!.width).toBe(1024);
      expect(GOOGLE_REQUIREMENTS.featureGraphic!.height).toBe(500);
      expect(GOOGLE_REQUIREMENTS.featureGraphic!.maxSizeBytes).toBe(1024 * 1024);
    });

    it('both platforms allow max 10 screenshots per size', () => {
      expect(APPLE_REQUIREMENTS.maxScreenshotsPerSize).toBe(10);
      expect(GOOGLE_REQUIREMENTS.maxScreenshotsPerSize).toBe(10);
    });

    it('both platforms allow PNG and JPEG formats', () => {
      expect(APPLE_REQUIREMENTS.allowedFormats).toContain('png');
      expect(APPLE_REQUIREMENTS.allowedFormats).toContain('jpeg');
      expect(GOOGLE_REQUIREMENTS.allowedFormats).toContain('png');
      expect(GOOGLE_REQUIREMENTS.allowedFormats).toContain('jpeg');
    });
  });
});
