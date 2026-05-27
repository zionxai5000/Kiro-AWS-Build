/**
 * Pipeline Hook 09b: Submitter
 *
 * Trigger: API call after Hook 6 (build-runner) finishes successfully
 *          OR explicit "auto-submit" flag on the build request.
 * Action: Run `eas submit --platform <ios|android>` for the finished build,
 *         emit appdev.submission.completed.
 * Failure mode: NOTIFY (we never block on submission errors — the user can
 *               always retry manually).
 * Timeout: 15 minutes (Apple sometimes queues for several minutes).
 * Concurrency: 1 per project.
 *
 * Distinct from Hook 9 (submission-prep), which only validates the workspace
 * checklist. Hook 9b is what actually pushes the binary to App Store Connect
 * or Google Play.
 *
 * After submission completes (success or failure), Hook 10b (testflight-watcher)
 * is invoked to track Apple's processing state.
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { submitBuild } from '../services/eas-cli-wrapper.js';
import { Workspace } from '../workspace/workspace.js';
import { APPDEV_EVENTS, createAppDevEvent } from '../events/event-types.js';
import type { EventBusService } from '@seraphim/core';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'submitter',
  name: 'Submitter',
  triggerType: 'api_request',
  failureMode: 'notify',
  timeoutMs: LIMITS.submitTimeoutMs,
  maxConcurrent: 1,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface SubmitterInput {
  projectId: string;
  platform: 'ios' | 'android';
  /** The EAS build id we're submitting (must be FINISHED before calling). */
  easBuildId: string;
  /** Optional Android track override (defaults to 'internal'). */
  androidTrack?: string;
  credentialManager: CredentialManager;
  eventBus: EventBusService;
  tenantId?: string;
}

export interface SubmitterOutput {
  status: 'submitted' | 'failed' | 'dry_run' | 'disabled';
  submissionId?: string;
  errorMessage?: string;
  /** Echo of the EAS build id for downstream watchers. */
  easBuildId: string;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: SubmitterInput,
  ctx: HookContext,
): Promise<HookResult<SubmitterOutput>> {
  const start = Date.now();
  const { projectId, platform, easBuildId, credentialManager, eventBus, androidTrack } = input;
  const tenantId = input.tenantId ?? 'system';

  // Kill switch
  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping submission`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { status: 'disabled', easBuildId },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);
  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would submit ${platform} build ${easBuildId} for project "${projectId}"`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: true,
      data: { status: 'dry_run', easBuildId },
      durationMs: Date.now() - start,
    };
  }

  // Resolve workspace path
  const workspace = new Workspace();
  const projectPath = workspace.getProjectPath(projectId);

  // Fetch Expo token
  let expoToken: string;
  try {
    expoToken = await credentialManager.getCredential('expo', 'access-token');
    if (!expoToken) throw new Error('Expo token is empty');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.log(`[${HOOK_METADATA.id}] Failed to retrieve Expo token: ${msg}`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: `Cannot submit without Expo token: ${msg}`,
      data: { status: 'failed', easBuildId, errorMessage: msg },
      durationMs: Date.now() - start,
    };
  }

  ctx.log(`[${HOOK_METADATA.id}] Submitting ${platform} build ${easBuildId} for project "${projectId}"...`);

  const submitResult = await submitBuild({
    cwd: projectPath,
    platform,
    expoToken,
    track: platform === 'android' ? (androidTrack ?? 'internal') : undefined,
    timeoutMs: LIMITS.submitTimeoutMs,
  });

  // Emit submission.completed regardless of outcome — TestFlight watcher subscribes.
  try {
    await eventBus.publish(
      createAppDevEvent(
        APPDEV_EVENTS.SUBMISSION_COMPLETED,
        {
          projectId,
          platform,
          easBuildId,
          status: submitResult.status,
          submissionId: submitResult.submissionId,
          errorMessage: submitResult.errorMessage,
        },
        tenantId,
        ctx.executionId,
      ),
    );
  } catch (publishErr) {
    // Event bus failures must not mask the submission result.
    ctx.log(`[${HOOK_METADATA.id}] Warning: failed to publish submission event: ${(publishErr as Error).message}`);
  }

  if (submitResult.status === 'submitted') {
    ctx.log(`[${HOOK_METADATA.id}] Submission complete — submissionId=${submitResult.submissionId ?? '(none)'}`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      data: {
        status: 'submitted',
        submissionId: submitResult.submissionId,
        easBuildId,
      },
      durationMs: Date.now() - start,
    };
  }

  // Failure: surface but don't throw.
  ctx.log(`[${HOOK_METADATA.id}] Submission failed: ${submitResult.errorMessage}`);
  return {
    success: false,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    error: submitResult.errorMessage,
    data: {
      status: 'failed',
      errorMessage: submitResult.errorMessage,
      easBuildId,
    },
    durationMs: Date.now() - start,
  };
}
