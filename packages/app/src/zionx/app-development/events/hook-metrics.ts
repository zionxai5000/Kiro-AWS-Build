/**
 * In-memory metrics collector for App Development hooks.
 *
 * Tracks invocations, durations, and failures per hook. Surfaced via
 * GET /app-dev/metrics and consumed by the dashboard's pipeline-health card.
 *
 * Lives in the events/ folder because it sits next to the websocket-broadcaster
 * and event-types: it observes pipeline activity and produces an observable
 * snapshot. No external store yet — a process restart resets counters.
 */

export interface HookMetricSnapshot {
  hookId: string;
  invocations: number;
  successes: number;
  failures: number;
  totalDurationMs: number;
  /** Average duration across recorded runs (rounded). */
  avgDurationMs: number;
  /** Most recent failure timestamp (ISO) — undefined if never failed. */
  lastFailureAt?: string;
  /** Most recent error message — undefined if never failed. */
  lastError?: string;
  /** Most recent success timestamp (ISO). */
  lastSuccessAt?: string;
}

interface HookCounter {
  invocations: number;
  successes: number;
  failures: number;
  totalDurationMs: number;
  lastFailureAt?: string;
  lastError?: string;
  lastSuccessAt?: string;
}

const counters = new Map<string, HookCounter>();

function ensure(hookId: string): HookCounter {
  let counter = counters.get(hookId);
  if (!counter) {
    counter = { invocations: 0, successes: 0, failures: 0, totalDurationMs: 0 };
    counters.set(hookId, counter);
  }
  return counter;
}

/**
 * Record a hook invocation.
 *
 * Wrap any hook's run() in `recordHookExecution(hookId, () => run(...))` to get
 * automatic metrics. Errors are recorded as failures and re-thrown so the
 * caller still sees them.
 */
export async function recordHookExecution<T>(
  hookId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const counter = ensure(hookId);
  counter.invocations += 1;
  const start = Date.now();
  try {
    const result = await fn();
    counter.successes += 1;
    counter.totalDurationMs += Date.now() - start;
    counter.lastSuccessAt = new Date().toISOString();

    // Inspect HookResult shape — record failure if success===false
    if (
      typeof result === 'object' &&
      result !== null &&
      'success' in (result as Record<string, unknown>) &&
      (result as { success: boolean }).success === false
    ) {
      counter.successes -= 1;
      counter.failures += 1;
      const err = (result as { error?: string }).error;
      counter.lastError = err ?? 'hook returned success=false';
      counter.lastFailureAt = new Date().toISOString();
    }
    return result;
  } catch (err) {
    counter.failures += 1;
    counter.totalDurationMs += Date.now() - start;
    counter.lastError = (err as Error).message;
    counter.lastFailureAt = new Date().toISOString();
    throw err;
  }
}

/**
 * Manually record a failure (used by the escalation bridge when the watchdog
 * fires before the wrapped fn even returns).
 */
export function recordHookFailure(hookId: string, error: string): void {
  const counter = ensure(hookId);
  counter.failures += 1;
  counter.lastError = error;
  counter.lastFailureAt = new Date().toISOString();
}

/**
 * Get a snapshot of all hook metrics.
 */
export function getMetricsSnapshot(): HookMetricSnapshot[] {
  return Array.from(counters.entries()).map(([hookId, c]) => ({
    hookId,
    invocations: c.invocations,
    successes: c.successes,
    failures: c.failures,
    totalDurationMs: c.totalDurationMs,
    avgDurationMs: c.invocations > 0 ? Math.round(c.totalDurationMs / c.invocations) : 0,
    lastFailureAt: c.lastFailureAt,
    lastError: c.lastError,
    lastSuccessAt: c.lastSuccessAt,
  }));
}

/**
 * Get the rolling error rate across the most recent N invocations.
 * Used by GET /app-dev/health.
 */
export function getRecentErrorRate(): number {
  let invocations = 0;
  let failures = 0;
  for (const c of counters.values()) {
    invocations += c.invocations;
    failures += c.failures;
  }
  return invocations > 0 ? failures / invocations : 0;
}

/** Reset all counters — primarily for tests. */
export function resetMetrics(): void {
  counters.clear();
}
