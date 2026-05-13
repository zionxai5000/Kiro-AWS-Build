/**
 * Pipeline Hook 03: Dependency Validator
 *
 * Trigger: Save of generated/{projectId}/package.json
 * Action: Verify every dependency exists on npm, check Expo SDK compatibility.
 * Failure mode: HALT — block build if invalid.
 * Timeout: 30s
 * Concurrency: 5 globally
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
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

export interface DependencyValidatorOutput {
  valid: boolean;
  invalidDeps: Array<{ name: string; reason: string }>;
  checkedCount: number;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: DependencyValidatorInput,
  ctx: HookContext,
): Promise<HookResult<DependencyValidatorOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { valid: true, invalidDeps: [], checkedCount: 0 },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would validate dependencies in "${input.packageJsonPath}" for project "${input.projectId}"`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: true,
      data: { valid: true, invalidDeps: [], checkedCount: 0 },
      durationMs: Date.now() - start,
    };
  }

  // STUB: Real implementation in Phase 5
  ctx.log(`[${HOOK_METADATA.id}] Validating dependencies for project "${input.projectId}"`);
  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    data: { valid: true, invalidDeps: [], checkedCount: 0 },
    durationMs: Date.now() - start,
  };
}
