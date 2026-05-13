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

// ---------------------------------------------------------------------------
// Union type for all event details
// ---------------------------------------------------------------------------

export type AppDevEventDetail =
  | ProjectCreatedDetail
  | ProjectUpdatedDetail
  | HookStartedDetail
  | HookCompletedDetail
  | WorkspaceFileChangedDetail
  | BuildStatusChangedDetail;

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
