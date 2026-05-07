/**
 * Integration tests for Eretz Business Pillar — end-to-end flows.
 *
 * Validates: Requirements 29a.1, 29b.5, 29c.9, 29d.15, 29e.17, 29f.20, 29g.24, 19.2
 *
 * Tests the full lifecycle of Eretz operations including directive enrichment,
 * bypass detection, synergy detection, standing rule enforcement, pattern
 * extraction and recommendation, portfolio decline alerts, training cascade,
 * heartbeat review, and Kiro steering file generation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DirectiveEnrichmentPipeline,
  ResultVerificationPipeline,
  BypassDetector,
} from '../agent-program.js';
import type {
  Directive,
  SubsidiaryResult,
  PortfolioProvider,
  PatternLibrary,
  SynergyEngine,
  EventBusPublisher,
  PortfolioContext,
  PatternMatch,
  SynergyOpportunity,
} from '../agent-program.js';
import { EretzSynergyEngineImpl } from '../synergy-engine.js';
import type { BusinessEvent } from '../synergy-engine.js';
import { EretzPatternLibraryImpl } from '../pattern-library.js';
import type { PatternSource } from '../pattern-library.js';
import { EretzPortfolioDashboardImpl } from '../portfolio-dashboard.js';
import type { SubsidiaryData } from '../portfolio-dashboard.js';
import { TrainingCascadeImpl } from '../training-cascade.js';
import { HeartbeatScheduler } from '@seraphim/services/sme/heartbeat-scheduler.js';
import type {
  DomainResearchDriver,
  RecommendationQueue,
  Recommendation,
} from '@seraphim/services/sme/heartbeat-scheduler.js';
import { KiroIntegrationServiceImpl } from '@seraphim/services/kiro/integration-service.js';
import { DomainExpertiseProfileService } from '@seraphim/services/sme/domain-expertise-profile.js';
import type { EventBusService, ZikaronService, OtzarService } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock Factories
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
    storeEpisodic: vi.fn().mockResolvedValue('entry-id'),
    storeSemantic: vi.fn().mockResolvedValue('entry-id'),
    storeProcedural: vi.fn().mockResolvedValue('entry-id'),
    storeWorking: vi.fn().mockResolvedValue('entry-id'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({ agentId: 'agent-eretz', memories: [] }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockOtzar(): OtzarService {
  return {
    checkBudget: vi.fn().mockResolvedValue({ allowed: true, remainingDaily: 5.0 }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getBudgetStatus: vi.fn().mockResolvedValue({ remaining: 100, used: 0 }),
  } as unknown as OtzarService;
}

function createMockRecommendationQueue(): RecommendationQueue {
  const submitted: Recommendation[] = [];
  return {
    submit: vi.fn().mockImplementation(async (rec: Recommendation) => {
      submitted.push(rec);
      return rec.id;
    }),
    _submitted: submitted,
  } as unknown as RecommendationQueue & { _submitted: Recommendation[] };
}

function createMockPortfolioProvider(context?: Partial<PortfolioContext>): PortfolioProvider {
  return {
    getSubsidiaryContext: vi.fn().mockResolvedValue({
      subsidiaryId: 'zionx',
      mrr: 5000,
      topProducts: ['wellness-app', 'finance-tracker'],
      gaps: ['no subscription tier'],
      recentPerformance: 'steady growth',
      ...context,
    }),
  };
}

function createMockPatternLibraryInterface(patterns?: PatternMatch[]): PatternLibrary {
  return {
    findApplicablePatterns: vi.fn().mockResolvedValue(
      patterns ?? [
        {
          patternId: 'pat-freemium',
          name: 'freemium_with_trial',
          confidence: 0.87,
          applicability: 'High applicability for app launches',
        },
      ],
    ),
  };
}

function createMockSynergyEngine(synergies?: SynergyOpportunity[]): SynergyEngine {
  return {
    checkSynergyOpportunities: vi.fn().mockResolvedValue(
      synergies ?? [
        {
          id: 'syn-1',
          type: 'revenue' as const,
          sourceSubsidiary: 'zxmg',
          targetSubsidiary: 'zionx',
          description: 'ZXMG wellness channel cross-promo',
          estimatedRevenueImpact: 200,
          confidence: 0.8,
        },
      ],
    ),
  };
}

function createMockResearchDriver(): DomainResearchDriver {
  return {
    research: vi.fn().mockResolvedValue({
      sources: ['portfolio-analysis', 'market-research'],
      findings: [
        {
          topic: 'Portfolio optimization',
          content: 'Cross-business synergies can increase revenue by 15-25%',
          source: 'BCG Report',
          confidence: 0.85,
        },
      ],
      costUsd: 0.05,
    }),
  };
}

function createSampleDirective(overrides?: Partial<Directive>): Directive {
  return {
    id: 'dir-int-001',
    source: 'seraphim_core',
    target: 'zionx',
    action: 'build_wellness_app',
    payload: { category: 'health', monetization: 'freemium', routedThroughEretz: true },
    priority: 7,
    timestamp: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

function createSampleResult(overrides?: Partial<SubsidiaryResult>): SubsidiaryResult {
  return {
    id: 'res-int-001',
    directiveId: 'dir-int-001',
    subsidiary: 'zionx',
    action: 'build_wellness_app',
    outcome: { appId: 'app-123', status: 'published', downloads: 1500 },
    metrics: { mrrImpact: 800, strategicScore: 0.85, riskScore: 0.2 },
    completedAt: new Date('2026-01-16T14:00:00Z'),
    ...overrides,
  };
}


// ---------------------------------------------------------------------------
// Integration Test: Full Directive Enrichment Flow
// Validates: Requirement 29a.1
// ---------------------------------------------------------------------------

describe('Eretz Integration: Full Directive Enrichment Flow', () => {
  it('should enrich directive from Seraphim, deliver to subsidiary, verify result, and report back', async () => {
    const eventBus = createMockEventBus();
    const mockPortfolio = createMockPortfolioProvider();
    const mockPatterns = createMockPatternLibraryInterface();
    const mockSynergy = createMockSynergyEngine();

    // Step 1: Seraphim sends directive to Eretz for enrichment
    const enrichmentPipeline = new DirectiveEnrichmentPipeline(
      mockPortfolio,
      mockPatterns,
      mockSynergy,
      eventBus,
    );

    const directive = createSampleDirective();
    const enriched = await enrichmentPipeline.enrichDirective(directive);

    // Verify enrichment added business intelligence
    expect(enriched.enrichedBy).toBe('eretz');
    expect(enriched.enrichment.portfolioContext.mrr).toBe(5000);
    expect(enriched.enrichment.applicablePatterns.length).toBeGreaterThan(0);
    expect(enriched.enrichment.synergyOpportunities.length).toBeGreaterThan(0);
    expect(enriched.enrichment.qualityStandards.length).toBeGreaterThan(0);
    expect(enriched.enrichment.businessRationale).toBeTruthy();
    expect(enriched.enrichment.resourceGuidance.budgetAllocation).toBeGreaterThan(0);

    // Step 2: Subsidiary executes and returns result
    const subsidiaryResult = createSampleResult({ directiveId: enriched.id });

    // Step 3: Eretz verifies the result
    const verificationPipeline = new ResultVerificationPipeline(
      mockPatterns,
      mockSynergy,
      eventBus,
    );

    const verified = await verificationPipeline.verifyResult(subsidiaryResult);

    // Step 4: Verify the result is approved and feedback generated
    expect(verified.approved).toBe(true);
    expect(verified.verification.businessQualityScore).toBeGreaterThanOrEqual(0.6);
    expect(verified.verification.feedback.overallScore).toBeGreaterThan(0);
    expect(verified.verification.portfolioImpact).toBeDefined();

    // Step 5: Events published for both enrichment and verification
    const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = publishCalls.map((call) => call[0].type);
    expect(eventTypes).toContain('directive.enriched');
    expect(eventTypes).toContain('result.verified');
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Bypass Detection
// Validates: Requirement 29b.5
// ---------------------------------------------------------------------------

describe('Eretz Integration: Bypass Detection', () => {
  it('should intercept and reroute direct-to-subsidiary directives', async () => {
    const eventBus = createMockEventBus();
    const detector = new BypassDetector(eventBus);

    // Simulate a directive sent directly to subsidiary bypassing Eretz
    const bypassDirective = createSampleDirective({
      source: 'external_agent',
      target: 'zionx',
      payload: {},
    });

    const result = await detector.interceptBypass(bypassDirective);

    // Verify bypass was detected
    expect(result.intercepted).toBe(true);
    expect(result.reason).toContain('Bypass detected');

    // Verify event was published for XO Audit
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'bypass.detected',
        detail: expect.objectContaining({
          directiveId: bypassDirective.id,
          originalSource: 'external_agent',
          intendedTarget: 'zionx',
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: bypassDirective.id,
          timestamp: expect.any(Date),
        }),
      }),
    );
  });

  it('should intercept Seraphim Core directives not routed through Eretz', async () => {
    const eventBus = createMockEventBus();
    const detector = new BypassDetector(eventBus);

    const bypassDirective = createSampleDirective({
      source: 'seraphim_core',
      target: 'zxmg',
      payload: {}, // no routedThroughEretz flag
    });

    const result = await detector.interceptBypass(bypassDirective);

    expect(result.intercepted).toBe(true);
    expect(result.reason).toContain('must route through Eretz');
  });

  it('should allow properly routed directives through', async () => {
    const eventBus = createMockEventBus();
    const detector = new BypassDetector(eventBus);

    const properDirective = createSampleDirective({
      source: 'eretz',
      target: 'zionx',
    });

    const result = await detector.interceptBypass(properDirective);

    expect(result.intercepted).toBe(false);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Synergy Detection from Business Events
// Validates: Requirement 29b.5
// ---------------------------------------------------------------------------

describe('Eretz Integration: Synergy Detection', () => {
  it('should detect synergy from business event and submit activation plan', async () => {
    const eventBus = createMockEventBus();
    const zikaron = createMockZikaron();
    const recommendationQueue = createMockRecommendationQueue();

    const synergyEngine = new EretzSynergyEngineImpl({
      eventBus,
      zikaron,
      recommendationQueue,
    });

    // Simulate a business event: ZionX launches a new app
    const businessEvent: BusinessEvent = {
      type: 'app_launch',
      subsidiary: 'zionx',
      detail: { appName: 'wellness-tracker', category: 'health' },
      timestamp: new Date(),
    };

    // Step 1: Detect synergy from event
    const synergy = await synergyEngine.detectSynergy(businessEvent);

    expect(synergy).not.toBeNull();
    expect(synergy!.type).toBe('revenue');
    expect(synergy!.sourceSubsidiary).toBe('zionx');
    expect(synergy!.targetSubsidiary).toBe('zxmg');
    expect(synergy!.estimatedRevenueImpact).toBeGreaterThan(0);

    // Step 2: Create activation plan and submit to Recommendation Queue
    const plan = await synergyEngine.createActivationPlan(synergy!);

    expect(plan.status).toBe('submitted');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.estimatedRevenueImpact).toBe(synergy!.estimatedRevenueImpact);

    // Step 3: Verify recommendation was submitted to queue
    expect(recommendationQueue.submit).toHaveBeenCalled();

    // Step 4: Verify events were published
    const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = publishCalls.map((call) => call[0].type);
    expect(eventTypes).toContain('synergy.detected');
    expect(eventTypes).toContain('synergy.plan_created');
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Standing Rule Enforcement
// Validates: Requirement 29c.9
// ---------------------------------------------------------------------------

describe('Eretz Integration: Standing Rule Enforcement', () => {
  it('should detect non-compliance with standing rules', async () => {
    const eventBus = createMockEventBus();
    const zikaron = createMockZikaron();
    const recommendationQueue = createMockRecommendationQueue();

    const synergyEngine = new EretzSynergyEngineImpl({
      eventBus,
      zikaron,
      recommendationQueue,
    });

    // Add a standing rule: every ZXMG video must include ZionX app commercial
    const rule = await synergyEngine.addStandingRule({
      name: 'ZXMG-ZionX Cross-Promotion',
      description: 'Every ZXMG video must include ZionX app commercial',
      sourceSubsidiary: 'zxmg',
      targetSubsidiary: 'zionx',
      condition: 'video_published',
      action: 'include_zionx_commercial',
      createdBy: 'king',
      enabled: true,
    });

    expect(rule.id).toBeTruthy();

    // Simulate ZXMG publishing a video (triggering the rule condition)
    const violations = await synergyEngine.enforceStandingRules('zxmg', 'video_published');

    // Verify non-compliance detected
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].ruleId).toBe(rule.id);
    expect(violations[0].ruleName).toBe('ZXMG-ZionX Cross-Promotion');
    expect(violations[0].subsidiary).toBe('zxmg');

    // Verify violation event published
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'synergy.rule_violation',
        detail: expect.objectContaining({
          subsidiary: 'zxmg',
          violationCount: 1,
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: expect.any(String),
          timestamp: expect.any(Date),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Pattern Extraction and Recommendation
// Validates: Requirement 29c.9
// ---------------------------------------------------------------------------

describe('Eretz Integration: Pattern Extraction and Recommendation', () => {
  it('should extract pattern from successful outcome, store it, and recommend to different subsidiary', async () => {
    const eventBus = createMockEventBus();
    const zikaron = createMockZikaron();

    const patternLibrary = new EretzPatternLibraryImpl({
      eventBus,
      zikaron,
    });

    // Step 1: Extract pattern from successful ZionX outcome
    const source: PatternSource = {
      subsidiary: 'zionx',
      action: 'freemium_monetization',
      outcome: { conversionRate: 0.12, revenue: 5000 },
      metrics: { trialToPayRate: 0.12, avgRevenuePerUser: 15 },
      context: 'Freemium model with 7-day trial converted 12% of users to paid',
    };

    const pattern = await patternLibrary.extractPattern(source);

    // Verify pattern was extracted and stored
    expect(pattern.id).toBeTruthy();
    expect(pattern.sourceSubsidiary).toBe('zionx');
    expect(pattern.type).toBe('monetization');
    expect(pattern.confidence).toBeGreaterThan(0);
    expect(pattern.generalizedInsight).toContain('zionx');

    // Step 2: Verify pattern stored in Zikaron
    expect(zikaron.storeProcedural).toHaveBeenCalled();

    // Step 3: Recommend pattern to a different subsidiary (ZXMG)
    const recommendations = await patternLibrary.recommendPattern(
      'zxmg',
      'monetization strategy for content',
    );

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0].pattern.id).toBe(pattern.id);
    expect(recommendations[0].relevanceScore).toBeGreaterThan(0.3);
    expect(recommendations[0].adaptationGuidance).toContain('zionx');
    expect(recommendations[0].adaptationGuidance).toContain('zxmg');

    // Step 4: Verify events published
    const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = publishCalls.map((call) => call[0].type);
    expect(eventTypes).toContain('pattern.extracted');
    expect(eventTypes).toContain('pattern.recommended');
  });
});


// ---------------------------------------------------------------------------
// Integration Test: Portfolio Decline Alert and Escalation
// Validates: Requirement 29d.15
// ---------------------------------------------------------------------------

describe('Eretz Integration: Portfolio Decline Alert', () => {
  it('should detect decline, generate intervention plan, and escalate to Recommendation Queue', async () => {
    const eventBus = createMockEventBus();
    const recommendationQueue = createMockRecommendationQueue();

    const dashboard = new EretzPortfolioDashboardImpl({
      eventBus,
      recommendationQueue,
    });

    // Set up subsidiary data with a declining subsidiary
    const decliningData: SubsidiaryData = {
      subsidiary: 'zxmg',
      mrr: 3000,
      previousMrr: 4000, // 25% decline
      cac: 80,
      ltv: 400,
      arpu: 12,
      churn: 8, // above 5% threshold
      marketingSpend: 5000,
      roas: 0.6, // below 1.0 threshold
      revenue: 3000,
    };

    dashboard.updateSubsidiaryData(decliningData);

    // Check for decline alerts
    const alerts = await dashboard.checkDeclineAlerts();

    // Verify alerts generated for multiple declining metrics
    expect(alerts.length).toBeGreaterThan(0);

    // Verify MRR decline alert
    const mrrAlert = alerts.find((a) => a.metric === 'mrr');
    expect(mrrAlert).toBeDefined();
    expect(mrrAlert!.subsidiary).toBe('zxmg');
    expect(mrrAlert!.severity).toBe('critical'); // >20% decline
    expect(mrrAlert!.interventionPlan).toBeTruthy();

    // Verify churn alert
    const churnAlert = alerts.find((a) => a.metric === 'churn');
    expect(churnAlert).toBeDefined();
    expect(churnAlert!.currentValue).toBe(8);

    // Verify ROAS alert
    const roasAlert = alerts.find((a) => a.metric === 'roas');
    expect(roasAlert).toBeDefined();
    expect(roasAlert!.currentValue).toBe(0.6);

    // Verify recommendations submitted to queue (one per alert)
    expect(recommendationQueue.submit).toHaveBeenCalledTimes(alerts.length);

    // Verify each alert has a recommendation ID
    for (const alert of alerts) {
      expect(alert.recommendationId).toBeTruthy();
    }

    // Verify decline event published
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'portfolio.decline_alerts',
        detail: expect.objectContaining({
          alertCount: alerts.length,
          affectedSubsidiaries: ['zxmg'],
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: expect.any(String),
          timestamp: expect.any(Date),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Training Cascade
// Validates: Requirement 29e.17
// ---------------------------------------------------------------------------

describe('Eretz Integration: Training Cascade', () => {
  it('should enrich directive with training context, evaluate output, and store feedback', async () => {
    const eventBus = createMockEventBus();
    const zikaron = createMockZikaron();
    const mockPortfolio = createMockPortfolioProvider();
    const mockPatterns = createMockPatternLibraryInterface();

    const profileService = new DomainExpertiseProfileService({
      tenantId: 'house-of-zion',
      zikaronService: zikaron,
    });

    const trainingCascade = new TrainingCascadeImpl({
      eventBus,
      profileService,
      portfolioProvider: mockPortfolio,
      patternLibrary: mockPatterns,
    });

    // Step 1: Add training context to directive
    const directive = createSampleDirective();
    const trainingContext = await trainingCascade.addTrainingContext(directive, 'zionx');

    expect(trainingContext.businessRationale).toBeTruthy();
    expect(trainingContext.expectedOutcomes.length).toBeGreaterThan(0);
    expect(trainingContext.qualityStandards.length).toBeGreaterThan(0);
    expect(trainingContext.portfolioFit).toBeTruthy();
    expect(trainingContext.learningObjectives.length).toBeGreaterThan(0);

    // Step 2: Subsidiary produces output
    const subsidiaryResult = createSampleResult();

    // Step 3: Evaluate business quality
    const evaluation = await trainingCascade.evaluateBusinessQuality(subsidiaryResult);

    expect(evaluation.overallScore).toBeGreaterThan(0);
    expect(evaluation.dimensions.businessAlignment).toBeGreaterThan(0);
    expect(evaluation.dimensions.qualityStandards).toBeGreaterThan(0);
    expect(evaluation.approved).toBe(true);

    // Step 4: Generate structured feedback
    const feedback = trainingCascade.generateFeedback(evaluation);

    expect(feedback.overallScore).toBe(evaluation.overallScore);
    expect(feedback.dimensions).toEqual(evaluation.dimensions);

    // Step 5: Store feedback in expertise profile
    // Create a mock profile for storage
    const mockProfile = {
      agentId: 'agent-zionx',
      domain: 'app-development',
      version: 1,
      lastUpdated: new Date(),
      knowledgeBase: [],
      decisionFrameworks: [],
      qualityBenchmarks: [],
      competitiveIntelligence: [],
      industryBestPractices: [],
      learnedPatterns: [],
      researchBacklog: [],
      knowledgeGaps: [],
    };

    await trainingCascade.storeFeedback(feedback, 'zionx', mockProfile as any);

    // Verify feedback storage event published
    const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = publishCalls.map((call) => call[0].type);
    expect(eventTypes).toContain('training.context.added');
    expect(eventTypes).toContain('training.quality.evaluated');
    expect(eventTypes).toContain('training.feedback.stored');
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Heartbeat Review
// Validates: Requirement 29g.24
// ---------------------------------------------------------------------------

describe('Eretz Integration: Heartbeat Review', () => {
  it('should produce portfolio-level recommendations in correct format', async () => {
    const otzar = createMockOtzar();
    const recommendationQueue = createMockRecommendationQueue();
    const researchDriver = createMockResearchDriver();

    // Create a profile service with a mock that returns a rich profile
    const mockProfileService = {
      loadProfile: vi.fn().mockResolvedValue({
        agentId: 'agent-eretz',
        domain: 'business-orchestration',
        version: 3,
        lastUpdated: new Date(),
        knowledgeBase: [
          {
            id: 'kb-1',
            topic: 'Portfolio Management',
            content: 'Manage business subsidiaries for optimal performance',
            source: 'internal',
            confidence: 0.9,
            lastVerified: new Date(),
            tags: ['portfolio', 'management'],
          },
        ],
        competitiveIntelligence: [],
        decisionFrameworks: [
          {
            name: 'Portfolio Allocation',
            description: 'Allocate resources across subsidiaries based on performance',
            inputs: ['mrr', 'growth_rate', 'market_position'],
            decisionTree: [],
            historicalAccuracy: 0.82,
            lastCalibrated: new Date(),
          },
        ],
        qualityBenchmarks: [
          {
            metric: 'portfolio_synergy_revenue_share',
            current: 5,
            worldClass: 20,
            unit: 'percent',
            source: 'BCG Conglomerate Report',
            lastUpdated: new Date(),
          },
          {
            metric: 'subsidiary_autonomy_score',
            current: 60,
            worldClass: 85,
            unit: 'percent',
            source: 'McKinsey Operating Model',
            lastUpdated: new Date(),
          },
        ],
        industryBestPractices: [],
        learnedPatterns: [],
        lastResearchCycle: null,
        researchBacklog: [],
        knowledgeGaps: ['cross-subsidiary data sharing'],
        conflicts: [],
      }),
      updateProfile: vi.fn().mockResolvedValue(undefined),
      createProfile: vi.fn().mockResolvedValue(undefined),
    } as unknown as DomainExpertiseProfileService;

    const heartbeatScheduler = new HeartbeatScheduler({
      tenantId: 'house-of-zion',
      profileService: mockProfileService,
      otzarService: otzar,
      recommendationQueue,
      researchDrivers: { 'agent-eretz': researchDriver },
    });

    // Configure Eretz heartbeat
    await heartbeatScheduler.configure('agent-eretz');

    // Trigger heartbeat review
    const result = await heartbeatScheduler.triggerReview('agent-eretz');

    // Verify review result structure
    expect(result.agentId).toBe('agent-eretz');
    expect(result.domain).toBe('business-orchestration');
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // Verify gap analysis was performed
    expect(result.gapAnalysis.length).toBeGreaterThan(0);
    const synergyGap = result.gapAnalysis.find(
      (g) => g.metric === 'portfolio_synergy_revenue_share',
    );
    expect(synergyGap).toBeDefined();
    expect(synergyGap!.gapPercentage).toBeGreaterThan(0);

    // Verify recommendations generated in correct format
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const rec of result.recommendations) {
      expect(rec.agentId).toBe('agent-eretz');
      expect(rec.domain).toBe('business-orchestration');
      expect(rec.priority).toBeGreaterThan(0);
      expect(rec.worldClassBenchmark).toBeDefined();
      expect(rec.currentState).toBeDefined();
      expect(rec.gapAnalysis).toBeDefined();
      expect(rec.actionPlan).toBeDefined();
      expect(rec.actionPlan.steps.length).toBeGreaterThan(0);
      expect(rec.riskAssessment).toBeDefined();
      expect(rec.rollbackPlan).toBeTruthy();
      expect(rec.status).toBe('pending');
    }

    // Verify recommendations submitted to queue
    expect(recommendationQueue.submit).toHaveBeenCalledTimes(result.recommendations.length);
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Kiro Steering File Generation
// Validates: Requirement 29g.24
// ---------------------------------------------------------------------------

describe('Eretz Integration: Kiro Steering File Generation', () => {
  it('should generate eretz-expertise steering file and skill definition', async () => {
    const eventBus = createMockEventBus();

    // Create a profile service mock that returns a rich profile
    const mockProfileService = {
      loadProfile: vi.fn().mockResolvedValue({
        agentId: 'agent-eretz',
        domain: 'business-orchestration',
        version: 2,
        lastUpdated: new Date(),
        knowledgeBase: [
          {
            id: 'kb-1',
            topic: 'Conglomerate Strategy',
            content: 'BCG matrix for portfolio allocation',
            source: 'bcg-research',
            confidence: 0.93,
            lastVerified: new Date(),
            tags: ['conglomerate-strategy', 'technology'],
          },
          {
            id: 'kb-2',
            topic: 'Cross-Business Synergies',
            content: 'Revenue synergies between subsidiaries',
            source: 'internal-analysis',
            confidence: 0.88,
            lastVerified: new Date(),
            tags: ['synergy', 'revenue', 'technology'],
          },
        ],
        competitiveIntelligence: [],
        decisionFrameworks: [
          {
            name: 'Portfolio Allocation Framework',
            description: 'Allocate resources based on BCG matrix position',
            inputs: ['market_share', 'growth_rate', 'profitability'],
            decisionTree: [],
            historicalAccuracy: 0.85,
            lastCalibrated: new Date(),
          },
        ],
        qualityBenchmarks: [
          {
            metric: 'synergy_revenue_share',
            current: 8,
            worldClass: 22,
            unit: 'percent',
            source: 'BCG Report 2025',
            lastUpdated: new Date(),
          },
        ],
        industryBestPractices: [
          {
            id: 'bp-1',
            title: 'Regular Portfolio Reviews',
            description: 'Conduct weekly portfolio reviews with subsidiary metrics',
            domain: 'business-orchestration',
            source: 'operational-excellence',
            confidence: 0.9,
            tags: ['portfolio', 'review'],
          },
        ],
        learnedPatterns: [],
        lastResearchCycle: null,
        researchBacklog: [],
        knowledgeGaps: [],
        conflicts: [],
      }),
      updateProfile: vi.fn().mockResolvedValue(undefined),
      createProfile: vi.fn().mockResolvedValue(undefined),
    } as unknown as DomainExpertiseProfileService;

    const kiroService = new KiroIntegrationServiceImpl({
      tenantId: 'house-of-zion',
      eventBus,
      profileService: mockProfileService,
      getCapabilityMaturity: vi.fn().mockResolvedValue({
        overall: 0.6,
        targetVision: 'Fully autonomous business orchestration',
        estimatedTimeToTarget: '12 months',
        byDomain: { 'business-orchestration': 0.55 },
        byCapability: {
          'portfolio-management': { current: 0.6, target: 0.95, trend: 'improving' },
        },
      }),
    });

    // Generate steering file for Eretz
    const steeringFile = await kiroService.generateSteeringFile('agent-eretz');

    expect(steeringFile.path).toBe('.kiro/steering/business-orchestration-expertise.md');
    expect(steeringFile.sourceAgentId).toBe('agent-eretz');
    expect(steeringFile.content).toContain('Business Orchestration');
    expect(steeringFile.content).toContain('Domain Overview');
    expect(steeringFile.content).toContain('Current State');
    expect(steeringFile.content).toContain('Decision Frameworks');
    expect(steeringFile.content).toContain('Portfolio Allocation Framework');
    expect(steeringFile.content).toContain('Best Practices');
    expect(steeringFile.content).toContain('Quality Standards');
    expect(steeringFile.content).toContain('synergy_revenue_share');

    // Generate skill definition for Eretz
    const skill = await kiroService.generateSkillDefinition('agent-eretz');

    expect(skill.name).toBe('business-orchestration-sme');
    expect(skill.description).toContain('Business Orchestration');
    expect(skill.expertise.length).toBeGreaterThan(0);
    expect(skill.activationTriggers.length).toBeGreaterThan(0);
    expect(skill.content).toContain('Business Orchestration');
    expect(skill.content).toContain('Decision Frameworks');
    expect(skill.content).toContain('Portfolio Allocation Framework');

    // Verify events published
    const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = publishCalls.map((call) => call[0].type);
    expect(eventTypes).toContain('kiro.steering.generated');
    expect(eventTypes).toContain('kiro.skill.generated');
  });
});
