/**
 * Pipeline Hook 09: Submission Prep
 *
 * Trigger: Manual API call "Ready to Submit"
 * Action: Bundle build + assets + listing into review. Await explicit confirmation.
 * Failure mode: HALT — never bypass user confirmation.
 * Timeout: 30s
 * Concurrency: 1 per user
 *
 * CRITICAL: This hook does NOT auto-submit. It produces a review bundle and
 * requires an explicit confirmation API call before the actual submission.
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { SubmissionChecklist } from '../types/index.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'submission-prep',
  name: 'Submission Prep',
  triggerType: 'api_request',
  failureMode: 'halt',
  timeoutMs: LIMITS.submissionPrepTimeoutMs,
  maxConcurrent: 1,
} as const;

export interface SubmissionPrepInput {
  projectId: string;
  platform: 'ios' | 'android';
}

export interface SubmissionPrepOutput {
  checklist: SubmissionChecklist | null;
  readyForConfirmation: boolean;
  missingItems: string[];
}

export async function run(
  input: SubmissionPrepInput,
  ctx: HookContext,
): Promise<HookResult<SubmissionPrepOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: ctx.dryRun,
      data: { checklist: null, readyForConfirmation: false, missingItems: ['Hook disabled'] },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would prepare ${input.platform} submission for project "${input.projectId}"`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: true,
      data: { checklist: null, readyForConfirmation: false, missingItems: [] },
      durationMs: Date.now() - start,
    };
  }

  // STUB: Real implementation in Phase 8
  ctx.log(`[${HOOK_METADATA.id}] Preparing ${input.platform} submission for project "${input.projectId}"`);
  return {
    success: true, hookId: HOOK_METADATA.id, dryRun: false,
    data: { checklist: null, readyForConfirmation: false, missingItems: [] },
    durationMs: Date.now() - start,
  };
}
