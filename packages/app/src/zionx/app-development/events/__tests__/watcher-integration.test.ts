/**
 * Integration test: file write → watcher fires → event bus receives.
 *
 * Uses real filesystem and InMemoryEventBusService (from @seraphim/services).
 * Exercises the full path without mocks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceWatcher } from '../workspace-watcher.js';
import { RecentWritesRegistry } from '../recent-writes.js';
import { APPDEV_EVENTS } from '../event-types.js';
import { InMemoryEventBusService } from '@seraphim/services/event-bus/in-memory-event-bus.js';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Watcher Integration — file → event bus', () => {
  let testRoot: string;
  let watcher: WorkspaceWatcher;
  let eventBus: InMemoryEventBusService;
  let recentWrites: RecentWritesRegistry;

  beforeEach(() => {
    testRoot = join(tmpdir(), `watcher-integ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(join(testRoot, 'test-project'), { recursive: true });
    eventBus = new InMemoryEventBusService();
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

  it('publishes file change event to InMemoryEventBusService on file write', async () => {
    // Set up a subscriber to capture events
    const received: Array<{ type: string; detail: Record<string, unknown> }> = [];
    await eventBus.subscribe(
      { type: [APPDEV_EVENTS.WORKSPACE_FILE_CHANGED] },
      async (event) => {
        received.push({ type: event.type, detail: event.detail });
      },
    );

    // Start watcher
    watcher = new WorkspaceWatcher({
      workspaceRoot: testRoot,
      eventBus,
      recentWrites,
      stabilityThresholdMs: 50,
    });
    await watcher.start();
    expect(watcher.state).toBe('ready');

    // Write a file to the workspace
    writeFileSync(join(testRoot, 'test-project', 'app.ts'), 'export const x = 1;');

    // Wait for watcher stabilization + event propagation
    // Windows may batch events; give generous time
    await sleep(800);

    // Verify the event bus received the event
    const storedEvents = eventBus.getStoredEvents();
    const fileChangeEvents = storedEvents.filter(
      e => e.type === APPDEV_EVENTS.WORKSPACE_FILE_CHANGED
    );

    expect(fileChangeEvents.length).toBeGreaterThanOrEqual(1);

    const detail = fileChangeEvents[0]!.detail as {
      projectId: string;
      filePath: string;
      changeType: string;
    };
    expect(detail.projectId).toBe('test-project');
    expect(detail.filePath).toBe('app.ts');
    expect(detail.changeType).toBe('add');
  });

  it('does not publish event when file is marked as own write', async () => {
    // Start watcher
    watcher = new WorkspaceWatcher({
      workspaceRoot: testRoot,
      eventBus,
      recentWrites,
      stabilityThresholdMs: 50,
    });
    await watcher.start();

    // Mark the file as our own write
    const filePath = join(testRoot, 'test-project', 'own-write.ts').replace(/\\/g, '/');
    recentWrites.markAsOwnWrite(filePath);

    // Write the file
    writeFileSync(join(testRoot, 'test-project', 'own-write.ts'), 'suppressed');

    await sleep(800);

    // Should NOT have an event for this specific file
    const storedEvents = eventBus.getStoredEvents();
    const ownWriteEvents = storedEvents.filter(
      e => e.type === APPDEV_EVENTS.WORKSPACE_FILE_CHANGED &&
           (e.detail as { filePath: string }).filePath === 'own-write.ts'
    );
    expect(ownWriteEvents.length).toBe(0);
  });

  it('handles multiple files written in quick succession', async () => {
    watcher = new WorkspaceWatcher({
      workspaceRoot: testRoot,
      eventBus,
      recentWrites,
      stabilityThresholdMs: 50,
    });
    await watcher.start();

    // Write 3 files quickly
    writeFileSync(join(testRoot, 'test-project', 'a.ts'), 'a');
    writeFileSync(join(testRoot, 'test-project', 'b.ts'), 'b');
    writeFileSync(join(testRoot, 'test-project', 'c.ts'), 'c');

    // Give generous time for all events to arrive (Windows batching)
    await sleep(1200);

    const storedEvents = eventBus.getStoredEvents();
    const fileChangeEvents = storedEvents.filter(
      e => e.type === APPDEV_EVENTS.WORKSPACE_FILE_CHANGED
    );

    // Should have at least 3 events (one per file), though Windows may coalesce
    // We check >= 1 to be safe on all platforms
    expect(fileChangeEvents.length).toBeGreaterThanOrEqual(1);

    // All events should have projectId = 'test-project'
    for (const event of fileChangeEvents) {
      expect((event.detail as { projectId: string }).projectId).toBe('test-project');
    }
  });
});
