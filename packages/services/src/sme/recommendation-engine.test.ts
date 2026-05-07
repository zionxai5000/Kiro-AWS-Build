/**
 * Unit tests for the Recommendation Engine and Queue.
 *
 * Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7,
 *            26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 19.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecommendationEngineImpl } from './recommendation-engine.js';
import type {
  RecommendationEngineConfig,
  ExecutionTask,
} from './recommendation-engine.js';
import type { Recommendation } from './heartbeat-scheduler.js';
import type { EventBusService, ZikaronService, OtzarService } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-test-001';

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-001'),
    publishBatch: vi.fn().mockResolvedValue(['event-id-001']),
    subscribe: vi.fn().mockResolvedValue('sub-id-001'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('entry-id-001'),
    storeSemantic: vi.fn().mockResolvedValue('entry-id-002'),
    storeProcedural: vi.fn().mockResolvedValue('entry-id-003'),
    storeWorking: vi.fn().mockResolvedValue('entry-id-004'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({
      agentId: 'test',
      workingMemory: null,
      recentEpisodic: [],
      proceduralPatterns: [],
    }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockOtzar(): OtzarService {
  return {
    routeTask: vi.fn().mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-3-haiku',
      estimatedCost: 0.01,
      rationale: 'test',
    }),
    checkBudget: vi.fn().mockResolvedValue({
      allowed: true,
      remainingDaily: 500,
      remainingMonthly: 5000,
    }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getCostReport: vi.fn().mockResolvedValue({
      totalCostUsd: 0,
      byAgent: {},
      byPillar: {},
      byModel: {},
      period: { start: new Date(), end: new Date() },
    }),
    getDailyOptimizationReport: vi.fn().mockResolvedValue({
      date: new Date(),
      totalSpend: 0,
      wastePatterns: [],
      savingsOpportunities: [],
      estimatedSavings: 0,
    }),
    checkCache: vi.fn().mockResolvedValue(null),
    storeCache: vi.fn().mockResolvedValue(undefined),
  };
}

function createValidRecommendation(overrides?: Partial<Recommendation>): Recommendation {
  return {
    id: 'rec-001',
    agentId: 'agent-zionx',
    domain: 'app-development',
    priority: 7,
    submittedAt: new Date(),
    worldClassBenchmark: {
      description: 'Top apps achieve 45% Day-1 retention',
      source: 'industry-benchmark-2024',
      metrics: { 'Day-1 Retention': { value: 0.45, unit: 'percentage' } },
    },
    currentState: {
      description: 'Current Day-1 retention is 25%',
      metrics: { 'Day-1 Retention': { value: 0.25, unit: 'percentage' } },
    },
    gapAnalysis: {
      description: '44% gap in Day-1 Retention',
      gapPercentage: 44.44,
      keyGaps: ['Onboarding flow needs optimization'],
    },
    actionPlan: {
      summary: 'Optimize onboarding to improve Day-1 retention from 25% to 45%',
      steps: [
        {
          order: 1,
          description: 'Research best onboarding patterns',
          type: 'research',
          estimatedDuration: '1 day',
          dependencies: [],
        },
        {
          order: 2,
          description: 'Implement 3-screen onboarding',
          type: 'code_change',
          estimatedDuration: '3 days',
          dependencies: [1],
        },
      ],
      estimatedEffort: '1 week',
      estimatedImpact: {
        'Day-1 Retention': { value: 0.36, unit: 'percentage', context: '80% of world-class' },
      },
      requiresCodeChanges: true,
      requiresBudget: 0,
    },
    riskAssessment: {
      level: 'medium',
      risks: ['May not achieve full improvement in first iteration'],
      mitigations: ['Iterative approach with measurement'],
    },
    rollbackPlan: 'Revert onboarding changes if retention drops below 25%',
    status: 'pending',
    ...overrides,
  };
}

function createEngine(overrides?: Partial<RecommendationEngineConfig>): {
  engine: RecommendationEngineImpl;
  eventBus: EventBusService;
  zikaron: ZikaronService;
  otzar: OtzarService;
} {
  const eventBus = createMockEventBus();
  const zikaron = createMockZikaron();
  const otzar = createMockOtzar();

  const config: RecommendationEngineConfig = {
    tenantId: TENANT_ID,
    eventBus: overrides?.eventBus ?? eventBus,
    zikaron: overrides?.zikaron ?? zikaron,
    otzar: overrides?.otzar ?? otzar,
    escalationThresholdMs: overrides?.escalationThresholdMs ?? 48 * 60 * 60 * 1000,
    budgetApprovalThreshold: overrides?.budgetApprovalThreshold ?? 100,
  };

  const engine = new RecommendationEngineImpl(config);
  return { engine, eventBus: config.eventBus, zikaron: config.zikaron, otzar: config.otzar };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecommendationEngine', () => {
  // -------------------------------------------------------------------------
  // Submission Validation (Requirements 22.2, 26.1)
  // -------------------------------------------------------------------------

  describe('submit()', () => {
    it('validates and accepts a recommendation with all required fields', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation();

      const id = await engine.submit(rec);

      expect(id).toBeTruthy();
    });

    it('publishes recommendation.submitted event on successful submission', async () => {
      const { engine, eventBus } = createEngine();
      const rec = createValidRecommendation();

      const id = await engine.submit(rec);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.recommendation-engine',
          type: 'recommendation.submitted',
          detail: expect.objectContaining({
            recommendationId: id,
            agentId: 'agent-zionx',
            domain: 'app-development',
            priority: 7,
          }),
        }),
      );
    });

    it('rejects recommendation missing worldClassBenchmark', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation({
        worldClassBenchmark: undefined as any,
      });

      await expect(engine.submit(rec)).rejects.toThrow('worldClassBenchmark');
    });

    it('rejects recommendation missing gapAnalysis', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation({
        gapAnalysis: undefined as any,
      });

      await expect(engine.submit(rec)).rejects.toThrow('gapAnalysis');
    });

    it('rejects recommendation missing currentState', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation({
        currentState: undefined as any,
      });

      await expect(engine.submit(rec)).rejects.toThrow('currentState');
    });

    it('rejects recommendation missing actionPlan', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation({
        actionPlan: undefined as any,
      });

      await expect(engine.submit(rec)).rejects.toThrow('actionPlan');
    });

    it('rejects recommendation missing riskAssessment', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation({
        riskAssessment: undefined as any,
      });

      await expect(engine.submit(rec)).rejects.toThrow('riskAssessment');
    });

    it('rejects recommendation missing rollbackPlan', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation({
        rollbackPlan: '',
      });

      await expect(engine.submit(rec)).rejects.toThrow('rollbackPlan');
    });

    it('rejects recommendation with invalid priority', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation({ priority: 11 });

      await expect(engine.submit(rec)).rejects.toThrow('priority');
    });
  });

  // -------------------------------------------------------------------------
  // Approval (Requirements 22.4, 26.3)
  // -------------------------------------------------------------------------

  describe('approve()', () => {
    it('creates execution task and dispatches to agent', async () => {
      const { engine, eventBus } = createEngine();
      const rec = createValidRecommendation();
      const id = await engine.submit(rec);

      const task = await engine.approve(id);

      expect(task.id).toBeTruthy();
      expect(task.recommendationId).toBe(id);
      expect(task.agentId).toBe('agent-zionx');
      expect(task.status).toBe('pending');
      expect(task.progress).toBe(0);
      expect(task.startedAt).toBeInstanceOf(Date);
    });

    it('publishes recommendation.approved event', async () => {
      const { engine, eventBus } = createEngine();
      const rec = createValidRecommendation();
      const id = await engine.submit(rec);

      await engine.approve(id);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recommendation.approved',
          detail: expect.objectContaining({
            recommendationId: id,
            agentId: 'agent-zionx',
            executionTaskId: expect.any(String),
          }),
        }),
      );
    });

    it('throws when approving non-existent recommendation', async () => {
      const { engine } = createEngine();

      await expect(engine.approve('non-existent')).rejects.toThrow('not found');
    });

    it('throws when approving already approved recommendation', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation();
      const id = await engine.submit(rec);
      await engine.approve(id);

      await expect(engine.approve(id)).rejects.toThrow('Cannot approve');
    });
  });

  // -------------------------------------------------------------------------
  // Rejection (Requirements 22.5, 26.2)
  // -------------------------------------------------------------------------

  describe('reject()', () => {
    it('records rejection reason in Zikaron', async () => {
      const { engine, zikaron } = createEngine();
      const rec = createValidRecommendation();
      const id = await engine.submit(rec);

      await engine.reject(id, 'Not aligned with current strategy');

      expect(zikaron.storeEpisodic).toHaveBeenCalledWith(
        expect.objectContaining({
          layer: 'episodic',
          content: expect.stringContaining('Not aligned with current strategy'),
          sourceAgentId: 'agent-zionx',
          eventType: 'recommendation.rejected',
          tags: expect.arrayContaining(['recommendation', 'rejected']),
        }),
      );
    });

    it('publishes recommendation.rejected event', async () => {
      const { engine, eventBus } = createEngine();
      const rec = createValidRecommendation();
      const id = await engine.submit(rec);

      await engine.reject(id, 'Too risky');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recommendation.rejected',
          detail: expect.objectContaining({
            recommendationId: id,
            reason: 'Too risky',
          }),
        }),
      );
    });

    it('throws when rejecting non-existent recommendation', async () => {
      const { engine } = createEngine();

      await expect(engine.reject('non-existent', 'reason')).rejects.toThrow('not found');
    });
  });

  // -------------------------------------------------------------------------
  // Batch Operations (Requirement 26.2)
  // -------------------------------------------------------------------------

  describe('batchApprove() and batchReject()', () => {
    it('batch approves multiple recommendations', async () => {
      const { engine } = createEngine();
      const rec1 = createValidRecommendation({ id: 'rec-batch-1' });
      const rec2 = createValidRecommendation({ id: 'rec-batch-2' });
      const rec3 = createValidRecommendation({ id: 'rec-batch-3' });

      const id1 = await engine.submit(rec1);
      const id2 = await engine.submit(rec2);
      const id3 = await engine.submit(rec3);

      const tasks = await engine.batchApprove([id1, id2, id3]);

      expect(tasks).toHaveLength(3);
      for (const task of tasks) {
        expect(task.status).toBe('pending');
        expect(task.agentId).toBe('agent-zionx');
      }
    });

    it('batch rejects multiple recommendations', async () => {
      const { engine, zikaron } = createEngine();
      const rec1 = createValidRecommendation({ id: 'rec-rej-1' });
      const rec2 = createValidRecommendation({ id: 'rec-rej-2' });

      const id1 = await engine.submit(rec1);
      const id2 = await engine.submit(rec2);

      await engine.batchReject([id1, id2], 'Budget constraints');

      // Both should have been stored in Zikaron
      expect(zikaron.storeEpisodic).toHaveBeenCalledTimes(2);

      // Both should now be rejected
      const pending = await engine.getPending();
      expect(pending).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Impact Measurement (Requirements 26.5, 22.7)
  // -------------------------------------------------------------------------

  describe('measureImpact()', () => {
    it('calculates variance correctly between estimated and actual impact', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation();
      const id = await engine.submit(rec);
      await engine.approve(id);

      // Estimated: Day-1 Retention = 0.36
      // Actual: Day-1 Retention = 0.40
      const measurement = await engine.measureImpact(id, {
        'Day-1 Retention': 0.40,
      });

      expect(measurement.recommendationId).toBe(id);
      expect(measurement.estimatedImpact['Day-1 Retention']).toBe(0.36);
      expect(measurement.actualImpact['Day-1 Retention']).toBe(0.40);
      // Variance: (0.40 - 0.36) / 0.36 ≈ 0.111
      expect(measurement.variance['Day-1 Retention']).toBeCloseTo(0.111, 2);
      expect(measurement.measuredAt).toBeInstanceOf(Date);
    });

    it('stores impact measurement in Zikaron for calibration', async () => {
      const { engine, zikaron } = createEngine();
      const rec = createValidRecommendation();
      const id = await engine.submit(rec);
      await engine.approve(id);

      await engine.measureImpact(id, { 'Day-1 Retention': 0.40 });

      expect(zikaron.storeSemantic).toHaveBeenCalledWith(
        expect.objectContaining({
          layer: 'semantic',
          content: expect.stringContaining('Impact measurement'),
          tags: expect.arrayContaining(['impact-measurement', 'calibration']),
          entityType: 'impact_measurement',
        }),
      );
    });

    it('handles negative variance (underperformance)', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation();
      const id = await engine.submit(rec);
      await engine.approve(id);

      // Actual is worse than estimated
      const measurement = await engine.measureImpact(id, {
        'Day-1 Retention': 0.20,
      });

      // Variance: (0.20 - 0.36) / 0.36 ≈ -0.444
      expect(measurement.variance['Day-1 Retention']).toBeCloseTo(-0.444, 2);
    });
  });

  // -------------------------------------------------------------------------
  // Calibration Report (Requirement 22.7)
  // -------------------------------------------------------------------------

  describe('getCalibrationReport()', () => {
    it('tracks accuracy trends over time', async () => {
      const { engine } = createEngine();

      // Submit and approve several recommendations
      for (let i = 0; i < 6; i++) {
        const rec = createValidRecommendation({ id: `rec-cal-${i}` });
        const id = await engine.submit(rec);
        await engine.approve(id);
        // Measure with decreasing variance (improving accuracy)
        const variance = 0.5 - i * 0.08;
        await engine.measureImpact(id, {
          'Day-1 Retention': 0.36 + 0.36 * variance,
        });
      }

      const report = await engine.getCalibrationReport('agent-zionx');

      expect(report.agentId).toBe('agent-zionx');
      expect(report.totalRecommendations).toBe(6);
      expect(report.approvalRate).toBeGreaterThan(0);
      expect(report.trend).toBe('improving');
    });

    it('reports approval and rejection rates', async () => {
      const { engine } = createEngine();

      // 3 approved, 2 rejected
      const rec1 = createValidRecommendation({ id: 'rec-rate-1' });
      const rec2 = createValidRecommendation({ id: 'rec-rate-2' });
      const rec3 = createValidRecommendation({ id: 'rec-rate-3' });
      const rec4 = createValidRecommendation({ id: 'rec-rate-4' });
      const rec5 = createValidRecommendation({ id: 'rec-rate-5' });

      const id1 = await engine.submit(rec1);
      const id2 = await engine.submit(rec2);
      const id3 = await engine.submit(rec3);
      const id4 = await engine.submit(rec4);
      const id5 = await engine.submit(rec5);

      await engine.approve(id1);
      await engine.approve(id2);
      await engine.approve(id3);
      await engine.reject(id4, 'Not aligned');
      await engine.reject(id5, 'Too expensive');

      const report = await engine.getCalibrationReport('agent-zionx');

      expect(report.approvalRate).toBeCloseTo(0.6, 1);
      expect(report.rejectionRate).toBeCloseTo(0.4, 1);
    });

    it('reports common rejection reasons', async () => {
      const { engine } = createEngine();

      const rec1 = createValidRecommendation({ id: 'rec-rej-r1' });
      const rec2 = createValidRecommendation({ id: 'rec-rej-r2' });
      const rec3 = createValidRecommendation({ id: 'rec-rej-r3' });

      const id1 = await engine.submit(rec1);
      const id2 = await engine.submit(rec2);
      const id3 = await engine.submit(rec3);

      await engine.reject(id1, 'Too expensive');
      await engine.reject(id2, 'Too expensive');
      await engine.reject(id3, 'Not aligned');

      const report = await engine.getCalibrationReport('agent-zionx');

      expect(report.commonRejectionReasons[0].reason).toBe('Too expensive');
      expect(report.commonRejectionReasons[0].count).toBe(2);
      expect(report.commonRejectionReasons[1].reason).toBe('Not aligned');
      expect(report.commonRejectionReasons[1].count).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Escalation (Requirement 22.6)
  // -------------------------------------------------------------------------

  describe('checkEscalations()', () => {
    it('triggers escalation after configurable timeout', async () => {
      const { engine, eventBus } = createEngine({
        escalationThresholdMs: 1000, // 1 second for testing
      });

      const rec = createValidRecommendation({
        id: 'rec-escalate-1',
        submittedAt: new Date(Date.now() - 2000), // 2 seconds ago
      });
      await engine.submit(rec);

      const escalated = await engine.checkEscalations();

      expect(escalated).toHaveLength(1);
      expect(escalated[0].id).toBe('rec-escalate-1');
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recommendation.escalated',
          detail: expect.objectContaining({
            recommendationId: 'rec-escalate-1',
            pendingHours: expect.any(Number),
          }),
        }),
      );
    });

    it('does not escalate recommendations within threshold', async () => {
      const { engine } = createEngine({
        escalationThresholdMs: 48 * 60 * 60 * 1000, // 48 hours
      });

      const rec = createValidRecommendation({
        id: 'rec-no-escalate',
        submittedAt: new Date(), // just now
      });
      await engine.submit(rec);

      const escalated = await engine.checkEscalations();

      expect(escalated).toHaveLength(0);
    });

    it('does not escalate already approved/rejected recommendations', async () => {
      const { engine } = createEngine({
        escalationThresholdMs: 1000,
      });

      const rec = createValidRecommendation({
        id: 'rec-approved-old',
        submittedAt: new Date(Date.now() - 2000),
      });
      const id = await engine.submit(rec);
      await engine.approve(id);

      const escalated = await engine.checkEscalations();

      expect(escalated).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Budget Threshold (Requirement 26.7)
  // -------------------------------------------------------------------------

  describe('budget threshold enforcement', () => {
    it('requires Otzar approval for recommendations above budget threshold', async () => {
      const otzar = createMockOtzar();
      vi.mocked(otzar.checkBudget).mockResolvedValue({
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 0,
        reason: 'Budget exceeded',
      });

      const { engine } = createEngine({ otzar, budgetApprovalThreshold: 50 });
      const rec = createValidRecommendation();
      rec.actionPlan.requiresBudget = 200; // Above threshold

      await expect(engine.submit(rec)).rejects.toThrow('Budget threshold exceeded');
      expect(otzar.checkBudget).toHaveBeenCalled();
    });

    it('allows recommendations below budget threshold without Otzar check', async () => {
      const otzar = createMockOtzar();
      const { engine } = createEngine({ otzar, budgetApprovalThreshold: 100 });
      const rec = createValidRecommendation();
      rec.actionPlan.requiresBudget = 50; // Below threshold

      const id = await engine.submit(rec);

      expect(id).toBeTruthy();
      expect(otzar.checkBudget).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Summary with Path-to-World-Class (Requirement 26.6)
  // -------------------------------------------------------------------------

  describe('getSummary()', () => {
    it('includes path-to-world-class data per domain', async () => {
      const { engine } = createEngine();

      // Submit recommendations across domains
      const appRec1 = createValidRecommendation({ id: 'app-1', domain: 'app-development' });
      const appRec2 = createValidRecommendation({ id: 'app-2', domain: 'app-development' });
      const mediaRec = createValidRecommendation({ id: 'media-1', domain: 'media-production' });

      const id1 = await engine.submit(appRec1);
      const id2 = await engine.submit(appRec2);
      await engine.submit(mediaRec);

      // Approve and complete one
      await engine.approve(id1);
      await engine.measureImpact(id1, { 'Day-1 Retention': 0.40 });

      const summary = await engine.getSummary();

      expect(summary.totalPending).toBe(2); // app-2 and media-1
      expect(summary.totalCompleted).toBe(1); // app-1

      const appDomain = summary.byDomain.find((d) => d.domain === 'app-development');
      expect(appDomain).toBeDefined();
      expect(appDomain!.pathToWorldClass).toBeDefined();
      expect(appDomain!.pathToWorldClass.gapsClosed).toBe(1);
      expect(appDomain!.pathToWorldClass.gapsRemaining).toBeGreaterThanOrEqual(1);
      expect(appDomain!.pathToWorldClass.overallProgress).toBeGreaterThan(0);

      const mediaDomain = summary.byDomain.find((d) => d.domain === 'media-production');
      expect(mediaDomain).toBeDefined();
      expect(mediaDomain!.pending).toBe(1);
      expect(mediaDomain!.pathToWorldClass.topPriorityGaps.length).toBeGreaterThan(0);
    });

    it('groups recommendations by domain with correct counts', async () => {
      const { engine } = createEngine();

      await engine.submit(createValidRecommendation({ id: 'r1', domain: 'app-development' }));
      await engine.submit(createValidRecommendation({ id: 'r2', domain: 'app-development' }));
      await engine.submit(createValidRecommendation({ id: 'r3', domain: 'media-production' }));

      const summary = await engine.getSummary();

      expect(summary.byDomain).toHaveLength(2);
      const appDomain = summary.byDomain.find((d) => d.domain === 'app-development');
      expect(appDomain!.pending).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Execution Status (Requirement 26.4)
  // -------------------------------------------------------------------------

  describe('getExecutionStatus()', () => {
    it('returns execution task for approved recommendation', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation();
      const id = await engine.submit(rec);
      await engine.approve(id);

      const status = await engine.getExecutionStatus(id);

      expect(status).not.toBeNull();
      expect(status!.recommendationId).toBe(id);
      expect(status!.status).toBe('pending');
    });

    it('returns null for recommendation without execution task', async () => {
      const { engine } = createEngine();
      const rec = createValidRecommendation();
      const id = await engine.submit(rec);

      const status = await engine.getExecutionStatus(id);

      expect(status).toBeNull();
    });
  });
});
