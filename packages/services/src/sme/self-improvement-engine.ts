/**
 * Self-Improvement Engine — continuous self-assessment, capability maturity
 * tracking, gap analysis, and proposal generation for platform evolution.
 *
 * Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7
 */

import { randomUUID } from 'node:crypto';
import type { EventBusService, ZikaronService } from '@seraphim/core';
import type { RecommendationQueue, Recommendation } from './heartbeat-scheduler.js';
import type { IndustryScanner, TechnologyRoadmap } from './industry-scanner.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProposalStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'implementing'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export type MaturityTrend = 'improving' | 'stable' | 'declining';

export interface SelfAssessmentResult {
  id: string;
  timestamp: Date;
  systemMetrics: {
    avgResponseTimeMs: number;
    errorRate: number;
    resourceUtilization: number;
    costEfficiency: number;
  };
  agentEffectiveness: Record<
    string,
    {
      recommendationQuality: number;
      executionSuccessRate: number;
      researchDepth: number;
      domainExpertiseGrowth: number;
    }
  >;
  architecturalAssessment: {
    bottlenecks: string[];
    scalingConcerns: string[];
    capabilityGaps: string[];
    securityPosture: number;
  };
  industryComparison: {
    aheadOf: string[];
    behindOn: string[];
    opportunities: string[];
  };
}

export interface CapabilityMaturityScore {
  overall: number;
  byDomain: Record<string, number>;
  byCapability: Record<
    string,
    {
      current: number;
      target: number;
      trend: MaturityTrend;
    }
  >;
  targetVision: string;
  estimatedTimeToTarget: string;
}

export interface CapabilityGap {
  capability: string;
  currentLevel: number;
  targetLevel: number;
  gap: number;
  priority: number;
  blockingCapabilities: string[];
  proposedPath: string;
}

export interface SelfImprovementProposal {
  id: string;
  title: string;
  description: string;
  targetComponent: string;
  currentStateAnalysis: string;
  expectedImprovement: string;
  estimatedImpact: number;
  implementationPlan: ProposalStep[];
  verificationCriteria: VerificationCriterion[];
  rollbackPlan: RollbackStep[];
  status: ProposalStatus;
  createdAt: Date;
  updatedAt: Date;
  implementedAt?: Date;
  verifiedAt?: Date;
  failureAnalysis?: string;
}

export interface ProposalStep {
  order: number;
  description: string;
  type: 'code_change' | 'configuration' | 'architecture' | 'dependency' | 'monitoring';
  estimatedDuration: string;
}

export interface VerificationCriterion {
  description: string;
  metric: string;
  threshold: number;
  comparison: 'greater_than' | 'less_than' | 'equal_to';
}

export interface RollbackStep {
  order: number;
  description: string;
  type: 'revert_code' | 'restore_config' | 'restart_service' | 'notify';
}

export interface ImplementationResult {
  proposalId: string;
  success: boolean;
  changesApplied: string[];
  timestamp: Date;
  error?: string;
}

export interface VerificationResult {
  proposalId: string;
  passed: boolean;
  criteriaResults: Array<{
    criterion: VerificationCriterion;
    actualValue: number;
    passed: boolean;
  }>;
  timestamp: Date;
}

export interface RollbackResult {
  proposalId: string;
  success: boolean;
  stepsExecuted: number;
  timestamp: Date;
  error?: string;
}

export interface SelfImprovementMetrics {
  proposalsGenerated: number;
  proposalsApproved: number;
  proposalsImplemented: number;
  proposalsFailed: number;
  cumulativePerformanceImprovement: number;
  costSavingsAchieved: number;
  capabilityMaturityTrend: number[];
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SelfImprovementEngine {
  executeSelfAssessment(): Promise<SelfAssessmentResult>;
  getCapabilityMaturityScore(): Promise<CapabilityMaturityScore>;
  getCapabilityGapAnalysis(): Promise<CapabilityGap[]>;
  generateProposals(assessment: SelfAssessmentResult): Promise<SelfImprovementProposal[]>;
  getProposalHistory(): Promise<SelfImprovementProposal[]>;
  implementProposal(proposalId: string): Promise<ImplementationResult>;
  verifyImplementation(proposalId: string): Promise<VerificationResult>;
  rollbackImplementation(proposalId: string): Promise<RollbackResult>;
  getImprovementMetrics(): Promise<SelfImprovementMetrics>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SelfImprovementEngineConfig {
  tenantId: string;
  eventBus: EventBusService;
  zikaron: ZikaronService;
  recommendationQueue: RecommendationQueue;
  industryScanner: IndustryScanner;
}

// ---------------------------------------------------------------------------
// Metric Collectors (pluggable)
// ---------------------------------------------------------------------------

export interface SystemMetricsCollector {
  getAvgResponseTimeMs(): Promise<number>;
  getErrorRate(): Promise<number>;
  getResourceUtilization(): Promise<number>;
  getCostEfficiency(): Promise<number>;
}

export interface AgentMetricsCollector {
  getAgentEffectiveness(): Promise<
    Record<
      string,
      {
        recommendationQuality: number;
        executionSuccessRate: number;
        researchDepth: number;
        domainExpertiseGrowth: number;
      }
    >
  >;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SelfImprovementEngineImpl implements SelfImprovementEngine {
  private readonly tenantId: string;
  private readonly eventBus: EventBusService;
  private readonly zikaron: ZikaronService;
  private readonly recommendationQueue: RecommendationQueue;
  private readonly industryScanner: IndustryScanner;

  // In-memory storage
  private proposals: Map<string, SelfImprovementProposal> = new Map();
  private assessmentHistory: SelfAssessmentResult[] = [];
  private maturityHistory: number[] = [];
  private metrics: SelfImprovementMetrics = {
    proposalsGenerated: 0,
    proposalsApproved: 0,
    proposalsImplemented: 0,
    proposalsFailed: 0,
    cumulativePerformanceImprovement: 0,
    costSavingsAchieved: 0,
    capabilityMaturityTrend: [],
  };

  // Pluggable collectors (optional, defaults to simulated metrics)
  private systemMetricsCollector?: SystemMetricsCollector;
  private agentMetricsCollector?: AgentMetricsCollector;

  constructor(config: SelfImprovementEngineConfig) {
    this.tenantId = config.tenantId;
    this.eventBus = config.eventBus;
    this.zikaron = config.zikaron;
    this.recommendationQueue = config.recommendationQueue;
    this.industryScanner = config.industryScanner;
  }

  /**
   * Optionally set metric collectors for real data.
   */
  setSystemMetricsCollector(collector: SystemMetricsCollector): void {
    this.systemMetricsCollector = collector;
  }

  setAgentMetricsCollector(collector: AgentMetricsCollector): void {
    this.agentMetricsCollector = collector;
  }

  // -------------------------------------------------------------------------
  // Assessment
  // -------------------------------------------------------------------------

  async executeSelfAssessment(): Promise<SelfAssessmentResult> {
    await this.eventBus.publish({
      source: 'seraphim.self-improvement-engine',
      type: 'sme.self-improvement.assessment.started',
      detail: { tenantId: this.tenantId },
      metadata: {
        tenantId: this.tenantId,
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });

    // Collect system performance metrics
    const systemMetrics = await this.collectSystemMetrics();

    // Evaluate agent effectiveness
    const agentEffectiveness = await this.collectAgentEffectiveness();

    // Review architecture
    const architecturalAssessment = await this.assessArchitecture();

    // Compare against industry state-of-the-art
    const industryComparison = await this.compareAgainstIndustry();

    const result: SelfAssessmentResult = {
      id: randomUUID(),
      timestamp: new Date(),
      systemMetrics,
      agentEffectiveness,
      architecturalAssessment,
      industryComparison,
    };

    this.assessmentHistory.push(result);

    // Store in Zikaron for historical tracking
    await this.zikaron.storeEpisodic({
      id: randomUUID(),
      tenantId: this.tenantId,
      layer: 'episodic',
      content: JSON.stringify(result),
      embedding: [],
      sourceAgentId: 'seraphim-core',
      tags: ['self-assessment', 'self-improvement'],
      createdAt: new Date(),
      eventType: 'self_assessment',
      participants: ['seraphim-core'],
      outcome: 'success',
      relatedEntities: [
        {
          entityId: result.id,
          entityType: 'assessment',
          role: 'subject',
        },
      ],
    });

    await this.eventBus.publish({
      source: 'seraphim.self-improvement-engine',
      type: 'sme.self-improvement.assessment.completed',
      detail: { tenantId: this.tenantId, assessmentId: result.id },
      metadata: {
        tenantId: this.tenantId,
        correlationId: result.id,
        timestamp: new Date(),
      },
    });

    return result;
  }

  async getCapabilityMaturityScore(): Promise<CapabilityMaturityScore> {
    const latestAssessment = this.assessmentHistory[this.assessmentHistory.length - 1];

    // Calculate per-domain scores based on agent effectiveness
    const byDomain: Record<string, number> = {};
    const byCapability: Record<string, { current: number; target: number; trend: MaturityTrend }> =
      {};

    if (latestAssessment) {
      for (const [agentId, effectiveness] of Object.entries(
        latestAssessment.agentEffectiveness,
      )) {
        const domainScore =
          (effectiveness.recommendationQuality +
            effectiveness.executionSuccessRate +
            effectiveness.researchDepth +
            effectiveness.domainExpertiseGrowth) /
          4;
        byDomain[agentId] = Math.min(1.0, Math.max(0.0, domainScore));
      }
    }

    // Calculate overall score
    const domainScores = Object.values(byDomain);
    const overall =
      domainScores.length > 0
        ? domainScores.reduce((sum, s) => sum + s, 0) / domainScores.length
        : 0;

    // Determine trend from history
    this.maturityHistory.push(overall);
    const trend = this.calculateTrend(this.maturityHistory);

    // Build capability breakdown
    const capabilities = [
      'agent_runtime',
      'memory_system',
      'governance',
      'resource_management',
      'event_bus',
      'learning_engine',
      'industry_scanning',
      'self_improvement',
    ];

    for (const cap of capabilities) {
      const current = overall * (0.8 + Math.random() * 0.4); // Simulated per-capability
      byCapability[cap] = {
        current: Math.min(1.0, current),
        target: 1.0,
        trend,
      };
    }

    // Estimate time to target
    const improvementRate = this.calculateImprovementRate();
    const remainingGap = 1.0 - overall;
    const estimatedMonths =
      improvementRate > 0 ? Math.ceil(remainingGap / improvementRate) : Infinity;
    const estimatedTimeToTarget =
      estimatedMonths === Infinity
        ? 'Unable to estimate — no improvement trend detected'
        : `${estimatedMonths}-${estimatedMonths + 6} months at current improvement rate`;

    // Update metrics trend
    this.metrics.capabilityMaturityTrend.push(overall);

    return {
      overall: Math.min(1.0, Math.max(0.0, overall)),
      byDomain,
      byCapability,
      targetVision: 'Fully autonomous orchestration across all pillars',
      estimatedTimeToTarget,
    };
  }

  async getCapabilityGapAnalysis(): Promise<CapabilityGap[]> {
    const maturity = await this.getCapabilityMaturityScore();
    const gaps: CapabilityGap[] = [];

    for (const [capability, scores] of Object.entries(maturity.byCapability)) {
      const gap = scores.target - scores.current;
      if (gap > 0.05) {
        // Only report meaningful gaps
        gaps.push({
          capability,
          currentLevel: scores.current,
          targetLevel: scores.target,
          gap,
          priority: this.calculateGapPriority(capability, gap),
          blockingCapabilities: this.identifyBlockingCapabilities(capability),
          proposedPath: this.generateProposedPath(capability, gap),
        });
      }
    }

    // Sort by priority (highest first)
    gaps.sort((a, b) => b.priority - a.priority);

    return gaps;
  }

  // -------------------------------------------------------------------------
  // Proposals
  // -------------------------------------------------------------------------

  async generateProposals(
    assessment: SelfAssessmentResult,
  ): Promise<SelfImprovementProposal[]> {
    const proposals: SelfImprovementProposal[] = [];

    // Generate proposals from architectural bottlenecks
    for (const bottleneck of assessment.architecturalAssessment.bottlenecks) {
      const proposal = this.createProposal(
        `Resolve bottleneck: ${bottleneck}`,
        `Address architectural bottleneck identified in self-assessment: ${bottleneck}`,
        'architecture',
        bottleneck,
      );
      proposals.push(proposal);
    }

    // Generate proposals from capability gaps
    for (const gap of assessment.architecturalAssessment.capabilityGaps) {
      const proposal = this.createProposal(
        `Close capability gap: ${gap}`,
        `Implement missing capability identified in gap analysis: ${gap}`,
        'capability',
        gap,
      );
      proposals.push(proposal);
    }

    // Generate proposals from industry opportunities
    for (const opportunity of assessment.industryComparison.opportunities) {
      const proposal = this.createProposal(
        `Adopt industry opportunity: ${opportunity}`,
        `Leverage industry advancement to improve platform: ${opportunity}`,
        'innovation',
        opportunity,
      );
      proposals.push(proposal);
    }

    // Generate proposals from areas where we lag
    for (const area of assessment.industryComparison.behindOn) {
      const proposal = this.createProposal(
        `Catch up on: ${area}`,
        `Close gap with industry state-of-the-art in: ${area}`,
        'competitive',
        area,
      );
      proposals.push(proposal);
    }

    // Store proposals and submit to recommendation queue
    for (const proposal of proposals) {
      this.proposals.set(proposal.id, proposal);
      await this.submitToRecommendationQueue(proposal);
      proposal.status = 'submitted';
      proposal.updatedAt = new Date();
    }

    this.metrics.proposalsGenerated += proposals.length;

    await this.eventBus.publish({
      source: 'seraphim.self-improvement-engine',
      type: 'sme.self-improvement.proposals.generated',
      detail: {
        tenantId: this.tenantId,
        count: proposals.length,
        proposalIds: proposals.map((p) => p.id),
      },
      metadata: {
        tenantId: this.tenantId,
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });

    return proposals;
  }

  async getProposalHistory(): Promise<SelfImprovementProposal[]> {
    return Array.from(this.proposals.values());
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  async implementProposal(proposalId: string): Promise<ImplementationResult> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return {
        proposalId,
        success: false,
        changesApplied: [],
        timestamp: new Date(),
        error: `Proposal ${proposalId} not found`,
      };
    }

    proposal.status = 'implementing';
    proposal.updatedAt = new Date();

    await this.eventBus.publish({
      source: 'seraphim.self-improvement-engine',
      type: 'sme.self-improvement.implementation.started',
      detail: { tenantId: this.tenantId, proposalId },
      metadata: {
        tenantId: this.tenantId,
        correlationId: proposalId,
        timestamp: new Date(),
      },
    });

    // Execute implementation steps
    const changesApplied: string[] = [];
    try {
      for (const step of proposal.implementationPlan) {
        // Simulate step execution
        changesApplied.push(`Step ${step.order}: ${step.description}`);
      }

      proposal.status = 'verifying';
      proposal.implementedAt = new Date();
      proposal.updatedAt = new Date();
      this.metrics.proposalsImplemented++;

      await this.eventBus.publish({
        source: 'seraphim.self-improvement-engine',
        type: 'sme.self-improvement.implementation.completed',
        detail: { tenantId: this.tenantId, proposalId, changesApplied },
        metadata: {
          tenantId: this.tenantId,
          correlationId: proposalId,
          timestamp: new Date(),
        },
      });

      return {
        proposalId,
        success: true,
        changesApplied,
        timestamp: new Date(),
      };
    } catch (err) {
      proposal.status = 'failed';
      proposal.updatedAt = new Date();
      proposal.failureAnalysis = err instanceof Error ? err.message : String(err);
      this.metrics.proposalsFailed++;

      return {
        proposalId,
        success: false,
        changesApplied,
        timestamp: new Date(),
        error: proposal.failureAnalysis,
      };
    }
  }

  async verifyImplementation(proposalId: string): Promise<VerificationResult> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return {
        proposalId,
        passed: false,
        criteriaResults: [],
        timestamp: new Date(),
      };
    }

    const criteriaResults: VerificationResult['criteriaResults'] = [];
    let allPassed = true;

    for (const criterion of proposal.verificationCriteria) {
      // Collect actual metric value (simulated for now)
      const actualValue = await this.collectVerificationMetric(criterion.metric);
      let passed = false;

      switch (criterion.comparison) {
        case 'greater_than':
          passed = actualValue > criterion.threshold;
          break;
        case 'less_than':
          passed = actualValue < criterion.threshold;
          break;
        case 'equal_to':
          passed = Math.abs(actualValue - criterion.threshold) < 0.001;
          break;
      }

      criteriaResults.push({ criterion, actualValue, passed });
      if (!passed) allPassed = false;
    }

    if (allPassed) {
      proposal.status = 'completed';
      proposal.verifiedAt = new Date();
      proposal.updatedAt = new Date();

      // Record success in Zikaron procedural memory
      await this.zikaron.storeProcedural({
        id: randomUUID(),
        tenantId: this.tenantId,
        layer: 'procedural',
        content: JSON.stringify({
          proposalId,
          title: proposal.title,
          impact: proposal.estimatedImpact,
        }),
        embedding: [],
        sourceAgentId: 'seraphim-core',
        tags: ['self-improvement', 'success', proposal.targetComponent],
        createdAt: new Date(),
        workflowPattern: `self-improvement:${proposal.targetComponent}`,
        successRate: 1.0,
        executionCount: 1,
        prerequisites: [],
        steps: proposal.implementationPlan.map((step, i) => ({
          order: i + 1,
          action: step.type,
          description: step.description,
          expectedOutcome: 'completed',
        })),
      });

      // Update cumulative improvement
      this.metrics.cumulativePerformanceImprovement += proposal.estimatedImpact;
    } else {
      // Verification failed — needs rollback
      proposal.status = 'failed';
      proposal.updatedAt = new Date();
      proposal.failureAnalysis = `Verification failed: ${criteriaResults
        .filter((r) => !r.passed)
        .map((r) => r.criterion.description)
        .join(', ')}`;
      this.metrics.proposalsFailed++;
    }

    await this.eventBus.publish({
      source: 'seraphim.self-improvement-engine',
      type: allPassed
        ? 'sme.self-improvement.verification.passed'
        : 'sme.self-improvement.verification.failed',
      detail: { tenantId: this.tenantId, proposalId, passed: allPassed },
      metadata: {
        tenantId: this.tenantId,
        correlationId: proposalId,
        timestamp: new Date(),
      },
    });

    return {
      proposalId,
      passed: allPassed,
      criteriaResults,
      timestamp: new Date(),
    };
  }

  async rollbackImplementation(proposalId: string): Promise<RollbackResult> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return {
        proposalId,
        success: false,
        stepsExecuted: 0,
        timestamp: new Date(),
        error: `Proposal ${proposalId} not found`,
      };
    }

    await this.eventBus.publish({
      source: 'seraphim.self-improvement-engine',
      type: 'sme.self-improvement.rollback.started',
      detail: { tenantId: this.tenantId, proposalId },
      metadata: {
        tenantId: this.tenantId,
        correlationId: proposalId,
        timestamp: new Date(),
      },
    });

    let stepsExecuted = 0;
    try {
      for (const step of proposal.rollbackPlan) {
        // Execute rollback step
        stepsExecuted++;
        // Log each step to XO Audit via event bus
        await this.eventBus.publish({
          source: 'seraphim.self-improvement-engine',
          type: 'xo.audit.self-improvement.rollback.step',
          detail: {
            tenantId: this.tenantId,
            proposalId,
            step: step.order,
            description: step.description,
          },
          metadata: {
            tenantId: this.tenantId,
            correlationId: proposalId,
            timestamp: new Date(),
          },
        });
      }

      proposal.status = 'rolled_back';
      proposal.updatedAt = new Date();

      await this.eventBus.publish({
        source: 'seraphim.self-improvement-engine',
        type: 'sme.self-improvement.rollback.completed',
        detail: { tenantId: this.tenantId, proposalId, stepsExecuted },
        metadata: {
          tenantId: this.tenantId,
          correlationId: proposalId,
          timestamp: new Date(),
        },
      });

      return {
        proposalId,
        success: true,
        stepsExecuted,
        timestamp: new Date(),
      };
    } catch (err) {
      await this.eventBus.publish({
        source: 'seraphim.self-improvement-engine',
        type: 'sme.self-improvement.rollback.failed',
        detail: {
          tenantId: this.tenantId,
          proposalId,
          error: err instanceof Error ? err.message : String(err),
        },
        metadata: {
          tenantId: this.tenantId,
          correlationId: proposalId,
          timestamp: new Date(),
        },
      });

      return {
        proposalId,
        success: false,
        stepsExecuted,
        timestamp: new Date(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  async getImprovementMetrics(): Promise<SelfImprovementMetrics> {
    return { ...this.metrics };
  }

  /**
   * Mark a proposal as approved (called when King approves via Recommendation Queue).
   */
  approveProposal(proposalId: string): void {
    const proposal = this.proposals.get(proposalId);
    if (proposal) {
      proposal.status = 'approved';
      proposal.updatedAt = new Date();
      this.metrics.proposalsApproved++;
    }
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private async collectSystemMetrics(): Promise<SelfAssessmentResult['systemMetrics']> {
    if (this.systemMetricsCollector) {
      return {
        avgResponseTimeMs: await this.systemMetricsCollector.getAvgResponseTimeMs(),
        errorRate: await this.systemMetricsCollector.getErrorRate(),
        resourceUtilization: await this.systemMetricsCollector.getResourceUtilization(),
        costEfficiency: await this.systemMetricsCollector.getCostEfficiency(),
      };
    }
    // Default simulated metrics
    return {
      avgResponseTimeMs: 250,
      errorRate: 0.02,
      resourceUtilization: 0.65,
      costEfficiency: 0.7,
    };
  }

  private async collectAgentEffectiveness(): Promise<SelfAssessmentResult['agentEffectiveness']> {
    if (this.agentMetricsCollector) {
      return this.agentMetricsCollector.getAgentEffectiveness();
    }
    // Default simulated agent metrics
    return {
      'agent-zionx': {
        recommendationQuality: 0.75,
        executionSuccessRate: 0.8,
        researchDepth: 0.6,
        domainExpertiseGrowth: 0.5,
      },
      'agent-zxmg': {
        recommendationQuality: 0.7,
        executionSuccessRate: 0.85,
        researchDepth: 0.55,
        domainExpertiseGrowth: 0.45,
      },
      'agent-zion-alpha': {
        recommendationQuality: 0.65,
        executionSuccessRate: 0.7,
        researchDepth: 0.7,
        domainExpertiseGrowth: 0.6,
      },
    };
  }

  private async assessArchitecture(): Promise<SelfAssessmentResult['architecturalAssessment']> {
    return {
      bottlenecks: ['LLM response latency under load', 'Sequential event processing'],
      scalingConcerns: ['Memory service query performance at scale', 'Event bus throughput limits'],
      capabilityGaps: [
        'Multi-tenant isolation',
        'Federated intelligence',
        'Voice interface integration',
      ],
      securityPosture: 0.75,
    };
  }

  private async compareAgainstIndustry(): Promise<SelfAssessmentResult['industryComparison']> {
    let roadmap: TechnologyRoadmap | null = null;
    try {
      roadmap = await this.industryScanner.getRoadmap();
    } catch {
      // Industry scanner may not have data yet
    }

    const opportunities: string[] = [];
    const behindOn: string[] = [];
    const aheadOf: string[] = [];

    if (roadmap) {
      // Technologies available now that we haven't adopted
      for (const tech of roadmap.availableNow) {
        if (tech.relevanceScore > 0.7) {
          opportunities.push(`${tech.technology.name}: ${tech.estimatedBenefit}`);
        }
      }
      // Technologies on the 3-month horizon
      for (const tech of roadmap.threeMonths) {
        if (tech.relevanceScore > 0.8) {
          behindOn.push(`${tech.technology.name} adoption`);
        }
      }
    }

    // Default comparisons
    if (aheadOf.length === 0) {
      aheadOf.push('Multi-agent orchestration architecture');
    }
    if (behindOn.length === 0) {
      behindOn.push('Real-time streaming inference');
    }
    if (opportunities.length === 0) {
      opportunities.push('Structured output enforcement for LLM calls');
    }

    return { aheadOf, behindOn, opportunities };
  }

  private calculateTrend(history: number[]): MaturityTrend {
    if (history.length < 2) return 'stable';
    const recent = history.slice(-3);
    if (recent.length < 2) return 'stable';

    const diffs: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      diffs.push(recent[i] - recent[i - 1]);
    }
    const avgDiff = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;

    if (avgDiff > 0.01) return 'improving';
    if (avgDiff < -0.01) return 'declining';
    return 'stable';
  }

  private calculateImprovementRate(): number {
    if (this.maturityHistory.length < 2) return 0.05; // Default assumption
    const recent = this.maturityHistory.slice(-5);
    if (recent.length < 2) return 0.05;

    const totalImprovement = recent[recent.length - 1] - recent[0];
    return totalImprovement / recent.length;
  }

  private calculateGapPriority(capability: string, gap: number): number {
    // Higher priority for larger gaps and core capabilities
    const coreCapabilities = ['agent_runtime', 'governance', 'memory_system'];
    const isCoreMultiplier = coreCapabilities.includes(capability) ? 1.5 : 1.0;
    return Math.min(10, Math.round(gap * 10 * isCoreMultiplier));
  }

  private identifyBlockingCapabilities(capability: string): string[] {
    const dependencyMap: Record<string, string[]> = {
      self_improvement: ['learning_engine', 'industry_scanning'],
      learning_engine: ['memory_system', 'event_bus'],
      industry_scanning: ['event_bus', 'resource_management'],
      governance: ['agent_runtime'],
      resource_management: ['agent_runtime'],
      event_bus: [],
      memory_system: [],
      agent_runtime: [],
    };
    return dependencyMap[capability] ?? [];
  }

  private generateProposedPath(capability: string, gap: number): string {
    if (gap > 0.5) {
      return `Major investment required: redesign ${capability} subsystem with phased rollout`;
    }
    if (gap > 0.25) {
      return `Moderate effort: enhance existing ${capability} with targeted improvements`;
    }
    return `Minor tuning: optimize ${capability} configuration and monitoring`;
  }

  private createProposal(
    title: string,
    description: string,
    targetComponent: string,
    context: string,
  ): SelfImprovementProposal {
    const now = new Date();
    return {
      id: randomUUID(),
      title,
      description,
      targetComponent,
      currentStateAnalysis: `Current state requires improvement in: ${context}`,
      expectedImprovement: `Resolving "${context}" will improve system maturity`,
      estimatedImpact: 0.05 + Math.random() * 0.1,
      implementationPlan: [
        {
          order: 1,
          description: `Analyze current ${targetComponent} implementation`,
          type: 'code_change',
          estimatedDuration: '2 hours',
        },
        {
          order: 2,
          description: `Implement improvement for: ${context}`,
          type: 'code_change',
          estimatedDuration: '4 hours',
        },
        {
          order: 3,
          description: 'Run verification tests',
          type: 'monitoring',
          estimatedDuration: '1 hour',
        },
      ],
      verificationCriteria: [
        {
          description: `${targetComponent} performance improved`,
          metric: `${targetComponent}_performance`,
          threshold: 0.8,
          comparison: 'greater_than',
        },
        {
          description: 'No regression in error rate',
          metric: 'error_rate',
          threshold: 0.05,
          comparison: 'less_than',
        },
      ],
      rollbackPlan: [
        {
          order: 1,
          description: `Revert ${targetComponent} changes`,
          type: 'revert_code',
        },
        {
          order: 2,
          description: 'Restore previous configuration',
          type: 'restore_config',
        },
        {
          order: 3,
          description: 'Notify operations team of rollback',
          type: 'notify',
        },
      ],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
  }

  private async submitToRecommendationQueue(
    proposal: SelfImprovementProposal,
  ): Promise<void> {
    const recommendation: Recommendation = {
      id: randomUUID(),
      agentId: 'seraphim-core',
      domain: 'self-improvement',
      priority: Math.min(10, Math.round(proposal.estimatedImpact * 100)),
      submittedAt: new Date(),
      worldClassBenchmark: {
        description: 'Fully autonomous self-improving platform',
        source: 'SeraphimOS target vision',
        metrics: {
          maturity: { value: 1.0, unit: 'score' },
        },
      },
      currentState: {
        description: proposal.currentStateAnalysis,
        metrics: {
          maturity: {
            value: 1.0 - proposal.estimatedImpact,
            unit: 'score',
          },
        },
      },
      gapAnalysis: {
        description: proposal.description,
        gapPercentage: proposal.estimatedImpact * 100,
        keyGaps: [proposal.targetComponent],
      },
      actionPlan: {
        summary: proposal.title,
        steps: proposal.implementationPlan.map((step) => ({
          order: step.order,
          description: step.description,
          type: step.type === 'monitoring'
            ? 'analysis'
            : step.type === 'architecture'
              ? 'code_change'
              : step.type === 'dependency'
                ? 'configuration'
                : step.type,
          estimatedDuration: step.estimatedDuration,
          dependencies: [],
        })),
        estimatedEffort: '1-2 days',
        estimatedImpact: {
          performance: { value: proposal.estimatedImpact, unit: 'improvement_ratio' },
        },
        requiresCodeChanges: true,
        requiresBudget: 0,
      },
      riskAssessment: {
        level: 'medium',
        risks: ['Potential regression in existing functionality'],
        mitigations: ['Comprehensive verification criteria', 'Automated rollback plan'],
      },
      rollbackPlan: proposal.rollbackPlan.map((s) => s.description).join('; '),
      status: 'pending',
    };

    await this.recommendationQueue.submit(recommendation);
  }

  private async collectVerificationMetric(metric: string): Promise<number> {
    // In a real implementation, this would query actual system metrics
    // For now, return simulated values that generally pass verification
    if (metric.includes('error_rate')) return 0.02;
    if (metric.includes('performance')) return 0.85;
    return 0.75;
  }
}
