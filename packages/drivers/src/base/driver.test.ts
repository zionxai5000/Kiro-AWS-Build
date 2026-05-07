/**
 * Unit tests for the abstract BaseDriver class.
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseDriver, CircuitBreaker } from './driver.js';
import type { CircuitBreakerConfig } from './driver.js';
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';

// ---------------------------------------------------------------------------
// Concrete test subclass
// ---------------------------------------------------------------------------

class TestDriver extends BaseDriver<{ apiKey: string }> {
  readonly name = 'test-driver';
  readonly version = '1.0.0';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connectFn: any = vi.fn().mockResolvedValue(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executeFn: any = vi.fn().mockImplementation(
    (op: DriverOperation) =>
      Promise.resolve({
        success: true,
        data: { echo: op.params },
        retryable: false,
        operationId: `op-${Date.now()}`,
      }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verifyFn: any = vi.fn().mockImplementation((id: string) =>
    Promise.resolve({ verified: true, operationId: id }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  disconnectFn: any = vi.fn().mockResolvedValue(undefined);

  // Track sleep calls for backoff verification
  sleepCalls: number[] = [];

  protected async doConnect(_config: { apiKey: string }): Promise<void> {
    return this.connectFn();
  }

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    return this.executeFn(operation);
  }

  protected async doVerify(operationId: string): Promise<VerificationResult> {
    return this.verifyFn(operationId);
  }

  protected async doDisconnect(): Promise<void> {
    return this.disconnectFn();
  }

  // Override sleep to be instant and record delays
  protected override sleep(ms: number): Promise<void> {
    this.sleepCalls.push(ms);
    return Promise.resolve();
  }

  // Expose protected helpers for testing
  public testGetSession() {
    return this.getSession();
  }

  public testIsAuthenticated() {
    return this.isAuthenticated();
  }

  public testUpdateSessionData(data: Record<string, unknown>) {
    this.updateSessionData(data);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BaseDriver', () => {
  let driver: TestDriver;

  beforeEach(() => {
    driver = new TestDriver();
  });

  // -----------------------------------------------------------------------
  // Lifecycle status tracking (Requirement 10.1)
  // -----------------------------------------------------------------------

  describe('lifecycle status tracking', () => {
    it('starts in disconnected status', () => {
      expect(driver.status).toBe('disconnected');
    });

    it('transitions to ready after successful connect', async () => {
      const result = await driver.connect({ apiKey: 'test-key' });

      expect(result.success).toBe(true);
      expect(result.status).toBe('ready');
      expect(driver.status).toBe('ready');
    });

    it('transitions to error on connect failure', async () => {
      driver.connectFn.mockRejectedValueOnce(new Error('auth failed'));

      const result = await driver.connect({ apiKey: 'bad-key' });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.message).toBe('auth failed');
      expect(driver.status).toBe('error');
    });

    it('transitions to executing during operation then back to ready', async () => {
      await driver.connect({ apiKey: 'key' });

      let statusDuringExec: string | undefined;
      driver.executeFn.mockImplementationOnce(async () => {
        statusDuringExec = driver.status;
        return { success: true, retryable: false, operationId: 'op-1' };
      });

      await driver.execute({ type: 'test', params: {} });

      expect(statusDuringExec).toBe('executing');
      expect(driver.status).toBe('ready');
    });

    it('transitions to disconnected after disconnect', async () => {
      await driver.connect({ apiKey: 'key' });
      await driver.disconnect();

      expect(driver.status).toBe('disconnected');
    });

    it('transitions to disconnected even if doDisconnect throws', async () => {
      await driver.connect({ apiKey: 'key' });
      driver.disconnectFn.mockRejectedValueOnce(new Error('cleanup failed'));

      await expect(driver.disconnect()).rejects.toThrow('cleanup failed');
      expect(driver.status).toBe('disconnected');
    });
  });

  // -----------------------------------------------------------------------
  // Retry with exponential backoff (Requirement 10.3)
  // -----------------------------------------------------------------------

  describe('retry with exponential backoff', () => {
    it('retries up to maxAttempts on failure', async () => {
      await driver.connect({ apiKey: 'key' });
      driver.executeFn.mockRejectedValue(new Error('transient'));

      const result = await driver.execute({ type: 'test', params: {} });

      expect(result.success).toBe(false);
      expect(driver.executeFn).toHaveBeenCalledTimes(5);
    });

    it('applies exponential backoff delays: 1s, 2s, 4s, 8s', async () => {
      await driver.connect({ apiKey: 'key' });
      driver.executeFn.mockRejectedValue(new Error('transient'));

      await driver.execute({ type: 'test', params: {} });

      // 5 attempts → 4 sleeps between them
      expect(driver.sleepCalls).toEqual([1000, 2000, 4000, 8000]);
    });

    it('succeeds on a later attempt without further retries', async () => {
      await driver.connect({ apiKey: 'key' });
      driver.executeFn
        .mockRejectedValueOnce(new Error('fail-1'))
        .mockRejectedValueOnce(new Error('fail-2'))
        .mockResolvedValueOnce({ success: true, retryable: false, operationId: 'op-ok' });

      const result = await driver.execute({ type: 'test', params: {} });

      expect(result.success).toBe(true);
      expect(driver.executeFn).toHaveBeenCalledTimes(3);
      expect(driver.sleepCalls).toEqual([1000, 2000]);
    });

    it('returns the retry policy via getRetryPolicy()', () => {
      const policy = driver.getRetryPolicy();

      expect(policy).toEqual({
        maxAttempts: 5,
        initialDelayMs: 1000,
        maxDelayMs: 16000,
        backoffMultiplier: 2,
      });
    });

    it('allows custom retry policy via constructor', () => {
      const custom = new TestDriver({ maxAttempts: 3, initialDelayMs: 500 });
      const policy = custom.getRetryPolicy();

      expect(policy.maxAttempts).toBe(3);
      expect(policy.initialDelayMs).toBe(500);
      expect(policy.backoffMultiplier).toBe(2);
    });

    it('caps delay at maxDelayMs', async () => {
      // Use a small maxDelay to verify capping
      const custom = new TestDriver({ maxAttempts: 4, initialDelayMs: 5000, maxDelayMs: 8000, backoffMultiplier: 2 });
      await custom.connect({ apiKey: 'key' });
      custom.executeFn.mockRejectedValue(new Error('fail'));

      await custom.execute({ type: 'test', params: {} });

      // delays: min(5000, 8000)=5000, min(10000, 8000)=8000, min(20000, 8000)=8000
      expect(custom.sleepCalls).toEqual([5000, 8000, 8000]);
    });
  });

  // -----------------------------------------------------------------------
  // Circuit breaker (Requirement 10.3 — error handling)
  // -----------------------------------------------------------------------

  describe('circuit breaker', () => {
    it('starts in closed state', () => {
      expect(driver.getCircuitBreakerState()).toBe('closed');
    });

    it('opens after 5 consecutive failures', async () => {
      await driver.connect({ apiKey: 'key' });
      driver.executeFn.mockRejectedValue(new Error('fail'));

      // First execute: 5 retries → 5 failures → circuit opens
      await driver.execute({ type: 'test', params: {} });

      expect(driver.getCircuitBreakerState()).toBe('open');
    });

    it('blocks requests when circuit is open', async () => {
      await driver.connect({ apiKey: 'key' });
      driver.executeFn.mockRejectedValue(new Error('fail'));

      // Trip the circuit
      await driver.execute({ type: 'test', params: {} });

      // Next request should be blocked immediately
      driver.executeFn.mockClear();
      const result = await driver.execute({ type: 'test', params: {} });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CIRCUIT_OPEN');
      expect(driver.executeFn).not.toHaveBeenCalled();
    });

    it('resets to closed after a successful request in half-open state', async () => {
      // Use a circuit breaker with a very short reset timeout
      const fastDriver = new TestDriver(undefined, { failureThreshold: 2, resetTimeoutMs: 10 });
      await fastDriver.connect({ apiKey: 'key' });
      fastDriver.executeFn.mockRejectedValue(new Error('fail'));

      // Trip the circuit (2 failures threshold)
      await fastDriver.execute({ type: 'test', params: {} });
      expect(fastDriver.getCircuitBreakerState()).toBe('open');

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 20));

      // Should be half-open now
      expect(fastDriver.getCircuitBreakerState()).toBe('half_open');

      // Successful request should close the circuit
      fastDriver.executeFn.mockResolvedValueOnce({
        success: true,
        retryable: false,
        operationId: 'op-recovery',
      });

      const result = await fastDriver.execute({ type: 'test', params: {} });
      expect(result.success).toBe(true);
      expect(fastDriver.getCircuitBreakerState()).toBe('closed');
    });

    it('returns to open if half-open test request fails', async () => {
      const fastDriver = new TestDriver(undefined, { failureThreshold: 2, resetTimeoutMs: 10 });
      await fastDriver.connect({ apiKey: 'key' });
      fastDriver.executeFn.mockRejectedValue(new Error('fail'));

      // Trip the circuit
      await fastDriver.execute({ type: 'test', params: {} });

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 20));
      expect(fastDriver.getCircuitBreakerState()).toBe('half_open');

      // Failed request should re-open the circuit
      const result = await fastDriver.execute({ type: 'test', params: {} });
      expect(result.success).toBe(false);
      expect(fastDriver.getCircuitBreakerState()).toBe('open');
    });
  });

  // -----------------------------------------------------------------------
  // Health check (Requirement 10.1)
  // -----------------------------------------------------------------------

  describe('healthCheck()', () => {
    it('reports unhealthy when disconnected', async () => {
      const health = await driver.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.status).toBe('disconnected');
      expect(health.errorCount).toBe(0);
    });

    it('reports healthy when ready', async () => {
      await driver.connect({ apiKey: 'key' });
      const health = await driver.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.status).toBe('ready');
    });

    it('tracks lastSuccessfulOperation after execute', async () => {
      await driver.connect({ apiKey: 'key' });
      await driver.execute({ type: 'test', params: {} });

      const health = await driver.healthCheck();
      expect(health.lastSuccessfulOperation).toBeInstanceOf(Date);
    });

    it('reports unhealthy when in error state', async () => {
      driver.connectFn.mockRejectedValueOnce(new Error('fail'));
      await driver.connect({ apiKey: 'bad' });

      const health = await driver.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.status).toBe('error');
      expect(health.errorCount).toBe(1);
    });

    it('increments errorCount on repeated failures', async () => {
      driver.connectFn.mockRejectedValue(new Error('fail'));
      await driver.connect({ apiKey: 'bad' });
      await driver.connect({ apiKey: 'bad' });

      const health = await driver.healthCheck();
      expect(health.errorCount).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Session state management (Requirement 10.4)
  // -----------------------------------------------------------------------

  describe('session state management', () => {
    it('marks session as authenticated after connect', async () => {
      await driver.connect({ apiKey: 'key' });

      const session = driver.testGetSession();
      expect(session.authenticated).toBe(true);
      expect(session.authenticatedAt).toBeInstanceOf(Date);
    });

    it('clears session on disconnect', async () => {
      await driver.connect({ apiKey: 'key' });
      await driver.disconnect();

      const session = driver.testGetSession();
      expect(session.authenticated).toBe(false);
      expect(session.authenticatedAt).toBeNull();
    });

    it('allows subclasses to update session data', async () => {
      await driver.connect({ apiKey: 'key' });
      driver.testUpdateSessionData({ token: 'abc', expiresIn: 3600 });

      const session = driver.testGetSession();
      expect(session.sessionData).toEqual({ token: 'abc', expiresIn: 3600 });
    });

    it('merges session data on subsequent updates', async () => {
      await driver.connect({ apiKey: 'key' });
      driver.testUpdateSessionData({ token: 'abc' });
      driver.testUpdateSessionData({ refreshToken: 'xyz' });

      const session = driver.testGetSession();
      expect(session.sessionData).toEqual({ token: 'abc', refreshToken: 'xyz' });
    });

    it('reports isAuthenticated correctly', async () => {
      expect(driver.testIsAuthenticated()).toBe(false);
      await driver.connect({ apiKey: 'key' });
      expect(driver.testIsAuthenticated()).toBe(true);
      await driver.disconnect();
      expect(driver.testIsAuthenticated()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Idempotency key support (Requirement 10.3)
  // -----------------------------------------------------------------------

  describe('idempotency key support', () => {
    it('returns cached result for duplicate idempotency key', async () => {
      await driver.connect({ apiKey: 'key' });

      const op: DriverOperation = {
        type: 'create',
        params: { name: 'test' },
        idempotencyKey: 'idem-123',
      };

      const first = await driver.execute(op);
      expect(first.success).toBe(true);

      // Second call with same key should return cached result
      driver.executeFn.mockClear();
      const second = await driver.execute(op);

      expect(second).toEqual(first);
      expect(driver.executeFn).not.toHaveBeenCalled();
    });

    it('does not cache when no idempotency key is provided', async () => {
      await driver.connect({ apiKey: 'key' });

      const op: DriverOperation = { type: 'create', params: { name: 'test' } };

      await driver.execute(op);
      await driver.execute(op);

      expect(driver.executeFn).toHaveBeenCalledTimes(2);
    });

    it('caches different results for different idempotency keys', async () => {
      await driver.connect({ apiKey: 'key' });

      const op1: DriverOperation = { type: 'create', params: { n: 1 }, idempotencyKey: 'key-1' };
      const op2: DriverOperation = { type: 'create', params: { n: 2 }, idempotencyKey: 'key-2' };

      const r1 = await driver.execute(op1);
      const r2 = await driver.execute(op2);

      expect(r1).not.toEqual(r2);
      expect(driver.executeFn).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // verify() delegation
  // -----------------------------------------------------------------------

  describe('verify()', () => {
    it('delegates to doVerify', async () => {
      const result = await driver.verify('op-123');

      expect(result.verified).toBe(true);
      expect(result.operationId).toBe('op-123');
      expect(driver.verifyFn).toHaveBeenCalledWith('op-123');
    });
  });
});

// ---------------------------------------------------------------------------
// CircuitBreaker unit tests
// ---------------------------------------------------------------------------

describe('CircuitBreaker', () => {
  const defaultConfig: CircuitBreakerConfig = { failureThreshold: 5, resetTimeoutMs: 60_000 };

  it('starts in closed state allowing requests', () => {
    const cb = new CircuitBreaker(defaultConfig);
    expect(cb.state).toBe('closed');
    expect(cb.allowRequest()).toBe(true);
  });

  it('stays closed below failure threshold', () => {
    const cb = new CircuitBreaker(defaultConfig);
    for (let i = 0; i < 4; i++) cb.recordFailure();

    expect(cb.state).toBe('closed');
    expect(cb.failureCount).toBe(4);
    expect(cb.allowRequest()).toBe(true);
  });

  it('opens at failure threshold', () => {
    const cb = new CircuitBreaker(defaultConfig);
    for (let i = 0; i < 5; i++) cb.recordFailure();

    expect(cb.state).toBe('open');
    expect(cb.allowRequest()).toBe(false);
  });

  it('resets failure count on success', () => {
    const cb = new CircuitBreaker(defaultConfig);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();

    expect(cb.failureCount).toBe(0);
    expect(cb.state).toBe('closed');
  });

  it('transitions to half_open after resetTimeout', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe('open');

    await new Promise((r) => setTimeout(r, 20));
    expect(cb.state).toBe('half_open');
    expect(cb.allowRequest()).toBe(true);
  });
});
