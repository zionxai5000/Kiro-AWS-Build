/**
 * Pipeline Hook 07: Asset Generator
 *
 * Trigger: Save of generated/{projectId}/app.json with valid name field
 * Action: Generate icon variants, splash screen, screenshots via image API.
 * Failure mode: NOTIFY — assets are optional.
 * Timeout: 300s
 * Concurrency: 3 globally (expensive calls)
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { AssetSet } from '../types/index.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'asset-generator',
  name: 'Asset Generator',
  triggerType: 'file_event',
  failureMode: 'notify',
  timeoutMs: LIMITS.assetGenerationTimeoutMs,
  maxConcurrent: 3,
} as const;

export interface AssetGeneratorInput {
  projectId: string;
  appName: string;
  appDescription?: string;
}

export interface AssetGeneratorOutput {
  assets: AssetSet | null;
  costUsd: number;
}

export async function run(
  input: AssetGeneratorInput,
  ctx: HookContext,
): Promise<HookResult<AssetGeneratorOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: ctx.dryRun,
      data: { assets: null, costUsd: 0 },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would generate assets for "${input.appName}" in project "${input.projectId}"`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: true,
      data: { assets: null, costUsd: 0 },
      durationMs: Date.now() - start,
    };
  }

  // STUB: Real implementation in Phase 7
  ctx.log(`[${HOOK_METADATA.id}] Generating assets for "${input.appName}"`);
  return {
    success: true, hookId: HOOK_METADATA.id, dryRun: false,
    data: { assets: null, costUsd: 0 },
    durationMs: Date.now() - start,
  };
}
