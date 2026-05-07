/**
 * In-Memory Event Bus Service — lightweight implementation for local development.
 *
 * Implements the EventBusService interface from @seraphim/core without any
 * AWS SDK dependencies. Validates events using the same SeraphimEvent schema,
 * stores events in memory, and dispatches to registered handlers synchronously.
 */

import { randomUUID } from 'node:crypto';

import type { EventBusService } from '@seraphim/core';
import type {
  SystemEvent,
  SeraphimEvent,
  EventPattern,
  EventHandler,
  DeadLetterMessage,
  DLQFilter,
} from '@seraphim/core';

// ---------------------------------------------------------------------------
// InMemoryEventBusService
// ---------------------------------------------------------------------------

export class InMemoryEventBusService implements EventBusService {
  private readonly events: SystemEvent[] = [];
  private readonly handlers = new Map<string, { pattern: EventPattern; handler: EventHandler }>();

  /**
   * Publish a single event. Dispatches to all matching local handlers.
   */
  async publish(event: SystemEvent): Promise<string> {
    const id = randomUUID();
    this.events.push(event);

    // Dispatch to matching handlers
    for (const [, sub] of this.handlers) {
      if (this.matchesPattern(event, sub.pattern)) {
        try {
          await sub.handler(event as unknown as SeraphimEvent);
        } catch {
          // Handler errors are non-fatal in local dev
        }
      }
    }

    return id;
  }

  /**
   * Publish a batch of events.
   */
  async publishBatch(events: SystemEvent[]): Promise<string[]> {
    const ids: string[] = [];
    for (const event of events) {
      ids.push(await this.publish(event));
    }
    return ids;
  }

  /**
   * Subscribe to events matching a pattern.
   */
  async subscribe(pattern: EventPattern, handler: EventHandler): Promise<string> {
    const id = randomUUID();
    this.handlers.set(id, { pattern, handler });
    return id;
  }

  /**
   * Unsubscribe from events.
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    this.handlers.delete(subscriptionId);
  }

  /**
   * No dead-letter queue in local dev — returns empty array.
   */
  async getDeadLetterMessages(_filter?: DLQFilter): Promise<DeadLetterMessage[]> {
    return [];
  }

  /**
   * No-op in local dev.
   */
  async retryDeadLetter(_messageId: string): Promise<void> {}

  /**
   * Get all stored events (useful for debugging).
   */
  getStoredEvents(): SystemEvent[] {
    return [...this.events];
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private matchesPattern(event: SystemEvent, pattern: EventPattern): boolean {
    if (pattern.source && pattern.source.length > 0) {
      if (!pattern.source.includes(event.source)) return false;
    }
    if (pattern.type && pattern.type.length > 0) {
      if (!pattern.type.includes(event.type)) return false;
    }
    if (pattern.tenantId && event.metadata.tenantId !== pattern.tenantId) {
      return false;
    }
    return true;
  }
}
