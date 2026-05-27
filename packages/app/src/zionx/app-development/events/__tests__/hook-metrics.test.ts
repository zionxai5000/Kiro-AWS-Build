import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordHookExecution,
  recordHookFailure,
  getMetricsSnapshot,
  getRecentErrorRate,
  resetMetrics,
} from '../hook-metrics.js';

describe('hook-metrics', () => {
  beforeEach(() => resetMetrics());

  it('records a successful execution', async () => {
    const result = await recordHookExecution('test-hook', async () => ({
      success: true,
      hookId: 'test-hook',
      dryRun: false,
      durationMs: 5,
    }));
    expect(result.success).toBe(true);
    const snap = getMetricsSnapshot();
    expect(snap.find((s) => s.hookId === 'test-hook')?.successes).toBe(1);
  });

  it('records a thrown failure', async () => {
    await expect(
      recordHookExecution('failing-hook', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const snap = getMetricsSnapshot();
    expect(snap.find((s) => s.hookId === 'failing-hook')?.failures).toBe(1);
  });

  it('records a HookResult with success=false as a failure', async () => {
    await recordHookExecution('bad-result', async () => ({
      success: false,
      hookId: 'bad-result',
      dryRun: false,
      durationMs: 3,
      error: 'something',
    }));
    const snap = getMetricsSnapshot().find((s) => s.hookId === 'bad-result');
    expect(snap?.failures).toBe(1);
    expect(snap?.successes).toBe(0);
  });

  it('recordHookFailure increments failure counter', () => {
    recordHookFailure('manual', 'forced');
    const snap = getMetricsSnapshot().find((s) => s.hookId === 'manual');
    expect(snap?.failures).toBe(1);
    expect(snap?.lastError).toBe('forced');
  });

  it('getRecentErrorRate aggregates across all hooks', async () => {
    await recordHookExecution('a', async () => ({ success: true, hookId: 'a', dryRun: false, durationMs: 1 }));
    await expect(
      recordHookExecution('b', async () => { throw new Error('x'); }),
    ).rejects.toThrow();
    expect(getRecentErrorRate()).toBeGreaterThan(0);
    expect(getRecentErrorRate()).toBeLessThanOrEqual(1);
  });
});
