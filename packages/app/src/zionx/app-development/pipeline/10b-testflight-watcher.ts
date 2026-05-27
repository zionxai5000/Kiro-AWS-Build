/**
 * Pipeline Hook 10b: TestFlight Watcher
 *
 * Trigger: After Hook 9b (submitter) emits appdev.submission.completed.
 * Action: Poll App Store Connect (or Google Play, future) for the build's
 *         processing state. Emit appdev.testflight.processing/ready/invalid
 *         on every transition. Persist a structured log per build that the
 *         dashboard can replay.
 * Failure mode: NOTIFY — never crashes the pipeline.
 * Timeout: 60 minutes (Apple usually finishes within 10).
 * Concurrency: 5 globally — multiple builds may be processing at once.
 *
 * Why this exists:
 *   When TestFlight shows "Something went wrong, we hit an unexpected error",
 *   the failure surface is on Apple's side and never reaches the user
 *   submitting the build. The watcher converts that opaque state into a
 *   structured event stream we can show in the dashboard and reason about.
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { Workspace } from '../workspace/workspace.js';
import { signAscJwt } from '../services/apple-credentials/asc-jwt.js';
import {
  findAscBuildByVersion,
  type AscBuildSummary,
  type AscBuildProcessingState,
} from '../services/apple-credentials/asc-app-client.js';
import { APPDEV_EVENTS, createAppDevEvent } from '../events/event-types.js';
import type { EventBusService } from '@seraphim/core';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'testflight-watcher',
  name: 'TestFlight Watcher',
  triggerType: 'api_request',
  failureMode: 'notify',
  timeoutMs: LIMITS.testflightWatcherTimeoutMs,
  maxConcurrent: 5,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface TestFlightWatcherInput {
  projectId: string;
  platform: 'ios' | 'android';
  easBuildId: string;
  /** Apple ASC App ID (numeric, e.g., "6773520429"). Required for iOS. */
  ascAppId?: string;
  /** App version string from app.json (e.g., "1.0.0"). */
  appVersion: string;
  /** App buildNumber from app.json/eas (e.g., "4"). */
  buildNumber: string;
  credentialManager: CredentialManager;
  eventBus: EventBusService;
  tenantId?: string;
  /** Override the poll interval — used by tests. */
  pollIntervalMs?: number;
  /** Override the total time budget — used by tests. */
  maxWaitMs?: number;
}

export interface TestFlightStateSnapshot {
  observedAt: string;
  processingState: AscBuildProcessingState | 'UNKNOWN';
  betaReviewState: string | null;
  ascBuildId: string | null;
  errorMessage?: string;
}

export interface TestFlightWatcherOutput {
  /** Final state observed before the watcher exited. */
  finalState: AscBuildProcessingState | 'UNKNOWN';
  /** Full transition log — every distinct snapshot we observed. */
  history: TestFlightStateSnapshot[];
  /** Total time we polled, in ms. */
  totalElapsedMs: number;
  /** Whether we ever found the build on Apple's side. */
  buildFoundOnApple: boolean;
  /** Whether platform is unsupported (Android Play tracker is a future stage). */
  skipped: boolean;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: TestFlightWatcherInput,
  ctx: HookContext,
): Promise<HookResult<TestFlightWatcherOutput>> {
  const start = Date.now();
  const {
    projectId,
    platform,
    easBuildId,
    ascAppId,
    appVersion,
    buildNumber,
    credentialManager,
    eventBus,
  } = input;
  const tenantId = input.tenantId ?? 'system';

  // Kill switch
  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping watcher`);
    return emptyResult(start, 'UNKNOWN', false, false);
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);
  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would watch ${platform} build ${easBuildId} for project "${projectId}"`);
    return emptyResult(start, 'UNKNOWN', false, false);
  }

  // Android Play tracker not implemented yet — skip cleanly so it can chain.
  if (platform !== 'ios') {
    ctx.log(`[${HOOK_METADATA.id}] Platform "${platform}" not yet supported — skipping`);
    return emptyResult(start, 'UNKNOWN', false, true);
  }

  if (!ascAppId) {
    ctx.log(`[${HOOK_METADATA.id}] No ascAppId provided — cannot poll Apple. Did Hook 8 run?`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: 'ascAppId missing; cannot poll TestFlight state',
      data: { finalState: 'UNKNOWN', history: [], totalElapsedMs: Date.now() - start, buildFoundOnApple: false, skipped: false },
      durationMs: Date.now() - start,
    };
  }

  // Mint a JWT for the ASC API.
  let jwt: string;
  try {
    const keyId = await credentialManager.getCredential('appstore-connect', 'key-id');
    const issuerId = await credentialManager.getCredential('appstore-connect', 'issuer-id');
    const privateKey = await credentialManager.getCredential('appstore-connect', 'api-key');
    if (!keyId || !issuerId || !privateKey) {
      throw new Error('Incomplete ASC credentials');
    }
    jwt = signAscJwt(keyId, issuerId, privateKey);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.log(`[${HOOK_METADATA.id}] Failed to sign ASC JWT: ${msg}`);
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: msg,
      data: { finalState: 'UNKNOWN', history: [], totalElapsedMs: Date.now() - start, buildFoundOnApple: false, skipped: false },
      durationMs: Date.now() - start,
    };
  }

  const pollIntervalMs = input.pollIntervalMs ?? LIMITS.testflightPollIntervalMs;
  const maxWaitMs = input.maxWaitMs ?? LIMITS.testflightWatcherTimeoutMs;
  const deadline = start + maxWaitMs;

  const history: TestFlightStateSnapshot[] = [];
  let lastSnapshot: TestFlightStateSnapshot | null = null;
  let buildFoundOnApple = false;
  let finalState: AscBuildProcessingState | 'UNKNOWN' = 'UNKNOWN';

  ctx.log(`[${HOOK_METADATA.id}] Watching ${appVersion} (${buildNumber}) for ASC app ${ascAppId} — pollEvery=${pollIntervalMs}ms`);

  try {
    while (Date.now() < deadline) {
      const snapshot = await pollAndPersist({
        jwt,
        ascAppId,
        appVersion,
        buildNumber,
      });

      if (snapshot.ascBuildId) buildFoundOnApple = true;

      // Only emit/log on a distinct transition.
      if (!lastSnapshot || isStateDifferent(lastSnapshot, snapshot)) {
        history.push(snapshot);
        lastSnapshot = snapshot;
        finalState = snapshot.processingState;
        await emitTransition({
          eventBus,
          projectId,
          platform,
          easBuildId,
          ascBuildId: snapshot.ascBuildId,
          appVersion,
          buildNumber,
          processingState: snapshot.processingState,
          betaReviewState: snapshot.betaReviewState,
          errorMessage: snapshot.errorMessage,
          observedAt: snapshot.observedAt,
          tenantId,
          correlationId: ctx.executionId,
          log: ctx.log,
        });
      }

      // Terminal states — stop polling.
      if (snapshot.processingState === 'VALID' ||
          snapshot.processingState === 'INVALID' ||
          snapshot.processingState === 'FAILED') {
        ctx.log(`[${HOOK_METADATA.id}] Terminal state ${snapshot.processingState} — exiting watcher`);
        break;
      }

      // Sleep until next tick.
      const remaining = deadline - Date.now();
      const sleepMs = Math.min(pollIntervalMs, remaining);
      if (sleepMs <= 0) break;
      await sleep(sleepMs);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.log(`[${HOOK_METADATA.id}] Polling error: ${msg}`);
    // Non-fatal — return what we have.
  }

  // Persist the full transition log to the workspace so the dashboard can replay.
  await persistWatchLog({ projectId, easBuildId, history, finalState, log: ctx.log });

  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    data: {
      finalState,
      history,
      totalElapsedMs: Date.now() - start,
      buildFoundOnApple,
      skipped: false,
    },
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function pollAndPersist(args: {
  jwt: string;
  ascAppId: string;
  appVersion: string;
  buildNumber: string;
}): Promise<TestFlightStateSnapshot> {
  try {
    const ascBuild = await findAscBuildByVersion(args.jwt, args.ascAppId, args.appVersion, args.buildNumber);
    return ascBuildToSnapshot(ascBuild);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      observedAt: new Date().toISOString(),
      processingState: 'UNKNOWN',
      betaReviewState: null,
      ascBuildId: null,
      errorMessage: `ASC API error: ${msg}`,
    };
  }
}

function ascBuildToSnapshot(build: AscBuildSummary | null): TestFlightStateSnapshot {
  if (!build) {
    return {
      observedAt: new Date().toISOString(),
      processingState: 'UNKNOWN',
      betaReviewState: null,
      ascBuildId: null,
    };
  }

  const errorMessage =
    build.processingState === 'INVALID' || build.processingState === 'FAILED'
      ? `Apple processing returned ${build.processingState}` +
        (build.betaReviewState ? ` (betaState=${build.betaReviewState})` : '')
      : undefined;

  return {
    observedAt: new Date().toISOString(),
    processingState: build.processingState,
    betaReviewState: build.betaReviewState,
    ascBuildId: build.buildId,
    errorMessage,
  };
}

function isStateDifferent(prev: TestFlightStateSnapshot, next: TestFlightStateSnapshot): boolean {
  return (
    prev.processingState !== next.processingState ||
    prev.betaReviewState !== next.betaReviewState ||
    prev.ascBuildId !== next.ascBuildId ||
    prev.errorMessage !== next.errorMessage
  );
}

async function emitTransition(args: {
  eventBus: EventBusService;
  projectId: string;
  platform: 'ios' | 'android';
  easBuildId: string;
  ascBuildId: string | null;
  appVersion: string;
  buildNumber: string;
  processingState: AscBuildProcessingState | 'UNKNOWN';
  betaReviewState: string | null;
  errorMessage?: string;
  observedAt: string;
  tenantId: string;
  correlationId: string;
  log: (msg: string) => void;
}): Promise<void> {
  const detail = {
    projectId: args.projectId,
    platform: args.platform,
    easBuildId: args.easBuildId,
    ascBuildId: args.ascBuildId,
    appVersion: args.appVersion,
    buildNumber: args.buildNumber,
    processingState: args.processingState,
    betaReviewState: args.betaReviewState,
    errorMessage: args.errorMessage,
    observedAt: args.observedAt,
  };

  const eventType =
    args.processingState === 'VALID'
      ? APPDEV_EVENTS.TESTFLIGHT_READY
      : args.processingState === 'INVALID' || args.processingState === 'FAILED'
        ? APPDEV_EVENTS.TESTFLIGHT_INVALID
        : APPDEV_EVENTS.TESTFLIGHT_PROCESSING;

  try {
    await args.eventBus.publish(createAppDevEvent(eventType, detail, args.tenantId, args.correlationId));
    args.log(`[testflight-watcher] state=${args.processingState} betaReview=${args.betaReviewState ?? '-'} → ${eventType}`);
  } catch (err) {
    args.log(`[testflight-watcher] event publish failed: ${(err as Error).message}`);
  }
}

async function persistWatchLog(args: {
  projectId: string;
  easBuildId: string;
  history: TestFlightStateSnapshot[];
  finalState: AscBuildProcessingState | 'UNKNOWN';
  log: (msg: string) => void;
}): Promise<void> {
  try {
    const workspace = new Workspace();
    const payload = JSON.stringify(
      {
        easBuildId: args.easBuildId,
        finalState: args.finalState,
        recordedAt: new Date().toISOString(),
        history: args.history,
      },
      null,
      2,
    );
    await workspace.writeFile(args.projectId, `submission-logs/${args.easBuildId}.json`, payload);
    args.log(`[testflight-watcher] persisted watch log to submission-logs/${args.easBuildId}.json`);
  } catch (error) {
    args.log(`[testflight-watcher] failed to persist watch log: ${(error as Error).message}`);
  }
}

function emptyResult(
  start: number,
  finalState: AscBuildProcessingState | 'UNKNOWN',
  buildFoundOnApple: boolean,
  skipped: boolean,
): HookResult<TestFlightWatcherOutput> {
  return {
    success: true,
    hookId: HOOK_METADATA.id,
    dryRun: false,
    data: {
      finalState,
      history: [],
      totalElapsedMs: Date.now() - start,
      buildFoundOnApple,
      skipped,
    },
    durationMs: Date.now() - start,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
