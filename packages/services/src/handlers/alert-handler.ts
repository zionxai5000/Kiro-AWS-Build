/**
 * Alert Lambda Event Handler — processes alert events from SQS alert queue.
 *
 * Parses SQS records containing SeraphimEvent payloads, formats notifications
 * based on alert severity and type, and delivers through configured channels.
 * Initially logs alerts; Shaar integration comes in Phase 4.
 *
 * Requirements: 6.1, 6.2, 6.3
 */

import type { SeraphimEvent } from '@seraphim/core';

import type { SQSEvent, SQSRecord, SQSBatchResponse } from './audit-handler.js';

// ---------------------------------------------------------------------------
// Alert Types
// ---------------------------------------------------------------------------

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface FormattedAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  source: string;
  tenantId: string;
  timestamp: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AlertHandlerConfig {
  /** Optional custom alert delivery function (defaults to console logging) */
  deliverAlert?: (alert: FormattedAlert) => Promise<void>;
  /** Set of already-processed event IDs for deduplication */
  processedEventIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Create an SQS Lambda handler for alert events.
 *
 * Each SQS record body is expected to be a JSON-serialized SeraphimEvent
 * with alert data in the `detail` field.
 *
 * The handler is idempotent: duplicate events (same `id`) are safely skipped.
 * Partial batch failure reporting ensures only failed records are retried.
 */
export function createAlertHandler(config: AlertHandlerConfig = {}) {
  const processedIds = config.processedEventIds ?? new Set<string>();
  const deliverAlert = config.deliverAlert ?? defaultAlertDelivery;

  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: Array<{ itemIdentifier: string }> = [];

    for (const record of event.Records) {
      try {
        const seraphimEvent = parseEventBody(record.body);

        // Idempotency check — skip already-processed events
        if (processedIds.has(seraphimEvent.id)) {
          continue;
        }

        const alert = formatAlert(seraphimEvent);
        await deliverAlert(alert);

        // Mark as processed for deduplication
        processedIds.add(seraphimEvent.id);
      } catch (error) {
        console.error(
          `[alert-handler] Failed to process record ${record.messageId}:`,
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
 * Format a SeraphimEvent into a structured alert notification.
 */
function formatAlert(event: SeraphimEvent): FormattedAlert {
  const detail = event.detail;
  const severity = resolveSeverity(detail);

  const title =
    (detail.title as string) ??
    (detail.alertTitle as string) ??
    `[${severity.toUpperCase()}] ${event.type}`;

  const message =
    (detail.message as string) ??
    (detail.alertMessage as string) ??
    (detail.description as string) ??
    `Alert from ${event.source}: ${event.type}`;

  return {
    id: event.id,
    severity,
    title,
    message,
    source: event.source,
    tenantId: event.tenantId,
    timestamp: event.time,
    details: detail,
  };
}

/**
 * Resolve alert severity from event detail.
 */
function resolveSeverity(detail: Record<string, unknown>): AlertSeverity {
  const raw = detail.severity ?? detail.alertSeverity ?? detail.level;
  if (typeof raw === 'string') {
    const normalized = raw.toLowerCase();
    if (['critical', 'high', 'medium', 'low', 'info'].includes(normalized)) {
      return normalized as AlertSeverity;
    }
  }
  return 'info';
}

/**
 * Default alert delivery — logs to console.
 * In Phase 4, this will be replaced with Shaar integration for
 * multi-channel notification delivery.
 */
async function defaultAlertDelivery(alert: FormattedAlert): Promise<void> {
  const severityPrefix = `[${alert.severity.toUpperCase()}]`;
  console.log(
    `[alert-handler] ${severityPrefix} ${alert.title} | source=${alert.source} tenant=${alert.tenantId} | ${alert.message}`,
  );
}
