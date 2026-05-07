/**
 * Baseline Updated Lambda Event Handler — processes baseline.updated events from SQS.
 *
 * Parses SQS records containing SeraphimEvent payloads for baseline updates,
 * notifies the Training Cascade to update quality standards and triggers
 * Quality Gate baseline reload.
 *
 * Requirements: 34j.57, 34j.58
 */

import type { SeraphimEvent } from '@seraphim/core';

import type { SQSEvent, SQSBatchResponse } from './audit-handler.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BaselineUpdatedEvent {
  /** The domain category affected (e.g., 'fitness-apps', 'tech-reviews') */
  domainCategory: string;
  /** Baseline version identifier */
  baselineVersion: string;
  /** Dimensions that changed in this update */
  changedDimensions: string[];
  /** Tenant that owns this baseline */
  tenantId: string;
  /** Timestamp of the baseline update */
  updatedAt: string;
}

export interface TrainingCascadeNotification {
  type: 'baseline.standards.update';
  domainCategory: string;
  baselineVersion: string;
  changedDimensions: string[];
  tenantId: string;
  timestamp: string;
}

export interface QualityGateReloadNotification {
  type: 'baseline.reload';
  domainCategory: string;
  baselineVersion: string;
  tenantId: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface BaselineUpdatedHandlerConfig {
  /** Callback to notify Training Cascade of updated quality standards */
  notifyTrainingCascade?: (notification: TrainingCascadeNotification) => Promise<void>;
  /** Callback to notify Quality Gate to reload baseline */
  notifyQualityGate?: (notification: QualityGateReloadNotification) => Promise<void>;
  /** Optional EventBridge publish function for follow-up events */
  publishEvent?: (event: SeraphimEvent) => Promise<void>;
  /** Set of already-processed event IDs for deduplication */
  processedEventIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Create an SQS Lambda handler for baseline.updated events.
 *
 * Each SQS record body is expected to be a JSON-serialized SeraphimEvent
 * with baseline update data in the `detail` field:
 * - `domainCategory`: the affected domain category
 * - `baselineVersion`: the new baseline version
 * - `changedDimensions`: array of dimension names that changed
 *
 * The handler:
 * 1. Parses the baseline.updated event
 * 2. Notifies the Quality Gate to reload the applicable baseline
 * 3. Notifies the Training Cascade to update quality standards
 * 4. Optionally publishes follow-up events
 *
 * The handler is idempotent: duplicate events (same `id`) are safely skipped.
 * Partial batch failure reporting ensures only failed records are retried.
 */
export function createBaselineUpdatedHandler(config: BaselineUpdatedHandlerConfig = {}) {
  const processedIds = config.processedEventIds ?? new Set<string>();
  const notifyTrainingCascade = config.notifyTrainingCascade ?? defaultTrainingCascadeNotification;
  const notifyQualityGate = config.notifyQualityGate ?? defaultQualityGateNotification;

  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: Array<{ itemIdentifier: string }> = [];

    for (const record of event.Records) {
      try {
        const seraphimEvent = parseEventBody(record.body);

        // Idempotency check — skip already-processed events
        if (processedIds.has(seraphimEvent.id)) {
          continue;
        }

        const baselineEvent = extractBaselineEvent(seraphimEvent);

        // Notify Quality Gate to reload baseline (Req 34j.57)
        const qualityGateNotification: QualityGateReloadNotification = {
          type: 'baseline.reload',
          domainCategory: baselineEvent.domainCategory,
          baselineVersion: baselineEvent.baselineVersion,
          tenantId: baselineEvent.tenantId,
          timestamp: baselineEvent.updatedAt,
        };
        await notifyQualityGate(qualityGateNotification);

        // Notify Training Cascade to update quality standards (Req 34j.58)
        const cascadeNotification: TrainingCascadeNotification = {
          type: 'baseline.standards.update',
          domainCategory: baselineEvent.domainCategory,
          baselineVersion: baselineEvent.baselineVersion,
          changedDimensions: baselineEvent.changedDimensions,
          tenantId: baselineEvent.tenantId,
          timestamp: baselineEvent.updatedAt,
        };
        await notifyTrainingCascade(cascadeNotification);

        console.log(
          `[baseline-updated-handler] Processed baseline update: domain=${baselineEvent.domainCategory} version=${baselineEvent.baselineVersion} changedDimensions=[${baselineEvent.changedDimensions.join(', ')}]`,
        );

        // Publish follow-up event if configured
        if (config.publishEvent) {
          await config.publishEvent(seraphimEvent);
        }

        // Mark as processed for deduplication
        processedIds.add(seraphimEvent.id);
      } catch (error) {
        console.error(
          `[baseline-updated-handler] Failed to process record ${record.messageId}:`,
          error instanceof Error ? error.message : error,
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseEventBody(body: string): SeraphimEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('Invalid JSON in SQS record body');
  }

  const event = parsed as SeraphimEvent;
  if (!event.id || !event.type || !event.detail) {
    throw new Error('SQS record body missing required SeraphimEvent fields (id, type, detail)');
  }

  return event;
}

/**
 * Extract and validate baseline update data from a SeraphimEvent.
 */
function extractBaselineEvent(event: SeraphimEvent): BaselineUpdatedEvent {
  const detail = event.detail;

  const domainCategory = detail.domainCategory as string | undefined;
  const baselineVersion = detail.baselineVersion as string | undefined;
  const changedDimensions = detail.changedDimensions as string[] | undefined;

  if (!domainCategory) {
    throw new Error('baseline.updated event missing required field: domainCategory');
  }

  if (!baselineVersion) {
    throw new Error('baseline.updated event missing required field: baselineVersion');
  }

  return {
    domainCategory,
    baselineVersion,
    changedDimensions: changedDimensions ?? [],
    tenantId: (detail.tenantId as string) ?? event.tenantId,
    updatedAt: (detail.updatedAt as string) ?? event.time,
  };
}

/**
 * Default Training Cascade notification — logs the update.
 * In production, this calls the Training Cascade service to update quality standards.
 */
async function defaultTrainingCascadeNotification(notification: TrainingCascadeNotification): Promise<void> {
  console.log(
    `[baseline-updated-handler] Training Cascade notified: domain=${notification.domainCategory} ` +
    `version=${notification.baselineVersion} dimensions=[${notification.changedDimensions.join(', ')}]`,
  );
}

/**
 * Default Quality Gate reload notification — logs the reload request.
 * In production, this triggers the Quality Gate to reload the applicable baseline.
 */
async function defaultQualityGateNotification(notification: QualityGateReloadNotification): Promise<void> {
  console.log(
    `[baseline-updated-handler] Quality Gate reload triggered: domain=${notification.domainCategory} ` +
    `version=${notification.baselineVersion}`,
  );
}

// ---------------------------------------------------------------------------
// Lambda Entry Point
// ---------------------------------------------------------------------------

/**
 * Default Lambda handler entry point for the baseline.updated event processor.
 * Used by the CDK-provisioned Lambda function (handler: 'handlers/baseline-updated-handler.handler').
 */
export const handler = createBaselineUpdatedHandler();
