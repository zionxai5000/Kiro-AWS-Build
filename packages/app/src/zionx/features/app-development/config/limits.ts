/**
 * Rate limits, timeouts, and budget ceilings for the App Development feature.
 */

export const LIMITS = {
  /** Default timeout for LLM API calls (ms) */
  llmTimeoutMs: 60_000,

  /** Timeout for build preparation (ms) */
  buildPrepTimeoutMs: 60_000,

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

  /** Code generation streaming timeout (ms) */
  codeGenerationTimeoutMs: 120_000,

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

  /** Telegram message max length */
  telegramMaxLength: 4096,
} as const;
