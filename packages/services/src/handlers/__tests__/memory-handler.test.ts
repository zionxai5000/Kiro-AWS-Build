/**
 * Unit tests for the Memory Lambda Event Handler (createMemoryHandler).
 *
 * Validates: Requirements 6.1, 6.2, 19.1
 *
 * - 6.1: Deliver messages between system components with at-least-once delivery
 * - 6.2: Route undeliverable messages to dead-letter queue after retry exhaustion
 *         (partial batch failure reporting via batchItemFailures)
 * - 19.1: Test suite validates handler behavior before deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryHandler } from '../memory-handler.js';
import type { MemoryHandlerConfig } from '../memory-handler.js';
import type { SQSEvent } from '../audit-handler.js';
import type { ZikaronService } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockMemoryService(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('mem-ep-1'),
    storeSemantic: vi.fn().mockResolvedValue('mem-sem-1'),
    storeProcedural: vi.fn().mockResolvedValue('mem-proc-1'),
    storeWorking: vi.fn().mockResolvedValue('mem-work-1'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({
      agentId: '',
      workingMemory: null,
      recentEpisodic: [],
      proceduralPatterns: [],
    }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSeraphimEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt-mem-001',
    source: 'seraphim.zikaron',
    type: 'memory.episodic.store',
    version: '1.0',
    time: new Date().toISOString(),
    tenantId: 'tenant-1',
    correlationId: 'corr-1',
    detail: {
      layer: 'episodic',
      tenantId: 'tenant-1',
      sourceAgentId: 'agent-1',
      content: 'Agent completed task successfully',
      embedding: [0.1, 0.2, 0.3],
      tags: ['task', 'success'],
      eventType: 'task.completed',
      participants: ['agent-1'],
      outcome: 'success',
      relatedEntities: [],
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

describe('createMemoryHandler', () => {
  let memoryService: ZikaronService;
  let config: MemoryHandlerConfig;

  beforeEach(() => {
    memoryService = createMockMemoryService();
    config = { memoryService, processedEventIds: new Set<string>() };
  });

  // -----------------------------------------------------------------------
  // 1. Episodic memory storage
  // -----------------------------------------------------------------------

  describe('episodic memory events', () => {
    it('should call storeEpisodic for episodic layer events', async () => {
      const handler = createMemoryHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(memoryService.storeEpisodic).toHaveBeenCalledTimes(1);
    });

    it('should infer episodic layer from event type containing "episodic"', async () => {
      const handler = createMemoryHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        type: 'memory.episodic.store',
        detail: {
          tenantId: 'tenant-1',
          sourceAgentId: 'agent-1',
          content: 'test',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      expect(memoryService.storeEpisodic).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Semantic memory storage
  // -----------------------------------------------------------------------

  describe('semantic memory events', () => {
    it('should call storeSemantic for semantic layer events', async () => {
      const handler = createMemoryHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        id: 'evt-sem-1',
        type: 'memory.semantic.store',
        detail: {
          layer: 'semantic',
          tenantId: 'tenant-1',
          sourceAgentId: 'agent-1',
          content: 'Entity: User123 is a premium customer',
          entityType: 'customer',
          relationships: [],
          confidence: 0.9,
          source: 'extracted',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(memoryService.storeSemantic).toHaveBeenCalledTimes(1);
      expect(memoryService.storeEpisodic).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Procedural memory storage
  // -----------------------------------------------------------------------

  describe('procedural memory events', () => {
    it('should call storeProcedural for procedural layer events', async () => {
      const handler = createMemoryHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        id: 'evt-proc-1',
        type: 'memory.procedural.store',
        detail: {
          layer: 'procedural',
          tenantId: 'tenant-1',
          sourceAgentId: 'agent-1',
          content: 'Workflow pattern: app submission',
          workflowPattern: 'app-submission',
          successRate: 0.85,
          executionCount: 10,
          prerequisites: ['build-complete'],
          steps: [],
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(memoryService.storeProcedural).toHaveBeenCalledTimes(1);
      expect(memoryService.storeEpisodic).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Working memory storage
  // -----------------------------------------------------------------------

  describe('working memory events', () => {
    it('should call storeWorking for working layer events', async () => {
      const handler = createMemoryHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        id: 'evt-work-1',
        type: 'memory.working.store',
        detail: {
          layer: 'working',
          tenantId: 'tenant-1',
          agentId: 'agent-1',
          sourceAgentId: 'agent-1',
          content: 'Current task context',
          sessionId: 'session-1',
          taskContext: { currentStep: 'analysis' },
          conversationHistory: [],
          activeGoals: ['complete-analysis'],
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(memoryService.storeWorking).toHaveBeenCalledTimes(1);
      expect(memoryService.storeEpisodic).not.toHaveBeenCalled();
    });

    it('should pass agentId as first argument to storeWorking', async () => {
      const handler = createMemoryHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        id: 'evt-work-2',
        type: 'memory.working.store',
        detail: {
          layer: 'working',
          tenantId: 'tenant-1',
          agentId: 'agent-42',
          sourceAgentId: 'agent-42',
          content: 'Working context',
          sessionId: 'session-2',
          taskContext: {},
          conversationHistory: [],
          activeGoals: [],
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      await handler(event);

      const storeWorkingMock = memoryService.storeWorking as ReturnType<typeof vi.fn>;
      expect(storeWorkingMock.mock.calls[0][0]).toBe('agent-42');
    });
  });

  // -----------------------------------------------------------------------
  // 5. Default to episodic for unknown layer
  // -----------------------------------------------------------------------

  describe('unknown layer fallback', () => {
    it('should default to storeEpisodic for unknown layer values', async () => {
      const handler = createMemoryHandler(config);
      const seraphimEvent = makeSeraphimEvent({
        id: 'evt-unknown-1',
        type: 'memory.store',
        detail: {
          layer: 'unknown-layer',
          tenantId: 'tenant-1',
          sourceAgentId: 'agent-1',
          content: 'Some content',
        },
      });
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(seraphimEvent) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(memoryService.storeEpisodic).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Idempotency — duplicate events are safely ignored
  // -----------------------------------------------------------------------

  describe('idempotency', () => {
    it('should skip duplicate events with the same id', async () => {
      const handler = createMemoryHandler(config);
      const body = JSON.stringify(makeSeraphimEvent({ id: 'dup-mem-1' }));
      const event = makeSQSEvent([
        { messageId: 'msg-1', body },
        { messageId: 'msg-2', body },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(memoryService.storeEpisodic).toHaveBeenCalledTimes(1);
    });

    it('should skip events already in processedEventIds', async () => {
      config.processedEventIds!.add('already-processed');
      const handler = createMemoryHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-1',
          body: JSON.stringify(makeSeraphimEvent({ id: 'already-processed' })),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(memoryService.storeEpisodic).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Partial batch failure — batchItemFailures reporting
  // -----------------------------------------------------------------------

  describe('partial batch failure', () => {
    it('should report only failed records in batchItemFailures', async () => {
      const handler = createMemoryHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-good', body: JSON.stringify(makeSeraphimEvent({ id: 'good-1' })) },
        { messageId: 'msg-bad', body: 'not-json' },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-bad');
      expect(memoryService.storeEpisodic).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Invalid JSON body handling
  // -----------------------------------------------------------------------

  describe('invalid JSON body', () => {
    it('should report record as failed when body is not valid JSON', async () => {
      const handler = createMemoryHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-bad', body: '{{broken' },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-bad');
    });
  });

  // -----------------------------------------------------------------------
  // 9. Missing required fields
  // -----------------------------------------------------------------------

  describe('missing required fields', () => {
    it('should report record as failed when id is missing', async () => {
      const handler = createMemoryHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-id',
          body: JSON.stringify({ type: 'memory.store', detail: { layer: 'episodic' } }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-no-id');
    });

    it('should report record as failed when type is missing', async () => {
      const handler = createMemoryHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-type',
          body: JSON.stringify({ id: 'evt-1', detail: { layer: 'episodic' } }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
    });

    it('should report record as failed when detail is missing', async () => {
      const handler = createMemoryHandler(config);
      const event = makeSQSEvent([
        {
          messageId: 'msg-no-detail',
          body: JSON.stringify({ id: 'evt-1', type: 'memory.store' }),
        },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // 10. Service error handling
  // -----------------------------------------------------------------------

  describe('service error handling', () => {
    it('should report record as failed when memoryService throws', async () => {
      (memoryService.storeEpisodic as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Aurora connection failed'),
      );
      const handler = createMemoryHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent()) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-1');
    });

    it('should continue processing remaining records after a service error', async () => {
      (memoryService.storeEpisodic as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Service error'))
        .mockResolvedValueOnce('mem-ok');
      const handler = createMemoryHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-fail', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-fail' })) },
        { messageId: 'msg-ok', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-ok' })) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-fail');
      expect(memoryService.storeEpisodic).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 11. Batch processing
  // -----------------------------------------------------------------------

  describe('batch processing', () => {
    it('should process multiple valid records successfully', async () => {
      const handler = createMemoryHandler(config);
      const event = makeSQSEvent([
        { messageId: 'msg-1', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-1' })) },
        { messageId: 'msg-2', body: JSON.stringify(makeSeraphimEvent({ id: 'evt-2' })) },
      ]);

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
      expect(memoryService.storeEpisodic).toHaveBeenCalledTimes(2);
    });

    it('should return empty batchItemFailures for empty Records array', async () => {
      const handler = createMemoryHandler(config);
      const event: SQSEvent = { Records: [] };

      const result = await handler(event);

      expect(result.batchItemFailures).toHaveLength(0);
    });
  });
});
