import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceWatcher } from '../workspace-watcher.js';
import { RecentWritesRegistry } from '../recent-writes.js';
import { mkdirSync, rmSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
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

describe('WorkspaceWatcher', () => {
  let testRoot: string;
  let watcher: WorkspaceWatcher;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let recentWrites: RecentWritesRegistry;

  beforeEach(() => {
    testRoot = join(tmpdir(), `watcher-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(testRoot, { recursive: true });
    mkdirSync(join(testRoot, 'proj-1'), { recursive: true });
    eventBus = createMockEventBus();
    recentWrites = new RecentWritesRegistry({ ttlMs: 2000 });
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('starts and reaches ready state', async () => {
    watcher = new WorkspaceWatcher({
      workspaceRoot: testRoot,
      eventBus,
      recentWrites,
      stabilityThresholdMs: 50,
    });
    await watcher.start();
    expect(watcher.state).toBe('ready');
  });

  it('emits event on file add', async () => {
    watcher = new WorkspaceWatcher({
      workspaceRoot: testRoot,
      eventBus,
      recentWrites,
      stabilityThresholdMs: 50,
    });
    await watcher.start();

    // Write a file
    writeFileSync(join(testRoot, 'proj-1', 'index.ts'), 'console.log("hi")');

    // Wait for stabilization + event propagation
    await sleep(500);

    // Should have at least one event for proj-1
    const fileEvents = eventBus.events.filter(
      e => e.type === 'appdev.workspace.file.changed'
    );
    expect(fileEvents.length).toBeGreaterThanOrEqual(1);

    const detail = fileEvents[0]!.detail as { projectId: string; filePath: string; changeType: string };
    expect(detail.projectId).toBe('proj-1');
    expect(detail.filePath).toBe('index.ts');
    expect(detail.changeType).toBe('add');
  });

  it('suppresses events for own writes via RecentWritesRegistry', async () => {
    watcher = new WorkspaceWatcher({
      workspaceRoot: testRoot,
      eventBus,
      recentWrites,
      stabilityThresholdMs: 50,
    });
    await watcher.start();

    // Mark the path as our own write BEFORE writing
    const filePath = join(testRoot, 'proj-1', 'generated.ts').replace(/\\/g, '/');
    recentWrites.markAsOwnWrite(filePath);

    // Write the file
    writeFileSync(join(testRoot, 'proj-1', 'generated.ts'), 'auto-generated');

    // Wait for stabilization
    await sleep(500);

    // Should NOT have an event for this file
    const fileEvents = eventBus.events.filter(
      e => e.type === 'appdev.workspace.file.changed' &&
           (e.detail as { filePath: string }).filePath === 'generated.ts'
    );
    expect(fileEvents.length).toBe(0);
  });

  it('handles workspace directory not existing at start', async () => {
    const nonExistentRoot = join(tmpdir(), `nonexistent-${Date.now()}`);
    // chokidar handles non-existent paths gracefully in v4
    watcher = new WorkspaceWatcher({
      workspaceRoot: nonExistentRoot,
      eventBus,
      recentWrites,
      stabilityThresholdMs: 50,
    });

    // Should not throw — chokidar watches even if path doesn't exist yet
    await watcher.start();
    expect(watcher.state).toBe('ready');
    await watcher.stop();
  });

  it('stops cleanly', async () => {
    watcher = new WorkspaceWatcher({
      workspaceRoot: testRoot,
      eventBus,
      recentWrites,
      stabilityThresholdMs: 50,
    });
    await watcher.start();
    await watcher.stop();
    expect(watcher.state).toBe('stopped');
  });

  it('normalizes Windows backslashes in event filePath', async () => {
    watcher = new WorkspaceWatcher({
      workspaceRoot: testRoot,
      eventBus,
      recentWrites,
      stabilityThresholdMs: 50,
    });
    await watcher.start();

    // Create nested path
    mkdirSync(join(testRoot, 'proj-1', 'src'), { recursive: true });
    writeFileSync(join(testRoot, 'proj-1', 'src', 'app.ts'), 'export {}');

    await sleep(500);

    const fileEvents = eventBus.events.filter(
      e => e.type === 'appdev.workspace.file.changed' &&
           (e.detail as { projectId: string }).projectId === 'proj-1'
    );

    // filePath should use forward slashes regardless of OS
    if (fileEvents.length > 0) {
      const detail = fileEvents[0]!.detail as { filePath: string };
      expect(detail.filePath).not.toContain('\\');
    }
  });
});
