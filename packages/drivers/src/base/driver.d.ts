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
import type { DriverOperation, DriverResult, VerificationResult, RetryPolicy, ConnectionResult, HealthStatus } from '@seraphim/core/types/driver.js';
import { DriverStatus } from '@seraphim/core/types/enums.js';
export type CircuitBreakerState = 'closed' | 'open' | 'half_open';
export interface CircuitBreakerConfig {
    failureThreshold: number;
    resetTimeoutMs: number;
}
export declare class CircuitBreaker {
    private _state;
    private _failureCount;
    private _lastFailureTime;
    readonly failureThreshold: number;
    readonly resetTimeoutMs: number;
    constructor(config: CircuitBreakerConfig);
    get state(): CircuitBreakerState;
    get failureCount(): number;
    recordSuccess(): void;
    recordFailure(): void;
    allowRequest(): boolean;
}
export interface SessionState {
    authenticated: boolean;
    authenticatedAt: Date | null;
    sessionData: Record<string, unknown>;
}
export declare abstract class BaseDriver<TConfig = unknown> implements Driver<TConfig> {
    abstract readonly name: string;
    abstract readonly version: string;
    private _status;
    get status(): DriverStatus;
    private readonly _retryPolicy;
    private readonly _circuitBreaker;
    private _lastSuccessfulOperation;
    private _errorCount;
    private _session;
    private readonly _idempotencyCache;
    private _config;
    constructor(retryPolicy?: Partial<RetryPolicy>, circuitBreakerConfig?: Partial<CircuitBreakerConfig>);
    connect(config: TConfig): Promise<ConnectionResult>;
    execute(operation: DriverOperation): Promise<DriverResult>;
    verify(operationId: string): Promise<VerificationResult>;
    disconnect(): Promise<void>;
    healthCheck(): Promise<HealthStatus>;
    getRetryPolicy(): RetryPolicy;
    protected getSession(): Readonly<SessionState>;
    protected updateSessionData(data: Record<string, unknown>): void;
    protected isAuthenticated(): boolean;
    getCircuitBreakerState(): CircuitBreakerState;
    getCircuitBreakerFailureCount(): number;
    protected abstract doConnect(config: TConfig): Promise<void>;
    protected abstract doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected abstract doVerify(operationId: string): Promise<VerificationResult>;
    protected abstract doDisconnect(): Promise<void>;
    private generateOperationId;
    /** Overridable sleep for testing. */
    protected sleep(ms: number): Promise<void>;
}
//# sourceMappingURL=driver.d.ts.map