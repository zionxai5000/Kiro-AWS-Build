/**
 * Pipeline Hook 10: Crash Watcher
 *
 * Trigger: Sentry webhook from a deployed user app
 * Action: Pull crash context, draft a fix prompt, queue as suggested edit.
 * Failure mode: SILENT
 * Timeout: 30s
 * Concurrency: 5 globally
 *
 * CRITICAL: Does NOT auto-apply fixes. Only drafts suggestions.
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'crash-watcher',
  name: 'Crash Watcher',
  triggerType: 'webhook',
  failureMode: 'silent',
  timeoutMs: 30_000,
  maxConcurrent: 5,
} as const;

export interface CrashWatcherInput {
  projectId: string;
  sentryEventId: string;
  errorMessage: string;
  stackTrace: string;
  platform: 'ios' | 'android';
}

export interface CrashWatcherOutput {
  fixPromptDrafted: boolean;
  suggestedFix?: string;
  affectedFile?: string;
}

export async function run(
  input: CrashWatcherInput,
  ctx: HookContext,
): Promise<HookResult<CrashWatcherOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: ctx.dryRun,
      data: { fixPromptDrafted: false },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would process crash "${input.sentryEventId}" for project "${input.projectId}"`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: true,
      data: { fixPromptDrafted: false },
      durationMs: Date.now() - start,
    };
  }

  // STUB: Real implementation in Phase 9
  ctx.log(`[${HOOK_METADATA.id}] Processing crash "${input.sentryEventId}" for project "${input.projectId}"`);
  return {
    success: true, hookId: HOOK_METADATA.id, dryRun: false,
    data: { fixPromptDrafted: false },
    durationMs: Date.now() - start,
  };
}
