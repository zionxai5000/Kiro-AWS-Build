/**
 * Pipeline Hook 05: Preview Refresher
 *
 * Trigger: Any save in generated/{projectId}/ (debounced 500ms)
 * Action: Emit event for clients (dashboard, mobile) to refresh preview.
 * Failure mode: SILENT — preview failures are non-critical.
 * Timeout: 10s
 * Concurrency: 1 per projectId
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'preview-refresher',
  name: 'Preview Refresher',
  triggerType: 'file_event',
  failureMode: 'silent',
  timeoutMs: LIMITS.previewRefreshTimeoutMs,
  maxConcurrent: 1,
} as const;

export interface PreviewRefresherInput {
  projectId: string;
  changedFiles: string[];
}

export interface PreviewRefresherOutput {
  eventEmitted: boolean;
  subscriberCount: number;
}

export async function run(
  input: PreviewRefresherInput,
  ctx: HookContext,
): Promise<HookResult<PreviewRefresherOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: ctx.dryRun,
      data: { eventEmitted: false, subscriberCount: 0 },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would emit preview refresh for project "${input.projectId}" (${input.changedFiles.length} files changed)`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: true,
      data: { eventEmitted: false, subscriberCount: 0 },
      durationMs: Date.now() - start,
    };
  }

  // STUB: Real implementation in Phase 4
  ctx.log(`[${HOOK_METADATA.id}] Emitting preview refresh for project "${input.projectId}"`);
  return {
    success: true, hookId: HOOK_METADATA.id, dryRun: false,
    data: { eventEmitted: true, subscriberCount: 0 },
    durationMs: Date.now() - start,
  };
}
