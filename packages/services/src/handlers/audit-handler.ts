/**
 * Audit Lambda Event Handler — processes audit events from SQS audit queue.
 *
 * Parses SQS records containing SeraphimEvent payloads, delegates to
 * XOAuditService for writing to DynamoDB with SHA-256 hash chain.
 * Idempotent via event `id` deduplication.
 *
 * Requirements: 6.1, 6.2, 7.1
 */

import type {
  SeraphimEvent,
  AuditEntry,
  GovernanceAuditEntry,
  TransitionAuditEntry,
  XOAuditService,
} from '@seraphim/core';

// ---------------------------------------------------------------------------
// SQS Lambda Types
// ---------------------------------------------------------------------------

export interface SQSRecord {
  messageId: string;
  body: string;
  receiptHandle?: string;
  attributes?: Record<string, string>;
  messageAttributes?: Record<string, unknown>;
  md5OfBody?: string;
  eventSource?: string;
  eventSourceARN?: string;
  awsRegion?: string;
}

export interface SQSEvent {
  Records: SQSRecord[];
}

export interface SQSBatchResponse {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AuditHandlerConfig {
  /** XO Audit service instance for recording audit entries */
  auditService: XOAuditService;
  /** Set of already-processed event IDs for deduplication */
  processedEventIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Create an SQS Lambda handler for audit events.
 *
 * Each SQS record body is expected to be a JSON-serialized SeraphimEvent
 * with audit entry data in the `detail` field.
 *
 * The handler is idempotent: duplicate events (same `id`) are safely skipped.
 * Partial batch failure reporting ensures only failed records are retried.
 */
export function createAuditHandler(config: AuditHandlerConfig) {
  const { auditService } = config;
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

        const auditType = resolveAuditType(seraphimEvent);
        const detail = seraphimEvent.detail;

        // Build the base audit entry from the event detail
        const baseEntry: AuditEntry = {
          tenantId: (detail.tenantId as string) ?? seraphimEvent.tenantId,
          actingAgentId: (detail.actingAgentId as string) ?? '',
          actingAgentName: (detail.actingAgentName as string) ?? '',
          actionType: (detail.actionType as string) ?? seraphimEvent.type,
          target: (detail.target as string) ?? '',
          authorizationChain: (detail.authorizationChain as AuditEntry['authorizationChain']) ?? [],
          executionTokens: (detail.executionTokens as string[]) ?? [],
          outcome: (detail.outcome as AuditEntry['outcome']) ?? 'success',
          details: (detail.details as Record<string, unknown>) ?? {},
        };

        switch (auditType) {
          case 'governance': {
            const govEntry: GovernanceAuditEntry = {
              ...baseEntry,
              governanceType:
                (detail.governanceType as GovernanceAuditEntry['governanceType']) ??
                'authorization',
            };
            await auditService.recordGovernanceDecision(govEntry);
            break;
          }
          case 'transition': {
            const transEntry: TransitionAuditEntry = {
              ...baseEntry,
              stateMachineId: (detail.stateMachineId as string) ?? '',
              instanceId: (detail.instanceId as string) ?? '',
              previousState: (detail.previousState as string) ?? '',
              newState: (detail.newState as string) ?? '',
              gateResults:
                (detail.gateResults as TransitionAuditEntry['gateResults']) ?? [],
            };
            await auditService.recordStateTransition(transEntry);
            break;
          }
          default: {
            await auditService.recordAction(baseEntry);
            break;
          }
        }

        // Mark as processed for deduplication
        processedIds.add(seraphimEvent.id);
      } catch (error) {
        console.error(
          `[audit-handler] Failed to process record ${record.messageId}:`,
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

/**
 * Parse the SQS record body as a SeraphimEvent.
 * Throws if the body is not valid JSON or missing required fields.
 */
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
 * Determine the audit type from the event type or detail.
 */
function resolveAuditType(event: SeraphimEvent): 'action' | 'governance' | 'transition' {
  const detail = event.detail;

  // Check explicit auditType in detail
  if (detail.auditType === 'governance' || detail.governanceType) {
    return 'governance';
  }
  if (detail.auditType === 'transition' || detail.stateMachineId) {
    return 'transition';
  }
  if (detail.auditType === 'action') {
    return 'action';
  }

  // Infer from event type
  if (event.type.includes('governance')) {
    return 'governance';
  }
  if (event.type.includes('transition') || event.type.includes('state-machine')) {
    return 'transition';
  }

  return 'action';
}
