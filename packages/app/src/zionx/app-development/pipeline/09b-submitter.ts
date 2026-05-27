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
import { signAscJwt } from '../services/apple-credentials/asc-jwt.js';
import {
  findAscBuildByVersion,
  setBetaWhatsNew,
} from '../services/apple-credentials/asc-app-client.js';
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

    // Best-effort: set "What to Test" copy on the freshly uploaded iOS build.
    // Without this, the TestFlight client app sometimes surfaces "Something
    // went wrong" before Apple's caches catch up. Failure is non-fatal — we
    // log and keep going.
    if (platform === 'ios') {
      try {
        await maybeSetWhatsNew({ projectId, workspace, credentialManager, log: ctx.log });
      } catch (err) {
        ctx.log(`[${HOOK_METADATA.id}] Could not set whatsNew (non-fatal): ${(err as Error).message}`);
      }
    }

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


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort: read app.json and eas.json from the workspace, find the build
 * Apple just received via its (appVersion, buildNumber), and POST a
 * "What to Test" localization. Apple often takes 30-90 seconds to register an
 * uploaded build, so this may have to retry once or twice — but we don't want
 * to block the pipeline on it, so total wait is capped at ~2 minutes.
 */
async function maybeSetWhatsNew(args: {
  projectId: string;
  workspace: Workspace;
  credentialManager: CredentialManager;
  log: (msg: string) => void;
}): Promise<void> {
  const { projectId, workspace, credentialManager, log } = args;

  // Read workspace files.
  let appVersion = '1.0.0';
  let buildNumber: string | undefined;
  let appName = 'this build';
  try {
    const appJson = JSON.parse(await workspace.readFile(projectId, 'app.json'));
    appVersion = appJson?.expo?.version ?? appVersion;
    buildNumber = appJson?.expo?.ios?.buildNumber;
    appName = appJson?.expo?.name ?? appName;
  } catch {
    return; // no app.json, no point
  }

  let ascAppId: string | undefined;
  try {
    const easJson = JSON.parse(await workspace.readFile(projectId, 'eas.json'));
    ascAppId = easJson?.submit?.production?.ios?.ascAppId;
  } catch {
    return;
  }
  if (!ascAppId) return;

  // ASC credentials.
  const keyId = await credentialManager.getCredential('appstore-connect', 'key-id');
  const issuerId = await credentialManager.getCredential('appstore-connect', 'issuer-id');
  const apiKey = await credentialManager.getCredential('appstore-connect', 'api-key');
  if (!keyId || !issuerId || !apiKey) return;

  const jwt = signAscJwt(keyId, issuerId, apiKey);

  // Apple's appVersionSource: 'remote' means EAS may auto-increment buildNumber
  // beyond what's in app.json. Try the local buildNumber first; if it's not
  // visible yet, fall back to the latest build for this appVersion.
  const whatsNew = `Build of ${appName}.`;

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const targetBuildNumber = buildNumber ?? '1';
    const found = await findAscBuildByVersion(jwt, ascAppId, appVersion, targetBuildNumber).catch(() => null);
    if (found) {
      await setBetaWhatsNew(jwt, found.buildId, whatsNew);
      log(`[submitter] set whatsNew on ASC build ${found.buildId}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }

  log('[submitter] timed out waiting for ASC build to appear; whatsNew skipped');
}
