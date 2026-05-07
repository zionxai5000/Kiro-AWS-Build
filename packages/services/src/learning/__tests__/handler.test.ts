/**
 * Unit tests for Learning Engine Event Handler
 * Validates: Requirements 8.1, 8.2, 8.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LearningEventHandler, createLearningHandler } from '../handler.js';
import type { LearningEvent } from '../handler.js';
import { LearningEngine } from '../engine.js';
import type { ZikaronService, EventBusService } from '@seraphim/core';

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue('entry-1'),
    storeSemantic: vi.fn().mockResolvedValue('entry-2'),
    storeProcedural: vi.fn().mockResolvedValue('entry-3'),
    storeWorking: vi.fn().mockResolvedValue('entry-4'),
    query: vi.fn().mockResolvedValue([]),
    queryByAgent: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({ working: [], episodic: [], procedural: [] }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  } as unknown as ZikaronService;
}

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-1'),
    publishBatch: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue('sub-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventBusService;
}

describe('LearningEventHandler', () => {
  let handler: LearningEventHandler;
  let engine: LearningEngine;
  let mockZikaron: ZikaronService;
  let mockEventBus: EventBusService;

  beforeEach(() => {
    mockZikaron = createMockZikaron();
    mockEventBus = createMockEventBus();
    engine = new LearningEngine({
      zikaronService: mockZikaron,
      eventBus: mockEventBus,
    });
    handler = new LearningEventHandler({
      engine,
      eventBus: mockEventBus,
    });
  });

  describe('agent.task.failed events', () => {
    it('should trigger analyzeFailure on task failed events', async () => {
      const event: LearningEvent = {
        id: 'evt-1',
        type: 'agent.task.failed',
        data: {
          agentId: 'agent-1',
          taskType: 'code_generation',
          errorMessage: 'Token limit exceeded',
          errorCode: 'TOKEN_LIMIT',
        },
        timestamp: new Date().toISOString(),
      };

      await handler.handle(event);

      // Should have queried Zikaron for similar failures
      expect(mockZikaron.query).toHaveBeenCalled();
      // Should have stored the failure in episodic memory
      expect(mockZikaron.storeEpisodic).toHaveBeenCalled();
    });

    it('should trigger generateFix when recurring pattern detected', async () => {
      const event1: LearningEvent = {
        id: 'evt-1',
        type: 'agent.task.failed',
        data: {
          agentId: 'agent-1',
          taskType: 'code_generation',
          errorMessage: 'Token limit exceeded',
          errorCode: 'TOKEN_LIMIT',
        },
        timestamp: new Date().toISOString(),
      };

      const event2: LearningEvent = {
        id: 'evt-2',
        type: 'agent.task.failed',
        data: {
          agentId: 'agent-2',
          taskType: 'code_generation',
          errorMessage: 'Token limit exceeded',
          errorCode: 'TOKEN_LIMIT',
        },
        timestamp: new Date().toISOString(),
      };

      await handler.handle(event1);
      await handler.handle(event2);

      // After second occurrence, a fix should have been generated
      const metrics = engine.getImprovementMetrics();
      expect(metrics.totalPatternsDetected).toBe(1);
    });
  });

  describe('agent.task.completed events', () => {
    it('should record ModelPerformanceRecord for model router learning', async () => {
      const event: LearningEvent = {
        id: 'evt-1',
        type: 'agent.task.completed',
        data: {
          agentId: 'agent-1',
          taskType: 'code_generation',
          complexity: 'medium',
          model: 'claude-sonnet',
          tier: 2,
          success: true,
          qualityScore: 0.9,
          latencyMs: 2000,
          tokenCost: 0.05,
          pillar: 'zionx',
        },
        timestamp: new Date().toISOString(),
      };

      await handler.handle(event);

      // Verify performance was recorded by aggregating
      const weights = engine.aggregateModelPerformance();
      expect(weights.length).toBe(1);
      expect(weights[0].model).toBe('claude-sonnet');
      expect(weights[0].avgQuality).toBeCloseTo(0.9);
    });
  });

  describe('learning.pattern.detected events', () => {
    it('should notify dashboard via event bus', async () => {
      const event: LearningEvent = {
        id: 'evt-1',
        type: 'learning.pattern.detected',
        data: {
          patternId: 'pattern-1',
          rootCause: 'TOKEN_LIMIT',
          occurrenceCount: 5,
          severity: 'high',
          affectedAgents: ['agent-1', 'agent-2'],
        },
        timestamp: new Date().toISOString(),
      };

      await handler.handle(event);

      // Should publish notification event
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.learning-engine',
          type: 'learning.pattern.notification',
          detail: expect.objectContaining({
            patternId: 'pattern-1',
            rootCause: 'TOKEN_LIMIT',
          }),
        }),
      );
    });

    it('should log to audit via event bus', async () => {
      const event: LearningEvent = {
        id: 'evt-1',
        type: 'learning.pattern.detected',
        data: {
          patternId: 'pattern-1',
          rootCause: 'TOKEN_LIMIT',
          occurrenceCount: 5,
          affectedAgents: ['agent-1'],
        },
        timestamp: new Date().toISOString(),
      };

      await handler.handle(event);

      // Should publish audit event
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.learning-engine',
          type: 'audit.learning.pattern_detected',
        }),
      );
    });
  });

  describe('idempotency', () => {
    it('should skip duplicate events', async () => {
      const event: LearningEvent = {
        id: 'evt-duplicate',
        type: 'agent.task.failed',
        data: {
          agentId: 'agent-1',
          taskType: 'code_generation',
          errorMessage: 'Error',
        },
        timestamp: new Date().toISOString(),
      };

      await handler.handle(event);
      await handler.handle(event); // Duplicate

      // Should only have been processed once
      expect(mockZikaron.storeEpisodic).toHaveBeenCalledTimes(1);
    });
  });

  describe('createLearningHandler (SQS Lambda)', () => {
    it('should process SQS records and return batch response', async () => {
      const sqsHandler = createLearningHandler({
        engine,
        eventBus: mockEventBus,
      });

      const sqsEvent = {
        Records: [
          {
            messageId: 'msg-1',
            body: JSON.stringify({
              id: 'evt-1',
              type: 'agent.task.failed',
              data: {
                agentId: 'agent-1',
                taskType: 'code_generation',
                errorMessage: 'Error',
              },
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      };

      const result = await sqsHandler(sqsEvent);
      expect(result.batchItemFailures).toHaveLength(0);
    });

    it('should report failed records in batch response', async () => {
      const sqsHandler = createLearningHandler({
        engine,
        eventBus: mockEventBus,
      });

      const sqsEvent = {
        Records: [
          {
            messageId: 'msg-1',
            body: 'invalid json{{{',
          },
        ],
      };

      const result = await sqsHandler(sqsEvent);
      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-1');
    });
  });
});
