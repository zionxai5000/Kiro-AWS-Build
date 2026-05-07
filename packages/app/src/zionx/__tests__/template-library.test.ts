/**
 * Unit tests for ZionX Design Excellence — Template Library
 *
 * Validates: Requirements 11c.2
 *
 * Tests versioned template retrieval by category, template structure
 * (screen flows, component variants, interaction patterns), auto-update
 * mechanism, and template versioning.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemplateLibrary } from '../design/template-library.js';
import type {
  UITemplate,
  TemplateLibraryState,
} from '../design/template-library.js';
import type {
  AppCategory,
  DesignIntelligenceEngine,
  DesignAnalysisResult,
  ColorTrend,
} from '../design/design-intelligence.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockAnalysisResult(category: AppCategory, platform: 'ios' | 'android'): DesignAnalysisResult {
  return {
    category,
    platform,
    appsAnalyzed: 10,
    uiPatterns: [
      {
        id: `pattern-${category}-1`,
        name: 'Bottom Tab Navigation',
        category,
        type: 'navigation',
        description: 'Bottom tab bar',
        prevalence: 85,
        examples: ['App1'],
        extractedFrom: ['App1'],
        detectedAt: new Date().toISOString(),
      },
    ],
    colorTrends: {
      category,
      primaryColors: ['#4CAF50'],
      accentColors: ['#FF9800'],
      backgroundStyles: ['light'],
      dominantPalette: ['#4CAF50', '#FF9800'],
      analyzedAt: new Date().toISOString(),
    },
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
// Tests
// ---------------------------------------------------------------------------

describe('TemplateLibrary', () => {
  let library: TemplateLibrary;
  let mockDesignIntelligence: DesignIntelligenceEngine;
  let mockZikaron: ZikaronService;

  beforeEach(() => {
    mockDesignIntelligence = createMockDesignIntelligence();
    mockZikaron = createMockZikaronService();
    library = new TemplateLibrary(mockDesignIntelligence, mockZikaron);
  });

  // -------------------------------------------------------------------------
  // Versioned template retrieval by category
  // -------------------------------------------------------------------------

  describe('getTemplate() — retrieval by category', () => {
    const categories: AppCategory[] = ['wellness', 'productivity', 'finance', 'utility', 'gaming'];

    it.each(categories)('should retrieve a template for %s category after update', async (category) => {
      await library.updateTemplatesForCategory(category, 'ios');
      const template = library.getTemplate(category);

      expect(template).toBeDefined();
      expect(template!.category).toBe(category);
      expect(template!.version).toBe('1.0.0');
    });

    it('should return undefined for a category with no templates', () => {
      const template = library.getTemplate('wellness');
      expect(template).toBeUndefined();
    });

    it('should return all templates via getAllTemplates()', async () => {
      await library.updateTemplatesForCategory('wellness', 'ios');
      await library.updateTemplatesForCategory('finance', 'ios');

      const all = library.getAllTemplates();
      expect(all).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Template structure: screen flows, component variants, interaction patterns
  // -------------------------------------------------------------------------

  describe('template structure', () => {
    it('should include screen flows with correct types', async () => {
      const template = await library.updateTemplatesForCategory('wellness', 'ios');

      expect(template.screens.length).toBeGreaterThan(0);

      const screenTypes = template.screens.map((s) => s.type);
      expect(screenTypes).toContain('onboarding');
      expect(screenTypes).toContain('home');
      expect(screenTypes).toContain('settings');
      expect(screenTypes).toContain('paywall');
      expect(screenTypes).toContain('empty_state');
      expect(screenTypes).toContain('error_state');
    });

    it('each screen should have layout structure and components', async () => {
      const template = await library.updateTemplatesForCategory('productivity', 'ios');

      for (const screen of template.screens) {
        expect(screen.id).toBeTruthy();
        expect(screen.name).toBeTruthy();
        expect(screen.description).toBeTruthy();
        expect(screen.layoutStructure).toBeDefined();
        expect(screen.layoutStructure.type).toBeTruthy();
        expect(screen.components.length).toBeGreaterThan(0);
      }
    });

    it('should include component variants', async () => {
      const template = await library.updateTemplatesForCategory('finance', 'ios');

      expect(template.componentVariants.length).toBeGreaterThan(0);

      for (const variant of template.componentVariants) {
        expect(variant.id).toBeTruthy();
        expect(variant.type).toBeTruthy();
        expect(variant.variant).toBeTruthy();
        expect(variant.properties).toBeDefined();
      }
    });

    it('should include interaction patterns', async () => {
      const template = await library.updateTemplatesForCategory('gaming', 'ios');

      expect(template.interactionPatterns.length).toBeGreaterThan(0);

      for (const pattern of template.interactionPatterns) {
        expect(pattern.name).toBeTruthy();
        expect(pattern.type).toBeTruthy();
        expect(pattern.description).toBeTruthy();
        expect(pattern.triggerCondition).toBeTruthy();
        expect(pattern.animationSpec).toBeDefined();
      }
    });

    it('should track derivedFromPatterns from design intelligence', async () => {
      const template = await library.updateTemplatesForCategory('utility', 'ios');

      expect(template.derivedFromPatterns).toBeDefined();
      expect(template.derivedFromPatterns.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Auto-update mechanism
  // -------------------------------------------------------------------------

  describe('refreshAllTemplates() — auto-update', () => {
    it('should refresh templates for all 5 categories', async () => {
      const state = await library.refreshAllTemplates('ios');

      expect(state.totalTemplates).toBe(5);
      expect(state.templates).toHaveLength(5);

      const categories = state.templates.map((t) => t.category);
      expect(categories).toContain('wellness');
      expect(categories).toContain('productivity');
      expect(categories).toContain('finance');
      expect(categories).toContain('utility');
      expect(categories).toContain('gaming');
    });

    it('should call designIntelligence.analyzeCategory for each category', async () => {
      await library.refreshAllTemplates('android');

      expect(mockDesignIntelligence.analyzeCategory).toHaveBeenCalledTimes(5);
      expect(mockDesignIntelligence.analyzeCategory).toHaveBeenCalledWith('wellness', 'android');
      expect(mockDesignIntelligence.analyzeCategory).toHaveBeenCalledWith('productivity', 'android');
      expect(mockDesignIntelligence.analyzeCategory).toHaveBeenCalledWith('finance', 'android');
      expect(mockDesignIntelligence.analyzeCategory).toHaveBeenCalledWith('utility', 'android');
      expect(mockDesignIntelligence.analyzeCategory).toHaveBeenCalledWith('gaming', 'android');
    });

    it('should report category coverage in library state', async () => {
      const state = await library.refreshAllTemplates('ios');

      expect(state.categoryCoverage).toBeDefined();
      expect(state.categoryCoverage.wellness).toBe(1);
      expect(state.categoryCoverage.productivity).toBe(1);
      expect(state.categoryCoverage.finance).toBe(1);
      expect(state.categoryCoverage.utility).toBe(1);
      expect(state.categoryCoverage.gaming).toBe(1);
    });

    it('should persist each template to Zikaron', async () => {
      await library.refreshAllTemplates('ios');

      expect(mockZikaron.storeProcedural).toHaveBeenCalledTimes(5);
    });
  });

  // -------------------------------------------------------------------------
  // Template versioning
  // -------------------------------------------------------------------------

  describe('template versioning', () => {
    it('should set version to 1.0.0 on initial creation', async () => {
      const template = await library.updateTemplatesForCategory('wellness', 'ios');
      expect(template.version).toBe('1.0.0');
    });

    it('should include createdAt and updatedAt timestamps', async () => {
      const template = await library.updateTemplatesForCategory('productivity', 'ios');

      expect(template.createdAt).toBeTruthy();
      expect(template.updatedAt).toBeTruthy();
      expect(new Date(template.createdAt).getTime()).toBeGreaterThan(0);
      expect(new Date(template.updatedAt).getTime()).toBeGreaterThan(0);
    });

    it('should include template id with category prefix', async () => {
      const template = await library.updateTemplatesForCategory('finance', 'ios');
      expect(template.id).toContain('template-finance');
    });

    it('should include capitalized category name in template name', async () => {
      const template = await library.updateTemplatesForCategory('gaming', 'ios');
      expect(template.name).toContain('Gaming');
    });
  });

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  describe('persistence to Zikaron', () => {
    it('should persist template via storeProcedural with correct metadata', async () => {
      await library.updateTemplatesForCategory('wellness', 'ios');

      expect(mockZikaron.storeProcedural).toHaveBeenCalledTimes(1);
      const call = (mockZikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0]![0];

      expect(call.content).toContain('wellness');
      expect(call.tags).toContain('template');
      expect(call.tags).toContain('wellness');
      expect(call.sourceAgentId).toBe('zionx-app-factory');
      expect(call.layer).toBe('procedural');
      expect(call.steps.length).toBeGreaterThan(0);
    });
  });
});
