/**
 * Event Bus Service — asynchronous messaging backbone using
 * Amazon EventBridge for routing and SQS for reliable delivery.
 *
 * Implements the EventBusService interface from @seraphim/core.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import {
  EventBridgeClient,
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
  DeleteRuleCommand,
  RemoveTargetsCommand,
} from '@aws-sdk/client-eventbridge';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
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
import { SeraphimEventSchema } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface EventBusServiceConfig {
  /** EventBridge bus name (e.g. 'seraphim-events') */
  eventBusName: string;
  /** DynamoDB table for event storage */
  eventsTableName: string;
  /** SQS dead-letter queue URL */
  deadLetterQueueUrl: string;
  /** AWS region */
  region?: string;
  /** Optional: override AWS clients for testing */
  clients?: {
    eventBridge?: EventBridgeClient;
    sqs?: SQSClient;
    dynamoDB?: DynamoDBClient;
    /** Pre-built document client (takes precedence over dynamoDB if provided) */
    docClient?: DynamoDBDocumentClient;
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class EventBusServiceImpl implements EventBusService {
  private readonly eventBridge: EventBridgeClient;
  private readonly sqs: SQSClient;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly config: EventBusServiceConfig;

  /** In-memory subscription registry (rule name → handler) */
  private readonly subscriptions = new Map<string, EventHandler>();

  constructor(config: EventBusServiceConfig) {
    this.config = config;
    const region = config.region ?? 'us-east-1';

    this.eventBridge =
      config.clients?.eventBridge ?? new EventBridgeClient({ region });
    this.sqs = config.clients?.sqs ?? new SQSClient({ region });

    if (config.clients?.docClient) {
      this.docClient = config.clients.docClient;
    } else {
      const dynamoClient =
        config.clients?.dynamoDB ?? new DynamoDBClient({ region });
      this.docClient = DynamoDBDocumentClient.from(dynamoClient, {
        marshallOptions: { removeUndefinedValues: true },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Publishing
  // -------------------------------------------------------------------------

  /**
   * Publish a single event.
   *
   * 1. Converts SystemEvent → SeraphimEvent envelope
   * 2. Validates against SeraphimEvent schema (Req 6.5)
   * 3. Puts event to EventBridge (Req 6.1)
   * 4. Stores event in DynamoDB for replay/audit (Req 6.4)
   *
   * Returns the event ID.
   */
  async publish(event: SystemEvent): Promise<string> {
    const seraphimEvent = this.toSeraphimEvent(event);
    this.validateEvent(seraphimEvent);

    await this.putToEventBridge([seraphimEvent]);
    await this.storeEvent(seraphimEvent);

    return seraphimEvent.id;
  }

  /**
   * Publish a batch of events (max 10 per EventBridge API call).
   *
   * Splits into chunks of 10 to respect EventBridge limits (Req 6.1).
   */
  async publishBatch(events: SystemEvent[]): Promise<string[]> {
    if (events.length === 0) {
      return [];
    }

    const seraphimEvents = events.map((e) => this.toSeraphimEvent(e));

    // Validate all events before publishing any
    for (const se of seraphimEvents) {
      this.validateEvent(se);
    }

    // Chunk into batches of 10 (EventBridge limit)
    const chunks = this.chunk(seraphimEvents, 10);

    for (const batch of chunks) {
      await this.putToEventBridge(batch);
    }

    // Store all events in DynamoDB
    await Promise.all(seraphimEvents.map((se) => this.storeEvent(se)));

    return seraphimEvents.map((se) => se.id);
  }

  // -------------------------------------------------------------------------
  // Subscription
  // -------------------------------------------------------------------------

  /**
   * Create an EventBridge rule with content-based pattern matching,
   * targeting an SQS queue (Req 6.3).
   *
   * Returns a subscription ID (the rule name).
   */
  async subscribe(pattern: EventPattern, handler: EventHandler): Promise<string> {
    const subscriptionId = `seraphim-sub-${randomUUID()}`;

    // Build EventBridge event pattern for content-based routing
    const eventPattern = this.buildEventBridgePattern(pattern);

    // Create the rule
    await this.eventBridge.send(
      new PutRuleCommand({
        Name: subscriptionId,
        EventBusName: this.config.eventBusName,
        EventPattern: JSON.stringify(eventPattern),
        State: 'ENABLED',
        Description: `Subscription for source=${pattern.source?.join(',') ?? '*'} type=${pattern.type?.join(',') ?? '*'}`,
      }),
    );

    // Target the DLQ as a fallback — in production this would target
    // a specific SQS queue per subscriber. For now we use the DLQ URL
    // as the target ARN placeholder.
    await this.eventBridge.send(
      new PutTargetsCommand({
        Rule: subscriptionId,
        EventBusName: this.config.eventBusName,
        Targets: [
          {
            Id: `${subscriptionId}-target`,
            Arn: this.config.deadLetterQueueUrl,
          },
        ],
      }),
    );

    // Register handler in-memory for local dispatch
    this.subscriptions.set(subscriptionId, handler);

    return subscriptionId;
  }

  /**
   * Remove an EventBridge rule and its targets.
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    // Remove targets first (required before deleting rule)
    await this.eventBridge.send(
      new RemoveTargetsCommand({
        Rule: subscriptionId,
        EventBusName: this.config.eventBusName,
        Ids: [`${subscriptionId}-target`],
      }),
    );

    await this.eventBridge.send(
      new DeleteRuleCommand({
        Name: subscriptionId,
        EventBusName: this.config.eventBusName,
      }),
    );

    this.subscriptions.delete(subscriptionId);
  }

  // -------------------------------------------------------------------------
  // Dead Letter Queue Management (Req 6.2)
  // -------------------------------------------------------------------------

  /**
   * Retrieve messages from the dead-letter queue.
   */
  async getDeadLetterMessages(filter?: DLQFilter): Promise<DeadLetterMessage[]> {
    const maxMessages = filter?.limit ?? 10;

    const response = await this.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: this.config.deadLetterQueueUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        MessageAttributeNames: ['All'],
        AttributeNames: ['All'],
        WaitTimeSeconds: 1,
      }),
    );

    if (!response.Messages || response.Messages.length === 0) {
      return [];
    }

    const messages: DeadLetterMessage[] = [];

    for (const msg of response.Messages) {
      if (!msg.Body || !msg.MessageId) continue;

      let originalEvent: SeraphimEvent;
      try {
        originalEvent = JSON.parse(msg.Body) as SeraphimEvent;
      } catch {
        continue;
      }

      // Apply filters
      if (filter?.source && originalEvent.source !== filter.source) continue;
      if (filter?.type && originalEvent.type !== filter.type) continue;
      if (filter?.since) {
        const eventTime = new Date(originalEvent.time);
        if (eventTime < filter.since) continue;
      }

      const retryCount = parseInt(
        msg.MessageAttributes?.['retryCount']?.StringValue ?? '0',
        10,
      );

      messages.push({
        messageId: msg.MessageId,
        originalEvent,
        failureReason:
          msg.MessageAttributes?.['failureReason']?.StringValue ??
          'Unknown failure',
        retryCount,
        lastAttempt: new Date(
          msg.Attributes?.['SentTimestamp']
            ? parseInt(msg.Attributes['SentTimestamp'], 10)
            : Date.now(),
        ),
      });
    }

    return messages;
  }

  /**
   * Retry a dead-letter message by re-publishing it to the event bus.
   *
   * Deletes the message from the DLQ after successful re-publish.
   */
  async retryDeadLetter(messageId: string): Promise<void> {
    // Receive the specific message — SQS doesn't support get-by-ID,
    // so we receive and filter. In production, the receipt handle would
    // be cached from getDeadLetterMessages.
    const response = await this.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: this.config.deadLetterQueueUrl,
        MaxNumberOfMessages: 10,
        MessageAttributeNames: ['All'],
        WaitTimeSeconds: 0,
      }),
    );

    const target = response.Messages?.find((m) => m.MessageId === messageId);
    if (!target || !target.Body || !target.ReceiptHandle) {
      throw new Error(`Dead letter message not found: ${messageId}`);
    }

    const originalEvent = JSON.parse(target.Body) as SeraphimEvent;

    // Re-publish to EventBridge
    await this.putToEventBridge([originalEvent]);

    // Delete from DLQ
    await this.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: this.config.deadLetterQueueUrl,
        ReceiptHandle: target.ReceiptHandle,
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Convert a SystemEvent to a full SeraphimEvent envelope.
   */
  private toSeraphimEvent(event: SystemEvent): SeraphimEvent {
    return {
      id: randomUUID(),
      source: event.source.startsWith('seraphim.')
        ? event.source
        : `seraphim.${event.source}`,
      type: event.type,
      version: '1.0',
      time: (event.metadata.timestamp instanceof Date
        ? event.metadata.timestamp
        : new Date(event.metadata.timestamp)
      ).toISOString(),
      tenantId: event.metadata.tenantId,
      correlationId: event.metadata.correlationId,
      detail: event.detail,
      metadata: {
        schemaVersion: '1.0',
        producerVersion: '0.1.0',
      },
    };
  }

  /**
   * Validate a SeraphimEvent against the schema (Req 6.5).
   * Throws if validation fails.
   */
  private validateEvent(event: SeraphimEvent): void {
    const result = SeraphimEventSchema.safeParse(event);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        path: i.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
        message: i.message,
      }));
      const summary = issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new EventValidationError(
        `Event schema validation failed: ${summary}`,
        issues,
      );
    }
  }

  /**
   * Put events to EventBridge.
   */
  private async putToEventBridge(events: SeraphimEvent[]): Promise<void> {
    const entries = events.map((event) => ({
      EventBusName: this.config.eventBusName,
      Source: event.source,
      DetailType: event.type,
      Time: new Date(event.time),
      Detail: JSON.stringify({
        id: event.id,
        version: event.version,
        tenantId: event.tenantId,
        correlationId: event.correlationId,
        detail: event.detail,
        metadata: event.metadata,
      }),
    }));

    const response = await this.eventBridge.send(
      new PutEventsCommand({ Entries: entries }),
    );

    if (response.FailedEntryCount && response.FailedEntryCount > 0) {
      const failedEntries = response.Entries?.filter((e) => e.ErrorCode) ?? [];
      const errors = failedEntries
        .map((e) => `${e.ErrorCode}: ${e.ErrorMessage}`)
        .join('; ');
      throw new EventPublishError(
        `Failed to publish ${response.FailedEntryCount} event(s): ${errors}`,
        response.FailedEntryCount,
      );
    }
  }

  /**
   * Store event in DynamoDB seraphim-events table for replay/audit.
   *
   * Partition key: tenantId#source
   * Sort key: timestamp#eventId
   */
  private async storeEvent(event: SeraphimEvent): Promise<void> {
    await this.docClient.send(
      new PutCommand({
        TableName: this.config.eventsTableName,
        Item: {
          pk: `${event.tenantId}#${event.source}`,
          sk: `${event.time}#${event.id}`,
          eventId: event.id,
          source: event.source,
          type: event.type,
          version: event.version,
          time: event.time,
          tenantId: event.tenantId,
          correlationId: event.correlationId,
          detail: event.detail,
          metadata: event.metadata,
          ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days
        },
      }),
    );
  }

  /**
   * Build an EventBridge event pattern from our EventPattern type.
   * Supports content-based routing by source, type, and tenantId.
   */
  private buildEventBridgePattern(
    pattern: EventPattern,
  ): Record<string, unknown> {
    const ebPattern: Record<string, unknown> = {};

    if (pattern.source && pattern.source.length > 0) {
      ebPattern['source'] = pattern.source;
    }

    if (pattern.type && pattern.type.length > 0) {
      ebPattern['detail-type'] = pattern.type;
    }

    if (pattern.tenantId) {
      ebPattern['detail'] = {
        tenantId: [pattern.tenantId],
      };
    }

    return ebPattern;
  }

  /**
   * Split an array into chunks of the given size.
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

export class EventValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: Array<{ path: (string | number)[]; message: string }>,
  ) {
    super(message);
    this.name = 'EventValidationError';
  }
}

export class EventPublishError extends Error {
  constructor(
    message: string,
    public readonly failedCount: number,
  ) {
    super(message);
    this.name = 'EventPublishError';
  }
}
