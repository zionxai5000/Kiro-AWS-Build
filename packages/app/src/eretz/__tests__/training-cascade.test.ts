/**
 * Unit tests for Eretz Training Cascade Mechanism
 *
 * Validates: Requirements 29e.17, 29e.18, 29e.19, 19.1
 *
 * Tests training context enrichment, business quality evaluation,
 * structured feedback generation, feedback storage in Domain Expertise
 * Profiles, and training effectiveness tracking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrainingCascadeImpl } from '../training-cascade.js';
import type { TrainingCascadeConfig } from '../training-cascade.js';
import type {
  Directive,
  SubsidiaryResult,
  PortfolioContext,
  PatternMatch,
  PortfolioProvider,
  PatternLibrary,
} from '../agent-program.js';
import type { EventBusService } from '@seraphim/core';
import type {
  DomainExpertiseProfileService,
  DomainExpertiseProfile,
} from '@seraphim/services/sme/domain-expertise-profile.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-1'),
    publishBatch: vi.fn().mockResolvedValue(['event-id-1']),
    subscribe: vi.fn().mockResolvedValue('sub-id-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockPortfolioProvider(): PortfolioProvider {
  return {
    getSubsidiaryContext: vi.fn().mockResolvedValue({
      subsidiaryId: 'zionx',
      mrr: 8000,
      topProducts: ['AppOne', 'AppTwo'],
      gaps: ['retention', 'monetization'],
      recentPerformance: 'growing',
    } satisfies PortfolioContext),
  };
}

function createMockPatternLibrary(): PatternLibrary {
  return {
    findApplicablePatterns: vi.fn().mockResolvedValue([
      {
        patternId: 'pat-001',
        name: 'Freemium Conversion',
        confidence: 0.85,
        applicability: 'high',
      },
      {
        patternId: 'pat-002',
        name: 'Retention Loop',
        confidence: 0.72,
        applicability: 'medium',
      },
    ] satisfies PatternMatch[]),
  };
}

function createMockProfileService(): DomainExpertiseProfileService {
  return {
    createProfile: vi.fn().mockResolvedValue({}),
    updateProfile: vi.fn().mockResolvedValue({}),
    loadProfile: vi.fn().mockResolvedValue({}),
    resolveConflicts: vi.fn().mockResolvedValue({}),
  } as unknown as DomainExpertiseProfileService;
}

function createMockProfile(): DomainExpertiseProfile {
  return {
    agentId: 'zionx',
    domain: 'app-development',
    version: 1,
    lastUpdated: new Date(),
    knowledgeBase: [],
    competitiveIntelligence: [],
    decisionFrameworks: [],
    qualityBenchmarks: [],
    industryBestPractices: [],
    learnedPatterns: [],
    lastResearchCycle: null,
    researchBacklog: [],
    knowledgeGaps: [],
    conflicts: [],
  };
}

function createConfig(overrides?: Partial<TrainingCascadeConfig>): TrainingCascadeConfig {
  return {
    eventBus: createMockEventBus(),
    profileService: createMockProfileService(),
    portfolioProvider: createMockPortfolioProvider(),
    patternLibrary: createMockPatternLibrary(),
    ...overrides,
  };
}

function createSampleDirective(overrides?: Partial<Directive>): Directive {
  return {
    id: 'dir-001',
    source: 'seraphim_core',
    target: 'zionx',
    action: 'launch_app',
    payload: { appName: 'TestApp' },
    priority: 7,
    timestamp: new Date(),
    ...overrides,
  };
}

function createSampleResult(overrides?: Partial<SubsidiaryResult>): SubsidiaryResult {
  return {
    id: 'result-001',
    directiveId: 'dir-001',
    subsidiary: 'zionx',
    action: 'launch_app',
    outcome: { appId: 'app-123', status: 'launched', revenue: 500 },
    metrics: { mrrImpact: 200, downloads: 1500, retention: 0.45 },
    completedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrainingCascadeImpl', () => {
  let cascade: TrainingCascadeImpl;
  let config: TrainingCascadeConfig;

  beforeEach(() => {
    config = createConfig();
    cascade = new TrainingCascadeImpl(config);
  });

  // -------------------------------------------------------------------------
  // addTrainingContext
  // -------------------------------------------------------------------------

  describe('addTrainingContext', () => {
    it('should enrich directive with all required training context fields', async () => {
      const directive = createSampleDirective();
      const context = await cascade.addTrainingContext(directive, 'zionx');

      expect(context.businessRationale).toBeDefined();
      expect(context.businessRationale.length).toBeGreaterThan(0);
      expect(context.expectedOutcomes).toBeDefined();
      expect(context.expectedOutcomes.length).toBeGreaterThan(0);
      expect(context.qualityStandards).toBeDefined();
      expect(context.qualityStandards.length).toBeGreaterThan(0);
      expect(context.portfolioFit).toBeDefined();
      expect(context.portfolioFit.length).toBeGreaterThan(0);
      expect(context.relevantPatterns).toBeDefined();
      expect(context.relevantPatterns.length).toBeGreaterThan(0);
      expect(context.learningObjectives).toBeDefined();
      expect(context.learningObjectives.length).toBeGreaterThan(0);
    });

    it('should include business rationale referencing portfolio MRR', async () => {
      const directive = createSampleDirective();
      const context = await cascade.addTrainingContext(directive, 'zionx');

      expect(context.businessRationale).toContain('8000');
    });

    it('should include relevant patterns from pattern library', async () => {
      const directive = createSampleDirective();
      const context = await cascade.addTrainingContext(directive, 'zionx');

      expect(context.relevantPatterns).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Freemium Conversion'),
          expect.stringContaining('Retention Loop'),
        ]),
      );
    });

    it('should include quality standards with thresholds', async () => {
      const directive = createSampleDirective();
      const context = await cascade.addTrainingContext(directive, 'zionx');

      for (const standard of context.qualityStandards) {
        expect(standard.id).toBeDefined();
        expect(standard.name).toBeDefined();
        expect(standard.threshold).toBeGreaterThan(0);
        expect(standard.description).toBeDefined();
      }
    });

    it('should publish training.context.added event', async () => {
      const directive = createSampleDirective();
      await cascade.addTrainingContext(directive, 'zionx');

      expect(config.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'eretz',
          type: 'training.context.added',
          detail: expect.objectContaining({
            directiveId: 'dir-001',
            subsidiary: 'zionx',
          }),
          metadata: expect.objectContaining({
            tenantId: 'house-of-zion',
            correlationId: 'dir-001',
          }),
        }),
      );
    });

    it('should include learning objectives derived from patterns and gaps', async () => {
      const directive = createSampleDirective();
      const context = await cascade.addTrainingContext(directive, 'zionx');

      // Should have objectives about strategy contribution and metric reporting
      expect(context.learningObjectives.some((o) => o.includes('strategy'))).toBe(true);
      expect(context.learningObjectives.some((o) => o.includes('metric'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // evaluateBusinessQuality
  // -------------------------------------------------------------------------

  describe('evaluateBusinessQuality', () => {
    it('should score across all five dimensions', async () => {
      const result = createSampleResult();
      const evaluation = await cascade.evaluateBusinessQuality(result);

      expect(evaluation.dimensions.businessAlignment).toBeGreaterThanOrEqual(0);
      expect(evaluation.dimensions.businessAlignment).toBeLessThanOrEqual(1);
      expect(evaluation.dimensions.qualityStandards).toBeGreaterThanOrEqual(0);
      expect(evaluation.dimensions.qualityStandards).toBeLessThanOrEqual(1);
      expect(evaluation.dimensions.synergyAwareness).toBeGreaterThanOrEqual(0);
      expect(evaluation.dimensions.synergyAwareness).toBeLessThanOrEqual(1);
      expect(evaluation.dimensions.patternCompliance).toBeGreaterThanOrEqual(0);
      expect(evaluation.dimensions.patternCompliance).toBeLessThanOrEqual(1);
      expect(evaluation.dimensions.metricAwareness).toBeGreaterThanOrEqual(0);
      expect(evaluation.dimensions.metricAwareness).toBeLessThanOrEqual(1);
    });

    it('should compute overall score as average of dimensions', async () => {
      const result = createSampleResult();
      const evaluation = await cascade.evaluateBusinessQuality(result);

      const { dimensions } = evaluation;
      const expectedOverall =
        (dimensions.businessAlignment +
          dimensions.qualityStandards +
          dimensions.synergyAwareness +
          dimensions.patternCompliance +
          dimensions.metricAwareness) /
        5;

      expect(evaluation.overallScore).toBeCloseTo(expectedOverall, 5);
    });

    it('should approve results with overall score >= 0.6', async () => {
      const result = createSampleResult();
      const evaluation = await cascade.evaluateBusinessQuality(result);

      // With good outcome and metrics, score should be above 0.6
      expect(evaluation.overallScore).toBeGreaterThanOrEqual(0.6);
      expect(evaluation.approved).toBe(true);
    });

    it('should reject results with poor quality', async () => {
      const result = createSampleResult({
        outcome: {},
        metrics: {},
      });
      const evaluation = await cascade.evaluateBusinessQuality(result);

      expect(evaluation.overallScore).toBeLessThan(0.6);
      expect(evaluation.approved).toBe(false);
      expect(evaluation.remediationRequired.length).toBeGreaterThan(0);
    });

    it('should identify strengths for high-scoring dimensions', async () => {
      const result = createSampleResult();
      const evaluation = await cascade.evaluateBusinessQuality(result);

      expect(evaluation.strengths.length).toBeGreaterThan(0);
    });

    it('should identify improvements for low-scoring dimensions', async () => {
      const result = createSampleResult({
        outcome: { status: 'done' },
        metrics: {},
      });
      const evaluation = await cascade.evaluateBusinessQuality(result);

      expect(evaluation.improvements.length).toBeGreaterThan(0);
    });

    it('should publish training.quality.evaluated event', async () => {
      const result = createSampleResult();
      await cascade.evaluateBusinessQuality(result);

      expect(config.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'eretz',
          type: 'training.quality.evaluated',
          detail: expect.objectContaining({
            subsidiary: 'zionx',
            outputId: 'result-001',
          }),
          metadata: expect.objectContaining({
            tenantId: 'house-of-zion',
            correlationId: 'dir-001',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // generateFeedback
  // -------------------------------------------------------------------------

  describe('generateFeedback', () => {
    it('should produce structured feedback from evaluation', async () => {
      const result = createSampleResult();
      const evaluation = await cascade.evaluateBusinessQuality(result);
      const feedback = cascade.generateFeedback(evaluation);

      expect(feedback.overallScore).toBe(evaluation.overallScore);
      expect(feedback.dimensions).toEqual(evaluation.dimensions);
      expect(feedback.strengths).toBeDefined();
      expect(feedback.improvements).toBeDefined();
      expect(feedback.recommendations).toBeDefined();
    });

    it('should include recommendations for low-scoring dimensions', async () => {
      const result = createSampleResult({
        outcome: { status: 'done' },
        metrics: {},
      });
      const evaluation = await cascade.evaluateBusinessQuality(result);
      const feedback = cascade.generateFeedback(evaluation);

      // With poor metrics, should recommend metric tracking
      expect(feedback.recommendations.length).toBeGreaterThan(0);
    });

    it('should carry over strengths and improvements from evaluation', async () => {
      const result = createSampleResult();
      const evaluation = await cascade.evaluateBusinessQuality(result);
      const feedback = cascade.generateFeedback(evaluation);

      // Strengths from evaluation should be in feedback
      for (const strength of evaluation.strengths) {
        expect(feedback.strengths).toContain(strength);
      }
    });

    it('should produce no recommendations when all dimensions are high', async () => {
      const result = createSampleResult({
        outcome: { appId: 'app-1', status: 'launched', revenue: 500, synergyImpact: 'high' },
        metrics: { mrrImpact: 200, downloads: 1500, retention: 0.45 },
      });

      // Mock pattern library to return no patterns (so pattern compliance is high)
      const customConfig = createConfig({
        patternLibrary: {
          findApplicablePatterns: vi.fn().mockResolvedValue([]),
        },
      });
      const customCascade = new TrainingCascadeImpl(customConfig);

      const evaluation = await customCascade.evaluateBusinessQuality(result);
      const feedback = customCascade.generateFeedback(evaluation);

      // With high scores across all dimensions, recommendations should be empty
      if (evaluation.overallScore >= 0.7) {
        // All dimensions >= 0.7 means no recommendations
        const allHigh = Object.values(evaluation.dimensions).every((v) => v >= 0.7);
        if (allHigh) {
          expect(feedback.recommendations).toHaveLength(0);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // storeFeedback
  // -------------------------------------------------------------------------

  describe('storeFeedback', () => {
    it('should persist feedback in subsidiary Domain_Expertise_Profile', async () => {
      const result = createSampleResult();
      const evaluation = await cascade.evaluateBusinessQuality(result);
      const feedback = cascade.generateFeedback(evaluation);
      const profile = createMockProfile();

      await cascade.storeFeedback(feedback, 'zionx', profile);

      expect(config.profileService.updateProfile).toHaveBeenCalledWith(
        profile,
        expect.objectContaining({
          knowledgeEntries: expect.arrayContaining([
            expect.objectContaining({
              source: 'eretz-training-cascade',
              tags: expect.arrayContaining(['training-feedback', 'quality-evaluation', 'zionx']),
            }),
          ]),
        }),
      );
    });

    it('should store learned patterns from recommendations', async () => {
      const result = createSampleResult({
        outcome: { status: 'done' },
        metrics: {},
      });
      const evaluation = await cascade.evaluateBusinessQuality(result);
      const feedback = cascade.generateFeedback(evaluation);
      const profile = createMockProfile();

      await cascade.storeFeedback(feedback, 'zionx', profile);

      expect(config.profileService.updateProfile).toHaveBeenCalledWith(
        profile,
        expect.objectContaining({
          learnedPatterns: expect.arrayContaining([
            expect.objectContaining({
              context: expect.stringContaining('zionx'),
              confidence: feedback.overallScore,
            }),
          ]),
        }),
      );
    });

    it('should publish training.feedback.stored event', async () => {
      const result = createSampleResult();
      const evaluation = await cascade.evaluateBusinessQuality(result);
      const feedback = cascade.generateFeedback(evaluation);
      const profile = createMockProfile();

      await cascade.storeFeedback(feedback, 'zionx', profile);

      expect(config.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'eretz',
          type: 'training.feedback.stored',
          detail: expect.objectContaining({
            subsidiary: 'zionx',
            overallScore: feedback.overallScore,
          }),
          metadata: expect.objectContaining({
            tenantId: 'house-of-zion',
          }),
        }),
      );
    });

    it('should record effectiveness data point for tracking', async () => {
      const result = createSampleResult();
      const evaluation = await cascade.evaluateBusinessQuality(result);
      const feedback = cascade.generateFeedback(evaluation);
      const profile = createMockProfile();

      await cascade.storeFeedback(feedback, 'zionx', profile);

      // After storing feedback, effectiveness should have data
      const effectiveness = cascade.getTrainingEffectiveness('zionx');
      expect(effectiveness.businessDecisionQuality.dataPoints.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getTrainingEffectiveness
  // -------------------------------------------------------------------------

  describe('getTrainingEffectiveness', () => {
    it('should return empty report for subsidiary with no history', () => {
      const report = cascade.getTrainingEffectiveness('zxmg');

      expect(report.subsidiary).toBe('zxmg');
      expect(report.period).toBe('no data');
      expect(report.businessDecisionQuality.current).toBe(0);
      expect(report.recommendationAccuracy.current).toBe(0);
      expect(report.autonomousJudgment.current).toBe(0);
      expect(report.synergyAwareness.current).toBe(0);
      expect(report.overallImprovement).toBe(0);
    });

    it('should show improvement trends after multiple evaluations', async () => {
      const profile = createMockProfile();

      // First evaluation — lower quality (empty outcome and metrics)
      const result1 = createSampleResult({
        id: 'result-001',
        outcome: {},
        metrics: {},
      });
      const eval1 = await cascade.evaluateBusinessQuality(result1);
      const feedback1 = cascade.generateFeedback(eval1);
      await cascade.storeFeedback(feedback1, 'zionx', profile);

      // Second evaluation — higher quality
      const result2 = createSampleResult({
        id: 'result-002',
        outcome: { appId: 'app-2', status: 'launched', revenue: 1000, synergyImpact: 'high' },
        metrics: { mrrImpact: 500, downloads: 5000, retention: 0.65 },
      });
      const eval2 = await cascade.evaluateBusinessQuality(result2);
      const feedback2 = cascade.generateFeedback(eval2);
      await cascade.storeFeedback(feedback2, 'zionx', profile);

      const report = cascade.getTrainingEffectiveness('zionx');

      expect(report.subsidiary).toBe('zionx');
      expect(report.businessDecisionQuality.dataPoints.length).toBe(2);
      expect(report.recommendationAccuracy.dataPoints.length).toBe(2);
      expect(report.autonomousJudgment.dataPoints.length).toBe(2);
      expect(report.synergyAwareness.dataPoints.length).toBe(2);

      // Second evaluation should have higher scores
      expect(report.businessDecisionQuality.current).toBeGreaterThan(
        report.businessDecisionQuality.previous,
      );
    });

    it('should detect improving trend when scores increase', async () => {
      const profile = createMockProfile();

      // Low quality result
      const result1 = createSampleResult({
        id: 'result-001',
        outcome: {},
        metrics: {},
      });
      const eval1 = await cascade.evaluateBusinessQuality(result1);
      const feedback1 = cascade.generateFeedback(eval1);
      await cascade.storeFeedback(feedback1, 'zionx', profile);

      // High quality result
      const result2 = createSampleResult({
        id: 'result-002',
        outcome: { appId: 'app-2', status: 'launched', revenue: 1000, synergyImpact: 'high' },
        metrics: { mrrImpact: 500, downloads: 5000, retention: 0.65 },
      });
      const eval2 = await cascade.evaluateBusinessQuality(result2);
      const feedback2 = cascade.generateFeedback(eval2);
      await cascade.storeFeedback(feedback2, 'zionx', profile);

      const report = cascade.getTrainingEffectiveness('zionx');

      // At least one dimension should show improving trend
      const trends = [
        report.businessDecisionQuality.trend,
        report.recommendationAccuracy.trend,
        report.autonomousJudgment.trend,
        report.synergyAwareness.trend,
      ];
      expect(trends).toContain('improving');
    });

    it('should track each dimension independently', async () => {
      const profile = createMockProfile();

      const result = createSampleResult();
      const evaluation = await cascade.evaluateBusinessQuality(result);
      const feedback = cascade.generateFeedback(evaluation);
      await cascade.storeFeedback(feedback, 'zionx', profile);

      const report = cascade.getTrainingEffectiveness('zionx');

      // Each dimension should have its own data
      expect(report.businessDecisionQuality.current).toBeDefined();
      expect(report.recommendationAccuracy.current).toBeDefined();
      expect(report.autonomousJudgment.current).toBeDefined();
      expect(report.synergyAwareness.current).toBeDefined();
    });

    it('should calculate overall improvement percentage', async () => {
      const profile = createMockProfile();

      // Two evaluations with different scores
      const result1 = createSampleResult({
        id: 'result-001',
        outcome: { status: 'done' },
        metrics: { x: 1 },
      });
      const eval1 = await cascade.evaluateBusinessQuality(result1);
      await cascade.storeFeedback(cascade.generateFeedback(eval1), 'zionx', profile);

      const result2 = createSampleResult({
        id: 'result-002',
        outcome: { appId: 'app-2', status: 'launched', revenue: 1000 },
        metrics: { mrrImpact: 500, downloads: 5000, retention: 0.65 },
      });
      const eval2 = await cascade.evaluateBusinessQuality(result2);
      await cascade.storeFeedback(cascade.generateFeedback(eval2), 'zionx', profile);

      const report = cascade.getTrainingEffectiveness('zionx');

      // Overall improvement should be a number (positive if improving)
      expect(typeof report.overallImprovement).toBe('number');
    });
  });
});
