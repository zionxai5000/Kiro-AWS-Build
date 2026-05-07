/**
 * Unit tests for ZXMG Review Runner
 *
 * Validates: Requirements 34f.32, 34f.33, 34f.36, 34g.38
 *
 * Tests that the review runner:
 * - Invokes Reference Quality Gate before existing validation
 * - Falls back gracefully when no baseline exists
 * - Routes through Auto-Rework Loop on failure
 * - Skips reference gate when not configured (backward compatible)
 */

import { describe, it, expect, vi } from 'vitest';
import { ZXMGReviewRunner } from '../review-runner.js';
import type { ZXMGReviewConfig } from '../review-runner.js';
import type { AssembledVideo, ContentMetadata, ContentPlatform } from '../pipeline.js';
import type { ReferenceQualityGate, ProductionOutput, GateEvaluationResult } from '@seraphim/services/reference-ingestion/gate/reference-quality-gate.js';
import type { AutoReworkLoop } from '@seraphim/services/reference-ingestion/rework/auto-rework-loop.js';
import type { RejectionReport } from '@seraphim/services/reference-ingestion/gate/reference-quality-gate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validVideo(): AssembledVideo {
  return {
    videoPath: '/path/to/video.mp4',
    thumbnailPath: '/path/to/thumb.jpg',
    format: 'mp4',
    resolution: '1920x1080',
    durationSeconds: 120,
    fileSizeMb: 50,
    assembledAt: new Date().toISOString(),
  };
}

function validMetadata(): ContentMetadata {
  return {
    title: 'Test Video',
    description: 'A great test video about productivity',
    tags: ['productivity', 'tutorial'],
    category: 'Education',
    thumbnailPath: '/path/to/thumb.jpg',
    visibility: 'public',
    platform: 'youtube',
  };
}

function mockOutput(): ProductionOutput {
  return {
    id: 'video-output-1',
    type: 'video',
    name: 'Test Video',
    content: { videoPath: '/path/to/video.mp4', script: 'Test script content' },
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

describe('ZXMGReviewRunner', () => {
  const platform: ContentPlatform = 'youtube';

  describe('without reference quality gate (backward compatible)', () => {
    it('runs only existing validation when no reference quality gate is configured', async () => {
      const runner = new ZXMGReviewRunner({});
      const result = await runner.runReview(mockOutput(), validVideo(), validMetadata(), platform);

      expect(result.allPassed).toBe(true);
      expect(result.referenceGateSkipped).toBe(true);
      expect(result.referenceGateResult).toBeUndefined();
      expect(result.reworkTriggered).toBe(false);
      expect(result.validationResult.valid).toBe(true);
    });

    it('reports validation failures when no reference quality gate is configured', async () => {
      const runner = new ZXMGReviewRunner({});
      const video = validVideo();
      video.durationSeconds = 999999; // Exceeds YouTube max

      const result = await runner.runReview(mockOutput(), video, validMetadata(), platform);

      expect(result.allPassed).toBe(false);
      expect(result.referenceGateSkipped).toBe(true);
      expect(result.validationResult.valid).toBe(false);
    });
  });

  describe('with reference quality gate — no baseline (fallback)', () => {
    it('falls back gracefully when no baseline exists and runs existing validation', async () => {
      const fallbackResult: GateEvaluationResult = {
        passed: true,
        dimensionScores: [],
        overallScore: 0,
        baselineVersion: null,
        note: 'No baseline available for this domain category. Falling back to default pass.',
      };

      const gate = createMockReferenceQualityGate(fallbackResult);
      const runner = new ZXMGReviewRunner({ referenceQualityGate: gate });

      const result = await runner.runReview(mockOutput(), validVideo(), validMetadata(), platform);

      expect(result.allPassed).toBe(true);
      expect(result.referenceGateSkipped).toBe(true);
      expect(result.validationResult.valid).toBe(true);
      expect(gate.evaluate).toHaveBeenCalledWith(mockOutput(), 'video-content');
    });
  });

  describe('with reference quality gate — passes', () => {
    it('proceeds to existing validation when reference quality gate passes', async () => {
      const passResult: GateEvaluationResult = {
        passed: true,
        dimensionScores: [
          { dimension: 'hook-quality', achievedScore: 9, requiredScore: 7, passed: true },
        ],
        overallScore: 9,
        baselineVersion: 1,
      };

      const gate = createMockReferenceQualityGate(passResult);
      const runner = new ZXMGReviewRunner({ referenceQualityGate: gate });

      const result = await runner.runReview(mockOutput(), validVideo(), validMetadata(), platform);

      expect(result.allPassed).toBe(true);
      expect(result.referenceGateSkipped).toBe(false);
      expect(result.referenceGateResult?.passed).toBe(true);
      expect(result.reworkTriggered).toBe(false);
      expect(result.validationResult.valid).toBe(true);
      // Reference gate result should be in combined results
      expect(result.combinedResults[0]?.gateId).toBe('gate-reference-quality');
      expect(result.combinedResults[0]?.passed).toBe(true);
    });
  });

  describe('with reference quality gate — fails, no rework loop', () => {
    it('fails immediately when reference gate fails and no rework loop is configured', async () => {
      const rejectionReport: RejectionReport = {
        failedDimensions: [
          { dimension: 'hook-quality', achievedScore: 3, requiredScore: 7, passed: false, gap: 'Weak hook' },
        ],
        allScores: [
          { dimension: 'hook-quality', achievedScore: 3, requiredScore: 7, passed: false, gap: 'Weak hook' },
        ],
        baselineVersion: 1,
        domainCategory: 'video-content',
        summary: 'Quality gate failed on 1 dimension(s)',
      };

      const failResult: GateEvaluationResult = {
        passed: false,
        dimensionScores: [
          { dimension: 'hook-quality', achievedScore: 3, requiredScore: 7, passed: false, gap: 'Weak hook' },
        ],
        overallScore: 3,
        baselineVersion: 1,
        rejectionReport,
      };

      const gate = createMockReferenceQualityGate(failResult);
      const runner = new ZXMGReviewRunner({ referenceQualityGate: gate });

      const result = await runner.runReview(mockOutput(), validVideo(), validMetadata(), platform);

      expect(result.allPassed).toBe(false);
      expect(result.referenceGateSkipped).toBe(false);
      expect(result.reworkTriggered).toBe(false);
      // Validation should indicate reference quality failure
      expect(result.validationResult.valid).toBe(false);
    });
  });

  describe('with reference quality gate — fails, rework succeeds', () => {
    it('routes through rework loop and proceeds to existing validation on success', async () => {
      const rejectionReport: RejectionReport = {
        failedDimensions: [
          { dimension: 'hook-quality', achievedScore: 3, requiredScore: 7, passed: false, gap: 'Weak hook' },
        ],
        allScores: [
          { dimension: 'hook-quality', achievedScore: 3, requiredScore: 7, passed: false, gap: 'Weak hook' },
        ],
        baselineVersion: 1,
        domainCategory: 'video-content',
        summary: 'Quality gate failed on 1 dimension(s)',
      };

      const failResult: GateEvaluationResult = {
        passed: false,
        dimensionScores: [
          { dimension: 'hook-quality', achievedScore: 3, requiredScore: 7, passed: false, gap: 'Weak hook' },
        ],
        overallScore: 3,
        baselineVersion: 1,
        rejectionReport,
      };

      const reworkPassResult: GateEvaluationResult = {
        passed: true,
        dimensionScores: [
          { dimension: 'hook-quality', achievedScore: 8, requiredScore: 7, passed: true },
        ],
        overallScore: 8,
        baselineVersion: 1,
      };

      const gate = createMockReferenceQualityGate(failResult);
      const reworkLoop = createMockAutoReworkLoop(reworkPassResult);
      const runner = new ZXMGReviewRunner({
        referenceQualityGate: gate,
        autoReworkLoop: reworkLoop,
      });

      const result = await runner.runReview(mockOutput(), validVideo(), validMetadata(), platform);

      expect(result.allPassed).toBe(true);
      expect(result.reworkTriggered).toBe(true);
      expect(result.reworkResult?.passed).toBe(true);
      expect(reworkLoop.handleRejection).toHaveBeenCalledWith(mockOutput(), rejectionReport);
      // Existing validation should have been run after successful rework
      expect(result.validationResult.valid).toBe(true);
    });
  });

  describe('with reference quality gate — fails, rework fails (escalation)', () => {
    it('fails when rework loop exhausts attempts and escalates', async () => {
      const rejectionReport: RejectionReport = {
        failedDimensions: [
          { dimension: 'hook-quality', achievedScore: 3, requiredScore: 7, passed: false, gap: 'Weak hook' },
        ],
        allScores: [
          { dimension: 'hook-quality', achievedScore: 3, requiredScore: 7, passed: false, gap: 'Weak hook' },
        ],
        baselineVersion: 1,
        domainCategory: 'video-content',
        summary: 'Quality gate failed on 1 dimension(s)',
      };

      const failResult: GateEvaluationResult = {
        passed: false,
        dimensionScores: [
          { dimension: 'hook-quality', achievedScore: 3, requiredScore: 7, passed: false, gap: 'Weak hook' },
        ],
        overallScore: 3,
        baselineVersion: 1,
        rejectionReport,
      };

      const reworkFailResult: GateEvaluationResult = {
        passed: false,
        dimensionScores: [
          { dimension: 'hook-quality', achievedScore: 5, requiredScore: 7, passed: false },
        ],
        overallScore: 5,
        baselineVersion: 1,
        note: 'Escalated to King after 5 failed rework attempts',
      };

      const gate = createMockReferenceQualityGate(failResult);
      const reworkLoop = createMockAutoReworkLoop(reworkFailResult);
      const runner = new ZXMGReviewRunner({
        referenceQualityGate: gate,
        autoReworkLoop: reworkLoop,
      });

      const result = await runner.runReview(mockOutput(), validVideo(), validMetadata(), platform);

      expect(result.allPassed).toBe(false);
      expect(result.reworkTriggered).toBe(true);
      expect(result.reworkResult?.passed).toBe(false);
      // Validation should indicate failure
      expect(result.validationResult.valid).toBe(false);
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
      const runner = new ZXMGReviewRunner({
        referenceQualityGate: gate,
        domainCategory: 'educational-video',
      });

      await runner.runReview(mockOutput(), validVideo(), validMetadata(), platform);

      expect(gate.evaluate).toHaveBeenCalledWith(mockOutput(), 'educational-video');
    });
  });
});
