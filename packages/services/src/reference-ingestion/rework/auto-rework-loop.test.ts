/**
 * Unit tests for Auto-Rework Loop.
 *
 * Requirements: 34g.38, 34g.39, 34g.40, 34g.41, 34g.42, 34g.43, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

import type { ReferenceQualityGate } from '../gate/reference-quality-gate.js';
import type {
  ProductionOutput,
  RejectionReport,
  DimensionScore,
  GateEvaluationResult,
} from '../gate/reference-quality-gate.js';

import {
  AutoReworkLoop,
  type TrainingCascade,
  type ReworkDirective,
  type EscalationRequest,
  type EscalationCallback,
} from './auto-rework-loop.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockOutput(overrides: Partial<ProductionOutput> = {}): ProductionOutput {
  return {
    id: 'output-1',
    type: 'app',
    name: 'Test App',
    content: { screens: 5, features: ['auth', 'dashboard'] },
    ...overrides,
  };
}

function createDimensionScore(overrides: Partial<DimensionScore> = {}): DimensionScore {
  return {
    dimension: 'visual_polish',
    achievedScore: 4,
    requiredScore: 7,
    passed: false,
    gap: 'Output scores 4/10 on visual_polish, below required 7/10. Missing patterns: clean layout, consistent spacing, modern typography',
    ...overrides,
  };
}

function createRejectionReport(overrides: Partial<RejectionReport> = {}): RejectionReport {
  const failedDimensions = overrides.failedDimensions ?? [
    createDimensionScore(),
    createDimensionScore({
      dimension: 'interaction_complexity',
      achievedScore: 3,
      requiredScore: 6,
      gap: 'Output scores 3/10 on interaction_complexity, below required 6/10. Missing patterns: gesture support, animations',
    }),
  ];

  const passingDimension = createDimensionScore({
    dimension: 'content_depth',
    achievedScore: 8,
    requiredScore: 7,
    passed: true,
    gap: undefined,
  });

  return {
    failedDimensions,
    allScores: [...failedDimensions, passingDimension],
    baselineVersion: 3,
    domainCategory: 'wellness-apps',
    summary: 'Quality gate failed on 2 dimension(s)',
    ...overrides,
  };
}

function createPassingResult(baselineVersion: number = 3): GateEvaluationResult {
  return {
    passed: true,
    dimensionScores: [
      createDimensionScore({ achievedScore: 8, requiredScore: 7, passed: true, gap: undefined }),
      createDimensionScore({
        dimension: 'interaction_complexity',
        achievedScore: 7,
        requiredScore: 6,
        passed: true,
        gap: undefined,
      }),
    ],
    overallScore: 7.5,
    baselineVersion,
  };
}

function createFailingResult(
  baselineVersion: number = 3,
  overallScore: number = 4.5,
): GateEvaluationResult {
  const failedDimensions = [
    createDimensionScore({ achievedScore: Math.round(overallScore) }),
  ];
  return {
    passed: false,
    dimensionScores: [
      ...failedDimensions,
      createDimensionScore({
        dimension: 'content_depth',
        achievedScore: 8,
        requiredScore: 7,
        passed: true,
        gap: undefined,
      }),
    ],
    overallScore,
    baselineVersion,
    rejectionReport: createRejectionReport({
      failedDimensions,
      baselineVersion,
    }),
  };
}

function createMockQualityGate(): ReferenceQualityGate {
  return {
    evaluate: vi.fn().mockResolvedValue(createPassingResult()),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReferenceQualityGate;
}

function createMockTrainingCascade(): TrainingCascade {
  return {
    rework: vi.fn().mockImplementation((directive: ReworkDirective) =>
      Promise.resolve({
        reworkedOutput: {
          ...directive.output,
          id: directive.output.id,
          content: { ...directive.output.content, reworked: true },
        },
      }),
    ),
  };
}

function createMockZikaronService(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('mem-1'),
    storeSemantic: vi.fn().mockResolvedValue('mem-2'),
    storeProcedural: vi.fn().mockResolvedValue('mem-3'),
    storeWorking: vi.fn().mockResolvedValue('mem-4'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({ agentId: 'test', workingMemory: null, recentEpisodic: [], proceduralPatterns: [] }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutoReworkLoop', () => {
  let qualityGate: ReferenceQualityGate;
  let trainingCascade: TrainingCascade;
  let zikaronService: ZikaronService;
  let onEscalation: EscalationCallback;
  let escalationRequests: EscalationRequest[];
  let loop: AutoReworkLoop;

  beforeEach(() => {
    qualityGate = createMockQualityGate();
    trainingCascade = createMockTrainingCascade();
    zikaronService = createMockZikaronService();
    escalationRequests = [];
    onEscalation = vi.fn().mockImplementation(async (req: EscalationRequest) => {
      escalationRequests.push(req);
    });
    loop = new AutoReworkLoop(qualityGate, trainingCascade, zikaronService, onEscalation);
  });

  // -------------------------------------------------------------------------
  // Rejection routes output to Training Cascade with remediation guidance
  // -------------------------------------------------------------------------

  describe('rejection routes output to Training Cascade with remediation guidance', () => {
    it('calls Training Cascade rework with the rejected output', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      await loop.handleRejection(output, rejection);

      expect(trainingCascade.rework).toHaveBeenCalled();
      const directive = (trainingCascade.rework as ReturnType<typeof vi.fn>).mock.calls[0][0] as ReworkDirective;
      expect(directive.output).toEqual(output);
    });

    it('includes the rejection report in the rework directive', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      await loop.handleRejection(output, rejection);

      const directive = (trainingCascade.rework as ReturnType<typeof vi.fn>).mock.calls[0][0] as ReworkDirective;
      expect(directive.rejectionReport).toEqual(rejection);
    });
  });

  // -------------------------------------------------------------------------
  // Rework directive includes failed dimensions, gaps, and example patterns
  // -------------------------------------------------------------------------

  describe('rework directive includes failed dimensions, gaps, and example patterns', () => {
    it('includes failed dimensions from the rejection report', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      await loop.handleRejection(output, rejection);

      const directive = (trainingCascade.rework as ReturnType<typeof vi.fn>).mock.calls[0][0] as ReworkDirective;
      expect(directive.failedDimensions).toEqual(rejection.failedDimensions);
      expect(directive.failedDimensions.length).toBe(2);
    });

    it('includes gaps with achieved vs required scores', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      await loop.handleRejection(output, rejection);

      const directive = (trainingCascade.rework as ReturnType<typeof vi.fn>).mock.calls[0][0] as ReworkDirective;
      expect(directive.gaps).toHaveLength(2);
      expect(directive.gaps[0]).toEqual({
        dimension: 'visual_polish',
        achieved: 4,
        required: 7,
        gap: expect.stringContaining('4/10'),
      });
      expect(directive.gaps[1]).toEqual({
        dimension: 'interaction_complexity',
        achieved: 3,
        required: 6,
        gap: expect.stringContaining('3/10'),
      });
    });

    it('includes example patterns extracted from gap descriptions', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      await loop.handleRejection(output, rejection);

      const directive = (trainingCascade.rework as ReturnType<typeof vi.fn>).mock.calls[0][0] as ReworkDirective;
      expect(directive.examplePatterns).toHaveLength(2);
      expect(directive.examplePatterns[0].dimension).toBe('visual_polish');
      expect(directive.examplePatterns[0].patterns).toContain('clean layout');
      expect(directive.examplePatterns[0].patterns).toContain('consistent spacing');
      expect(directive.examplePatterns[0].patterns).toContain('modern typography');
    });
  });

  // -------------------------------------------------------------------------
  // Re-evaluation uses same baseline version as original rejection
  // -------------------------------------------------------------------------

  describe('re-evaluation uses same baseline version as original rejection', () => {
    it('evaluates reworked output against the same domain category', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport({ domainCategory: 'wellness-apps', baselineVersion: 3 });

      await loop.handleRejection(output, rejection);

      expect(qualityGate.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({ id: output.id }),
        'wellness-apps',
      );
    });

    it('uses the domain category from the original rejection for all re-evaluations', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport({ domainCategory: 'fitness-apps', baselineVersion: 5 });

      // Make first attempt fail, second pass
      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createFailingResult(5))
        .mockResolvedValueOnce(createPassingResult(5));

      await loop.handleRejection(output, rejection);

      // Both evaluations should use the same domain category
      const calls = (qualityGate.evaluate as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][1]).toBe('fitness-apps');
      expect(calls[1][1]).toBe('fitness-apps');
    });
  });

  // -------------------------------------------------------------------------
  // Iteration tracking (count, time, score progression)
  // -------------------------------------------------------------------------

  describe('iteration tracking (count, time, score progression)', () => {
    it('tracks iteration count across attempts', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      // Fail twice, then pass
      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createFailingResult(3, 5.0))
        .mockResolvedValueOnce(createFailingResult(3, 5.5))
        .mockResolvedValueOnce(createPassingResult(3));

      await loop.handleRejection(output, rejection);

      // Training cascade should have been called 3 times
      expect(trainingCascade.rework).toHaveBeenCalledTimes(3);

      // Verify iteration counts in directives
      const calls = (trainingCascade.rework as ReturnType<typeof vi.fn>).mock.calls;
      expect((calls[0][0] as ReworkDirective).iterationCount).toBe(1);
      expect((calls[1][0] as ReworkDirective).iterationCount).toBe(2);
      expect((calls[2][0] as ReworkDirective).iterationCount).toBe(3);
    });

    it('records score progression for each attempt', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      // Fail once, then pass
      const failResult = createFailingResult(3, 5.5);
      const passResult = createPassingResult(3);

      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(failResult)
        .mockResolvedValueOnce(passResult);

      await loop.handleRejection(output, rejection);

      // Verify the procedural entry stored in Zikaron includes progression
      expect(zikaronService.storeProcedural).toHaveBeenCalled();
      const storedEntry = (zikaronService.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Steps should include initial + 2 iterations
      expect(storedEntry.steps.length).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Escalation triggers after 5 failed attempts with correct summary
  // -------------------------------------------------------------------------

  describe('escalation triggers after 5 failed attempts with correct summary', () => {
    it('escalates to King after 5 failed rework attempts', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      // All 5 attempts fail
      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createFailingResult(3, 4.5));

      await loop.handleRejection(output, rejection);

      expect(onEscalation).toHaveBeenCalledTimes(1);
      expect(trainingCascade.rework).toHaveBeenCalledTimes(5);
    });

    it('escalation includes attempt count', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createFailingResult(3, 4.5));

      await loop.handleRejection(output, rejection);

      const request = escalationRequests[0];
      expect(request.attemptCount).toBe(5);
    });

    it('escalation includes score progression across all attempts', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createFailingResult(3, 4.5));

      await loop.handleRejection(output, rejection);

      const request = escalationRequests[0];
      // Initial + 5 attempts = 6 entries
      expect(request.scoreProgression.length).toBe(6);
    });

    it('escalation includes persistent gaps with best achieved scores', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createFailingResult(3, 4.5));

      await loop.handleRejection(output, rejection);

      const request = escalationRequests[0];
      expect(request.persistentGaps.length).toBeGreaterThan(0);
      for (const gap of request.persistentGaps) {
        expect(gap).toHaveProperty('dimension');
        expect(gap).toHaveProperty('bestAchieved');
        expect(gap).toHaveProperty('required');
      }
    });

    it('escalation includes a recommendation', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createFailingResult(3, 4.5));

      await loop.handleRejection(output, rejection);

      const request = escalationRequests[0];
      expect(['lower_threshold', 'provide_additional_references', 'accept_current_quality']).toContain(
        request.recommendation,
      );
    });

    it('escalation includes a human-readable summary', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createFailingResult(3, 4.5));

      await loop.handleRejection(output, rejection);

      const request = escalationRequests[0];
      expect(request.summary).toContain('5 attempts');
      expect(request.summary).toContain('Persistent gaps');
    });

    it('does not escalate if rework succeeds before 5 attempts', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      // Fail 3 times, then pass
      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createFailingResult(3, 4.5))
        .mockResolvedValueOnce(createFailingResult(3, 5.0))
        .mockResolvedValueOnce(createFailingResult(3, 5.5))
        .mockResolvedValueOnce(createPassingResult(3));

      await loop.handleRejection(output, rejection);

      expect(onEscalation).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Successful rework pattern stored in Zikaron procedural memory
  // -------------------------------------------------------------------------

  describe('successful rework pattern stored in Zikaron procedural memory', () => {
    it('stores procedural entry on successful rework', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      await loop.handleRejection(output, rejection);

      expect(zikaronService.storeProcedural).toHaveBeenCalledTimes(1);
    });

    it('procedural entry includes rework workflow pattern', async () => {
      const output = createMockOutput({ type: 'app' });
      const rejection = createRejectionReport({ domainCategory: 'wellness-apps' });

      await loop.handleRejection(output, rejection);

      const entry = (zikaronService.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(entry.workflowPattern).toBe('rework-app-wellness-apps');
    });

    it('procedural entry includes relevant tags', async () => {
      const output = createMockOutput({ type: 'video' });
      const rejection = createRejectionReport({ domainCategory: 'tech-reviews' });

      await loop.handleRejection(output, rejection);

      const entry = (zikaronService.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(entry.tags).toContain('rework');
      expect(entry.tags).toContain('quality-gate');
      expect(entry.tags).toContain('video');
      expect(entry.tags).toContain('tech-reviews');
    });

    it('procedural entry includes steps reflecting score progression', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      // Fail once, then pass
      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(createFailingResult(3, 5.5))
        .mockResolvedValueOnce(createPassingResult(3));

      await loop.handleRejection(output, rejection);

      const entry = (zikaronService.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(entry.steps.length).toBe(3); // initial + 2 iterations
      expect(entry.steps[entry.steps.length - 1].action).toBe('successful_rework');
    });

    it('does not store procedural entry when escalation occurs', async () => {
      const output = createMockOutput();
      const rejection = createRejectionReport();

      (qualityGate.evaluate as ReturnType<typeof vi.fn>)
        .mockResolvedValue(createFailingResult(3, 4.5));

      await loop.handleRejection(output, rejection);

      expect(zikaronService.storeProcedural).not.toHaveBeenCalled();
    });
  });
});
