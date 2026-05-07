/**
 * Baseline Effectiveness Tracker — monitors Quality Gate pass rates over time
 * and correlates improvements with specific baseline updates.
 *
 * Key behaviors:
 * - Subscribes to quality gate evaluation events and baseline.updated events
 * - Tracks pass rate before/after each baseline update
 * - Identifies which reference ingestions contributed to quality improvements
 * - Records correlations in Zikaron procedural memory for continuous improvement tracking
 *
 * Requirements: 34h.49
 */

import { randomUUID } from 'node:crypto';

import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { EventBusService } from '@seraphim/core/interfaces/event-bus-service.js';
import type { SeraphimEvent } from '@seraphim/core/types/event.js';
import type { ProceduralEntry } from '@seraphim/core/types/memory.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single quality gate evaluation record */
export interface EvaluationRecord {
  /** Timestamp of the evaluation */
  timestamp: Date;
  /** Whether the evaluation passed */
  passed: boolean;
  /** Baseline version active at the time of evaluation */
  baselineVersion: number;
}

/** A baseline update record */
export interface BaselineUpdateRecord {
  /** Timestamp of the update */
  timestamp: Date;
  /** New baseline version */
  version: number;
  /** Source URLs that contributed to this baseline update */
  sourceUrls: string[];
}

/** Pass rate data for a specific window */
export interface PassRateWindow {
  /** Total evaluations in this window */
  totalEvaluations: number;
  /** Passed evaluations in this window */
  passedEvaluations: number;
  /** Pass rate (0-1) */
  passRate: number;
  /** Baseline version active during this window */
  baselineVersion: number;
}

/** Correlation between a baseline update and pass rate change */
export interface BaselineCorrelation {
  /** Domain category */
  domainCategory: string;
  /** Baseline version that caused the change */
  baselineVersion: number;
  /** Pass rate before the baseline update */
  passRateBefore: number;
  /** Pass rate after the baseline update */
  passRateAfter: number;
  /** Change in pass rate (positive = improvement) */
  passRateDelta: number;
  /** Source URLs that contributed to the baseline update */
  contributingReferences: string[];
  /** Timestamp when the correlation was recorded */
  recordedAt: Date;
}

/** Effectiveness report for a domain category */
export interface EffectivenessReport {
  /** Domain category */
  domainCategory: string;
  /** Current pass rate */
  currentPassRate: number;
  /** Total evaluations tracked */
  totalEvaluations: number;
  /** Pass rate trend over baseline versions */
  passRateTrend: PassRateWindow[];
  /** Correlations between baseline updates and pass rate changes */
  correlations: BaselineCorrelation[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_SOURCE = 'seraphim.baseline-effectiveness-tracker';
const QUALITY_GATE_EVALUATION_EVENT = 'quality-gate.evaluated';
const BASELINE_UPDATED_EVENT = 'baseline.updated';
const AGENT_ID = 'baseline-effectiveness-tracker';
const TENANT_ID = 'seraphim';

/**
 * Minimum number of evaluations required before/after a baseline update
 * to compute a meaningful correlation.
 */
const MIN_EVALUATIONS_FOR_CORRELATION = 3;

// ---------------------------------------------------------------------------
// Baseline Effectiveness Tracker
// ---------------------------------------------------------------------------

export class BaselineEffectivenessTracker {
  /** Evaluation records indexed by domain category */
  private readonly evaluations = new Map<string, EvaluationRecord[]>();

  /** Baseline update records indexed by domain category */
  private readonly baselineUpdates = new Map<string, BaselineUpdateRecord[]>();

  /** Recorded correlations indexed by domain category */
  private readonly correlations = new Map<string, BaselineCorrelation[]>();

  /** Event subscription IDs for cleanup */
  private readonly subscriptionIds: string[] = [];

  constructor(
    private readonly zikaronService: ZikaronService,
    private readonly eventBusService: EventBusService,
  ) {}

  /**
   * Initializes the tracker by subscribing to quality gate evaluation
   * and baseline update events.
   */
  async initialize(): Promise<void> {
    const evalSubId = await this.eventBusService.subscribe(
      { type: [QUALITY_GATE_EVALUATION_EVENT] },
      this.handleQualityGateEvaluation.bind(this),
    );
    this.subscriptionIds.push(evalSubId);

    const baselineSubId = await this.eventBusService.subscribe(
      { type: [BASELINE_UPDATED_EVENT] },
      this.handleBaselineUpdated.bind(this),
    );
    this.subscriptionIds.push(baselineSubId);
  }

  /**
   * Records a quality gate evaluation result for a domain category.
   *
   * @param domainCategory - The domain category being evaluated
   * @param passed - Whether the evaluation passed
   * @param baselineVersion - The baseline version used for evaluation
   */
  recordEvaluation(domainCategory: string, passed: boolean, baselineVersion: number): void {
    const record: EvaluationRecord = {
      timestamp: new Date(),
      passed,
      baselineVersion,
    };

    const records = this.evaluations.get(domainCategory) ?? [];
    records.push(record);
    this.evaluations.set(domainCategory, records);
  }

  /**
   * Records a baseline update for a domain category and computes correlations
   * if sufficient evaluation data exists.
   *
   * @param domainCategory - The domain category whose baseline was updated
   * @param version - The new baseline version number
   * @param sourceUrls - Source URLs that contributed to this baseline update
   */
  async recordBaselineUpdate(
    domainCategory: string,
    version: number,
    sourceUrls: string[],
  ): Promise<void> {
    const record: BaselineUpdateRecord = {
      timestamp: new Date(),
      version,
      sourceUrls,
    };

    const updates = this.baselineUpdates.get(domainCategory) ?? [];
    updates.push(record);
    this.baselineUpdates.set(domainCategory, updates);

    // Attempt to compute correlation with previous baseline version
    await this.computeAndRecordCorrelation(domainCategory, record);
  }

  /**
   * Returns an effectiveness report for a domain category, including
   * pass rate trends and correlations between baseline updates and improvements.
   *
   * @param domainCategory - The domain category to report on
   * @returns Effectiveness report with trends and correlations
   */
  getEffectivenessReport(domainCategory: string): EffectivenessReport {
    const evaluations = this.evaluations.get(domainCategory) ?? [];
    const correlations = this.correlations.get(domainCategory) ?? [];

    // Compute current pass rate
    const currentPassRate =
      evaluations.length > 0
        ? evaluations.filter(e => e.passed).length / evaluations.length
        : 0;

    // Compute pass rate trend by baseline version
    const passRateTrend = this.computePassRateTrend(evaluations);

    return {
      domainCategory,
      currentPassRate,
      totalEvaluations: evaluations.length,
      passRateTrend,
      correlations,
    };
  }

  /**
   * Cleans up event subscriptions.
   */
  async dispose(): Promise<void> {
    for (const subId of this.subscriptionIds) {
      await this.eventBusService.unsubscribe(subId);
    }
    this.subscriptionIds.length = 0;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Handles quality gate evaluation events by recording the result.
   */
  private async handleQualityGateEvaluation(event: SeraphimEvent): Promise<void> {
    const domainCategory = event.detail.domainCategory as string | undefined;
    const passed = event.detail.passed as boolean | undefined;
    const baselineVersion = event.detail.baselineVersion as number | undefined;

    if (domainCategory && passed !== undefined && baselineVersion !== undefined) {
      this.recordEvaluation(domainCategory, passed, baselineVersion);
    }
  }

  /**
   * Handles baseline.updated events by recording the update and computing correlations.
   */
  private async handleBaselineUpdated(event: SeraphimEvent): Promise<void> {
    const domainCategory = event.detail.domainCategory as string | undefined;
    const version = event.detail.version as number | undefined;

    if (domainCategory && version !== undefined) {
      // Extract source URLs from the event if available, otherwise use empty array
      const sourceUrls = (event.detail.sourceUrls as string[]) ?? [];
      await this.recordBaselineUpdate(domainCategory, version, sourceUrls);
    }
  }

  /**
   * Computes the correlation between a baseline update and pass rate change.
   * Only records a correlation if there are sufficient evaluations before and after.
   */
  private async computeAndRecordCorrelation(
    domainCategory: string,
    update: BaselineUpdateRecord,
  ): Promise<void> {
    const evaluations = this.evaluations.get(domainCategory) ?? [];
    const updates = this.baselineUpdates.get(domainCategory) ?? [];

    // Need at least 2 baseline versions to compute a correlation
    if (updates.length < 2) {
      return;
    }

    const previousUpdate = updates[updates.length - 2];

    // Get evaluations before this update (using previous baseline version)
    const evalsBefore = evaluations.filter(
      e => e.baselineVersion === previousUpdate.version,
    );

    // Get evaluations after this update (using current baseline version)
    const evalsAfter = evaluations.filter(
      e => e.baselineVersion === update.version,
    );

    // Need minimum evaluations for a meaningful correlation
    if (evalsBefore.length < MIN_EVALUATIONS_FOR_CORRELATION) {
      return;
    }

    // If we have evaluations after (may be 0 initially), compute correlation
    const passRateBefore =
      evalsBefore.filter(e => e.passed).length / evalsBefore.length;
    const passRateAfter =
      evalsAfter.length > 0
        ? evalsAfter.filter(e => e.passed).length / evalsAfter.length
        : passRateBefore;

    const correlation: BaselineCorrelation = {
      domainCategory,
      baselineVersion: update.version,
      passRateBefore,
      passRateAfter,
      passRateDelta: passRateAfter - passRateBefore,
      contributingReferences: update.sourceUrls,
      recordedAt: new Date(),
    };

    // Store correlation in memory
    const correlations = this.correlations.get(domainCategory) ?? [];
    correlations.push(correlation);
    this.correlations.set(domainCategory, correlations);

    // Record in Zikaron for continuous improvement tracking
    await this.storeCorrelationInZikaron(correlation);
  }

  /**
   * Stores a baseline correlation in Zikaron procedural memory.
   */
  private async storeCorrelationInZikaron(correlation: BaselineCorrelation): Promise<void> {
    const entry: ProceduralEntry = {
      id: randomUUID(),
      tenantId: TENANT_ID,
      layer: 'procedural',
      content: JSON.stringify(correlation),
      embedding: [],
      sourceAgentId: AGENT_ID,
      tags: [
        'baseline-effectiveness',
        `domain:${correlation.domainCategory}`,
        `version:${correlation.baselineVersion}`,
        `delta:${correlation.passRateDelta > 0 ? 'improvement' : 'regression'}`,
        ...correlation.contributingReferences.map(url => `reference:${url}`),
      ],
      createdAt: new Date(),
      workflowPattern: `baseline-effectiveness:${correlation.domainCategory}`,
      successRate: correlation.passRateAfter,
      executionCount: 1,
      prerequisites: [],
      steps: [
        {
          order: 1,
          action: 'baseline_update',
          description: `Baseline updated to version ${correlation.baselineVersion}`,
          expectedOutcome: `Pass rate change: ${(correlation.passRateDelta * 100).toFixed(1)}%`,
        },
      ],
    };

    await this.zikaronService.storeProcedural(entry);
  }

  /**
   * Computes pass rate trend grouped by baseline version.
   */
  private computePassRateTrend(evaluations: EvaluationRecord[]): PassRateWindow[] {
    // Group evaluations by baseline version
    const byVersion = new Map<number, EvaluationRecord[]>();
    for (const evaluation of evaluations) {
      const group = byVersion.get(evaluation.baselineVersion) ?? [];
      group.push(evaluation);
      byVersion.set(evaluation.baselineVersion, group);
    }

    // Compute pass rate for each version window
    const trend: PassRateWindow[] = [];
    const sortedVersions = [...byVersion.keys()].sort((a, b) => a - b);

    for (const version of sortedVersions) {
      const versionEvals = byVersion.get(version)!;
      const passedCount = versionEvals.filter(e => e.passed).length;

      trend.push({
        totalEvaluations: versionEvals.length,
        passedEvaluations: passedCount,
        passRate: passedCount / versionEvals.length,
        baselineVersion: version,
      });
    }

    return trend;
  }
}
