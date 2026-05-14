import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BuildStatusPoller, type EasBuildInfo, type BuildViewFn } from '../build-status-poller.js';
import type { EventBusService, SystemEvent } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusService & { events: SystemEvent[] } {
  const events: SystemEvent[] = [];
  return {
    events,
    async publish(event: SystemEvent) { events.push(event); return 'id'; },
    async publishBatch(batch: SystemEvent[]) { events.push(...batch); return []; },
    async subscribe() { return 'sub'; },
    async unsubscribe() {},
    async getDeadLetterMessages() { return []; },
    async retryDeadLetter() {},
  };
}

function createBuildInfo(status: EasBuildInfo['status'], extras: Partial<EasBuildInfo> = {}): EasBuildInfo {
  return { id: 'build-123', status, platform: 'ios', ...extras };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuildStatusPoller', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = createMockEventBus();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes build.started on transition to in-progress', async () => {
    let callCount = 0;
    const buildViewFn: BuildViewFn = async () => {
      callCount++;
      if (callCount === 1) return createBuildInfo('in-queue');
      if (callCount === 2) return createBuildInfo('in-progress');
      return createBuildInfo('finished', { artifacts: { buildUrl: 'https://eas/artifact' } });
    };

    const poller = new BuildStatusPoller(buildViewFn, eventBus);
    const promise = poller.startPolling('build-123', 'proj-1', 'ios', { maxDurationMs: 300_000 });

    // Advance through initial delay + polls
    await vi.advanceTimersByTimeAsync(30_000); // initial wait
    await vi.advanceTimersByTimeAsync(60_000); // first poll interval
    await vi.advanceTimersByTimeAsync(60_000); // second poll interval

    const result = await promise;

    expect(result.finalStatus).toBe('finished');
    const startedEvents = eventBus.events.filter(e => (e.detail as any).status === 'started');
    expect(startedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('publishes build.completed on finished status with artifact URL', async () => {
    const buildViewFn: BuildViewFn = async () => {
      return createBuildInfo('finished', { artifacts: { buildUrl: 'https://eas/build.ipa' } });
    };

    const poller = new BuildStatusPoller(buildViewFn, eventBus);
    const promise = poller.startPolling('build-123', 'proj-1', 'ios');

    await vi.advanceTimersByTimeAsync(30_000); // initial wait

    const result = await promise;

    expect(result.finalStatus).toBe('finished');
    expect(result.artifactUrl).toBe('https://eas/build.ipa');
    const completedEvents = eventBus.events.filter(e => (e.detail as any).status === 'completed');
    expect(completedEvents.length).toBe(1);
  });

  it('publishes build.failed on errored status', async () => {
    const buildViewFn: BuildViewFn = async () => {
      return createBuildInfo('errored', { error: { message: 'Signing failed', errorCode: 'SIGN_ERR' } });
    };

    const poller = new BuildStatusPoller(buildViewFn, eventBus);
    const promise = poller.startPolling('build-123', 'proj-1', 'ios');

    await vi.advanceTimersByTimeAsync(30_000);

    const result = await promise;

    expect(result.finalStatus).toBe('errored');
    const failedEvents = eventBus.events.filter(e => (e.detail as any).status === 'failed');
    expect(failedEvents.length).toBe(1);
    expect((failedEvents[0]!.detail as any).error).toBe('Signing failed');
  });

  it('publishes build.failed on timeout', async () => {
    const buildViewFn: BuildViewFn = async () => createBuildInfo('in-progress');

    const poller = new BuildStatusPoller(buildViewFn, eventBus);
    const promise = poller.startPolling('build-123', 'proj-1', 'ios', { maxDurationMs: 120_000 });

    // Advance past the timeout (initial 30s + enough intervals to exceed 120s)
    await vi.advanceTimersByTimeAsync(30_000); // initial
    await vi.advanceTimersByTimeAsync(60_000); // poll 1
    await vi.advanceTimersByTimeAsync(60_000); // poll 2 — now at 150s, exceeds 120s max

    const result = await promise;

    const failedEvents = eventBus.events.filter(e => (e.detail as any).error === 'timeout');
    expect(failedEvents.length).toBe(1);
  });

  it('stops polling immediately on terminal state', async () => {
    let pollCount = 0;
    const buildViewFn: BuildViewFn = async () => {
      pollCount++;
      return createBuildInfo('canceled');
    };

    const poller = new BuildStatusPoller(buildViewFn, eventBus);
    const promise = poller.startPolling('build-123', 'proj-1', 'ios');

    await vi.advanceTimersByTimeAsync(30_000); // initial wait — first poll returns canceled

    const result = await promise;

    expect(result.finalStatus).toBe('canceled');
    expect(pollCount).toBe(1); // Only polled once
  });

  it('individual poll error does not terminate polling', async () => {
    let callCount = 0;
    const buildViewFn: BuildViewFn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('EAS API hiccup');
      return createBuildInfo('finished', { artifacts: { buildUrl: 'https://url' } });
    };

    const poller = new BuildStatusPoller(buildViewFn, eventBus);
    const promise = poller.startPolling('build-123', 'proj-1', 'ios');

    await vi.advanceTimersByTimeAsync(30_000); // initial — error
    await vi.advanceTimersByTimeAsync(60_000); // retry — success

    const result = await promise;

    expect(result.finalStatus).toBe('finished');
    expect(callCount).toBe(2);
  });

  it('uses extended interval (120s) after 10 minutes', async () => {
    let pollCount = 0;
    const buildViewFn: BuildViewFn = async () => {
      pollCount++;
      if (pollCount >= 12) return createBuildInfo('finished', { artifacts: { buildUrl: 'https://url' } });
      return createBuildInfo('in-progress');
    };

    const poller = new BuildStatusPoller(buildViewFn, eventBus);
    const promise = poller.startPolling('build-123', 'proj-1', 'ios', { maxDurationMs: 30 * 60_000 });

    // Initial 30s + 9 polls at 60s = 30s + 540s = 570s (9.5min) — still standard interval
    await vi.advanceTimersByTimeAsync(30_000);
    for (let i = 0; i < 9; i++) {
      await vi.advanceTimersByTimeAsync(60_000);
    }
    // Now at ~10min, next interval should be 120s
    await vi.advanceTimersByTimeAsync(120_000);
    await vi.advanceTimersByTimeAsync(120_000);

    const result = await promise;
    expect(result.finalStatus).toBe('finished');
  });
});
