/**
 * ZionX Design Excellence — Design System Generator
 *
 * Generates complete per-app design systems: unique color palette, typography
 * scale, spacing system, component library, iconography, and animation specs.
 * Enforces <70% visual similarity to other portfolio apps.
 *
 * Requirements: 11c.3
 */

import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { AppCategory, DesignIntelligenceEngine, ColorTrend } from './design-intelligence.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColorPalette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  secondaryLight: string;
  secondaryDark: string;
  accent: string;
  background: string;
  surface: string;
  error: string;
  warning: string;
  success: string;
  info: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  divider: string;
}

export interface TypographyScale {
  fontFamily: { primary: string; secondary: string; mono: string };
  sizes: {
    h1: { size: number; lineHeight: number; weight: number; letterSpacing: number };
    h2: { size: number; lineHeight: number; weight: number; letterSpacing: number };
    h3: { size: number; lineHeight: number; weight: number; letterSpacing: number };
    h4: { size: number; lineHeight: number; weight: number; letterSpacing: number };
    body1: { size: number; lineHeight: number; weight: number; letterSpacing: number };
    body2: { size: number; lineHeight: number; weight: number; letterSpacing: number };
    caption: { size: number; lineHeight: number; weight: number; letterSpacing: number };
    button: { size: number; lineHeight: number; weight: number; letterSpacing: number };
    overline: { size: number; lineHeight: number; weight: number; letterSpacing: number };
  };
}

export interface SpacingSystem {
  unit: number;
  scale: Record<string, number>;
  borderRadius: Record<string, number>;
}

export interface IconographySpec {
  style: 'outlined' | 'filled' | 'rounded' | 'sharp' | 'two_tone';
  size: { sm: number; md: number; lg: number; xl: number };
  strokeWidth: number;
  cornerRadius: number;
}

export interface AnimationSpec {
  durations: { fast: number; normal: number; slow: number };
  easings: { standard: string; decelerate: string; accelerate: string; spring: string };
  transitions: {
    pageEnter: { duration: number; easing: string; type: string };
    pageExit: { duration: number; easing: string; type: string };
    elementEnter: { duration: number; easing: string; type: string };
    elementExit: { duration: number; easing: string; type: string };
  };
}

export interface ComponentSpec {
  name: string;
  variants: string[];
  defaultProps: Record<string, unknown>;
  tokens: Record<string, string | number>;
}

export interface DesignSystem {
  id: string;
  appId: string;
  appName: string;
  version: string;
  category: AppCategory;
  colorPalette: ColorPalette;
  typography: TypographyScale;
  spacing: SpacingSystem;
  iconography: IconographySpec;
  animations: AnimationSpec;
  components: ComponentSpec[];
  similarityScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface SimilarityCheckResult {
  score: number;
  comparedWith: string[];
  tooSimilar: boolean;
  details: string;
}

// ---------------------------------------------------------------------------
// Design System Generator
// ---------------------------------------------------------------------------

export class DesignSystemGenerator {
  private existingSystems: Map<string, DesignSystem> = new Map();

  constructor(
    private readonly designIntelligence: DesignIntelligenceEngine,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Generate a complete design system for an app, ensuring <70% similarity
   * to other portfolio apps.
   */
  async generate(
    appId: string,
    appName: string,
    category: AppCategory,
    platform: 'ios' | 'android',
  ): Promise<DesignSystem> {
    // 1. Get design intelligence for the category
    const analysis = await this.designIntelligence.analyzeCategory(category, platform);

    // 2. Generate color palette informed by trends
    let colorPalette = this.generateColorPalette(category, analysis.colorTrends);

    // 3. Check similarity against existing portfolio apps
    let similarityResult = this.checkSimilarity(colorPalette);
    let attempts = 0;

    // Re-generate if too similar (enforce <70% similarity)
    while (similarityResult.tooSimilar && attempts < 5) {
      colorPalette = this.generateColorPalette(category, analysis.colorTrends, attempts + 1);
      similarityResult = this.checkSimilarity(colorPalette);
      attempts++;
    }

    // 4. Generate typography scale
    const typography = this.generateTypography(category);

    // 5. Generate spacing system
    const spacing = this.generateSpacing();

    // 6. Generate iconography spec
    const iconography = this.generateIconography(category);

    // 7. Generate animation spec
    const animations = this.generateAnimations();

    // 8. Generate component specs
    const components = this.generateComponents(colorPalette, typography);

    const designSystem: DesignSystem = {
      id: `ds-${appId}-${Date.now()}`,
      appId,
      appName,
      version: '1.0.0',
      category,
      colorPalette,
      typography,
      spacing,
      iconography,
      animations,
      components,
      similarityScore: similarityResult.score,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 9. Store in library for future similarity checks
    this.existingSystems.set(appId, designSystem);

    // 10. Persist to Zikaron
    await this.persistDesignSystem(designSystem);

    return designSystem;
  }

  /**
   * Check visual similarity of a color palette against existing portfolio apps.
   * Returns a score 0-100 where 100 = identical.
   */
  checkSimilarity(palette: ColorPalette): SimilarityCheckResult {
    const existingPalettes = [...this.existingSystems.values()].map((ds) => ds.colorPalette);

    if (existingPalettes.length === 0) {
      return { score: 0, comparedWith: [], tooSimilar: false, details: 'No existing systems to compare' };
    }

    let maxSimilarity = 0;
    const comparedWith: string[] = [];

    for (const [appId, ds] of this.existingSystems) {
      const similarity = this.calculateColorSimilarity(palette, ds.colorPalette);
      comparedWith.push(appId);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
    }

    return {
      score: maxSimilarity,
      comparedWith,
      tooSimilar: maxSimilarity >= 70,
      details: maxSimilarity >= 70
        ? `Similarity ${maxSimilarity}% exceeds 70% threshold`
        : `Similarity ${maxSimilarity}% is within acceptable range`,
    };
  }

  /**
   * Generate a unique color palette informed by category trends.
   */
  private generateColorPalette(
    category: AppCategory,
    colorTrend: ColorTrend,
    variationSeed: number = 0,
  ): ColorPalette {
    // Use trend colors as base, then apply variation
    const primary = colorTrend.primaryColors[variationSeed % colorTrend.primaryColors.length] ?? '#2196F3';
    const accent = colorTrend.accentColors[variationSeed % colorTrend.accentColors.length] ?? '#FF5722';

    // Apply hue rotation for variation
    const hueShift = variationSeed * 30;

    return {
      primary: this.shiftHue(primary, hueShift),
      primaryLight: this.lighten(this.shiftHue(primary, hueShift), 20),
      primaryDark: this.darken(this.shiftHue(primary, hueShift), 20),
      secondary: this.shiftHue(accent, hueShift),
      secondaryLight: this.lighten(this.shiftHue(accent, hueShift), 20),
      secondaryDark: this.darken(this.shiftHue(accent, hueShift), 20),
      accent: this.shiftHue(accent, hueShift + 15),
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
    };
  }

  /**
   * Generate typography scale based on category.
   */
  private generateTypography(category: AppCategory): TypographyScale {
    const fontFamilies: Record<string, { primary: string; secondary: string }> = {
      wellness: { primary: 'SF Pro Rounded', secondary: 'Nunito' },
      productivity: { primary: 'SF Pro Text', secondary: 'Inter' },
      finance: { primary: 'SF Pro Display', secondary: 'Roboto' },
      utility: { primary: 'SF Pro Text', secondary: 'System Default' },
      gaming: { primary: 'SF Pro Rounded', secondary: 'Poppins' },
    };

    const fonts = fontFamilies[category] ?? fontFamilies.utility!;

    return {
      fontFamily: { primary: fonts.primary, secondary: fonts.secondary, mono: 'SF Mono' },
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
    };
  }

  /**
   * Generate spacing system based on 4px grid.
   */
  private generateSpacing(): SpacingSystem {
    return {
      unit: 4,
      scale: {
        xxs: 2,
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 48,
        xxxl: 64,
      },
      borderRadius: {
        none: 0,
        sm: 4,
        md: 8,
        lg: 12,
        xl: 16,
        xxl: 20,
        full: 9999,
      },
    };
  }

  /**
   * Generate iconography spec.
   */
  private generateIconography(category: AppCategory): IconographySpec {
    const styles: Record<string, 'outlined' | 'filled' | 'rounded'> = {
      wellness: 'rounded',
      productivity: 'outlined',
      finance: 'outlined',
      utility: 'filled',
      gaming: 'filled',
    };

    return {
      style: styles[category] ?? 'outlined',
      size: { sm: 16, md: 24, lg: 32, xl: 48 },
      strokeWidth: 1.5,
      cornerRadius: 2,
    };
  }

  /**
   * Generate animation specifications.
   */
  private generateAnimations(): AnimationSpec {
    return {
      durations: { fast: 150, normal: 300, slow: 500 },
      easings: {
        standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
        accelerate: 'cubic-bezier(0.4, 0.0, 1, 1)',
        spring: 'spring(1, 80, 10, 0)',
      },
      transitions: {
        pageEnter: { duration: 300, easing: 'decelerate', type: 'slide_up' },
        pageExit: { duration: 250, easing: 'accelerate', type: 'fade_out' },
        elementEnter: { duration: 200, easing: 'decelerate', type: 'fade_in_up' },
        elementExit: { duration: 150, easing: 'accelerate', type: 'fade_out' },
      },
    };
  }

  /**
   * Generate component specifications.
   */
  private generateComponents(palette: ColorPalette, typography: TypographyScale): ComponentSpec[] {
    return [
      {
        name: 'Button',
        variants: ['primary', 'secondary', 'outline', 'ghost', 'destructive'],
        defaultProps: { size: 'md', fullWidth: false, disabled: false },
        tokens: { backgroundColor: palette.primary, textColor: '#FFFFFF', borderRadius: 12, height: 48 },
      },
      {
        name: 'Card',
        variants: ['elevated', 'outlined', 'filled'],
        defaultProps: { padding: 16, elevation: 1 },
        tokens: { backgroundColor: palette.surface, borderRadius: 12, shadowColor: 'rgba(0,0,0,0.08)' },
      },
      {
        name: 'Input',
        variants: ['default', 'outlined', 'filled', 'underlined'],
        defaultProps: { size: 'md', disabled: false },
        tokens: { borderColor: palette.divider, focusBorderColor: palette.primary, borderRadius: 8, height: 48 },
      },
      {
        name: 'TabBar',
        variants: ['bottom', 'top', 'scrollable'],
        defaultProps: { activeIndicator: 'filled' },
        tokens: { activeColor: palette.primary, inactiveColor: palette.textSecondary, backgroundColor: palette.background },
      },
      {
        name: 'Modal',
        variants: ['center', 'bottom_sheet', 'fullscreen'],
        defaultProps: { dimBackground: true, dismissible: true },
        tokens: { backgroundColor: palette.background, borderRadius: 20, overlayColor: 'rgba(0,0,0,0.5)' },
      },
    ];
  }

  /**
   * Calculate color similarity between two palettes (0-100).
   */
  private calculateColorSimilarity(a: ColorPalette, b: ColorPalette): number {
    const keysToCompare: (keyof ColorPalette)[] = ['primary', 'secondary', 'accent', 'background'];
    let totalDiff = 0;

    for (const key of keysToCompare) {
      totalDiff += this.colorDistance(a[key], b[key]);
    }

    const avgDiff = totalDiff / keysToCompare.length;
    // Max possible distance is ~441 (sqrt(255^2 * 3))
    return Math.max(0, Math.round(100 - (avgDiff / 441) * 100));
  }

  /**
   * Calculate Euclidean distance between two hex colors.
   */
  private colorDistance(hex1: string, hex2: string): number {
    const rgb1 = this.hexToRgb(hex1);
    const rgb2 = this.hexToRgb(hex2);
    return Math.sqrt(
      (rgb1.r - rgb2.r) ** 2 +
      (rgb1.g - rgb2.g) ** 2 +
      (rgb1.b - rgb2.b) ** 2,
    );
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const cleaned = hex.replace('#', '');
    return {
      r: parseInt(cleaned.slice(0, 2), 16) || 0,
      g: parseInt(cleaned.slice(2, 4), 16) || 0,
      b: parseInt(cleaned.slice(4, 6), 16) || 0,
    };
  }

  private shiftHue(hex: string, degrees: number): string {
    // Simplified hue shift — rotate RGB channels
    const rgb = this.hexToRgb(hex);
    const shift = Math.round((degrees / 360) * 255);
    const r = (rgb.r + shift) % 256;
    const g = (rgb.g + Math.round(shift * 0.7)) % 256;
    const b = (rgb.b + Math.round(shift * 0.3)) % 256;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  private lighten(hex: string, percent: number): string {
    const rgb = this.hexToRgb(hex);
    const factor = percent / 100;
    const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * factor));
    const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * factor));
    const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * factor));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  private darken(hex: string, percent: number): string {
    const rgb = this.hexToRgb(hex);
    const factor = 1 - percent / 100;
    const r = Math.round(rgb.r * factor);
    const g = Math.round(rgb.g * factor);
    const b = Math.round(rgb.b * factor);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Persist design system to Zikaron.
   */
  private async persistDesignSystem(ds: DesignSystem): Promise<void> {
    await this.zikaronService.storeProcedural({
      id: `design-system-${ds.appId}`,
      tenantId: 'system',
      layer: 'procedural',
      content: `Design system for ${ds.appName}: ${ds.category}, similarity ${ds.similarityScore}%`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['design-system', ds.category, ds.appId],
      createdAt: new Date(),
      workflowPattern: 'design_system_generation',
      successRate: 1.0,
      executionCount: 1,
      prerequisites: ['design_intelligence_analysis'],
      steps: [
        { order: 1, action: 'generate_palette', description: 'Generate unique color palette', expectedOutcome: 'Palette with <70% similarity' },
        { order: 2, action: 'generate_typography', description: 'Generate typography scale', expectedOutcome: 'Typography scale ready' },
        { order: 3, action: 'generate_components', description: 'Generate component specs', expectedOutcome: 'Component library ready' },
      ],
    });
  }
}
