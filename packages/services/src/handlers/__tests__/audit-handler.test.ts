/**
 * Unit tests for the Audit Lambda Event Handler (createAuditHandler).
 *
 * Validates: Requirements 6.1, 6.2, 19.1
 *
 * - 6.1: Deliver messages between system components with at-least-once delivery
 * - 6.2: Route undeliverable messages to dead-letter queue after retry exhaustion
 *         (partial batch failure reporting via batchItemFailures)
 * - 19.1: Test suite validates handler behavior before deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuditHandler } from '../audit-handler.js';
import type { AuditHandlerConfig, SQSEvent, SQSBatchResponse } from '../audit-handler.js';
import type { XOAuditService } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAuditService(): XOAuditService {
  return {
    recordAction: vi.fn().mockResolvedValue('audit-id-1'),
    recordGovernanceDecision: vi.fn().mockResolvedValue('audit-id-2'),
    recordStateTransition: vi.fn().mockResolvedValue('audit-id-3'),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true, recordId: '', chainLength: 0 }),
  };
}

function makeSeraphimEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt-001',
    source: 'seraphim.agent-runtime',
    type: 'audit.action.recorded',
    version: '1.0',
    time: new Date().toISOString(),
    tenantId: 'tenant-1',
    correlationId: 'corr-1',
    detail: {
      tenantId: 'tenant-1',
      actingAgentId: 'agent-1',
      actingAgentName: 'TestAgent',
      actionType: 'task.execute',
      target: 'resource-1',
      authorizationChain: [],
      executionTokens: [],
      outcome: 'success',
      details: {},
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

describe('createAuditHandler', () => {
  let auditService: XOAuditService;
  let config: AuditHandlerConfig;

  beforeEach(() => {
    auditService = createMockAuditService();
    config = { auditService, processedEventIds: new Set<string>() };
  });

  // -----------------------------------------------------------------------
  // 1. Happy path — action audit events
  // -----------------------------------------------------------------------

  describe('action audit events', () => {
    it('should process a valid action audit event and call recordAction', async () => {
      const handler = createAuditHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(auditService.recordAction).toHaveBeenCalledTimes(1);
      expect(auditService.recordGovernanceDecision).not.toHaveBeenCalled();
      expect(auditService.recordStateTransition).not.toHaveBeenCalled();
    });

    it('should pass correct audit entry fields to recordAction', async () => {
      const handler = createAuditHandler(config);
      const seraphimEvent = makeSeraphimEvent();
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      const call = (auditService.recordAction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.tenantId).toBe('tenant-1');
      expect(call.actingAgentId).toBe('agent-1');
      expect(call.actingAgentName).toBe('TestAgent');
      expect(call.actionType).toBe('task.execute');
      expect(call.outcome).toBe('success');
    });
  });

  // -----------------------------------------------------------------------
  // 2. Governance audit events
  // -----------------------------------------------------------------------

  describe('governance audit events', () => {
    it('should route governance events to recordGovernanceDecision', async () => {
      const handler = createAuditHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        type: 'audit.governance.decision',
        detail: {
          ...makeSeraphimEvent().detail as Record<string, unknown>,
          auditType: 'governance',
          governanceType: 'authorization',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(auditService.recordGovernanceDecision).toHaveBeenCalledTimes(1);
      expect(auditService.recordAction).not.toHaveBeenCalled();
    });

    it('should infer governance type from event type containing "governance"', async () => {
      const handler = createAuditHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        type: 'mishmar.governance.check',
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      expect(auditService.recordGovernanceDecision).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Transition audit events
  // -----------------------------------------------------------------------

  describe('transition audit events', () => {
    it('should route transition events to recordStateTransition', async () => {
      const handler = createAuditHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        type: 'state-machine.transition',
        detail: {
          ...makeSeraphimEvent().detail as Record<string, unknown>,
          auditType: 'transition',
          stateMachineId: 'sm-1',
          instanceId: 'inst-1',
          previousState: 'ready',
          newState: 'executing',
          gateResults: [],
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(auditService.recordStateTransition).toHaveBeenCalledTimes(1);
      expect(auditService.recordAction).not.toHaveBeenCalled();
    });

    it('should infer transition type from detail containing stateMachineId', async () => {
      const handler = createAuditHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        detail: {
          ...makeSeraphimEvent().detail as Record<string, unknown>,
          stateMachineId: 'sm-1',
          instanceId: 'inst-1',
          previousState: 'idle',
          newState: 'active',
          gateResults: [],
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      expect(auditService.recordStateTransition).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Idempotency — duplicate events are safely ignored
  // -----------------------------------------------------------------------

  describe('idempotency', () => {
    it('should skip duplicate events with the same id', async () => {
      const handler = createAuditHandler(config);
      const body = JSON.stringify(makeSeraphimEvent({ id: 'dup-evt-1' }));
      const event = makeSQSEvent([
        { messageId: 'msg-1', body },
        { messageId: 'msg-2', body },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(auditService.recordAction).toHaveBeenCalledTimes(1);
    });

    it('should skip events already in processedEventIds', async () => {
      config.processedEventIds!.add('pre-processed-evt');
      const handler = createAuditHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-1',
          body: JSON.stringify(makeSeraphimEvent({ id: 'pre-processed-evt' })),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(auditService.recordAction).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Partial batch failure — batchItemFailures reporting
  // -----------------------------------------------------------------------

  describe('partial batch failure', () => {
    it('should report only failed records in batchItemFailures', async () => {
      const handler = createAuditHandler(config);
      const goodBody = JSON.stringify(makeSeraphimEvent({ id: 'good-1' }));
      const badBody = 'not-json';
      const event = makeSQSEvent([
        { messageId: 'msg-good', body: goodBody },
        { messageId: 'msg-bad', body: badBody },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-bad');
      expect(auditService.recordAction).toHaveBeenCalledTimes(1);
    });

    it('should report multiple failed records', async () => {
      const handler = createAuditHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: 'bad-json-1' },
        { messageId: 'msg-2', body: JSON.stringify(makeSeraphimEvent({ id: 'ok-1' })) },
        { messageId: 'msg-3', body: 'bad-json-2' },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(2);
      const failedIds = result.batchItemFailures.map((f) => f.itemIdentifier);
      expect(failedIds).toContain('msg-1');
      expect(failedIds).toContain('msg-3');
    });
  });

  // -----------------------------------------------------------------------
  // 6. Invalid JSON body handling
  // -----------------------------------------------------------------------

  describe('invalid JSON body', () => {
    it('should report record as failed when body is not valid JSON', async () => {
      const handler = createAuditHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-bad', body: '{invalid json' },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-bad');
    });
  });

  // -----------------------------------------------------------------------
  // 7. Missing required fields
  // -----------------------------------------------------------------------

  describe('missing required fields', () => {
    it('should report record as failed when id is missing', async () => {
      const handler = createAuditHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-id',
          body: JSON.stringify({ type: 'test', detail: {} }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-no-id');
    });

    it('should report record as failed when type is missing', async () => {
      const handler = createAuditHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-type',
          body: JSON.stringify({ id: 'evt-1', detail: {} }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-no-type');
    });

    it('should report record as failed when detail is missing', async () => {
      const handler = createAuditHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-detail',
          body: JSON.stringify({ id: 'evt-1', type: 'test' }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-no-detail');
    });
  });

  // -----------------------------------------------------------------------
  // 8. Service error handling
  // -----------------------------------------------------------------------

  describe('service error handling', () => {
    it('should report record as failed when auditService.recordAction throws', async () => {
      (auditService.recordAction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('DynamoDB write failed'),
      );
      const handler = createAuditHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-1');
    });

    it('should continue processing remaining records after a service error', async () => {
      (auditService.recordAction as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Service error'))
        .mockResolvedValueOnce('audit-id-ok');
      const handler = createAuditHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-fail', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-fail' })) },
        { messageId: 'msg-ok', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-ok' })) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-fail');
      expect(auditService.recordAction).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Multiple records — batch processing
  // -----------------------------------------------------------------------

  describe('batch processing', () => {
    it('should process multiple valid records successfully', async () => {
      const handler = createAuditHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-1' })) },
        { messageId: 'msg-2', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-2' })) },
        { messageId: 'msg-3', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-3' })) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(auditService.recordAction).toHaveBeenCalledTimes(3);
    });

    it('should return empty batchItemFailures for empty Records array', async () => {
      const handler = createAuditHandler(config);
      const event: SQSEvent = { Records: [] };

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
    });
  });
});
