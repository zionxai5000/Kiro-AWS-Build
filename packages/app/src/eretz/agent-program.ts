/**
 * Eretz Business Pillar — Agent Program Definition
 *
 * Defines the Eretz agent program with a state machine for the business
 * orchestration lifecycle: initializing → ready → enriching_directive →
 * analyzing_synergies → reviewing_portfolio → training_subsidiary →
 * heartbeat_review → degraded → terminated.
 *
 * Authority level L3 (peer verification for major resource decisions).
 *
 * Requirements: 29a.1, 29a.2, 29a.3, 29a.4
 */

import type {
  AgentProgram,
  StateMachineDefinition,
  CompletionContract,
  SystemEvent,
} from '@seraphim/core';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface Directive {
  id: string;
  source: string;
  target: string;
  action: string;
  payload: Record<string, unknown>;
  priority: number;
  timestamp: Date;
}

export interface PortfolioContext {
  subsidiaryId: string;
  mrr: number;
  topProducts: string[];
  gaps: string[];
  recentPerformance: string;
}

export interface PatternMatch {
  patternId: string;
  name: string;
  confidence: number;
  applicability: string;
}

export interface SynergyOpportunity {
  id: string;
  type: 'revenue' | 'operational' | 'strategic';
  sourceSubsidiary: string;
  targetSubsidiary: string;
  description: string;
  estimatedRevenueImpact: number;
  confidence: number;
}

export interface QualityStandard {
  id: string;
  name: string;
  threshold: number;
  description: string;
}

export interface ResourceGuidance {
  budgetAllocation: number;
  priorityLevel: string;
  timelineExpectation: string;
}

export interface EnrichedDirective extends Directive {
  enrichment: {
    portfolioContext: PortfolioContext;
    applicablePatterns: PatternMatch[];
    synergyOpportunities: SynergyOpportunity[];
    qualityStandards: QualityStandard[];
    businessRationale: string;
    trainingContext: string;
    resourceGuidance: ResourceGuidance;
  };
  enrichedBy: 'eretz';
  enrichedAt: Date;
}

export interface SubsidiaryResult {
  id: string;
  directiveId: string;
  subsidiary: string;
  action: string;
  outcome: Record<string, unknown>;
  metrics: Record<string, unknown>;
  completedAt: Date;
}

export interface StructuredFeedback {
  overallScore: number;
  dimensions: {
    businessAlignment: number;
    qualityStandards: number;
    synergyAwareness: number;
    patternCompliance: number;
    metricAwareness: number;
  };
  strengths: string[];
  improvements: string[];
  recommendations: string[];
}

export interface SynergyStatus {
  synergyId: string;
  activated: boolean;
  details: string;
}

export interface PortfolioImpact {
  mrrChange: number;
  strategicAlignment: number;
  riskLevel: string;
}

export interface VerifiedResult {
  originalResult: SubsidiaryResult;
  verification: {
    businessQualityScore: number;
    qualityIssues: string[];
    portfolioImpact: PortfolioImpact;
    synergyActivationStatus: SynergyStatus[];
    patternComplianceScore: number;
    feedback: StructuredFeedback;
  };
  approved: boolean;
  remediationRequired?: string[];
}

// ---------------------------------------------------------------------------
// Event Bus Interface (subset needed for Eretz)
// ---------------------------------------------------------------------------

export interface EventBusPublisher {
  publish(event: SystemEvent): Promise<string>;
}

// ---------------------------------------------------------------------------
// Eretz State Machine Definition
// ---------------------------------------------------------------------------

export const ERETZ_STATE_MACHINE: StateMachineDefinition = {
  id: 'eretz-business-pillar',
  name: 'Eretz Business Pillar Agent',
  version: '1.0.0',

  states: {
    initializing: {
      name: 'initializing',
      type: 'initial',
      onEnter: [{ type: 'log', config: { message: 'Eretz Business Pillar initializing' } }],
    },
    ready: {
      name: 'ready',
      type: 'active',
      onEnter: [{ type: 'log', config: { message: 'Eretz ready for business orchestration' } }],
    },
    enriching_directive: {
      name: 'enriching_directive',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Enriching directive with business context' } }],
      timeout: { duration: 30000, transitionTo: 'ready' },
    },
    analyzing_synergies: {
      name: 'analyzing_synergies',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Analyzing cross-business synergies' } }],
      timeout: { duration: 60000, transitionTo: 'ready' },
    },
    reviewing_portfolio: {
      name: 'reviewing_portfolio',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Reviewing portfolio metrics' } }],
      timeout: { duration: 60000, transitionTo: 'ready' },
    },
    training_subsidiary: {
      name: 'training_subsidiary',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Training subsidiary with feedback' } }],
      timeout: { duration: 30000, transitionTo: 'ready' },
    },
    heartbeat_review: {
      name: 'heartbeat_review',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Heartbeat review in progress' } }],
      timeout: { duration: 120000, transitionTo: 'ready' },
    },
    degraded: {
      name: 'degraded',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Eretz operating in degraded mode' } }],
    },
    terminated: {
      name: 'terminated',
      type: 'terminal',
      onEnter: [{ type: 'log', config: { message: 'Eretz terminated' } }],
    },
  },

  initialState: 'initializing',
  terminalStates: ['terminated'],

  transitions: [
    {
      from: 'initializing',
      to: 'ready',
      event: 'initialization_complete',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Eretz initialization complete' } }],
    },
    {
      from: 'ready',
      to: 'enriching_directive',
      event: 'directive_received',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Processing incoming directive' } }],
    },
    {
      from: 'enriching_directive',
      to: 'ready',
      event: 'directive_forwarded',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Enriched directive forwarded to subsidiary' } }],
    },
    {
      from: 'ready',
      to: 'analyzing_synergies',
      event: 'synergy_scan_triggered',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Synergy analysis started' } }],
    },
    {
      from: 'analyzing_synergies',
      to: 'ready',
      event: 'synergy_analysis_complete',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Synergy analysis complete' } }],
    },
    {
      from: 'ready',
      to: 'reviewing_portfolio',
      event: 'portfolio_review_triggered',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Portfolio review started' } }],
    },
    {
      from: 'reviewing_portfolio',
      to: 'ready',
      event: 'portfolio_review_complete',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Portfolio review complete' } }],
    },
    {
      from: 'ready',
      to: 'training_subsidiary',
      event: 'output_received',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Subsidiary output received for verification' } }],
    },
    {
      from: 'training_subsidiary',
      to: 'ready',
      event: 'feedback_delivered',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Feedback delivered to subsidiary' } }],
    },
    {
      from: 'ready',
      to: 'heartbeat_review',
      event: 'heartbeat_triggered',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Heartbeat review cycle started' } }],
    },
    {
      from: 'heartbeat_review',
      to: 'ready',
      event: 'heartbeat_complete',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Heartbeat review complete' } }],
    },
    {
      from: 'ready',
      to: 'degraded',
      event: 'error_detected',
      gates: [],
      actions: [{ type: 'notify', config: { message: 'Eretz entering degraded state' } }],
    },
    {
      from: 'degraded',
      to: 'ready',
      event: 'recovery_complete',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Eretz recovered from degraded state' } }],
    },
    {
      from: 'ready',
      to: 'terminated',
      event: 'terminate',
      gates: [
        {
          id: 'gate-terminate-approval',
          name: 'Termination Approval',
          type: 'approval',
          config: { requiresAuthorityLevel: 'L1' },
          required: true,
        },
      ],
      actions: [{ type: 'log', config: { message: 'Eretz terminated by authority' } }],
    },
  ],

  metadata: {
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-15T00:00:00Z'),
    description:
      'Eretz Business Pillar — master business orchestration agent managing ZionX, ZXMG, and Zion Alpha subsidiaries.',
  },
};

// ---------------------------------------------------------------------------
// Completion Contracts
// ---------------------------------------------------------------------------

export const ERETZ_COMPLETION_CONTRACTS: CompletionContract[] = [
  {
    id: 'eretz-directive-enrichment-complete',
    workflowType: 'directive-enrichment',
    version: '1.0.0',
    outputSchema: {
      type: 'object',
      required: ['enrichedDirective', 'target'],
      properties: {
        enrichedDirective: { type: 'object' },
        target: { type: 'string' },
        enrichmentDuration: { type: 'number' },
      },
    },
    verificationSteps: [
      {
        name: 'Enrichment completeness check',
        type: 'schema_validation',
        config: { requiresPortfolioContext: true, requiresPatterns: true },
        required: true,
        timeout: 10000,
      },
    ],
    description: 'Validates that directive enrichment produced complete business context.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'eretz-result-verification-complete',
    workflowType: 'result-verification',
    version: '1.0.0',
    outputSchema: {
      type: 'object',
      required: ['verifiedResult', 'approved'],
      properties: {
        verifiedResult: { type: 'object' },
        approved: { type: 'boolean' },
        feedback: { type: 'object' },
      },
    },
    verificationSteps: [
      {
        name: 'Quality score validation',
        type: 'schema_validation',
        config: { minimumQualityScore: 0.6 },
        required: true,
        timeout: 10000,
      },
    ],
    description: 'Validates that result verification produced quality assessment and feedback.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
];

// ---------------------------------------------------------------------------
// Directive Enrichment Pipeline
// ---------------------------------------------------------------------------

export interface PortfolioProvider {
  getSubsidiaryContext(subsidiaryId: string): Promise<PortfolioContext>;
}

export interface PatternLibrary {
  findApplicablePatterns(domain: string, action: string): Promise<PatternMatch[]>;
}

export interface SynergyEngine {
  checkSynergyOpportunities(subsidiary: string, action: string): Promise<SynergyOpportunity[]>;
}

export class DirectiveEnrichmentPipeline {
  constructor(
    private readonly portfolioProvider: PortfolioProvider,
    private readonly patternLibrary: PatternLibrary,
    private readonly synergyEngine: SynergyEngine,
    private readonly eventBus: EventBusPublisher,
  ) {}

  /**
   * Enrich a directive with business intelligence before forwarding to subsidiary.
   * Requirement 29a.2: Enrich with portfolio context, cross-business implications,
   * applicable patterns, and resource allocation guidance.
   */
  async enrichDirective(directive: Directive): Promise<EnrichedDirective> {
    const portfolioContext = await this.portfolioProvider.getSubsidiaryContext(directive.target);
    const applicablePatterns = await this.patternLibrary.findApplicablePatterns(
      directive.target,
      directive.action,
    );
    const synergyOpportunities = await this.synergyEngine.checkSynergyOpportunities(
      directive.target,
      directive.action,
    );

    const qualityStandards: QualityStandard[] = [
      {
        id: 'qs-business-alignment',
        name: 'Business Alignment',
        threshold: 0.7,
        description: 'Output must align with portfolio strategy',
      },
      {
        id: 'qs-quality-minimum',
        name: 'Quality Minimum',
        threshold: 0.6,
        description: 'Output must meet minimum quality bar',
      },
    ];

    const businessRationale = this.generateBusinessRationale(
      directive,
      portfolioContext,
      synergyOpportunities,
    );

    const trainingContext = this.generateTrainingContext(
      directive,
      portfolioContext,
      applicablePatterns,
    );

    const resourceGuidance: ResourceGuidance = {
      budgetAllocation: this.calculateBudgetAllocation(directive.priority, portfolioContext),
      priorityLevel: directive.priority >= 8 ? 'critical' : directive.priority >= 5 ? 'high' : 'normal',
      timelineExpectation: directive.priority >= 8 ? '24h' : '72h',
    };

    const enriched: EnrichedDirective = {
      ...directive,
      enrichment: {
        portfolioContext,
        applicablePatterns,
        synergyOpportunities,
        qualityStandards,
        businessRationale,
        trainingContext,
        resourceGuidance,
      },
      enrichedBy: 'eretz',
      enrichedAt: new Date(),
    };

    await this.eventBus.publish({
      source: 'eretz',
      type: 'directive.enriched',
      detail: {
        directiveId: directive.id,
        target: directive.target,
        patternsApplied: applicablePatterns.length,
        synergiesIdentified: synergyOpportunities.length,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: directive.id,
        timestamp: new Date(),
      },
    });

    return enriched;
  }

  private generateBusinessRationale(
    directive: Directive,
    context: PortfolioContext,
    synergies: SynergyOpportunity[],
  ): string {
    const parts: string[] = [
      `Directive "${directive.action}" targets ${directive.target} (MRR: $${context.mrr}).`,
    ];
    if (context.gaps.length > 0) {
      parts.push(`Known gaps: ${context.gaps.join(', ')}.`);
    }
    if (synergies.length > 0) {
      const totalImpact = synergies.reduce((sum, s) => sum + s.estimatedRevenueImpact, 0);
      parts.push(`${synergies.length} synergy opportunities identified (est. $${totalImpact}/mo impact).`);
    }
    return parts.join(' ');
  }

  private generateTrainingContext(
    directive: Directive,
    context: PortfolioContext,
    patterns: PatternMatch[],
  ): string {
    const parts: string[] = [
      `This directive matters because ${directive.target} contributes $${context.mrr}/mo to portfolio.`,
    ];
    if (patterns.length > 0) {
      parts.push(
        `Applicable patterns: ${patterns.map((p) => `${p.name} (${Math.round(p.confidence * 100)}% confidence)`).join(', ')}.`,
      );
    }
    parts.push(`Top products: ${context.topProducts.join(', ')}.`);
    return parts.join(' ');
  }

  private calculateBudgetAllocation(priority: number, context: PortfolioContext): number {
    const baseBudget = 1000;
    const priorityMultiplier = priority / 5;
    const performanceMultiplier = context.mrr > 5000 ? 1.5 : 1.0;
    return Math.round(baseBudget * priorityMultiplier * performanceMultiplier);
  }
}

// ---------------------------------------------------------------------------
// Result Verification Pipeline
// ---------------------------------------------------------------------------

export class ResultVerificationPipeline {
  constructor(
    private readonly patternLibrary: PatternLibrary,
    private readonly synergyEngine: SynergyEngine,
    private readonly eventBus: EventBusPublisher,
  ) {}

  /**
   * Verify subsidiary result against business standards.
   * Requirement 29a.3: Verify results, add portfolio-level context, forward enriched report.
   */
  async verifyResult(result: SubsidiaryResult): Promise<VerifiedResult> {
    const businessQualityScore = this.evaluateBusinessQuality(result);
    const qualityIssues = this.identifyQualityIssues(result, businessQualityScore);
    const patternComplianceScore = await this.assessPatternCompliance(result);
    const synergyActivationStatus = await this.assessSynergyActivation(result);
    const portfolioImpact = this.assessPortfolioImpact(result);
    const feedback = this.generateStructuredFeedback(
      businessQualityScore,
      patternComplianceScore,
      synergyActivationStatus,
      qualityIssues,
    );

    const approved = businessQualityScore >= 0.6 && qualityIssues.length === 0;

    const verified: VerifiedResult = {
      originalResult: result,
      verification: {
        businessQualityScore,
        qualityIssues,
        portfolioImpact,
        synergyActivationStatus,
        patternComplianceScore,
        feedback,
      },
      approved,
      remediationRequired: approved ? undefined : qualityIssues,
    };

    await this.eventBus.publish({
      source: 'eretz',
      type: 'result.verified',
      detail: {
        resultId: result.id,
        directiveId: result.directiveId,
        subsidiary: result.subsidiary,
        approved,
        businessQualityScore,
        patternComplianceScore,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: result.directiveId,
        timestamp: new Date(),
      },
    });

    return verified;
  }

  private evaluateBusinessQuality(result: SubsidiaryResult): number {
    let score = 0.5;

    // Check if outcome has expected fields
    if (result.outcome && Object.keys(result.outcome).length > 0) {
      score += 0.2;
    }

    // Check if metrics are reported
    if (result.metrics && Object.keys(result.metrics).length > 0) {
      score += 0.2;
    }

    // Check completion timeliness
    if (result.completedAt) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  private identifyQualityIssues(result: SubsidiaryResult, qualityScore: number): string[] {
    const issues: string[] = [];

    if (qualityScore < 0.6) {
      issues.push('Business quality score below minimum threshold (0.6)');
    }

    if (!result.outcome || Object.keys(result.outcome).length === 0) {
      issues.push('No outcome data provided');
    }

    if (!result.metrics || Object.keys(result.metrics).length === 0) {
      issues.push('No metrics reported');
    }

    return issues;
  }

  private async assessPatternCompliance(result: SubsidiaryResult): Promise<number> {
    const patterns = await this.patternLibrary.findApplicablePatterns(
      result.subsidiary,
      result.action,
    );

    if (patterns.length === 0) return 1.0;

    // Score based on whether outcome aligns with pattern expectations
    const hasOutcome = result.outcome && Object.keys(result.outcome).length > 0;
    const hasMetrics = result.metrics && Object.keys(result.metrics).length > 0;

    let compliance = 0.5;
    if (hasOutcome) compliance += 0.25;
    if (hasMetrics) compliance += 0.25;

    return compliance;
  }

  private async assessSynergyActivation(result: SubsidiaryResult): Promise<SynergyStatus[]> {
    const opportunities = await this.synergyEngine.checkSynergyOpportunities(
      result.subsidiary,
      result.action,
    );

    return opportunities.map((opp) => {
      const activated = opp.confidence > 0.7;
      return {
        synergyId: opp.id,
        activated,
        details: activated
          ? `Synergy "${opp.description}" activated`
          : `Synergy "${opp.description}" not yet activated`,
      };
    });
  }

  private assessPortfolioImpact(result: SubsidiaryResult): PortfolioImpact {
    const metrics = result.metrics as Record<string, number> | undefined;
    return {
      mrrChange: metrics?.['mrrImpact'] ?? 0,
      strategicAlignment: metrics?.['strategicScore'] ?? 0.7,
      riskLevel: metrics?.['riskScore'] && metrics['riskScore'] > 0.7 ? 'high' : 'low',
    };
  }

  private generateStructuredFeedback(
    businessQualityScore: number,
    patternComplianceScore: number,
    synergyStatus: SynergyStatus[],
    qualityIssues: string[],
  ): StructuredFeedback {
    const activatedSynergies = synergyStatus.filter((s) => s.activated).length;
    const synergyAwareness = synergyStatus.length > 0
      ? activatedSynergies / synergyStatus.length
      : 1.0;

    const dimensions = {
      businessAlignment: businessQualityScore,
      qualityStandards: qualityIssues.length === 0 ? 0.9 : 0.5,
      synergyAwareness,
      patternCompliance: patternComplianceScore,
      metricAwareness: businessQualityScore >= 0.7 ? 0.8 : 0.5,
    };

    const overallScore =
      (dimensions.businessAlignment +
        dimensions.qualityStandards +
        dimensions.synergyAwareness +
        dimensions.patternCompliance +
        dimensions.metricAwareness) /
      5;

    const strengths: string[] = [];
    const improvements: string[] = [];
    const recommendations: string[] = [];

    if (dimensions.businessAlignment >= 0.7) {
      strengths.push('Strong business alignment');
    } else {
      improvements.push('Improve business alignment with portfolio strategy');
    }

    if (dimensions.patternCompliance >= 0.7) {
      strengths.push('Good pattern compliance');
    } else {
      improvements.push('Better adherence to established business patterns');
    }

    if (dimensions.synergyAwareness >= 0.7) {
      strengths.push('Active synergy awareness');
    } else {
      recommendations.push('Explore cross-business synergy opportunities');
    }

    if (qualityIssues.length > 0) {
      recommendations.push(...qualityIssues.map((issue) => `Address: ${issue}`));
    }

    return {
      overallScore,
      dimensions,
      strengths,
      improvements,
      recommendations,
    };
  }
}

// ---------------------------------------------------------------------------
// Bypass Detection
// ---------------------------------------------------------------------------

const VALID_SUBSIDIARIES = ['zionx', 'zxmg', 'zion_alpha'];

export class BypassDetector {
  constructor(private readonly eventBus: EventBusPublisher) {}

  /**
   * Detect and intercept directives sent directly to subsidiaries bypassing Eretz.
   * Requirement 29a.4: Intercept, route through Eretz, log bypass attempt to XO Audit.
   */
  async interceptBypass(directive: Directive): Promise<{ intercepted: boolean; reason: string }> {
    const isDirectToSubsidiary =
      directive.source !== 'eretz' &&
      directive.source !== 'seraphim_core' &&
      VALID_SUBSIDIARIES.includes(directive.target);

    const isBypassFromSeraphim =
      directive.source === 'seraphim_core' &&
      VALID_SUBSIDIARIES.includes(directive.target) &&
      !directive.payload?.['routedThroughEretz'];

    if (isDirectToSubsidiary || isBypassFromSeraphim) {
      await this.eventBus.publish({
        source: 'eretz',
        type: 'bypass.detected',
        detail: {
          directiveId: directive.id,
          originalSource: directive.source,
          intendedTarget: directive.target,
          action: directive.action,
          interceptedAt: new Date().toISOString(),
          reason: isBypassFromSeraphim
            ? 'Directive from Seraphim Core sent directly to subsidiary without Eretz routing'
            : `Directive from "${directive.source}" sent directly to subsidiary bypassing chain of command`,
        },
        metadata: {
          tenantId: 'house-of-zion',
          correlationId: directive.id,
          timestamp: new Date(),
        },
      });

      return {
        intercepted: true,
        reason: isBypassFromSeraphim
          ? 'Directive intercepted: must route through Eretz for enrichment'
          : `Bypass detected: source "${directive.source}" cannot send directly to subsidiary`,
      };
    }

    return { intercepted: false, reason: '' };
  }
}

// ---------------------------------------------------------------------------
// Eretz Agent Program
// ---------------------------------------------------------------------------

export const ERETZ_AGENT_PROGRAM: AgentProgram = {
  id: 'eretz-business-pillar',
  name: 'Eretz Business Pillar',
  version: '1.0.0',
  pillar: 'eretz',

  systemPrompt: `You are the Eretz Business Pillar orchestrator — the master business intelligence agent that sits between Seraphim Core and all business subsidiaries (ZionX, ZXMG, Zion Alpha). Your mission is to ensure every directive flowing to subsidiaries is enriched with business intelligence, every result flowing back is verified against quality standards, and cross-business synergies are actively identified and activated. You are NOT a relay — you add intelligence at every touchpoint. You enforce the chain of command: King → Seraphim → Eretz → Subsidiary. You maintain portfolio-level awareness and ensure world-class execution across all business operations.`,

  tools: [
    {
      name: 'enrich_directive',
      description: 'Enrich a directive with portfolio context, patterns, and synergy opportunities',
      inputSchema: {
        type: 'object',
        required: ['directiveId', 'target', 'action'],
        properties: {
          directiveId: { type: 'string' },
          target: { type: 'string' },
          action: { type: 'string' },
        },
      },
    },
    {
      name: 'verify_result',
      description: 'Verify subsidiary result against business quality standards',
      inputSchema: {
        type: 'object',
        required: ['resultId', 'subsidiary'],
        properties: {
          resultId: { type: 'string' },
          subsidiary: { type: 'string' },
        },
      },
    },
    {
      name: 'analyze_synergies',
      description: 'Analyze cross-business synergy opportunities',
      inputSchema: {
        type: 'object',
        required: ['scope'],
        properties: {
          scope: { type: 'string', enum: ['all', 'zionx', 'zxmg', 'zion_alpha'] },
        },
      },
    },
    {
      name: 'review_portfolio',
      description: 'Generate portfolio intelligence report',
      inputSchema: {
        type: 'object',
        required: ['reportType'],
        properties: {
          reportType: { type: 'string', enum: ['summary', 'detailed', 'metrics'] },
        },
      },
    },
    {
      name: 'intercept_bypass',
      description: 'Detect and intercept directives bypassing Eretz chain of command',
      inputSchema: {
        type: 'object',
        required: ['directiveId', 'source', 'target'],
        properties: {
          directiveId: { type: 'string' },
          source: { type: 'string' },
          target: { type: 'string' },
        },
      },
    },
  ],

  stateMachine: ERETZ_STATE_MACHINE,
  completionContracts: ERETZ_COMPLETION_CONTRACTS,

  authorityLevel: 'L3',
  allowedActions: [
    'enrich_directive',
    'verify_result',
    'analyze_synergies',
    'review_portfolio',
    'intercept_bypass',
    'train_subsidiary',
    'reallocate_resources',
    'enforce_standing_rules',
  ],
  deniedActions: [
    'terminate_subsidiary',
    'modify_king_directives',
    'bypass_governance',
    'access_financial_accounts',
  ],

  modelPreference: {
    preferred: 'claude-sonnet-4-20250514',
    fallback: 'gpt-4o',
    costCeiling: 5.0,
    taskTypeOverrides: {
      analysis: 'claude-sonnet-4-20250514',
      enrichment: 'gpt-4o',
      classification: 'gpt-4o-mini',
    },
  },

  tokenBudget: { daily: 300000, monthly: 6000000 },

  testSuite: {
    suiteId: 'eretz-test-suite',
    path: 'packages/app/src/eretz/__tests__',
    requiredCoverage: 80,
  },

  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
  createdBy: 'system',
  changelog: [
    {
      version: '1.0.0',
      date: new Date('2026-01-01T00:00:00Z'),
      author: 'system',
      description: 'Initial Eretz Business Pillar agent program definition.',
    },
  ],
};
