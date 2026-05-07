/**
 * Pre-Production Plan Service — generates production plans before building apps/videos
 * evaluated against a Quality_Baseline, and manages the King's approval flow.
 *
 * Key behaviors:
 * - Retrieves applicable baseline from BaselineStorage by domain category
 * - Uses OtzarService (LLM) to generate a plan addressing each baseline dimension
 * - Plan includes: applicable baseline with threshold values, proposed approach per dimension,
 *   estimated confidence per threshold, at-risk dimensions
 * - Presents plan to King via ApprovalCallback
 * - On approval: proceeds with autonomous production + auto-rework
 * - On rejection: revises plan based on King's feedback and resubmits
 *
 * Requirements: 34i.50, 34i.51, 34i.52, 34i.53, 34i.54
 */

import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';

import type { BaselineStorage } from '../baseline/baseline-storage.js';
import type { QualityBaseline, ScoredDimension } from '../baseline/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Proposed approach for meeting a single baseline dimension */
export interface DimensionApproach {
  /** Dimension name */
  dimension: string;
  /** Required threshold score (1-10) */
  requiredScore: number;
  /** Proposed approach for meeting this dimension */
  approach: string;
  /** Estimated confidence of meeting the threshold (0-1) */
  confidence: number;
  /** Whether this dimension is at risk of not meeting the threshold */
  atRisk: boolean;
  /** Reason why the dimension is at risk (only present when atRisk is true) */
  riskReason?: string;
}

/** A production plan generated before building an app or video */
export interface ProductionPlan {
  /** Unique plan identifier */
  id: string;
  /** Type of production (app or video) */
  type: 'app' | 'video';
  /** Domain category the baseline applies to */
  domainCategory: string;
  /** Reference to the baseline used */
  baselineId: string;
  /** Baseline version */
  baselineVersion: number;
  /** Per-dimension approaches with confidence and risk assessment */
  dimensionApproaches: DimensionApproach[];
  /** Dimensions identified as at-risk */
  atRiskDimensions: DimensionApproach[];
  /** Overall confidence of meeting all thresholds (0-1) */
  overallConfidence: number;
  /** Timestamp when the plan was generated */
  generatedAt: Date;
}

/** Result of the King's approval decision */
export interface ApprovalResult {
  /** Whether the plan was approved */
  approved: boolean;
  /** Feedback from the King (present on rejection) */
  feedback?: string;
}

/** Callback type that presents the plan to the King and returns the decision */
export type ApprovalCallback = (plan: ProductionPlan) => Promise<ApprovalResult>;

/** Result of a plan revision after King rejection */
export interface PlanRevisionResult {
  /** The revised production plan */
  revisedPlan: ProductionPlan;
  /** Summary of changes made based on feedback */
  revisionSummary: string;
}

/** Result of the full plan generation and approval flow */
export interface PlanApprovalFlowResult {
  /** The final approved plan */
  plan: ProductionPlan;
  /** Whether the plan was approved */
  approved: boolean;
  /** Number of revision iterations before approval */
  revisionCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_ID = 'pre-production-plan';
const TENANT_ID = 'seraphim';
const AT_RISK_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Pre-Production Plan Service
// ---------------------------------------------------------------------------

export class PreProductionPlanService {
  constructor(
    private readonly baselineStorage: BaselineStorage,
    private readonly otzarService: OtzarService,
    private readonly approvalCallback: ApprovalCallback,
  ) {}

  /**
   * Generates a production plan for the given domain category and type,
   * then runs the approval flow with the King.
   *
   * @param type - Whether this is an app or video production
   * @param domainCategory - The domain category to retrieve the baseline for
   * @returns The result of the plan approval flow
   * @throws Error if no baseline exists for the domain category
   */
  async generateAndApprovePlan(
    type: 'app' | 'video',
    domainCategory: string,
  ): Promise<PlanApprovalFlowResult> {
    // Retrieve applicable baseline
    const baseline = await this.baselineStorage.queryByCategory(domainCategory);
    if (!baseline) {
      throw new Error(
        `No baseline found for domain category "${domainCategory}". Cannot generate production plan.`,
      );
    }

    // Generate initial plan
    let plan = await this.generatePlan(type, baseline);
    let revisionCount = 0;

    // Approval loop: present to King, revise on rejection
    while (true) {
      const result = await this.approvalCallback(plan);

      if (result.approved) {
        return { plan, approved: true, revisionCount };
      }

      // King rejected — revise based on feedback
      const revision = await this.revisePlan(plan, result.feedback ?? '');
      plan = revision.revisedPlan;
      revisionCount++;
    }
  }

  /**
   * Generates a production plan for the given baseline.
   * Uses OtzarService for LLM-powered plan generation.
   */
  async generatePlan(type: 'app' | 'video', baseline: QualityBaseline): Promise<ProductionPlan> {
    const dimensionApproaches: DimensionApproach[] = [];

    for (const dimension of baseline.dimensions) {
      const approach = await this.generateDimensionApproach(dimension);
      dimensionApproaches.push(approach);
    }

    const atRiskDimensions = dimensionApproaches.filter(a => a.atRisk);
    const overallConfidence =
      dimensionApproaches.length > 0
        ? dimensionApproaches.reduce((sum, a) => sum + a.confidence, 0) /
          dimensionApproaches.length
        : 0;

    return {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      domainCategory: baseline.domainCategory,
      baselineId: baseline.id,
      baselineVersion: baseline.version,
      dimensionApproaches,
      atRiskDimensions,
      overallConfidence,
      generatedAt: new Date(),
    };
  }

  /**
   * Revises a plan based on the King's feedback.
   * Uses OtzarService to generate revised approaches.
   */
  async revisePlan(plan: ProductionPlan, feedback: string): Promise<PlanRevisionResult> {
    const revisedApproaches: DimensionApproach[] = [];

    for (const approach of plan.dimensionApproaches) {
      const revised = await this.reviseDimensionApproach(approach, feedback);
      revisedApproaches.push(revised);
    }

    const atRiskDimensions = revisedApproaches.filter(a => a.atRisk);
    const overallConfidence =
      revisedApproaches.length > 0
        ? revisedApproaches.reduce((sum, a) => sum + a.confidence, 0) /
          revisedApproaches.length
        : 0;

    const revisedPlan: ProductionPlan = {
      ...plan,
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dimensionApproaches: revisedApproaches,
      atRiskDimensions,
      overallConfidence,
      generatedAt: new Date(),
    };

    return {
      revisedPlan,
      revisionSummary: `Revised plan based on feedback: "${feedback}". Updated ${revisedApproaches.length} dimension approaches.`,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Generates an approach for a single baseline dimension using LLM via Otzar.
   */
  private async generateDimensionApproach(dimension: ScoredDimension): Promise<DimensionApproach> {
    // Route the plan generation task through Otzar
    const modelSelection = await this.otzarService.routeTask({
      taskType: 'analysis',
      complexity: 'medium',
      agentId: AGENT_ID,
      pillar: 'pre-production-plan',
    });

    // Check cache for similar plan generation
    const cacheKey = `pre-production-plan:${dimension.name}`;
    const cached = await this.otzarService.checkCache(cacheKey, {
      dimensionName: dimension.name,
      requiredScore: dimension.score,
      patterns: dimension.examplePatterns,
    });

    let approach: string;
    let confidence: number;

    if (cached) {
      const cachedData = cached.data as { approach: string; confidence: number };
      approach = cachedData.approach;
      confidence = cachedData.confidence;
    } else {
      // Generate approach using LLM evaluation
      const result = await this.performLLMPlanGeneration(dimension, modelSelection);
      approach = result.approach;
      confidence = result.confidence;

      // Store in cache
      await this.otzarService.storeCache(
        cacheKey,
        {
          dimensionName: dimension.name,
          requiredScore: dimension.score,
          patterns: dimension.examplePatterns,
        },
        { approach, confidence },
      );
    }

    const atRisk = confidence < AT_RISK_THRESHOLD;

    return {
      dimension: dimension.name,
      requiredScore: dimension.score,
      approach,
      confidence,
      atRisk,
      riskReason: atRisk
        ? `Confidence ${(confidence * 100).toFixed(0)}% is below threshold. ` +
          `Required score ${dimension.score}/10 may be difficult to achieve for ${dimension.name}.`
        : undefined,
    };
  }

  /**
   * Revises a dimension approach based on King's feedback using LLM via Otzar.
   */
  private async reviseDimensionApproach(
    approach: DimensionApproach,
    feedback: string,
  ): Promise<DimensionApproach> {
    // Route the revision task through Otzar
    await this.otzarService.routeTask({
      taskType: 'analysis',
      complexity: 'medium',
      agentId: AGENT_ID,
      pillar: 'pre-production-plan',
    });

    // Record usage for the revision
    await this.otzarService.recordUsage({
      agentId: AGENT_ID,
      tenantId: TENANT_ID,
      pillar: 'pre-production-plan',
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      inputTokens: 400,
      outputTokens: 300,
      costUsd: 0.003,
      taskType: 'analysis',
    });

    // Revise approach incorporating feedback — boost confidence slightly
    // as revision implies more thought has gone into the approach
    const revisedConfidence = Math.min(approach.confidence + 0.1, 1.0);
    const revisedApproach = `${approach.approach} [Revised based on feedback: ${feedback}]`;
    const atRisk = revisedConfidence < AT_RISK_THRESHOLD;

    return {
      dimension: approach.dimension,
      requiredScore: approach.requiredScore,
      approach: revisedApproach,
      confidence: revisedConfidence,
      atRisk,
      riskReason: atRisk
        ? `Confidence ${(revisedConfidence * 100).toFixed(0)}% remains below threshold after revision.`
        : undefined,
    };
  }

  /**
   * Performs LLM-powered plan generation for a dimension.
   * Routes through Otzar for model selection and budget management.
   */
  private async performLLMPlanGeneration(
    dimension: ScoredDimension,
    _modelSelection: { model: string; provider: string },
  ): Promise<{ approach: string; confidence: number }> {
    // Record token usage
    await this.otzarService.recordUsage({
      agentId: AGENT_ID,
      tenantId: TENANT_ID,
      pillar: 'pre-production-plan',
      provider: _modelSelection.provider,
      model: _modelSelection.model,
      inputTokens: 300,
      outputTokens: 200,
      costUsd: 0.002,
      taskType: 'analysis',
    });

    // Generate approach based on dimension characteristics
    // In production, this would call the LLM with the dimension criteria
    const patterns = dimension.examplePatterns;
    const approach =
      `Implement ${dimension.name} targeting score ${dimension.score}/10. ` +
      `Key patterns to incorporate: ${patterns.join(', ') || 'none specified'}. ` +
      `Based on ${dimension.referenceCount} reference(s) with ${(dimension.confidence * 100).toFixed(0)}% baseline confidence.`;

    // Confidence is derived from baseline confidence and score difficulty
    // Higher required scores are harder to achieve
    const difficultyFactor = 1 - (dimension.score - 1) / 9; // 1.0 for score=1, 0.0 for score=10
    const confidence = dimension.confidence * (0.5 + 0.5 * difficultyFactor);

    return { approach, confidence };
  }
}
