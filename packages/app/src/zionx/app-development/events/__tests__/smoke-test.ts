/**
 * Manual smoke test — run with: npx tsx packages/app/src/zionx/app-development/events/__tests__/smoke-test.ts
 *
 * Creates a temp workspace, starts the watcher, writes a file, and confirms
 * the event appears in the bus subscriber. Prints results to stdout.
 */

import { WorkspaceWatcher } from '../workspace-watcher.js';
import { RecentWritesRegistry } from '../recent-writes.js';
import { APPDEV_EVENTS } from '../event-types.js';
import { InMemoryEventBusService } from '../../../../../../services/src/event-bus/in-memory-event-bus.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function main() {
  const testRoot = join(tmpdir(), `smoke-test-${Date.now()}`);
  mkdirSync(join(testRoot, 'smoke-project'), { recursive: true });

  const eventBus = new InMemoryEventBusService();
  const recentWrites = new RecentWritesRegistry();

  // Subscribe to file change events
  let receivedEvent: unknown = null;
  await eventBus.subscribe(
    { type: [APPDEV_EVENTS.WORKSPACE_FILE_CHANGED] },
    async (event) => {
      receivedEvent = event;
    },
  );

  // Start watcher
  const watcher = new WorkspaceWatcher({
    workspaceRoot: testRoot,
    eventBus,
    recentWrites,
    stabilityThresholdMs: 100,
  });
  await watcher.start();
  console.log(`[SMOKE] Watcher started. Root: ${testRoot}`);
  console.log(`[SMOKE] State: ${watcher.state}`);

  // Write a file
  const filePath = join(testRoot, 'smoke-project', 'hello.ts');
  writeFileSync(filePath, 'export const greeting = "hello world";');
  console.log(`[SMOKE] Wrote file: ${filePath}`);

  // Wait for event
  console.log(`[SMOKE] Waiting for event...`);
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Check results
  const storedEvents = eventBus.getStoredEvents();
  const fileEvents = storedEvents.filter(e => e.type === APPDEV_EVENTS.WORKSPACE_FILE_CHANGED);

  console.log(`[SMOKE] Events received: ${fileEvents.length}`);
  if (fileEvents.length > 0) {
    console.log(`[SMOKE] Event detail:`, JSON.stringify(fileEvents[0]!.detail, null, 2));
    console.log(`[SMOKE] ✅ PASS — event appeared in bus subscriber`);
  } else {
    console.log(`[SMOKE] ❌ FAIL — no event received`);
  }

  // Cleanup
  await watcher.stop();
  rmSync(testRoot, { recursive: true, force: true });
  console.log(`[SMOKE] Cleaned up.`);
}

main().catch(err => {
  console.error('[SMOKE] Fatal:', err);
  process.exit(1);
});
