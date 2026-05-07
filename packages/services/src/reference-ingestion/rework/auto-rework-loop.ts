/**
 * Auto-Rework Loop — routes rejected production outputs back through the Training Cascade
 * with remediation guidance, tracks iterations, and escalates after repeated failures.
 *
 * Key behaviors:
 * - Routes rejected output back through Training Cascade with rejection report as remediation guidance
 * - Includes in rework directive: failed dimensions, gap between achieved and required scores, example patterns
 * - Re-evaluates reworked output against same baseline version that triggered original rejection
 * - Tracks iteration count, time elapsed, and score progression across attempts
 * - Escalates to King after 5 failed rework attempts with summary of all attempts and recommendation
 * - On successful rework: records the successful rework pattern in Zikaron procedural memory
 *
 * Requirements: 34g.38, 34g.39, 34g.40, 34g.41, 34g.42, 34g.43
 */

import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { ProceduralEntry, ProcedureStep } from '@seraphim/core/types/memory.js';

import type { ReferenceQualityGate } from '../gate/reference-quality-gate.js';
import type {
  ProductionOutput,
  RejectionReport,
  DimensionScore,
  GateEvaluationResult,
} from '../gate/reference-quality-gate.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Directive sent to the Training Cascade for rework */
export interface ReworkDirective {
  /** The output to rework */
  output: ProductionOutput;
  /** Dimensions that failed evaluation */
  failedDimensions: DimensionScore[];
  /** Gap descriptions between achieved and required scores */
  gaps: Array<{ dimension: string; achieved: number; required: number; gap: string }>;
  /** Example patterns from the baseline to guide rework */
  examplePatterns: Array<{ dimension: string; patterns: string[] }>;
  /** Current iteration count (1-based) */
  iterationCount: number;
  /** The rejection report that triggered this rework */
  rejectionReport: RejectionReport;
}

/** Result returned by the Training Cascade after rework */
export interface ReworkResult {
  /** The reworked production output */
  reworkedOutput: ProductionOutput;
}

/** Interface for the Training Cascade rework capability */
export interface TrainingCascade {
  /** Rework an output based on the provided directive */
  rework(directive: ReworkDirective): Promise<ReworkResult>;
}

/** Score progression entry for tracking improvement across attempts */
export interface ScoreProgressionEntry {
  /** Iteration number (1-based) */
  iteration: number;
  /** Timestamp of this attempt */
  timestamp: Date;
  /** Per-dimension scores for this attempt */
  dimensionScores: DimensionScore[];
  /** Overall score for this attempt */
  overallScore: number;
  /** Whether this attempt passed */
  passed: boolean;
}

/** Tracks rework state for a single output */
export interface ReworkTracker {
  /** Unique output ID being tracked */
  outputId: string;
  /** Number of rework iterations completed */
  iterationCount: number;
  /** When the rework process started */
  startTime: Date;
  /** Score progression across all attempts */
  scoreProgression: ScoreProgressionEntry[];
  /** The baseline version used for all evaluations */
  baselineVersion: number;
  /** The domain category for re-evaluation */
  domainCategory: string;
}

/** Recommendation type for escalation */
export type EscalationRecommendation =
  | 'lower_threshold'
  | 'provide_additional_references'
  | 'accept_current_quality';

/** Escalation request sent to the King after max attempts */
export interface EscalationRequest {
  /** The output that could not pass quality gate */
  output: ProductionOutput;
  /** Total number of rework attempts made */
  attemptCount: number;
  /** Time elapsed since first attempt */
  timeElapsed: number;
  /** Score progression across all attempts */
  scoreProgression: ScoreProgressionEntry[];
  /** Dimensions that persistently failed */
  persistentGaps: Array<{ dimension: string; bestAchieved: number; required: number }>;
  /** Recommended action */
  recommendation: EscalationRecommendation;
  /** Summary of all attempts */
  summary: string;
}

/** Callback for escalation notifications to the King */
export type EscalationCallback = (request: EscalationRequest) => Promise<void>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_REWORK_ATTEMPTS = 5;
const AGENT_ID = 'auto-rework-loop';
const TENANT_ID = 'seraphim';

// ---------------------------------------------------------------------------
// Auto-Rework Loop
// ---------------------------------------------------------------------------

export class AutoReworkLoop {
  /** Active rework trackers by output ID */
  private readonly trackers = new Map<string, ReworkTracker>();

  constructor(
    private readonly qualityGate: ReferenceQualityGate,
    private readonly trainingCascade: TrainingCascade,
    private readonly zikaronService: ZikaronService,
    private readonly onEscalation: EscalationCallback,
  ) {}

  /**
   * Handles a rejection by routing the output back through the Training Cascade
   * with remediation guidance. Iterates until the output passes or max attempts reached.
   *
   * @param output - The rejected production output
   * @param rejectionReport - The rejection report from the quality gate
   * @returns The final evaluation result (pass or escalation)
   */
  async handleRejection(
    output: ProductionOutput,
    rejectionReport: RejectionReport,
  ): Promise<GateEvaluationResult> {
    // Initialize or retrieve tracker
    const tracker = this.getOrCreateTracker(output, rejectionReport);

    // Record initial rejection in score progression
    if (tracker.scoreProgression.length === 0) {
      tracker.scoreProgression.push({
        iteration: 0,
        timestamp: new Date(),
        dimensionScores: rejectionReport.allScores,
        overallScore: this.calculateOverallScore(rejectionReport.allScores),
        passed: false,
      });
    }

    let currentOutput = output;
    let currentRejection = rejectionReport;

    while (tracker.iterationCount < MAX_REWORK_ATTEMPTS) {
      tracker.iterationCount++;

      // Build rework directive with failed dimensions, gaps, and example patterns
      const directive = this.buildReworkDirective(
        currentOutput,
        currentRejection,
        tracker.iterationCount,
      );

      // Route through Training Cascade
      const reworkResult = await this.trainingCascade.rework(directive);
      currentOutput = reworkResult.reworkedOutput;

      // Re-evaluate against same baseline version
      const evaluationResult = await this.qualityGate.evaluate(
        currentOutput,
        tracker.domainCategory,
      );

      // Record score progression
      tracker.scoreProgression.push({
        iteration: tracker.iterationCount,
        timestamp: new Date(),
        dimensionScores: evaluationResult.dimensionScores,
        overallScore: evaluationResult.overallScore,
        passed: evaluationResult.passed,
      });

      // Success: record pattern in Zikaron and return
      if (evaluationResult.passed) {
        await this.recordSuccessfulReworkPattern(output, tracker);
        this.trackers.delete(output.id);
        return evaluationResult;
      }

      // Update current rejection for next iteration
      currentRejection = evaluationResult.rejectionReport!;
    }

    // Max attempts reached: escalate to King
    const escalationRequest = this.buildEscalationRequest(output, tracker);
    await this.onEscalation(escalationRequest);

    // Return the last evaluation result
    const lastProgression = tracker.scoreProgression[tracker.scoreProgression.length - 1];
    this.trackers.delete(output.id);

    return {
      passed: false,
      dimensionScores: lastProgression.dimensionScores,
      overallScore: lastProgression.overallScore,
      baselineVersion: tracker.baselineVersion,
      rejectionReport: currentRejection,
      note: `Escalated to King after ${MAX_REWORK_ATTEMPTS} failed rework attempts`,
    };
  }

  /**
   * Returns the current tracker for an output, if one exists.
   * Useful for inspecting rework state externally.
   */
  getTracker(outputId: string): ReworkTracker | undefined {
    return this.trackers.get(outputId);
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Gets or creates a rework tracker for the given output.
   */
  private getOrCreateTracker(output: ProductionOutput, rejectionReport: RejectionReport): ReworkTracker {
    const existing = this.trackers.get(output.id);
    if (existing) {
      return existing;
    }

    const tracker: ReworkTracker = {
      outputId: output.id,
      iterationCount: 0,
      startTime: new Date(),
      scoreProgression: [],
      baselineVersion: rejectionReport.baselineVersion,
      domainCategory: rejectionReport.domainCategory,
    };

    this.trackers.set(output.id, tracker);
    return tracker;
  }

  /**
   * Builds a rework directive from the rejection report.
   */
  private buildReworkDirective(
    output: ProductionOutput,
    rejectionReport: RejectionReport,
    iterationCount: number,
  ): ReworkDirective {
    const failedDimensions = rejectionReport.failedDimensions;

    const gaps = failedDimensions.map(d => ({
      dimension: d.dimension,
      achieved: d.achievedScore,
      required: d.requiredScore,
      gap: d.gap || `Scored ${d.achievedScore}/${d.requiredScore} on ${d.dimension}`,
    }));

    // Extract example patterns from the rejection report's all scores
    // (patterns are embedded in the gap descriptions from the quality gate)
    const examplePatterns = failedDimensions.map(d => ({
      dimension: d.dimension,
      patterns: this.extractPatternsFromGap(d.gap),
    }));

    return {
      output,
      failedDimensions,
      gaps,
      examplePatterns,
      iterationCount,
      rejectionReport,
    };
  }

  /**
   * Extracts example patterns from a gap description.
   * Gap descriptions from the quality gate include "Missing patterns: ..." text.
   */
  private extractPatternsFromGap(gap?: string): string[] {
    if (!gap) return [];

    const patternMatch = gap.match(/Missing patterns: (.+)$/);
    if (patternMatch) {
      return patternMatch[1].split(', ').map(p => p.trim());
    }

    return [gap];
  }

  /**
   * Calculates overall score from dimension scores.
   */
  private calculateOverallScore(scores: DimensionScore[]): number {
    if (scores.length === 0) return 0;
    return scores.reduce((sum, s) => sum + s.achievedScore, 0) / scores.length;
  }

  /**
   * Builds an escalation request after max attempts are exhausted.
   */
  private buildEscalationRequest(output: ProductionOutput, tracker: ReworkTracker): EscalationRequest {
    const timeElapsed = Date.now() - tracker.startTime.getTime();

    // Identify persistently failing dimensions
    const persistentGaps = this.identifyPersistentGaps(tracker);

    // Determine recommendation based on score progression
    const recommendation = this.determineRecommendation(tracker, persistentGaps);

    // Build summary
    const summary = this.buildEscalationSummary(tracker, persistentGaps);

    return {
      output,
      attemptCount: tracker.iterationCount,
      timeElapsed,
      scoreProgression: tracker.scoreProgression,
      persistentGaps,
      recommendation,
      summary,
    };
  }

  /**
   * Identifies dimensions that persistently failed across all attempts.
   */
  private identifyPersistentGaps(
    tracker: ReworkTracker,
  ): Array<{ dimension: string; bestAchieved: number; required: number }> {
    // Get all dimension names from the latest attempt
    const lastEntry = tracker.scoreProgression[tracker.scoreProgression.length - 1];
    if (!lastEntry) return [];

    const failedDimensions = lastEntry.dimensionScores.filter(d => !d.passed);

    return failedDimensions.map(d => {
      // Find the best score achieved for this dimension across all attempts
      let bestAchieved = 0;
      for (const entry of tracker.scoreProgression) {
        const dimScore = entry.dimensionScores.find(s => s.dimension === d.dimension);
        if (dimScore && dimScore.achievedScore > bestAchieved) {
          bestAchieved = dimScore.achievedScore;
        }
      }

      return {
        dimension: d.dimension,
        bestAchieved,
        required: d.requiredScore,
      };
    });
  }

  /**
   * Determines the escalation recommendation based on score progression.
   */
  private determineRecommendation(
    tracker: ReworkTracker,
    persistentGaps: Array<{ dimension: string; bestAchieved: number; required: number }>,
  ): EscalationRecommendation {
    // If scores are improving but not enough, suggest additional references
    const isImproving = this.isScoreImproving(tracker);

    // If gaps are very small (within 1 point), suggest lowering threshold
    const allGapsSmall = persistentGaps.every(g => g.required - g.bestAchieved <= 1);

    if (allGapsSmall) {
      return 'lower_threshold';
    }

    if (isImproving) {
      return 'provide_additional_references';
    }

    return 'accept_current_quality';
  }

  /**
   * Checks if scores are generally improving across iterations.
   */
  private isScoreImproving(tracker: ReworkTracker): boolean {
    const progression = tracker.scoreProgression;
    if (progression.length < 2) return false;

    const firstScore = progression[0].overallScore;
    const lastScore = progression[progression.length - 1].overallScore;

    return lastScore > firstScore;
  }

  /**
   * Builds a human-readable escalation summary.
   */
  private buildEscalationSummary(
    tracker: ReworkTracker,
    persistentGaps: Array<{ dimension: string; bestAchieved: number; required: number }>,
  ): string {
    const timeElapsedMs = Date.now() - tracker.startTime.getTime();
    const timeElapsedSec = Math.round(timeElapsedMs / 1000);

    const gapDescriptions = persistentGaps
      .map(g => `${g.dimension}: best ${g.bestAchieved}/${g.required}`)
      .join('; ');

    const scoreHistory = tracker.scoreProgression
      .map(e => `Attempt ${e.iteration}: ${e.overallScore.toFixed(1)}`)
      .join(', ');

    return (
      `Auto-rework failed after ${tracker.iterationCount} attempts over ${timeElapsedSec}s. ` +
      `Persistent gaps: ${gapDescriptions}. ` +
      `Score progression: ${scoreHistory}.`
    );
  }

  /**
   * Records a successful rework pattern in Zikaron procedural memory
   * so the system can avoid similar issues in the future.
   */
  private async recordSuccessfulReworkPattern(
    output: ProductionOutput,
    tracker: ReworkTracker,
  ): Promise<void> {
    const steps: ProcedureStep[] = tracker.scoreProgression.map((entry, index) => ({
      order: index + 1,
      action: entry.passed ? 'successful_rework' : 'rework_attempt',
      description: `Iteration ${entry.iteration}: overall score ${entry.overallScore.toFixed(1)}`,
      expectedOutcome: entry.passed ? 'pass' : 'fail',
    }));

    const proceduralEntry: ProceduralEntry = {
      id: `rework-pattern-${output.id}-${Date.now()}`,
      tenantId: TENANT_ID,
      layer: 'procedural',
      content: `Successful rework pattern for ${output.type} output "${output.name}". ` +
        `Resolved after ${tracker.iterationCount} iterations. ` +
        `Domain: ${tracker.domainCategory}. ` +
        `Initial score: ${tracker.scoreProgression[0]?.overallScore.toFixed(1) ?? 'N/A'}, ` +
        `Final score: ${tracker.scoreProgression[tracker.scoreProgression.length - 1]?.overallScore.toFixed(1) ?? 'N/A'}.`,
      embedding: [],
      sourceAgentId: AGENT_ID,
      tags: ['rework', 'quality-gate', output.type, tracker.domainCategory],
      createdAt: new Date(),
      workflowPattern: `rework-${output.type}-${tracker.domainCategory}`,
      successRate: 1,
      executionCount: 1,
      prerequisites: [`baseline-version-${tracker.baselineVersion}`],
      steps,
    };

    await this.zikaronService.storeProcedural(proceduralEntry);
  }
}
