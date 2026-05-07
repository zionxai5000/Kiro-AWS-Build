/**
 * Unit tests for the Workflow Lambda Event Handler (createWorkflowHandler).
 *
 * Validates: Requirements 6.1, 6.2, 19.1
 *
 * - 6.1: Deliver messages between system components with at-least-once delivery
 * - 6.2: Route undeliverable messages to dead-letter queue after retry exhaustion
 *         (partial batch failure reporting via batchItemFailures)
 * - 19.1: Test suite validates handler behavior before deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWorkflowHandler } from '../workflow-handler.js';
import type { WorkflowHandlerConfig } from '../workflow-handler.js';
import type { SQSEvent } from '../audit-handler.js';
import type { StateMachineEngine, TransitionResult } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStateMachineEngine(): StateMachineEngine {
  const successResult: TransitionResult = {
    success: true,
    previousState: 'ready',
    newState: 'executing',
    gateResults: [],
    auditId: 'audit-1',
  };

  return {
    register: vi.fn().mockResolvedValue('def-1'),
    update: vi.fn().mockResolvedValue(undefined),
    createInstance: vi.fn().mockResolvedValue({
      id: 'inst-1',
      definitionId: 'def-1',
      entityId: 'entity-1',
      tenantId: 'tenant-1',
      currentState: 'ready',
      data: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    transition: vi.fn().mockResolvedValue(successResult),
    getState: vi.fn().mockResolvedValue({
      id: 'inst-1',
      definitionId: 'def-1',
      entityId: 'entity-1',
      tenantId: 'tenant-1',
      currentState: 'executing',
      data: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    listInstances: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
  };
}

function makeSeraphimEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt-wf-001',
    source: 'seraphim.workflow',
    type: 'workflow.transition.requested',
    version: '1.0',
    time: new Date().toISOString(),
    tenantId: 'tenant-1',
    correlationId: 'corr-1',
    detail: {
      instanceId: 'inst-1',
      event: 'start',
      triggeredBy: 'agent-1',
      tenantId: 'tenant-1',
      data: { reason: 'task initiated' },
    },
    metadata: { schemaVersion: '1.0', producerVersion: '0.1.0' },
    ...overrides,
  };
}

function makeSQSEvent(records: Array<{ messageId: string; body: string }>): SQSEvent {
  return {
    Records: records.map((r) => ({
      messageId: r.messageId,
      body: r.body,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWorkflowHandler', () => {
  let stateMachineEngine: StateMachineEngine;
  let config: WorkflowHandlerConfig;

  beforeEach(() => {
    stateMachineEngine = createMockStateMachineEngine();
    config = { stateMachineEngine, processedEventIds: new Set<string>() };
  });

  // -----------------------------------------------------------------------
  // 1. Happy path — workflow transition
  // -----------------------------------------------------------------------

  describe('workflow transition processing', () => {
    it('should process a valid workflow event and call transition', async () => {
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(stateMachineEngine.transition).toHaveBeenCalledTimes(1);
    });

    it('should pass correct instanceId and event to transition', async () => {
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      await handler(event);

      const transitionMock = stateMachineEngine.transition as ReturnType<typeof vi.fn>;
      expect(transitionMock.mock.calls[0][0]).toBe('inst-1');
      expect(transitionMock.mock.calls[0][1]).toBe('start');
    });

    it('should pass correct TransitionContext to transition', async () => {
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      await handler(event);

      const transitionMock = stateMachineEngine.transition as ReturnType<typeof vi.fn>;
      const context = transitionMock.mock.calls[0][2];
      expect(context.triggeredBy).toBe('agent-1');
      expect(context.tenantId).toBe('tenant-1');
      expect(context.data).toEqual({ reason: 'task initiated' });
    });

    it('should handle successful transition result without error', async () => {
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
    });

    it('should handle rejected transition result without reporting failure', async () => {
      const rejectedResult: TransitionResult = {
        success: false,
        previousState: 'ready',
        newState: 'ready',
        gateResults: [{ gateId: 'g1', gateName: 'auth-gate', passed: false, details: 'Unauthorized' }],
        rejectionReason: 'Gate check failed',
        auditId: 'audit-2',
      };
      (stateMachineEngine.transition as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rejectedResult);

      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      const result = await handler(event);

      // Rejected transitions are still "processed" — not a batch failure
      expect(result.batchItemFailures).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 2. transitionEvent field alternatives
  // -----------------------------------------------------------------------

  describe('event field alternatives', () => {
    it('should accept transitionEvent as alternative to event field', async () => {
      const handler = createWorkflowHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        detail: {
          instanceId: 'inst-2',
          transitionEvent: 'approve',
          triggeredBy: 'agent-2',
          tenantId: 'tenant-1',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      const transitionMock = stateMachineEngine.transition as ReturnType<typeof vi.fn>;
      expect(transitionMock.mock.calls[0][0]).toBe('inst-2');
      expect(transitionMock.mock.calls[0][1]).toBe('approve');
    });
  });

  // -----------------------------------------------------------------------
  // 3. Missing instanceId or event fields
  // -----------------------------------------------------------------------

  describe('missing required workflow fields', () => {
    it('should report record as failed when instanceId is missing', async () => {
      const handler = createWorkflowHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        detail: {
          event: 'start',
          triggeredBy: 'agent-1',
          tenantId: 'tenant-1',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-no-instance', body: JSON.stringify(seraphimEvent) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-no-instance');
      expect(stateMachineEngine.transition).not.toHaveBeenCalled();
    });

    it('should report record as failed when event/transitionEvent is missing', async () => {
      const handler = createWorkflowHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        detail: {
          instanceId: 'inst-1',
          triggeredBy: 'agent-1',
          tenantId: 'tenant-1',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-no-event', body: JSON.stringify(seraphimEvent) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-no-event');
      expect(stateMachineEngine.transition).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Idempotency — duplicate events are safely ignored
  // -----------------------------------------------------------------------

  describe('idempotency', () => {
    it('should skip duplicate events with the same id', async () => {
      const handler = createWorkflowHandler(config);
      const body = JSON.stringify(makeSeraphimEvent({ id: 'dup-wf-1' }));
      const event = makeSQSEvent([
        { messageId: 'msg-1', body },
        { messageId: 'msg-2', body },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(stateMachineEngine.transition).toHaveBeenCalledTimes(1);
    });

    it('should skip events already in processedEventIds', async () => {
      config.processedEventIds!.add('pre-processed-wf');
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-1',
          body: JSON.stringify(makeSeraphimEvent({ id: 'pre-processed-wf' })),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(stateMachineEngine.transition).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Partial batch failure — batchItemFailures reporting
  // -----------------------------------------------------------------------

  describe('partial batch failure', () => {
    it('should report only failed records in batchItemFailures', async () => {
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-good', body: JSON.stringify(makeSeraphimEvent({ id: 'good-1' })) },
        { messageId: 'msg-bad', body: 'not-json' },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-bad');
      expect(stateMachineEngine.transition).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Invalid JSON body handling
  // -----------------------------------------------------------------------

  describe('invalid JSON body', () => {
    it('should report record as failed when body is not valid JSON', async () => {
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-bad', body: '{{broken json' },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-bad');
    });
  });

  // -----------------------------------------------------------------------
  // 7. Missing required SeraphimEvent fields
  // -----------------------------------------------------------------------

  describe('missing required fields', () => {
    it('should report record as failed when id is missing', async () => {
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-id',
          body: JSON.stringify({ type: 'workflow', detail: { instanceId: 'i1', event: 'start' } }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
    });

    it('should report record as failed when type is missing', async () => {
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-type',
          body: JSON.stringify({ id: 'evt-1', detail: { instanceId: 'i1', event: 'start' } }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
    });

    it('should report record as failed when detail is missing', async () => {
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-detail',
          body: JSON.stringify({ id: 'evt-1', type: 'workflow' }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Service error handling
  // -----------------------------------------------------------------------

  describe('service error handling', () => {
    it('should report record as failed when stateMachineEngine.transition throws', async () => {
      (stateMachineEngine.transition as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('State machine instance not found'),
      );
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-1');
    });

    it('should continue processing remaining records after a service error', async () => {
      (stateMachineEngine.transition as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Engine error'))
        .mockResolvedValueOnce({
          success: true,
          previousState: 'ready',
          newState: 'executing',
          gateResults: [],
          auditId: 'audit-ok',
        });
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-fail', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-fail' })) },
        { messageId: 'msg-ok', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-ok' })) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-fail');
      expect(stateMachineEngine.transition).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Batch processing
  // -----------------------------------------------------------------------

  describe('batch processing', () => {
    it('should process multiple valid records successfully', async () => {
      const handler = createWorkflowHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-1' })) },
        { messageId: 'msg-2', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-2' })) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(stateMachineEngine.transition).toHaveBeenCalledTimes(2);
    });

    it('should return empty batchItemFailures for empty Records array', async () => {
      const handler = createWorkflowHandler(config);
      const event: SQSEvent = { Records: [] };

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
    });
  });
});
