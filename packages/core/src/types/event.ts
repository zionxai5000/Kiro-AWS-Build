/**
 * Event bus data models.
 */

// ---------------------------------------------------------------------------
// System Event (EventBridge envelope)
// ---------------------------------------------------------------------------

export interface SystemEvent {
  source: string;
  type: string;
  detail: Record<string, unknown>;
  metadata: {
    tenantId: string;
    correlationId: string;
    timestamp: Date;
  };
}

// ---------------------------------------------------------------------------
// Seraphim Event (full event envelope with schema versioning)
// ---------------------------------------------------------------------------

export interface SeraphimEvent {
  /** UUID */
  id: string;
  /** e.g. 'seraphim.agent-runtime' */
  source: string;
  /** e.g. 'agent.state.changed' */
  type: string;
  version: '1.0';
  /** ISO 8601 */
  time: string;
  tenantId: string;
  /** Traces related events */
  correlationId: string;

  /** Event-specific payload */
  detail: Record<string, unknown>;

  metadata: {
    schemaVersion: string;
    producerVersion: string;
  };
}

// ---------------------------------------------------------------------------
// Event Pattern (for subscriptions)
// ---------------------------------------------------------------------------

export interface EventPattern {
  source?: string[];
  type?: string[];
  tenantId?: string;
}

// ---------------------------------------------------------------------------
// Event Handler
// ---------------------------------------------------------------------------

export type EventHandler = (event: SeraphimEvent) => Promise<void>;

// ---------------------------------------------------------------------------
// Dead Letter Message
// ---------------------------------------------------------------------------

export interface DeadLetterMessage {
  messageId: string;
  originalEvent: SeraphimEvent;
  failureReason: string;
  retryCount: number;
  lastAttempt: Date;
}

// ---------------------------------------------------------------------------
// DLQ Filter
// ---------------------------------------------------------------------------

export interface DLQFilter {
  source?: string;
  type?: string;
  since?: Date;
  limit?: number;
}
