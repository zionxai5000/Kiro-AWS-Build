/**
 * Abstract base Driver class — uniform adapter for all external service integrations.
 *
 * Handles cross-cutting concerns so subclasses only implement business logic:
 * - Lifecycle status tracking (disconnected → connecting → ready → executing → error)
 * - Retry with exponential backoff (1s, 2s, 4s, 8s, 16s — max 5 attempts)
 * - Circuit breaker (closed → open after 5 failures → half-open after 60s → test → closed/open)
 * - Health checks based on connection status and last successful operation
 * - Session state management to avoid redundant authentication
 * - Idempotency key support for safe retries
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import type { Driver } from '@seraphim/core/interfaces/driver.js';
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
  RetryPolicy,
  ConnectionResult,
  HealthStatus,
} from '@seraphim/core/types/driver.js';
import { DriverStatus } from '@seraphim/core/types/enums.js';

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
}

export class CircuitBreaker {
  private _state: CircuitBreakerState = 'closed';
  private _failureCount = 0;
  private _lastFailureTime: number | null = null;

  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;

  constructor(config: CircuitBreakerConfig) {
    this.failureThreshold = config.failureThreshold;
    this.resetTimeoutMs = config.resetTimeoutMs;
  }

  get state(): CircuitBreakerState {
    if (this._state === 'open' && this._lastFailureTime !== null) {
      const elapsed = Date.now() - this._lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        this._state = 'half_open';
      }
    }
    return this._state;
  }

  get failureCount(): number {
    return this._failureCount;
  }

  recordSuccess(): void {
    this._failureCount = 0;
    this._state = 'closed';
  }

  recordFailure(): void {
    this._failureCount++;
    this._lastFailureTime = Date.now();
    if (this._failureCount >= this.failureThreshold) {
      this._state = 'open';
    }
  }

  allowRequest(): boolean {
    const currentState = this.state; // triggers half_open check
    if (currentState === 'closed') return true;
    if (currentState === 'half_open') return true;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Session State
// ---------------------------------------------------------------------------

export interface SessionState {
  authenticated: boolean;
  authenticatedAt: Date | null;
  sessionData: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Abstract Base Driver
// ---------------------------------------------------------------------------

export abstract class BaseDriver<TConfig = unknown> implements Driver<TConfig> {
  abstract readonly name: string;
  abstract readonly version: string;

  // ---- Status tracking ----
  private _status: DriverStatus = 'disconnected';
  get status(): DriverStatus {
    return this._status;
  }

  // ---- Retry policy (exponential backoff: 1s, 2s, 4s, 8s, 16s) ----
  private readonly _retryPolicy: RetryPolicy = {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 16000,
    backoffMultiplier: 2,
  };

  // ---- Circuit breaker ----
  private readonly _circuitBreaker: CircuitBreaker;

  // ---- Health tracking ----
  private _lastSuccessfulOperation: Date | null = null;
  private _errorCount = 0;

  // ---- Session state ----
  private _session: SessionState = {
    authenticated: false,
    authenticatedAt: null,
    sessionData: {},
  };

  // ---- Idempotency cache: key → DriverResult ----
  private readonly _idempotencyCache = new Map<string, DriverResult>();

  // ---- Stored config for reconnection ----
  private _config: TConfig | null = null;

  constructor(retryPolicy?: Partial<RetryPolicy>, circuitBreakerConfig?: Partial<CircuitBreakerConfig>) {
    if (retryPolicy) {
      this._retryPolicy = { ...this._retryPolicy, ...retryPolicy };
    }
    this._circuitBreaker = new CircuitBreaker({
      failureThreshold: circuitBreakerConfig?.failureThreshold ?? 5,
      resetTimeoutMs: circuitBreakerConfig?.resetTimeoutMs ?? 60_000,
    });
  }

  // =====================================================================
  // Public lifecycle methods
  // =====================================================================

  async connect(config: TConfig): Promise<ConnectionResult> {
    this._config = config;
    this._status = 'connecting';

    try {
      await this.doConnect(config);
      this._status = 'ready';
      this._session = {
        authenticated: true,
        authenticatedAt: new Date(),
        sessionData: {},
      };
      return { success: true, status: this._status };
    } catch (err) {
      this._status = 'error';
      this._errorCount++;
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, status: this._status, message };
    }
  }

  async execute(operation: DriverOperation): Promise<DriverResult> {
    // Idempotency: return cached result if we already processed this key
    if (operation.idempotencyKey) {
      const cached = this._idempotencyCache.get(operation.idempotencyKey);
      if (cached) {
        return cached;
      }
    }

    // Circuit breaker check
    if (!this._circuitBreaker.allowRequest()) {
      const result: DriverResult = {
        success: false,
        error: {
          code: 'CIRCUIT_OPEN',
          message: 'Circuit breaker is open — requests are blocked until the service recovers',
          retryable: true,
          details: {
            circuitState: this._circuitBreaker.state,
            failureCount: this._circuitBreaker.failureCount,
          },
        },
        retryable: true,
        operationId: this.generateOperationId(),
      };
      return result;
    }

    // Retry loop with exponential backoff
    const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier } = this._retryPolicy;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this._status = 'executing';
        const result = await this.doExecute(operation);

        // Success path
        this._status = 'ready';
        this._lastSuccessfulOperation = new Date();
        this._errorCount = 0;
        this._circuitBreaker.recordSuccess();

        // Cache idempotent result
        if (operation.idempotencyKey) {
          this._idempotencyCache.set(operation.idempotencyKey, result);
        }

        return result;
      } catch (err) {
        lastError = err;
        this._circuitBreaker.recordFailure();

        // If circuit just opened, stop retrying
        if (!this._circuitBreaker.allowRequest()) {
          break;
        }

        // If not the last attempt, wait with exponential backoff
        if (attempt < maxAttempts) {
          const delay = Math.min(initialDelayMs * Math.pow(backoffMultiplier, attempt - 1), maxDelayMs);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted or circuit opened
    this._status = 'error';
    this._errorCount++;

    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    const result: DriverResult = {
      success: false,
      error: {
        code: 'OPERATION_FAILED',
        message: errorMessage,
        retryable: false,
      },
      retryable: false,
      operationId: this.generateOperationId(),
    };

    return result;
  }

  async verify(operationId: string): Promise<VerificationResult> {
    return this.doVerify(operationId);
  }

  async disconnect(): Promise<void> {
    try {
      await this.doDisconnect();
    } finally {
      this._status = 'disconnected';
      this._session = {
        authenticated: false,
        authenticatedAt: null,
        sessionData: {},
      };
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const healthy = this._status === 'ready' || this._status === 'executing';
    return {
      healthy,
      status: this._status,
      lastSuccessfulOperation: this._lastSuccessfulOperation ?? undefined,
      errorCount: this._errorCount,
      message: healthy
        ? 'Driver is operational'
        : `Driver is in ${this._status} state`,
    };
  }

  getRetryPolicy(): RetryPolicy {
    return { ...this._retryPolicy };
  }

  // =====================================================================
  // Session state accessors (for subclasses)
  // =====================================================================

  protected getSession(): Readonly<SessionState> {
    return this._session;
  }

  protected updateSessionData(data: Record<string, unknown>): void {
    this._session.sessionData = { ...this._session.sessionData, ...data };
  }

  protected isAuthenticated(): boolean {
    return this._session.authenticated;
  }

  // =====================================================================
  // Circuit breaker accessor (for testing / subclasses)
  // =====================================================================

  getCircuitBreakerState(): CircuitBreakerState {
    return this._circuitBreaker.state;
  }

  getCircuitBreakerFailureCount(): number {
    return this._circuitBreaker.failureCount;
  }

  // =====================================================================
  // Abstract methods — subclasses implement business logic
  // =====================================================================

  protected abstract doConnect(config: TConfig): Promise<void>;
  protected abstract doExecute(operation: DriverOperation): Promise<DriverResult>;
  protected abstract doVerify(operationId: string): Promise<VerificationResult>;
  protected abstract doDisconnect(): Promise<void>;

  // =====================================================================
  // Helpers
  // =====================================================================

  private generateOperationId(): string {
    return `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /** Overridable sleep for testing. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
