import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  resetAllCircuitBreakers,
} from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    vi.restoreAllMocks();
  });

  it('starts in closed state', () => {
    const cb = new CircuitBreaker('test-hook');
    expect(cb.getState()).toBe('closed');
  });

  it('allows requests when closed', () => {
    const cb = new CircuitBreaker('test-hook');
    expect(() => cb.allowRequest()).not.toThrow();
  });

  it('stays closed below failure threshold', () => {
    const cb = new CircuitBreaker('test-hook', { threshold: 5, windowMs: 60000 });
    for (let i = 0; i < 4; i++) {
      cb.recordFailure();
    }
    expect(cb.getState()).toBe('closed');
    expect(() => cb.allowRequest()).not.toThrow();
  });

  it('opens after reaching failure threshold', () => {
    const cb = new CircuitBreaker('test-hook', { threshold: 5, windowMs: 60000 });
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    expect(cb.getState()).toBe('open');
  });

  it('throws CircuitOpenError when open', () => {
    const cb = new CircuitBreaker('test-hook', { threshold: 2, windowMs: 60000 });
    cb.recordFailure();
    cb.recordFailure();
    expect(() => cb.allowRequest()).toThrow(CircuitOpenError);
  });

  it('transitions to half_open after cooldown', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker('test-hook', {
      threshold: 2,
      windowMs: 60000,
      cooldownMs: 5000,
    });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('open');

    vi.advanceTimersByTime(5000);
    expect(cb.getState()).toBe('half_open');
    vi.useRealTimers();
  });

  it('closes on success in half_open state', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker('test-hook', {
      threshold: 2,
      windowMs: 60000,
      cooldownMs: 5000,
    });
    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(5000);
    expect(cb.getState()).toBe('half_open');

    cb.recordSuccess();
    expect(cb.getState()).toBe('closed');
    vi.useRealTimers();
  });

  it('reopens on failure in half_open state', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker('test-hook', {
      threshold: 2,
      windowMs: 60000,
      cooldownMs: 5000,
    });
    cb.recordFailure();
    cb.recordFailure();
    vi.advanceTimersByTime(5000);
    expect(cb.getState()).toBe('half_open');

    cb.recordFailure();
    expect(cb.getState()).toBe('open');
    vi.useRealTimers();
  });

  it('prunes old failures outside the window', () => {
    vi.useFakeTimers();
    const cb = new CircuitBreaker('test-hook', {
      threshold: 5,
      windowMs: 1000,
      cooldownMs: 5000,
    });

    // Record 4 failures
    for (let i = 0; i < 4; i++) {
      cb.recordFailure();
    }
    expect(cb.getState()).toBe('closed');

    // Advance past the window
    vi.advanceTimersByTime(1100);

    // Old failures are pruned, so 1 new failure shouldn't trip it
    cb.recordFailure();
    expect(cb.getState()).toBe('closed');
    vi.useRealTimers();
  });

  it('reset() returns to closed state', () => {
    const cb = new CircuitBreaker('test-hook', { threshold: 1 });
    cb.recordFailure();
    expect(cb.getState()).toBe('open');
    cb.reset();
    expect(cb.getState()).toBe('closed');
  });

  it('getStats returns diagnostic info', () => {
    const cb = new CircuitBreaker('test-hook', { threshold: 5 });
    cb.recordFailure();
    cb.recordFailure();
    const stats = cb.getStats();
    expect(stats.state).toBe('closed');
    expect(stats.failureCount).toBe(2);
    expect(stats.openedAt).toBeNull();
  });
});

describe('getCircuitBreaker registry', () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
  });

  it('returns the same instance for the same hookId', () => {
    const a = getCircuitBreaker('hook-a');
    const b = getCircuitBreaker('hook-a');
    expect(a).toBe(b);
  });

  it('returns different instances for different hookIds', () => {
    const a = getCircuitBreaker('hook-a');
    const b = getCircuitBreaker('hook-b');
    expect(a).not.toBe(b);
  });
});
