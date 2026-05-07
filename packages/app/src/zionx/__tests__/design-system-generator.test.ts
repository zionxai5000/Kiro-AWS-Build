/**
 * Unit tests for ZionX Design Excellence — Design System Generator
 *
 * Validates: Requirements 11c.3
 *
 * Tests that the DesignSystemGenerator produces complete, unique design systems
 * per app, enforces <70% visual similarity, and persists results to Zikaron.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DesignSystemGenerator } from '../design/design-system-generator.js';
import type { DesignSystem, ColorPalette, ComponentSpec } from '../design/design-system-generator.js';
import type { DesignIntelligenceEngine, AppCategory, ColorTrend, DesignAnalysisResult } from '../design/design-intelligence.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockColorTrend(category: AppCategory): ColorTrend {
  const categoryColors: Record<string, { primary: string[]; accent: string[] }> = {
    wellness: { primary: ['#4CAF50', '#81C784', '#A5D6A7'], accent: ['#FF9800', '#FFB74D'] },
    productivity: { primary: ['#2196F3', '#1976D2', '#42A5F5'], accent: ['#FF5722', '#FF7043'] },
    finance: { primary: ['#1B5E20', '#2E7D32', '#388E3C'], accent: ['#FFC107', '#FFD54F'] },
    utility: { primary: ['#607D8B', '#78909C', '#90A4AE'], accent: ['#03A9F4', '#29B6F6'] },
    gaming: { primary: ['#9C27B0', '#AB47BC', '#CE93D8'], accent: ['#FF5722', '#FFEB3B'] },
  };
  const colors = categoryColors[category] ?? categoryColors.utility!;
  return {
    category,
    primaryColors: colors.primary,
    accentColors: colors.accent,
    backgroundStyles: ['light', 'dark'],
    dominantPalette: [...colors.primary.slice(0, 2), ...colors.accent.slice(0, 1)],
    analyzedAt: new Date().toISOString(),
  };
}

function createMockAnalysisResult(category: AppCategory, platform: 'ios' | 'android'): DesignAnalysisResult {
  return {
    category,
    platform,
    appsAnalyzed: 10,
    uiPatterns: [],
    colorTrends: createMockColorTrend(category),
    animationStyles: [],
    onboardingFlows: [],
    monetizationUX: [],
    analyzedAt: new Date().toISOString(),
  };
}

function createMockDesignIntelligence(): DesignIntelligenceEngine {
  return {
    analyzeCategory: vi.fn(async (category: AppCategory, platform: 'ios' | 'android') =>
      createMockAnalysisResult(category, platform),
    ),
    loadPatternLibrary: vi.fn(),
  } as unknown as DesignIntelligenceEngine;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

function isValidHex(color: string): boolean {
  return HEX_REGEX.test(color);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DesignSystemGenerator', () => {
  let generator: DesignSystemGenerator;
  let mockDesignIntelligence: DesignIntelligenceEngine;
  let mockZikaron: ZikaronService;

  beforeEach(() => {
    mockDesignIntelligence = createMockDesignIntelligence();
    mockZikaron = createMockZikaronService();
    generator = new DesignSystemGenerator(mockDesignIntelligence, mockZikaron);
  });

  // -------------------------------------------------------------------------
  // generate() — complete design system
  // -------------------------------------------------------------------------

  describe('generate()', () => {
    it('should produce a complete DesignSystem with all required fields', async () => {
      const ds = await generator.generate('app-1', 'TestApp', 'wellness', 'ios');

      // Top-level fields
      expect(ds.id).toContain('app-1');
      expect(ds.appId).toBe('app-1');
      expect(ds.appName).toBe('TestApp');
      expect(ds.version).toBe('1.0.0');
      expect(ds.category).toBe('wellness');
      expect(ds.createdAt).toBeTruthy();
      expect(ds.updatedAt).toBeTruthy();

      // All sub-systems present
      expect(ds.colorPalette).toBeDefined();
      expect(ds.typography).toBeDefined();
      expect(ds.spacing).toBeDefined();
      expect(ds.iconography).toBeDefined();
      expect(ds.animations).toBeDefined();
      expect(ds.components).toBeDefined();
      expect(ds.components.length).toBeGreaterThan(0);
    });

    it('should call designIntelligence.analyzeCategory with correct args', async () => {
      await generator.generate('app-2', 'ProdApp', 'productivity', 'android');

      expect(mockDesignIntelligence.analyzeCategory).toHaveBeenCalledWith('productivity', 'android');
    });

    it('should include all color palette keys', async () => {
      const ds = await generator.generate('app-3', 'FinApp', 'finance', 'ios');
      const palette = ds.colorPalette;

      const expectedKeys: (keyof ColorPalette)[] = [
        'primary', 'primaryLight', 'primaryDark',
        'secondary', 'secondaryLight', 'secondaryDark',
        'accent', 'background', 'surface',
        'error', 'warning', 'success', 'info',
        'textPrimary', 'textSecondary', 'textDisabled', 'divider',
      ];

      for (const key of expectedKeys) {
        expect(palette[key]).toBeDefined();
        expect(typeof palette[key]).toBe('string');
      }
    });

    it('should include typography with fontFamily and all size keys', async () => {
      const ds = await generator.generate('app-4', 'TypoApp', 'utility', 'ios');
      const typo = ds.typography;

      expect(typo.fontFamily.primary).toBeTruthy();
      expect(typo.fontFamily.secondary).toBeTruthy();
      expect(typo.fontFamily.mono).toBeTruthy();

      const sizeKeys = ['h1', 'h2', 'h3', 'h4', 'body1', 'body2', 'caption', 'button', 'overline'] as const;
      for (const key of sizeKeys) {
        expect(typo.sizes[key]).toBeDefined();
        expect(typo.sizes[key].size).toBeGreaterThan(0);
        expect(typo.sizes[key].lineHeight).toBeGreaterThan(0);
      }
    });

    it('should include spacing with unit, scale, and borderRadius', async () => {
      const ds = await generator.generate('app-5', 'SpaceApp', 'wellness', 'ios');
      const spacing = ds.spacing;

      expect(spacing.unit).toBe(4);
      expect(Object.keys(spacing.scale).length).toBeGreaterThan(0);
      expect(Object.keys(spacing.borderRadius).length).toBeGreaterThan(0);
    });

    it('should include animations with durations, easings, and transitions', async () => {
      const ds = await generator.generate('app-6', 'AnimApp', 'gaming', 'android');
      const anim = ds.animations;

      expect(anim.durations.fast).toBeLessThan(anim.durations.normal);
      expect(anim.durations.normal).toBeLessThan(anim.durations.slow);
      expect(anim.easings.standard).toBeTruthy();
      expect(anim.transitions.pageEnter).toBeDefined();
      expect(anim.transitions.pageExit).toBeDefined();
      expect(anim.transitions.elementEnter).toBeDefined();
      expect(anim.transitions.elementExit).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // checkSimilarity()
  // -------------------------------------------------------------------------

  describe('checkSimilarity()', () => {
    it('should return score 0 when no existing systems', () => {
      const palette: ColorPalette = {
        primary: '#2196F3', primaryLight: '#64B5F6', primaryDark: '#1976D2',
        secondary: '#FF5722', secondaryLight: '#FF8A65', secondaryDark: '#E64A19',
        accent: '#FF9800', background: '#FFFFFF', surface: '#F5F5F5',
        error: '#F44336', warning: '#FF9800', success: '#4CAF50', info: '#2196F3',
        textPrimary: '#212121', textSecondary: '#757575', textDisabled: '#BDBDBD', divider: '#E0E0E0',
      };

      const result = generator.checkSimilarity(palette);

      expect(result.score).toBe(0);
      expect(result.comparedWith).toHaveLength(0);
      expect(result.tooSimilar).toBe(false);
      expect(result.details).toContain('No existing systems');
    });

    it('should calculate similarity when existing systems are present', async () => {
      // Generate a first system to populate existingSystems
      await generator.generate('existing-1', 'ExistingApp', 'wellness', 'ios');

      const palette: ColorPalette = {
        primary: '#FF0000', primaryLight: '#FF6666', primaryDark: '#990000',
        secondary: '#00FF00', secondaryLight: '#66FF66', secondaryDark: '#009900',
        accent: '#0000FF', background: '#FFFFFF', surface: '#F5F5F5',
        error: '#F44336', warning: '#FF9800', success: '#4CAF50', info: '#2196F3',
        textPrimary: '#212121', textSecondary: '#757575', textDisabled: '#BDBDBD', divider: '#E0E0E0',
      };

      const result = generator.checkSimilarity(palette);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.comparedWith).toContain('existing-1');
      expect(typeof result.tooSimilar).toBe('boolean');
    });

    it('should flag tooSimilar when score >= 70', async () => {
      // Generate a system first
      const ds = await generator.generate('base-app', 'BaseApp', 'wellness', 'ios');

      // Check with the exact same palette — should be 100% similar
      const result = generator.checkSimilarity(ds.colorPalette);

      expect(result.score).toBe(100);
      expect(result.tooSimilar).toBe(true);
      expect(result.details).toContain('exceeds 70% threshold');
    });
  });

  // -------------------------------------------------------------------------
  // <70% similarity enforcement (retry with variation)
  // -------------------------------------------------------------------------

  describe('similarity enforcement', () => {
    it('should retry generation when palette is too similar to existing', async () => {
      // Generate first app
      await generator.generate('first-app', 'FirstApp', 'wellness', 'ios');

      // Generate second app in same category — should still succeed
      // (the generator retries with variation seeds)
      const ds2 = await generator.generate('second-app', 'SecondApp', 'wellness', 'ios');

      expect(ds2).toBeDefined();
      expect(ds2.appId).toBe('second-app');
      // The similarity score on the final system should be < 70 or the generator
      // exhausted retries (max 5 attempts)
      expect(ds2.similarityScore).toBeDefined();
    });

    it('should call analyzeCategory only once even with retries', async () => {
      await generator.generate('first', 'First', 'productivity', 'ios');
      (mockDesignIntelligence.analyzeCategory as ReturnType<typeof vi.fn>).mockClear();

      await generator.generate('second', 'Second', 'productivity', 'ios');

      // analyzeCategory is called once per generate(), palette retries don't re-analyze
      expect(mockDesignIntelligence.analyzeCategory).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Category-specific typography
  // -------------------------------------------------------------------------

  describe('category-specific typography', () => {
    it('should produce different typography for wellness vs productivity vs finance', async () => {
      const dsWellness = await generator.generate('w-1', 'WellApp', 'wellness', 'ios');
      const dsProductivity = await generator.generate('p-1', 'ProdApp', 'productivity', 'ios');
      const dsFinance = await generator.generate('f-1', 'FinApp', 'finance', 'ios');

      const families = [
        dsWellness.typography.fontFamily.primary,
        dsProductivity.typography.fontFamily.primary,
        dsFinance.typography.fontFamily.primary,
      ];

      // At least two of the three should differ
      const unique = new Set(families);
      expect(unique.size).toBeGreaterThanOrEqual(2);
    });

    it('wellness should use rounded font family', async () => {
      const ds = await generator.generate('well-1', 'WellnessApp', 'wellness', 'ios');
      expect(ds.typography.fontFamily.primary).toContain('Rounded');
    });

    it('productivity should use SF Pro Text', async () => {
      const ds = await generator.generate('prod-1', 'ProdApp', 'productivity', 'ios');
      expect(ds.typography.fontFamily.primary).toBe('SF Pro Text');
    });

    it('finance should use SF Pro Display', async () => {
      const ds = await generator.generate('fin-1', 'FinApp', 'finance', 'ios');
      expect(ds.typography.fontFamily.primary).toBe('SF Pro Display');
    });
  });

  // -------------------------------------------------------------------------
  // Category-specific iconography
  // -------------------------------------------------------------------------

  describe('category-specific iconography', () => {
    it('should produce different iconography styles for different categories', async () => {
      const dsWellness = await generator.generate('ico-w', 'WellApp', 'wellness', 'ios');
      const dsProductivity = await generator.generate('ico-p', 'ProdApp', 'productivity', 'ios');
      const dsGaming = await generator.generate('ico-g', 'GameApp', 'gaming', 'ios');

      expect(dsWellness.iconography.style).toBe('rounded');
      expect(dsProductivity.iconography.style).toBe('outlined');
      expect(dsGaming.iconography.style).toBe('filled');
    });

    it('should include all icon sizes', async () => {
      const ds = await generator.generate('ico-1', 'IconApp', 'utility', 'ios');
      const sizes = ds.iconography.size;

      expect(sizes.sm).toBeLessThan(sizes.md);
      expect(sizes.md).toBeLessThan(sizes.lg);
      expect(sizes.lg).toBeLessThan(sizes.xl);
    });
  });

  // -------------------------------------------------------------------------
  // Components use palette tokens
  // -------------------------------------------------------------------------

  describe('component token integration', () => {
    it('should generate components with tokens from the palette', async () => {
      const ds = await generator.generate('comp-1', 'CompApp', 'wellness', 'ios');
      const palette = ds.colorPalette;
      const components = ds.components;

      expect(components.length).toBeGreaterThan(0);

      // Button should reference palette.primary
      const button = components.find((c: ComponentSpec) => c.name === 'Button');
      expect(button).toBeDefined();
      expect(button!.tokens.backgroundColor).toBe(palette.primary);

      // Card should reference palette.surface
      const card = components.find((c: ComponentSpec) => c.name === 'Card');
      expect(card).toBeDefined();
      expect(card!.tokens.backgroundColor).toBe(palette.surface);

      // Input should reference palette.primary for focus
      const input = components.find((c: ComponentSpec) => c.name === 'Input');
      expect(input).toBeDefined();
      expect(input!.tokens.focusBorderColor).toBe(palette.primary);

      // TabBar should reference palette.primary for active color
      const tabBar = components.find((c: ComponentSpec) => c.name === 'TabBar');
      expect(tabBar).toBeDefined();
      expect(tabBar!.tokens.activeColor).toBe(palette.primary);
    });

    it('should generate components with variants and defaultProps', async () => {
      const ds = await generator.generate('comp-2', 'VarApp', 'productivity', 'ios');

      for (const component of ds.components) {
        expect(component.name).toBeTruthy();
        expect(component.variants.length).toBeGreaterThan(0);
        expect(component.defaultProps).toBeDefined();
        expect(Object.keys(component.tokens).length).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Persistence to Zikaron
  // -------------------------------------------------------------------------

  describe('persistence to Zikaron', () => {
    it('should persist the design system via storeProcedural', async () => {
      await generator.generate('persist-1', 'PersistApp', 'wellness', 'ios');

      expect(mockZikaron.storeProcedural).toHaveBeenCalledTimes(1);
      const call = (mockZikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0]![0];

      expect(call.id).toContain('persist-1');
      expect(call.content).toContain('PersistApp');
      expect(call.content).toContain('wellness');
      expect(call.tags).toContain('design-system');
      expect(call.tags).toContain('wellness');
      expect(call.tags).toContain('persist-1');
      expect(call.workflowPattern).toBe('design_system_generation');
      expect(call.steps.length).toBeGreaterThan(0);
    });

    it('should include correct sourceAgentId and layer', async () => {
      await generator.generate('persist-2', 'AgentApp', 'finance', 'android');

      const call = (mockZikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.sourceAgentId).toBe('zionx-app-factory');
      expect(call.layer).toBe('procedural');
      expect(call.tenantId).toBe('system');
    });
  });

  // -------------------------------------------------------------------------
  // Color utility functions (lighten, darken, shiftHue) via generate()
  // -------------------------------------------------------------------------

  describe('color utilities (indirectly via generate)', () => {
    it('should produce valid hex colors for all palette entries', async () => {
      const ds = await generator.generate('color-1', 'ColorApp', 'wellness', 'ios');
      const palette = ds.colorPalette;

      const allColors = Object.values(palette);
      for (const color of allColors) {
        expect(isValidHex(color)).toBe(true);
      }
    });

    it('should produce valid hex colors across multiple categories', async () => {
      const categories: AppCategory[] = ['wellness', 'productivity', 'finance', 'gaming', 'utility'];

      for (const category of categories) {
        const ds = await generator.generate(`clr-${category}`, `${category}App`, category, 'ios');
        const allColors = Object.values(ds.colorPalette);
        for (const color of allColors) {
          expect(isValidHex(color)).toBe(true);
        }
      }
    });

    it('primaryLight should differ from primary (lighten applied)', async () => {
      const ds = await generator.generate('light-1', 'LightApp', 'productivity', 'ios');
      expect(ds.colorPalette.primaryLight).not.toBe(ds.colorPalette.primary);
    });

    it('primaryDark should differ from primary (darken applied)', async () => {
      const ds = await generator.generate('dark-1', 'DarkApp', 'productivity', 'ios');
      expect(ds.colorPalette.primaryDark).not.toBe(ds.colorPalette.primary);
    });

    it('secondary colors should differ from primary colors (shiftHue applied)', async () => {
      const ds = await generator.generate('hue-1', 'HueApp', 'wellness', 'ios');
      // Primary and secondary come from different trend color arrays, so they should differ
      expect(ds.colorPalette.primary).not.toBe(ds.colorPalette.secondary);
    });
  });
});
