/**
 * Pipeline Hook 03: Dependency Validator
 *
 * Trigger: Save of generated/{projectId}/package.json
 * Action: Verify every dependency exists on npm and version range is satisfiable.
 * Failure mode: HALT — block build if invalid.
 * Timeout: 30s
 * Concurrency: 5 globally
 *
 * v1 validates package existence and version range satisfiability only.
 * Expo SDK compatibility is validated implicitly by Phase 6 build pipeline.
 * Adding an explicit Expo compatibility allowlist deferred to a future quality pass.
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { getCircuitBreaker } from '../utils/circuit-breaker.js';
import { withTimeout } from '../utils/timeout.js';
import { Semaphore, withSemaphore } from '../utils/semaphore.js';
import { NpmRegistryClient, type PackageCheckResult } from '../services/npm-registry-client.js';
import { Workspace } from '../workspace/workspace.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'dependency-validator',
  name: 'Dependency Validator',
  triggerType: 'file_event',
  failureMode: 'halt',
  timeoutMs: LIMITS.dependencyValidationTimeoutMs,
  maxConcurrent: 5,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface DependencyValidatorInput {
  projectId: string;
  packageJsonPath: string;
}

export interface DependencyError {
  name: string;
  versionRange?: string;
  reason: 'not_found' | 'version_unsatisfiable' | 'check_failed';
  detail?: string;
}

export interface DependencyValidatorOutput {
  valid: boolean;
  errors: DependencyError[];
  checkedCount: number;
  skipped?: boolean;
}

// ---------------------------------------------------------------------------
// Module-level instances (shared across invocations)
// ---------------------------------------------------------------------------

const npmClient = new NpmRegistryClient();
const semaphore = new Semaphore(5);

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: DependencyValidatorInput,
  ctx: HookContext,
): Promise<HookResult<DependencyValidatorOutput>> {
  const start = Date.now();

  // Kill switch check
  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { valid: true, errors: [], checkedCount: 0 },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  // Read package.json from workspace
  const workspace = new Workspace();
  let packageJsonContent: string;
  try {
    packageJsonContent = await workspace.readFile(input.projectId, input.packageJsonPath);
  } catch {
    // File missing — nothing to validate, skip gracefully
    ctx.log(`[${HOOK_METADATA.id}] package.json not found at "${input.packageJsonPath}" for project "${input.projectId}" — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun,
      data: { valid: true, errors: [], checkedCount: 0, skipped: true },
      durationMs: Date.now() - start,
    };
  }

  // Parse JSON
  let packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    packageJson = JSON.parse(packageJsonContent);
  } catch {
    ctx.log(`[${HOOK_METADATA.id}] Invalid JSON in package.json for project "${input.projectId}"`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun,
      error: 'Invalid package.json — JSON parse failed',
      data: { valid: false, errors: [{ name: 'package.json', reason: 'check_failed', detail: 'Invalid JSON' }], checkedCount: 0 },
      durationMs: Date.now() - start,
    };
  }

  // Collect all dependencies
  const deps: Array<{ name: string; range: string }> = [];
  if (packageJson.dependencies) {
    for (const [name, range] of Object.entries(packageJson.dependencies)) {
      deps.push({ name, range });
    }
  }
  if (packageJson.devDependencies) {
    for (const [name, range] of Object.entries(packageJson.devDependencies)) {
      deps.push({ name, range });
    }
  }

  if (deps.length === 0) {
    ctx.log(`[${HOOK_METADATA.id}] No dependencies to validate for project "${input.projectId}"`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun,
      data: { valid: true, errors: [], checkedCount: 0 },
      durationMs: Date.now() - start,
    };
  }

  // Dry-run path
  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would validate ${deps.length} dependencies for project "${input.projectId}"`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: true,
      data: { valid: true, errors: [], checkedCount: deps.length },
      durationMs: Date.now() - start,
    };
  }

  // Circuit breaker
  const cb = getCircuitBreaker(HOOK_METADATA.id);
  cb.allowRequest();

  ctx.log(`[${HOOK_METADATA.id}] Validating ${deps.length} dependencies for project "${input.projectId}"`);

  // Validate all deps with bounded concurrency (semaphore: 5 concurrent)
  const errors: DependencyError[] = [];

  try {
    await withTimeout(async () => {
      const results = await Promise.allSettled(
        deps.map(dep => withSemaphore(semaphore, async () => {
          try {
            const result = await npmClient.checkPackage(dep.name, dep.range);
            return { dep, result };
          } catch (error) {
            return { dep, error: error as Error };
          }
        })),
      );

      for (const settled of results) {
        if (settled.status === 'rejected') {
          // Shouldn't happen with our error handling, but be safe
          errors.push({ name: 'unknown', reason: 'check_failed', detail: String(settled.reason) });
          continue;
        }

        const { dep, result, error } = settled.value as { dep: { name: string; range: string }; result?: PackageCheckResult; error?: Error };

        if (error) {
          errors.push({ name: dep.name, versionRange: dep.range, reason: 'check_failed', detail: error.message });
          continue;
        }

        if (!result!.exists) {
          errors.push({ name: dep.name, versionRange: dep.range, reason: 'not_found' });
          continue;
        }

        if (result!.versionSatisfied === false) {
          errors.push({ name: dep.name, versionRange: dep.range, reason: 'version_unsatisfiable' });
        }
      }
    }, HOOK_METADATA.timeoutMs, `Dependency validation timed out for project "${input.projectId}"`);
  } catch (error) {
    cb.recordFailure();
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: (error as Error).message,
      data: { valid: false, errors, checkedCount: deps.length },
      durationMs: Date.now() - start,
    };
  }

  cb.recordSuccess();

  if (errors.length > 0) {
    const summary = errors.map(e => `${e.name}@${e.versionRange ?? '*'}: ${e.reason}`).join(', ');
    ctx.log(`[${HOOK_METADATA.id}] FAILED — ${errors.length} invalid: ${summary}`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: `${errors.length} dependency validation failure(s)`,
      data: { valid: false, errors, checkedCount: deps.length },
      durationMs: Date.now() - start,
    };
  }

  ctx.log(`[${HOOK_METADATA.id}] PASS — all ${deps.length} dependencies valid`);
  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    data: { valid: true, errors: [], checkedCount: deps.length },
    durationMs: Date.now() - start,
  };
}
