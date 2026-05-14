/**
 * Pipeline Hook 06: Build Runner
 *
 * Trigger: Manual API call after Hook 5 (build-preparer) succeeds
 * Action: Submit build to EAS, start background polling for status.
 * Failure mode: NOTIFY
 * Timeout: 60s for submission (polling runs in background for up to 60min)
 * Concurrency: 1 per user
 *
 * The .p8 credential file is written just-in-time via withTempCredentialFile
 * and cleaned up after EAS CLI submission completes (before polling starts).
 * Polling does NOT need the .p8 file — EAS has already uploaded it.
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { getCircuitBreaker } from '../utils/circuit-breaker.js';
import { withTempCredentialFile } from '../utils/temp-credential-file.js';
import { runEasCommand } from '../services/eas-cli-wrapper.js';
import { BuildStatusPoller, type BuildViewFn, type EasBuildInfo } from '../services/build-status-poller.js';
import { ArtifactStorageClient } from '../services/artifact-storage-client.js';
import { createAppDevEvent, APPDEV_EVENTS } from '../events/event-types.js';
import { Workspace } from '../workspace/workspace.js';
import type { EventBusService } from '@seraphim/core';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';
import type { CredentialInfo } from './05-build-preparer.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'build-runner',
  name: 'Build Runner',
  triggerType: 'api_request',
  failureMode: 'notify',
  timeoutMs: LIMITS.buildPrepTimeoutMs,
  maxConcurrent: 1,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface BuildRunnerInput {
  projectId: string;
  platform: 'ios' | 'android';
  credentialManager: CredentialManager;
  credentialInfo?: CredentialInfo;
  eventBus: EventBusService;
  artifactBucketName?: string;
  tenantId?: string;
}

export interface BuildRunnerOutput {
  buildId: string;
  projectId: string;
  platform: 'ios' | 'android';
  status: 'queued' | 'dry_run';
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: BuildRunnerInput,
  ctx: HookContext,
): Promise<HookResult<BuildRunnerOutput>> {
  const start = Date.now();
  const { projectId, platform, credentialManager, credentialInfo, eventBus } = input;
  const tenantId = input.tenantId ?? 'system';

  // Kill switch
  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: ctx.dryRun,
      data: { buildId: 'disabled', projectId, platform, status: 'dry_run' },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  // Dry-run path
  if (dryRun) {
    const dryBuildId = `dry-run-${Date.now()}`;
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would submit ${platform} build for project "${projectId}". Build ID would be: ${dryBuildId}`);
    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: true,
      data: { buildId: dryBuildId, projectId, platform, status: 'dry_run' },
      durationMs: Date.now() - start,
    };
  }

  // Circuit breaker
  const cb = getCircuitBreaker(HOOK_METADATA.id);
  cb.allowRequest();

  // Retrieve EXPO_TOKEN
  let expoToken: string;
  try {
    expoToken = await credentialManager.getCredential('expo', 'access-token');
    if (!expoToken) throw new Error('Expo token is empty');
  } catch (error) {
    cb.recordFailure();
    ctx.log(`[${HOOK_METADATA.id}] Failed to retrieve Expo token`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: 'Failed to retrieve Expo access token',
      data: { buildId: '', projectId, platform, status: 'queued' },
      durationMs: Date.now() - start,
    };
  }

  const workspace = new Workspace();
  const projectPath = workspace.getProjectPath(projectId);

  // Build submission — iOS needs temp .p8 file, Android doesn't
  let buildId: string;
  try {
    if (platform === 'ios' && credentialInfo) {
      // iOS: write .p8 to temp file for the duration of EAS CLI submission
      buildId = await withTempCredentialFile(
        credentialInfo.p8Content,
        async (p8Path) => {
          return await submitBuild(projectPath, platform, expoToken, {
            EXPO_APPLE_APP_STORE_CONNECT_API_KEY_PATH: p8Path,
            EXPO_APPLE_APP_STORE_CONNECT_API_KEY_KEY_ID: credentialInfo.keyId,
            EXPO_APPLE_APP_STORE_CONNECT_API_KEY_ISSUER_ID: credentialInfo.issuerId,
          });
        },
        `AuthKey_${credentialInfo.keyId}.p8`,
      );
    } else {
      // Android: no extra credentials needed
      buildId = await submitBuild(projectPath, platform, expoToken, {});
    }
  } catch (error) {
    cb.recordFailure();
    ctx.log(`[${HOOK_METADATA.id}] EAS build submission failed: ${(error as Error).message}`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: `EAS build submission failed: ${(error as Error).message}`,
      data: { buildId: '', projectId, platform, status: 'queued' },
      durationMs: Date.now() - start,
    };
  }

  cb.recordSuccess();
  ctx.log(`[${HOOK_METADATA.id}] Build submitted — ID: ${buildId}, platform: ${platform}`);

  // Publish queued event
  await eventBus.publish(createAppDevEvent(
    APPDEV_EVENTS.BUILD_STATUS_CHANGED,
    { projectId, buildId, platform, status: 'queued' },
    tenantId,
  )).catch(() => {});

  // Start background polling (fire-and-forget)
  const buildViewFn: BuildViewFn = async (id: string) => {
    const result = await runEasCommand(
      ['build:view', id, '--json'],
      { cwd: projectPath, expoToken, timeoutMs: 30_000 },
    );
    return result.parsedJson as EasBuildInfo;
  };

  const poller = new BuildStatusPoller(buildViewFn, eventBus);
  poller.startPolling(buildId, projectId, platform, { tenantId }).catch((err) => {
    console.error(`[${HOOK_METADATA.id}] Polling error for build ${buildId}:`, (err as Error).message);
  });

  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    data: { buildId, projectId, platform, status: 'queued' },
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function submitBuild(
  cwd: string,
  platform: string,
  expoToken: string,
  extraEnv: Record<string, string>,
): Promise<string> {
  const result = await runEasCommand(
    ['build', '--platform', platform, '--non-interactive', '--json', '--profile', 'production'],
    { cwd, expoToken, env: extraEnv, timeoutMs: 120_000 },
  );

  // EAS CLI --json returns an array of build objects
  const builds = result.parsedJson as Array<{ id: string }> | null;
  if (!builds || !Array.isArray(builds) || builds.length === 0 || !builds[0]?.id) {
    throw new Error('EAS CLI returned unexpected response — no build ID found');
  }

  return builds[0].id;
}
