/**
 * Circuit Breaker — prevents cascading failures by disabling a hook
 * after repeated failures.
 *
 * States:
 * - CLOSED: normal operation, requests pass through
 * - OPEN: failures exceeded threshold, requests are rejected immediately
 * - HALF_OPEN: cooldown expired, next request is a probe (success → CLOSED, failure → OPEN)
 *
 * Per the steering doc:
 * - Opens after 5 failures in 60 seconds
 * - Stays open for 5 minutes
 * - Then half-opens (one probe request allowed)
 */

import { LIMITS } from '../config/limits.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half_open';

export class CircuitOpenError extends Error {
  public readonly hookId: string;
  public readonly reopensAt: number;

  constructor(hookId: string, reopensAt: number) {
    const remainingMs = Math.max(0, reopensAt - Date.now());
    super(`Circuit breaker OPEN for hook "${hookId}" — reopens in ${Math.ceil(remainingMs / 1000)}s`);
    this.name = 'CircuitOpenError';
    this.hookId = hookId;
    this.reopensAt = reopensAt;
  }
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening (default: 5) */
  threshold?: number;
  /** Window in ms for counting failures (default: 60000) */
  windowMs?: number;
  /** Cooldown in ms before half-opening (default: 300000) */
  cooldownMs?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CircuitBreaker {
  public readonly hookId: string;

  private state: CircuitState = 'closed';
  private failures: number[] = []; // timestamps of recent failures
  private openedAt: number | null = null;

  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;

  constructor(hookId: string, opts: CircuitBreakerOptions = {}) {
    this.hookId = hookId;
    this.threshold = opts.threshold ?? LIMITS.circuitBreakerThreshold;
    this.windowMs = opts.windowMs ?? LIMITS.circuitBreakerWindowMs;
    this.cooldownMs = opts.cooldownMs ?? LIMITS.circuitBreakerCooldownMs;
  }

  /**
   * Get the current circuit state.
   */
  getState(): CircuitState {
    this.evaluateState();
    return this.state;
  }

  /**
   * Check if a request is allowed through the circuit.
   * Throws CircuitOpenError if the circuit is open.
   */
  allowRequest(): void {
    this.evaluateState();

    if (this.state === 'open') {
      throw new CircuitOpenError(this.hookId, (this.openedAt ?? 0) + this.cooldownMs);
    }
    // 'closed' and 'half_open' allow requests
  }

  /**
   * Record a successful execution. Resets the circuit to closed.
   */
  recordSuccess(): void {
    if (this.state === 'half_open') {
      this.state = 'closed';
    }
    this.failures = [];
    this.openedAt = null;
  }

  /**
   * Record a failed execution. May trip the circuit to open.
   */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);

    // Prune failures outside the window
    this.pruneOldFailures(now);

    if (this.state === 'half_open') {
      // Probe failed — reopen
      this.state = 'open';
      this.openedAt = now;
      return;
    }

    if (this.failures.length >= this.threshold) {
      this.state = 'open';
      this.openedAt = now;
    }
  }

  /**
   * Manually reset the circuit to closed state.
   */
  reset(): void {
    this.state = 'closed';
    this.failures = [];
    this.openedAt = null;
  }

  /**
   * Get diagnostic info for observability.
   */
  getStats(): { state: CircuitState; failureCount: number; openedAt: number | null } {
    this.evaluateState();
    return {
      state: this.state,
      failureCount: this.failures.length,
      openedAt: this.openedAt,
    };
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private evaluateState(): void {
    if (this.state === 'open' && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.cooldownMs) {
        this.state = 'half_open';
      }
    }

    if (this.state === 'closed') {
      this.pruneOldFailures(Date.now());
    }
  }

  private pruneOldFailures(now: number): void {
    const cutoff = now - this.windowMs;
    this.failures = this.failures.filter(t => t > cutoff);
  }
}

// ---------------------------------------------------------------------------
// Registry — one circuit breaker per hook ID
// ---------------------------------------------------------------------------

const registry = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker for a given hook ID.
 */
export function getCircuitBreaker(hookId: string, opts?: CircuitBreakerOptions): CircuitBreaker {
  let cb = registry.get(hookId);
  if (!cb) {
    cb = new CircuitBreaker(hookId, opts);
    registry.set(hookId, cb);
  }
  return cb;
}

/**
 * Reset all circuit breakers. Useful for testing.
 */
export function resetAllCircuitBreakers(): void {
  registry.clear();
}
