/**
 * App Development Event Types — consolidated taxonomy.
 *
 * All events use noun.verb hierarchy:
 *   appdev.{entity}.{action}
 *
 * Subscribers filter by event type. Success/failure is a field on the event,
 * not separate event types — easier to subscribe to one type and branch on
 * the success boolean.
 *
 * Source for all app-dev events: 'seraphim.app-development'
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Event source for all app-development pipeline events. */
export const APPDEV_EVENT_SOURCE = 'seraphim.app-development' as const;

/** All app-dev event type constants. */
export const APPDEV_EVENTS = {
  PROJECT_CREATED: 'appdev.project.created',
  PROJECT_UPDATED: 'appdev.project.updated',
  HOOK_STARTED: 'appdev.hook.started',
  HOOK_COMPLETED: 'appdev.hook.completed',
  WORKSPACE_FILE_CHANGED: 'appdev.workspace.file.changed',
  BUILD_STATUS_CHANGED: 'appdev.build.status.changed',
  SUBMISSION_COMPLETED: 'appdev.submission.completed',
  /** Apple/Google has accepted the upload and is processing it. */
  TESTFLIGHT_PROCESSING: 'appdev.testflight.processing',
  /** Build became installable on TestFlight (or Internal track on Play). */
  TESTFLIGHT_READY: 'appdev.testflight.ready',
  /** Apple/Google rejected the binary or processing failed. */
  TESTFLIGHT_INVALID: 'appdev.testflight.invalid',
} as const;

export type AppDevEventType = typeof APPDEV_EVENTS[keyof typeof APPDEV_EVENTS];

// ---------------------------------------------------------------------------
// Event Detail Shapes
// ---------------------------------------------------------------------------

export interface ProjectCreatedDetail {
  projectId: string;
  name: string;
  platform: 'ios' | 'android' | 'both';
}

export interface ProjectUpdatedDetail {
  projectId: string;
  field: string;
  oldValue?: unknown;
  newValue: unknown;
}

export interface HookStartedDetail {
  projectId: string;
  hookId: string;
  executionId: string;
  dryRun: boolean;
}

export interface HookCompletedDetail {
  projectId: string;
  hookId: string;
  executionId: string;
  success: boolean;
  dryRun: boolean;
  durationMs: number;
  error?: string;
}

export type FileChangeType = 'add' | 'change' | 'unlink';

export interface WorkspaceFileChangedDetail {
  projectId: string;
  filePath: string;
  changeType: FileChangeType;
}

export interface BuildStatusChangedDetail {
  projectId: string;
  buildId: string;
  status: string;
  platform: 'ios' | 'android';
  previousStatus?: string;
}

/**
 * Emitted by the testflight-watcher hook on every observed state transition
 * for an uploaded build (PROCESSING → VALID, PROCESSING → INVALID, etc.).
 */
export interface TestFlightStateDetail {
  projectId: string;
  platform: 'ios' | 'android';
  /** EAS build id (the build object on EAS, not Apple's resource id). */
  easBuildId: string;
  /** ASC build id once Apple has registered the upload (null until then). */
  ascBuildId: string | null;
  /** App-side version (e.g., "1.0.0"). */
  appVersion: string;
  /** App-side buildNumber (e.g., "4"). */
  buildNumber: string;
  /** Apple processingState or Google processing equivalent. */
  processingState: 'PROCESSING' | 'VALID' | 'INVALID' | 'FAILED' | 'UNKNOWN';
  /** TestFlight beta-review state if available. */
  betaReviewState: string | null;
  /** Human-readable reason whenever processingState is INVALID/FAILED. */
  errorMessage?: string;
  /** When the watcher recorded this snapshot. */
  observedAt: string;
}

// ---------------------------------------------------------------------------
// Union type for all event details
// ---------------------------------------------------------------------------

export type AppDevEventDetail =
  | ProjectCreatedDetail
  | ProjectUpdatedDetail
  | HookStartedDetail
  | HookCompletedDetail
  | WorkspaceFileChangedDetail
  | BuildStatusChangedDetail
  | TestFlightStateDetail;

// ---------------------------------------------------------------------------
// Helper: create a SystemEvent for the app-dev pipeline
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import type { SystemEvent } from '@seraphim/core';

/**
 * Create a SystemEvent for the app-development pipeline.
 * Ready to publish via EventBusService.publish().
 */
export function createAppDevEvent(
  type: AppDevEventType,
  detail: Record<string, unknown>,
  tenantId: string,
  correlationId?: string,
): SystemEvent {
  return {
    source: APPDEV_EVENT_SOURCE,
    type,
    detail,
    metadata: {
      tenantId,
      correlationId: correlationId ?? randomUUID(),
      timestamp: new Date(),
    },
  };
}
