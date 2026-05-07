/**
 * Unit tests for the SME Lambda Event Handler (createSMEHandler)
 * and HeartbeatRuntimeIntegration.
 *
 * Validates: Requirements 21.1, 21.7, 22.3, 24.5, 25.1
 *
 * - 21.1: Scheduled heartbeat review per sub-agent
 * - 21.7: Heartbeat lifecycle events published to Event Bus
 * - 22.3: Recommendation approval/rejection workflow
 * - 24.5: Industry Scanner feeds into heartbeat research
 * - 25.1: Weekly self-improvement assessment trigger
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSMEHandler,
  SMEEventHandler,
  HeartbeatRuntimeIntegration,
} from '../sme-handler.js';
import type {
  SMEHandlerConfig,
  SMEEvent,
  SQSEvent,
} from '../sme-handler.js';
import type { EventBusService, ZikaronService } from '@seraphim/core';
import type { HeartbeatScheduler } from '../../sme/heartbeat-scheduler.js';
import type { RecommendationEngine } from '../../sme/recommendation-engine.js';
import type { IndustryScanner } from '../../sme/industry-scanner.js';
import type { SelfImprovementEngine } from '../../sme/self-improvement-engine.js';
import type { KiroIntegrationService } from '../../kiro/integration-service.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-1'),
    publishBatch: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue('sub-id-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('episodic-id-1'),
    storeSemantic: vi.fn().mockResolvedValue('semantic-id-1'),
    storeProcedural: vi.fn().mockResolvedValue('procedural-id-1'),
    storeWorking: vi.fn().mockResolvedValue('working-id-1'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({
      agentId: 'test-agent',
      workingMemory: null,
      recentEpisodic: [],
      proceduralPatterns: [],
    }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockHeartbeatScheduler(): HeartbeatScheduler {
  return {
    configure: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockResolvedValue({
      agentId: 'agent-zionx',
      intervalMs: 86400000,
      researchDepth: 'standard',
      maxResearchBudgetUsd: 1.5,
      enabled: true,
      researchSources: [],
    }),
    triggerReview: vi.fn().mockResolvedValue({
      id: 'review-001',
      agentId: 'agent-zionx',
      domain: 'app-development',
      timestamp: new Date(),
      durationMs: 5000,
      costUsd: 0.5,
      currentStateAssessment: {
        domain: 'app-development',
        metrics: {},
        strengths: [],
        weaknesses: [],
        overallScore: 0.7,
      },
      worldClassBenchmarks: [],
      gapAnalysis: [],
      recommendations: [{ id: 'rec-1' }, { id: 'rec-2' }],
      researchSourcesUsed: [],
      confidenceScore: 0.85,
    }),
    getLastReview: vi.fn().mockResolvedValue(null),
    getReviewHistory: vi.fn().mockResolvedValue([]),
  } as unknown as HeartbeatScheduler;
}

function createMockRecommendationEngine(): RecommendationEngine {
  return {
    submit: vi.fn().mockResolvedValue('rec-id-1'),
    getPending: vi.fn().mockResolvedValue([]),
    getByDomain: vi.fn().mockResolvedValue([]),
    getSummary: vi.fn().mockResolvedValue({
      totalPending: 0,
      totalApproved: 0,
      totalRejected: 0,
      totalExecuting: 0,
      totalCompleted: 0,
      totalFailed: 0,
      byDomain: [],
    }),
    approve: vi.fn().mockResolvedValue({
      id: 'task-001',
      recommendationId: 'rec-001',
      agentId: 'agent-zionx',
      status: 'pending',
      progress: 0,
      startedAt: new Date(),
    }),
    reject: vi.fn().mockResolvedValue(undefined),
    batchApprove: vi.fn().mockResolvedValue([]),
    batchReject: vi.fn().mockResolvedValue(undefined),
    getExecutionStatus: vi.fn().mockResolvedValue(null),
    measureImpact: vi.fn().mockResolvedValue({
      recommendationId: 'rec-001',
      estimatedImpact: {},
      actualImpact: {},
      variance: {},
      measuredAt: new Date(),
    }),
    getCalibrationReport: vi.fn().mockResolvedValue({
      agentId: 'agent-zionx',
      totalRecommendations: 0,
      approvalRate: 0,
      rejectionRate: 0,
      impactAccuracy: 0,
      commonRejectionReasons: [],
      averageVariance: 0,
      trend: 'stable',
    }),
    checkEscalations: vi.fn().mockResolvedValue([]),
  } as unknown as RecommendationEngine;
}

function createMockIndustryScanner(): IndustryScanner {
  return {
    configureSources: vi.fn().mockResolvedValue(undefined),
    getSources: vi.fn().mockResolvedValue([]),
    executeScan: vi.fn().mockResolvedValue({
      id: 'scan-001',
      timestamp: new Date(),
      sourcesScanned: 5,
      discoveries: [{ id: 'disc-1' }, { id: 'disc-2' }],
      assessments: [{ id: 'assess-1' }],
      errors: [],
    }),
    getLastScan: vi.fn().mockResolvedValue(null),
    assessTechnology: vi.fn().mockResolvedValue({
      id: 'assess-001',
      technology: { id: 'tech-1', name: 'Test Tech' },
      relevanceScore: 0.9,
      relevantDomains: ['app-development'],
      adoptionComplexity: 'medium',
      estimatedBenefit: 'High',
      competitiveAdvantage: 'Significant',
      recommendedTimeline: '3_months',
      assessedAt: new Date(),
    }),
    getAssessments: vi.fn().mockResolvedValue([]),
    getRoadmap: vi.fn().mockResolvedValue({
      lastUpdated: new Date(),
      availableNow: [],
      threeMonths: [],
      sixMonths: [],
      twelveMonths: [],
      monitoring: [],
    }),
    updateRoadmap: vi.fn().mockResolvedValue({
      lastUpdated: new Date(),
      availableNow: [],
      threeMonths: [],
      sixMonths: [],
      twelveMonths: [],
      monitoring: [],
    }),
  } as unknown as IndustryScanner;
}

function createMockSelfImprovementEngine(): SelfImprovementEngine {
  return {
    executeSelfAssessment: vi.fn().mockResolvedValue({
      id: 'assessment-001',
      timestamp: new Date(),
      systemMetrics: {
        avgResponseTimeMs: 150,
        errorRate: 0.02,
        resourceUtilization: 0.65,
        costEfficiency: 0.8,
      },
      agentEffectiveness: {},
      architecturalAssessment: {
        bottlenecks: [],
        scalingConcerns: [],
        capabilityGaps: [],
        securityPosture: 0.9,
      },
      industryComparison: {
        aheadOf: [],
        behindOn: [],
        opportunities: [],
      },
    }),
    getCapabilityMaturityScore: vi.fn().mockResolvedValue({
      overall: 0.6,
      byDomain: {},
      byCapability: {},
      targetVision: 'World-class AI orchestration',
      estimatedTimeToTarget: '12 months',
    }),
    getCapabilityGapAnalysis: vi.fn().mockResolvedValue([]),
    generateProposals: vi.fn().mockResolvedValue([
      { id: 'proposal-1', title: 'Improve latency' },
      { id: 'proposal-2', title: 'Reduce error rate' },
    ]),
    getProposalHistory: vi.fn().mockResolvedValue([]),
    implementProposal: vi.fn().mockResolvedValue({
      proposalId: 'proposal-1',
      success: true,
      changesApplied: [],
      timestamp: new Date(),
    }),
    verifyImplementation: vi.fn().mockResolvedValue({
      proposalId: 'proposal-1',
      passed: true,
      criteriaResults: [],
      timestamp: new Date(),
    }),
    rollbackImplementation: vi.fn().mockResolvedValue({
      proposalId: 'proposal-1',
      success: true,
      stepsExecuted: 2,
      timestamp: new Date(),
    }),
    getImprovementMetrics: vi.fn().mockResolvedValue({
      proposalsGenerated: 0,
      proposalsApproved: 0,
      proposalsImplemented: 0,
      proposalsFailed: 0,
      cumulativePerformanceImprovement: 0,
      costSavingsAchieved: 0,
      capabilityMaturityTrend: [],
    }),
  } as unknown as SelfImprovementEngine;
}

function createMockKiroIntegration(): KiroIntegrationService {
  return {
    generateSteeringFile: vi.fn().mockResolvedValue({
      path: '.kiro/steering/app-development-expertise.md',
      content: '# Test',
      lastUpdated: new Date(),
      sourceAgentId: 'agent-zionx',
      version: '1.0',
    }),
    generateMasterSteering: vi.fn().mockResolvedValue({
      path: '.kiro/steering/seraphimos-master.md',
      content: '# Master',
      lastUpdated: new Date(),
      sourceAgentId: 'seraphim-core',
      version: '1.0',
    }),
    updateSteeringFromExpertise: vi.fn().mockResolvedValue(undefined),
    updateSteeringFromIndustryScan: vi.fn().mockResolvedValue(undefined),
    generateSkillDefinition: vi.fn().mockResolvedValue({
      name: 'app-development-sme',
      description: 'Test skill',
      expertise: [],
      activationTriggers: [],
      content: '',
    }),
    generateHookDefinitions: vi.fn().mockResolvedValue([]),
    convertRecommendationToKiroTask: vi.fn().mockResolvedValue({
      title: 'Test Task',
      description: 'Test',
      acceptanceCriteria: [],
      implementationGuidance: '',
      verificationSteps: [],
      researchReferences: [],
      priority: 5,
    }),
  } as unknown as KiroIntegrationService;
}

function makeSQSEvent(records: Array<{ messageId: string; body: string }>): SQSEvent {
  return {
    Records: records.map((r) => ({
      messageId: r.messageId,
      body: r.body,
    })),
  };
}

function makeSMEEvent(overrides: Partial<SMEEvent> = {}): SMEEvent {
  return {
    id: 'sme-evt-001',
    type: 'sme.heartbeat.completed',
    data: { agentId: 'agent-zionx', reviewId: 'review-001' },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: SMEEventHandler
// ---------------------------------------------------------------------------

describe('SMEEventHandler', () => {
  let eventBus: EventBusService;
  let zikaron: ZikaronService;
  let heartbeatScheduler: HeartbeatScheduler;
  let recommendationEngine: RecommendationEngine;
  let industryScanner: IndustryScanner;
  let selfImprovementEngine: SelfImprovementEngine;
  let kiroIntegration: KiroIntegrationService;
  let config: SMEHandlerConfig;

  beforeEach(() => {
    eventBus = createMockEventBus();
    zikaron = createMockZikaron();
    heartbeatScheduler = createMockHeartbeatScheduler();
    recommendationEngine = createMockRecommendationEngine();
    industryScanner = createMockIndustryScanner();
    selfImprovementEngine = createMockSelfImprovementEngine();
    kiroIntegration = createMockKiroIntegration();
    config = {
      eventBus,
      zikaron,
      heartbeatScheduler,
      recommendationEngine,
      industryScanner,
      selfImprovementEngine,
      kiroIntegration,
      processedEventIds: new Set<string>(),
    };
  });

  // -----------------------------------------------------------------------
  // Heartbeat Started
  // -----------------------------------------------------------------------

  describe('sme.heartbeat.started', () => {
    it('should publish acknowledged event to Event Bus', async () => {
      const handler = new SMEEventHandler(config);
      const event = makeSMEEvent({
        type: 'sme.heartbeat.started',
        data: { agentId: 'agent-zionx' },
      });

      await handler.handle(event);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.sme-handler',
          type: 'sme.heartbeat.acknowledged',
          detail: expect.objectContaining({ agentId: 'agent-zionx' }),
          metadata: expect.objectContaining({
            tenantId: 'system',
            correlationId: event.id,
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Heartbeat Completed
  // -----------------------------------------------------------------------

  describe('sme.heartbeat.completed', () => {
    it('should trigger Kiro steering file regeneration', async () => {
      const handler = new SMEEventHandler(config);
      const event = makeSMEEvent({
        type: 'sme.heartbeat.completed',
        data: { agentId: 'agent-zionx', reviewId: 'review-001' },
      });

      await handler.handle(event);

      expect(kiroIntegration.updateSteeringFromExpertise).toHaveBeenCalledWith('agent-zionx');
    });

    it('should publish dashboard update event for Shaar', async () => {
      const handler = new SMEEventHandler(config);
      const event = makeSMEEvent({
        type: 'sme.heartbeat.completed',
        data: { agentId: 'agent-zionx', reviewId: 'review-001', recommendationCount: 3 },
      });

      await handler.handle(event);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.sme-handler',
          type: 'dashboard.sme.heartbeat_completed',
          detail: expect.objectContaining({
            agentId: 'agent-zionx',
            reviewId: 'review-001',
            recommendations: 3,
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Heartbeat Failed
  // -----------------------------------------------------------------------

  describe('sme.heartbeat.failed', () => {
    it('should publish alert event with high severity', async () => {
      const handler = new SMEEventHandler(config);
      const event = makeSMEEvent({
        type: 'sme.heartbeat.failed',
        data: { agentId: 'agent-zionx', error: 'Budget exceeded' },
      });

      await handler.handle(event);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.sme-handler',
          type: 'alert.sme.heartbeat_failed',
          detail: expect.objectContaining({
            severity: 'high',
            agentId: 'agent-zionx',
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Recommendation Approved
  // -----------------------------------------------------------------------

  describe('sme.recommendation.approved', () => {
    it('should call recommendationEngine.approve and publish dashboard event', async () => {
      const handler = new SMEEventHandler(config);
      const event = makeSMEEvent({
        type: 'sme.recommendation.approved',
        data: { recommendationId: 'rec-001' },
      });

      await handler.handle(event);

      expect(recommendationEngine.approve).toHaveBeenCalledWith('rec-001');
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'dashboard.sme.recommendation_approved',
          detail: expect.objectContaining({
            recommendationId: 'rec-001',
            executionTaskId: 'task-001',
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Recommendation Rejected
  // -----------------------------------------------------------------------

  describe('sme.recommendation.rejected', () => {
    it('should call recommendationEngine.reject and publish dashboard event', async () => {
      const handler = new SMEEventHandler(config);
      const event = makeSMEEvent({
        type: 'sme.recommendation.rejected',
        data: { recommendationId: 'rec-002', reason: 'Not aligned with strategy' },
      });

      await handler.handle(event);

      expect(recommendationEngine.reject).toHaveBeenCalledWith('rec-002', 'Not aligned with strategy');
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'dashboard.sme.recommendation_rejected',
          detail: expect.objectContaining({
            recommendationId: 'rec-002',
            reason: 'Not aligned with strategy',
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Recommendation Escalated
  // -----------------------------------------------------------------------

  describe('sme.recommendation.escalated', () => {
    it('should forward escalation to Shaar dashboard via Event Bus', async () => {
      const handler = new SMEEventHandler(config);
      const event = makeSMEEvent({
        type: 'sme.recommendation.escalated',
        data: {
          recommendationId: 'rec-003',
          agentId: 'agent-zionx',
          domain: 'app-development',
          priority: 9,
          pendingHours: 72,
        },
      });

      await handler.handle(event);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'dashboard.sme.recommendation_escalated',
          detail: expect.objectContaining({
            recommendationId: 'rec-003',
            pendingHours: 72,
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Industry Scan Completed
  // -----------------------------------------------------------------------

  describe('sme.industry.scan_completed', () => {
    it('should update roadmap and publish dashboard event', async () => {
      const handler = new SMEEventHandler(config);
      const event = makeSMEEvent({
        type: 'sme.industry.scan_completed',
        data: { scanId: 'scan-001', discoveriesCount: 5, assessmentsCount: 2 },
      });

      await handler.handle(event);

      expect(industryScanner.updateRoadmap).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'dashboard.sme.industry_scan_completed',
          detail: expect.objectContaining({
            scanId: 'scan-001',
            discoveriesCount: 5,
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Self-Improvement Triggered
  // -----------------------------------------------------------------------

  describe('sme.self_improvement.triggered', () => {
    it('should execute self-assessment and generate proposals', async () => {
      const handler = new SMEEventHandler(config);
      const event = makeSMEEvent({
        type: 'sme.self_improvement.triggered',
        data: { triggeredAt: new Date().toISOString() },
      });

      await handler.handle(event);

      expect(selfImprovementEngine.executeSelfAssessment).toHaveBeenCalled();
      expect(selfImprovementEngine.generateProposals).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'dashboard.sme.self_improvement_completed',
          detail: expect.objectContaining({
            proposalCount: 2,
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------

  describe('idempotency', () => {
    it('should skip duplicate events with the same id', async () => {
      const handler = new SMEEventHandler(config);
      const event = makeSMEEvent({ id: 'dup-evt-1' });

      await handler.handle(event);
      await handler.handle(event);

      // Only called once despite two handle() calls
      expect(kiroIntegration.updateSteeringFromExpertise).toHaveBeenCalledTimes(1);
    });

    it('should skip events already in processedEventIds', async () => {
      config.processedEventIds!.add('pre-processed');
      const handler = new SMEEventHandler(config);
      const event = makeSMEEvent({ id: 'pre-processed' });

      await handler.handle(event);

      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: createSMEHandler (SQS Lambda)
// ---------------------------------------------------------------------------

describe('createSMEHandler', () => {
  let config: SMEHandlerConfig;

  beforeEach(() => {
    config = {
      eventBus: createMockEventBus(),
      zikaron: createMockZikaron(),
      heartbeatScheduler: createMockHeartbeatScheduler(),
      recommendationEngine: createMockRecommendationEngine(),
      industryScanner: createMockIndustryScanner(),
      selfImprovementEngine: createMockSelfImprovementEngine(),
      kiroIntegration: createMockKiroIntegration(),
      processedEventIds: new Set<string>(),
    };
  });

  it('should process valid SQS records and return empty batchItemFailures', async () => {
    const handler = createSMEHandler(config);
    const sqsEvent = makeSQSEvent([
      {
        messageId: 'msg-1',
        body: JSON.stringify(makeSMEEvent({ id: 'evt-1' })),
      },
    ]);

    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(0);
  });

  it('should report failed records in batchItemFailures for invalid JSON', async () => {
    const handler = createSMEHandler(config);
    const sqsEvent = makeSQSEvent([
      { messageId: 'msg-bad', body: 'not-json' },
    ]);

    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-bad');
  });

  it('should report failed records when required fields are missing', async () => {
    const handler = createSMEHandler(config);
    const sqsEvent = makeSQSEvent([
      { messageId: 'msg-no-id', body: JSON.stringify({ type: 'test', data: {} }) },
    ]);

    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-no-id');
  });

  it('should handle partial batch failures correctly', async () => {
    const handler = createSMEHandler(config);
    const sqsEvent = makeSQSEvent([
      { messageId: 'msg-good', body: JSON.stringify(makeSMEEvent({ id: 'good-1' })) },
      { messageId: 'msg-bad', body: 'invalid' },
      { messageId: 'msg-good-2', body: JSON.stringify(makeSMEEvent({ id: 'good-2' })) },
    ]);

    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-bad');
  });

  it('should return empty batchItemFailures for empty Records array', async () => {
    const handler = createSMEHandler(config);
    const sqsEvent: SQSEvent = { Records: [] };

    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: HeartbeatRuntimeIntegration
// ---------------------------------------------------------------------------

describe('HeartbeatRuntimeIntegration', () => {
  let eventBus: EventBusService;
  let heartbeatScheduler: HeartbeatScheduler;
  let industryScanner: IndustryScanner;
  let selfImprovementEngine: SelfImprovementEngine;
  let integration: HeartbeatRuntimeIntegration;

  beforeEach(() => {
    eventBus = createMockEventBus();
    heartbeatScheduler = createMockHeartbeatScheduler();
    industryScanner = createMockIndustryScanner();
    selfImprovementEngine = createMockSelfImprovementEngine();
    integration = new HeartbeatRuntimeIntegration({
      heartbeatScheduler,
      eventBus,
      industryScanner,
      selfImprovementEngine,
    });
  });

  describe('triggerHeartbeat', () => {
    it('should publish sme.heartbeat.started event', async () => {
      await integration.triggerHeartbeat('agent-zionx');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.heartbeat-runtime',
          type: 'sme.heartbeat.started',
          detail: expect.objectContaining({ agentId: 'agent-zionx' }),
          metadata: expect.objectContaining({ tenantId: 'system' }),
        }),
      );
    });

    it('should publish sme.heartbeat.completed event on success', async () => {
      await integration.triggerHeartbeat('agent-zionx');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.heartbeat-runtime',
          type: 'sme.heartbeat.completed',
          detail: expect.objectContaining({
            agentId: 'agent-zionx',
            reviewId: 'review-001',
            recommendationCount: 2,
          }),
        }),
      );
    });

    it('should publish sme.heartbeat.failed event on error', async () => {
      (heartbeatScheduler.triggerReview as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Budget exceeded'),
      );

      await integration.triggerHeartbeat('agent-zionx');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.heartbeat-runtime',
          type: 'sme.heartbeat.failed',
          detail: expect.objectContaining({
            agentId: 'agent-zionx',
            error: 'Budget exceeded',
          }),
        }),
      );
    });
  });

  describe('triggerIndustryScan', () => {
    it('should execute scan and publish scan_completed event', async () => {
      await integration.triggerIndustryScan();

      expect(industryScanner.executeScan).toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.heartbeat-runtime',
          type: 'sme.industry.scan_completed',
          detail: expect.objectContaining({
            scanId: 'scan-001',
            discoveriesCount: 2,
            assessmentsCount: 1,
          }),
        }),
      );
    });

    it('should publish alert on scan failure', async () => {
      (industryScanner.executeScan as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network timeout'),
      );

      await integration.triggerIndustryScan();

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'alert.sme.industry_scan_failed',
          detail: expect.objectContaining({
            severity: 'medium',
            message: 'Network timeout',
          }),
        }),
      );
    });
  });

  describe('triggerSelfImprovement', () => {
    it('should publish self_improvement.triggered event', async () => {
      await integration.triggerSelfImprovement();

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.heartbeat-runtime',
          type: 'sme.self_improvement.triggered',
          detail: expect.objectContaining({
            triggeredAt: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('startHeartbeat / stopHeartbeat', () => {
    it('should track active agents', async () => {
      vi.useFakeTimers();
      try {
        await integration.startHeartbeat('agent-zionx');

        expect(integration.getActiveAgents()).toContain('agent-zionx');

        integration.stopHeartbeat('agent-zionx');

        expect(integration.getActiveAgents()).not.toContain('agent-zionx');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not start heartbeat for disabled agents', async () => {
      (heartbeatScheduler.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        agentId: 'agent-disabled',
        intervalMs: 86400000,
        researchDepth: 'standard',
        maxResearchBudgetUsd: 1.5,
        enabled: false,
        researchSources: [],
      });

      await integration.startHeartbeat('agent-disabled');

      expect(integration.getActiveAgents()).not.toContain('agent-disabled');
    });

    it('should stop all heartbeats with stopAll()', async () => {
      vi.useFakeTimers();
      try {
        await integration.startHeartbeat('agent-zionx');
        (heartbeatScheduler.getConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
          agentId: 'agent-zxmg',
          intervalMs: 86400000,
          researchDepth: 'standard',
          maxResearchBudgetUsd: 1.5,
          enabled: true,
          researchSources: [],
        });
        await integration.startHeartbeat('agent-zxmg');

        expect(integration.getActiveAgents()).toHaveLength(2);

        integration.stopAll();

        expect(integration.getActiveAgents()).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
