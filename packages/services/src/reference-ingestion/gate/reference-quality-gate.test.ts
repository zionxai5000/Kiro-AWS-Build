/**
 * Unit tests for Reference Quality Gate.
 *
 * Requirements: 34f.32, 34f.33, 34f.34, 34f.35, 34f.36, 34f.37, 34j.57, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import type { XOAuditService } from '@seraphim/core/interfaces/xo-audit-service.js';
import type { EventBusService } from '@seraphim/core/interfaces/event-bus-service.js';
import type { SeraphimEvent } from '@seraphim/core/types/event.js';

import type { BaselineStorage } from '../baseline/baseline-storage.js';
import type { QualityBaseline, ScoredDimension } from '../baseline/types.js';

import {
  ReferenceQualityGate,
  type ProductionOutput,
  type GateEvaluationResult,
} from './reference-quality-gate.js';

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

function createMockXOAuditService(): XOAuditService {
  return {
    recordAction: vi.fn().mockResolvedValue('audit-id-1'),
    recordGovernanceDecision: vi.fn().mockResolvedValue('audit-id-2'),
    recordStateTransition: vi.fn().mockResolvedValue('audit-id-3'),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true, recordId: 'r1', chainLength: 1 }),
  };
}

function createMockEventBusService(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-1'),
    publishBatch: vi.fn().mockResolvedValue(['event-id-1']),
    subscribe: vi.fn().mockResolvedValue('sub-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createSampleBaseline(overrides: Partial<QualityBaseline> = {}): QualityBaseline {
  return {
    id: 'baseline-1',
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

function createSampleOutput(overrides: Partial<ProductionOutput> = {}): ProductionOutput {
  return {
    id: 'output-1',
    type: 'app',
    name: 'My Wellness App',
    content: {
      screens: ['home', 'profile', 'settings', 'dashboard', 'onboarding'],
      features: ['meditation', 'tracking', 'reminders'],
      design: { colors: ['#4A90D9', '#FFFFFF'], typography: 'Inter' },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReferenceQualityGate', () => {
  let baselineStorage: BaselineStorage;
  let otzarService: OtzarService;
  let xoAuditService: XOAuditService;
  let eventBusService: EventBusService;
  let gate: ReferenceQualityGate;

  beforeEach(() => {
    baselineStorage = createMockBaselineStorage();
    otzarService = createMockOtzarService();
    xoAuditService = createMockXOAuditService();
    eventBusService = createMockEventBusService();
    gate = new ReferenceQualityGate(baselineStorage, otzarService, xoAuditService, eventBusService);
  });

  // -------------------------------------------------------------------------
  // Dimension Scoring
  // -------------------------------------------------------------------------

  describe('evaluation scores output against each baseline dimension', () => {
    it('scores output against every dimension in the baseline', async () => {
      const baseline = createSampleBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const output = createSampleOutput();
      const result = await gate.evaluate(output, 'wellness apps');

      // Should have a score for each dimension
      expect(result.dimensionScores).toHaveLength(baseline.dimensions.length);
      expect(result.dimensionScores.map(s => s.dimension)).toEqual(
        baseline.dimensions.map(d => d.name),
      );
    });

    it('uses Otzar routeTask for LLM evaluation of each dimension', async () => {
      const baseline = createSampleBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const output = createSampleOutput();
      await gate.evaluate(output, 'wellness apps');

      // routeTask should be called for each dimension
      expect(otzarService.routeTask).toHaveBeenCalledTimes(baseline.dimensions.length);
      expect(otzarService.routeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'analysis',
          complexity: 'medium',
          agentId: 'reference-quality-gate',
          pillar: 'quality-gate',
        }),
      );
    });

    it('produces per-dimension scores with achieved and required values', async () => {
      const baseline = createSampleBaseline();
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const output = createSampleOutput();
      const result = await gate.evaluate(output, 'wellness apps');

      for (const score of result.dimensionScores) {
        expect(score).toHaveProperty('dimension');
        expect(score).toHaveProperty('achievedScore');
        expect(score).toHaveProperty('requiredScore');
        expect(score).toHaveProperty('passed');
        expect(score.achievedScore).toBeGreaterThanOrEqual(1);
        expect(score.achievedScore).toBeLessThanOrEqual(10);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Pass/Fail Logic
  // -------------------------------------------------------------------------

  describe('pass requires meeting threshold on every dimension', () => {
    it('passes when all dimensions meet or exceed threshold', async () => {
      // Create a baseline with low thresholds that the output will exceed
      const baseline = createSampleBaseline({
        dimensions: [
          { name: 'visual_polish', score: 1, referenceCount: 3, confidence: 0.9, examplePatterns: ['clean'] },
          { name: 'interaction_complexity', score: 1, referenceCount: 3, confidence: 0.85, examplePatterns: ['smooth'] },
        ],
      });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      const output = createSampleOutput();
      const result = await gate.evaluate(output, 'wellness apps');

      expect(result.passed).toBe(true);
      expect(result.dimensionScores.every(s => s.passed)).toBe(true);
      expect(result.rejectionReport).toBeUndefined();
    });

    it('fails when any single dimension is below threshold', async () => {
      // Use cache to control scores: first dimension passes, second fails
      const baseline = createSampleBaseline({
        dimensions: [
          { name: 'visual_polish', score: 3, referenceCount: 3, confidence: 0.9, examplePatterns: ['clean'] },
          { name: 'content_depth', score: 10, referenceCount: 3, confidence: 0.88, examplePatterns: ['rich media', 'personalized'] },
        ],
      });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      // Use cache to control exact scores
      (otzarService.checkCache as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ hit: true, data: { score: 8 }, cachedAt: new Date(), ttlRemaining: 100 })
        .mockResolvedValueOnce({ hit: true, data: { score: 5, gap: 'Lacks rich media and personalization' }, cachedAt: new Date(), ttlRemaining: 100 });

      const output = createSampleOutput();
      const result = await gate.evaluate(output, 'wellness apps');

      expect(result.passed).toBe(false);
      // visual_polish passes (8 >= 3), content_depth fails (5 < 10)
      expect(result.dimensionScores[0].passed).toBe(true);
      expect(result.dimensionScores[1].passed).toBe(false);
    });

    it('calculates overall score as average of all dimension scores', async () => {
      const baseline = createSampleBaseline({
        dimensions: [
          { name: 'dim_a', score: 3, referenceCount: 2, confidence: 0.9, examplePatterns: [] },
          { name: 'dim_b', score: 3, referenceCount: 2, confidence: 0.9, examplePatterns: [] },
        ],
      });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      // Control scores via cache
      (otzarService.checkCache as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ hit: true, data: { score: 6 }, cachedAt: new Date(), ttlRemaining: 100 })
        .mockResolvedValueOnce({ hit: true, data: { score: 8 }, cachedAt: new Date(), ttlRemaining: 100 });

      const output = createSampleOutput();
      const result = await gate.evaluate(output, 'wellness apps');

      expect(result.overallScore).toBe(7); // (6 + 8) / 2
    });
  });

  // -------------------------------------------------------------------------
  // Rejection Report
  // -------------------------------------------------------------------------

  describe('failure produces rejection report with specific gaps', () => {
    it('includes failed dimensions with achieved scores and required thresholds', async () => {
      const baseline = createSampleBaseline({
        dimensions: [
          { name: 'visual_polish', score: 9, referenceCount: 3, confidence: 0.9, examplePatterns: ['clean layout'] },
          { name: 'content_depth', score: 9, referenceCount: 3, confidence: 0.88, examplePatterns: ['rich media'] },
        ],
      });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      // Both dimensions fail
      (otzarService.checkCache as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ hit: true, data: { score: 4, gap: 'Lacks clean layout patterns' }, cachedAt: new Date(), ttlRemaining: 100 })
        .mockResolvedValueOnce({ hit: true, data: { score: 3, gap: 'Missing rich media content' }, cachedAt: new Date(), ttlRemaining: 100 });

      const output = createSampleOutput();
      const result = await gate.evaluate(output, 'wellness apps');

      expect(result.passed).toBe(false);
      expect(result.rejectionReport).toBeDefined();
      expect(result.rejectionReport!.failedDimensions).toHaveLength(2);

      const failed = result.rejectionReport!.failedDimensions;
      expect(failed[0].dimension).toBe('visual_polish');
      expect(failed[0].achievedScore).toBe(4);
      expect(failed[0].requiredScore).toBe(9);
      expect(failed[0].gap).toBe('Lacks clean layout patterns');

      expect(failed[1].dimension).toBe('content_depth');
      expect(failed[1].achievedScore).toBe(3);
      expect(failed[1].requiredScore).toBe(9);
      expect(failed[1].gap).toBe('Missing rich media content');
    });

    it('includes baseline version and domain category in rejection report', async () => {
      const baseline = createSampleBaseline({ version: 5 });
      // Set high thresholds to ensure failure
      baseline.dimensions = [
        { name: 'visual_polish', score: 10, referenceCount: 3, confidence: 0.9, examplePatterns: ['x'] },
      ];
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      (otzarService.checkCache as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ hit: true, data: { score: 2, gap: 'Low quality' }, cachedAt: new Date(), ttlRemaining: 100 });

      const output = createSampleOutput();
      const result = await gate.evaluate(output, 'wellness apps');

      expect(result.rejectionReport!.baselineVersion).toBe(5);
      expect(result.rejectionReport!.domainCategory).toBe('wellness apps');
    });

    it('includes a summary of gaps in the rejection report', async () => {
      const baseline = createSampleBaseline({
        dimensions: [
          { name: 'visual_polish', score: 10, referenceCount: 3, confidence: 0.9, examplePatterns: ['clean'] },
        ],
      });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      (otzarService.checkCache as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ hit: true, data: { score: 3, gap: 'Poor visual quality' }, cachedAt: new Date(), ttlRemaining: 100 });

      const output = createSampleOutput();
      const result = await gate.evaluate(output, 'wellness apps');

      expect(result.rejectionReport!.summary).toContain('visual_polish');
      expect(result.rejectionReport!.summary).toContain('3');
      expect(result.rejectionReport!.summary).toContain('10');
    });

    it('does not include rejection report when evaluation passes', async () => {
      const baseline = createSampleBaseline({
        dimensions: [
          { name: 'visual_polish', score: 1, referenceCount: 3, confidence: 0.9, examplePatterns: [] },
        ],
      });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      (otzarService.checkCache as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ hit: true, data: { score: 9 }, cachedAt: new Date(), ttlRemaining: 100 });

      const output = createSampleOutput();
      const result = await gate.evaluate(output, 'wellness apps');

      expect(result.passed).toBe(true);
      expect(result.rejectionReport).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Fallback Behavior
  // -------------------------------------------------------------------------

  describe('fallback to existing gate when no baseline exists', () => {
    it('returns pass result with note when no baseline is available', async () => {
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const output = createSampleOutput();
      const result = await gate.evaluate(output, 'unknown category');

      expect(result.passed).toBe(true);
      expect(result.baselineVersion).toBeNull();
      expect(result.dimensionScores).toHaveLength(0);
      expect(result.note).toContain('No baseline available');
    });

    it('does not call Otzar for LLM evaluation when no baseline exists', async () => {
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const output = createSampleOutput();
      await gate.evaluate(output, 'unknown category');

      expect(otzarService.routeTask).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // XO Audit Logging
  // -------------------------------------------------------------------------

  describe('evaluation results logged to XO Audit', () => {
    it('logs successful evaluation to XO Audit', async () => {
      const baseline = createSampleBaseline({
        dimensions: [
          { name: 'visual_polish', score: 1, referenceCount: 3, confidence: 0.9, examplePatterns: [] },
        ],
      });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      (otzarService.checkCache as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ hit: true, data: { score: 9 }, cachedAt: new Date(), ttlRemaining: 100 });

      const output = createSampleOutput();
      await gate.evaluate(output, 'wellness apps');

      expect(xoAuditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'seraphim',
          actingAgentId: 'reference-quality-gate',
          actingAgentName: 'Reference Quality Gate',
          actionType: 'quality-gate-evaluation',
          target: 'output-1',
          outcome: 'success',
          details: expect.objectContaining({
            outputId: 'output-1',
            domainCategory: 'wellness apps',
            baselineVersion: 2,
            passed: true,
            dimensionScores: expect.any(Array),
          }),
        }),
      );
    });

    it('logs failed evaluation to XO Audit with failure outcome', async () => {
      const baseline = createSampleBaseline({
        dimensions: [
          { name: 'visual_polish', score: 10, referenceCount: 3, confidence: 0.9, examplePatterns: ['x'] },
        ],
      });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      (otzarService.checkCache as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ hit: true, data: { score: 3, gap: 'Low quality' }, cachedAt: new Date(), ttlRemaining: 100 });

      const output = createSampleOutput();
      await gate.evaluate(output, 'wellness apps');

      expect(xoAuditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'failure',
          details: expect.objectContaining({
            passed: false,
          }),
        }),
      );
    });

    it('logs fallback evaluation to XO Audit', async () => {
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const output = createSampleOutput();
      await gate.evaluate(output, 'unknown category');

      expect(xoAuditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'success',
          details: expect.objectContaining({
            outputId: 'output-1',
            domainCategory: 'unknown category',
            baselineVersion: null,
            passed: true,
            note: expect.stringContaining('No baseline available'),
          }),
        }),
      );
    });

    it('includes per-dimension scores in audit details', async () => {
      const baseline = createSampleBaseline({
        dimensions: [
          { name: 'visual_polish', score: 5, referenceCount: 3, confidence: 0.9, examplePatterns: [] },
          { name: 'content_depth', score: 5, referenceCount: 3, confidence: 0.88, examplePatterns: [] },
        ],
      });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      (otzarService.checkCache as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ hit: true, data: { score: 7 }, cachedAt: new Date(), ttlRemaining: 100 })
        .mockResolvedValueOnce({ hit: true, data: { score: 8 }, cachedAt: new Date(), ttlRemaining: 100 });

      const output = createSampleOutput();
      await gate.evaluate(output, 'wellness apps');

      const auditCall = (xoAuditService.recordAction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(auditCall.details.dimensionScores).toHaveLength(2);
      expect(auditCall.details.dimensionScores[0]).toEqual(
        expect.objectContaining({
          dimension: 'visual_polish',
          achieved: 7,
          required: 5,
          passed: true,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Baseline Reload on Event
  // -------------------------------------------------------------------------

  describe('baseline reload on baseline.updated event', () => {
    it('subscribes to baseline.updated events on initialize', async () => {
      await gate.initialize();

      expect(eventBusService.subscribe).toHaveBeenCalledWith(
        { type: ['baseline.updated'] },
        expect.any(Function),
      );
    });

    it('reloads baseline from storage when baseline.updated event fires', async () => {
      await gate.initialize();

      // Get the event handler that was registered
      const subscribeCall = (eventBusService.subscribe as ReturnType<typeof vi.fn>).mock.calls[0];
      const handler = subscribeCall[1] as (event: SeraphimEvent) => Promise<void>;

      // Set up a baseline that will be returned on reload
      const updatedBaseline = createSampleBaseline({ version: 3 });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(updatedBaseline);

      // Fire the event
      const event: SeraphimEvent = {
        id: 'evt-1',
        source: 'seraphim.baseline-storage',
        type: 'baseline.updated',
        version: '1.0',
        time: new Date().toISOString(),
        tenantId: 'seraphim',
        correlationId: 'corr-1',
        detail: { domainCategory: 'wellness apps', version: 3 },
        metadata: { schemaVersion: '1.0', producerVersion: '1.0' },
      };

      await handler(event);

      // Now evaluate — should use the reloaded baseline
      (otzarService.checkCache as ReturnType<typeof vi.fn>)
        .mockResolvedValue({ hit: true, data: { score: 9 }, cachedAt: new Date(), ttlRemaining: 100 });

      const output = createSampleOutput();
      const result = await gate.evaluate(output, 'wellness apps');

      expect(result.baselineVersion).toBe(3);
    });

    it('invalidates cache for the affected domain category on event', async () => {
      await gate.initialize();

      // Pre-populate cache by evaluating
      const baseline = createSampleBaseline({ version: 1 });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(baseline);

      (otzarService.checkCache as ReturnType<typeof vi.fn>)
        .mockResolvedValue({ hit: true, data: { score: 9 }, cachedAt: new Date(), ttlRemaining: 100 });

      const output = createSampleOutput();
      await gate.evaluate(output, 'wellness apps');

      // queryByCategory called once for initial load
      expect(baselineStorage.queryByCategory).toHaveBeenCalledTimes(1);

      // Fire baseline.updated event
      const handler = (eventBusService.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const updatedBaseline = createSampleBaseline({ version: 2 });
      (baselineStorage.queryByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(updatedBaseline);

      await handler({
        id: 'evt-2',
        source: 'seraphim.baseline-storage',
        type: 'baseline.updated',
        version: '1.0',
        time: new Date().toISOString(),
        tenantId: 'seraphim',
        correlationId: 'corr-2',
        detail: { domainCategory: 'wellness apps', version: 2 },
        metadata: { schemaVersion: '1.0', producerVersion: '1.0' },
      });

      // queryByCategory called again for reload
      expect(baselineStorage.queryByCategory).toHaveBeenCalledTimes(2);
    });

    it('unsubscribes from events on dispose', async () => {
      await gate.initialize();
      await gate.dispose();

      expect(eventBusService.unsubscribe).toHaveBeenCalledWith('sub-1');
    });
  });
});
