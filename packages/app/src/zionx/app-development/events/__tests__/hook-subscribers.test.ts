import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerHookSubscribers } from '../hook-subscribers.js';
import { APPDEV_EVENTS, createAppDevEvent } from '../event-types.js';
import { HOOKS_CONFIG } from '../../config/hooks.config.js';
import { resetAllCircuitBreakers } from '../../utils/circuit-breaker.js';
import { InMemoryEventBusService } from '@seraphim/services/event-bus/in-memory-event-bus.js';
import { Workspace } from '../../workspace/workspace.js';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Mock the pipeline hooks
// ---------------------------------------------------------------------------

vi.mock('../../pipeline/03-dependency-validator.js', () => ({
  run: vi.fn().mockResolvedValue({ success: true, hookId: 'dependency-validator', dryRun: false, data: { valid: true, invalidDeps: [], checkedCount: 0 }, durationMs: 1 }),
}));

vi.mock('../../pipeline/04-secret-scanner.js', () => ({
  run: vi.fn().mockResolvedValue({ success: true, hookId: 'secret-scanner', dryRun: false, data: { clean: true, findings: [], quarantined: false }, durationMs: 1 }),
}));

vi.mock('../../pipeline/07-asset-generator.js', () => ({
  run: vi.fn().mockResolvedValue({ success: true, hookId: 'asset-generator', dryRun: false, data: { assets: null, costUsd: 0 }, durationMs: 1 }),
}));

import { run as mockRunHook3 } from '../../pipeline/03-dependency-validator.js';
import { run as mockRunHook4 } from '../../pipeline/04-secret-scanner.js';
import { run as mockRunHook7 } from '../../pipeline/07-asset-generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hook Subscribers', () => {
  let eventBus: InMemoryEventBusService;
  let testRoot: string;
  let workspace: Workspace;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllCircuitBreakers();
    eventBus = new InMemoryEventBusService();
    workspace = new Workspace();
    // Use the workspace's actual project path for file creation
    testRoot = workspace.getProjectPath('test-root-marker').replace(/[/\\]test-root-marker$/, '');

    // Reset hook config to enabled + dryRun: true (default)
    HOOKS_CONFIG.globalKillSwitch = false;
    HOOKS_CONFIG.hooks['dependency-validator'] = { enabled: true, dryRun: true };
    HOOKS_CONFIG.hooks['secret-scanner'] = { enabled: true, dryRun: true };
    HOOKS_CONFIG.hooks['asset-generator'] = { enabled: true, dryRun: true };
  });

  afterEach(() => {
    // Clean up any project dirs we created
    const proj1 = join(testRoot, 'proj-1');
    if (existsSync(proj1)) rmSync(proj1, { recursive: true, force: true });
  });

  describe('Hook 3 (dependency-validator)', () => {
    it('fires on package.json change', async () => {
      await registerHookSubscribers({ eventBus, workspace });

      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'package.json', changeType: 'change' },
        'tenant-1',
      ));

      await sleep(50); // microtask
      expect(mockRunHook3).toHaveBeenCalled();
    });

    it('fires on nested package.json (e.g., src/package.json)', async () => {
      await registerHookSubscribers({ eventBus, workspace });

      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'src/package.json', changeType: 'add' },
        'tenant-1',
      ));

      await sleep(50);
      expect(mockRunHook3).toHaveBeenCalled();
    });

    it('does NOT fire on non-package.json files', async () => {
      await registerHookSubscribers({ eventBus, workspace });

      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'src/index.ts', changeType: 'change' },
        'tenant-1',
      ));

      await sleep(50);
      expect(mockRunHook3).not.toHaveBeenCalled();
    });
  });

  describe('Hook 4 (secret-scanner)', () => {
    it('fires on ANY file change', async () => {
      // Create the file so workspace.readFile works
      const projPath = join(testRoot, 'proj-1', 'src');
      mkdirSync(projPath, { recursive: true });
      writeFileSync(join(projPath, 'app.ts'), 'const x = 1;');

      await registerHookSubscribers({ eventBus, workspace });

      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'src/app.ts', changeType: 'change' },
        'tenant-1',
      ));

      await sleep(50);
      expect(mockRunHook4).toHaveBeenCalled();
    });
  });

  describe('Hook 7 (asset-generator)', () => {
    it('fires on app.json change with valid name', async () => {
      mkdirSync(join(testRoot, 'proj-1'), { recursive: true });
      writeFileSync(join(testRoot, 'proj-1', 'app.json'), JSON.stringify({ expo: { name: 'MyApp' } }));

      await registerHookSubscribers({ eventBus, workspace });

      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'app.json', changeType: 'change' },
        'tenant-1',
      ));

      await sleep(50);
      expect(mockRunHook7).toHaveBeenCalled();
    });

    it('does NOT fire on app.json without valid name', async () => {
      mkdirSync(join(testRoot, 'proj-1'), { recursive: true });
      writeFileSync(join(testRoot, 'proj-1', 'app.json'), JSON.stringify({ expo: {} }));

      await registerHookSubscribers({ eventBus, workspace });

      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'app.json', changeType: 'change' },
        'tenant-1',
      ));

      await sleep(50);
      expect(mockRunHook7).not.toHaveBeenCalled();
    });

    it('does NOT fire on package.json', async () => {
      await registerHookSubscribers({ eventBus, workspace });

      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'package.json', changeType: 'change' },
        'tenant-1',
      ));

      await sleep(50);
      expect(mockRunHook7).not.toHaveBeenCalled();
    });
  });

  describe('Kill switch (runtime check)', () => {
    it('disabled hook does NOT fire', async () => {
      HOOKS_CONFIG.hooks['dependency-validator'] = { enabled: false, dryRun: false };

      await registerHookSubscribers({ eventBus, workspace });

      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'package.json', changeType: 'change' },
        'tenant-1',
      ));

      await sleep(50);
      expect(mockRunHook3).not.toHaveBeenCalled();
    });

    it('config change AFTER registration is respected', async () => {
      // Register with hook enabled
      HOOKS_CONFIG.hooks['dependency-validator'] = { enabled: true, dryRun: true };
      await registerHookSubscribers({ eventBus, workspace });

      // First event — should fire
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'package.json', changeType: 'change' },
        'tenant-1',
      ));
      await sleep(50);
      expect(mockRunHook3).toHaveBeenCalledTimes(1);

      // Disable at runtime
      HOOKS_CONFIG.hooks['dependency-validator'] = { enabled: false, dryRun: false };

      // Second event — should NOT fire
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'package.json', changeType: 'change' },
        'tenant-1',
      ));
      await sleep(50);
      expect(mockRunHook3).toHaveBeenCalledTimes(1); // still 1, not 2
    });
  });

  describe('Fire-and-forget (non-blocking)', () => {
    it('subscriber returns immediately without awaiting hook', async () => {
      // Make hook 4 slow
      vi.mocked(mockRunHook4).mockImplementation(async () => {
        await sleep(500);
        return { success: true, hookId: 'secret-scanner', dryRun: false, durationMs: 500 } as any;
      });

      mkdirSync(join(testRoot, 'proj-1'), { recursive: true });
      writeFileSync(join(testRoot, 'proj-1', 'slow.ts'), 'x');

      await registerHookSubscribers({ eventBus, workspace });

      const start = Date.now();
      await eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'slow.ts', changeType: 'add' },
        'tenant-1',
      ));
      const elapsed = Date.now() - start;

      // publish() should return almost immediately (< 100ms), not wait 500ms
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Error handling', () => {
    it('hook error is caught and NOT propagated to bus', async () => {
      vi.mocked(mockRunHook3).mockRejectedValueOnce(new Error('hook crashed'));

      await registerHookSubscribers({ eventBus, workspace });

      // Should not throw
      await expect(eventBus.publish(createAppDevEvent(
        APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
        { projectId: 'proj-1', filePath: 'package.json', changeType: 'change' },
        'tenant-1',
      ))).resolves.toBeDefined();

      await sleep(50);
      // Hook was called (and failed internally)
      expect(mockRunHook3).toHaveBeenCalled();
    });
  });

  describe('Returns subscription IDs', () => {
    it('returns 3 subscription IDs', async () => {
      const ids = await registerHookSubscribers({ eventBus, workspace });
      expect(ids.hook3).toBeDefined();
      expect(ids.hook4).toBeDefined();
      expect(ids.hook7).toBeDefined();
      expect(ids.hook3).not.toBe(ids.hook4);
    });
  });
});
