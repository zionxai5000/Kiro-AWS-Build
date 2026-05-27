/**
 * Rate limits, timeouts, and budget ceilings for the App Development pipeline.
 */

export const LIMITS = {
  /** Default timeout for LLM API calls (ms) */
  llmTimeoutMs: 60_000,

  /** Timeout for build preparation (ms) */
  buildPrepTimeoutMs: 60_000,

  /**
   * EAS build submission timeout (includes project upload +
   * eas CLI subprocess time before --no-wait returns).
   * Was 120s, increased to 300s during Phase 6 Group G
   * verification — EAS CLI needs time to resolve config and
   * upload the project tarball.
   */
  buildSubmissionTimeoutMs: 300_000,

  /** Timeout for asset generation (ms) — these are expensive */
  assetGenerationTimeoutMs: 300_000,

  /** Timeout for dependency validation (ms) */
  dependencyValidationTimeoutMs: 30_000,

  /** Timeout for secret scanning (ms) */
  secretScanTimeoutMs: 5_000,

  /** Timeout for prompt sanitization (ms) */
  sanitizerTimeoutMs: 10_000,

  /** Timeout for preview refresh (ms) */
  previewRefreshTimeoutMs: 10_000,

  /** Timeout for store listing generation (ms) */
  storeListingTimeoutMs: 60_000,

  /** Timeout for submission prep (ms) */
  submissionPrepTimeoutMs: 30_000,

  /**
   * EAS submit timeout (ms) — covers `eas submit` upload to App Store Connect
   * or Google Play. iOS submissions can take up to 15 minutes when ASC is busy.
   */
  submitTimeoutMs: 900_000,

  /**
   * Total time-budget for the TestFlight watcher (ms) — Apple build processing
   * usually completes within 5-10 minutes, but can stall up to 60.
   */
  testflightWatcherTimeoutMs: 3_600_000,

  /** Polling interval for ASC build state (ms) — Apple recommends >=30s */
  testflightPollIntervalMs: 30_000,

  /** Code generation streaming timeout (ms) — 6 min required for Phase 8.5 expanded prompt */
  codeGenerationTimeoutMs: 360_000,

  /** Code generation max output tokens — 40K needed for 36-file apps */
  codeGenerationMaxTokens: 40_960,

  /** Max retries for any retriable operation */
  maxRetries: 3,

  /** Exponential backoff delays (ms) */
  retryBackoffMs: [1_000, 3_000, 9_000] as const,

  /** Debounce for file-watch hooks (ms) */
  debounceMs: 500,

  /** Circuit breaker: failures before auto-disable */
  circuitBreakerThreshold: 5,

  /** Circuit breaker: window for counting failures (ms) */
  circuitBreakerWindowMs: 60_000,

  /** Circuit breaker: cooldown after tripping (ms) */
  circuitBreakerCooldownMs: 300_000,

  /** Max concurrent hook executions per project */
  maxConcurrentPerProject: 1,

  /** Max concurrent hook executions globally */
  maxConcurrentGlobal: 5,

  /** Max concurrent asset generation calls (expensive) */
  maxConcurrentAssetGeneration: 3,

  /** Max concurrent secret scans */
  maxConcurrentSecretScans: 10,

  /** Per-user daily budget for paid API calls (USD) */
  dailyBudgetUsd: 10.0,

  /** Sentry provisioner timeout (ms) */
  sentryProvisionerTimeoutMs: 60_000,

  /**
   * Escalation watchdog default timeout per hook (ms).
   * If a hook's run() doesn't return within this window, the escalation
   * bridge fires a self-heal attempt, then surfaces it to operators.
   */
  escalationWatchdogMs: 30_000,

  /** Self-heal agent max LLM tokens per repair attempt */
  selfHealMaxTokens: 4_000,

  /** Self-heal agent timeout (ms) */
  selfHealTimeoutMs: 45_000,
} as const;
