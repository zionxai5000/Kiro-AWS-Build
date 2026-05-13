import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WatcherSupervisor } from '../watcher-supervisor.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { EventBusService, SystemEvent } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusService & { events: SystemEvent[] } {
  const events: SystemEvent[] = [];
  return {
    events,
    async publish(event: SystemEvent) {
      events.push(event);
      return 'mock-id';
    },
    async publishBatch(batch: SystemEvent[]) {
      events.push(...batch);
      return batch.map(() => 'mock-id');
    },
    async subscribe() { return 'sub-id'; },
    async unsubscribe() {},
    async getDeadLetterMessages() { return []; },
    async retryDeadLetter() {},
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WatcherSupervisor', () => {
  let testRoot: string;
  let supervisor: WatcherSupervisor;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    testRoot = join(tmpdir(), `supervisor-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(testRoot, { recursive: true });
    eventBus = createMockEventBus();
  });

  afterEach(async () => {
    if (supervisor) {
      await supervisor.stop();
    }
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('starts and reports healthy', async () => {
    supervisor = new WatcherSupervisor({
      workspaceRoot: testRoot,
      eventBus,
      stabilityThresholdMs: 50,
      maxCrashes: 3,
      crashWindowMs: 60000,
      restartDelayMs: 50,
    });
    await supervisor.start();
    expect(supervisor.isHealthy()).toBe(true);
    expect(supervisor.state).toBe('healthy');
  });

  it('stops cleanly', async () => {
    supervisor = new WatcherSupervisor({
      workspaceRoot: testRoot,
      eventBus,
      stabilityThresholdMs: 50,
    });
    await supervisor.start();
    await supervisor.stop();
    expect(supervisor.state).toBe('stopped');
    expect(supervisor.isHealthy()).toBe(false);
  });

  it('opens circuit after max crashes and emits critical health event', async () => {
    // Use a path that will cause immediate errors when watcher tries to start
    // We'll simulate crashes by directly calling the error handler
    supervisor = new WatcherSupervisor({
      workspaceRoot: testRoot,
      eventBus,
      stabilityThresholdMs: 50,
      maxCrashes: 3,
      crashWindowMs: 60000,
      restartDelayMs: 5000, // Long delay so restarts don't complete during test
    });

    await supervisor.start();
    expect(supervisor.isHealthy()).toBe(true);

    // Simulate 3 crashes by triggering the watcher's error handler
    const watcher = supervisor.getWatcher();
    if (watcher && watcher.onError) {
      watcher.onError(new Error('Simulated crash 1'));
      watcher.onError(new Error('Simulated crash 2'));
      watcher.onError(new Error('Simulated crash 3'));
    }
    await sleep(50);

    expect(supervisor.state).toBe('circuit_open');
    expect(supervisor.isHealthy()).toBe(false);

    // Should have emitted a system.health critical event
    const healthEvents = eventBus.events.filter(
      e => e.type === 'system.health' && (e.detail as { status: string }).status === 'critical'
    );
    expect(healthEvents.length).toBeGreaterThanOrEqual(1);

    const detail = healthEvents[0]!.detail as { component: string; status: string };
    expect(detail.component).toBe('workspace-watcher');
    expect(detail.status).toBe('critical');
  });

  it('manual restart() resets circuit and recovers', async () => {
    supervisor = new WatcherSupervisor({
      workspaceRoot: testRoot,
      eventBus,
      stabilityThresholdMs: 50,
      maxCrashes: 3,
      crashWindowMs: 60000,
      restartDelayMs: 5000, // Long delay so restarts don't complete during test
    });

    await supervisor.start();

    // Simulate 3 rapid crashes — the long restartDelayMs ensures
    // no restart completes between crashes
    const watcher = supervisor.getWatcher();
    if (watcher && watcher.onError) {
      watcher.onError(new Error('crash 1'));
      watcher.onError(new Error('crash 2'));
      watcher.onError(new Error('crash 3'));
    }
    await sleep(50);
    expect(supervisor.state).toBe('circuit_open');

    // Manual recovery
    await supervisor.restart();
    expect(supervisor.isHealthy()).toBe(true);
    expect(supervisor.state).toBe('healthy');

    // Should have emitted a recovery event
    const recoveryEvents = eventBus.events.filter(
      e => e.type === 'system.health' && (e.detail as { status: string }).status === 'recovered'
    );
    expect(recoveryEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('exposes getWatcher() for accessing RecentWritesRegistry', async () => {
    supervisor = new WatcherSupervisor({
      workspaceRoot: testRoot,
      eventBus,
      stabilityThresholdMs: 50,
    });
    await supervisor.start();

    const watcher = supervisor.getWatcher();
    expect(watcher).not.toBeNull();
    expect(watcher!.getRecentWrites()).toBeDefined();
  });
});
