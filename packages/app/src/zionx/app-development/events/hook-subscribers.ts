/**
 * Hook Subscribers — registers pipeline hooks 3, 4, 7 as event bus subscribers.
 *
 * Each hook subscribes to appdev.workspace.file.changed events with specific filters:
 * - Hook 3 (dependency-validator): filePath ends with /package.json
 * - Hook 4 (secret-scanner): any file
 * - Hook 7 (asset-generator): filePath ends with /app.json AND file has valid name field
 *
 * Subscribers:
 * - Check isEnabled() and isDryRun() at INVOCATION time (not registration time)
 * - Fire hook execution via Promise.resolve().then() (fire-and-forget, non-blocking)
 * - Catch and log errors internally; never re-throw to the bus
 * - Respect circuit breaker per hook
 *
 * Returns subscription IDs for cleanup (testing, shutdown).
 */

import type { EventBusService } from '@seraphim/core';
import type { SeraphimEvent } from '@seraphim/core';
import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { getCircuitBreaker, CircuitOpenError } from '../utils/circuit-breaker.js';
import { run as runDependencyValidator } from '../pipeline/03-dependency-validator.js';
import { run as runSecretScanner } from '../pipeline/04-secret-scanner.js';
import { run as runAssetGenerator } from '../pipeline/07-asset-generator.js';
import { APPDEV_EVENTS } from './event-types.js';
import { Workspace } from '../workspace/workspace.js';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HookSubscriberDeps {
  eventBus: EventBusService;
  workspace?: Workspace;
}

export interface SubscriptionIds {
  hook3: string;
  hook4: string;
  hook7: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Register hooks 3, 4, 7 as event bus subscribers.
 * Returns subscription IDs for cleanup.
 */
export async function registerHookSubscribers(deps: HookSubscriberDeps): Promise<SubscriptionIds> {
  const { eventBus, workspace } = deps;
  const ws = workspace ?? new Workspace();

  // Hook 3: dependency-validator — fires on package.json changes
  const hook3Id = await eventBus.subscribe(
    { type: [APPDEV_EVENTS.WORKSPACE_FILE_CHANGED] },
    async (event: SeraphimEvent) => {
      const detail = event.detail as { projectId?: string; filePath?: string; changeType?: string };
      if (!detail.filePath || !detail.projectId) return;

      // Filter: only package.json files
      if (!detail.filePath.endsWith('package.json')) return;

      // Fire-and-forget in microtask
      Promise.resolve().then(() => invokeHook3(detail.projectId!, detail.filePath!));
    },
  );

  // Hook 4: secret-scanner — fires on ANY file change
  const hook4Id = await eventBus.subscribe(
    { type: [APPDEV_EVENTS.WORKSPACE_FILE_CHANGED] },
    async (event: SeraphimEvent) => {
      const detail = event.detail as { projectId?: string; filePath?: string; changeType?: string };
      if (!detail.filePath || !detail.projectId) return;

      // No filter — all files
      Promise.resolve().then(() => invokeHook4(detail.projectId!, detail.filePath!, ws));
    },
  );

  // Hook 7: asset-generator — fires on app.json changes with valid name
  const hook7Id = await eventBus.subscribe(
    { type: [APPDEV_EVENTS.WORKSPACE_FILE_CHANGED] },
    async (event: SeraphimEvent) => {
      const detail = event.detail as { projectId?: string; filePath?: string; changeType?: string };
      if (!detail.filePath || !detail.projectId) return;

      // Filter: only app.json files
      if (!detail.filePath.endsWith('app.json')) return;

      // Fire-and-forget — reads file to check for valid name
      Promise.resolve().then(() => invokeHook7(detail.projectId!, detail.filePath!, ws));
    },
  );

  return { hook3: hook3Id, hook4: hook4Id, hook7: hook7Id };
}

// ---------------------------------------------------------------------------
// Hook Invocation Helpers (fire-and-forget, error-safe)
// ---------------------------------------------------------------------------

async function invokeHook3(projectId: string, filePath: string): Promise<void> {
  const hookId = 'dependency-validator';

  // Runtime config check (not captured at registration time)
  if (!isHookEnabled(hookId)) return;

  // Circuit breaker
  const cb = getCircuitBreaker(hookId);
  try {
    cb.allowRequest();
  } catch (e) {
    if (e instanceof CircuitOpenError) {
      console.warn(`[hook-subscribers] Hook 3 circuit open — skipping ${filePath}`);
      return;
    }
    throw e;
  }

  const ctx = {
    executionId: randomUUID(),
    dryRun: isHookDryRun(hookId),
    startedAt: new Date().toISOString(),
    log: (msg: string) => console.log(msg),
  };

  try {
    await runDependencyValidator({ projectId, packageJsonPath: filePath }, ctx);
    cb.recordSuccess();
  } catch (error) {
    cb.recordFailure();
    console.error(`[hook-subscribers] Hook 3 error for ${filePath}:`, (error as Error).message);
  }
}

async function invokeHook4(projectId: string, filePath: string, workspace: Workspace): Promise<void> {
  const hookId = 'secret-scanner';

  if (!isHookEnabled(hookId)) return;

  const cb = getCircuitBreaker(hookId);
  try {
    cb.allowRequest();
  } catch (e) {
    if (e instanceof CircuitOpenError) {
      console.warn(`[hook-subscribers] Hook 4 circuit open — skipping ${filePath}`);
      return;
    }
    throw e;
  }

  const ctx = {
    executionId: randomUUID(),
    dryRun: isHookDryRun(hookId),
    startedAt: new Date().toISOString(),
    log: (msg: string) => console.log(msg),
  };

  try {
    // Read file content for scanning
    let content = '';
    try {
      content = await workspace.readFile(projectId, filePath);
    } catch {
      // File may have been deleted between event and scan
      return;
    }

    await runSecretScanner({ projectId, filePath, content }, ctx);
    cb.recordSuccess();
  } catch (error) {
    cb.recordFailure();
    console.error(`[hook-subscribers] Hook 4 error for ${filePath}:`, (error as Error).message);
  }
}

async function invokeHook7(projectId: string, filePath: string, workspace: Workspace): Promise<void> {
  const hookId = 'asset-generator';

  if (!isHookEnabled(hookId)) return;

  const cb = getCircuitBreaker(hookId);
  try {
    cb.allowRequest();
  } catch (e) {
    if (e instanceof CircuitOpenError) {
      console.warn(`[hook-subscribers] Hook 7 circuit open — skipping ${filePath}`);
      return;
    }
    throw e;
  }

  // Read app.json to check for valid name field
  let appName: string | undefined;
  let appDescription: string | undefined;
  try {
    const content = await workspace.readFile(projectId, filePath);
    const parsed = JSON.parse(content);
    // Support both { name: "..." } and { expo: { name: "..." } }
    appName = parsed?.expo?.name ?? parsed?.name;
    appDescription = parsed?.expo?.description ?? parsed?.description;
  } catch {
    // Can't read or parse — skip
    return;
  }

  if (!appName || typeof appName !== 'string' || appName.trim().length === 0) {
    return; // No valid name — skip
  }

  const ctx = {
    executionId: randomUUID(),
    dryRun: isHookDryRun(hookId),
    startedAt: new Date().toISOString(),
    log: (msg: string) => console.log(msg),
  };

  try {
    await runAssetGenerator({ projectId, appName, appDescription }, ctx);
    cb.recordSuccess();
  } catch (error) {
    cb.recordFailure();
    console.error(`[hook-subscribers] Hook 7 error for ${filePath}:`, (error as Error).message);
  }
}
