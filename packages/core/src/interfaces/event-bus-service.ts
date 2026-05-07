/**
 * Event Bus service interface — asynchronous messaging backbone.
 */

import type {
  SystemEvent,
  EventPattern,
  EventHandler,
  DeadLetterMessage,
  DLQFilter,
} from '../types/event.js';

export interface EventBusService {
  // Publishing
  publish(event: SystemEvent): Promise<string>;
  publishBatch(events: SystemEvent[]): Promise<string[]>;

  // Subscription
  subscribe(pattern: EventPattern, handler: EventHandler): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;

  // Dead Letter
  getDeadLetterMessages(filter?: DLQFilter): Promise<DeadLetterMessage[]>;
  retryDeadLetter(messageId: string): Promise<void>;
}
