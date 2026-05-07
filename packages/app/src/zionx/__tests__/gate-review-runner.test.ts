/**
 * Unit tests for ZionX Gate Review Runner
 *
 * Validates: Requirements 34f.32, 34f.33, 34f.36, 34g.38
 *
 * Tests that the gate review runner:
 * - Invokes Reference Quality Gate before existing gates
 * - Falls back gracefully when no baseline exists
 * - Routes through Auto-Rework Loop on failure
 * - Skips reference gate when not configured (backward compatible)
 */

import { describe, it, expect, vi } from 'vitest';
import { ZionXGateReviewRunner } from '../gate-review-runner.js';
import type { ZionXGateReviewConfig } from '../gate-review-runner.js';
import type { AllGateInputs } from '../gates.js';
import type { ReferenceQualityGate, ProductionOutput, GateEvaluationResult } from '@seraphim/services/reference-ingestion/gate/reference-quality-gate.js';
import type { AutoReworkLoop } from '@seraphim/services/reference-ingestion/rework/auto-rework-loop.js';
import type { RejectionReport } from '@seraphim/services/reference-ingestion/gate/reference-quality-gate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validGateInputs(): AllGateInputs {
  return {
    metadata: {
      title: 'My App',
      description: 'A great app for productivity',
      keywords: ['productivity', 'tools'],
      category: 'Productivity',
    },
    subscription: {
      hasSubscriptions: true,
      eulaLink: 'https://example.com/eula',
      privacyPolicyInApp: true,
    },
    iapSandbox: {
      tested: true,
      purchaseFlowVerified: true,
      restoreFlowVerified: true,
      sandboxAccountUsed: true,
    },
    screenshots: {
      screenshots: [
        { deviceType: 'iPhone 6.7"', width: 1290, height: 2796, count: 3 },
        { deviceType: 'iPhone 6.5"', width: 1284, height: 2778, count: 3 },
        { deviceType: 'iPad Pro 12.9"', width: 2048, height: 2732, count: 3 },
      ],
    },
    platform: 'ios',
    privacyPolicy: {
      url: 'https://example.com/privacy',
      inAppAccessible: true,
    },
    eula: {
      url: 'https://example.com/eula',
      linkedInMetadata: true,
    },
  };
}

function mockOutput(): ProductionOutput {
  return {
    id: 'app-output-1',
    type: 'app',
    name: 'Test App',
    content: { sourceCode: '/path/to/src', buildArtifact: '/path/to/build' },
  };
}

function createMockReferenceQualityGate(evaluateResult: GateEvaluationResult): ReferenceQualityGate {
  return {
    evaluate: vi.fn().mockResolvedValue(evaluateResult),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReferenceQualityGate;
}

function createMockAutoReworkLoop(handleResult: GateEvaluationResult): AutoReworkLoop {
  return {
    handleRejection: vi.fn().mockResolvedValue(handleResult),
    getTracker: vi.fn().mockReturnValue(undefined),
  } as unknown as AutoReworkLoop;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ZionXGateReviewRunner', () => {
  describe('without reference quality gate (backward compatible)', () => {
    it('runs only existing gates when no reference quality gate is configured', async () => {
      const runner = new ZionXGateReviewRunner({});
      const result = await runner.runGateReview(mockOutput(), validGateInputs());

      expect(result.allPassed).toBe(true);
      expect(result.referenceGateSkipped).toBe(true);
      expect(result.referenceGateResult).toBeUndefined();
      expect(result.reworkTriggered).toBe(false);
      expect(result.existingGateResults.allPassed).toBe(true);
    });

    it('reports existing gate failures when no reference quality gate is configured', async () => {
      const runner = new ZionXGateReviewRunner({});
      const inputs = validGateInputs();
      inputs.metadata.title = ''; // Invalid metadata

      const result = await runner.runGateReview(mockOutput(), inputs);

      expect(result.allPassed).toBe(false);
      expect(result.referenceGateSkipped).toBe(true);
      expect(result.existingGateResults.allPassed).toBe(false);
    });
  });

  describe('with reference quality gate — no baseline (fallback)', () => {
    it('falls back gracefully when no baseline exists and runs existing gates', async () => {
      const fallbackResult: GateEvaluationResult = {
        passed: true,
        dimensionScores: [],
        overallScore: 0,
        baselineVersion: null,
        note: 'No baseline available for this domain category. Falling back to default pass.',
      };

      const gate = createMockReferenceQualityGate(fallbackResult);
      const runner = new ZionXGateReviewRunner({ referenceQualityGate: gate });

      const result = await runner.runGateReview(mockOutput(), validGateInputs());

      expect(result.allPassed).toBe(true);
      expect(result.referenceGateSkipped).toBe(true);
      expect(result.existingGateResults.allPassed).toBe(true);
      expect(gate.evaluate).toHaveBeenCalledWith(mockOutput(), 'mobile-app');
    });
  });

  describe('with reference quality gate — passes', () => {
    it('proceeds to existing gates when reference quality gate passes', async () => {
      const passResult: GateEvaluationResult = {
        passed: true,
        dimensionScores: [
          { dimension: 'ui-quality', achievedScore: 8, requiredScore: 7, passed: true },
        ],
        overallScore: 8,
        baselineVersion: 1,
      };

      const gate = createMockReferenceQualityGate(passResult);
      const runner = new ZionXGateReviewRunner({ referenceQualityGate: gate });

      const result = await runner.runGateReview(mockOutput(), validGateInputs());

      expect(result.allPassed).toBe(true);
      expect(result.referenceGateSkipped).toBe(false);
      expect(result.referenceGateResult?.passed).toBe(true);
      expect(result.reworkTriggered).toBe(false);
      expect(result.existingGateResults.allPassed).toBe(true);
      // Reference gate result should be in combined results
      expect(result.combinedResults[0]?.gateId).toBe('gate-reference-quality');
      expect(result.combinedResults[0]?.passed).toBe(true);
    });
  });

  describe('with reference quality gate — fails, no rework loop', () => {
    it('fails immediately when reference gate fails and no rework loop is configured', async () => {
      const rejectionReport: RejectionReport = {
        failedDimensions: [
          { dimension: 'ui-quality', achievedScore: 4, requiredScore: 7, passed: false, gap: 'Low quality UI' },
        ],
        allScores: [
          { dimension: 'ui-quality', achievedScore: 4, requiredScore: 7, passed: false, gap: 'Low quality UI' },
        ],
        baselineVersion: 1,
        domainCategory: 'mobile-app',
        summary: 'Quality gate failed on 1 dimension(s)',
      };

      const failResult: GateEvaluationResult = {
        passed: false,
        dimensionScores: [
          { dimension: 'ui-quality', achievedScore: 4, requiredScore: 7, passed: false, gap: 'Low quality UI' },
        ],
        overallScore: 4,
        baselineVersion: 1,
        rejectionReport,
      };

      const gate = createMockReferenceQualityGate(failResult);
      const runner = new ZionXGateReviewRunner({ referenceQualityGate: gate });

      const result = await runner.runGateReview(mockOutput(), validGateInputs());

      expect(result.allPassed).toBe(false);
      expect(result.referenceGateSkipped).toBe(false);
      expect(result.reworkTriggered).toBe(false);
      // Existing gates should NOT have been run
      expect(result.existingGateResults.results).toHaveLength(0);
    });
  });

  describe('with reference quality gate — fails, rework succeeds', () => {
    it('routes through rework loop and proceeds to existing gates on success', async () => {
      const rejectionReport: RejectionReport = {
        failedDimensions: [
          { dimension: 'ui-quality', achievedScore: 4, requiredScore: 7, passed: false, gap: 'Low quality UI' },
        ],
        allScores: [
          { dimension: 'ui-quality', achievedScore: 4, requiredScore: 7, passed: false, gap: 'Low quality UI' },
        ],
        baselineVersion: 1,
        domainCategory: 'mobile-app',
        summary: 'Quality gate failed on 1 dimension(s)',
      };

      const failResult: GateEvaluationResult = {
        passed: false,
        dimensionScores: [
          { dimension: 'ui-quality', achievedScore: 4, requiredScore: 7, passed: false, gap: 'Low quality UI' },
        ],
        overallScore: 4,
        baselineVersion: 1,
        rejectionReport,
      };

      const reworkPassResult: GateEvaluationResult = {
        passed: true,
        dimensionScores: [
          { dimension: 'ui-quality', achievedScore: 8, requiredScore: 7, passed: true },
        ],
        overallScore: 8,
        baselineVersion: 1,
      };

      const gate = createMockReferenceQualityGate(failResult);
      const reworkLoop = createMockAutoReworkLoop(reworkPassResult);
      const runner = new ZionXGateReviewRunner({
        referenceQualityGate: gate,
        autoReworkLoop: reworkLoop,
      });

      const result = await runner.runGateReview(mockOutput(), validGateInputs());

      expect(result.allPassed).toBe(true);
      expect(result.reworkTriggered).toBe(true);
      expect(result.reworkResult?.passed).toBe(true);
      expect(reworkLoop.handleRejection).toHaveBeenCalledWith(mockOutput(), rejectionReport);
      // Existing gates should have been run after successful rework
      expect(result.existingGateResults.allPassed).toBe(true);
    });
  });

  describe('with reference quality gate — fails, rework fails (escalation)', () => {
    it('fails when rework loop exhausts attempts and escalates', async () => {
      const rejectionReport: RejectionReport = {
        failedDimensions: [
          { dimension: 'ui-quality', achievedScore: 4, requiredScore: 7, passed: false, gap: 'Low quality UI' },
        ],
        allScores: [
          { dimension: 'ui-quality', achievedScore: 4, requiredScore: 7, passed: false, gap: 'Low quality UI' },
        ],
        baselineVersion: 1,
        domainCategory: 'mobile-app',
        summary: 'Quality gate failed on 1 dimension(s)',
      };

      const failResult: GateEvaluationResult = {
        passed: false,
        dimensionScores: [
          { dimension: 'ui-quality', achievedScore: 4, requiredScore: 7, passed: false, gap: 'Low quality UI' },
        ],
        overallScore: 4,
        baselineVersion: 1,
        rejectionReport,
      };

      const reworkFailResult: GateEvaluationResult = {
        passed: false,
        dimensionScores: [
          { dimension: 'ui-quality', achievedScore: 5, requiredScore: 7, passed: false },
        ],
        overallScore: 5,
        baselineVersion: 1,
        note: 'Escalated to King after 5 failed rework attempts',
      };

      const gate = createMockReferenceQualityGate(failResult);
      const reworkLoop = createMockAutoReworkLoop(reworkFailResult);
      const runner = new ZionXGateReviewRunner({
        referenceQualityGate: gate,
        autoReworkLoop: reworkLoop,
      });

      const result = await runner.runGateReview(mockOutput(), validGateInputs());

      expect(result.allPassed).toBe(false);
      expect(result.reworkTriggered).toBe(true);
      expect(result.reworkResult?.passed).toBe(false);
      // Existing gates should NOT have been run
      expect(result.existingGateResults.results).toHaveLength(0);
    });
  });

  describe('custom domain category', () => {
    it('uses the configured domain category for evaluation', async () => {
      const passResult: GateEvaluationResult = {
        passed: true,
        dimensionScores: [],
        overallScore: 9,
        baselineVersion: 2,
      };

      const gate = createMockReferenceQualityGate(passResult);
      const runner = new ZionXGateReviewRunner({
        referenceQualityGate: gate,
        domainCategory: 'productivity-app',
      });

      await runner.runGateReview(mockOutput(), validGateInputs());

      expect(gate.evaluate).toHaveBeenCalledWith(mockOutput(), 'productivity-app');
    });
  });
});
