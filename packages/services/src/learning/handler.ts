/**
 * Learning Engine Event Handler
 *
 * Processes learning events from SQS learning queue.
 * - On `agent.task.failed`: trigger analyzeFailure(), if recurring pattern detected trigger generateFix()
 * - On `agent.task.completed`: record ModelPerformanceRecord for model router learning
 * - On `learning.pattern.detected`: notify dashboard and log to audit
 *
 * Requirements: 8.1, 8.2, 8.3
 */

import type { LearningEngine, FailureEvent } from './engine.js';
import type { EventBusService } from '@seraphim/core';
import type { ModelPerformanceRecord, TaskType } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningEvent {
  id: string;
  type: 'agent.task.failed' | 'agent.task.completed' | 'learning.pattern.detected';
  data: Record<string, unknown>;
  timestamp: string;
}

export interface LearningHandlerConfig {
  engine: LearningEngine;
  eventBus?: EventBusService;
  /** Set of already-processed event IDs for deduplication */
  processedEventIds?: Set<string>;
}

export interface SQSEvent {
  Records: SQSRecord[];
}

export interface SQSRecord {
  messageId: string;
  body: string;
}

export interface SQSBatchResponse {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

// ---------------------------------------------------------------------------
// Handler Class (for direct use)
// ---------------------------------------------------------------------------

export class LearningEventHandler {
  private readonly processedIds: Set<string>;
  private readonly engine: LearningEngine;
  private readonly eventBus?: EventBusService;

  constructor(config: LearningHandlerConfig) {
    this.engine = config.engine;
    this.eventBus = config.eventBus;
    this.processedIds = config.processedEventIds ?? new Set<string>();
  }

  async handle(event: LearningEvent): Promise<void> {
    // Idempotency check
    if (this.processedIds.has(event.id)) return;
    this.processedIds.add(event.id);

    switch (event.type) {
      case 'agent.task.failed':
        await this.handleTaskFailed(event);
        break;
      case 'agent.task.completed':
        await this.handleTaskCompleted(event);
        break;
      case 'learning.pattern.detected':
        await this.handlePatternDetected(event);
        break;
    }
  }

  /**
   * On agent.task.failed: trigger analyzeFailure(), if recurring pattern
   * detected trigger generateFix().
   *
   * Requirement 8.1: Automated root cause analysis.
   * Requirement 8.2: Generate fix for recurring patterns.
   */
  private async handleTaskFailed(event: LearningEvent): Promise<void> {
    const failure: FailureEvent = {
      id: event.id,
      agentId: (event.data.agentId as string) ?? 'unknown',
      taskType: (event.data.taskType as string) ?? 'unknown',
      errorMessage: (event.data.errorMessage as string) ?? 'Unknown error',
      errorCode: event.data.errorCode as string | undefined,
      context: event.data,
      occurredAt: event.timestamp,
    };

    const pattern = await this.engine.analyzeFailure(failure);

    // If recurring pattern detected (occurrence > 1), generate a fix
    if (pattern && pattern.occurrenceCount > 1) {
      await this.engine.generateFix(pattern);
    }
  }

  /**
   * On agent.task.completed: record ModelPerformanceRecord for model router learning.
   *
   * Requirement 8.6: Feed performance data back for behavioral modifications.
   */
  private async handleTaskCompleted(event: LearningEvent): Promise<void> {
    const record: ModelPerformanceRecord = {
      taskType: (event.data.taskType as TaskType) ?? 'general',
      complexity: (event.data.complexity as 'low' | 'medium' | 'high') ?? 'medium',
      model: (event.data.model as string) ?? 'unknown',
      tier: (event.data.tier as 1 | 2 | 3) ?? 2,
      success: (event.data.success as boolean) ?? true,
      qualityScore: (event.data.qualityScore as number) ?? 0.8,
      latencyMs: (event.data.latencyMs as number) ?? 0,
      tokenCost: (event.data.tokenCost as number) ?? 0,
      agentId: (event.data.agentId as string) ?? 'unknown',
      pillar: (event.data.pillar as string) ?? 'unknown',
      timestamp: new Date(event.timestamp),
    };

    this.engine.recordPerformance(record);
  }

  /**
   * On learning.pattern.detected: notify dashboard and log to audit.
   *
   * Requirement 8.2: Pattern detection triggers notifications.
   */
  private async handlePatternDetected(event: LearningEvent): Promise<void> {
    if (!this.eventBus) return;

    // Notify dashboard via event bus
    await this.eventBus.publish({
      source: 'seraphim.learning-engine',
      type: 'learning.pattern.notification',
      detail: {
        patternId: event.data.patternId,
        rootCause: event.data.rootCause,
        occurrenceCount: event.data.occurrenceCount,
        severity: event.data.severity ?? 'medium',
      },
      metadata: {
        tenantId: 'system',
        correlationId: event.id,
        timestamp: new Date(),
      },
    });

    // Log to audit via event bus
    await this.eventBus.publish({
      source: 'seraphim.learning-engine',
      type: 'audit.learning.pattern_detected',
      detail: {
        eventId: event.id,
        patternId: event.data.patternId,
        rootCause: event.data.rootCause,
        occurrenceCount: event.data.occurrenceCount,
        affectedAgents: event.data.affectedAgents,
        timestamp: event.timestamp,
      },
      metadata: {
        tenantId: 'system',
        correlationId: event.id,
        timestamp: new Date(),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// SQS Lambda Handler Factory
// ---------------------------------------------------------------------------

/**
 * Create an SQS Lambda handler for learning events.
 *
 * Each SQS record body is expected to be a JSON-serialized LearningEvent.
 * The handler is idempotent: duplicate events (same `id`) are safely skipped.
 * Partial batch failure reporting ensures only failed records are retried.
 */
export function createLearningHandler(config: LearningHandlerConfig) {
  const handler = new LearningEventHandler(config);

  return async (sqsEvent: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: Array<{ itemIdentifier: string }> = [];

    for (const record of sqsEvent.Records) {
      try {
        const learningEvent = parseLearningEvent(record.body);
        await handler.handle(learningEvent);
      } catch (error) {
        console.error(
          `[learning-handler] Failed to process record ${record.messageId}:`,
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

function parseLearningEvent(body: string): LearningEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('Invalid JSON in SQS record body');
  }

  const event = parsed as LearningEvent;
  if (!event.id || !event.type || !event.data) {
    throw new Error('SQS record body missing required LearningEvent fields (id, type, data)');
  }

  return event;
}
