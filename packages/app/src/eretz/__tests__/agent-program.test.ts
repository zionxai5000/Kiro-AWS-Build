/**
 * Unit tests for Eretz Business Pillar Agent Program
 *
 * Validates: Requirements 29a.1, 29a.2, 29a.3, 29a.4, 19.1
 *
 * Tests directive enrichment pipeline, result verification pipeline,
 * bypass detection, and state machine transitions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ERETZ_AGENT_PROGRAM,
  ERETZ_STATE_MACHINE,
  ERETZ_COMPLETION_CONTRACTS,
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

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockPortfolioProvider(context?: Partial<PortfolioContext>): PortfolioProvider {
  return {
    getSubsidiaryContext: vi.fn().mockResolvedValue({
      subsidiaryId: 'zionx',
      mrr: 2400,
      topProducts: ['wellness-app', 'finance-tracker'],
      gaps: ['no subscription tier'],
      recentPerformance: 'steady growth',
      ...context,
    }),
  };
}

function createMockPatternLibrary(patterns?: PatternMatch[]): PatternLibrary {
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

function createMockEventBus(): EventBusPublisher {
  return {
    publish: vi.fn().mockResolvedValue('event-id-1'),
  };
}

function createSampleDirective(overrides?: Partial<Directive>): Directive {
  return {
    id: 'dir-001',
    source: 'seraphim_core',
    target: 'zionx',
    action: 'build_wellness_app',
    payload: { category: 'health', monetization: 'freemium' },
    priority: 7,
    timestamp: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

function createSampleResult(overrides?: Partial<SubsidiaryResult>): SubsidiaryResult {
  return {
    id: 'res-001',
    directiveId: 'dir-001',
    subsidiary: 'zionx',
    action: 'build_wellness_app',
    outcome: { appId: 'app-123', status: 'published', downloads: 150 },
    metrics: { mrrImpact: 500, strategicScore: 0.8, riskScore: 0.3 },
    completedAt: new Date('2026-01-16T14:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const findTransition = (from: string, to: string) =>
  ERETZ_STATE_MACHINE.transitions.find((t) => t.from === from && t.to === to);

// ---------------------------------------------------------------------------
// Agent Program & State Machine Tests
// ---------------------------------------------------------------------------

describe('Eretz Agent Program', () => {
  it('should have a valid agent program definition', () => {
    expect(ERETZ_AGENT_PROGRAM.id).toBe('eretz-business-pillar');
    expect(ERETZ_AGENT_PROGRAM.pillar).toBe('eretz');
    expect(ERETZ_AGENT_PROGRAM.authorityLevel).toBe('L3');
    expect(ERETZ_AGENT_PROGRAM.name).toBe('Eretz Business Pillar');
  });

  it('should define all business orchestration states', () => {
    const states = Object.keys(ERETZ_STATE_MACHINE.states);
    expect(states).toContain('initializing');
    expect(states).toContain('ready');
    expect(states).toContain('enriching_directive');
    expect(states).toContain('analyzing_synergies');
    expect(states).toContain('reviewing_portfolio');
    expect(states).toContain('training_subsidiary');
    expect(states).toContain('heartbeat_review');
    expect(states).toContain('degraded');
    expect(states).toContain('terminated');
  });

  it('should have initializing as initial state', () => {
    expect(ERETZ_STATE_MACHINE.initialState).toBe('initializing');
  });

  it('should have terminated as the only terminal state', () => {
    expect(ERETZ_STATE_MACHINE.terminalStates).toEqual(['terminated']);
  });

  it('should have completion contracts', () => {
    expect(ERETZ_COMPLETION_CONTRACTS.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// State Machine Transition Tests
// ---------------------------------------------------------------------------

describe('Eretz State Machine Transitions', () => {
  it('should transition initializing → ready on initialization_complete', () => {
    const t = findTransition('initializing', 'ready');
    expect(t).toBeDefined();
    expect(t!.event).toBe('initialization_complete');
  });

  it('should transition ready → enriching_directive on directive_received', () => {
    const t = findTransition('ready', 'enriching_directive');
    expect(t).toBeDefined();
    expect(t!.event).toBe('directive_received');
  });

  it('should transition enriching_directive → ready on directive_forwarded', () => {
    const t = findTransition('enriching_directive', 'ready');
    expect(t).toBeDefined();
    expect(t!.event).toBe('directive_forwarded');
  });

  it('should transition ready → analyzing_synergies on synergy_scan_triggered', () => {
    const t = findTransition('ready', 'analyzing_synergies');
    expect(t).toBeDefined();
    expect(t!.event).toBe('synergy_scan_triggered');
  });

  it('should transition analyzing_synergies → ready on synergy_analysis_complete', () => {
    const t = findTransition('analyzing_synergies', 'ready');
    expect(t).toBeDefined();
    expect(t!.event).toBe('synergy_analysis_complete');
  });

  it('should transition ready → reviewing_portfolio on portfolio_review_triggered', () => {
    const t = findTransition('ready', 'reviewing_portfolio');
    expect(t).toBeDefined();
    expect(t!.event).toBe('portfolio_review_triggered');
  });

  it('should transition reviewing_portfolio → ready on portfolio_review_complete', () => {
    const t = findTransition('reviewing_portfolio', 'ready');
    expect(t).toBeDefined();
    expect(t!.event).toBe('portfolio_review_complete');
  });

  it('should transition ready → training_subsidiary on output_received', () => {
    const t = findTransition('ready', 'training_subsidiary');
    expect(t).toBeDefined();
    expect(t!.event).toBe('output_received');
  });

  it('should transition training_subsidiary → ready on feedback_delivered', () => {
    const t = findTransition('training_subsidiary', 'ready');
    expect(t).toBeDefined();
    expect(t!.event).toBe('feedback_delivered');
  });

  it('should transition ready → heartbeat_review on heartbeat_triggered', () => {
    const t = findTransition('ready', 'heartbeat_review');
    expect(t).toBeDefined();
    expect(t!.event).toBe('heartbeat_triggered');
  });

  it('should transition heartbeat_review → ready on heartbeat_complete', () => {
    const t = findTransition('heartbeat_review', 'ready');
    expect(t).toBeDefined();
    expect(t!.event).toBe('heartbeat_complete');
  });

  it('should transition ready → degraded on error_detected', () => {
    const t = findTransition('ready', 'degraded');
    expect(t).toBeDefined();
    expect(t!.event).toBe('error_detected');
  });

  it('should transition degraded → ready on recovery_complete', () => {
    const t = findTransition('degraded', 'ready');
    expect(t).toBeDefined();
    expect(t!.event).toBe('recovery_complete');
  });

  it('should transition ready → terminated on terminate with approval gate', () => {
    const t = findTransition('ready', 'terminated');
    expect(t).toBeDefined();
    expect(t!.event).toBe('terminate');
    expect(t!.gates.length).toBeGreaterThan(0);
    expect(t!.gates[0].type).toBe('approval');
  });
});

// ---------------------------------------------------------------------------
// Directive Enrichment Pipeline Tests
// ---------------------------------------------------------------------------

describe('DirectiveEnrichmentPipeline', () => {
  let pipeline: DirectiveEnrichmentPipeline;
  let mockPortfolio: PortfolioProvider;
  let mockPatterns: PatternLibrary;
  let mockSynergy: SynergyEngine;
  let mockEventBus: EventBusPublisher;

  beforeEach(() => {
    mockPortfolio = createMockPortfolioProvider();
    mockPatterns = createMockPatternLibrary();
    mockSynergy = createMockSynergyEngine();
    mockEventBus = createMockEventBus();
    pipeline = new DirectiveEnrichmentPipeline(mockPortfolio, mockPatterns, mockSynergy, mockEventBus);
  });

  it('should enrich directive with portfolio context', async () => {
    const directive = createSampleDirective();
    const enriched = await pipeline.enrichDirective(directive);

    expect(enriched.enrichment.portfolioContext).toBeDefined();
    expect(enriched.enrichment.portfolioContext.subsidiaryId).toBe('zionx');
    expect(enriched.enrichment.portfolioContext.mrr).toBe(2400);
    expect(enriched.enrichment.portfolioContext.topProducts).toContain('wellness-app');
  });

  it('should enrich directive with applicable patterns', async () => {
    const directive = createSampleDirective();
    const enriched = await pipeline.enrichDirective(directive);

    expect(enriched.enrichment.applicablePatterns).toBeDefined();
    expect(enriched.enrichment.applicablePatterns.length).toBeGreaterThan(0);
    expect(enriched.enrichment.applicablePatterns[0].name).toBe('freemium_with_trial');
    expect(enriched.enrichment.applicablePatterns[0].confidence).toBe(0.87);
  });

  it('should enrich directive with synergy opportunities', async () => {
    const directive = createSampleDirective();
    const enriched = await pipeline.enrichDirective(directive);

    expect(enriched.enrichment.synergyOpportunities).toBeDefined();
    expect(enriched.enrichment.synergyOpportunities.length).toBeGreaterThan(0);
    expect(enriched.enrichment.synergyOpportunities[0].type).toBe('revenue');
    expect(enriched.enrichment.synergyOpportunities[0].estimatedRevenueImpact).toBe(200);
  });

  it('should enrich directive with training context', async () => {
    const directive = createSampleDirective();
    const enriched = await pipeline.enrichDirective(directive);

    expect(enriched.enrichment.trainingContext).toBeDefined();
    expect(enriched.enrichment.trainingContext.length).toBeGreaterThan(0);
    expect(enriched.enrichment.trainingContext).toContain('$2400/mo');
  });

  it('should enrich directive with quality standards', async () => {
    const directive = createSampleDirective();
    const enriched = await pipeline.enrichDirective(directive);

    expect(enriched.enrichment.qualityStandards).toBeDefined();
    expect(enriched.enrichment.qualityStandards.length).toBeGreaterThan(0);
    expect(enriched.enrichment.qualityStandards[0].threshold).toBeGreaterThan(0);
  });

  it('should enrich directive with business rationale', async () => {
    const directive = createSampleDirective();
    const enriched = await pipeline.enrichDirective(directive);

    expect(enriched.enrichment.businessRationale).toBeDefined();
    expect(enriched.enrichment.businessRationale).toContain('zionx');
  });

  it('should enrich directive with resource guidance', async () => {
    const directive = createSampleDirective();
    const enriched = await pipeline.enrichDirective(directive);

    expect(enriched.enrichment.resourceGuidance).toBeDefined();
    expect(enriched.enrichment.resourceGuidance.budgetAllocation).toBeGreaterThan(0);
    expect(enriched.enrichment.resourceGuidance.priorityLevel).toBe('high');
  });

  it('should mark enrichment as from eretz', async () => {
    const directive = createSampleDirective();
    const enriched = await pipeline.enrichDirective(directive);

    expect(enriched.enrichedBy).toBe('eretz');
    expect(enriched.enrichedAt).toBeInstanceOf(Date);
  });

  it('should publish directive.enriched event', async () => {
    const directive = createSampleDirective();
    await pipeline.enrichDirective(directive);

    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'directive.enriched',
        detail: expect.objectContaining({
          directiveId: 'dir-001',
          target: 'zionx',
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: 'dir-001',
        }),
      }),
    );
  });

  it('should call portfolio provider with correct subsidiary', async () => {
    const directive = createSampleDirective({ target: 'zxmg' });
    await pipeline.enrichDirective(directive);

    expect(mockPortfolio.getSubsidiaryContext).toHaveBeenCalledWith('zxmg');
  });

  it('should call pattern library with target and action', async () => {
    const directive = createSampleDirective({ target: 'zxmg', action: 'create_video' });
    await pipeline.enrichDirective(directive);

    expect(mockPatterns.findApplicablePatterns).toHaveBeenCalledWith('zxmg', 'create_video');
  });

  it('should handle empty patterns gracefully', async () => {
    mockPatterns = createMockPatternLibrary([]);
    pipeline = new DirectiveEnrichmentPipeline(mockPortfolio, mockPatterns, mockSynergy, mockEventBus);

    const directive = createSampleDirective();
    const enriched = await pipeline.enrichDirective(directive);

    expect(enriched.enrichment.applicablePatterns).toEqual([]);
  });

  it('should handle empty synergies gracefully', async () => {
    mockSynergy = createMockSynergyEngine([]);
    pipeline = new DirectiveEnrichmentPipeline(mockPortfolio, mockPatterns, mockSynergy, mockEventBus);

    const directive = createSampleDirective();
    const enriched = await pipeline.enrichDirective(directive);

    expect(enriched.enrichment.synergyOpportunities).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Result Verification Pipeline Tests
// ---------------------------------------------------------------------------

describe('ResultVerificationPipeline', () => {
  let pipeline: ResultVerificationPipeline;
  let mockPatterns: PatternLibrary;
  let mockSynergy: SynergyEngine;
  let mockEventBus: EventBusPublisher;

  beforeEach(() => {
    mockPatterns = createMockPatternLibrary();
    mockSynergy = createMockSynergyEngine();
    mockEventBus = createMockEventBus();
    pipeline = new ResultVerificationPipeline(mockPatterns, mockSynergy, mockEventBus);
  });

  it('should evaluate business quality and produce a score', async () => {
    const result = createSampleResult();
    const verified = await pipeline.verifyResult(result);

    expect(verified.verification.businessQualityScore).toBeGreaterThan(0);
    expect(verified.verification.businessQualityScore).toBeLessThanOrEqual(1.0);
  });

  it('should approve results with good quality', async () => {
    const result = createSampleResult();
    const verified = await pipeline.verifyResult(result);

    expect(verified.approved).toBe(true);
    expect(verified.verification.businessQualityScore).toBeGreaterThanOrEqual(0.6);
  });

  it('should reject results with poor quality', async () => {
    const result = createSampleResult({
      outcome: {},
      metrics: {},
    });
    const verified = await pipeline.verifyResult(result);

    expect(verified.approved).toBe(false);
    expect(verified.verification.qualityIssues.length).toBeGreaterThan(0);
  });

  it('should generate structured feedback', async () => {
    const result = createSampleResult();
    const verified = await pipeline.verifyResult(result);

    const feedback = verified.verification.feedback;
    expect(feedback).toBeDefined();
    expect(feedback.overallScore).toBeGreaterThan(0);
    expect(feedback.dimensions).toBeDefined();
    expect(feedback.dimensions.businessAlignment).toBeDefined();
    expect(feedback.dimensions.qualityStandards).toBeDefined();
    expect(feedback.dimensions.synergyAwareness).toBeDefined();
    expect(feedback.dimensions.patternCompliance).toBeDefined();
    expect(feedback.dimensions.metricAwareness).toBeDefined();
  });

  it('should assess pattern compliance', async () => {
    const result = createSampleResult();
    const verified = await pipeline.verifyResult(result);

    expect(verified.verification.patternComplianceScore).toBeGreaterThan(0);
    expect(verified.verification.patternComplianceScore).toBeLessThanOrEqual(1.0);
  });

  it('should assess synergy activation status', async () => {
    const result = createSampleResult();
    const verified = await pipeline.verifyResult(result);

    expect(verified.verification.synergyActivationStatus).toBeDefined();
    expect(verified.verification.synergyActivationStatus.length).toBeGreaterThan(0);
    expect(verified.verification.synergyActivationStatus[0]).toHaveProperty('synergyId');
    expect(verified.verification.synergyActivationStatus[0]).toHaveProperty('activated');
  });

  it('should assess portfolio impact', async () => {
    const result = createSampleResult();
    const verified = await pipeline.verifyResult(result);

    expect(verified.verification.portfolioImpact).toBeDefined();
    expect(verified.verification.portfolioImpact.mrrChange).toBe(500);
    expect(verified.verification.portfolioImpact.strategicAlignment).toBe(0.8);
    expect(verified.verification.portfolioImpact.riskLevel).toBe('low');
  });

  it('should publish result.verified event', async () => {
    const result = createSampleResult();
    await pipeline.verifyResult(result);

    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'result.verified',
        detail: expect.objectContaining({
          resultId: 'res-001',
          directiveId: 'dir-001',
          subsidiary: 'zionx',
          approved: true,
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: 'dir-001',
        }),
      }),
    );
  });

  it('should include remediation items when not approved', async () => {
    const result = createSampleResult({ outcome: {}, metrics: {} });
    const verified = await pipeline.verifyResult(result);

    expect(verified.approved).toBe(false);
    expect(verified.remediationRequired).toBeDefined();
    expect(verified.remediationRequired!.length).toBeGreaterThan(0);
  });

  it('should provide feedback strengths for high-quality results', async () => {
    const result = createSampleResult();
    const verified = await pipeline.verifyResult(result);

    expect(verified.verification.feedback.strengths.length).toBeGreaterThan(0);
  });

  it('should provide improvement suggestions for low-quality results', async () => {
    const result = createSampleResult({ outcome: {}, metrics: {} });
    const verified = await pipeline.verifyResult(result);

    const feedback = verified.verification.feedback;
    const hasImprovements = feedback.improvements.length > 0 || feedback.recommendations.length > 0;
    expect(hasImprovements).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bypass Detection Tests
// ---------------------------------------------------------------------------

describe('BypassDetector', () => {
  let detector: BypassDetector;
  let mockEventBus: EventBusPublisher;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    detector = new BypassDetector(mockEventBus);
  });

  it('should intercept directives sent directly to subsidiary from unknown source', async () => {
    const directive = createSampleDirective({
      source: 'unknown_agent',
      target: 'zionx',
    });

    const result = await detector.interceptBypass(directive);

    expect(result.intercepted).toBe(true);
    expect(result.reason).toContain('Bypass detected');
  });

  it('should intercept directives from seraphim_core not routed through eretz', async () => {
    const directive = createSampleDirective({
      source: 'seraphim_core',
      target: 'zxmg',
      payload: {},
    });

    const result = await detector.interceptBypass(directive);

    expect(result.intercepted).toBe(true);
    expect(result.reason).toContain('must route through Eretz');
  });

  it('should not intercept directives already routed through eretz', async () => {
    const directive = createSampleDirective({
      source: 'seraphim_core',
      target: 'zionx',
      payload: { routedThroughEretz: true },
    });

    const result = await detector.interceptBypass(directive);

    expect(result.intercepted).toBe(false);
  });

  it('should not intercept directives from eretz itself', async () => {
    const directive = createSampleDirective({
      source: 'eretz',
      target: 'zionx',
    });

    const result = await detector.interceptBypass(directive);

    expect(result.intercepted).toBe(false);
  });

  it('should log bypass attempt to event bus (XO Audit)', async () => {
    const directive = createSampleDirective({
      source: 'rogue_agent',
      target: 'zion_alpha',
    });

    await detector.interceptBypass(directive);

    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'eretz',
        type: 'bypass.detected',
        detail: expect.objectContaining({
          directiveId: 'dir-001',
          originalSource: 'rogue_agent',
          intendedTarget: 'zion_alpha',
        }),
        metadata: expect.objectContaining({
          tenantId: 'house-of-zion',
          correlationId: 'dir-001',
        }),
      }),
    );
  });

  it('should not publish event when no bypass detected', async () => {
    const directive = createSampleDirective({
      source: 'eretz',
      target: 'zionx',
    });

    await detector.interceptBypass(directive);

    expect(mockEventBus.publish).not.toHaveBeenCalled();
  });

  it('should detect bypass for all valid subsidiaries', async () => {
    for (const target of ['zionx', 'zxmg', 'zion_alpha']) {
      const directive = createSampleDirective({
        source: 'unauthorized_source',
        target,
      });

      const result = await detector.interceptBypass(directive);
      expect(result.intercepted).toBe(true);
    }
  });

  it('should not intercept directives to non-subsidiary targets', async () => {
    const directive = createSampleDirective({
      source: 'some_agent',
      target: 'otzar',
    });

    const result = await detector.interceptBypass(directive);

    expect(result.intercepted).toBe(false);
  });
});
