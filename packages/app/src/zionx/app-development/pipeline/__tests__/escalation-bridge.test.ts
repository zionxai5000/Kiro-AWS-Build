import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wrapWithWatchdog } from '../escalation-bridge.js';
import { resetEscalations, listEscalations } from '../../services/escalation-store.js';
import type { EventBusService } from '@seraphim/core';

function ctx() {
  return {
    executionId: 'exec-1',
    dryRun: false,
    startedAt: new Date().toISOString(),
    log: () => {},
  };
}

function makeEventBus(): EventBusService {
  return {
    async publish() { return 'id'; },
    async publishBatch() { return []; },
    async subscribe() { return 'sub'; },
    async unsubscribe() {},
    async getDeadLetterMessages() { return []; },
    async retryDeadLetter() {},
  } as unknown as EventBusService;
}

describe('escalation-bridge', () => {
  beforeEach(() => {
    resetEscalations();
  });

  it('passes through fast-running hooks without escalating', async () => {
    const result = await wrapWithWatchdog(
      async () => ({ success: true, hookId: 'fast', dryRun: false, durationMs: 1 }),
      ctx(),
      {
        hookId: 'fast',
        projectId: 'p',
        timeoutMs: 1000,
        eventBus: makeEventBus(),
        tenantId: 't',
      },
    );
    expect(result.success).toBe(true);
    const escalations = await listEscalations();
    expect(escalations).toHaveLength(0);
  });

  it('creates an escalation when watchdog timer fires', async () => {
    vi.useFakeTimers();
    const eventBus = makeEventBus();
    const publishSpy = vi.spyOn(eventBus, 'publish');

    const slowFn = async () => {
      await new Promise((res) => setTimeout(res, 5000));
      return { success: true, hookId: 'slow', dryRun: false, durationMs: 5000 };
    };

    const promise = wrapWithWatchdog(slowFn, ctx(), {
      hookId: 'slow',
      projectId: 'p',
      timeoutMs: 100,
      eventBus,
      tenantId: 't',
    });

    // Let the watchdog fire
    await vi.advanceTimersByTimeAsync(150);
    // The escalation should now be created
    const escalations = await listEscalations();
    expect(escalations).toHaveLength(1);
    expect(escalations[0]!.hookId).toBe('slow');
    expect(escalations[0]!.reason).toBe('watchdog-timeout');
    expect(publishSpy).toHaveBeenCalled();

    // Now let the slow function actually finish
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result.success).toBe(true);

    vi.useRealTimers();
  });
});
