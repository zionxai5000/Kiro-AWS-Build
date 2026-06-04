/**
 * Quality-gate hook shared types.
 *
 * Hooks 11 (visual-polish), 12 (persistence), 13 (domain-fitness) all
 * return a QualityCheckResult so the orchestrator can aggregate them
 * into a single retry directive.
 */

/**
 * One named check inside a validator. The validator emits a list of
 * these so the dashboard / re-prompt machinery can show / target the
 * specific failures.
 */
export interface QualityCheck {
  /** Stable id, e.g. "gradient-rendered" */
  id: string;
  /** Human-readable label, e.g. "expo-linear-gradient imported and rendered" */
  label: string;
  /** Score awarded when the check passes (0 if it fails). */
  weight: number;
  /** Whether failing this check forces the overall validator to fail. */
  hardFail: boolean;
  /** True if the check passed against the generated code. */
  passed: boolean;
  /** Optional 1-line explanation of the gap when passed=false. */
  evidence?: string;
}

/** Aggregate of one validator's run. */
export interface QualityScore {
  /** Total points awarded across all weighted checks (0..100). */
  total: number;
  /** All checks performed (passed + failed). */
  breakdown: QualityCheck[];
  /** True if hard requirements satisfied AND total >= passThreshold. */
  passed: boolean;
  /** Pass threshold used (defaults to 70 for visual-polish). */
  passThreshold: number;
  /** Subset of breakdown where passed=false (convenience). */
  failedChecks: QualityCheck[];
}

/**
 * Aggregated directive from all validators that gets fed back to the LLM
 * when one or more hooks fail. The orchestrator builds this and prepends
 * it to the original prompt for the next generation pass.
 */
export interface RetryDirective {
  retryNumber: number; // 1 or 2
  scores: {
    visualPolish?: QualityScore;
    persistence?: QualityScore;
    domainFitness?: QualityScore;
  };
  /** Files to regenerate (relative paths). */
  filesToFix: string[];
  /** Bullet list of failures to inject into the next prompt. */
  failureBullets: string[];
}

/** Spec card emitted by the agent before file generation (Hook 14). */
export interface SpecCard {
  domain: string;
  userGoal: string;
  screens: string[];
  stateModel: string;
  seed: string;
  persistence: string;
  visualAnchor: string;
  hero: string;
  emptyState: string;
  failCheck: string;
}
