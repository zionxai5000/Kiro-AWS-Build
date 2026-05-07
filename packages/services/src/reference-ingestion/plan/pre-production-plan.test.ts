/**
 * Unit tests for Pre-Production Plan Service.
 *
 * Requirements: 34i.50, 34i.51, 34i.52, 34i.53, 34i.54, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';

import type { BaselineStorage } from '../baseline/baseline-storage.js';
import type { QualityBaseline, ScoredDimension } from '../baseline/types.js';

import {
  PreProductionPlanService,
  type ApprovalCallback,
  type ProductionPlan,
  type ApprovalResult,
} from './pre-production-plan.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockBaselineStorage(): BaselineStorage {
  return {
    store: vi.fn().mockResolvedValue('entry-1'),
    queryByCategory: vi.fn().mockResolvedValue(null),
    getVersionHistory: vi.fn().mockReturnValue([]),
  } as unknown as BaselineStorage;
}

function createMockOtzarService(): OtzarService {
  return {
    routeTask: vi.fn().mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      estimatedCost: 0.01,
      rationale: 'Best for analysis tasks',
    }),
    checkBudget: vi.fn().mockResolvedValue({ allowed: true, remainingDaily: 100, remainingMonthly: 1000 }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getCostReport: vi.fn().mockResolvedValue({ totalCostUsd: 0, byAgent: {}, byPillar: {}, byModel: {}, period: { start: new Date(), end: new Date() } }),
    getDailyOptimizationReport: vi.fn().mockResolvedValue({ date: new Date(), totalSpend: 0, wastePatterns: [], savingsOpportunities: [], estimatedSavings: 0 }),
    checkCache: vi.fn().mockResolvedValue(null),
    storeCache: vi.fn().mockResolvedValue(undefined),
  };
}

function createAppBaseline(overrides: Partial<QualityBaseline> = {}): QualityBaseline {
  return {
    id: 'baseline-app-1',
    type: 'app',
    domainCategory: 'wellness apps',
    dimensions: [
      {
        name: 'visual_polish',
        score: 7,
        referenceCount: 3,
        confidence: 0.9,
        examplePatterns: ['clean layout', 'consistent spacing', 'modern typography'],
      },
      {
        name: 'interaction_complexity',
        score: 6,
        referenceCount: 3,
        confidence: 0.85,
        examplePatterns: ['gesture navigation', 'smooth transitions', 'haptic feedback'],
      },
      {
        name: 'content_depth',
        score: 8,
        referenceCount: 3,
        confidence: 0.88,
        examplePatterns: ['rich media', 'personalized content', 'progressive disclosure'],
      },
    ],
    sources: [{ url: 'https://apps.apple.com/app/1', extractionDate: new Date(), weight: 1 }],
    corePrinciples: [],
    contradictions: [],
    overallConfidence: 0.87,
    version: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createVideoBaseline(overrides: Partial<QualityBaseline> = {}): QualityBaseline {
  return {
    id: 'baseline-video-1',
    type: 'video',
    domainCategory: 'tech review channels',
    dimensions: [
      {
        name: 'hook_strength',
        score: 8,
        referenceCount: 4,
        confidence: 0.92,
        examplePatterns: ['pattern interrupt', 'curiosity gap', 'bold claim'],
      },
      {
        name: 'pacing_quality',
        score: 7,
        referenceCount: 4,
        confidence: 0.88,
        examplePatterns: ['scene changes every 3s', 'energy variation', 'visual variety'],
      },
      {
        name: 'production_value',
        score: 6,
        referenceCount: 4,
        confidence: 0.85,
        examplePatterns: ['4K footage', 'color grading', 'professional audio'],
      },
    ],
    sources: [{ url: 'https://youtube.com/@channel1', extractionDate: new Date(), weight: 1 }],
    corePrinciples: [],
    contradictions: [],
    overallConfidence: 0.88,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreProductionPlanService', () => {
  let baselineStorage: BaselineStorage;
  let otzarService: OtzarService;
  let approvalCallback: ApprovalCallback;
  let service: PreProductionPlanService;

  beforeEach(() => {
    baselineStorage = createMockBaselineStorage();
    otzarService = createMockOtzarService();
    approvalCallback = vi.fn<[ProductionPlan], Promise<ApprovalResult>>().mockResolvedValue({ approved: true });
    service = new PreProductionPlanService(baselineStorage, otzarService, approvalCallback);
  });

  // -------------------------------------------------------------------------
  // ZionX (App) Plan Generation — Requirement 34i.50
  // -------------------------------------------------------------------------

  describe('ZionX generates production plan with all baseline dimensions addressed', () => {
    it('generates a plan addressing every dimension in the app baseline', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      expect(result.plan.dimensionApproaches).toHaveLength(baseline.dimensions.length);
      expect(result.plan.dimensionApproaches.map(a => a.dimension)).toEqual(
        baseline.dimensions.map(d => d.name),
      );
    });

    it('includes the baseline reference and version in the plan', async () => {
      const baseline = createAppBaseline({ id: 'baseline-app-42', version: 5 });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      expect(result.plan.baselineId).toBe('baseline-app-42');
      expect(result.plan.baselineVersion).toBe(5);
      expect(result.plan.type).toBe('app');
      expect(result.plan.domainCategory).toBe('wellness apps');
    });

    it('includes threshold values for each dimension', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      for (let i = 0; i < baseline.dimensions.length; i++) {
        expect(result.plan.dimensionApproaches[i].requiredScore).toBe(
          baseline.dimensions[i].score,
        );
      }
    });

    it('throws error when no baseline exists for the domain category', async () => {
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        service.generateAndApprovePlan('app', 'unknown category'),
      ).rejects.toThrow('No baseline found for domain category "unknown category"');
    });
  });

  // -------------------------------------------------------------------------
  // ZXMG (Video) Plan Generation — Requirement 34i.51
  // -------------------------------------------------------------------------

  describe('ZXMG generates production plan with all baseline dimensions addressed', () => {
    it('generates a plan addressing every dimension in the video baseline', async () => {
      const baseline = createVideoBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const result = await service.generateAndApprovePlan('video', 'tech review channels');

      expect(result.plan.dimensionApproaches).toHaveLength(baseline.dimensions.length);
      expect(result.plan.dimensionApproaches.map(a => a.dimension)).toEqual(
        baseline.dimensions.map(d => d.name),
      );
    });

    it('includes the baseline reference and version in the video plan', async () => {
      const baseline = createVideoBaseline({ id: 'baseline-video-7', version: 3 });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const result = await service.generateAndApprovePlan('video', 'tech review channels');

      expect(result.plan.baselineId).toBe('baseline-video-7');
      expect(result.plan.baselineVersion).toBe(3);
      expect(result.plan.type).toBe('video');
      expect(result.plan.domainCategory).toBe('tech review channels');
    });

    it('includes threshold values for each video dimension', async () => {
      const baseline = createVideoBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const result = await service.generateAndApprovePlan('video', 'tech review channels');

      for (let i = 0; i < baseline.dimensions.length; i++) {
        expect(result.plan.dimensionApproaches[i].requiredScore).toBe(
          baseline.dimensions[i].score,
        );
      }
    });

    it('uses Otzar routeTask for LLM-powered plan generation', async () => {
      const baseline = createVideoBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      await service.generateAndApprovePlan('video', 'tech review channels');

      expect(otzarService.routeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'analysis',
          complexity: 'medium',
          agentId: 'pre-production-plan',
          pillar: 'pre-production-plan',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Confidence Estimates and At-Risk Dimensions — Requirement 34i.52
  // -------------------------------------------------------------------------

  describe('plan includes confidence estimates and at-risk dimensions', () => {
    it('includes confidence estimate for each dimension approach', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      for (const approach of result.plan.dimensionApproaches) {
        expect(approach.confidence).toBeGreaterThanOrEqual(0);
        expect(approach.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('includes overall confidence in the plan', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      expect(result.plan.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(result.plan.overallConfidence).toBeLessThanOrEqual(1);
    });

    it('identifies at-risk dimensions where confidence is below threshold', async () => {
      // Create a baseline with a very high score dimension that will be at-risk
      const baseline = createAppBaseline({
        dimensions: [
          {
            name: 'easy_dimension',
            score: 2,
            referenceCount: 5,
            confidence: 0.95,
            examplePatterns: ['simple pattern'],
          },
          {
            name: 'hard_dimension',
            score: 10,
            referenceCount: 1,
            confidence: 0.3,
            examplePatterns: ['extremely complex pattern'],
          },
        ],
      });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      // The hard dimension (score 10, low confidence) should be at-risk
      expect(result.plan.atRiskDimensions.length).toBeGreaterThan(0);
      const hardDim = result.plan.dimensionApproaches.find(a => a.dimension === 'hard_dimension');
      expect(hardDim?.atRisk).toBe(true);
      expect(hardDim?.riskReason).toBeDefined();
    });

    it('at-risk dimensions array matches filtered dimensionApproaches', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      const expectedAtRisk = result.plan.dimensionApproaches.filter(a => a.atRisk);
      expect(result.plan.atRiskDimensions).toEqual(expectedAtRisk);
    });

    it('includes proposed approach text for each dimension', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      for (const approach of result.plan.dimensionApproaches) {
        expect(approach.approach).toBeTruthy();
        expect(typeof approach.approach).toBe('string');
        expect(approach.approach.length).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Approval Triggers Autonomous Production — Requirement 34i.53
  // -------------------------------------------------------------------------

  describe('approval triggers autonomous production', () => {
    it('presents plan to King via approval callback', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      await service.generateAndApprovePlan('app', 'wellness apps');

      expect(approvalCallback).toHaveBeenCalledTimes(1);
      expect(approvalCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'app',
          domainCategory: 'wellness apps',
          dimensionApproaches: expect.any(Array),
        }),
      );
    });

    it('returns approved result when King approves', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);
      (approvalCallback as ReturnType<typeof vi.fn>).mockResolvedValue({ approved: true });

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      expect(result.approved).toBe(true);
      expect(result.revisionCount).toBe(0);
      expect(result.plan).toBeDefined();
    });

    it('proceeds without further King involvement after approval', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);
      (approvalCallback as ReturnType<typeof vi.fn>).mockResolvedValue({ approved: true });

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      // Only one call to approval callback — no further involvement
      expect(approvalCallback).toHaveBeenCalledTimes(1);
      expect(result.approved).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Rejection Triggers Plan Revision — Requirement 34i.54
  // -------------------------------------------------------------------------

  describe('rejection triggers plan revision', () => {
    it('revises plan when King rejects with feedback', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      // First call: reject with feedback. Second call: approve.
      (approvalCallback as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ approved: false, feedback: 'Need stronger visual approach' })
        .mockResolvedValueOnce({ approved: true });

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      expect(result.approved).toBe(true);
      expect(result.revisionCount).toBe(1);
      expect(approvalCallback).toHaveBeenCalledTimes(2);
    });

    it('revised plan incorporates King feedback in approaches', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const feedback = 'Focus more on accessibility';
      (approvalCallback as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ approved: false, feedback })
        .mockResolvedValueOnce({ approved: true });

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      // The revised plan should reference the feedback
      const hasRevisedApproach = result.plan.dimensionApproaches.some(a =>
        a.approach.includes(feedback),
      );
      expect(hasRevisedApproach).toBe(true);
    });

    it('supports multiple revision cycles before approval', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      (approvalCallback as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ approved: false, feedback: 'First revision needed' })
        .mockResolvedValueOnce({ approved: false, feedback: 'Second revision needed' })
        .mockResolvedValueOnce({ approved: true });

      const result = await service.generateAndApprovePlan('app', 'wellness apps');

      expect(result.approved).toBe(true);
      expect(result.revisionCount).toBe(2);
      expect(approvalCallback).toHaveBeenCalledTimes(3);
    });

    it('resubmits revised plan to King for approval', async () => {
      const baseline = createAppBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      (approvalCallback as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ approved: false, feedback: 'Revise it' })
        .mockResolvedValueOnce({ approved: true });

      await service.generateAndApprovePlan('app', 'wellness apps');

      // Second call should be with a different (revised) plan
      const firstPlan = (approvalCallback as ReturnType<typeof vi.fn>).mock.calls[0][0] as ProductionPlan;
      const secondPlan = (approvalCallback as ReturnType<typeof vi.fn>).mock.calls[1][0] as ProductionPlan;

      expect(firstPlan.id).not.toBe(secondPlan.id);
      expect(secondPlan.generatedAt.getTime()).toBeGreaterThanOrEqual(firstPlan.generatedAt.getTime());
    });
  });
});
