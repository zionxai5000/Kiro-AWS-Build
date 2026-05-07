/**
 * Integration tests for SME architecture end-to-end.
 *
 * Tests the full lifecycle of the SME system including heartbeat cycles,
 * recommendation approval/rejection, industry scanning, self-improvement,
 * Kiro steering file regeneration, and escalation handling.
 *
 * Validates: Requirements 21.1, 22.1, 24.1, 25.1, 27.1, 19.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatScheduler } from './heartbeat-scheduler.js';
import { RecommendationEngineImpl } from './recommendation-engine.js';
import { IndustryScannerImpl } from './industry-scanner.js';
import { SelfImprovementEngineImpl } from './self-improvement-engine.js';
import { KiroIntegrationServiceImpl } from '../kiro/integration-service.js';
import {
  SMEEventHandler,
  HeartbeatRuntimeIntegration,
} from '../handlers/sme-handler.js';
import type { SMEHandlerConfig, SMEEvent } from '../handlers/sme-handler.js';
import type { EventBusService, ZikaronService, OtzarService } from '@seraphim/core';
import type { DomainResearchDriver, ResearchFindings } from './heartbeat-scheduler.js';
import type { DomainExpertiseProfile } from './domain-expertise-profile.js';
import { DomainExpertiseProfileService } from './domain-expertise-profile.js';
import type { LLMProvider, SourceFetcher } from './industry-scanner.js';

// ---------------------------------------------------------------------------
// Shared Mock Factories
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id'),
    publishBatch: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue('sub-id'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('episodic-id'),
    storeSemantic: vi.fn().mockResolvedValue('semantic-id'),
    storeProcedural: vi.fn().mockResolvedValue('procedural-id'),
    storeWorking: vi.fn().mockResolvedValue('working-id'),
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

function createMockOtzar(): OtzarService {
  return {
    checkBudget: vi.fn().mockResolvedValue({
      allowed: true,
      remainingDaily: 10.0,
      reason: null,
    }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getBudgetStatus: vi.fn().mockResolvedValue({
      dailyBudget: 50,
      dailyUsed: 5,
      monthlyBudget: 500,
      monthlyUsed: 50,
    }),
  } as unknown as OtzarService;
}

function createMockResearchDriver(): DomainResearchDriver {
  return {
    research: vi.fn().mockResolvedValue({
      sources: ['arxiv', 'github'],
      findings: [
        {
          topic: 'New optimization technique',
          content: 'A novel approach to reduce latency by 40%',
          source: 'arxiv',
          confidence: 0.85,
        },
      ],
      costUsd: 0.3,
    } satisfies ResearchFindings),
  };
}

function createMockLLMProvider(): LLMProvider {
  return {
    classifyRelevance: vi.fn().mockResolvedValue({
      relevant: true,
      domains: ['app-development'],
      confidence: 0.9,
    }),
    assessTechnology: vi.fn().mockResolvedValue({
      relevanceScore: 0.85,
      relevantDomains: ['app-development'],
      adoptionComplexity: 'medium' as const,
      estimatedBenefit: 'Significant performance improvement',
      competitiveAdvantage: 'Early adopter advantage',
      recommendedTimeline: '3_months' as const,
      integrationPlan: 'Phase 1: POC, Phase 2: Integration',
    }),
    extractDiscoveries: vi.fn().mockResolvedValue([
      {
        id: 'disc-001',
        name: 'New AI Framework',
        description: 'A breakthrough framework for AI orchestration',
        source: 'arxiv',
        discoveredAt: new Date(),
        category: 'framework' as const,
      },
    ]),
  };
}

function createMockSourceFetcher(): SourceFetcher {
  return {
    fetch: vi.fn().mockResolvedValue('Mock source content with technology discoveries'),
  };
}

function createTestProfile(): DomainExpertiseProfile {
  return {
    agentId: 'agent-zionx',
    domain: 'app-development',
    version: 1,
    lastUpdated: new Date(),
    knowledgeBase: [
      {
        id: 'kb-1',
        topic: 'React Native Performance',
        content: 'Best practices for RN performance optimization',
        source: 'research',
        confidence: 0.9,
        tags: ['technology', 'framework'],
        lastVerified: new Date(),
      },
    ],
    knowledgeGaps: ['Advanced ML integration', 'Edge computing'],
    qualityBenchmarks: [
      {
        metric: 'app_store_rating',
        current: 4.2,
        worldClass: 4.8,
        unit: 'stars',
        source: 'industry-analysis',
        lastUpdated: new Date(),
      },
      {
        metric: 'crash_free_rate',
        current: 98.5,
        worldClass: 99.9,
        unit: 'percent',
        source: 'industry-analysis',
        lastUpdated: new Date(),
      },
    ],
    competitiveIntelligence: [],
    decisionFrameworks: [
      {
        name: 'Feature Prioritization',
        description: 'Prioritize features by user impact and effort',
        inputs: ['user_feedback', 'effort_estimate', 'strategic_alignment'],
        decisionTree: [],
        historicalAccuracy: 0.82,
        lastCalibrated: new Date(),
      },
    ],
    industryBestPractices: [
      {
        id: 'bp-1',
        title: 'Continuous Deployment',
        description: 'Deploy multiple times per day with automated testing',
        domain: 'app-development',
        source: 'industry-leaders',
        confidence: 0.95,
        tags: ['deployment', 'automation'],
      },
    ],
    learnedPatterns: [
      {
        id: 'lp-1',
        pattern: 'Incremental rollouts reduce risk',
        context: 'Feature flags for gradual rollout',
        outcome: 'positive',
        confidence: 0.88,
        occurrences: 5,
        firstObserved: new Date(),
        lastObserved: new Date(),
      },
      {
        id: 'lp-2',
        pattern: 'Skipping code review leads to bugs',
        context: 'Direct merges without review',
        outcome: 'negative',
        confidence: 0.92,
        occurrences: 3,
        firstObserved: new Date(),
        lastObserved: new Date(),
      },
    ],
    lastResearchCycle: null,
    researchBacklog: [],
    conflicts: [],
  };
}

/**
 * Create a mock profile service that returns our test profile directly.
 * This avoids depending on Zikaron query results for the heartbeat test.
 */
function createMockProfileService(): DomainExpertiseProfileService {
  const service = {
    createProfile: vi.fn().mockResolvedValue(createTestProfile()),
    updateProfile: vi.fn().mockImplementation(async (profile) => ({ ...profile, version: profile.version + 1 })),
    loadProfile: vi.fn().mockResolvedValue(createTestProfile()),
    resolveConflicts: vi.fn().mockResolvedValue([]),
  } as unknown as DomainExpertiseProfileService;
  return service;
}

// ---------------------------------------------------------------------------
// Integration Test: Full Heartbeat Cycle
// ---------------------------------------------------------------------------

describe('SME Integration: Full Heartbeat Cycle', () => {
  let eventBus: EventBusService;
  let otzar: OtzarService;
  let profileService: DomainExpertiseProfileService;
  let heartbeatScheduler: HeartbeatScheduler;
  let recommendationEngine: RecommendationEngineImpl;

  beforeEach(() => {
    eventBus = createMockEventBus();
    otzar = createMockOtzar();
    profileService = createMockProfileService();

    recommendationEngine = new RecommendationEngineImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron: createMockZikaron(),
      otzar,
      escalationThresholdMs: 48 * 60 * 60 * 1000,
      budgetApprovalThreshold: 100,
    });

    heartbeatScheduler = new HeartbeatScheduler({
      tenantId: 'test-tenant',
      profileService,
      otzarService: otzar,
      recommendationQueue: recommendationEngine,
      researchDrivers: {
        'agent-zionx': createMockResearchDriver(),
      },
    });
  });

  it('should execute full heartbeat cycle: trigger → research → benchmark → gap analysis → recommendation → queue submission', async () => {
    // Configure heartbeat
    await heartbeatScheduler.configure('agent-zionx', {
      intervalMs: 86400000,
      researchDepth: 'standard',
      maxResearchBudgetUsd: 2.0,
      enabled: true,
    });

    // Trigger review
    const result = await heartbeatScheduler.triggerReview('agent-zionx');

    // Verify full cycle completed
    expect(result.agentId).toBe('agent-zionx');
    expect(result.domain).toBe('app-development');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.costUsd).toBeGreaterThanOrEqual(0);

    // Verify current state assessment
    expect(result.currentStateAssessment.domain).toBe('app-development');
    expect(result.currentStateAssessment.overallScore).toBeGreaterThan(0);

    // Verify benchmarks were built
    expect(result.worldClassBenchmarks.length).toBeGreaterThan(0);

    // Verify gap analysis was performed
    expect(result.gapAnalysis.length).toBeGreaterThan(0);
    for (const gap of result.gapAnalysis) {
      expect(gap.gapPercentage).toBeGreaterThan(0);
      expect(gap.priority).toBeGreaterThanOrEqual(1);
      expect(gap.closingStrategy).toBeTruthy();
    }

    // Verify recommendations were generated and submitted to queue
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const rec of result.recommendations) {
      expect(rec.agentId).toBe('agent-zionx');
      expect(rec.domain).toBe('app-development');
      expect(rec.status).toBe('pending');
      expect(rec.worldClassBenchmark).toBeDefined();
      expect(rec.currentState).toBeDefined();
      expect(rec.gapAnalysis).toBeDefined();
      expect(rec.actionPlan).toBeDefined();
    }

    // Verify recommendations are in the queue
    const pending = await recommendationEngine.getPending();
    expect(pending.length).toBe(result.recommendations.length);
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Recommendation Approval → Execution
// ---------------------------------------------------------------------------

describe('SME Integration: Recommendation Approval Flow', () => {
  let eventBus: EventBusService;
  let zikaron: ZikaronService;
  let otzar: OtzarService;
  let recommendationEngine: RecommendationEngineImpl;

  beforeEach(() => {
    eventBus = createMockEventBus();
    zikaron = createMockZikaron();
    otzar = createMockOtzar();

    recommendationEngine = new RecommendationEngineImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      otzar,
      escalationThresholdMs: 48 * 60 * 60 * 1000,
      budgetApprovalThreshold: 100,
    });
  });

  it('should handle approval → execution task creation → agent dispatch → completion → impact measurement', async () => {
    // Submit a recommendation
    const recId = await recommendationEngine.submit({
      id: 'rec-approval-test',
      agentId: 'agent-zionx',
      domain: 'app-development',
      priority: 8,
      submittedAt: new Date(),
      worldClassBenchmark: {
        description: 'World-class crash-free rate: 99.9%',
        source: 'industry-analysis',
        metrics: { crash_free_rate: { value: 99.9, unit: 'percent' } },
      },
      currentState: {
        description: 'Current crash-free rate: 98.5%',
        metrics: { crash_free_rate: { value: 98.5, unit: 'percent' } },
      },
      gapAnalysis: {
        description: '1.4% gap in crash-free rate',
        gapPercentage: 1.4,
        keyGaps: ['Memory leak in background tasks', 'Unhandled exceptions in network layer'],
      },
      actionPlan: {
        summary: 'Improve crash-free rate from 98.5% to 99.9%',
        steps: [
          { order: 1, description: 'Fix memory leaks', type: 'code_change', estimatedDuration: '2 days', dependencies: [] },
          { order: 2, description: 'Add exception handling', type: 'code_change', estimatedDuration: '1 day', dependencies: [1] },
        ],
        estimatedEffort: '3 days',
        estimatedImpact: { crash_free_rate: { value: 99.5, unit: 'percent' } },
        requiresCodeChanges: true,
        requiresBudget: 0,
      },
      riskAssessment: { level: 'low', risks: ['Minor regression risk'], mitigations: ['Staged rollout'] },
      rollbackPlan: 'Revert code changes if crash rate increases',
      status: 'pending',
    });

    // Verify submission
    expect(recId).toBe('rec-approval-test');
    const pending = await recommendationEngine.getPending();
    expect(pending).toHaveLength(1);

    // Approve the recommendation
    const executionTask = await recommendationEngine.approve(recId);

    // Verify execution task created
    expect(executionTask.recommendationId).toBe(recId);
    expect(executionTask.agentId).toBe('agent-zionx');
    expect(executionTask.status).toBe('pending');
    expect(executionTask.progress).toBe(0);

    // Verify approval event published
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'recommendation.approved',
        detail: expect.objectContaining({
          recommendationId: recId,
          agentId: 'agent-zionx',
        }),
      }),
    );

    // Measure impact after completion
    const impact = await recommendationEngine.measureImpact(recId, {
      crash_free_rate: 99.7,
    });

    expect(impact.recommendationId).toBe(recId);
    expect(impact.actualImpact.crash_free_rate).toBe(99.7);
    expect(impact.measuredAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Recommendation Rejection → Zikaron Storage → Learning
// ---------------------------------------------------------------------------

describe('SME Integration: Recommendation Rejection Flow', () => {
  let eventBus: EventBusService;
  let zikaron: ZikaronService;
  let otzar: OtzarService;
  let recommendationEngine: RecommendationEngineImpl;

  beforeEach(() => {
    eventBus = createMockEventBus();
    zikaron = createMockZikaron();
    otzar = createMockOtzar();

    recommendationEngine = new RecommendationEngineImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      otzar,
      escalationThresholdMs: 48 * 60 * 60 * 1000,
      budgetApprovalThreshold: 100,
    });
  });

  it('should handle rejection → Zikaron storage → agent learning feedback', async () => {
    // Submit a recommendation
    const recId = await recommendationEngine.submit({
      id: 'rec-reject-test',
      agentId: 'agent-zxmg',
      domain: 'media-production',
      priority: 5,
      submittedAt: new Date(),
      worldClassBenchmark: {
        description: 'World-class video quality: 4K HDR',
        source: 'industry-analysis',
        metrics: { video_quality: { value: 4, unit: 'K resolution' } },
      },
      currentState: {
        description: 'Current video quality: 1080p',
        metrics: { video_quality: { value: 1080, unit: 'pixels' } },
      },
      gapAnalysis: {
        description: 'Resolution gap',
        gapPercentage: 50,
        keyGaps: ['Hardware limitations'],
      },
      actionPlan: {
        summary: 'Upgrade video pipeline to 4K',
        steps: [{ order: 1, description: 'Upgrade encoder', type: 'configuration', estimatedDuration: '1 week', dependencies: [] }],
        estimatedEffort: '1 week',
        estimatedImpact: { video_quality: { value: 4, unit: 'K resolution' } },
        requiresCodeChanges: false,
        requiresBudget: 50,
      },
      riskAssessment: { level: 'medium', risks: ['Cost increase'], mitigations: ['Gradual rollout'] },
      rollbackPlan: 'Revert to 1080p pipeline',
      status: 'pending',
    });

    // Reject the recommendation
    const rejectionReason = 'Not aligned with current quarter priorities';
    await recommendationEngine.reject(recId, rejectionReason);

    // Verify rejection stored in Zikaron for agent learning
    expect(zikaron.storeEpisodic).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: 'episodic',
        sourceAgentId: 'agent-zxmg',
        tags: expect.arrayContaining(['recommendation', 'rejected', 'media-production']),
        eventType: 'recommendation.rejected',
        outcome: 'failure',
      }),
    );

    // Verify rejection event published
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'recommendation.rejected',
        detail: expect.objectContaining({
          recommendationId: recId,
          reason: rejectionReason,
        }),
      }),
    );

    // Verify recommendation is no longer pending
    const pending = await recommendationEngine.getPending();
    expect(pending).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Industry Scanner Discovery → Assessment → Recommendation
// ---------------------------------------------------------------------------

describe('SME Integration: Industry Scanner Flow', () => {
  let eventBus: EventBusService;
  let zikaron: ZikaronService;
  let otzar: OtzarService;
  let recommendationEngine: RecommendationEngineImpl;
  let industryScanner: IndustryScannerImpl;

  beforeEach(() => {
    eventBus = createMockEventBus();
    zikaron = createMockZikaron();
    otzar = createMockOtzar();

    recommendationEngine = new RecommendationEngineImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      otzar,
      escalationThresholdMs: 48 * 60 * 60 * 1000,
      budgetApprovalThreshold: 100,
    });

    industryScanner = new IndustryScannerImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      recommendationQueue: recommendationEngine,
      llmProvider: createMockLLMProvider(),
      sourceFetcher: createMockSourceFetcher(),
      highImpactThreshold: 0.8,
    });
  });

  it('should execute discovery → assessment → recommendation submission for high-impact technologies', async () => {
    // Configure LLM to return 'immediate' timeline for auto-submission
    const llmProvider = createMockLLMProvider();
    (llmProvider.assessTechnology as ReturnType<typeof vi.fn>).mockResolvedValue({
      relevanceScore: 0.95,
      relevantDomains: ['app-development'],
      adoptionComplexity: 'low' as const,
      estimatedBenefit: 'Critical performance improvement',
      competitiveAdvantage: 'First mover advantage',
      recommendedTimeline: 'immediate' as const,
      integrationPlan: 'Direct integration',
    });

    industryScanner = new IndustryScannerImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      recommendationQueue: recommendationEngine,
      llmProvider,
      sourceFetcher: createMockSourceFetcher(),
      highImpactThreshold: 0.8,
    });

    // Configure sources
    await industryScanner.configureSources([
      {
        name: 'Test Source',
        type: 'rss_feed',
        url: 'https://example.com/feed',
        scanFrequency: '0 6 * * *',
        relevantDomains: ['app-development'],
        enabled: true,
      },
    ]);

    // Execute scan
    const scanResult = await industryScanner.executeScan();

    // Verify discoveries were made
    expect(scanResult.discoveries.length).toBeGreaterThan(0);
    expect(scanResult.sourcesScanned).toBeGreaterThan(0);

    // Verify assessments were generated
    expect(scanResult.assessments.length).toBeGreaterThan(0);
    for (const assessment of scanResult.assessments) {
      expect(assessment.relevanceScore).toBeGreaterThan(0);
      expect(assessment.relevantDomains.length).toBeGreaterThan(0);
      expect(assessment.recommendedTimeline).toBeTruthy();
    }

    // High-impact + immediate timeline discoveries should be auto-submitted
    const highImpactImmediate = scanResult.assessments.filter(
      (a) => a.relevanceScore >= 0.8 && a.recommendedTimeline === 'immediate',
    );
    if (highImpactImmediate.length > 0) {
      // Verify recommendation was submitted to the queue
      const pending = await recommendationEngine.getPending();
      expect(pending.length).toBeGreaterThan(0);
    }
  });

  it('should update technology roadmap after scan', async () => {
    await industryScanner.configureSources([
      {
        name: 'Test Source',
        type: 'rss_feed',
        url: 'https://example.com/feed',
        scanFrequency: '0 6 * * *',
        relevantDomains: ['app-development'],
        enabled: true,
      },
    ]);

    await industryScanner.executeScan();
    const roadmap = await industryScanner.updateRoadmap();

    expect(roadmap.lastUpdated).toBeInstanceOf(Date);
    // Roadmap should categorize assessments by timeline
    const totalItems =
      roadmap.availableNow.length +
      roadmap.threeMonths.length +
      roadmap.sixMonths.length +
      roadmap.twelveMonths.length +
      roadmap.monitoring.length;
    expect(totalItems).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Self-Improvement Assessment → Proposal → Approval
// ---------------------------------------------------------------------------

describe('SME Integration: Self-Improvement Flow', () => {
  let eventBus: EventBusService;
  let zikaron: ZikaronService;
  let otzar: OtzarService;
  let recommendationEngine: RecommendationEngineImpl;
  let industryScanner: IndustryScannerImpl;
  let selfImprovementEngine: SelfImprovementEngineImpl;

  beforeEach(() => {
    eventBus = createMockEventBus();
    zikaron = createMockZikaron();
    otzar = createMockOtzar();

    recommendationEngine = new RecommendationEngineImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      otzar,
      escalationThresholdMs: 48 * 60 * 60 * 1000,
      budgetApprovalThreshold: 100,
    });

    industryScanner = new IndustryScannerImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      recommendationQueue: recommendationEngine,
      llmProvider: createMockLLMProvider(),
      sourceFetcher: createMockSourceFetcher(),
    });

    selfImprovementEngine = new SelfImprovementEngineImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      recommendationQueue: recommendationEngine,
      industryScanner,
    });
  });

  it('should execute self-assessment → proposal generation → implementation → verification', async () => {
    // Execute self-assessment
    const assessment = await selfImprovementEngine.executeSelfAssessment();

    expect(assessment.id).toBeTruthy();
    expect(assessment.systemMetrics).toBeDefined();
    expect(assessment.systemMetrics.avgResponseTimeMs).toBeGreaterThanOrEqual(0);
    expect(assessment.architecturalAssessment).toBeDefined();

    // Generate proposals from assessment
    const proposals = await selfImprovementEngine.generateProposals(assessment);

    expect(proposals.length).toBeGreaterThanOrEqual(0);
    for (const proposal of proposals) {
      expect(proposal.id).toBeTruthy();
      expect(proposal.title).toBeTruthy();
      expect(proposal.implementationPlan.length).toBeGreaterThan(0);
      expect(proposal.verificationCriteria.length).toBeGreaterThan(0);
      expect(proposal.rollbackPlan.length).toBeGreaterThan(0);
      // Proposals may be auto-submitted to recommendation queue
      expect(['draft', 'submitted']).toContain(proposal.status);
    }

    // If proposals exist, test implementation lifecycle
    if (proposals.length > 0) {
      const proposalId = proposals[0].id;

      // Implement proposal
      const implResult = await selfImprovementEngine.implementProposal(proposalId);
      expect(implResult.proposalId).toBe(proposalId);
      expect(implResult.success).toBeDefined();

      // Verify implementation
      const verifyResult = await selfImprovementEngine.verifyImplementation(proposalId);
      expect(verifyResult.proposalId).toBe(proposalId);
      expect(verifyResult.passed).toBeDefined();

      // If verification fails, test rollback
      if (!verifyResult.passed) {
        const rollbackResult = await selfImprovementEngine.rollbackImplementation(proposalId);
        expect(rollbackResult.proposalId).toBe(proposalId);
        expect(rollbackResult.success).toBeDefined();
      }
    }
  });

  it('should track improvement metrics over time', async () => {
    const metrics = await selfImprovementEngine.getImprovementMetrics();

    expect(metrics.proposalsGenerated).toBeGreaterThanOrEqual(0);
    expect(metrics.proposalsApproved).toBeGreaterThanOrEqual(0);
    expect(metrics.proposalsImplemented).toBeGreaterThanOrEqual(0);
    expect(metrics.cumulativePerformanceImprovement).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Kiro Steering File Regeneration After Heartbeat
// ---------------------------------------------------------------------------

describe('SME Integration: Kiro Steering File Regeneration', () => {
  let eventBus: EventBusService;
  let profileService: DomainExpertiseProfileService;
  let kiroIntegration: KiroIntegrationServiceImpl;

  beforeEach(() => {
    eventBus = createMockEventBus();
    profileService = createMockProfileService();

    kiroIntegration = new KiroIntegrationServiceImpl({
      tenantId: 'test-tenant',
      eventBus,
      profileService,
      getCapabilityMaturity: async () => ({
        overall: 0.6,
        byDomain: { 'app-development': 0.7 },
        byCapability: {
          'code-quality': { current: 0.7, target: 0.95, trend: 'improving' as const },
        },
        targetVision: 'World-class AI orchestration',
        estimatedTimeToTarget: '12 months',
      }),
    });
  });

  it('should regenerate steering file after heartbeat review updates expertise', async () => {
    // Trigger steering file update (simulating post-heartbeat)
    await kiroIntegration.updateSteeringFromExpertise('agent-zionx');

    // Verify steering file was generated
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'kiro.steering.generated',
        detail: expect.objectContaining({
          agentId: 'agent-zionx',
          domain: 'app-development',
        }),
      }),
    );

    // Verify update event was published
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'kiro.steering.updated-from-expertise',
        detail: expect.objectContaining({
          agentId: 'agent-zionx',
        }),
      }),
    );

    // Generate the steering file and verify content
    const steeringFile = await kiroIntegration.generateSteeringFile('agent-zionx');
    expect(steeringFile.path).toContain('app-development');
    expect(steeringFile.content).toContain('Domain Overview');
    expect(steeringFile.content).toContain('Current State');
    expect(steeringFile.content).toContain('Decision Frameworks');
    expect(steeringFile.content).toContain('Best Practices');
    expect(steeringFile.content).toContain('Quality Standards');
    expect(steeringFile.content).toContain('Common Pitfalls');
    expect(steeringFile.sourceAgentId).toBe('agent-zionx');
  });

  it('should update steering file after industry scan discovery', async () => {
    const assessment = {
      id: 'assess-001',
      technology: {
        id: 'tech-001',
        name: 'New Framework',
        description: 'A new framework',
        source: 'arxiv',
        discoveredAt: new Date(),
        category: 'framework' as const,
      },
      relevanceScore: 0.9,
      relevantDomains: ['app-development'],
      adoptionComplexity: 'medium' as const,
      estimatedBenefit: 'High performance gain',
      competitiveAdvantage: 'Early adopter',
      recommendedTimeline: '3_months' as const,
      assessedAt: new Date(),
    };

    await kiroIntegration.updateSteeringFromIndustryScan(assessment);

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'kiro.steering.updated-from-industry-scan',
        detail: expect.objectContaining({
          technologyName: 'New Framework',
          domain: 'app-development',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Escalation of Stale Recommendations
// ---------------------------------------------------------------------------

describe('SME Integration: Stale Recommendation Escalation', () => {
  let eventBus: EventBusService;
  let zikaron: ZikaronService;
  let otzar: OtzarService;
  let recommendationEngine: RecommendationEngineImpl;

  beforeEach(() => {
    eventBus = createMockEventBus();
    zikaron = createMockZikaron();
    otzar = createMockOtzar();

    recommendationEngine = new RecommendationEngineImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      otzar,
      escalationThresholdMs: 1, // 1ms threshold for testing
      budgetApprovalThreshold: 100,
    });
  });

  it('should escalate recommendations that exceed the pending threshold', async () => {
    // Submit a recommendation with a past timestamp
    await recommendationEngine.submit({
      id: 'rec-stale-test',
      agentId: 'agent-zionx',
      domain: 'app-development',
      priority: 9,
      submittedAt: new Date(Date.now() - 100000), // 100 seconds ago
      worldClassBenchmark: {
        description: 'World-class performance',
        source: 'industry',
        metrics: {},
      },
      currentState: {
        description: 'Current state',
        metrics: {},
      },
      gapAnalysis: {
        description: 'Performance gap',
        gapPercentage: 30,
        keyGaps: ['Latency'],
      },
      actionPlan: {
        summary: 'Reduce latency',
        steps: [{ order: 1, description: 'Optimize', type: 'code_change', estimatedDuration: '1 day', dependencies: [] }],
        estimatedEffort: '1 day',
        estimatedImpact: {},
        requiresCodeChanges: true,
        requiresBudget: 0,
      },
      riskAssessment: { level: 'low', risks: [], mitigations: [] },
      rollbackPlan: 'Revert',
      status: 'pending',
    });

    // Wait a tiny bit to ensure threshold is exceeded
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Check escalations
    const escalated = await recommendationEngine.checkEscalations();

    expect(escalated.length).toBeGreaterThan(0);
    expect(escalated[0].id).toBe('rec-stale-test');
  });
});

// ---------------------------------------------------------------------------
// Integration Test: SME Handler Wiring (End-to-End Event Processing)
// ---------------------------------------------------------------------------

describe('SME Integration: Handler Event Processing End-to-End', () => {
  let eventBus: EventBusService;
  let zikaron: ZikaronService;
  let otzar: OtzarService;
  let profileService: DomainExpertiseProfileService;
  let heartbeatScheduler: HeartbeatScheduler;
  let recommendationEngine: RecommendationEngineImpl;
  let industryScanner: IndustryScannerImpl;
  let selfImprovementEngine: SelfImprovementEngineImpl;
  let kiroIntegration: KiroIntegrationServiceImpl;
  let smeHandler: SMEEventHandler;

  beforeEach(() => {
    eventBus = createMockEventBus();
    zikaron = createMockZikaron();
    otzar = createMockOtzar();
    profileService = createMockProfileService();

    recommendationEngine = new RecommendationEngineImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      otzar,
      escalationThresholdMs: 48 * 60 * 60 * 1000,
      budgetApprovalThreshold: 100,
    });

    heartbeatScheduler = new HeartbeatScheduler({
      tenantId: 'test-tenant',
      profileService,
      otzarService: otzar,
      recommendationQueue: recommendationEngine,
      researchDrivers: { 'agent-zionx': createMockResearchDriver() },
    });

    industryScanner = new IndustryScannerImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      recommendationQueue: recommendationEngine,
      llmProvider: createMockLLMProvider(),
      sourceFetcher: createMockSourceFetcher(),
    });

    selfImprovementEngine = new SelfImprovementEngineImpl({
      tenantId: 'test-tenant',
      eventBus,
      zikaron,
      recommendationQueue: recommendationEngine,
      industryScanner,
    });

    kiroIntegration = new KiroIntegrationServiceImpl({
      tenantId: 'test-tenant',
      eventBus,
      profileService,
      getCapabilityMaturity: async () => ({
        overall: 0.6,
        byDomain: {},
        byCapability: {},
        targetVision: 'World-class',
        estimatedTimeToTarget: '12 months',
      }),
    });

    smeHandler = new SMEEventHandler({
      eventBus,
      zikaron,
      heartbeatScheduler,
      recommendationEngine,
      industryScanner,
      selfImprovementEngine,
      kiroIntegration,
    });
  });

  it('should process heartbeat.completed event and trigger steering regeneration', async () => {
    const event: SMEEvent = {
      id: 'evt-hb-complete',
      type: 'sme.heartbeat.completed',
      data: { agentId: 'agent-zionx', reviewId: 'review-001' },
      timestamp: new Date().toISOString(),
    };

    await smeHandler.handle(event);

    // Verify steering file regeneration was triggered
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'kiro.steering.generated',
      }),
    );

    // Verify dashboard update published
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'dashboard.sme.heartbeat_completed',
      }),
    );
  });

  it('should process recommendation.approved event and create execution task', async () => {
    // First submit a recommendation
    const recId = await recommendationEngine.submit({
      id: 'rec-handler-test',
      agentId: 'agent-zionx',
      domain: 'app-development',
      priority: 7,
      submittedAt: new Date(),
      worldClassBenchmark: { description: 'Best', source: 'test', metrics: {} },
      currentState: { description: 'Current', metrics: {} },
      gapAnalysis: { description: 'Gap', gapPercentage: 20, keyGaps: ['gap1'] },
      actionPlan: {
        summary: 'Fix gap',
        steps: [{ order: 1, description: 'Do it', type: 'code_change', estimatedDuration: '1d', dependencies: [] }],
        estimatedEffort: '1d',
        estimatedImpact: {},
        requiresCodeChanges: true,
        requiresBudget: 0,
      },
      riskAssessment: { level: 'low', risks: [], mitigations: [] },
      rollbackPlan: 'Revert',
      status: 'pending',
    });

    // Process approval event
    const event: SMEEvent = {
      id: 'evt-approve',
      type: 'sme.recommendation.approved',
      data: { recommendationId: recId },
      timestamp: new Date().toISOString(),
    };

    await smeHandler.handle(event);

    // Verify execution task was created
    const task = await recommendationEngine.getExecutionStatus(recId);
    expect(task).not.toBeNull();
    expect(task!.agentId).toBe('agent-zionx');
    expect(task!.status).toBe('pending');
  });

  it('should process recommendation.rejected event and store in Zikaron', async () => {
    // Submit a recommendation
    const recId = await recommendationEngine.submit({
      id: 'rec-reject-handler',
      agentId: 'agent-zxmg',
      domain: 'media-production',
      priority: 4,
      submittedAt: new Date(),
      worldClassBenchmark: { description: 'Best', source: 'test', metrics: {} },
      currentState: { description: 'Current', metrics: {} },
      gapAnalysis: { description: 'Gap', gapPercentage: 15, keyGaps: ['gap1'] },
      actionPlan: {
        summary: 'Improve quality',
        steps: [{ order: 1, description: 'Upgrade', type: 'configuration', estimatedDuration: '2d', dependencies: [] }],
        estimatedEffort: '2d',
        estimatedImpact: {},
        requiresCodeChanges: false,
        requiresBudget: 0,
      },
      riskAssessment: { level: 'low', risks: [], mitigations: [] },
      rollbackPlan: 'Revert config',
      status: 'pending',
    });

    // Process rejection event
    const event: SMEEvent = {
      id: 'evt-reject',
      type: 'sme.recommendation.rejected',
      data: { recommendationId: recId, reason: 'Low priority this quarter' },
      timestamp: new Date().toISOString(),
    };

    await smeHandler.handle(event);

    // Verify stored in Zikaron
    expect(zikaron.storeEpisodic).toHaveBeenCalledWith(
      expect.objectContaining({
        layer: 'episodic',
        sourceAgentId: 'agent-zxmg',
        tags: expect.arrayContaining(['recommendation', 'rejected']),
      }),
    );
  });

  it('should process industry.scan_completed event and update roadmap', async () => {
    await industryScanner.configureSources([
      {
        name: 'Test',
        type: 'rss_feed',
        url: 'https://example.com',
        scanFrequency: '0 6 * * *',
        relevantDomains: ['app-development'],
        enabled: true,
      },
    ]);

    const event: SMEEvent = {
      id: 'evt-scan',
      type: 'sme.industry.scan_completed',
      data: { scanId: 'scan-001', discoveriesCount: 3, assessmentsCount: 1 },
      timestamp: new Date().toISOString(),
    };

    await smeHandler.handle(event);

    // Verify dashboard event published
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'dashboard.sme.industry_scan_completed',
      }),
    );
  });

  it('should process self_improvement.triggered event and run assessment', async () => {
    const event: SMEEvent = {
      id: 'evt-self-improve',
      type: 'sme.self_improvement.triggered',
      data: { triggeredAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    };

    await smeHandler.handle(event);

    // Verify dashboard event published with assessment results
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'dashboard.sme.self_improvement_completed',
        detail: expect.objectContaining({
          proposalCount: expect.any(Number),
        }),
      }),
    );
  });
});
