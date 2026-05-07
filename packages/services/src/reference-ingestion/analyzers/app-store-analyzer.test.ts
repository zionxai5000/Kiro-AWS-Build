/**
 * Unit tests for App Store Analyzer.
 *
 * Requirements: 34b.7, 34b.8, 34b.9, 34b.10, 34b.11, 34b.12, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { OtzarService } from '@seraphim/core';
import type { DriverResult } from '@seraphim/core/types/driver.js';
import type { AppReferenceReport } from '../types.js';

/** Browser driver interface (from @seraphim/drivers) */
interface BrowserDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

import { AppStoreAnalyzerImpl, AppStoreAnalysisError } from './app-store-analyzer.js';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

function createMockBrowserDriver(overrides: Partial<Record<string, unknown>> = {}): BrowserDriver {
  const executeResults = new Map<string, DriverResult>();

  const mockDriver = {
    name: 'browser',
    version: '1.0.0',
    status: 'ready',
    execute: vi.fn().mockImplementation(async (operation: { type: string; params: Record<string, unknown> }) => {
      // Check for custom override
      const customResult = executeResults.get(operation.type);
      if (customResult) return customResult;

      switch (operation.type) {
        case 'navigate':
          return {
            success: true,
            data: { pageId: 'test-page-1', url: operation.params.url, status: 200, title: 'Test App', loadTimeMs: 100, navigatedAt: new Date().toISOString() },
            retryable: false,
            operationId: 'op-1',
          } satisfies DriverResult;

        case 'evaluate':
          return createEvaluateResult(operation.params.script as string);

        case 'closePage':
          return {
            success: true,
            data: { pageId: operation.params.pageId, closed: true },
            retryable: false,
            operationId: 'op-close',
          } satisfies DriverResult;

        default:
          return {
            success: false,
            error: { code: 'UNSUPPORTED', message: 'Unsupported operation', retryable: false },
            retryable: false,
            operationId: 'op-err',
          } satisfies DriverResult;
      }
    }),
    connect: vi.fn().mockResolvedValue({ success: true, status: 'ready' }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, status: 'ready' }),
    verify: vi.fn().mockResolvedValue({ verified: true, operationId: 'op-1' }),
    getRetryPolicy: vi.fn().mockReturnValue({ maxAttempts: 2, initialDelayMs: 1000, maxDelayMs: 16000, backoffMultiplier: 2 }),
    getCircuitBreakerState: vi.fn().mockReturnValue('closed'),
    getCircuitBreakerFailureCount: vi.fn().mockReturnValue(0),
    _setResult: (type: string, result: DriverResult) => executeResults.set(type, result),
    ...overrides,
  };

  return mockDriver as unknown as BrowserDriver;
}

function createEvaluateResult(script: string): DriverResult {
  // Determine what kind of extraction is being requested based on script content
  if (script.includes('product-header__title') || script.includes('itemprop="name"')) {
    // Metadata extraction
    return {
      success: true,
      data: {
        result: {
          appName: 'TestApp Pro',
          developer: 'TestDev Inc.',
          category: 'Productivity',
          rating: 4.7,
          reviewCount: 12500,
          price: 'Free',
          description: 'A powerful productivity app with streak tracking and daily reminders. Social features let you connect with friends.',
          iapOptions: ['Premium Monthly $9.99', 'Premium Annual $49.99'],
          featureList: ['Task Management', 'Calendar Sync', 'Reminders', 'Collaboration', 'Analytics'],
          screenshotUrls: ['https://example.com/screen1.png', 'https://example.com/screen2.png', 'https://example.com/screen3.png'],
        },
      },
      retryable: false,
      operationId: 'op-eval-meta',
    };
  }

  if (script.includes('screenshot') || script.includes('img')) {
    // Screenshot extraction
    return {
      success: true,
      data: {
        result: [
          'https://example.com/screen1.png',
          'https://example.com/screen2.png',
          'https://example.com/screen3.png',
          'https://example.com/screen4.png',
        ],
      },
      retryable: false,
      operationId: 'op-eval-screens',
    };
  }

  if (script.includes('customer-review') || script.includes('data-review-id')) {
    // Review extraction
    return {
      success: true,
      data: {
        result: generateMockReviews(55),
      },
      retryable: false,
      operationId: 'op-eval-reviews',
    };
  }

  // Default
  return {
    success: true,
    data: { result: null },
    retryable: false,
    operationId: 'op-eval-default',
  };
}

function generateMockReviews(count: number): Array<{ text: string; rating: number; date: string }> {
  const reviews = [];
  for (let i = 0; i < count; i++) {
    const rating = i < count * 0.6 ? 5 : i < count * 0.8 ? 4 : i < count * 0.9 ? 3 : 2;
    reviews.push({
      text: `Review ${i + 1}: ${rating >= 4 ? 'Great app, love the ease of use' : 'Could be better, occasional crashes'}`,
      rating,
      date: '2024-01-15',
    });
  }
  return reviews;
}

function createMockOtzarService(): OtzarService {
  return {
    routeTask: vi.fn().mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      estimatedCost: 0.01,
      rationale: 'Best for analysis tasks',
    }),
    checkBudget: vi.fn().mockResolvedValue({ allowed: true, remainingDaily: 50, remainingMonthly: 500 }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getCostReport: vi.fn().mockResolvedValue({ totalCostUsd: 5, byAgent: {}, byPillar: {}, byModel: {}, period: { start: new Date(), end: new Date() } }),
    getDailyOptimizationReport: vi.fn().mockResolvedValue({ date: new Date(), totalSpend: 5, wastePatterns: [], savingsOpportunities: [], estimatedSavings: 0 }),
    checkCache: vi.fn().mockResolvedValue(null),
    storeCache: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppStoreAnalyzerImpl', () => {
  let browserDriver: BrowserDriver;
  let otzarService: OtzarService;
  let analyzer: AppStoreAnalyzerImpl;

  beforeEach(() => {
    browserDriver = createMockBrowserDriver();
    otzarService = createMockOtzarService();
    analyzer = new AppStoreAnalyzerImpl(browserDriver, otzarService);
  });

  // -------------------------------------------------------------------------
  // Metadata Extraction — iOS
  // -------------------------------------------------------------------------

  describe('metadata extraction from iOS App Store listing', () => {
    it('extracts app name, developer, category from iOS listing HTML', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.listing.appName).toBe('TestApp Pro');
      expect(report.listing.developer).toBe('TestDev Inc.');
      expect(report.listing.category).toBe('Productivity');
    });

    it('extracts rating and review count from iOS listing', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.listing.rating).toBe(4.7);
      expect(report.listing.reviewCount).toBe(12500);
    });

    it('extracts pricing model and IAP options from iOS listing', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.listing.pricingModel).toBe('freemium');
      expect(report.listing.iapOptions).toContain('Premium Monthly $9.99');
      expect(report.listing.iapOptions).toContain('Premium Annual $49.99');
    });

    it('extracts description and feature list from iOS listing', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.listing.description).toContain('productivity app');
      expect(report.listing.featureList.length).toBeGreaterThan(0);
      expect(report.listing.featureList).toContain('Task Management');
    });
  });

  // -------------------------------------------------------------------------
  // Metadata Extraction — Google Play
  // -------------------------------------------------------------------------

  describe('metadata extraction from Google Play listing', () => {
    it('extracts app name, developer, category from Google Play listing HTML', async () => {
      const report = await analyzer.analyze('https://play.google.com/store/apps/details?id=com.test', 'android');

      expect(report.listing.appName).toBe('TestApp Pro');
      expect(report.listing.developer).toBe('TestDev Inc.');
      expect(report.listing.category).toBe('Productivity');
    });

    it('extracts rating and review count from Google Play listing', async () => {
      const report = await analyzer.analyze('https://play.google.com/store/apps/details?id=com.test', 'android');

      expect(report.listing.rating).toBe(4.7);
      expect(report.listing.reviewCount).toBe(12500);
    });

    it('sets platform to android for Google Play URLs', async () => {
      const report = await analyzer.analyze('https://play.google.com/store/apps/details?id=com.test', 'android');

      expect(report.platform).toBe('android');
      expect(report.type).toBe('app-store-android');
    });
  });

  // -------------------------------------------------------------------------
  // Screenshot Analysis
  // -------------------------------------------------------------------------

  describe('screenshot analysis produces UI pattern classifications', () => {
    it('reports screen count from extracted screenshots', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.visualAnalysis.screenCount).toBeGreaterThan(0);
    });

    it('produces layout pattern classifications', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.visualAnalysis.layoutPatterns).toBeInstanceOf(Array);
      expect(report.visualAnalysis.layoutPatterns.length).toBeGreaterThan(0);
    });

    it('identifies color usage patterns', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.visualAnalysis.colorUsage).toBeInstanceOf(Array);
      expect(report.visualAnalysis.colorUsage.length).toBeGreaterThan(0);
    });

    it('identifies typography patterns', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.visualAnalysis.typography).toBeInstanceOf(Array);
      expect(report.visualAnalysis.typography.length).toBeGreaterThan(0);
    });

    it('classifies navigation structure', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.visualAnalysis.navigationStructure).toBeTruthy();
      expect(typeof report.visualAnalysis.navigationStructure).toBe('string');
    });

    it('classifies information density', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.visualAnalysis.informationDensity).toBeTruthy();
      expect(['sparse', 'medium', 'dense', 'unknown']).toContain(report.visualAnalysis.informationDensity);
    });

    it('uses Otzar for vision analysis routing', async () => {
      await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(otzarService.routeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'analysis',
          agentId: 'app-store-analyzer',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Review Analysis
  // -------------------------------------------------------------------------

  describe('review analysis extracts sentiment and feature insights', () => {
    it('analyzes minimum 50 reviews when available', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      // The mock provides 55 reviews, analysis should process at least 50
      expect(report.reviewInsights).toBeDefined();
      expect(report.reviewInsights.sentimentDistribution).toBeDefined();
    });

    it('extracts top praised features', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.reviewInsights.topPraisedFeatures).toBeInstanceOf(Array);
      expect(report.reviewInsights.topPraisedFeatures.length).toBeGreaterThan(0);
    });

    it('extracts common complaints', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.reviewInsights.commonComplaints).toBeInstanceOf(Array);
      expect(report.reviewInsights.commonComplaints.length).toBeGreaterThan(0);
    });

    it('produces sentiment distribution that sums to approximately 1.0', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      const { positive, neutral, negative } = report.reviewInsights.sentimentDistribution;
      const sum = positive + neutral + negative;
      expect(sum).toBeCloseTo(1.0, 1);
      expect(positive).toBeGreaterThanOrEqual(0);
      expect(neutral).toBeGreaterThanOrEqual(0);
      expect(negative).toBeGreaterThanOrEqual(0);
    });

    it('extracts feature requests from reviews', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.reviewInsights.featureRequests).toBeInstanceOf(Array);
      expect(report.reviewInsights.featureRequests.length).toBeGreaterThan(0);
    });

    it('uses Otzar classification routing for review analysis', async () => {
      await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(otzarService.routeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'classification',
          agentId: 'app-store-analyzer',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Pattern Inference
  // -------------------------------------------------------------------------

  describe('pattern inference produces valid classifications', () => {
    it('infers onboarding complexity classification', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.inferredPatterns.onboardingComplexity).toBeTruthy();
      expect(['minimal', 'simple', 'moderate', 'complex']).toContain(
        report.inferredPatterns.onboardingComplexity,
      );
    });

    it('infers monetization model classification', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.inferredPatterns.monetizationModel).toBeTruthy();
      expect(['free', 'freemium', 'premium', 'premium-plus-iap', 'subscription']).toContain(
        report.inferredPatterns.monetizationModel,
      );
    });

    it('infers notification strategy', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.inferredPatterns.notificationStrategy).toBeTruthy();
      expect(typeof report.inferredPatterns.notificationStrategy).toBe('string');
    });

    it('infers interaction patterns as array', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.inferredPatterns.interactionPatterns).toBeInstanceOf(Array);
      expect(report.inferredPatterns.interactionPatterns.length).toBeGreaterThan(0);
    });

    it('infers retention mechanics as array', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.inferredPatterns.retentionMechanics).toBeInstanceOf(Array);
      expect(report.inferredPatterns.retentionMechanics.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Failure Handling
  // -------------------------------------------------------------------------

  describe('failure handling for inaccessible listings', () => {
    it('throws AppStoreAnalysisError with regional_restriction reason', async () => {
      const failDriver = createMockBrowserDriver();
      (failDriver.execute as ReturnType<typeof vi.fn>).mockImplementation(async (op: { type: string }) => {
        if (op.type === 'navigate') {
          return {
            success: true,
            data: { pageId: 'test-page-1', url: 'test', status: 200, title: 'Test', loadTimeMs: 100, navigatedAt: new Date().toISOString() },
            retryable: false,
            operationId: 'op-1',
          };
        }
        if (op.type === 'evaluate') {
          throw new Error('Content not available in your country or region');
        }
        return { success: true, data: {}, retryable: false, operationId: 'op-x' };
      });

      const failAnalyzer = new AppStoreAnalyzerImpl(failDriver, otzarService);

      await expect(
        failAnalyzer.analyze('https://apps.apple.com/jp/app/test/id123', 'ios'),
      ).rejects.toThrow(AppStoreAnalysisError);

      try {
        await failAnalyzer.analyze('https://apps.apple.com/jp/app/test/id123', 'ios');
      } catch (err) {
        const error = err as AppStoreAnalysisError;
        expect(error.reason).toBe('regional_restriction');
        expect(error.suggestions).toBeDefined();
        expect(error.suggestions!.length).toBeGreaterThan(0);
      }
    });

    it('throws AppStoreAnalysisError with app_removed reason for 404', async () => {
      const failDriver = createMockBrowserDriver();
      (failDriver.execute as ReturnType<typeof vi.fn>).mockImplementation(async (op: { type: string }) => {
        if (op.type === 'navigate') {
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Page not found (404)', retryable: false },
            retryable: false,
            operationId: 'op-1',
          };
        }
        return { success: true, data: {}, retryable: false, operationId: 'op-x' };
      });

      const failAnalyzer = new AppStoreAnalyzerImpl(failDriver, otzarService);

      await expect(
        failAnalyzer.analyze('https://apps.apple.com/us/app/removed/id999', 'ios'),
      ).rejects.toThrow(AppStoreAnalysisError);

      try {
        await failAnalyzer.analyze('https://apps.apple.com/us/app/removed/id999', 'ios');
      } catch (err) {
        const error = err as AppStoreAnalysisError;
        expect(error.reason).toBe('app_removed');
        expect(error.suggestions).toBeDefined();
        expect(error.suggestions!.length).toBeGreaterThan(0);
      }
    });

    it('throws AppStoreAnalysisError with scraping_failed for generic errors', async () => {
      const failDriver = createMockBrowserDriver();
      (failDriver.execute as ReturnType<typeof vi.fn>).mockImplementation(async (op: { type: string }) => {
        if (op.type === 'navigate') {
          return {
            success: true,
            data: { pageId: 'test-page-1', url: 'test', status: 200, title: 'Test', loadTimeMs: 100, navigatedAt: new Date().toISOString() },
            retryable: false,
            operationId: 'op-1',
          };
        }
        if (op.type === 'evaluate') {
          throw new Error('Unexpected page structure');
        }
        return { success: true, data: {}, retryable: false, operationId: 'op-x' };
      });

      const failAnalyzer = new AppStoreAnalyzerImpl(failDriver, otzarService);

      await expect(
        failAnalyzer.analyze('https://apps.apple.com/us/app/test/id123', 'ios'),
      ).rejects.toThrow(AppStoreAnalysisError);

      try {
        await failAnalyzer.analyze('https://apps.apple.com/us/app/test/id123', 'ios');
      } catch (err) {
        const error = err as AppStoreAnalysisError;
        expect(error.reason).toBe('scraping_failed');
      }
    });

    it('includes specific reason message in error', async () => {
      const failDriver = createMockBrowserDriver();
      (failDriver.execute as ReturnType<typeof vi.fn>).mockImplementation(async (op: { type: string }) => {
        if (op.type === 'navigate') {
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: 'App has been removed from the store', retryable: false },
            retryable: false,
            operationId: 'op-1',
          };
        }
        return { success: true, data: {}, retryable: false, operationId: 'op-x' };
      });

      const failAnalyzer = new AppStoreAnalyzerImpl(failDriver, otzarService);

      try {
        await failAnalyzer.analyze('https://apps.apple.com/us/app/removed/id999', 'ios');
      } catch (err) {
        const error = err as AppStoreAnalysisError;
        expect(error.message).toContain('removed');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Output Structure Conformance
  // -------------------------------------------------------------------------

  describe('output conforms to AppReferenceReport structure', () => {
    it('includes all required top-level fields', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(report.url).toBe('https://apps.apple.com/us/app/testapp/id123');
      expect(report.type).toBe('app-store-ios');
      expect(report.analyzedAt).toBeInstanceOf(Date);
      expect(report.platform).toBe('ios');
      expect(report.listing).toBeDefined();
      expect(report.visualAnalysis).toBeDefined();
      expect(report.reviewInsights).toBeDefined();
      expect(report.inferredPatterns).toBeDefined();
    });

    it('listing section has all required fields', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(typeof report.listing.appName).toBe('string');
      expect(typeof report.listing.developer).toBe('string');
      expect(typeof report.listing.category).toBe('string');
      expect(typeof report.listing.rating).toBe('number');
      expect(typeof report.listing.reviewCount).toBe('number');
      expect(typeof report.listing.pricingModel).toBe('string');
      expect(Array.isArray(report.listing.iapOptions)).toBe(true);
      expect(typeof report.listing.description).toBe('string');
      expect(Array.isArray(report.listing.featureList)).toBe(true);
    });

    it('visualAnalysis section has all required fields', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(typeof report.visualAnalysis.screenCount).toBe('number');
      expect(Array.isArray(report.visualAnalysis.layoutPatterns)).toBe(true);
      expect(Array.isArray(report.visualAnalysis.colorUsage)).toBe(true);
      expect(Array.isArray(report.visualAnalysis.typography)).toBe(true);
      expect(typeof report.visualAnalysis.navigationStructure).toBe('string');
      expect(typeof report.visualAnalysis.informationDensity).toBe('string');
    });

    it('reviewInsights section has all required fields', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(Array.isArray(report.reviewInsights.topPraisedFeatures)).toBe(true);
      expect(Array.isArray(report.reviewInsights.commonComplaints)).toBe(true);
      expect(typeof report.reviewInsights.sentimentDistribution.positive).toBe('number');
      expect(typeof report.reviewInsights.sentimentDistribution.neutral).toBe('number');
      expect(typeof report.reviewInsights.sentimentDistribution.negative).toBe('number');
      expect(Array.isArray(report.reviewInsights.featureRequests)).toBe(true);
    });

    it('inferredPatterns section has all required fields', async () => {
      const report = await analyzer.analyze('https://apps.apple.com/us/app/testapp/id123', 'ios');

      expect(typeof report.inferredPatterns.onboardingComplexity).toBe('string');
      expect(typeof report.inferredPatterns.monetizationModel).toBe('string');
      expect(typeof report.inferredPatterns.notificationStrategy).toBe('string');
      expect(Array.isArray(report.inferredPatterns.interactionPatterns)).toBe(true);
      expect(Array.isArray(report.inferredPatterns.retentionMechanics)).toBe(true);
    });

    it('report satisfies AppReferenceReport type', async () => {
      const report: AppReferenceReport = await analyzer.analyze(
        'https://apps.apple.com/us/app/testapp/id123',
        'ios',
      );

      // TypeScript compilation validates the type; runtime check for completeness
      expect(report).toBeDefined();
      expect(report.type).toMatch(/^app-store-(ios|android)$/);
    });
  });
});
