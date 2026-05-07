"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseDriver = exports.CircuitBreaker = void 0;
class CircuitBreaker {
    _state = 'closed';
    _failureCount = 0;
    _lastFailureTime = null;
    failureThreshold;
    resetTimeoutMs;
    constructor(config) {
        this.failureThreshold = config.failureThreshold;
        this.resetTimeoutMs = config.resetTimeoutMs;
    }
    get state() {
        if (this._state === 'open' && this._lastFailureTime !== null) {
            const elapsed = Date.now() - this._lastFailureTime;
            if (elapsed >= this.resetTimeoutMs) {
                this._state = 'half_open';
            }
        }
        return this._state;
    }
    get failureCount() {
        return this._failureCount;
    }
    recordSuccess() {
        this._failureCount = 0;
        this._state = 'closed';
    }
    recordFailure() {
        this._failureCount++;
        this._lastFailureTime = Date.now();
        if (this._failureCount >= this.failureThreshold) {
            this._state = 'open';
        }
    }
    allowRequest() {
        const currentState = this.state; // triggers half_open check
        if (currentState === 'closed')
            return true;
        if (currentState === 'half_open')
            return true;
        return false;
    }
}
exports.CircuitBreaker = CircuitBreaker;
// ---------------------------------------------------------------------------
// Abstract Base Driver
// ---------------------------------------------------------------------------
class BaseDriver {
    // ---- Status tracking ----
    _status = 'disconnected';
    get status() {
        return this._status;
    }
    // ---- Retry policy (exponential backoff: 1s, 2s, 4s, 8s, 16s) ----
    _retryPolicy = {
        maxAttempts: 5,
        initialDelayMs: 1000,
        maxDelayMs: 16000,
        backoffMultiplier: 2,
    };
    // ---- Circuit breaker ----
    _circuitBreaker;
    // ---- Health tracking ----
    _lastSuccessfulOperation = null;
    _errorCount = 0;
    // ---- Session state ----
    _session = {
        authenticated: false,
        authenticatedAt: null,
        sessionData: {},
    };
    // ---- Idempotency cache: key → DriverResult ----
    _idempotencyCache = new Map();
    // ---- Stored config for reconnection ----
    _config = null;
    constructor(retryPolicy, circuitBreakerConfig) {
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
    async connect(config) {
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
        }
        catch (err) {
            this._status = 'error';
            this._errorCount++;
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, status: this._status, message };
        }
    }
    async execute(operation) {
        // Idempotency: return cached result if we already processed this key
        if (operation.idempotencyKey) {
            const cached = this._idempotencyCache.get(operation.idempotencyKey);
            if (cached) {
                return cached;
            }
        }
        // Circuit breaker check
        if (!this._circuitBreaker.allowRequest()) {
            const result = {
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
        let lastError = null;
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
            }
            catch (err) {
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
        const result = {
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
    async verify(operationId) {
        return this.doVerify(operationId);
    }
    async disconnect() {
        try {
            await this.doDisconnect();
        }
        finally {
            this._status = 'disconnected';
            this._session = {
                authenticated: false,
                authenticatedAt: null,
                sessionData: {},
            };
        }
    }
    async healthCheck() {
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
    getRetryPolicy() {
        return { ...this._retryPolicy };
    }
    // =====================================================================
    // Session state accessors (for subclasses)
    // =====================================================================
    getSession() {
        return this._session;
    }
    updateSessionData(data) {
        this._session.sessionData = { ...this._session.sessionData, ...data };
    }
    isAuthenticated() {
        return this._session.authenticated;
    }
    // =====================================================================
    // Circuit breaker accessor (for testing / subclasses)
    // =====================================================================
    getCircuitBreakerState() {
        return this._circuitBreaker.state;
    }
    getCircuitBreakerFailureCount() {
        return this._circuitBreaker.failureCount;
    }
    // =====================================================================
    // Helpers
    // =====================================================================
    generateOperationId() {
        return `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    /** Overridable sleep for testing. */
    sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}
exports.BaseDriver = BaseDriver;
//# sourceMappingURL=driver.js.map