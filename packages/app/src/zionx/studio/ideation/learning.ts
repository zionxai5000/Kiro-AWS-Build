/**
 * ZionX Autonomous App Ideation Engine — Learning and Audit Integration
 *
 * Tracks outcomes of published apps, correlates with original idea scoring,
 * calibrates niche scoring weights, and logs all ideation actions to XO_Audit.
 * Integrates with existing ZionX design intelligence, quality baselines, and
 * GTM engine.
 *
 * Requirements: 45f.20, 45f.21, 45f.22
 */

import { randomUUID } from 'node:crypto';
import type { NicheScoringAlgorithm, HistoricalOutcome, ScoreBreakdown } from './niche-scoring.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppPerformanceData {
  ideaId: string;
  appName: string;
  actualDownloads: number;
  actualRevenue: number;
  rating: number;
  retentionRate: number;
  publishedAt: Date;
  measuredAt: Date;
}

export interface OutcomeRecord {
  id: string;
  ideaId: string;
  appName: string;
  originalScore: number;
  originalFactors: ScoreBreakdown;
  actualDownloads: number;
  actualRevenue: number;
  success: boolean;
  correlationScore: number;
  recordedAt: Date;
}

export interface AuditEntry {
  id: string;
  action: string;
  agentId: string;
  timestamp: Date;
  detail: Record<string, unknown>;
  traceId: string;
  source: string;
}

export interface IdeaScoreRecord {
  ideaId: string;
  nicheScore: number;
  factors: ScoreBreakdown;
  category: string;
}

/**
 * Predefined ideation action types for comprehensive audit coverage.
 * Requirement 45f.22: log ALL ideation actions with full traceability.
 */
export type IdeationActionType =
  | 'research_cycle_started'
  | 'research_cycle_completed'
  | 'niche_scored'
  | 'niche_batch_scored'
  | 'idea_generated'
  | 'idea_added_to_pipeline'
  | 'idea_dismissed'
  | 'idea_bookmarked'
  | 'pipeline_refreshed'
  | 'pipeline_status_changed'
  | 'outcome_recorded'
  | 'weights_calibrated'
  | 'quality_baseline_applied'
  | 'quality_baseline_check_failed'
  | 'gtm_automation_applied'
  | 'design_intelligence_applied';

// ---------------------------------------------------------------------------
// Dependency Interfaces
// ---------------------------------------------------------------------------

export interface XOAuditService {
  log(entry: AuditEntry): Promise<void>;
}

export interface ZikaronOutcomeStorage {
  storeOutcome(record: OutcomeRecord): Promise<void>;
  loadOutcomes(): Promise<OutcomeRecord[]>;
}

export interface QualityBaselineProvider {
  getBaseline(category: string): { minRating: number; minRetention: number };
}

export interface GTMIntegration {
  applyGTMAutomation(ideaId: string): Promise<void>;
}

export interface DesignIntelligenceProvider {
  getDesignStandards(category: string): { minDesignScore: number; requiredPatterns: string[] };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface IdeationLearningConfig {
  auditService: XOAuditService;
  outcomeStorage: ZikaronOutcomeStorage;
  scoringAlgorithm: NicheScoringAlgorithm;
  qualityBaseline?: QualityBaselineProvider;
  gtmIntegration?: GTMIntegration;
  designIntelligence?: DesignIntelligenceProvider;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IdeationLearningEngine {
  recordOutcome(performance: AppPerformanceData, scoreRecord: IdeaScoreRecord): Promise<OutcomeRecord>;
  calibrateWeights(): Promise<void>;
  auditAction(action: string, detail: Record<string, unknown>): Promise<void>;
  applyQualityBaseline(ideaId: string, category: string, performance?: AppPerformanceData): Promise<{ meetsBaseline: boolean; baseline: { minRating: number; minRetention: number } }>;
  applyGTMAutomation(ideaId: string): Promise<void>;
  applyDesignIntelligence(ideaId: string, category: string): Promise<{ meetsStandards: boolean; standards: { minDesignScore: number; requiredPatterns: string[] } }>;
  getOutcomeHistory(): Promise<OutcomeRecord[]>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class IdeationLearningEngineImpl implements IdeationLearningEngine {
  private readonly auditService: XOAuditService;
  private readonly outcomeStorage: ZikaronOutcomeStorage;
  private readonly scoringAlgorithm: NicheScoringAlgorithm;
  private readonly qualityBaseline: QualityBaselineProvider | null;
  private readonly gtmIntegration: GTMIntegration | null;
  private readonly designIntelligence: DesignIntelligenceProvider | null;

  constructor(config: IdeationLearningConfig) {
    this.auditService = config.auditService;
    this.outcomeStorage = config.outcomeStorage;
    this.scoringAlgorithm = config.scoringAlgorithm;
    this.qualityBaseline = config.qualityBaseline ?? null;
    this.gtmIntegration = config.gtmIntegration ?? null;
    this.designIntelligence = config.designIntelligence ?? null;
  }

  /**
   * Record outcome: correlate original idea scoring with actual results.
   * When a published app's performance data is available, store the correlation
   * between predicted niche score and actual downloads/revenue.
   *
   * Requirement 45f.20
   */
  async recordOutcome(
    performance: AppPerformanceData,
    scoreRecord: IdeaScoreRecord,
  ): Promise<OutcomeRecord> {
    const success = this.determineSuccess(performance);
    const correlationScore = this.computeCorrelation(scoreRecord, performance);

    const record: OutcomeRecord = {
      id: randomUUID(),
      ideaId: performance.ideaId,
      appName: performance.appName,
      originalScore: scoreRecord.nicheScore,
      originalFactors: scoreRecord.factors,
      actualDownloads: performance.actualDownloads,
      actualRevenue: performance.actualRevenue,
      success,
      correlationScore,
      recordedAt: new Date(),
    };

    await this.outcomeStorage.storeOutcome(record);

    // Audit the outcome recording with full traceability
    await this.auditAction('outcome_recorded', {
      ideaId: performance.ideaId,
      appName: performance.appName,
      success,
      correlationScore,
      originalScore: scoreRecord.nicheScore,
      originalCategory: scoreRecord.category,
      actualDownloads: performance.actualDownloads,
      actualRevenue: performance.actualRevenue,
      rating: performance.rating,
      retentionRate: performance.retentionRate,
      publishedAt: performance.publishedAt.toISOString(),
      measuredAt: performance.measuredAt.toISOString(),
      daysSincePublish: Math.floor(
        (performance.measuredAt.getTime() - performance.publishedAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
    });

    return record;
  }

  /**
   * Use outcome data to adjust niche scoring weights via updateWeights().
   * Loads all historical outcomes, converts them to the format expected by
   * the NicheScoringAlgorithm, and triggers weight recalibration.
   *
   * Requirement 45f.20
   */
  async calibrateWeights(): Promise<void> {
    const outcomes = await this.outcomeStorage.loadOutcomes();

    if (outcomes.length === 0) return;

    const historicalOutcomes: HistoricalOutcome[] = outcomes.map((o) => ({
      nicheCategory: 'general',
      actualDownloads: o.actualDownloads,
      actualRevenue: o.actualRevenue,
      predictedScore: o.originalScore,
      factors: o.originalFactors,
      success: o.success,
    }));

    const previousWeights = this.scoringAlgorithm.getWeights();
    await this.scoringAlgorithm.updateWeights(historicalOutcomes);
    const newWeights = this.scoringAlgorithm.getWeights();

    await this.auditAction('weights_calibrated', {
      outcomesUsed: outcomes.length,
      successfulOutcomes: outcomes.filter((o) => o.success).length,
      failedOutcomes: outcomes.filter((o) => !o.success).length,
      averageCorrelation: outcomes.reduce((sum, o) => sum + o.correlationScore, 0) / outcomes.length,
      previousWeights,
      newWeights,
    });
  }

  /**
   * Log all ideation actions to XO_Audit with full traceability.
   * Every ideation action (research cycles, niche scoring, idea generation,
   * pipeline updates) is logged with agent identity, timestamp, trace ID,
   * and structured detail.
   *
   * Requirement 45f.22
   */
  async auditAction(action: string, detail: Record<string, unknown>): Promise<void> {
    const entry: AuditEntry = {
      id: randomUUID(),
      action: `ideation.${action}`,
      agentId: 'zionx-ideation-engine',
      timestamp: new Date(),
      detail,
      traceId: randomUUID(),
      source: 'zionx.ideation',
    };

    await this.auditService.log(entry);
  }

  /**
   * Apply ZionX quality baselines to pipeline ideas.
   * Pipeline ideas inherit the same quality standards as manually created apps.
   * If performance data is provided, validates against the baseline thresholds.
   *
   * Requirement 45f.21
   */
  async applyQualityBaseline(
    ideaId: string,
    category: string,
    performance?: AppPerformanceData,
  ): Promise<{ meetsBaseline: boolean; baseline: { minRating: number; minRetention: number } }> {
    const baseline = this.qualityBaseline
      ? this.qualityBaseline.getBaseline(category)
      : { minRating: 4.0, minRetention: 0.3 };

    // If performance data is available, check against baseline thresholds
    let meetsBaseline = true;
    if (performance) {
      meetsBaseline =
        performance.rating >= baseline.minRating &&
        performance.retentionRate >= baseline.minRetention;
    }

    const auditAction = meetsBaseline ? 'quality_baseline_applied' : 'quality_baseline_check_failed';
    await this.auditAction(auditAction, {
      ideaId,
      category,
      baseline,
      meetsBaseline,
      ...(performance
        ? { actualRating: performance.rating, actualRetention: performance.retentionRate }
        : {}),
    });

    return { meetsBaseline, baseline };
  }

  /**
   * Apply GTM automation to pipeline ideas.
   * Pipeline ideas inherit the same go-to-market automation as manually created apps.
   *
   * Requirement 45f.21
   */
  async applyGTMAutomation(ideaId: string): Promise<void> {
    if (this.gtmIntegration) {
      await this.gtmIntegration.applyGTMAutomation(ideaId);
    }

    await this.auditAction('gtm_automation_applied', { ideaId });
  }

  /**
   * Apply design intelligence standards to pipeline ideas.
   * Pipeline ideas inherit the same design quality standards as manually created apps.
   *
   * Requirement 45f.21
   */
  async applyDesignIntelligence(
    ideaId: string,
    category: string,
  ): Promise<{ meetsStandards: boolean; standards: { minDesignScore: number; requiredPatterns: string[] } }> {
    const standards = this.designIntelligence
      ? this.designIntelligence.getDesignStandards(category)
      : { minDesignScore: 70, requiredPatterns: [] };

    await this.auditAction('design_intelligence_applied', {
      ideaId,
      category,
      standards,
    });

    return { meetsStandards: true, standards };
  }

  /**
   * Retrieve all stored outcome records for analysis and reporting.
   */
  async getOutcomeHistory(): Promise<OutcomeRecord[]> {
    return this.outcomeStorage.loadOutcomes();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private determineSuccess(performance: AppPerformanceData): boolean {
    // An app is considered successful if it achieves reasonable downloads and revenue
    return performance.actualDownloads >= 1000 && performance.actualRevenue >= 100;
  }

  private computeCorrelation(
    scoreRecord: IdeaScoreRecord,
    performance: AppPerformanceData,
  ): number {
    // Correlation: how well did the predicted score match actual performance
    // Normalize actual performance to a 0-100 scale comparable to niche score
    const normalizedDownloads = Math.min(performance.actualDownloads / 100000, 1) * 100;
    const normalizedRevenue = Math.min(performance.actualRevenue / 10000, 1) * 100;
    const actualScore = (normalizedDownloads + normalizedRevenue) / 2;
    const diff = Math.abs(scoreRecord.nicheScore - actualScore);
    return Math.max(0, 1 - diff / 100);
  }
}
