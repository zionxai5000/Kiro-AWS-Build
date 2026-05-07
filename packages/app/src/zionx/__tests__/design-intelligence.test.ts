/**
 * Unit tests for ZionX Design Excellence — Design Intelligence Engine
 *
 * Validates: Requirements 11c.1
 *
 * Tests that the DesignIntelligenceEngine scrapes top-performing apps,
 * extracts UI patterns via LLM analysis, builds color trends and animation
 * styles, persists the pattern library to Zikaron, and handles errors gracefully.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DesignIntelligenceEngine,
  type BrowserDriver,
  type LLMDriver,
  type AppCategory,
  type DesignAnalysisResult,
  type DesignPatternLibrary,
} from '../design/design-intelligence.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { DriverResult } from '@seraphim/core';
import type { MemoryResult } from '@seraphim/core/types/memory.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockTopApps(count = 10): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `TopApp${i + 1}`,
    rating: 4.5 + Math.random() * 0.5,
    rank: i + 1,
  }));
}

function createSuccessDriverResult(data?: unknown): DriverResult {
  return {
    success: true,
    data: data ?? createMockTopApps(),
    retryable: false,
    operationId: `op-${Date.now()}`,
  };
}

function createFailureDriverResult(message = 'Driver error'): DriverResult {
  return {
    success: false,
    data: undefined,
    error: { code: 'DRIVER_ERROR', message, retryable: true, details: {} },
    retryable: true,
    operationId: `op-${Date.now()}`,
  };
}

function createMockBrowserDriver(result?: DriverResult): BrowserDriver {
  return {
    execute: vi.fn(async () => result ?? createSuccessDriverResult()),
  };
}

function createMockLLMDriver(): LLMDriver {
  return {
    execute: vi.fn(async () => createSuccessDriverResult({ analysis: 'mock LLM analysis' })),
  };
}

function createMockZikaronService(queryResults: MemoryResult[] = []): ZikaronService {
  return {
    storeEpisodic: vi.fn(async () => 'id'),
    storeSemantic: vi.fn(async () => 'id'),
    storeProcedural: vi.fn(async () => 'id'),
    storeWorking: vi.fn(async () => 'id'),
    query: vi.fn(async () => queryResults),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DesignIntelligenceEngine', () => {
  let engine: DesignIntelligenceEngine;
  let mockBrowser: BrowserDriver;
  let mockLLM: LLMDriver;
  let mockZikaron: ZikaronService;

  beforeEach(() => {
    mockBrowser = createMockBrowserDriver();
    mockLLM = createMockLLMDriver();
    mockZikaron = createMockZikaronService();
    engine = new DesignIntelligenceEngine(mockBrowser, mockLLM, mockZikaron);
  });

  // -------------------------------------------------------------------------
  // analyzeCategory() — complete DesignAnalysisResult
  // -------------------------------------------------------------------------

  describe('analyzeCategory()', () => {
    it('should return a complete DesignAnalysisResult with all required fields', async () => {
      const result = await engine.analyzeCategory('wellness', 'ios');

      expect(result.category).toBe('wellness');
      expect(result.platform).toBe('ios');
      expect(result.appsAnalyzed).toBe(10);
      expect(result.analyzedAt).toBeTruthy();

      // All sub-sections present
      expect(result.uiPatterns).toBeDefined();
      expect(Array.isArray(result.uiPatterns)).toBe(true);
      expect(result.uiPatterns.length).toBeGreaterThan(0);

      expect(result.colorTrends).toBeDefined();
      expect(result.colorTrends.category).toBe('wellness');

      expect(result.animationStyles).toBeDefined();
      expect(Array.isArray(result.animationStyles)).toBe(true);
      expect(result.animationStyles.length).toBeGreaterThan(0);

      expect(result.onboardingFlows).toBeDefined();
      expect(Array.isArray(result.onboardingFlows)).toBe(true);
      expect(result.onboardingFlows.length).toBeGreaterThan(0);

      expect(result.monetizationUX).toBeDefined();
      expect(Array.isArray(result.monetizationUX)).toBe(true);
      expect(result.monetizationUX.length).toBeGreaterThan(0);
    });

    it('should call the browser driver to scrape top apps', async () => {
      await engine.analyzeCategory('productivity', 'android');

      expect(mockBrowser.execute).toHaveBeenCalledTimes(1);
      const call = (mockBrowser.execute as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.type).toBe('scrape');
      expect(call.params.url).toContain('play.google.com');
      expect(call.params.url).toContain('PRODUCTIVITY');
      expect(call.params.limit).toBe(10);
    });

    it('should use the correct iOS URL when platform is ios', async () => {
      await engine.analyzeCategory('finance', 'ios');

      const call = (mockBrowser.execute as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.params.url).toContain('apps.apple.com');
      expect(call.params.url).toContain('finance');
    });

    it('should call the LLM driver to extract UI patterns from scraped data', async () => {
      await engine.analyzeCategory('wellness', 'ios');

      expect(mockLLM.execute).toHaveBeenCalledTimes(1);
      const call = (mockLLM.execute as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.type).toBe('generate');
      expect(call.params.prompt).toContain('wellness');
      expect(call.params.taskType).toBe('analysis');
    });

    it('should return UI patterns with correct structure', async () => {
      const result = await engine.analyzeCategory('gaming', 'ios');

      for (const pattern of result.uiPatterns) {
        expect(pattern.id).toBeTruthy();
        expect(pattern.name).toBeTruthy();
        expect(pattern.category).toBe('gaming');
        expect(['layout', 'navigation', 'onboarding', 'monetization', 'interaction', 'animation']).toContain(pattern.type);
        expect(pattern.description).toBeTruthy();
        expect(pattern.prevalence).toBeGreaterThanOrEqual(0);
        expect(pattern.prevalence).toBeLessThanOrEqual(100);
        expect(Array.isArray(pattern.examples)).toBe(true);
        expect(Array.isArray(pattern.extractedFrom)).toBe(true);
        expect(pattern.detectedAt).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Color trends
  // -------------------------------------------------------------------------

  describe('color trends', () => {
    it('should include primaryColors, accentColors, and backgroundStyles', async () => {
      const result = await engine.analyzeCategory('wellness', 'ios');
      const trends = result.colorTrends;

      expect(trends.primaryColors).toBeDefined();
      expect(Array.isArray(trends.primaryColors)).toBe(true);
      expect(trends.primaryColors.length).toBeGreaterThan(0);

      expect(trends.accentColors).toBeDefined();
      expect(Array.isArray(trends.accentColors)).toBe(true);
      expect(trends.accentColors.length).toBeGreaterThan(0);

      expect(trends.backgroundStyles).toBeDefined();
      expect(Array.isArray(trends.backgroundStyles)).toBe(true);
      expect(trends.backgroundStyles.length).toBeGreaterThan(0);
    });

    it('should include dominantPalette and analyzedAt', async () => {
      const result = await engine.analyzeCategory('productivity', 'android');
      const trends = result.colorTrends;

      expect(trends.dominantPalette).toBeDefined();
      expect(trends.dominantPalette.length).toBeGreaterThan(0);
      expect(trends.analyzedAt).toBeTruthy();
    });

    it('should produce different color trends for different categories', async () => {
      const wellness = await engine.analyzeCategory('wellness', 'ios');
      const finance = await engine.analyzeCategory('finance', 'ios');

      expect(wellness.colorTrends.primaryColors).not.toEqual(finance.colorTrends.primaryColors);
    });

    it('should match the category in the color trend', async () => {
      const result = await engine.analyzeCategory('gaming', 'android');
      expect(result.colorTrends.category).toBe('gaming');
    });
  });

  // -------------------------------------------------------------------------
  // Animation styles
  // -------------------------------------------------------------------------

  describe('animation styles', () => {
    it('should generate animation styles per category', async () => {
      const result = await engine.analyzeCategory('social', 'ios');

      expect(result.animationStyles.length).toBeGreaterThan(0);
      for (const style of result.animationStyles) {
        expect(style.name).toBeTruthy();
        expect(['transition', 'micro_interaction', 'loading', 'feedback', 'onboarding']).toContain(style.type);
        expect(style.description).toBeTruthy();
        expect(style.duration).toBeTruthy();
        expect(style.easing).toBeTruthy();
        expect(style.prevalence).toBeGreaterThanOrEqual(0);
        expect(style.prevalence).toBeLessThanOrEqual(100);
      }
    });

    it('should include multiple animation types', async () => {
      const result = await engine.analyzeCategory('education', 'android');
      const types = result.animationStyles.map((s) => s.type);

      expect(types).toContain('transition');
      expect(types).toContain('loading');
    });
  });

  // -------------------------------------------------------------------------
  // Onboarding flows
  // -------------------------------------------------------------------------

  describe('onboarding flows', () => {
    it('should return onboarding flows for analyzed apps', async () => {
      const result = await engine.analyzeCategory('wellness', 'ios');

      expect(result.onboardingFlows.length).toBeGreaterThan(0);
      for (const flow of result.onboardingFlows) {
        expect(flow.appName).toBeTruthy();
        expect(flow.steps).toBeGreaterThan(0);
        expect(typeof flow.hasSkipOption).toBe('boolean');
        expect(typeof flow.usesAnimation).toBe('boolean');
        expect(typeof flow.collectsPreferences).toBe('boolean');
        expect(typeof flow.showsValueProposition).toBe('boolean');
        expect(typeof flow.hasPaywall).toBe('boolean');
        expect(['before_onboarding', 'during_onboarding', 'after_onboarding', 'none']).toContain(flow.paywallPosition);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Monetization UX
  // -------------------------------------------------------------------------

  describe('monetization UX', () => {
    it('should return monetization UX data for analyzed apps', async () => {
      const result = await engine.analyzeCategory('finance', 'ios');

      expect(result.monetizationUX.length).toBeGreaterThan(0);
      for (const ux of result.monetizationUX) {
        expect(ux.appName).toBeTruthy();
        expect(['free', 'freemium', 'subscription', 'paid', 'ad_supported']).toContain(ux.model);
        expect(['soft', 'hard', 'metered', 'none']).toContain(ux.paywallStyle);
        expect(typeof ux.trialOffered).toBe('boolean');
        expect(typeof ux.trialDays).toBe('number');
        expect(typeof ux.socialProofUsed).toBe('boolean');
        expect(typeof ux.urgencyTactics).toBe('boolean');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Persistence to Zikaron via storeProcedural
  // -------------------------------------------------------------------------

  describe('persistence to Zikaron', () => {
    it('should persist the pattern library via storeProcedural after analysis', async () => {
      await engine.analyzeCategory('wellness', 'ios');

      expect(mockZikaron.storeProcedural).toHaveBeenCalledTimes(1);
      const call = (mockZikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0]![0];

      expect(call.id).toContain('design-patterns');
      expect(call.id).toContain('wellness');
      expect(call.id).toContain('ios');
      expect(call.tenantId).toBe('system');
      expect(call.layer).toBe('procedural');
      expect(call.content).toContain('wellness');
      expect(call.content).toContain('ios');
      expect(call.sourceAgentId).toBe('zionx-app-factory');
      expect(call.tags).toContain('design-intelligence');
      expect(call.tags).toContain('wellness');
      expect(call.tags).toContain('ios');
      expect(call.workflowPattern).toContain('design_analysis_wellness');
      expect(call.steps.length).toBeGreaterThan(0);
    });

    it('should include correct step structure in stored procedural entry', async () => {
      await engine.analyzeCategory('productivity', 'android');

      const call = (mockZikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      for (const step of call.steps) {
        expect(step.order).toBeGreaterThan(0);
        expect(step.action).toBeTruthy();
        expect(step.description).toBeTruthy();
        expect(step.expectedOutcome).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // loadPatternLibrary()
  // -------------------------------------------------------------------------

  describe('loadPatternLibrary()', () => {
    it('should return a DesignPatternLibrary with patterns organized by category', async () => {
      const mockResults: MemoryResult[] = [
        {
          id: 'mem-1',
          layer: 'procedural',
          content: 'UI pattern: Bottom Tab Navigation',
          similarity: 0.95,
          metadata: {
            type: 'ui_pattern',
            pattern: {
              id: 'pattern-wellness-tab-1',
              name: 'Bottom Tab Navigation',
              category: 'wellness',
              type: 'navigation',
              description: 'Bottom tab bar',
              prevalence: 85,
              examples: ['App1'],
              extractedFrom: ['App1', 'App2'],
              detectedAt: new Date().toISOString(),
            },
          },
          sourceAgentId: 'zionx-app-factory',
          timestamp: new Date(),
        },
        {
          id: 'mem-2',
          layer: 'procedural',
          content: 'UI pattern: Card Layout',
          similarity: 0.90,
          metadata: {
            type: 'ui_pattern',
            pattern: {
              id: 'pattern-productivity-card-1',
              name: 'Card-Based Layout',
              category: 'productivity',
              type: 'layout',
              description: 'Card layout',
              prevalence: 75,
              examples: ['App3'],
              extractedFrom: ['App3', 'App4'],
              detectedAt: new Date().toISOString(),
            },
          },
          sourceAgentId: 'zionx-app-factory',
          timestamp: new Date(),
        },
        {
          id: 'mem-3',
          layer: 'procedural',
          content: 'Color trend: wellness',
          similarity: 0.88,
          metadata: {
            type: 'color_trend',
            trend: {
              category: 'wellness',
              primaryColors: ['#4CAF50'],
              accentColors: ['#FF9800'],
              backgroundStyles: ['light'],
              dominantPalette: ['#4CAF50', '#FF9800'],
              analyzedAt: new Date().toISOString(),
            },
          },
          sourceAgentId: 'zionx-app-factory',
          timestamp: new Date(),
        },
      ];

      mockZikaron = createMockZikaronService(mockResults);
      engine = new DesignIntelligenceEngine(mockBrowser, mockLLM, mockZikaron);

      const library = await engine.loadPatternLibrary();

      expect(library.patterns).toHaveLength(2);
      expect(library.colorTrends).toHaveLength(1);
      expect(library.categories).toContain('wellness');
      expect(library.categories).toContain('productivity');
      expect(library.lastUpdated).toBeTruthy();
      expect(Array.isArray(library.animationStyles)).toBe(true);
    });

    it('should return an empty library when no patterns are stored', async () => {
      const library = await engine.loadPatternLibrary();

      expect(library.patterns).toHaveLength(0);
      expect(library.colorTrends).toHaveLength(0);
      expect(library.categories).toHaveLength(0);
      expect(library.lastUpdated).toBeTruthy();
    });

    it('should query Zikaron with correct parameters', async () => {
      await engine.loadPatternLibrary();

      expect(mockZikaron.query).toHaveBeenCalledTimes(1);
      const call = (mockZikaron.query as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.text).toBe('design pattern library');
      expect(call.layers).toContain('procedural');
      expect(call.tenantId).toBe('system');
      expect(call.limit).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should handle browser driver failure gracefully and return empty apps', async () => {
      mockBrowser = createMockBrowserDriver(createFailureDriverResult('Network timeout'));
      engine = new DesignIntelligenceEngine(mockBrowser, mockLLM, mockZikaron);

      const result = await engine.analyzeCategory('wellness', 'ios');

      // When browser fails, scrapeTopApps returns [] so appsAnalyzed = 0
      expect(result.appsAnalyzed).toBe(0);
      expect(result.category).toBe('wellness');
      expect(result.platform).toBe('ios');
      // The engine should still return a valid result structure
      expect(result.uiPatterns).toBeDefined();
      expect(result.colorTrends).toBeDefined();
      expect(result.animationStyles).toBeDefined();
    });

    it('should still produce animation styles even when browser driver fails', async () => {
      mockBrowser = createMockBrowserDriver(createFailureDriverResult('Connection refused'));
      engine = new DesignIntelligenceEngine(mockBrowser, mockLLM, mockZikaron);

      const result = await engine.analyzeCategory('gaming', 'android');

      // Animation styles are generated per category, not dependent on scraped data
      expect(result.animationStyles.length).toBeGreaterThan(0);
    });

    it('should handle browser returning non-array data gracefully', async () => {
      const badResult = createSuccessDriverResult('not-an-array');
      mockBrowser = createMockBrowserDriver(badResult);
      engine = new DesignIntelligenceEngine(mockBrowser, mockLLM, mockZikaron);

      const result = await engine.analyzeCategory('utility', 'ios');

      expect(result.appsAnalyzed).toBe(0);
      expect(result.category).toBe('utility');
    });
  });
});
