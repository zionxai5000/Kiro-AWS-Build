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
import { APPLE_CREDENTIALS_CONFIG } from '../config/apple-credentials-config.js';
import { getCircuitBreaker } from '../utils/circuit-breaker.js';
import { runEasCommand } from '../services/eas-cli-wrapper.js';
import { BuildStatusPoller, type BuildViewFn, type EasBuildInfo } from '../services/build-status-poller.js';
import { ArtifactStorageClient } from '../services/artifact-storage-client.js';
import { createAppDevEvent, APPDEV_EVENTS } from '../events/event-types.js';
import { Workspace } from '../workspace/workspace.js';
import { bootstrapIosCredentials, BootstrapMaxCertsError } from '../services/apple-credentials/bootstrap-flow.js';
import { run as runSentryProvisioner } from './05c-sentry-provisioner.js';
import { wrapWithWatchdog } from './escalation-bridge.js';
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

  // Ensure EAS project is linked before attempting build
  try {
    await ensureEasProjectLinked({
      projectPath,
      workspace,
      projectId,
      expoToken,
      log: ctx.log,
    });
  } catch (error) {
    cb.recordFailure();
    ctx.log(`[${HOOK_METADATA.id}] EAS project init failed: ${(error as Error).message}`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: `EAS project init failed: ${(error as Error).message}`,
      data: { buildId: '', projectId, platform, status: 'queued' },
      durationMs: Date.now() - start,
    };
  }

  // Provision Sentry — best-effort, never blocks the build itself.
  try {
    let appSlug = projectId;
    try {
      const appJson = JSON.parse(await workspace.readFile(projectId, 'app.json'));
      appSlug = appJson?.expo?.slug ?? projectId;
    } catch {
      /* fall through */
    }
    const sentryResult = await runSentryProvisioner(
      {
        projectId,
        appSlug,
        credentialManager,
        expoToken,
      },
      ctx,
    );
    if (!sentryResult.success) {
      ctx.log(`[${HOOK_METADATA.id}] WARN — Sentry provisioner reported: ${sentryResult.error}`);
    } else if (sentryResult.data) {
      ctx.log(
        `[${HOOK_METADATA.id}] Sentry ready: project=${sentryResult.data.sentryProjectSlug} ` +
          `injected=${sentryResult.data.injectedIntoAppJson} easEnv=${sentryResult.data.easEnvVarSet}`,
      );
    }
  } catch (err) {
    ctx.log(`[${HOOK_METADATA.id}] WARN — Sentry provisioner threw: ${(err as Error).message}`);
  }

  // Ensure iOS credentials are bootstrapped (idempotent — safe on every build)
  if (platform === 'ios') {
    ctx.log(`[${HOOK_METADATA.id}] Ensuring iOS credentials are bootstrapped...`);
    try {
      await ensureIosCredentialsBootstrapped({
        credentialManager,
        workspace,
        projectId,
        expoToken,
        log: ctx.log,
      });
    } catch (error) {
      cb.recordFailure();
      const msg = error instanceof BootstrapMaxCertsError
        ? `iOS credential bootstrap failed: max certificates reached. ${(error as Error).message}`
        : `iOS credential bootstrap failed: ${(error as Error).message}`;
      ctx.log(`[${HOOK_METADATA.id}] ${msg}`);
      return {
        success: false,
        hookId: HOOK_METADATA.id,
        dryRun: false,
        error: msg,
        data: { buildId: '', projectId, platform, status: 'queued' },
        durationMs: Date.now() - start,
      };
    }
  }

  // Build submission — after bootstrap, both platforms use the same path
  let buildId: string;
  try {
    buildId = await submitBuild(projectPath, platform, expoToken, {});
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
    { cwd, expoToken, env: extraEnv, timeoutMs: LIMITS.buildSubmissionTimeoutMs },
  );

  // EAS CLI --json returns an array of build objects
  const builds = result.parsedJson as Array<{ id: string }> | null;
  if (!builds || !Array.isArray(builds) || builds.length === 0 || !builds[0]?.id) {
    throw new Error('EAS CLI returned unexpected response — no build ID found');
  }

  return builds[0].id;
}

// ---------------------------------------------------------------------------
// iOS Credential Bootstrap
// ---------------------------------------------------------------------------

/**
 * Ensure iOS credentials (cert, profile, bundle ID) are registered at EAS.
 * Idempotent — safe to call on every iOS build (~1.5-2s overhead when creds exist).
 */
async function ensureIosCredentialsBootstrapped(args: {
  credentialManager: CredentialManager;
  workspace: Workspace;
  projectId: string;
  expoToken: string;
  log: (msg: string) => void;
}): Promise<void> {
  const { credentialManager, workspace, projectId, expoToken, log } = args;

  const appJsonContent = await workspace.readFile(projectId, 'app.json');
  const appJson = JSON.parse(appJsonContent);
  const bundleIdentifier = appJson?.expo?.ios?.bundleIdentifier;
  if (!bundleIdentifier) {
    throw new Error('app.json missing expo.ios.bundleIdentifier — cannot bootstrap iOS credentials');
  }

  const projectOwner = appJson?.expo?.owner ?? APPLE_CREDENTIALS_CONFIG.expoAccountName;
  const slug = appJson?.expo?.slug ?? 'app';

  const ascKeyId = await credentialManager.getCredential('appstore-connect', 'key-id');
  const ascIssuerId = await credentialManager.getCredential('appstore-connect', 'issuer-id');
  const ascKeyPem = await credentialManager.getCredential('appstore-connect', 'api-key');

  if (!ascKeyId || !ascIssuerId || !ascKeyPem) {
    throw new Error('App Store Connect credentials not available via CredentialManager');
  }

  await bootstrapIosCredentials({
    ascKeyId,
    ascIssuerId,
    ascKeyPem,
    appleTeamId: APPLE_CREDENTIALS_CONFIG.teamId,
    appleTeamType: APPLE_CREDENTIALS_CONFIG.teamType,
    expoToken,
    easAccountName: APPLE_CREDENTIALS_CONFIG.expoAccountName,
    bundleIdentifier,
    projectFullName: `@${projectOwner}/${slug}`,
    dryRun: false,
  }, log);
}

// ---------------------------------------------------------------------------
// EAS Project Linkage
// ---------------------------------------------------------------------------

/**
 * Ensure the workspace project is linked to an EAS project.
 * Reads app.json to check for existing projectId. If missing, runs `eas project:init`.
 *
 * @returns The EAS project ID (existing or newly created)
 * @throws If app.json is missing, malformed, or init fails
 */
export async function ensureEasProjectLinked(args: {
  projectPath: string;
  workspace: Workspace;
  projectId: string;
  expoToken: string;
  log: (msg: string) => void;
}): Promise<string> {
  const { projectPath, workspace, projectId, expoToken, log } = args;
  const hookId = HOOK_METADATA.id;

  // Read app.json
  let appJsonContent: string;
  try {
    appJsonContent = await workspace.readFile(projectId, 'app.json');
  } catch (error) {
    throw new Error(
      `workspace missing app.json — regenerate or check workspace integrity: ${(error as Error).message}`,
    );
  }

  // Parse app.json
  let appJson: Record<string, unknown>;
  try {
    appJson = JSON.parse(appJsonContent);
  } catch (error) {
    throw new Error(
      `workspace app.json is malformed: ${(error as Error).message}`,
    );
  }

  // Check if already linked
  const expo = appJson.expo as Record<string, unknown> | undefined;
  const extra = expo?.extra as Record<string, unknown> | undefined;
  const eas = extra?.eas as Record<string, unknown> | undefined;
  const existingProjectId = eas?.projectId as string | undefined;

  if (existingProjectId) {
    log(`[${hookId}] Project already linked: ${existingProjectId}`);
    return existingProjectId;
  }

  // Run eas project:init
  log(`[${hookId}] No EAS project ID found — running eas project:init`);
  try {
    await runEasCommand(
      ['project:init', '--non-interactive'],
      { cwd: projectPath, expoToken, timeoutMs: 30_000 },
    );
  } catch (error) {
    throw new Error(
      `eas project:init failed: ${(error as Error).message}`,
    );
  }

  // Verify app.json was updated with the new project ID
  let updatedContent: string;
  try {
    updatedContent = await workspace.readFile(projectId, 'app.json');
  } catch (error) {
    throw new Error(
      `Failed to re-read app.json after eas project:init: ${(error as Error).message}`,
    );
  }

  const updatedJson = JSON.parse(updatedContent);
  const newProjectId = updatedJson?.expo?.extra?.eas?.projectId as string | undefined;

  if (!newProjectId) {
    throw new Error(
      'eas project:init reported success but app.json still has no projectId — possible eas-cli bug',
    );
  }

  log(`[${hookId}] Project linked: ${newProjectId}`);
  return newProjectId;
}
