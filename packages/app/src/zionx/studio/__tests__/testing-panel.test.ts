/**
 * Unit tests for ZionX App Development Studio — Testing Panel Service
 *
 * Validates: Requirements 42f.16, 42f.17, 42f.18, 19.1
 *
 * Tests test execution, gate check logic, store readiness validation,
 * design quality scoring, and gate-blocked progression.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultTestingPanelService,
  type TestingPanelService,
  type TestExecutor,
  type DesignQualityAnalyzer,
  type StoreMetadataProvider,
  type TestCheckResult,
  type DesignQualityScore,
} from '../testing-panel.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockTestExecutor(overrides?: Partial<TestExecutor>): TestExecutor {
  return {
    runUnitTests: overrides?.runUnitTests ?? vi.fn(async () => [
      { id: 'unit-1', category: 'unit', name: 'Component renders', passed: true, duration: 12 },
      { id: 'unit-2', category: 'unit', name: 'State updates', passed: true, duration: 8 },
    ]),
    runUITests: overrides?.runUITests ?? vi.fn(async () => [
      { id: 'ui-1', category: 'ui', name: 'Navigation flow', passed: true, duration: 45 },
    ]),
    runAccessibilityChecks: overrides?.runAccessibilityChecks ?? vi.fn(async () => [
      { id: 'a11y-1', category: 'accessibility', name: 'Color contrast', passed: true, duration: 20 },
      { id: 'a11y-2', category: 'accessibility', name: 'Touch targets', passed: true, duration: 15 },
    ]),
  };
}

function createMockDesignQualityAnalyzer(score?: Partial<DesignQualityScore>): DesignQualityAnalyzer {
  return {
    analyze: vi.fn(async () => ({
      overall: score?.overall ?? 85,
      visualPolish: score?.visualPolish ?? 88,
      interactionDesign: score?.interactionDesign ?? 82,
      informationArchitecture: score?.informationArchitecture ?? 84,
      onboardingEffectiveness: score?.onboardingEffectiveness ?? 86,
      baselineComparison: score?.baselineComparison ?? 'Quality_Baseline',
    })),
  };
}

function createMockStoreMetadataProvider(overrides?: Record<string, unknown>): StoreMetadataProvider {
  return {
    getMetadata: vi.fn(async () => ({
      appName: 'FitTracker',
      appDescription: 'A fitness tracking app',
      category: 'Health & Fitness',
      keywords: ['fitness', 'health', 'tracker'],
      privacyPolicyUrl: 'https://example.com/privacy',
      screenshots: {
        'iphone-6.7': ['screenshot1.png'],
        'iphone-6.5': ['screenshot2.png'],
        'ipad': ['screenshot3.png'],
        'google-play-phone': ['screenshot4.png'],
        'google-play-tablet': ['screenshot5.png'],
      },
      appIcon: 'icon-1024.png',
      featureGraphic: 'feature-graphic.png',
      eulaUrl: 'https://example.com/eula',
      hasIAP: false,
      iapProducts: [],
      iapSandboxValidated: false,
      ...overrides,
    })),
  };
}

function createService(options?: {
  testExecutor?: TestExecutor;
  designQualityAnalyzer?: DesignQualityAnalyzer;
  storeMetadataProvider?: StoreMetadataProvider;
}): TestingPanelService {
  return new DefaultTestingPanelService({
    testExecutor: options?.testExecutor ?? createMockTestExecutor(),
    designQualityAnalyzer: options?.designQualityAnalyzer ?? createMockDesignQualityAnalyzer(),
    storeMetadataProvider: options?.storeMetadataProvider ?? createMockStoreMetadataProvider(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultTestingPanelService', () => {
  describe('runAllTests', () => {
    it('returns structured pass/fail results from all test categories', async () => {
      const service = createService();
      const results = await service.runAllTests('session-1');

      expect(results).toHaveLength(5);
      expect(results.every((r) => r.id && r.category && r.name && typeof r.passed === 'boolean')).toBe(true);
    });

    it('includes failure details when tests fail', async () => {
      const executor = createMockTestExecutor({
        runUnitTests: vi.fn(async () => [
          {
            id: 'unit-fail',
            category: 'unit' as const,
            name: 'Broken test',
            passed: false,
            error: 'Expected true but got false',
            duration: 5,
          },
        ]),
      });

      const service = createService({ testExecutor: executor });
      const results = await service.runAllTests('session-1');

      const failed = results.find((r) => r.id === 'unit-fail');
      expect(failed).toBeDefined();
      expect(failed!.passed).toBe(false);
      expect(failed!.error).toBe('Expected true but got false');
    });

    it('includes duration in results', async () => {
      const service = createService();
      const results = await service.runAllTests('session-1');

      const withDuration = results.filter((r) => r.duration !== undefined);
      expect(withDuration.length).toBeGreaterThan(0);
      expect(withDuration.every((r) => typeof r.duration === 'number')).toBe(true);
    });

    it('runs unit, UI, and accessibility tests in parallel', async () => {
      const executor = createMockTestExecutor();
      const service = createService({ testExecutor: executor });

      await service.runAllTests('session-1');

      expect(executor.runUnitTests).toHaveBeenCalledWith('session-1');
      expect(executor.runUITests).toHaveBeenCalledWith('session-1');
      expect(executor.runAccessibilityChecks).toHaveBeenCalledWith('session-1');
    });
  });

  describe('runCategory', () => {
    it('runs only unit tests when category is unit', async () => {
      const executor = createMockTestExecutor();
      const service = createService({ testExecutor: executor });

      const results = await service.runCategory('session-1', 'unit');

      expect(executor.runUnitTests).toHaveBeenCalled();
      expect(executor.runUITests).not.toHaveBeenCalled();
      expect(results.every((r) => r.category === 'unit')).toBe(true);
    });

    it('runs only accessibility checks when category is accessibility', async () => {
      const executor = createMockTestExecutor();
      const service = createService({ testExecutor: executor });

      const results = await service.runCategory('session-1', 'accessibility');

      expect(executor.runAccessibilityChecks).toHaveBeenCalled();
      expect(executor.runUnitTests).not.toHaveBeenCalled();
      expect(results.every((r) => r.category === 'accessibility')).toBe(true);
    });

    it('returns design quality results for design-quality category', async () => {
      const service = createService();
      const results = await service.runCategory('session-1', 'design-quality');

      expect(results).toHaveLength(1);
      expect(results[0].category).toBe('design-quality');
      expect(results[0].score).toBeDefined();
    });

    it('returns store readiness results for store-readiness category', async () => {
      const service = createService();
      const results = await service.runCategory('session-1', 'store-readiness');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.category === 'store-readiness')).toBe(true);
    });
  });

  describe('getGateChecks — blocks progression when critical checks fail', () => {
    it('marks accessibility gate as failed when accessibility checks fail', async () => {
      const executor = createMockTestExecutor({
        runAccessibilityChecks: vi.fn(async () => [
          { id: 'a11y-1', category: 'accessibility' as const, name: 'Color contrast', passed: false, error: 'Insufficient contrast ratio' },
        ]),
      });

      const service = createService({ testExecutor: executor });
      const gates = await service.getGateChecks('session-1');

      const a11yGate = gates.find((g) => g.id === 'gate-accessibility');
      expect(a11yGate).toBeDefined();
      expect(a11yGate!.critical).toBe(true);
      expect(a11yGate!.status).toBe('failed');
    });

    it('marks store metadata gate as failed when metadata is incomplete', async () => {
      const provider = createMockStoreMetadataProvider({ appName: '', keywords: [] });
      const service = createService({ storeMetadataProvider: provider });

      const gates = await service.getGateChecks('session-1');

      const metadataGate = gates.find((g) => g.id === 'gate-store-metadata');
      expect(metadataGate!.critical).toBe(true);
      expect(metadataGate!.status).toBe('failed');
    });

    it('marks privacy policy gate as failed when URL is missing', async () => {
      const provider = createMockStoreMetadataProvider({ privacyPolicyUrl: '' });
      const service = createService({ storeMetadataProvider: provider });

      const gates = await service.getGateChecks('session-1');

      const privacyGate = gates.find((g) => g.id === 'gate-privacy-policy');
      expect(privacyGate!.critical).toBe(true);
      expect(privacyGate!.status).toBe('failed');
    });

    it('marks screenshots gate as failed when sizes are missing', async () => {
      const provider = createMockStoreMetadataProvider({ screenshots: { 'iphone-6.7': ['s1.png'] } });
      const service = createService({ storeMetadataProvider: provider });

      const gates = await service.getGateChecks('session-1');

      const screenshotsGate = gates.find((g) => g.id === 'gate-screenshots');
      expect(screenshotsGate!.critical).toBe(true);
      expect(screenshotsGate!.status).toBe('failed');
    });

    it('marks IAP sandbox gate as failed when IAP is configured but not validated', async () => {
      const provider = createMockStoreMetadataProvider({
        hasIAP: true,
        iapProducts: ['premium'],
        iapSandboxValidated: false,
      });
      const service = createService({ storeMetadataProvider: provider });

      const gates = await service.getGateChecks('session-1');

      const iapGate = gates.find((g) => g.id === 'gate-iap-sandbox');
      expect(iapGate!.critical).toBe(true);
      expect(iapGate!.status).toBe('failed');
    });

    it('skips IAP sandbox gate when no IAP is configured', async () => {
      const provider = createMockStoreMetadataProvider({ hasIAP: false });
      const service = createService({ storeMetadataProvider: provider });

      const gates = await service.getGateChecks('session-1');

      const iapGate = gates.find((g) => g.id === 'gate-iap-sandbox');
      expect(iapGate!.status).toBe('skipped');
    });
  });

  describe('getGateChecks — allows progression when all critical checks pass', () => {
    it('marks all critical gates as passed with complete metadata', async () => {
      const service = createService();
      const gates = await service.getGateChecks('session-1');

      const criticalGates = gates.filter((g) => g.critical);
      const passedOrSkipped = criticalGates.filter((g) => g.status === 'passed' || g.status === 'skipped');
      expect(passedOrSkipped.length).toBe(criticalGates.length);
    });

    it('marks non-critical gates correctly without blocking', async () => {
      const service = createService();
      const gates = await service.getGateChecks('session-1');

      const nonCritical = gates.filter((g) => !g.critical);
      expect(nonCritical.length).toBe(3);
      expect(nonCritical.every((g) => g.id === 'gate-design-quality' || g.id === 'gate-unit-tests' || g.id === 'gate-ui-tests')).toBe(true);
    });
  });

  describe('canProgress — gate-blocked progression', () => {
    it('allows progression when all critical gates pass', async () => {
      const service = createService();
      const result = await service.canProgress('session-1');

      expect(result.allowed).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('blocks progression when a critical gate fails', async () => {
      const executor = createMockTestExecutor({
        runAccessibilityChecks: vi.fn(async () => [
          { id: 'a11y-1', category: 'accessibility' as const, name: 'Contrast', passed: false },
        ]),
      });

      const service = createService({ testExecutor: executor });
      const result = await service.canProgress('session-1');

      expect(result.allowed).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers[0].id).toBe('gate-accessibility');
    });

    it('blocks progression when multiple critical gates fail', async () => {
      const executor = createMockTestExecutor({
        runAccessibilityChecks: vi.fn(async () => [
          { id: 'a11y-1', category: 'accessibility' as const, name: 'Contrast', passed: false },
        ]),
      });
      const provider = createMockStoreMetadataProvider({ privacyPolicyUrl: '' });

      const service = createService({ testExecutor: executor, storeMetadataProvider: provider });
      const result = await service.canProgress('session-1');

      expect(result.allowed).toBe(false);
      expect(result.blockers.length).toBe(2);
    });

    it('allows progression even when non-critical gates fail', async () => {
      const analyzer = createMockDesignQualityAnalyzer({ overall: 50 });
      const executor = createMockTestExecutor({
        runUnitTests: vi.fn(async () => [
          { id: 'unit-1', category: 'unit' as const, name: 'Failing test', passed: false },
        ]),
      });

      const service = createService({ testExecutor: executor, designQualityAnalyzer: analyzer });
      const result = await service.canProgress('session-1');

      expect(result.allowed).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });
  });

  describe('getDesignQualityScore', () => {
    it('returns design quality score with all dimensions', async () => {
      const service = createService();
      const score = await service.getDesignQualityScore('session-1');

      expect(score.overall).toBe(85);
      expect(score.visualPolish).toBe(88);
      expect(score.interactionDesign).toBe(82);
      expect(score.informationArchitecture).toBe(84);
      expect(score.onboardingEffectiveness).toBe(86);
    });

    it('uses the configured quality baseline', async () => {
      const analyzer = createMockDesignQualityAnalyzer();
      const service = new DefaultTestingPanelService({
        testExecutor: createMockTestExecutor(),
        designQualityAnalyzer: analyzer,
        storeMetadataProvider: createMockStoreMetadataProvider(),
        qualityBaseline: 'Custom_Baseline',
      });

      await service.getDesignQualityScore('session-1');

      expect(analyzer.analyze).toHaveBeenCalledWith('session-1', 'Custom_Baseline');
    });

    it('marks design quality gate as failed when score is below 70', async () => {
      const analyzer = createMockDesignQualityAnalyzer({ overall: 55 });
      const service = createService({ designQualityAnalyzer: analyzer });

      const gates = await service.getGateChecks('session-1');
      const designGate = gates.find((g) => g.id === 'gate-design-quality');

      expect(designGate!.status).toBe('failed');
      expect(designGate!.result!.score).toBe(55);
      expect(designGate!.critical).toBe(false);
    });

    it('marks design quality gate as passed when score meets threshold', async () => {
      const analyzer = createMockDesignQualityAnalyzer({ overall: 70 });
      const service = createService({ designQualityAnalyzer: analyzer });

      const gates = await service.getGateChecks('session-1');
      const designGate = gates.find((g) => g.id === 'gate-design-quality');

      expect(designGate!.status).toBe('passed');
    });
  });

  describe('getStoreReadiness', () => {
    it('returns all store readiness items', async () => {
      const service = createService();
      const items = await service.getStoreReadiness('session-1');

      expect(items).toHaveLength(10);
      expect(items.map((i) => i.name)).toEqual([
        'App name set',
        'App description set',
        'Category selected',
        'Keywords defined',
        'Privacy policy URL',
        'Screenshots for all sizes',
        'App icon (1024×1024)',
        'Feature graphic (Google Play)',
        'IAP products configured',
        'EULA/Terms link',
      ]);
    });

    it('marks items as complete when metadata is present', async () => {
      const service = createService();
      const items = await service.getStoreReadiness('session-1');

      const requiredItems = items.filter((i) => i.required);
      expect(requiredItems.every((i) => i.status === 'complete')).toBe(true);
    });

    it('marks items as incomplete when metadata is missing', async () => {
      const provider = createMockStoreMetadataProvider({
        appName: '',
        appDescription: '',
        category: '',
        keywords: [],
        privacyPolicyUrl: '',
      });
      const service = createService({ storeMetadataProvider: provider });
      const items = await service.getStoreReadiness('session-1');

      const nameItem = items.find((i) => i.id === 'readiness-app-name');
      expect(nameItem!.status).toBe('incomplete');

      const descItem = items.find((i) => i.id === 'readiness-app-description');
      expect(descItem!.status).toBe('incomplete');
    });

    it('marks IAP items as not-applicable when no IAP configured', async () => {
      const provider = createMockStoreMetadataProvider({ hasIAP: false });
      const service = createService({ storeMetadataProvider: provider });
      const items = await service.getStoreReadiness('session-1');

      const iapItem = items.find((i) => i.id === 'readiness-iap-products');
      expect(iapItem!.status).toBe('not-applicable');
    });

    it('marks IAP items as complete when products are configured', async () => {
      const provider = createMockStoreMetadataProvider({
        hasIAP: true,
        iapProducts: ['premium-monthly', 'premium-yearly'],
      });
      const service = createService({ storeMetadataProvider: provider });
      const items = await service.getStoreReadiness('session-1');

      const iapItem = items.find((i) => i.id === 'readiness-iap-products');
      expect(iapItem!.status).toBe('complete');
    });
  });
});
