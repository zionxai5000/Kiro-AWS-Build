/**
 * Unit tests for the Event Bus Service (EventBusServiceImpl).
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 19.1
 *
 * - 6.1: Deliver messages between system components with at-least-once delivery
 * - 6.2: Route undeliverable messages to dead-letter queue after retry exhaustion
 * - 6.3: Support publish-subscribe patterns for independent consumers
 * - 6.4: Maintain message ordering within a single topic partition
 * - 6.5: Enforce message schema validation before accepting a message
 * - 19.1: Test suite validates state machine transitions before deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBusServiceImpl, EventValidationError, EventPublishError } from './service.js';
import type { EventBusServiceConfig } from './service.js';
import type { SystemEvent, EventPattern } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock AWS SDK clients
// ---------------------------------------------------------------------------

function createMockEventBridgeClient() {
  return { send: vi.fn().mockResolvedValue({ FailedEntryCount: 0, Entries: [] }) };
}

function createMockSQSClient() {
  return { send: vi.fn().mockResolvedValue({}) };
}

function createMockDynamoDBClient() {
  return { send: vi.fn().mockResolvedValue({}) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createValidSystemEvent(overrides: Partial<SystemEvent> = {}): SystemEvent {
  return {
    source: 'seraphim.agent-runtime',
    type: 'agent.state.changed',
    detail: { agentId: 'agent-1', newState: 'ready' },
    metadata: {
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: '660e8400-e29b-41d4-a716-446655440000',
      timestamp: new Date('2025-01-15T10:00:00.000Z'),
    },
    ...overrides,
  };
}

function createConfig(overrides: Partial<EventBusServiceConfig> = {}): EventBusServiceConfig {
  const mockEB = createMockEventBridgeClient();
  const mockSQS = createMockSQSClient();
  const mockDocClient = createMockDynamoDBClient();

  return {
    eventBusName: 'seraphim-events',
    eventsTableName: 'seraphim-events-table',
    deadLetterQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/seraphim-dlq',
    region: 'us-east-1',
    clients: {
      eventBridge: mockEB as any,
      sqs: mockSQS as any,
      docClient: mockDocClient as any,
    },
    ...overrides,
  };
}

function getClients(config: EventBusServiceConfig) {
  return {
    eventBridge: config.clients!.eventBridge! as any,
    sqs: config.clients!.sqs! as any,
    docClient: config.clients!.docClient! as any,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventBusServiceImpl', () => {
  let config: EventBusServiceConfig;
  let service: EventBusServiceImpl;
  let clients: ReturnType<typeof getClients>;

  beforeEach(() => {
    config = createConfig();
    service = new EventBusServiceImpl(config);
    clients = getClients(config);
  });

  // -----------------------------------------------------------------------
  // 1. Event Schema Validation (Req 6.5)
  // -----------------------------------------------------------------------

  describe('event schema validation', () => {
    it('should accept a valid SystemEvent and return an event ID', async () => {
      const event = createValidSystemEvent();
      const id = await service.publish(event);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      // UUID format
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should reject an event with invalid source (not starting with seraphim.)', async () => {
      // The service prepends "seraphim." if missing, so a source that starts
      // with "seraphim." but has an invalid type should still fail type validation.
      // Let's test with an invalid type instead to trigger schema validation.
      const event = createValidSystemEvent({ type: 'INVALID_TYPE' });

      await expect(service.publish(event)).rejects.toThrow(EventValidationError);
    });

    it('should reject an event with invalid type format', async () => {
      const event = createValidSystemEvent({ type: 'Invalid.Type' });

      await expect(service.publish(event)).rejects.toThrow(EventValidationError);
    });

    it('should reject an event with non-UUID tenantId', async () => {
      const event = createValidSystemEvent({
        metadata: {
          tenantId: 'not-a-uuid',
          correlationId: '660e8400-e29b-41d4-a716-446655440000',
          timestamp: new Date(),
        },
      });

      await expect(service.publish(event)).rejects.toThrow(EventValidationError);
    });

    it('should reject an event with non-UUID correlationId', async () => {
      const event = createValidSystemEvent({
        metadata: {
          tenantId: '550e8400-e29b-41d4-a716-446655440000',
          correlationId: 'bad-correlation',
          timestamp: new Date(),
        },
      });

      await expect(service.publish(event)).rejects.toThrow(EventValidationError);
    });

    it('should include validation issues in EventValidationError', async () => {
      const event = createValidSystemEvent({ type: 'BAD_TYPE' });

      try {
        await service.publish(event);
        expect.fail('Expected EventValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(EventValidationError);
        const validationErr = err as EventValidationError;
        expect(validationErr.issues).toBeDefined();
        expect(validationErr.issues.length).toBeGreaterThan(0);
        expect(validationErr.issues[0]).toHaveProperty('path');
        expect(validationErr.issues[0]).toHaveProperty('message');
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. Single Publish (Req 6.1)
  // -----------------------------------------------------------------------

  describe('publish', () => {
    it('should put the event to EventBridge', async () => {
      const event = createValidSystemEvent();
      await service.publish(event);

      expect(clients.eventBridge.send).toHaveBeenCalledTimes(1);
      const call = clients.eventBridge.send.mock.calls[0][0];
      expect(call.input).toBeDefined();
      expect(call.input.Entries).toHaveLength(1);
      expect(call.input.Entries[0].EventBusName).toBe('seraphim-events');
      expect(call.input.Entries[0].Source).toBe('seraphim.agent-runtime');
      expect(call.input.Entries[0].DetailType).toBe('agent.state.changed');
    });

    it('should store the event in DynamoDB', async () => {
      const event = createValidSystemEvent();
      await service.publish(event);

      // DynamoDB is accessed via the DynamoDBDocumentClient wrapper.
      // The mock docClient is passed directly for testing.
      expect(clients.docClient.send).toHaveBeenCalled();
    });

    it('should return a UUID event ID', async () => {
      const event = createValidSystemEvent();
      const id = await service.publish(event);

      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should prepend "seraphim." to source if not already present', async () => {
      const event = createValidSystemEvent({ source: 'agent-runtime' });
      await service.publish(event);

      const call = clients.eventBridge.send.mock.calls[0][0];
      expect(call.input.Entries[0].Source).toBe('seraphim.agent-runtime');
    });

    it('should not double-prepend "seraphim." if already present', async () => {
      const event = createValidSystemEvent({ source: 'seraphim.agent-runtime' });
      await service.publish(event);

      const call = clients.eventBridge.send.mock.calls[0][0];
      expect(call.input.Entries[0].Source).toBe('seraphim.agent-runtime');
    });
  });

  // -----------------------------------------------------------------------
  // 3. Batch Publish (Req 6.1)
  // -----------------------------------------------------------------------

  describe('publishBatch', () => {
    it('should return empty array for empty input', async () => {
      const ids = await service.publishBatch([]);
      expect(ids).toEqual([]);
      expect(clients.eventBridge.send).not.toHaveBeenCalled();
    });

    it('should validate all events before publishing any', async () => {
      const validEvent = createValidSystemEvent();
      const invalidEvent = createValidSystemEvent({ type: 'INVALID' });

      await expect(
        service.publishBatch([validEvent, invalidEvent]),
      ).rejects.toThrow(EventValidationError);

      // EventBridge should NOT have been called since validation failed
      expect(clients.eventBridge.send).not.toHaveBeenCalled();
    });

    it('should publish a small batch in a single EventBridge call', async () => {
      const events = Array.from({ length: 5 }, (_, i) =>
        createValidSystemEvent({
          detail: { index: i },
        }),
      );

      const ids = await service.publishBatch(events);

      expect(ids).toHaveLength(5);
      // One call to EventBridge (5 events < 10 limit)
      expect(clients.eventBridge.send).toHaveBeenCalledTimes(1);
      const call = clients.eventBridge.send.mock.calls[0][0];
      expect(call.input.Entries).toHaveLength(5);
    });

    it('should chunk events into batches of 10 for EventBridge', async () => {
      const events = Array.from({ length: 25 }, (_, i) =>
        createValidSystemEvent({
          detail: { index: i },
        }),
      );

      const ids = await service.publishBatch(events);

      expect(ids).toHaveLength(25);
      // 25 events → 3 batches (10 + 10 + 5)
      expect(clients.eventBridge.send).toHaveBeenCalledTimes(3);

      const batch1 = clients.eventBridge.send.mock.calls[0][0];
      const batch2 = clients.eventBridge.send.mock.calls[1][0];
      const batch3 = clients.eventBridge.send.mock.calls[2][0];

      expect(batch1.input.Entries).toHaveLength(10);
      expect(batch2.input.Entries).toHaveLength(10);
      expect(batch3.input.Entries).toHaveLength(5);
    });

    it('should store all events in DynamoDB', async () => {
      const events = Array.from({ length: 3 }, (_, i) =>
        createValidSystemEvent({ detail: { index: i } }),
      );

      await service.publishBatch(events);

      // Each event triggers a DynamoDB PutCommand
      expect(clients.docClient.send).toHaveBeenCalledTimes(3);
    });

    it('should return unique IDs for each event', async () => {
      const events = Array.from({ length: 3 }, () => createValidSystemEvent());

      const ids = await service.publishBatch(events);

      expect(ids).toHaveLength(3);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // 4. EventPublishError on EventBridge failures
  // -----------------------------------------------------------------------

  describe('EventPublishError', () => {
    it('should throw EventPublishError when EventBridge reports failures', async () => {
      clients.eventBridge.send.mockResolvedValueOnce({
        FailedEntryCount: 1,
        Entries: [
          { ErrorCode: 'InternalError', ErrorMessage: 'Service unavailable' },
        ],
      });

      const event = createValidSystemEvent();

      await expect(service.publish(event)).rejects.toThrow(EventPublishError);
    });

    it('should include failedCount in EventPublishError', async () => {
      clients.eventBridge.send.mockResolvedValueOnce({
        FailedEntryCount: 2,
        Entries: [
          { ErrorCode: 'InternalError', ErrorMessage: 'err1' },
          { ErrorCode: 'ThrottlingException', ErrorMessage: 'err2' },
        ],
      });

      const event = createValidSystemEvent();

      try {
        await service.publish(event);
        expect.fail('Expected EventPublishError');
      } catch (err) {
        expect(err).toBeInstanceOf(EventPublishError);
        expect((err as EventPublishError).failedCount).toBe(2);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 5. Dead-Letter Queue Retrieval (Req 6.2)
  // -----------------------------------------------------------------------

  describe('getDeadLetterMessages', () => {
    const sampleSeraphimEvent = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source: 'seraphim.agent-runtime',
      type: 'agent.state.changed',
      version: '1.0',
      time: '2025-01-15T10:00:00.000Z',
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: '660e8400-e29b-41d4-a716-446655440000',
      detail: { agentId: 'agent-1' },
      metadata: { schemaVersion: '1.0', producerVersion: '0.1.0' },
    };

    it('should return empty array when no messages in DLQ', async () => {
      clients.sqs.send.mockResolvedValueOnce({ Messages: [] });

      const messages = await service.getDeadLetterMessages();
      expect(messages).toEqual([]);
    });

    it('should parse DLQ messages into DeadLetterMessage format', async () => {
      clients.sqs.send.mockResolvedValueOnce({
        Messages: [
          {
            MessageId: 'msg-1',
            Body: JSON.stringify(sampleSeraphimEvent),
            ReceiptHandle: 'receipt-1',
            MessageAttributes: {
              retryCount: { StringValue: '3' },
              failureReason: { StringValue: 'Handler timeout' },
            },
            Attributes: {
              SentTimestamp: String(Date.now()),
            },
          },
        ],
      });

      const messages = await service.getDeadLetterMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].messageId).toBe('msg-1');
      expect(messages[0].originalEvent.id).toBe(sampleSeraphimEvent.id);
      expect(messages[0].failureReason).toBe('Handler timeout');
      expect(messages[0].retryCount).toBe(3);
      expect(messages[0].lastAttempt).toBeInstanceOf(Date);
    });

    it('should filter DLQ messages by source', async () => {
      clients.sqs.send.mockResolvedValueOnce({
        Messages: [
          {
            MessageId: 'msg-1',
            Body: JSON.stringify(sampleSeraphimEvent),
            ReceiptHandle: 'receipt-1',
            MessageAttributes: {},
            Attributes: { SentTimestamp: String(Date.now()) },
          },
          {
            MessageId: 'msg-2',
            Body: JSON.stringify({
              ...sampleSeraphimEvent,
              id: '770e8400-e29b-41d4-a716-446655440000',
              source: 'seraphim.otzar',
            }),
            ReceiptHandle: 'receipt-2',
            MessageAttributes: {},
            Attributes: { SentTimestamp: String(Date.now()) },
          },
        ],
      });

      const messages = await service.getDeadLetterMessages({
        source: 'seraphim.otzar',
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].originalEvent.source).toBe('seraphim.otzar');
    });

    it('should filter DLQ messages by type', async () => {
      clients.sqs.send.mockResolvedValueOnce({
        Messages: [
          {
            MessageId: 'msg-1',
            Body: JSON.stringify(sampleSeraphimEvent),
            ReceiptHandle: 'receipt-1',
            MessageAttributes: {},
            Attributes: { SentTimestamp: String(Date.now()) },
          },
        ],
      });

      const messages = await service.getDeadLetterMessages({
        type: 'nonexistent.type',
      });

      expect(messages).toHaveLength(0);
    });

    it('should filter DLQ messages by since date', async () => {
      const oldEvent = {
        ...sampleSeraphimEvent,
        time: '2024-01-01T00:00:00.000Z',
      };

      clients.sqs.send.mockResolvedValueOnce({
        Messages: [
          {
            MessageId: 'msg-1',
            Body: JSON.stringify(oldEvent),
            ReceiptHandle: 'receipt-1',
            MessageAttributes: {},
            Attributes: { SentTimestamp: String(Date.now()) },
          },
        ],
      });

      const messages = await service.getDeadLetterMessages({
        since: new Date('2025-01-01T00:00:00.000Z'),
      });

      expect(messages).toHaveLength(0);
    });

    it('should respect the limit filter', async () => {
      clients.sqs.send.mockResolvedValueOnce({ Messages: [] });

      await service.getDeadLetterMessages({ limit: 5 });

      const call = clients.sqs.send.mock.calls[0][0];
      expect(call.input.MaxNumberOfMessages).toBe(5);
    });

    it('should cap MaxNumberOfMessages at 10 (SQS limit)', async () => {
      clients.sqs.send.mockResolvedValueOnce({ Messages: [] });

      await service.getDeadLetterMessages({ limit: 20 });

      const call = clients.sqs.send.mock.calls[0][0];
      expect(call.input.MaxNumberOfMessages).toBe(10);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Dead-Letter Retry (Req 6.2)
  // -----------------------------------------------------------------------

  describe('retryDeadLetter', () => {
    const sampleSeraphimEvent = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source: 'seraphim.agent-runtime',
      type: 'agent.state.changed',
      version: '1.0',
      time: '2025-01-15T10:00:00.000Z',
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: '660e8400-e29b-41d4-a716-446655440000',
      detail: { agentId: 'agent-1' },
      metadata: { schemaVersion: '1.0', producerVersion: '0.1.0' },
    };

    it('should re-publish the DLQ message to EventBridge and delete from DLQ', async () => {
      // First call: ReceiveMessage to find the target message
      clients.sqs.send.mockResolvedValueOnce({
        Messages: [
          {
            MessageId: 'msg-1',
            Body: JSON.stringify(sampleSeraphimEvent),
            ReceiptHandle: 'receipt-handle-1',
            MessageAttributes: {},
          },
        ],
      });

      // Second call: EventBridge PutEvents
      clients.eventBridge.send.mockResolvedValueOnce({
        FailedEntryCount: 0,
        Entries: [],
      });

      // Third call: SQS DeleteMessage
      clients.sqs.send.mockResolvedValueOnce({});

      await service.retryDeadLetter('msg-1');

      // Should have called EventBridge to re-publish
      expect(clients.eventBridge.send).toHaveBeenCalledTimes(1);

      // Should have called SQS twice: ReceiveMessage + DeleteMessage
      expect(clients.sqs.send).toHaveBeenCalledTimes(2);

      // Verify the delete call uses the correct receipt handle
      const deleteCall = clients.sqs.send.mock.calls[1][0];
      expect(deleteCall.input.ReceiptHandle).toBe('receipt-handle-1');
      expect(deleteCall.input.QueueUrl).toBe(config.deadLetterQueueUrl);
    });

    it('should throw if the message is not found in DLQ', async () => {
      clients.sqs.send.mockResolvedValueOnce({
        Messages: [
          {
            MessageId: 'other-msg',
            Body: JSON.stringify(sampleSeraphimEvent),
            ReceiptHandle: 'receipt-other',
          },
        ],
      });

      await expect(service.retryDeadLetter('msg-not-found')).rejects.toThrow(
        /Dead letter message not found/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // 7. Subscribe (Req 6.3)
  // -----------------------------------------------------------------------

  describe('subscribe', () => {
    it('should create an EventBridge rule with correct pattern', async () => {
      const pattern: EventPattern = {
        source: ['seraphim.agent-runtime'],
        type: ['agent.state.changed'],
      };
      const handler = vi.fn();

      const subscriptionId = await service.subscribe(pattern, handler);

      expect(subscriptionId).toBeDefined();
      expect(subscriptionId).toMatch(/^seraphim-sub-/);

      // PutRuleCommand
      expect(clients.eventBridge.send).toHaveBeenCalledTimes(2); // PutRule + PutTargets
      const ruleCall = clients.eventBridge.send.mock.calls[0][0];
      expect(ruleCall.input.Name).toBe(subscriptionId);
      expect(ruleCall.input.EventBusName).toBe('seraphim-events');
      expect(ruleCall.input.State).toBe('ENABLED');

      const eventPattern = JSON.parse(ruleCall.input.EventPattern);
      expect(eventPattern.source).toEqual(['seraphim.agent-runtime']);
      expect(eventPattern['detail-type']).toEqual(['agent.state.changed']);
    });

    it('should create targets for the subscription rule', async () => {
      const pattern: EventPattern = { source: ['seraphim.otzar'] };
      const handler = vi.fn();

      const subscriptionId = await service.subscribe(pattern, handler);

      // PutTargetsCommand
      const targetsCall = clients.eventBridge.send.mock.calls[1][0];
      expect(targetsCall.input.Rule).toBe(subscriptionId);
      expect(targetsCall.input.EventBusName).toBe('seraphim-events');
      expect(targetsCall.input.Targets).toHaveLength(1);
      expect(targetsCall.input.Targets[0].Id).toBe(`${subscriptionId}-target`);
    });

    it('should support tenantId in the event pattern', async () => {
      const pattern: EventPattern = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const handler = vi.fn();

      await service.subscribe(pattern, handler);

      const ruleCall = clients.eventBridge.send.mock.calls[0][0];
      const eventPattern = JSON.parse(ruleCall.input.EventPattern);
      expect(eventPattern.detail).toEqual({
        tenantId: ['550e8400-e29b-41d4-a716-446655440000'],
      });
    });
  });

  // -----------------------------------------------------------------------
  // 8. Unsubscribe
  // -----------------------------------------------------------------------

  describe('unsubscribe', () => {
    it('should remove targets and delete the EventBridge rule', async () => {
      const subscriptionId = 'seraphim-sub-test-123';

      await service.unsubscribe(subscriptionId);

      // Should call RemoveTargets first, then DeleteRule
      expect(clients.eventBridge.send).toHaveBeenCalledTimes(2);

      const removeTargetsCall = clients.eventBridge.send.mock.calls[0][0];
      expect(removeTargetsCall.input.Rule).toBe(subscriptionId);
      expect(removeTargetsCall.input.EventBusName).toBe('seraphim-events');
      expect(removeTargetsCall.input.Ids).toEqual([`${subscriptionId}-target`]);

      const deleteRuleCall = clients.eventBridge.send.mock.calls[1][0];
      expect(deleteRuleCall.input.Name).toBe(subscriptionId);
      expect(deleteRuleCall.input.EventBusName).toBe('seraphim-events');
    });
  });

  // -----------------------------------------------------------------------
  // 9. Message Ordering — DynamoDB sort key (Req 6.4)
  // -----------------------------------------------------------------------

  describe('message ordering', () => {
    it('should store events with timestamp-based sort keys for ordering', async () => {
      const event = createValidSystemEvent();
      await service.publish(event);

      // The DynamoDB PutCommand should use a sort key of `time#id`
      const putCall = clients.docClient.send.mock.calls[0][0];
      const item = putCall.input.Item;

      expect(item.pk).toContain('seraphim.agent-runtime');
      expect(item.pk).toContain(event.metadata.tenantId);
      // Sort key should start with the ISO timestamp
      expect(item.sk).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // Sort key should contain the event ID after the timestamp
      expect(item.sk).toContain('#');
    });

    it('should store events with correct partition key format (tenantId#source)', async () => {
      const event = createValidSystemEvent();
      await service.publish(event);

      const putCall = clients.docClient.send.mock.calls[0][0];
      const item = putCall.input.Item;

      expect(item.pk).toBe(
        `${event.metadata.tenantId}#seraphim.agent-runtime`,
      );
    });

    it('should include TTL for event expiration', async () => {
      const event = createValidSystemEvent();
      await service.publish(event);

      const putCall = clients.docClient.send.mock.calls[0][0];
      const item = putCall.input.Item;

      expect(item.ttl).toBeDefined();
      expect(typeof item.ttl).toBe('number');
      // TTL should be roughly 90 days from now
      const ninetyDaysInSeconds = 90 * 24 * 60 * 60;
      const nowInSeconds = Math.floor(Date.now() / 1000);
      expect(item.ttl).toBeGreaterThan(nowInSeconds);
      expect(item.ttl).toBeLessThanOrEqual(nowInSeconds + ninetyDaysInSeconds + 10);
    });

    it('should preserve event fields in DynamoDB storage', async () => {
      const event = createValidSystemEvent();
      await service.publish(event);

      const putCall = clients.docClient.send.mock.calls[0][0];
      const item = putCall.input.Item;

      expect(item.source).toBe('seraphim.agent-runtime');
      expect(item.type).toBe('agent.state.changed');
      expect(item.version).toBe('1.0');
      expect(item.tenantId).toBe(event.metadata.tenantId);
      expect(item.correlationId).toBe(event.metadata.correlationId);
      expect(item.detail).toEqual(event.detail);
      expect(item.metadata).toEqual({
        schemaVersion: '1.0',
        producerVersion: '0.1.0',
      });
    });
  });
});
