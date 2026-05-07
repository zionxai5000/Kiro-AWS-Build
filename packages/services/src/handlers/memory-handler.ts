/**
 * Memory Lambda Event Handler — processes memory events from SQS memory queue.
 *
 * Parses SQS records containing SeraphimEvent payloads, delegates to
 * ZikaronService for storing memory entries. For episodic entries,
 * ZikaronService.storeEpisodic() automatically triggers entity extraction
 * into semantic memory (Req 4.3).
 *
 * Requirements: 6.1, 6.2, 4.3
 */

import type {
  SeraphimEvent,
  ZikaronService,
  EpisodicEntry,
  SemanticEntry,
  ProceduralEntry,
  WorkingMemoryContext,
  MemoryLayer,
} from '@seraphim/core';

import type { SQSEvent, SQSRecord, SQSBatchResponse } from './audit-handler.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface MemoryHandlerConfig {
  /** Zikaron memory service instance */
  memoryService: ZikaronService;
  /** Set of already-processed event IDs for deduplication */
  processedEventIds?: Set<string>;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Create an SQS Lambda handler for memory events.
 *
 * Each SQS record body is expected to be a JSON-serialized SeraphimEvent
 * with memory entry data in the `detail` field.
 *
 * The handler is idempotent: duplicate events (same `id`) are safely skipped.
 * Partial batch failure reporting ensures only failed records are retried.
 */
export function createMemoryHandler(config: MemoryHandlerConfig) {
  const { memoryService } = config;
  const processedIds = config.processedEventIds ?? new Set<string>();

  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: Array<{ itemIdentifier: string }> = [];

    for (const record of event.Records) {
      try {
        const seraphimEvent = parseEventBody(record.body);

        // Idempotency check — skip already-processed events
        if (processedIds.has(seraphimEvent.id)) {
          continue;
        }

        const detail = seraphimEvent.detail;
        const layer = resolveMemoryLayer(seraphimEvent);

        switch (layer) {
          case 'episodic': {
            const entry = buildEpisodicEntry(detail, seraphimEvent);
            await memoryService.storeEpisodic(entry);
            break;
          }
          case 'semantic': {
            const entry = buildSemanticEntry(detail, seraphimEvent);
            await memoryService.storeSemantic(entry);
            break;
          }
          case 'procedural': {
            const entry = buildProceduralEntry(detail, seraphimEvent);
            await memoryService.storeProcedural(entry);
            break;
          }
          case 'working': {
            const agentId = (detail.agentId as string) ?? (detail.sourceAgentId as string) ?? '';
            const context = buildWorkingMemoryContext(detail, seraphimEvent);
            await memoryService.storeWorking(agentId, context);
            break;
          }
          default: {
            console.warn(
              `[memory-handler] Unknown memory layer '${layer}' for event ${seraphimEvent.id}, defaulting to episodic`,
            );
            const entry = buildEpisodicEntry(detail, seraphimEvent);
            await memoryService.storeEpisodic(entry);
            break;
          }
        }

        // Mark as processed for deduplication
        processedIds.add(seraphimEvent.id);
      } catch (error) {
        console.error(
          `[memory-handler] Failed to process record ${record.messageId}:`,
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

function parseEventBody(body: string): SeraphimEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('Invalid JSON in SQS record body');
  }

  const event = parsed as SeraphimEvent;
  if (!event.id || !event.type || !event.detail) {
    throw new Error('SQS record body missing required SeraphimEvent fields (id, type, detail)');
  }

  return event;
}

/**
 * Determine the memory layer from the event type or detail.
 */
function resolveMemoryLayer(event: SeraphimEvent): MemoryLayer {
  const detail = event.detail;

  // Check explicit layer in detail
  if (detail.layer && typeof detail.layer === 'string') {
    const layer = detail.layer as string;
    if (['episodic', 'semantic', 'procedural', 'working'].includes(layer)) {
      return layer as MemoryLayer;
    }
  }

  // Infer from event type
  if (event.type.includes('episodic')) return 'episodic';
  if (event.type.includes('semantic')) return 'semantic';
  if (event.type.includes('procedural')) return 'procedural';
  if (event.type.includes('working')) return 'working';

  // Default to episodic
  return 'episodic';
}

function buildEpisodicEntry(
  detail: Record<string, unknown>,
  event: SeraphimEvent,
): EpisodicEntry {
  return {
    id: (detail.entryId as string) ?? event.id,
    tenantId: (detail.tenantId as string) ?? event.tenantId,
    layer: 'episodic',
    content: (detail.content as string) ?? '',
    embedding: (detail.embedding as number[]) ?? [],
    sourceAgentId: (detail.sourceAgentId as string) ?? '',
    tags: (detail.tags as string[]) ?? [],
    createdAt: new Date(),
    eventType: (detail.eventType as string) ?? event.type,
    participants: (detail.participants as string[]) ?? [],
    outcome: (detail.outcome as EpisodicEntry['outcome']) ?? 'success',
    relatedEntities: (detail.relatedEntities as EpisodicEntry['relatedEntities']) ?? [],
  };
}

function buildSemanticEntry(
  detail: Record<string, unknown>,
  event: SeraphimEvent,
): SemanticEntry {
  return {
    id: (detail.entryId as string) ?? event.id,
    tenantId: (detail.tenantId as string) ?? event.tenantId,
    layer: 'semantic',
    content: (detail.content as string) ?? '',
    embedding: (detail.embedding as number[]) ?? [],
    sourceAgentId: (detail.sourceAgentId as string) ?? '',
    tags: (detail.tags as string[]) ?? [],
    createdAt: new Date(),
    entityType: (detail.entityType as string) ?? '',
    relationships: (detail.relationships as SemanticEntry['relationships']) ?? [],
    confidence: (detail.confidence as number) ?? 0.5,
    source: (detail.source as SemanticEntry['source']) ?? 'extracted',
  };
}

function buildProceduralEntry(
  detail: Record<string, unknown>,
  event: SeraphimEvent,
): ProceduralEntry {
  return {
    id: (detail.entryId as string) ?? event.id,
    tenantId: (detail.tenantId as string) ?? event.tenantId,
    layer: 'procedural',
    content: (detail.content as string) ?? '',
    embedding: (detail.embedding as number[]) ?? [],
    sourceAgentId: (detail.sourceAgentId as string) ?? '',
    tags: (detail.tags as string[]) ?? [],
    createdAt: new Date(),
    workflowPattern: (detail.workflowPattern as string) ?? '',
    successRate: (detail.successRate as number) ?? 0,
    executionCount: (detail.executionCount as number) ?? 0,
    prerequisites: (detail.prerequisites as string[]) ?? [],
    steps: (detail.steps as ProceduralEntry['steps']) ?? [],
  };
}

function buildWorkingMemoryContext(
  detail: Record<string, unknown>,
  event: SeraphimEvent,
): WorkingMemoryContext {
  return {
    id: (detail.entryId as string) ?? event.id,
    tenantId: (detail.tenantId as string) ?? event.tenantId,
    layer: 'working',
    content: (detail.content as string) ?? '',
    embedding: (detail.embedding as number[]) ?? [],
    sourceAgentId: (detail.sourceAgentId as string) ?? '',
    tags: (detail.tags as string[]) ?? [],
    createdAt: new Date(),
    agentId: (detail.agentId as string) ?? '',
    sessionId: (detail.sessionId as string) ?? '',
    taskContext: (detail.taskContext as Record<string, unknown>) ?? {},
    conversationHistory:
      (detail.conversationHistory as WorkingMemoryContext['conversationHistory']) ?? [],
    activeGoals: (detail.activeGoals as string[]) ?? [],
  };
}
