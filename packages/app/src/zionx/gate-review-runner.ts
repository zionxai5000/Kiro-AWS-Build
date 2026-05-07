/**
 * ZionX Gate Review Runner — orchestrates the gate-review state transition.
 *
 * Invokes the Reference Quality Gate BEFORE existing gate checks. If the
 * Reference Quality Gate fails, routes through the Auto-Rework Loop. If it
 * passes (or falls back with no baseline), proceeds to existing gates.
 *
 * The ReferenceQualityGate and AutoReworkLoop are optional dependencies —
 * if not provided, the runner skips reference quality evaluation and runs
 * only the existing gates (backward compatible).
 *
 * Requirements: 34f.32, 34f.33, 34f.36, 34g.38
 */

import type { GateResult } from '@seraphim/core';
import type {
  ReferenceQualityGate,
  ProductionOutput,
  GateEvaluationResult,
} from '@seraphim/services/reference-ingestion/gate/reference-quality-gate.js';
import type { AutoReworkLoop } from '@seraphim/services/reference-ingestion/rework/auto-rework-loop.js';

import { runAllGates } from './gates.js';
import type { AllGateInputs, AllGateResults } from './gates.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the ZionX gate review runner */
export interface ZionXGateReviewConfig {
  /** Optional Reference Quality Gate — skipped if not provided */
  referenceQualityGate?: ReferenceQualityGate;
  /** Optional Auto-Rework Loop — skipped if not provided */
  autoReworkLoop?: AutoReworkLoop;
  /** Domain category for quality gate evaluation (e.g., 'mobile-app') */
  domainCategory?: string;
}

/** Result of the full gate review process */
export interface GateReviewResult {
  /** Whether all gates passed (reference + existing) */
  allPassed: boolean;
  /** Reference quality gate evaluation result (undefined if skipped) */
  referenceGateResult?: GateEvaluationResult;
  /** Whether the reference gate was skipped (not configured or no baseline) */
  referenceGateSkipped: boolean;
  /** Whether rework was triggered */
  reworkTriggered: boolean;
  /** Result after rework (if rework was triggered and succeeded) */
  reworkResult?: GateEvaluationResult;
  /** Existing gate results */
  existingGateResults: AllGateResults;
  /** Combined gate results for audit trail */
  combinedResults: GateResult[];
}

// ---------------------------------------------------------------------------
// Gate Review Runner
// ---------------------------------------------------------------------------

export class ZionXGateReviewRunner {
  private readonly referenceQualityGate?: ReferenceQualityGate;
  private readonly autoReworkLoop?: AutoReworkLoop;
  private readonly domainCategory: string;

  constructor(config: ZionXGateReviewConfig) {
    this.referenceQualityGate = config.referenceQualityGate;
    this.autoReworkLoop = config.autoReworkLoop;
    this.domainCategory = config.domainCategory ?? 'mobile-app';
  }

  /**
   * Run the full gate review process:
   * 1. Evaluate against Reference Quality Gate (if configured)
   * 2. If reference gate fails and AutoReworkLoop is available, route through rework
   * 3. If reference gate passes (or falls back), run existing gates
   *
   * @param output - The production output to evaluate (app artifact)
   * @param gateInputs - Inputs for the existing gate checks
   * @returns Combined gate review result
   */
  async runGateReview(
    output: ProductionOutput,
    gateInputs: AllGateInputs,
  ): Promise<GateReviewResult> {
    const combinedResults: GateResult[] = [];

    // Step 1: Reference Quality Gate (optional)
    let referenceGateResult: GateEvaluationResult | undefined;
    let referenceGateSkipped = true;
    let reworkTriggered = false;
    let reworkResult: GateEvaluationResult | undefined;

    if (this.referenceQualityGate) {
      referenceGateResult = await this.referenceQualityGate.evaluate(
        output,
        this.domainCategory,
      );
      referenceGateSkipped = false;

      // Check if this is a fallback (no baseline) — treat as pass
      if (referenceGateResult.baselineVersion === null) {
        // No baseline available — fall back gracefully, existing gates still apply
        referenceGateSkipped = true;
        combinedResults.push({
          gateId: 'gate-reference-quality',
          gateName: 'Reference Quality Gate',
          passed: true,
          details: referenceGateResult.note ?? 'No baseline available — skipped reference quality evaluation',
        });
      } else if (referenceGateResult.passed) {
        // Reference gate passed
        combinedResults.push({
          gateId: 'gate-reference-quality',
          gateName: 'Reference Quality Gate',
          passed: true,
          details: `Reference quality gate passed with overall score ${referenceGateResult.overallScore.toFixed(1)} (baseline v${referenceGateResult.baselineVersion})`,
        });
      } else {
        // Reference gate failed — attempt rework if available
        if (this.autoReworkLoop && referenceGateResult.rejectionReport) {
          reworkTriggered = true;
          reworkResult = await this.autoReworkLoop.handleRejection(
            output,
            referenceGateResult.rejectionReport,
          );

          if (reworkResult.passed) {
            combinedResults.push({
              gateId: 'gate-reference-quality',
              gateName: 'Reference Quality Gate',
              passed: true,
              details: `Reference quality gate passed after rework with overall score ${reworkResult.overallScore.toFixed(1)}`,
            });
          } else {
            // Rework failed (escalated) — gate fails
            combinedResults.push({
              gateId: 'gate-reference-quality',
              gateName: 'Reference Quality Gate',
              passed: false,
              details: `Reference quality gate failed after rework. ${reworkResult.note ?? `Overall score: ${reworkResult.overallScore.toFixed(1)}`}`,
            });

            // Short-circuit: don't run existing gates if reference gate failed
            return {
              allPassed: false,
              referenceGateResult,
              referenceGateSkipped: false,
              reworkTriggered: true,
              reworkResult,
              existingGateResults: { results: [], allPassed: false, failedGates: ['gate-reference-quality'] },
              combinedResults,
            };
          }
        } else {
          // No rework loop available — gate fails
          combinedResults.push({
            gateId: 'gate-reference-quality',
            gateName: 'Reference Quality Gate',
            passed: false,
            details: `Reference quality gate failed with overall score ${referenceGateResult.overallScore.toFixed(1)} (baseline v${referenceGateResult.baselineVersion})`,
          });

          return {
            allPassed: false,
            referenceGateResult,
            referenceGateSkipped: false,
            reworkTriggered: false,
            existingGateResults: { results: [], allPassed: false, failedGates: ['gate-reference-quality'] },
            combinedResults,
          };
        }
      }
    }

    // Step 2: Run existing gates
    const existingGateResults = runAllGates(gateInputs);
    combinedResults.push(...existingGateResults.results);

    const allPassed = combinedResults.every(r => r.passed);

    return {
      allPassed,
      referenceGateResult,
      referenceGateSkipped,
      reworkTriggered,
      reworkResult,
      existingGateResults,
      combinedResults,
    };
  }
}
