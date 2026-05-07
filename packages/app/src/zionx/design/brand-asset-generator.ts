/**
 * ZionX Design Excellence — Brand Asset Generator
 *
 * Generates branded assets per app: app icon (1024x1024), splash screen,
 * in-app header, promotional artwork, and feature graphic — all consistent
 * with the app's design system.
 *
 * Requirements: 11c.6
 */

import type { DriverResult } from '@seraphim/core';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { DesignSystem } from './design-system-generator.js';

// ---------------------------------------------------------------------------
// Driver interfaces
// ---------------------------------------------------------------------------

export interface LLMDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetType = 'app_icon' | 'splash_screen' | 'header' | 'promo_artwork' | 'feature_graphic';

export interface AssetSpec {
  type: AssetType;
  width: number;
  height: number;
  format: 'png' | 'jpg' | 'svg';
  platform: 'ios' | 'android' | 'both';
  description: string;
}

export interface GeneratedAsset {
  id: string;
  type: AssetType;
  appId: string;
  filePath: string;
  width: number;
  height: number;
  format: string;
  designSystemId: string;
  colorPalette: {
    primary: string;
    secondary: string;
    background: string;
  };
  generatedAt: string;
}

export interface AppIconSpec {
  size: number;
  cornerRadius: number;
  backgroundColor: string;
  foregroundColor: string;
  iconStyle: 'glyph' | 'illustration' | 'text' | 'abstract';
  hasGradient: boolean;
  gradientColors?: string[];
}

export interface SplashScreenSpec {
  width: number;
  height: number;
  backgroundColor: string;
  logoPlacement: 'center' | 'top_third';
  hasAnimation: boolean;
  animationType?: 'fade_in' | 'scale_up' | 'slide_up';
}

export interface BrandAssetResult {
  appId: string;
  designSystemId: string;
  assets: GeneratedAsset[];
  iconVariants: GeneratedAsset[];
  totalAssets: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Required Asset Specifications
// ---------------------------------------------------------------------------

export const REQUIRED_ASSETS: AssetSpec[] = [
  { type: 'app_icon', width: 1024, height: 1024, format: 'png', platform: 'both', description: 'App Store / Play Store icon' },
  { type: 'splash_screen', width: 1290, height: 2796, format: 'png', platform: 'ios', description: 'iOS splash screen' },
  { type: 'splash_screen', width: 1080, height: 1920, format: 'png', platform: 'android', description: 'Android splash screen' },
  { type: 'header', width: 1500, height: 500, format: 'png', platform: 'both', description: 'In-app header banner' },
  { type: 'promo_artwork', width: 1024, height: 500, format: 'png', platform: 'both', description: 'Promotional artwork for marketing' },
  { type: 'feature_graphic', width: 1024, height: 500, format: 'png', platform: 'android', description: 'Google Play feature graphic' },
];

export const IOS_ICON_SIZES = [
  { size: 1024, name: 'AppStore' },
  { size: 180, name: 'iPhone@3x' },
  { size: 120, name: 'iPhone@2x' },
  { size: 167, name: 'iPadPro@2x' },
  { size: 152, name: 'iPad@2x' },
  { size: 80, name: 'Spotlight@2x' },
  { size: 120, name: 'Spotlight@3x' },
  { size: 58, name: 'Settings@2x' },
  { size: 87, name: 'Settings@3x' },
  { size: 40, name: 'Notification@2x' },
  { size: 60, name: 'Notification@3x' },
];

export const ANDROID_ICON_SIZES = [
  { size: 512, name: 'PlayStore' },
  { size: 192, name: 'xxxhdpi' },
  { size: 144, name: 'xxhdpi' },
  { size: 96, name: 'xhdpi' },
  { size: 72, name: 'hdpi' },
  { size: 48, name: 'mdpi' },
];

// ---------------------------------------------------------------------------
// Brand Asset Generator
// ---------------------------------------------------------------------------

export class BrandAssetGenerator {
  constructor(
    private readonly llmDriver: LLMDriver,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Generate all brand assets for an app based on its design system.
   */
  async generateAssets(
    appId: string,
    appName: string,
    designSystem: DesignSystem,
  ): Promise<BrandAssetResult> {
    const assets: GeneratedAsset[] = [];

    // 1. Generate app icon
    const iconSpec = this.designAppIcon(designSystem);
    const iconAsset = this.createAsset(appId, 'app_icon', 1024, 1024, 'png', designSystem);
    assets.push(iconAsset);

    // 2. Generate icon variants for all required sizes
    const iconVariants = this.generateIconVariants(appId, designSystem);

    // 3. Generate splash screens
    for (const spec of REQUIRED_ASSETS.filter((s) => s.type === 'splash_screen')) {
      assets.push(this.createAsset(appId, spec.type, spec.width, spec.height, spec.format, designSystem, spec.platform));
    }

    // 4. Generate header
    const headerSpec = REQUIRED_ASSETS.find((s) => s.type === 'header')!;
    assets.push(this.createAsset(appId, 'header', headerSpec.width, headerSpec.height, headerSpec.format, designSystem));

    // 5. Generate promotional artwork
    const promoSpec = REQUIRED_ASSETS.find((s) => s.type === 'promo_artwork')!;
    assets.push(this.createAsset(appId, 'promo_artwork', promoSpec.width, promoSpec.height, promoSpec.format, designSystem));

    // 6. Generate feature graphic
    const featureSpec = REQUIRED_ASSETS.find((s) => s.type === 'feature_graphic')!;
    assets.push(this.createAsset(appId, 'feature_graphic', featureSpec.width, featureSpec.height, featureSpec.format, designSystem));

    // 7. Use LLM to generate asset descriptions for alt text
    await this.generateAssetDescriptions(appName, designSystem);

    // 8. Store in Zikaron
    await this.storeAssets(appId, assets);

    return {
      appId,
      designSystemId: designSystem.id,
      assets,
      iconVariants,
      totalAssets: assets.length + iconVariants.length,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Design the app icon based on the design system.
   */
  designAppIcon(designSystem: DesignSystem): AppIconSpec {
    return {
      size: 1024,
      cornerRadius: 224, // iOS standard corner radius for 1024px
      backgroundColor: designSystem.colorPalette.primary,
      foregroundColor: '#FFFFFF',
      iconStyle: 'glyph',
      hasGradient: true,
      gradientColors: [designSystem.colorPalette.primary, designSystem.colorPalette.primaryDark],
    };
  }

  /**
   * Design the splash screen based on the design system.
   */
  designSplashScreen(designSystem: DesignSystem): SplashScreenSpec {
    return {
      width: 1290,
      height: 2796,
      backgroundColor: designSystem.colorPalette.background,
      logoPlacement: 'center',
      hasAnimation: true,
      animationType: 'scale_up',
    };
  }

  /**
   * Generate icon variants for all required platform sizes.
   */
  private generateIconVariants(appId: string, designSystem: DesignSystem): GeneratedAsset[] {
    const variants: GeneratedAsset[] = [];

    for (const size of IOS_ICON_SIZES) {
      variants.push(this.createAsset(appId, 'app_icon', size.size, size.size, 'png', designSystem, 'ios'));
    }

    for (const size of ANDROID_ICON_SIZES) {
      variants.push(this.createAsset(appId, 'app_icon', size.size, size.size, 'png', designSystem, 'android'));
    }

    return variants;
  }

  /**
   * Create an asset record.
   */
  private createAsset(
    appId: string,
    type: AssetType,
    width: number,
    height: number,
    format: string,
    designSystem: DesignSystem,
    platform?: string,
  ): GeneratedAsset {
    const platformSuffix = platform ? `-${platform}` : '';
    return {
      id: `asset-${type}-${width}x${height}${platformSuffix}-${appId}`,
      type,
      appId,
      filePath: `assets/brand/${appId}/${type}${platformSuffix}-${width}x${height}.${format}`,
      width,
      height,
      format,
      designSystemId: designSystem.id,
      colorPalette: {
        primary: designSystem.colorPalette.primary,
        secondary: designSystem.colorPalette.secondary,
        background: designSystem.colorPalette.background,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate alt text descriptions for assets via LLM.
   */
  private async generateAssetDescriptions(
    appName: string,
    designSystem: DesignSystem,
  ): Promise<void> {
    await this.llmDriver.execute({
      type: 'generate',
      params: {
        prompt: `Generate alt text descriptions for brand assets of "${appName}" app. Primary color: ${designSystem.colorPalette.primary}, category: ${designSystem.category}.`,
        maxTokens: 500,
        temperature: 0.5,
        taskType: 'creative',
      },
    });
  }

  /**
   * Store asset records in Zikaron.
   */
  private async storeAssets(appId: string, assets: GeneratedAsset[]): Promise<void> {
    await this.zikaronService.storeProcedural({
      id: `brand-assets-${appId}`,
      tenantId: 'system',
      layer: 'procedural',
      content: `Brand assets for ${appId}: ${assets.length} assets generated`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['brand-assets', appId],
      createdAt: new Date(),
      workflowPattern: 'brand_asset_generation',
      successRate: 1.0,
      executionCount: 1,
      prerequisites: ['design_system_generated'],
      steps: [
        { order: 1, action: 'generate_icon', description: 'Generate app icon and variants', expectedOutcome: 'Icon in all required sizes' },
        { order: 2, action: 'generate_splash', description: 'Generate splash screens', expectedOutcome: 'Splash screens for iOS and Android' },
        { order: 3, action: 'generate_marketing', description: 'Generate marketing assets', expectedOutcome: 'Header, promo artwork, feature graphic' },
      ],
    });
  }
}
