/**
 * Workflow Lambda Event Handler — processes workflow events from SQS workflow queue.
 *
 * Parses SQS records containing SeraphimEvent payloads, triggers state machine
 * transitions using the StateMachineEngine.
 *
 * Requirements: 6.1, 6.2, 6.3
 */

import type {
  SeraphimEvent,
  StateMachineEngine,
  TransitionContext,
} from '@seraphim/core';

import type { SQSEvent, SQSRecord, SQSBatchResponse } from './audit-handler.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WorkflowHandlerConfig {
  /** State machine engine for executing transitions */
  stateMachineEngine: StateMachineEngine;
  /** Set of already-processed event IDs for deduplication */
  processedEventIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Create an SQS Lambda handler for workflow events.
 *
 * Each SQS record body is expected to be a JSON-serialized SeraphimEvent
 * with workflow transition data in the `detail` field:
 * - `instanceId`: the state machine instance to transition
 * - `event`: the transition event name
 * - `triggeredBy`: the agent or system component triggering the transition
 * - `tenantId`: the tenant context
 * - `data`: optional additional data for the transition context
 *
 * The handler is idempotent: duplicate events (same `id`) are safely skipped.
 * Partial batch failure reporting ensures only failed records are retried.
 */
export function createWorkflowHandler(config: WorkflowHandlerConfig) {
  const { stateMachineEngine } = config;
  const processedIds = config.processedEventIds ?? new Set<string>();

  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: Array<{ itemIdentifier: string }> = [];

    for (const record of event.Records) {
      try {
        const seraphimEvent = parseEventBody(record.body);

        // Idempotency check — skip already-processed events
        if (processedIds.has(seraphimEvent.id)) {
          continue;
        }

        const detail = seraphimEvent.detail;

        const instanceId = detail.instanceId as string;
        const transitionEvent = (detail.event as string) ?? (detail.transitionEvent as string);

        if (!instanceId || !transitionEvent) {
          throw new Error(
            `Workflow event missing required fields: instanceId=${instanceId ?? 'undefined'}, event=${transitionEvent ?? 'undefined'}`,
          );
        }

        const context: TransitionContext = {
          triggeredBy:
            (detail.triggeredBy as string) ?? seraphimEvent.source ?? 'system',
          tenantId: (detail.tenantId as string) ?? seraphimEvent.tenantId,
          data: (detail.data as Record<string, unknown>) ?? undefined,
        };

        const result = await stateMachineEngine.transition(
          instanceId,
          transitionEvent,
          context,
        );

        if (result.success) {
          console.log(
            `[workflow-handler] Transition succeeded: instance=${instanceId} ${result.previousState} → ${result.newState} (event=${transitionEvent})`,
          );
        } else {
          console.warn(
            `[workflow-handler] Transition rejected: instance=${instanceId} event=${transitionEvent} reason=${result.rejectionReason ?? 'unknown'}`,
          );
        }

        // Mark as processed for deduplication
        processedIds.add(seraphimEvent.id);
      } catch (error) {
        console.error(
          `[workflow-handler] Failed to process record ${record.messageId}:`,
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
