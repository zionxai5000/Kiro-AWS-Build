/**
 * Integration test: file change event → subscriber → hook stub fires.
 *
 * Uses InMemoryEventBusService and real filesystem.
 * Verifies the full subscription chain without mocking the event bus.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerHookSubscribers } from '../hook-subscribers.js';
import { APPDEV_EVENTS, createAppDevEvent } from '../event-types.js';
import { HOOKS_CONFIG } from '../../config/hooks.config.js';
import { resetAllCircuitBreakers } from '../../utils/circuit-breaker.js';
import { InMemoryEventBusService } from '@seraphim/services/event-bus/in-memory-event-bus.js';
import { Workspace } from '../../workspace/workspace.js';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Mock hooks to track invocations
vi.mock('../../pipeline/03-dependency-validator.js', () => ({
  run: vi.fn().mockResolvedValue({ success: true, hookId: 'dependency-validator', dryRun: true, durationMs: 1 }),
}));
vi.mock('../../pipeline/04-secret-scanner.js', () => ({
  run: vi.fn().mockResolvedValue({ success: true, hookId: 'secret-scanner', dryRun: true, durationMs: 1 }),
}));
vi.mock('../../pipeline/07-asset-generator.js', () => ({
  run: vi.fn().mockResolvedValue({ success: true, hookId: 'asset-generator', dryRun: true, durationMs: 1 }),
}));

import { run as mockHook3 } from '../../pipeline/03-dependency-validator.js';
import { run as mockHook4 } from '../../pipeline/04-secret-scanner.js';
import { run as mockHook7 } from '../../pipeline/07-asset-generator.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Hook Subscribers Integration', () => {
  let eventBus: InMemoryEventBusService;
  let testRoot: string;
  let workspace: Workspace;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllCircuitBreakers();
    eventBus = new InMemoryEventBusService();
    workspace = new Workspace();
    testRoot = workspace.getProjectPath('test-root-marker').replace(/[/\\]test-root-marker$/, '');

    HOOKS_CONFIG.globalKillSwitch = false;
    HOOKS_CONFIG.hooks['dependency-validator'] = { enabled: true, dryRun: true };
    HOOKS_CONFIG.hooks['secret-scanner'] = { enabled: true, dryRun: true };
    HOOKS_CONFIG.hooks['asset-generator'] = { enabled: true, dryRun: true };
  });

  afterEach(() => {
    for (const proj of ['proj-1', 'proj-2', 'proj-3']) {
      const p = join(testRoot, proj);
      if (existsSync(p)) rmSync(p, { recursive: true, force: true });
    }
  });

  it('package.json change triggers hook 3 and hook 4, NOT hook 7', async () => {
    // Set up workspace with a package.json
    mkdirSync(join(testRoot, 'proj-1'), { recursive: true });
    writeFileSync(join(testRoot, 'proj-1', 'package.json'), '{"name":"test"}');

    await registerHookSubscribers({ eventBus, workspace });

    // Publish file change event for package.json
    await eventBus.publish(createAppDevEvent(
      APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
      { projectId: 'proj-1', filePath: 'package.json', changeType: 'change' },
      'tenant-1',
    ));

    await sleep(100);

    expect(mockHook3).toHaveBeenCalled(); // dependency-validator fires
    expect(mockHook4).toHaveBeenCalled(); // secret-scanner fires (any file)
    expect(mockHook7).not.toHaveBeenCalled(); // asset-generator does NOT fire
  });

  it('app.json change with valid name triggers hook 7 and hook 4, NOT hook 3', async () => {
    // Set up workspace with app.json containing a valid name
    mkdirSync(join(testRoot, 'proj-2'), { recursive: true });
    writeFileSync(join(testRoot, 'proj-2', 'app.json'), JSON.stringify({
      expo: { name: 'TestApp', slug: 'test-app' },
    }));

    await registerHookSubscribers({ eventBus, workspace });

    // Publish file change event for app.json
    await eventBus.publish(createAppDevEvent(
      APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
      { projectId: 'proj-2', filePath: 'app.json', changeType: 'change' },
      'tenant-1',
    ));

    await sleep(100);

    expect(mockHook7).toHaveBeenCalled(); // asset-generator fires
    expect(mockHook4).toHaveBeenCalled(); // secret-scanner fires (any file)
    expect(mockHook3).not.toHaveBeenCalled(); // dependency-validator does NOT fire
  });

  it('regular .ts file change triggers only hook 4', async () => {
    mkdirSync(join(testRoot, 'proj-3'), { recursive: true });
    writeFileSync(join(testRoot, 'proj-3', 'index.ts'), 'export const x = 1;');

    await registerHookSubscribers({ eventBus, workspace });

    await eventBus.publish(createAppDevEvent(
      APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
      { projectId: 'proj-3', filePath: 'index.ts', changeType: 'add' },
      'tenant-1',
    ));

    await sleep(100);

    expect(mockHook4).toHaveBeenCalled(); // secret-scanner fires
    expect(mockHook3).not.toHaveBeenCalled(); // NOT package.json
    expect(mockHook7).not.toHaveBeenCalled(); // NOT app.json
  });
});
