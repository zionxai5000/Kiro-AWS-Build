/**
 * ZionX App Development Studio — Store Asset Generator
 *
 * Generates and validates store assets (screenshots, app icons, feature graphics,
 * promotional banners) for Apple App Store and Google Play Store submissions.
 * Captures screenshots from the preview runtime across all required device sizes,
 * generates localized captions, and validates assets against platform-specific requirements.
 *
 * Requirements: 42h.24, 42h.25, 42h.26, 42h.27
 */

import type { DeviceProfile } from './device-profiles.js';
import {
  IPHONE_15_PRO_MAX,
  IPAD_PRO_12_9,
  PIXEL_8,
  ANDROID_TABLET_10,
} from './device-profiles.js';

// ---------------------------------------------------------------------------
// Asset Types
// ---------------------------------------------------------------------------

export type AssetType = 'screenshot' | 'app-icon' | 'feature-graphic' | 'promo-banner';
export type Platform = 'apple' | 'google';

export interface StoreAsset {
  id: string;
  type: AssetType;
  platform: Platform;
  deviceSize: string;
  width: number;
  height: number;
  filePath: string;
  caption?: string;
  locale?: string;
  validationStatus: 'pending' | 'valid' | 'invalid';
  validationErrors?: string[];
}

// ---------------------------------------------------------------------------
// Platform-Specific Requirements
// ---------------------------------------------------------------------------

export interface ScreenshotSizeRequirement {
  deviceSize: string;
  width: number;
  height: number;
  required: boolean;
}

export interface AssetSizeRequirement {
  width: number;
  height: number;
  format: string;
  maxSizeBytes: number;
}

export interface PlatformAssetRequirements {
  platform: Platform;
  screenshotSizes: ScreenshotSizeRequirement[];
  appIcon: AssetSizeRequirement;
  featureGraphic?: AssetSizeRequirement;
  maxScreenshotsPerSize: number;
  allowedFormats: string[];
}

export const APPLE_REQUIREMENTS: PlatformAssetRequirements = {
  platform: 'apple',
  screenshotSizes: [
    { deviceSize: 'iphone-6.7', width: 1290, height: 2796, required: true },
    { deviceSize: 'iphone-6.5', width: 1284, height: 2778, required: true },
    { deviceSize: 'ipad', width: 2048, height: 2732, required: false },
  ],
  appIcon: { width: 1024, height: 1024, format: 'png', maxSizeBytes: 1024 * 1024 },
  maxScreenshotsPerSize: 10,
  allowedFormats: ['png', 'jpeg'],
};

export const GOOGLE_REQUIREMENTS: PlatformAssetRequirements = {
  platform: 'google',
  screenshotSizes: [
    { deviceSize: 'google-play-phone', width: 1080, height: 1920, required: true },
    { deviceSize: 'google-play-tablet', width: 1200, height: 1920, required: false },
  ],
  appIcon: { width: 512, height: 512, format: 'png', maxSizeBytes: 1024 * 1024 },
  featureGraphic: { width: 1024, height: 500, format: 'png', maxSizeBytes: 1024 * 1024 },
  maxScreenshotsPerSize: 10,
  allowedFormats: ['png', 'jpeg'],
};

// ---------------------------------------------------------------------------
// Device Size to Profile Mapping
// ---------------------------------------------------------------------------

const DEVICE_SIZE_PROFILES: Record<string, { profile: DeviceProfile; platform: Platform }> = {
  'iphone-6.7': { profile: IPHONE_15_PRO_MAX, platform: 'apple' },
  'iphone-6.5': {
    profile: {
      ...IPHONE_15_PRO_MAX,
      id: 'iphone-6.5',
      name: 'iPhone 6.5"',
      screenshotWidth: 1284,
      screenshotHeight: 2778,
    },
    platform: 'apple',
  },
  'ipad': { profile: IPAD_PRO_12_9, platform: 'apple' },
  'google-play-phone': {
    profile: {
      ...PIXEL_8,
      id: 'google-play-phone',
      name: 'Google Play Phone',
      screenshotWidth: 1080,
      screenshotHeight: 1920,
    },
    platform: 'google',
  },
  'google-play-tablet': {
    profile: {
      ...ANDROID_TABLET_10,
      id: 'google-play-tablet',
      name: 'Google Play Tablet',
      screenshotWidth: 1200,
      screenshotHeight: 1920,
    },
    platform: 'google',
  },
};

// ---------------------------------------------------------------------------
// Dependency Injection Interfaces
// ---------------------------------------------------------------------------

export interface ScreenshotCapturer {
  capture(previewUrl: string, width: number, height: number): Promise<Buffer>;
}

export interface ImageGenerator {
  generateIcon(appName: string, designSystem: Record<string, unknown>): Promise<Buffer>;
  generateFeatureGraphic(
    appName: string,
    description: string,
    designSystem: Record<string, unknown>,
  ): Promise<Buffer>;
  generatePromoBanner(
    appName: string,
    tagline: string,
    designSystem: Record<string, unknown>,
  ): Promise<Buffer>;
}

export interface CaptionGenerator {
  generateCaptions(
    screenshots: StoreAsset[],
    appDescription: string,
    locale: string,
  ): Promise<Map<string, string>>;
}

export interface HookEmitter {
  emit(hookName: string, payload: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Store Asset Generator Service Interface
// ---------------------------------------------------------------------------

export interface StoreAssetGeneratorService {
  captureAllScreenshots(sessionId: string): Promise<StoreAsset[]>;
  captureScreenshot(sessionId: string, deviceSize: string): Promise<StoreAsset>;
  generateAppIcon(sessionId: string): Promise<StoreAsset>;
  generateFeatureGraphic(sessionId: string): Promise<StoreAsset>;
  generatePromoBanner(sessionId: string): Promise<StoreAsset>;
  generateCaptions(sessionId: string, locale?: string): Promise<Map<string, string>>;
  validateAssets(
    sessionId: string,
  ): Promise<{ valid: boolean; errors: { assetId: string; errors: string[] }[] }>;
  getAssets(sessionId: string): Promise<StoreAsset[]>;
  regenerateOnScreenflowChange(sessionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface StoreAssetGeneratorConfig {
  previewBaseUrl: string;
  outputDir: string;
  appName: string;
  appDescription: string;
  appTagline: string;
  designSystem: Record<string, unknown>;
  targetPlatforms: Platform[];
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultStoreAssetGeneratorService implements StoreAssetGeneratorService {
  private readonly assets: Map<string, StoreAsset[]> = new Map();
  private readonly screenshotCapturer: ScreenshotCapturer;
  private readonly imageGenerator: ImageGenerator;
  private readonly captionGenerator: CaptionGenerator;
  private readonly hookEmitter: HookEmitter;
  private readonly config: StoreAssetGeneratorConfig;
  private assetCounter = 0;

  constructor(
    screenshotCapturer: ScreenshotCapturer,
    imageGenerator: ImageGenerator,
    captionGenerator: CaptionGenerator,
    hookEmitter: HookEmitter,
    config: StoreAssetGeneratorConfig,
  ) {
    this.screenshotCapturer = screenshotCapturer;
    this.imageGenerator = imageGenerator;
    this.captionGenerator = captionGenerator;
    this.hookEmitter = hookEmitter;
    this.config = config;
  }

  async captureAllScreenshots(sessionId: string): Promise<StoreAsset[]> {
    const results: StoreAsset[] = [];
    const deviceSizes = this.getRequiredDeviceSizes();

    for (const deviceSize of deviceSizes) {
      const asset = await this.captureScreenshot(sessionId, deviceSize);
      results.push(asset);
    }

    return results;
  }

  async captureScreenshot(sessionId: string, deviceSize: string): Promise<StoreAsset> {
    const deviceInfo = DEVICE_SIZE_PROFILES[deviceSize];
    if (!deviceInfo) {
      throw new Error(`Unknown device size: ${deviceSize}`);
    }

    const { profile, platform } = deviceInfo;
    const previewUrl = `${this.config.previewBaseUrl}/${sessionId}`;

    const buffer = await this.screenshotCapturer.capture(
      previewUrl,
      profile.screenshotWidth,
      profile.screenshotHeight,
    );

    const asset: StoreAsset = {
      id: this.generateAssetId(),
      type: 'screenshot',
      platform,
      deviceSize,
      width: profile.screenshotWidth,
      height: profile.screenshotHeight,
      filePath: `${this.config.outputDir}/${sessionId}/screenshots/${deviceSize}.png`,
      validationStatus: 'pending',
    };

    this.addAsset(sessionId, asset);
    return asset;
  }

  async generateAppIcon(sessionId: string): Promise<StoreAsset> {
    const buffer = await this.imageGenerator.generateIcon(
      this.config.appName,
      this.config.designSystem,
    );

    const asset: StoreAsset = {
      id: this.generateAssetId(),
      type: 'app-icon',
      platform: this.config.targetPlatforms.includes('apple') ? 'apple' : 'google',
      deviceSize: 'universal',
      width: 1024,
      height: 1024,
      filePath: `${this.config.outputDir}/${sessionId}/icons/app-icon.png`,
      validationStatus: 'pending',
    };

    this.addAsset(sessionId, asset);
    return asset;
  }

  async generateFeatureGraphic(sessionId: string): Promise<StoreAsset> {
    const buffer = await this.imageGenerator.generateFeatureGraphic(
      this.config.appName,
      this.config.appDescription,
      this.config.designSystem,
    );

    const asset: StoreAsset = {
      id: this.generateAssetId(),
      type: 'feature-graphic',
      platform: 'google',
      deviceSize: 'universal',
      width: 1024,
      height: 500,
      filePath: `${this.config.outputDir}/${sessionId}/graphics/feature-graphic.png`,
      validationStatus: 'pending',
    };

    this.addAsset(sessionId, asset);
    return asset;
  }

  async generatePromoBanner(sessionId: string): Promise<StoreAsset> {
    const buffer = await this.imageGenerator.generatePromoBanner(
      this.config.appName,
      this.config.appTagline,
      this.config.designSystem,
    );

    const asset: StoreAsset = {
      id: this.generateAssetId(),
      type: 'promo-banner',
      platform: this.config.targetPlatforms.includes('apple') ? 'apple' : 'google',
      deviceSize: 'universal',
      width: 1024,
      height: 500,
      filePath: `${this.config.outputDir}/${sessionId}/graphics/promo-banner.png`,
      validationStatus: 'pending',
    };

    this.addAsset(sessionId, asset);
    return asset;
  }

  async generateCaptions(
    sessionId: string,
    locale: string = 'en-US',
  ): Promise<Map<string, string>> {
    const sessionAssets = this.getSessionAssets(sessionId);
    const screenshots = sessionAssets.filter((a) => a.type === 'screenshot');

    const captions = await this.captionGenerator.generateCaptions(
      screenshots,
      this.config.appDescription,
      locale,
    );

    // Apply captions to assets
    for (const asset of screenshots) {
      const caption = captions.get(asset.id);
      if (caption) {
        asset.caption = caption;
        asset.locale = locale;
      }
    }

    return captions;
  }

  async validateAssets(
    sessionId: string,
  ): Promise<{ valid: boolean; errors: { assetId: string; errors: string[] }[] }> {
    const sessionAssets = this.getSessionAssets(sessionId);
    const allErrors: { assetId: string; errors: string[] }[] = [];

    for (const asset of sessionAssets) {
      const errors = this.validateAsset(asset);
      if (errors.length > 0) {
        asset.validationStatus = 'invalid';
        asset.validationErrors = errors;
        allErrors.push({ assetId: asset.id, errors });
      } else {
        asset.validationStatus = 'valid';
        asset.validationErrors = undefined;
      }
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
    };
  }

  async getAssets(sessionId: string): Promise<StoreAsset[]> {
    return this.getSessionAssets(sessionId);
  }

  async regenerateOnScreenflowChange(sessionId: string): Promise<void> {
    // Clear existing screenshots for this session
    const sessionAssets = this.getSessionAssets(sessionId);
    const nonScreenshots = sessionAssets.filter((a) => a.type !== 'screenshot');
    this.assets.set(sessionId, nonScreenshots);

    // Recapture all screenshots
    await this.captureAllScreenshots(sessionId);

    // Emit hook to notify of regeneration
    this.hookEmitter.emit('app.screenflow.changed', {
      sessionId,
      timestamp: Date.now(),
      reason: 'navigation-change',
    });
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private getRequiredDeviceSizes(): string[] {
    const sizes: string[] = [];

    for (const platform of this.config.targetPlatforms) {
      const requirements = platform === 'apple' ? APPLE_REQUIREMENTS : GOOGLE_REQUIREMENTS;
      for (const size of requirements.screenshotSizes) {
        sizes.push(size.deviceSize);
      }
    }

    return sizes;
  }

  private validateAsset(asset: StoreAsset): string[] {
    const errors: string[] = [];
    const requirements = asset.platform === 'apple' ? APPLE_REQUIREMENTS : GOOGLE_REQUIREMENTS;

    switch (asset.type) {
      case 'screenshot':
        this.validateScreenshot(asset, requirements, errors);
        break;
      case 'app-icon':
        this.validateAppIcon(asset, requirements, errors);
        break;
      case 'feature-graphic':
        this.validateFeatureGraphic(asset, requirements, errors);
        break;
      case 'promo-banner':
        // Promo banners follow feature graphic dimensions
        if (requirements.featureGraphic) {
          this.validateFeatureGraphicDimensions(asset, requirements.featureGraphic, errors);
        }
        break;
    }

    return errors;
  }

  private validateScreenshot(
    asset: StoreAsset,
    requirements: PlatformAssetRequirements,
    errors: string[],
  ): void {
    const sizeReq = requirements.screenshotSizes.find((s) => s.deviceSize === asset.deviceSize);

    if (!sizeReq) {
      errors.push(`Unknown device size "${asset.deviceSize}" for platform "${asset.platform}"`);
      return;
    }

    if (asset.width !== sizeReq.width || asset.height !== sizeReq.height) {
      errors.push(
        `Screenshot dimensions ${asset.width}×${asset.height} do not match required ${sizeReq.width}×${sizeReq.height} for ${asset.deviceSize}`,
      );
    }

    // Validate file format
    const extension = asset.filePath.split('.').pop()?.toLowerCase();
    if (extension && !requirements.allowedFormats.includes(extension)) {
      errors.push(
        `File format "${extension}" not allowed. Allowed formats: ${requirements.allowedFormats.join(', ')}`,
      );
    }
  }

  private validateAppIcon(
    asset: StoreAsset,
    requirements: PlatformAssetRequirements,
    errors: string[],
  ): void {
    const iconReq = requirements.appIcon;

    if (asset.width !== iconReq.width || asset.height !== iconReq.height) {
      errors.push(
        `App icon dimensions ${asset.width}×${asset.height} do not match required ${iconReq.width}×${iconReq.height}`,
      );
    }

    const extension = asset.filePath.split('.').pop()?.toLowerCase();
    if (extension && extension !== iconReq.format) {
      errors.push(`App icon must be in ${iconReq.format} format, got "${extension}"`);
    }
  }

  private validateFeatureGraphic(
    asset: StoreAsset,
    requirements: PlatformAssetRequirements,
    errors: string[],
  ): void {
    if (!requirements.featureGraphic) {
      errors.push(`Feature graphic not required for platform "${asset.platform}"`);
      return;
    }

    this.validateFeatureGraphicDimensions(asset, requirements.featureGraphic, errors);
  }

  private validateFeatureGraphicDimensions(
    asset: StoreAsset,
    requirement: AssetSizeRequirement,
    errors: string[],
  ): void {
    if (asset.width !== requirement.width || asset.height !== requirement.height) {
      errors.push(
        `Dimensions ${asset.width}×${asset.height} do not match required ${requirement.width}×${requirement.height}`,
      );
    }
  }

  private generateAssetId(): string {
    this.assetCounter += 1;
    return `asset-${this.assetCounter}`;
  }

  private getSessionAssets(sessionId: string): StoreAsset[] {
    return this.assets.get(sessionId) ?? [];
  }

  private addAsset(sessionId: string, asset: StoreAsset): void {
    const existing = this.assets.get(sessionId) ?? [];
    existing.push(asset);
    this.assets.set(sessionId, existing);
  }
}
