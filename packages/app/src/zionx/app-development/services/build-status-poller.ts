/**
 * Build Status Poller — polls EAS Build status with adaptive backoff.
 *
 * Polling strategy:
 * - Initial wait: 30s after submission
 * - Subsequent polls: every 60s
 * - After 10 minutes elapsed: poll every 120s
 * - Hard timeout: 60 minutes (configurable)
 * - Progress log: every 5 minutes of waiting
 *
 * Publishes events on state transitions:
 * - appdev.build.started (first poll showing "in-progress")
 * - appdev.build.completed (status "finished", artifact available)
 * - appdev.build.failed (status "errored"/"canceled" or timeout)
 *
 * Individual poll errors (EAS API hiccups) are logged and retried on next interval.
 * Polling stops on terminal state OR timeout.
 */

import type { EventBusService } from '@seraphim/core';
import { createAppDevEvent, APPDEV_EVENTS } from '../events/event-types.js';
import type { EasCliResult } from './eas-cli-wrapper.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BuildStatus = 'new' | 'in-queue' | 'in-progress' | 'finished' | 'errored' | 'canceled';

export interface EasBuildInfo {
  id: string;
  status: BuildStatus;
  platform: string;
  artifacts?: { buildUrl?: string };
  error?: { message?: string; errorCode?: string };
}

export interface PollOptions {
  maxDurationMs?: number;
  progressLogIntervalMs?: number;
  tenantId?: string;
}

export interface PollResult {
  finalStatus: BuildStatus;
  buildInfo: EasBuildInfo;
  artifactUrl?: string;
  durationMs: number;
}

/** Function that queries EAS for build status (injected for testability) */
export type BuildViewFn = (buildId: string) => Promise<EasBuildInfo>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_DELAY_MS = 30_000;
const STANDARD_INTERVAL_MS = 60_000;
const EXTENDED_INTERVAL_MS = 120_000;
const EXTEND_AFTER_MS = 10 * 60_000; // Switch to extended interval after 10min
const DEFAULT_MAX_DURATION_MS = 60 * 60_000; // 60 minutes
const DEFAULT_PROGRESS_LOG_MS = 5 * 60_000; // Log every 5 minutes

const TERMINAL_STATUSES: BuildStatus[] = ['finished', 'errored', 'canceled'];

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class BuildStatusPoller {
  private readonly buildViewFn: BuildViewFn;
  private readonly eventBus: EventBusService;

  constructor(buildViewFn: BuildViewFn, eventBus: EventBusService) {
    this.buildViewFn = buildViewFn;
    this.eventBus = eventBus;
  }

  /**
   * Start polling a build until terminal state or timeout.
   *
   * @returns PollResult with final status and artifact info
   */
  async startPolling(
    buildId: string,
    projectId: string,
    platform: string,
    options: PollOptions = {},
  ): Promise<PollResult> {
    const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    const progressLogIntervalMs = options.progressLogIntervalMs ?? DEFAULT_PROGRESS_LOG_MS;
    const tenantId = options.tenantId ?? 'system';

    const startTime = Date.now();
    let lastStatus: BuildStatus = 'new';
    let lastProgressLog = startTime;
    let buildInfo: EasBuildInfo = { id: buildId, status: 'new', platform };

    // Initial wait before first poll
    await this.sleep(INITIAL_DELAY_MS);

    while (true) {
      const elapsed = Date.now() - startTime;

      // Hard timeout check
      if (elapsed >= maxDurationMs) {
        await this.publishEvent(APPDEV_EVENTS.BUILD_STATUS_CHANGED, {
          projectId, buildId, platform, status: 'failed',
          previousStatus: lastStatus, error: 'timeout',
          message: `Build polling timed out after ${Math.round(elapsed / 60000)} minutes`,
        }, tenantId);

        return {
          finalStatus: lastStatus,
          buildInfo,
          durationMs: elapsed,
        };
      }

      // Progress log
      if (elapsed - (lastProgressLog - startTime) >= progressLogIntervalMs) {
        console.log(`[BuildStatusPoller] Build ${buildId} still in progress after ${Math.round(elapsed / 60000)} minutes`);
        lastProgressLog = Date.now();
      }

      // Poll EAS
      try {
        buildInfo = await this.buildViewFn(buildId);

        // State transition detection
        if (buildInfo.status !== lastStatus) {
          await this.handleStateTransition(lastStatus, buildInfo, projectId, platform, tenantId);
          lastStatus = buildInfo.status;
        }

        // Terminal state — stop polling
        if (TERMINAL_STATUSES.includes(buildInfo.status)) {
          return {
            finalStatus: buildInfo.status,
            buildInfo,
            artifactUrl: buildInfo.artifacts?.buildUrl,
            durationMs: Date.now() - startTime,
          };
        }
      } catch (error) {
        // Individual poll error — log and continue (transient EAS API failure)
        console.warn(`[BuildStatusPoller] Poll error for ${buildId}: ${(error as Error).message}. Will retry.`);
      }

      // Adaptive backoff
      const interval = elapsed >= EXTEND_AFTER_MS ? EXTENDED_INTERVAL_MS : STANDARD_INTERVAL_MS;
      await this.sleep(interval);
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async handleStateTransition(
    previousStatus: BuildStatus,
    buildInfo: EasBuildInfo,
    projectId: string,
    platform: string,
    tenantId: string,
  ): Promise<void> {
    const { status, id: buildId } = buildInfo;

    if (status === 'in-progress' && previousStatus !== 'in-progress') {
      await this.publishEvent(APPDEV_EVENTS.BUILD_STATUS_CHANGED, {
        projectId, buildId, platform, status: 'started', previousStatus,
      }, tenantId);
    } else if (status === 'finished') {
      await this.publishEvent(APPDEV_EVENTS.BUILD_STATUS_CHANGED, {
        projectId, buildId, platform, status: 'completed', previousStatus,
        artifactUrl: buildInfo.artifacts?.buildUrl,
      }, tenantId);
    } else if (status === 'errored' || status === 'canceled') {
      await this.publishEvent(APPDEV_EVENTS.BUILD_STATUS_CHANGED, {
        projectId, buildId, platform, status: 'failed', previousStatus,
        error: buildInfo.error?.message ?? status,
        errorCode: buildInfo.error?.errorCode,
      }, tenantId);
    }
  }

  private async publishEvent(
    type: string,
    detail: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    try {
      await this.eventBus.publish(createAppDevEvent(type as any, detail, tenantId));
    } catch {
      // Event publishing failure is non-fatal for the poller
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
