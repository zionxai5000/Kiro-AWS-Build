/**
 * Pipeline Hook 10: Crash Watcher
 *
 * Trigger: Sentry webhook (POST /app-dev/webhooks/sentry).
 * Action: Parse the Sentry event payload, identify the affected project, and
 *   publish an APPDEV_EVENTS.CRASH_OBSERVED event so the dashboard logs
 *   panel + escalation bridge can react.
 *
 * Failure mode: SILENT (a crash event we can't process must NEVER take the
 * pipeline down).
 * Timeout: 30s
 * Concurrency: 5 globally
 *
 * CRITICAL: Does NOT auto-apply fixes. The escalation bridge handles that
 * downstream when it sees CRASH_OBSERVED with a critical severity.
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { createAppDevEvent, APPDEV_EVENTS } from '../events/event-types.js';
import type { EventBusService } from '@seraphim/core';
import type { HookContext, HookMetadata, HookResult } from './types.js';

export const HOOK_METADATA: HookMetadata = {
  id: 'crash-watcher',
  name: 'Crash Watcher',
  triggerType: 'webhook',
  failureMode: 'silent',
  timeoutMs: 30_000,
  maxConcurrent: 5,
} as const;

// ---------------------------------------------------------------------------
// Sentry webhook payload (subset we care about)
// ---------------------------------------------------------------------------

export interface SentryWebhookEvent {
  /** Sentry's outer envelope shape varies by hook type. We accept the most common. */
  action?: string;
  data?: {
    issue?: {
      id?: string;
      shortId?: string;
      title?: string;
      culprit?: string;
      project?: { slug?: string; name?: string };
      metadata?: Record<string, unknown>;
      permalink?: string;
    };
    event?: {
      event_id?: string;
      message?: string;
      platform?: string;
      release?: string;
      tags?: Array<[string, string]>;
      contexts?: {
        os?: { name?: string };
        app?: { app_version?: string; app_build?: string };
      };
    };
  };
  /** Older Sentry hooks send the event directly. */
  event?: {
    event_id?: string;
    message?: string;
    platform?: string;
    project_slug?: string;
  };
}

export interface CrashWatcherInput {
  /** Project that owns the affected app. May be derived from the Sentry project slug. */
  projectId: string;
  payload: SentryWebhookEvent;
  eventBus: EventBusService;
  tenantId: string;
  /** Sentry org slug — comes from secrets manager. Default 'zionxai'. */
  sentryOrg?: string;
}

export interface CrashWatcherOutput {
  observed: boolean;
  sentryEventId: string | null;
  errorMessage: string | null;
  platform: 'ios' | 'android' | 'unknown';
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: CrashWatcherInput,
  ctx: HookContext,
): Promise<HookResult<CrashWatcherOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: ctx.dryRun,
      data: { observed: false, sentryEventId: null, errorMessage: null, platform: 'unknown' },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);

  const issue = input.payload?.data?.issue;
  const event = input.payload?.data?.event ?? input.payload?.event;
  const sentryEventId =
    (event && 'event_id' in event ? event.event_id : undefined) ??
    issue?.id ??
    null;
  const errorMessage =
    (event && 'message' in event ? event.message : undefined) ??
    issue?.title ??
    'Unknown crash';
  const platformRaw =
    (event && 'platform' in event ? event.platform : undefined) ??
    (issue?.metadata?.['platform'] as string | undefined) ??
    '';
  const platform: 'ios' | 'android' | 'unknown' =
    typeof platformRaw === 'string' && /ios|cocoa/i.test(platformRaw)
      ? 'ios'
      : typeof platformRaw === 'string' && /android/i.test(platformRaw)
        ? 'android'
        : 'unknown';

  const sentryOrg = input.sentryOrg ?? 'zionxai';
  const sentryProject =
    issue?.project?.slug ??
    (input.payload?.event && 'project_slug' in input.payload.event
      ? input.payload.event.project_slug
      : undefined) ??
    'unknown';

  if (dryRun) {
    ctx.log(
      `[${HOOK_METADATA.id}] DRY RUN — would publish CRASH_OBSERVED for ` +
        `${input.projectId}/${sentryEventId} (${errorMessage})`,
    );
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: true,
      data: { observed: false, sentryEventId, errorMessage, platform },
      durationMs: Date.now() - start,
    };
  }

  // Find tags helpful for the dashboard
  let appVersion: string | undefined;
  let buildNumber: string | undefined;
  const richEvent = input.payload?.data?.event;
  if (richEvent?.tags) {
    for (const [k, v] of richEvent.tags) {
      if (k === 'app.version') appVersion = v;
      if (k === 'app.build') buildNumber = v;
    }
  }
  appVersion ??= richEvent?.contexts?.app?.app_version;
  buildNumber ??= richEvent?.contexts?.app?.app_build;

  await input.eventBus
    .publish(
      createAppDevEvent(
        APPDEV_EVENTS.CRASH_OBSERVED,
        {
          projectId: input.projectId,
          sentryOrg,
          sentryProject,
          sentryEventId: sentryEventId ?? 'unknown',
          sentryIssueId: issue?.id,
          errorMessage,
          platform,
          appVersion,
          buildNumber,
          sentryUrl: issue?.permalink,
          observedAt: new Date().toISOString(),
        },
        input.tenantId,
      ),
    )
    .catch(() => {
      /* event-bus is best-effort; the webhook still returns 200 */
    });

  ctx.log(
    `[${HOOK_METADATA.id}] crash observed: project=${input.projectId} ` +
      `sentry=${sentryOrg}/${sentryProject} event=${sentryEventId} ` +
      `platform=${platform} message="${errorMessage}"`,
  );

  return {
    success: true, hookId: HOOK_METADATA.id, dryRun: false,
    data: { observed: true, sentryEventId, errorMessage, platform },
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify a Sentry webhook signature against the configured secret.
 * Sentry sends `Sentry-Hook-Signature: sha256=<hex>` and the HMAC is computed
 * over the raw request body.
 *
 * @returns true when the signature matches, false otherwise.
 */
export function verifySentrySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const provided = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;
  const computed = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  if (provided.length !== computed.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(computed, 'hex'));
  } catch {
    return false;
  }
}
