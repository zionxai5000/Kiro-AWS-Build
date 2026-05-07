/**
 * Eretz Training Cascade Mechanism
 *
 * Ensures each subsidiary agent gets smarter over time through structured
 * feedback from Eretz. Enriches directives with training context, evaluates
 * subsidiary outputs for business quality, generates structured feedback,
 * stores feedback in Domain Expertise Profiles, and tracks training
 * effectiveness trends.
 *
 * Requirements: 29e.17, 29e.18, 29e.19
 */

import { randomUUID } from 'node:crypto';
import type { EventBusService } from '@seraphim/core';
import type {
  DomainExpertiseProfileService,
  DomainExpertiseProfile,
  ProfileUpdateInput,
} from '@seraphim/services/sme/domain-expertise-profile.js';
import type {
  Directive,
  SubsidiaryResult,
  StructuredFeedback,
  QualityStandard,
  PatternMatch,
  PortfolioContext,
  PortfolioProvider,
  PatternLibrary,
} from './agent-program.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface TrainingContext {
  businessRationale: string;
  expectedOutcomes: string[];
  qualityStandards: QualityStandard[];
  portfolioFit: string;
  relevantPatterns: string[];
  learningObjectives: string[];
}

export interface BusinessQualityEvaluation {
  subsidiary: string;
  outputId: string;
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
  approved: boolean;
  remediationRequired: string[];
}

export interface TrendMetric {
  current: number;
  previous: number;
  trend: 'improving' | 'stable' | 'declining';
  dataPoints: { date: Date; value: number }[];
}

export interface TrainingEffectivenessReport {
  subsidiary: string;
  period: string;
  businessDecisionQuality: TrendMetric;
  recommendationAccuracy: TrendMetric;
  autonomousJudgment: TrendMetric;
  synergyAwareness: TrendMetric;
  overallImprovement: number;
}

export interface TrainingCascadeConfig {
  eventBus: EventBusService;
  profileService: DomainExpertiseProfileService;
  portfolioProvider: PortfolioProvider;
  patternLibrary: PatternLibrary;
}

// ---------------------------------------------------------------------------
// Internal types for effectiveness tracking
// ---------------------------------------------------------------------------

interface EffectivenessDataPoint {
  date: Date;
  businessDecisionQuality: number;
  recommendationAccuracy: number;
  autonomousJudgment: number;
  synergyAwareness: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class TrainingCascadeImpl {
  private readonly eventBus: EventBusService;
  private readonly profileService: DomainExpertiseProfileService;
  private readonly portfolioProvider: PortfolioProvider;
  private readonly patternLibrary: PatternLibrary;

  /** In-memory effectiveness tracking per subsidiary */
  private readonly effectivenessHistory: Map<string, EffectivenessDataPoint[]> = new Map();

  constructor(config: TrainingCascadeConfig) {
    this.eventBus = config.eventBus;
    this.profileService = config.profileService;
    this.portfolioProvider = config.portfolioProvider;
    this.patternLibrary = config.patternLibrary;
  }

  // -------------------------------------------------------------------------
  // addTrainingContext
  // -------------------------------------------------------------------------

  /**
   * Enrich a directive with training context — business rationale, expected
   * outcomes, quality standards, portfolio fit, relevant patterns, and
   * learning objectives.
   *
   * Requirement 29e.17: Include training context so subsidiary agents improve
   * their business understanding over time.
   */
  async addTrainingContext(directive: Directive, subsidiary: string): Promise<TrainingContext> {
    const portfolioContext = await this.portfolioProvider.getSubsidiaryContext(subsidiary);
    const patterns = await this.patternLibrary.findApplicablePatterns(subsidiary, directive.action);

    const businessRationale = this.buildBusinessRationale(directive, portfolioContext);
    const expectedOutcomes = this.deriveExpectedOutcomes(directive, portfolioContext);
    const qualityStandards = this.getQualityStandards(directive);
    const portfolioFit = this.assessPortfolioFit(directive, portfolioContext);
    const relevantPatterns = patterns.map(
      (p) => `${p.name} (confidence: ${Math.round(p.confidence * 100)}%)`,
    );
    const learningObjectives = this.deriveLearningObjectives(directive, portfolioContext, patterns);

    const trainingContext: TrainingContext = {
      businessRationale,
      expectedOutcomes,
      qualityStandards,
      portfolioFit,
      relevantPatterns,
      learningObjectives,
    };

    await this.eventBus.publish({
      source: 'eretz',
      type: 'training.context.added',
      detail: {
        directiveId: directive.id,
        subsidiary,
        patternsIncluded: patterns.length,
        learningObjectivesCount: learningObjectives.length,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: directive.id,
        timestamp: new Date(),
      },
    });

    return trainingContext;
  }

  // -------------------------------------------------------------------------
  // evaluateBusinessQuality
  // -------------------------------------------------------------------------

  /**
   * Evaluate subsidiary outputs across dimensions: business alignment,
   * quality standards, synergy awareness, pattern compliance, metric awareness.
   *
   * Requirement 29e.18: Evaluate subsidiary agent outputs for business quality.
   */
  async evaluateBusinessQuality(result: SubsidiaryResult): Promise<BusinessQualityEvaluation> {
    const patterns = await this.patternLibrary.findApplicablePatterns(
      result.subsidiary,
      result.action,
    );

    const businessAlignment = this.scoreBusinessAlignment(result);
    const qualityStandards = this.scoreQualityStandards(result);
    const synergyAwareness = this.scoreSynergyAwareness(result);
    const patternCompliance = this.scorePatternCompliance(result, patterns);
    const metricAwareness = this.scoreMetricAwareness(result);

    const overallScore =
      (businessAlignment + qualityStandards + synergyAwareness + patternCompliance + metricAwareness) / 5;

    const strengths = this.identifyStrengths({
      businessAlignment,
      qualityStandards,
      synergyAwareness,
      patternCompliance,
      metricAwareness,
    });

    const improvements = this.identifyImprovements({
      businessAlignment,
      qualityStandards,
      synergyAwareness,
      patternCompliance,
      metricAwareness,
    });

    const remediationRequired: string[] = [];
    if (overallScore < 0.6) {
      remediationRequired.push('Overall quality below minimum threshold');
    }
    if (businessAlignment < 0.5) {
      remediationRequired.push('Business alignment needs significant improvement');
    }

    const approved = overallScore >= 0.6 && remediationRequired.length === 0;

    const evaluation: BusinessQualityEvaluation = {
      subsidiary: result.subsidiary,
      outputId: result.id,
      overallScore,
      dimensions: {
        businessAlignment,
        qualityStandards,
        synergyAwareness,
        patternCompliance,
        metricAwareness,
      },
      strengths,
      improvements,
      approved,
      remediationRequired,
    };

    await this.eventBus.publish({
      source: 'eretz',
      type: 'training.quality.evaluated',
      detail: {
        subsidiary: result.subsidiary,
        outputId: result.id,
        overallScore,
        approved,
        dimensions: evaluation.dimensions,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: result.directiveId,
        timestamp: new Date(),
      },
    });

    return evaluation;
  }

  // -------------------------------------------------------------------------
  // generateFeedback
  // -------------------------------------------------------------------------

  /**
   * Produce structured feedback from a quality evaluation.
   *
   * Requirement 29e.18: Provide structured feedback stored in the subsidiary's
   * Domain_Expertise_Profile for continuous improvement.
   */
  generateFeedback(evaluation: BusinessQualityEvaluation): StructuredFeedback {
    const { dimensions } = evaluation;

    const strengths: string[] = [...evaluation.strengths];
    const improvements: string[] = [...evaluation.improvements];
    const recommendations: string[] = [];

    if (dimensions.businessAlignment < 0.7) {
      recommendations.push('Align outputs more closely with portfolio strategy goals');
    }
    if (dimensions.synergyAwareness < 0.7) {
      recommendations.push('Consider cross-business synergy opportunities in decision-making');
    }
    if (dimensions.patternCompliance < 0.7) {
      recommendations.push('Review and apply established business patterns from the pattern library');
    }
    if (dimensions.metricAwareness < 0.7) {
      recommendations.push('Track and report relevant business metrics with each output');
    }
    if (dimensions.qualityStandards < 0.7) {
      recommendations.push('Ensure outputs meet minimum quality standards before submission');
    }

    return {
      overallScore: evaluation.overallScore,
      dimensions,
      strengths,
      improvements,
      recommendations,
    };
  }

  // -------------------------------------------------------------------------
  // storeFeedback
  // -------------------------------------------------------------------------

  /**
   * Persist feedback in the subsidiary's Domain_Expertise_Profile for
   * continuous improvement.
   *
   * Requirement 29e.18: Feedback stored in subsidiary's Domain_Expertise_Profile.
   */
  async storeFeedback(
    feedback: StructuredFeedback,
    subsidiary: string,
    profile: DomainExpertiseProfile,
  ): Promise<void> {
    const now = new Date();
    const update: ProfileUpdateInput = {
      knowledgeEntries: [
        {
          topic: `training-feedback-${Date.now()}`,
          content: this.formatFeedbackAsKnowledge(feedback),
          confidence: feedback.overallScore,
          source: 'eretz-training-cascade',
          tags: ['training-feedback', 'quality-evaluation', subsidiary],
          lastVerified: now,
        },
      ],
      learnedPatterns: feedback.recommendations.map((rec) => ({
        pattern: rec,
        context: `Training feedback for ${subsidiary}`,
        outcome: feedback.overallScore >= 0.7 ? 'positive' as const : 'negative' as const,
        confidence: feedback.overallScore,
        occurrences: 1,
        firstObserved: now,
        lastObserved: now,
      })),
    };

    await this.profileService.updateProfile(profile, update);

    // Record effectiveness data point
    this.recordEffectivenessDataPoint(subsidiary, feedback);

    await this.eventBus.publish({
      source: 'eretz',
      type: 'training.feedback.stored',
      detail: {
        subsidiary,
        overallScore: feedback.overallScore,
        recommendationsCount: feedback.recommendations.length,
        profileVersion: profile.version,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });
  }

  // -------------------------------------------------------------------------
  // getTrainingEffectiveness
  // -------------------------------------------------------------------------

  /**
   * Track improvement trends per subsidiary — business decision quality,
   * recommendation accuracy, autonomous judgment, synergy awareness.
   *
   * Requirement 29e.19: Maintain training effectiveness tracker measuring
   * each subsidiary's improvement over time.
   */
  getTrainingEffectiveness(subsidiary: string): TrainingEffectivenessReport {
    const history = this.effectivenessHistory.get(subsidiary) ?? [];

    const businessDecisionQuality = this.computeTrendMetric(
      history.map((h) => ({ date: h.date, value: h.businessDecisionQuality })),
    );
    const recommendationAccuracy = this.computeTrendMetric(
      history.map((h) => ({ date: h.date, value: h.recommendationAccuracy })),
    );
    const autonomousJudgment = this.computeTrendMetric(
      history.map((h) => ({ date: h.date, value: h.autonomousJudgment })),
    );
    const synergyAwareness = this.computeTrendMetric(
      history.map((h) => ({ date: h.date, value: h.synergyAwareness })),
    );

    const overallImprovement = this.computeOverallImprovement(
      businessDecisionQuality,
      recommendationAccuracy,
      autonomousJudgment,
      synergyAwareness,
    );

    return {
      subsidiary,
      period: this.computePeriod(history),
      businessDecisionQuality,
      recommendationAccuracy,
      autonomousJudgment,
      synergyAwareness,
      overallImprovement,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildBusinessRationale(directive: Directive, context: PortfolioContext): string {
    const parts: string[] = [
      `This directive targets ${directive.target} which contributes $${context.mrr}/mo to portfolio revenue.`,
    ];
    if (context.gaps.length > 0) {
      parts.push(`Current gaps to address: ${context.gaps.join(', ')}.`);
    }
    if (directive.priority >= 8) {
      parts.push('This is a critical priority directive requiring immediate attention.');
    }
    return parts.join(' ');
  }

  private deriveExpectedOutcomes(directive: Directive, context: PortfolioContext): string[] {
    const outcomes: string[] = [
      `Successful execution of "${directive.action}" for ${directive.target}`,
      'Measurable business metrics reported with outcome',
    ];
    if (context.gaps.length > 0) {
      outcomes.push(`Address identified gap: ${context.gaps[0]}`);
    }
    return outcomes;
  }

  private getQualityStandards(_directive: Directive): QualityStandard[] {
    return [
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
      {
        id: 'qs-metric-reporting',
        name: 'Metric Reporting',
        threshold: 0.5,
        description: 'Output must include relevant business metrics',
      },
    ];
  }

  private assessPortfolioFit(directive: Directive, context: PortfolioContext): string {
    const topProductsStr = context.topProducts.join(', ');
    return `Directive "${directive.action}" fits within ${directive.target}'s portfolio position (top products: ${topProductsStr}, recent performance: ${context.recentPerformance}).`;
  }

  private deriveLearningObjectives(
    directive: Directive,
    context: PortfolioContext,
    patterns: PatternMatch[],
  ): string[] {
    const objectives: string[] = [
      `Understand how "${directive.action}" contributes to portfolio-level strategy`,
      'Report business metrics alongside task completion',
    ];
    if (patterns.length > 0) {
      objectives.push(`Apply pattern: ${patterns[0].name}`);
    }
    if (context.gaps.length > 0) {
      objectives.push(`Learn to proactively address gap: ${context.gaps[0]}`);
    }
    return objectives;
  }

  private scoreBusinessAlignment(result: SubsidiaryResult): number {
    let score = 0.5;
    if (result.outcome && Object.keys(result.outcome).length > 0) {
      score += 0.2;
    }
    if (result.metrics && Object.keys(result.metrics).length > 0) {
      score += 0.2;
    }
    if (result.completedAt) {
      score += 0.1;
    }
    return Math.min(score, 1.0);
  }

  private scoreQualityStandards(result: SubsidiaryResult): number {
    let score = 0.4;
    const outcome = result.outcome ?? {};
    if (Object.keys(outcome).length >= 2) {
      score += 0.3;
    }
    if (result.metrics && Object.keys(result.metrics).length >= 2) {
      score += 0.3;
    }
    return Math.min(score, 1.0);
  }

  private scoreSynergyAwareness(result: SubsidiaryResult): number {
    const outcome = result.outcome ?? {};
    const hasSynergyConsideration =
      'synergyImpact' in outcome ||
      'crossBusinessImpact' in outcome ||
      'relatedSubsidiaries' in outcome;
    return hasSynergyConsideration ? 0.9 : 0.4;
  }

  private scorePatternCompliance(result: SubsidiaryResult, patterns: PatternMatch[]): number {
    if (patterns.length === 0) return 0.8; // No patterns to comply with
    const outcome = result.outcome ?? {};
    const hasStructuredOutput = Object.keys(outcome).length >= 2;
    const hasMetrics = result.metrics && Object.keys(result.metrics).length > 0;
    let score = 0.4;
    if (hasStructuredOutput) score += 0.3;
    if (hasMetrics) score += 0.3;
    return Math.min(score, 1.0);
  }

  private scoreMetricAwareness(result: SubsidiaryResult): number {
    const metrics = result.metrics ?? {};
    const metricCount = Object.keys(metrics).length;
    if (metricCount >= 3) return 0.9;
    if (metricCount >= 1) return 0.6;
    return 0.3;
  }

  private identifyStrengths(dimensions: Record<string, number>): string[] {
    const strengths: string[] = [];
    if (dimensions['businessAlignment']! >= 0.7) strengths.push('Strong business alignment');
    if (dimensions['qualityStandards']! >= 0.7) strengths.push('Meets quality standards');
    if (dimensions['synergyAwareness']! >= 0.7) strengths.push('Good synergy awareness');
    if (dimensions['patternCompliance']! >= 0.7) strengths.push('Follows established patterns');
    if (dimensions['metricAwareness']! >= 0.7) strengths.push('Strong metric reporting');
    return strengths;
  }

  private identifyImprovements(dimensions: Record<string, number>): string[] {
    const improvements: string[] = [];
    if (dimensions['businessAlignment']! < 0.7) improvements.push('Improve business alignment');
    if (dimensions['qualityStandards']! < 0.7) improvements.push('Raise quality standards');
    if (dimensions['synergyAwareness']! < 0.7) improvements.push('Increase synergy awareness');
    if (dimensions['patternCompliance']! < 0.7) improvements.push('Better pattern compliance');
    if (dimensions['metricAwareness']! < 0.7) improvements.push('Improve metric reporting');
    return improvements;
  }

  private formatFeedbackAsKnowledge(feedback: StructuredFeedback): string {
    const parts: string[] = [
      `Quality evaluation score: ${feedback.overallScore.toFixed(2)}.`,
      `Strengths: ${feedback.strengths.join(', ') || 'none identified'}.`,
      `Areas for improvement: ${feedback.improvements.join(', ') || 'none identified'}.`,
      `Recommendations: ${feedback.recommendations.join('; ') || 'none'}.`,
    ];
    return parts.join(' ');
  }

  private recordEffectivenessDataPoint(subsidiary: string, feedback: StructuredFeedback): void {
    const history = this.effectivenessHistory.get(subsidiary) ?? [];
    history.push({
      date: new Date(),
      businessDecisionQuality: feedback.dimensions.businessAlignment,
      recommendationAccuracy: feedback.dimensions.qualityStandards,
      autonomousJudgment: feedback.dimensions.patternCompliance,
      synergyAwareness: feedback.dimensions.synergyAwareness,
    });
    this.effectivenessHistory.set(subsidiary, history);
  }

  private computeTrendMetric(dataPoints: { date: Date; value: number }[]): TrendMetric {
    if (dataPoints.length === 0) {
      return { current: 0, previous: 0, trend: 'stable', dataPoints: [] };
    }

    const current = dataPoints[dataPoints.length - 1]!.value;
    const previous = dataPoints.length >= 2 ? dataPoints[dataPoints.length - 2]!.value : current;

    let trend: 'improving' | 'stable' | 'declining';
    const diff = current - previous;
    if (diff > 0.05) {
      trend = 'improving';
    } else if (diff < -0.05) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    return { current, previous, trend, dataPoints };
  }

  private computeOverallImprovement(
    ...metrics: TrendMetric[]
  ): number {
    if (metrics.length === 0) return 0;
    const improvements = metrics.map((m) => {
      if (m.previous === 0) return 0;
      return ((m.current - m.previous) / m.previous) * 100;
    });
    return improvements.reduce((sum, v) => sum + v, 0) / improvements.length;
  }

  private computePeriod(history: EffectivenessDataPoint[]): string {
    if (history.length === 0) return 'no data';
    if (history.length === 1) return 'single evaluation';
    const first = history[0]!.date;
    const last = history[history.length - 1]!.date;
    const days = Math.ceil((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
    return `${days} days (${history.length} evaluations)`;
  }
}
