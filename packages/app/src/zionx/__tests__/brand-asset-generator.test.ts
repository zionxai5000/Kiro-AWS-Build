/**
 * Unit tests for ZionX Design Excellence — Brand Asset Generator
 *
 * Validates: Requirements 11c.6
 *
 * Tests app icon generation (1024x1024), splash screen generation,
 * in-app header generation, promotional artwork generation, and
 * consistency with the app's design system.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BrandAssetGenerator,
  REQUIRED_ASSETS,
  IOS_ICON_SIZES,
  ANDROID_ICON_SIZES,
} from '../design/brand-asset-generator.js';
import type {
  BrandAssetResult,
  GeneratedAsset,
  AppIconSpec,
  SplashScreenSpec,
  LLMDriver,
} from '../design/brand-asset-generator.js';
import type { DesignSystem } from '../design/design-system-generator.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockLLMDriver(): LLMDriver {
  return {
    execute: vi.fn(async () => ({
      success: true,
      data: 'Generated alt text descriptions',
      metadata: {},
    })),
  } as unknown as LLMDriver;
}

function createMockZikaronService(): ZikaronService {
  return {
    storeEpisodic: vi.fn(async () => 'id'),
    storeSemantic: vi.fn(async () => 'id'),
    storeProcedural: vi.fn(async () => 'id'),
    storeWorking: vi.fn(async () => 'id'),
    query: vi.fn(async () => []),
    queryByAgent: vi.fn(async () => []),
    loadAgentContext: vi.fn(async () => ({ agentId: '', episodic: [], semantic: [], procedural: [], working: null })),
    flagConflict: vi.fn(async () => {}),
  } as unknown as ZikaronService;
}

function createMockDesignSystem(): DesignSystem {
  return {
    id: 'ds-brand-test',
    appId: 'brand-app',
    appName: 'BrandApp',
    version: '1.0.0',
    category: 'wellness',
    colorPalette: {
      primary: '#4CAF50',
      primaryLight: '#81C784',
      primaryDark: '#388E3C',
      secondary: '#FF9800',
      secondaryLight: '#FFB74D',
      secondaryDark: '#F57C00',
      accent: '#03A9F4',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      error: '#F44336',
      warning: '#FF9800',
      success: '#4CAF50',
      info: '#2196F3',
      textPrimary: '#212121',
      textSecondary: '#757575',
      textDisabled: '#BDBDBD',
      divider: '#E0E0E0',
    },
    typography: {
      fontFamily: { primary: 'SF Pro Rounded', secondary: 'Nunito', mono: 'SF Mono' },
      sizes: {
        h1: { size: 34, lineHeight: 41, weight: 700, letterSpacing: 0.37 },
        h2: { size: 28, lineHeight: 34, weight: 700, letterSpacing: 0.36 },
        h3: { size: 22, lineHeight: 28, weight: 600, letterSpacing: 0.35 },
        h4: { size: 20, lineHeight: 25, weight: 600, letterSpacing: 0.38 },
        body1: { size: 17, lineHeight: 22, weight: 400, letterSpacing: -0.41 },
        body2: { size: 15, lineHeight: 20, weight: 400, letterSpacing: -0.24 },
        caption: { size: 12, lineHeight: 16, weight: 400, letterSpacing: 0 },
        button: { size: 17, lineHeight: 22, weight: 600, letterSpacing: -0.41 },
        overline: { size: 10, lineHeight: 13, weight: 600, letterSpacing: 1.5 },
      },
    },
    spacing: {
      unit: 4,
      scale: { xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 },
      borderRadius: { none: 0, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20, full: 9999 },
    },
    iconography: { style: 'rounded', size: { sm: 16, md: 24, lg: 32, xl: 48 }, strokeWidth: 1.5, cornerRadius: 2 },
    animations: {
      durations: { fast: 150, normal: 300, slow: 500 },
      easings: { standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)', decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)', accelerate: 'cubic-bezier(0.4, 0.0, 1, 1)', spring: 'spring(1, 80, 10, 0)' },
      transitions: {
        pageEnter: { duration: 300, easing: 'decelerate', type: 'slide_up' },
        pageExit: { duration: 250, easing: 'accelerate', type: 'fade_out' },
        elementEnter: { duration: 200, easing: 'decelerate', type: 'fade_in_up' },
        elementExit: { duration: 150, easing: 'accelerate', type: 'fade_out' },
      },
    },
    components: [],
    similarityScore: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrandAssetGenerator', () => {
  let generator: BrandAssetGenerator;
  let mockLLM: LLMDriver;
  let mockZikaron: ZikaronService;
  let designSystem: DesignSystem;

  beforeEach(() => {
    mockLLM = createMockLLMDriver();
    mockZikaron = createMockZikaronService();
    generator = new BrandAssetGenerator(mockLLM, mockZikaron);
    designSystem = createMockDesignSystem();
  });

  // -------------------------------------------------------------------------
  // App icon generation (1024x1024)
  // -------------------------------------------------------------------------

  describe('app icon generation', () => {
    it('should generate a 1024x1024 app icon', async () => {
      const result = await generator.generateAssets('app-1', 'TestApp', designSystem);

      const icon = result.assets.find((a) => a.type === 'app_icon');
      expect(icon).toBeDefined();
      expect(icon!.width).toBe(1024);
      expect(icon!.height).toBe(1024);
      expect(icon!.format).toBe('png');
    });

    it('should generate icon variants for all iOS sizes', async () => {
      const result = await generator.generateAssets('app-2', 'TestApp', designSystem);

      const iosVariants = result.iconVariants.filter((v) =>
        v.filePath.includes('-ios-'),
      );

      expect(iosVariants.length).toBe(IOS_ICON_SIZES.length);

      for (const size of IOS_ICON_SIZES) {
        const variant = iosVariants.find((v) => v.width === size.size && v.height === size.size);
        expect(variant).toBeDefined();
      }
    });

    it('should generate icon variants for all Android sizes', async () => {
      const result = await generator.generateAssets('app-3', 'TestApp', designSystem);

      const androidVariants = result.iconVariants.filter((v) =>
        v.filePath.includes('-android-'),
      );

      expect(androidVariants.length).toBe(ANDROID_ICON_SIZES.length);

      for (const size of ANDROID_ICON_SIZES) {
        const variant = androidVariants.find((v) => v.width === size.size && v.height === size.size);
        expect(variant).toBeDefined();
      }
    });

    it('designAppIcon should return correct spec', () => {
      const spec = generator.designAppIcon(designSystem);

      expect(spec.size).toBe(1024);
      expect(spec.cornerRadius).toBe(224);
      expect(spec.backgroundColor).toBe(designSystem.colorPalette.primary);
      expect(spec.foregroundColor).toBe('#FFFFFF');
      expect(spec.iconStyle).toBe('glyph');
      expect(spec.hasGradient).toBe(true);
      expect(spec.gradientColors).toContain(designSystem.colorPalette.primary);
      expect(spec.gradientColors).toContain(designSystem.colorPalette.primaryDark);
    });
  });

  // -------------------------------------------------------------------------
  // Splash screen generation
  // -------------------------------------------------------------------------

  describe('splash screen generation', () => {
    it('should generate splash screens for iOS and Android', async () => {
      const result = await generator.generateAssets('app-4', 'TestApp', designSystem);

      const splashScreens = result.assets.filter((a) => a.type === 'splash_screen');
      expect(splashScreens.length).toBe(2); // iOS + Android

      const iosSplash = splashScreens.find((s) => s.filePath.includes('-ios-'));
      expect(iosSplash).toBeDefined();
      expect(iosSplash!.width).toBe(1290);
      expect(iosSplash!.height).toBe(2796);

      const androidSplash = splashScreens.find((s) => s.filePath.includes('-android-'));
      expect(androidSplash).toBeDefined();
      expect(androidSplash!.width).toBe(1080);
      expect(androidSplash!.height).toBe(1920);
    });

    it('designSplashScreen should return correct spec', () => {
      const spec = generator.designSplashScreen(designSystem);

      expect(spec.width).toBe(1290);
      expect(spec.height).toBe(2796);
      expect(spec.backgroundColor).toBe(designSystem.colorPalette.background);
      expect(spec.logoPlacement).toBe('center');
      expect(spec.hasAnimation).toBe(true);
      expect(spec.animationType).toBe('scale_up');
    });
  });

  // -------------------------------------------------------------------------
  // In-app header generation
  // -------------------------------------------------------------------------

  describe('in-app header generation', () => {
    it('should generate an in-app header asset', async () => {
      const result = await generator.generateAssets('app-5', 'TestApp', designSystem);

      const header = result.assets.find((a) => a.type === 'header');
      expect(header).toBeDefined();
      expect(header!.width).toBe(1500);
      expect(header!.height).toBe(500);
      expect(header!.format).toBe('png');
    });
  });

  // -------------------------------------------------------------------------
  // Promotional artwork generation
  // -------------------------------------------------------------------------

  describe('promotional artwork generation', () => {
    it('should generate promotional artwork', async () => {
      const result = await generator.generateAssets('app-6', 'TestApp', designSystem);

      const promo = result.assets.find((a) => a.type === 'promo_artwork');
      expect(promo).toBeDefined();
      expect(promo!.width).toBe(1024);
      expect(promo!.height).toBe(500);
      expect(promo!.format).toBe('png');
    });

    it('should generate feature graphic for Android', async () => {
      const result = await generator.generateAssets('app-7', 'TestApp', designSystem);

      const feature = result.assets.find((a) => a.type === 'feature_graphic');
      expect(feature).toBeDefined();
      expect(feature!.width).toBe(1024);
      expect(feature!.height).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // Consistency with design system
  // -------------------------------------------------------------------------

  describe('consistency with design system', () => {
    it('all assets should reference the design system id', async () => {
      const result = await generator.generateAssets('app-8', 'TestApp', designSystem);

      for (const asset of result.assets) {
        expect(asset.designSystemId).toBe(designSystem.id);
      }

      for (const variant of result.iconVariants) {
        expect(variant.designSystemId).toBe(designSystem.id);
      }
    });

    it('all assets should use the design system color palette', async () => {
      const result = await generator.generateAssets('app-9', 'TestApp', designSystem);

      for (const asset of result.assets) {
        expect(asset.colorPalette.primary).toBe(designSystem.colorPalette.primary);
        expect(asset.colorPalette.secondary).toBe(designSystem.colorPalette.secondary);
        expect(asset.colorPalette.background).toBe(designSystem.colorPalette.background);
      }
    });

    it('result should include correct appId and designSystemId', async () => {
      const result = await generator.generateAssets('app-10', 'TestApp', designSystem);

      expect(result.appId).toBe('app-10');
      expect(result.designSystemId).toBe(designSystem.id);
    });

    it('totalAssets should equal assets + iconVariants', async () => {
      const result = await generator.generateAssets('app-11', 'TestApp', designSystem);

      expect(result.totalAssets).toBe(result.assets.length + result.iconVariants.length);
    });

    it('should call LLM driver for alt text generation', async () => {
      await generator.generateAssets('app-12', 'TestApp', designSystem);

      expect(mockLLM.execute).toHaveBeenCalled();
      const call = (mockLLM.execute as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.type).toBe('generate');
      expect(call.params.prompt).toContain('TestApp');
    });
  });

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  describe('persistence to Zikaron', () => {
    it('should store assets via storeProcedural', async () => {
      await generator.generateAssets('app-13', 'TestApp', designSystem);

      expect(mockZikaron.storeProcedural).toHaveBeenCalledTimes(1);
      const call = (mockZikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0]![0];

      expect(call.content).toContain('app-13');
      expect(call.tags).toContain('brand-assets');
      expect(call.sourceAgentId).toBe('zionx-app-factory');
      expect(call.layer).toBe('procedural');
      expect(call.steps.length).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // REQUIRED_ASSETS constant
  // -------------------------------------------------------------------------

  describe('REQUIRED_ASSETS constant', () => {
    it('should define all required asset types', () => {
      const types = REQUIRED_ASSETS.map((a) => a.type);

      expect(types).toContain('app_icon');
      expect(types).toContain('splash_screen');
      expect(types).toContain('header');
      expect(types).toContain('promo_artwork');
      expect(types).toContain('feature_graphic');
    });

    it('app_icon should be 1024x1024 png', () => {
      const icon = REQUIRED_ASSETS.find((a) => a.type === 'app_icon')!;
      expect(icon.width).toBe(1024);
      expect(icon.height).toBe(1024);
      expect(icon.format).toBe('png');
    });
  });
});
