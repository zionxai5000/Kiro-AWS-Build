/**
 * Pipeline Hook 06: Build Preparer
 *
 * Trigger: Manual API call "Build for Device"
 * Action: Validate app.json, generate missing icons, submit to EAS Build queue.
 * Failure mode: NOTIFY
 * Timeout: 60s for prep (build itself runs on EAS)
 * Concurrency: 1 per user
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'build-preparer',
  name: 'Build Preparer',
  triggerType: 'api_request',
  failureMode: 'notify',
  timeoutMs: LIMITS.buildPrepTimeoutMs,
  maxConcurrent: 1,
} as const;

export interface BuildPreparerInput {
  projectId: string;
  platform: 'ios' | 'android';
}

export interface BuildPreparerOutput {
  ready: boolean;
  validationErrors: string[];
  buildJobId?: string;
}

export async function run(
  input: BuildPreparerInput,
  ctx: HookContext,
): Promise<HookResult<BuildPreparerOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: ctx.dryRun,
      data: { ready: false, validationErrors: ['Hook disabled'] },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would prepare ${input.platform} build for project "${input.projectId}"`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: true,
      data: { ready: false, validationErrors: [] },
      durationMs: Date.now() - start,
    };
  }

  // STUB: Real implementation in Phase 6
  ctx.log(`[${HOOK_METADATA.id}] Preparing ${input.platform} build for project "${input.projectId}"`);
  return {
    success: true, hookId: HOOK_METADATA.id, dryRun: false,
    data: { ready: false, validationErrors: [] },
    durationMs: Date.now() - start,
  };
}
