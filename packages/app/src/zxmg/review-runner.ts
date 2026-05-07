/**
 * ZXMG Review Runner — orchestrates the video review state transition.
 *
 * Invokes the Reference Quality Gate BEFORE existing validation checks. If the
 * Reference Quality Gate fails, routes through the Auto-Rework Loop. If it
 * passes (or falls back with no baseline), proceeds to existing validation.
 *
 * The ReferenceQualityGate and AutoReworkLoop are optional dependencies —
 * if not provided, the runner skips reference quality evaluation and runs
 * only the existing validation (backward compatible).
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

import { validateContent } from './validation.js';
import type { AssembledVideo, ContentMetadata, ContentPlatform } from './pipeline.js';
import type { ValidationResult } from './validation.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the ZXMG review runner */
export interface ZXMGReviewConfig {
  /** Optional Reference Quality Gate — skipped if not provided */
  referenceQualityGate?: ReferenceQualityGate;
  /** Optional Auto-Rework Loop — skipped if not provided */
  autoReworkLoop?: AutoReworkLoop;
  /** Domain category for quality gate evaluation (e.g., 'video-content') */
  domainCategory?: string;
}

/** Result of the full review process */
export interface ReviewResult {
  /** Whether all checks passed (reference + existing validation) */
  allPassed: boolean;
  /** Reference quality gate evaluation result (undefined if skipped) */
  referenceGateResult?: GateEvaluationResult;
  /** Whether the reference gate was skipped (not configured or no baseline) */
  referenceGateSkipped: boolean;
  /** Whether rework was triggered */
  reworkTriggered: boolean;
  /** Result after rework (if rework was triggered and succeeded) */
  reworkResult?: GateEvaluationResult;
  /** Existing validation result */
  validationResult: ValidationResult;
  /** Combined gate results for audit trail */
  combinedResults: GateResult[];
}

// ---------------------------------------------------------------------------
// Review Runner
// ---------------------------------------------------------------------------

export class ZXMGReviewRunner {
  private readonly referenceQualityGate?: ReferenceQualityGate;
  private readonly autoReworkLoop?: AutoReworkLoop;
  private readonly domainCategory: string;

  constructor(config: ZXMGReviewConfig) {
    this.referenceQualityGate = config.referenceQualityGate;
    this.autoReworkLoop = config.autoReworkLoop;
    this.domainCategory = config.domainCategory ?? 'video-content';
  }

  /**
   * Run the full review process:
   * 1. Evaluate against Reference Quality Gate (if configured)
   * 2. If reference gate fails and AutoReworkLoop is available, route through rework
   * 3. If reference gate passes (or falls back), run existing validation
   *
   * @param output - The production output to evaluate (video artifact)
   * @param video - The assembled video to validate
   * @param metadata - The content metadata to validate
   * @param platform - The target platform for validation
   * @returns Combined review result
   */
  async runReview(
    output: ProductionOutput,
    video: AssembledVideo,
    metadata: ContentMetadata,
    platform: ContentPlatform,
  ): Promise<ReviewResult> {
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
        // No baseline available — fall back gracefully, existing validation still applies
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

            // Short-circuit: don't run existing validation if reference gate failed
            const emptyValidation: ValidationResult = {
              valid: false,
              platform,
              issues: [{ field: 'reference-quality', message: 'Reference quality gate failed', severity: 'error' }],
              validatedAt: new Date().toISOString(),
            };

            return {
              allPassed: false,
              referenceGateResult,
              referenceGateSkipped: false,
              reworkTriggered: true,
              reworkResult,
              validationResult: emptyValidation,
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

          const emptyValidation: ValidationResult = {
            valid: false,
            platform,
            issues: [{ field: 'reference-quality', message: 'Reference quality gate failed', severity: 'error' }],
            validatedAt: new Date().toISOString(),
          };

          return {
            allPassed: false,
            referenceGateResult,
            referenceGateSkipped: false,
            reworkTriggered: false,
            validationResult: emptyValidation,
            combinedResults,
          };
        }
      }
    }

    // Step 2: Run existing validation
    const validationResult = validateContent(video, metadata, platform);

    // Convert validation result to GateResult for combined tracking
    combinedResults.push({
      gateId: 'gate-content-validation',
      gateName: 'Content Validation',
      passed: validationResult.valid,
      details: validationResult.valid
        ? 'All content validation checks passed'
        : `Content validation failed: ${validationResult.issues.filter(i => i.severity === 'error').map(i => i.message).join('; ')}`,
    });

    const allPassed = combinedResults.every(r => r.passed);

    return {
      allPassed,
      referenceGateResult,
      referenceGateSkipped,
      reworkTriggered,
      reworkResult,
      validationResult,
      combinedResults,
    };
  }
}
