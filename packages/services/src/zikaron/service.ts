/**
 * Zikaron Memory Service — 4-layer persistent memory with vector search.
 *
 * Implements the ZikaronService interface from @seraphim/core.
 * Uses Aurora PostgreSQL with pgvector for vector similarity search,
 * and generates embeddings via the LLM provider (text-embedding-3-small, 1536 dimensions).
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

import { randomUUID } from 'node:crypto';

import type {
  ZikaronService,
  EventBusService,
} from '@seraphim/core';
import type {
  EpisodicEntry,
  SemanticEntry,
  ProceduralEntry,
  WorkingMemoryContext,
  MemoryQuery,
  MemoryResult,
  AgentMemoryContext,
  ConflictMetadata,
  EntityReference,
  Relationship,
} from '@seraphim/core';
import type { MemoryLayer, SystemEvent } from '@seraphim/core';
import type { MemoryRepository, MemoryEntryRow } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Embedding Provider Interface
// ---------------------------------------------------------------------------

/**
 * Interface for generating text embeddings.
 * In production, this calls text-embedding-3-small (1536 dimensions) via Otzar.
 */
export interface EmbeddingProvider {
  /**
   * Generate an embedding vector for the given text.
   * Returns a 1536-dimensional float array.
   */
  generateEmbedding(text: string): Promise<number[]>;
}

// ---------------------------------------------------------------------------
// Entity Extractor Interface
// ---------------------------------------------------------------------------

/**
 * Interface for extracting entities and relationships from text.
 * Used by storeEpisodic() to auto-populate semantic memory.
 */
export interface EntityExtractor {
  /**
   * Extract entities and relationships from content.
   */
  extract(content: string): Promise<{
    entities: EntityReference[];
    relationships: Relationship[];
  }>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ZikaronServiceConfig {
  /** Tenant ID for this service instance */
  tenantId: string;

  /** Memory repository for database operations */
  memoryRepository: MemoryRepository;

  /** Embedding provider for generating vector embeddings */
  embeddingProvider: EmbeddingProvider;

  /** Entity extractor for auto-populating semantic memory from episodic entries */
  entityExtractor?: EntityExtractor;

  /** Event Bus service for publishing memory events */
  eventBus?: EventBusService;

  /** Number of days of recent episodic entries to load in agent context (default: 7) */
  recentEpisodicDays?: number;

  /** Number of top procedural patterns to load in agent context (default: 5) */
  topProceduralLimit?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ZikaronServiceImpl implements ZikaronService {
  private readonly config: ZikaronServiceConfig;
  private readonly memoryRepo: MemoryRepository;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly entityExtractor?: EntityExtractor;
  private readonly eventBus?: EventBusService;
  private readonly recentEpisodicDays: number;
  private readonly topProceduralLimit: number;

  constructor(config: ZikaronServiceConfig) {
    this.config = config;
    this.memoryRepo = config.memoryRepository;
    this.embeddingProvider = config.embeddingProvider;
    this.entityExtractor = config.entityExtractor;
    this.eventBus = config.eventBus;
    this.recentEpisodicDays = config.recentEpisodicDays ?? 7;
    this.topProceduralLimit = config.topProceduralLimit ?? 5;
  }

  // -------------------------------------------------------------------------
  // Write — Episodic (Req 4.1, 4.3)
  // -------------------------------------------------------------------------

  /**
   * Store an episodic memory entry with embedding vector.
   *
   * Automatically extracts entities and relationships into semantic memory
   * (Req 4.3: auto-extract entities from episodic to semantic layer).
   */
  async storeEpisodic(entry: EpisodicEntry): Promise<string> {
    // Generate embedding for the content
    const embedding = await this.embeddingProvider.generateEmbedding(entry.content);

    // Build metadata for the episodic entry
    const metadata: Record<string, unknown> = {
      eventType: entry.eventType,
      participants: entry.participants,
      outcome: entry.outcome,
      relatedEntities: entry.relatedEntities,
    };

    // Store the episodic entry
    const row = await this.memoryRepo.createWithEmbedding(this.config.tenantId, {
      tenantId: this.config.tenantId,
      layer: 'episodic',
      content: entry.content,
      embedding,
      sourceAgentId: entry.sourceAgentId,
      tags: entry.tags,
      metadata,
      expiresAt: entry.expiresAt ?? null,
      conflictsWith: entry.conflictsWith ?? null,
    });

    // Auto-extract entities and relationships into semantic memory (Req 4.3)
    await this.extractAndStoreSemanticEntries(entry, embedding);

    // Publish memory event
    await this.publishMemoryEvent('memory.episodic.stored', row.id, 'episodic');

    return row.id;
  }

  // -------------------------------------------------------------------------
  // Write — Semantic (Req 4.1)
  // -------------------------------------------------------------------------

  /**
   * Store a semantic memory entry (facts and relationships) with embedding.
   */
  async storeSemantic(entry: SemanticEntry): Promise<string> {
    // Generate embedding for the content
    const embedding = await this.embeddingProvider.generateEmbedding(entry.content);

    // Build metadata for the semantic entry
    const metadata: Record<string, unknown> = {
      entityType: entry.entityType,
      relationships: entry.relationships,
      confidence: entry.confidence,
      source: entry.source,
    };

    // Store the semantic entry
    const row = await this.memoryRepo.createWithEmbedding(this.config.tenantId, {
      tenantId: this.config.tenantId,
      layer: 'semantic',
      content: entry.content,
      embedding,
      sourceAgentId: entry.sourceAgentId,
      tags: entry.tags,
      metadata,
      expiresAt: entry.expiresAt ?? null,
      conflictsWith: entry.conflictsWith ?? null,
    });

    // Publish memory event
    await this.publishMemoryEvent('memory.semantic.stored', row.id, 'semantic');

    return row.id;
  }

  // -------------------------------------------------------------------------
  // Write — Procedural (Req 4.1, 4.4)
  // -------------------------------------------------------------------------

  /**
   * Store a procedural memory entry (learned workflow patterns) with
   * success rate tracking.
   *
   * Req 4.4: Extract execution patterns and store in procedural memory for reuse.
   */
  async storeProcedural(entry: ProceduralEntry): Promise<string> {
    // Generate embedding for the content
    const embedding = await this.embeddingProvider.generateEmbedding(entry.content);

    // Build metadata including success rate for ranking
    const metadata: Record<string, unknown> = {
      workflowPattern: entry.workflowPattern,
      successRate: entry.successRate,
      executionCount: entry.executionCount,
      prerequisites: entry.prerequisites,
      steps: entry.steps,
    };

    // Store the procedural entry
    const row = await this.memoryRepo.createWithEmbedding(this.config.tenantId, {
      tenantId: this.config.tenantId,
      layer: 'procedural',
      content: entry.content,
      embedding,
      sourceAgentId: entry.sourceAgentId,
      tags: entry.tags,
      metadata,
      expiresAt: entry.expiresAt ?? null,
      conflictsWith: entry.conflictsWith ?? null,
    });

    // Publish memory event
    await this.publishMemoryEvent('memory.procedural.stored', row.id, 'procedural');

    return row.id;
  }

  // -------------------------------------------------------------------------
  // Write — Working (Req 4.1)
  // -------------------------------------------------------------------------

  /**
   * Store active task context per agent session.
   *
   * Working memory is agent-specific and session-scoped. Storing new
   * working memory replaces the previous working memory for the agent.
   */
  async storeWorking(agentId: string, context: WorkingMemoryContext): Promise<string> {
    // Generate embedding for the content
    const embedding = await this.embeddingProvider.generateEmbedding(context.content);

    // Build metadata for the working memory context
    const metadata: Record<string, unknown> = {
      agentId: context.agentId,
      sessionId: context.sessionId,
      taskContext: context.taskContext,
      conversationHistory: context.conversationHistory,
      activeGoals: context.activeGoals,
    };

    // Store the working memory entry
    const row = await this.memoryRepo.createWithEmbedding(this.config.tenantId, {
      tenantId: this.config.tenantId,
      layer: 'working',
      content: context.content,
      embedding,
      sourceAgentId: agentId,
      tags: context.tags,
      metadata,
      expiresAt: context.expiresAt ?? null,
      conflictsWith: context.conflictsWith ?? null,
    });

    // Publish memory event
    await this.publishMemoryEvent('memory.working.stored', row.id, 'working');

    return row.id;
  }

  // -------------------------------------------------------------------------
  // Search — Vector Similarity (Req 4.2)
  // -------------------------------------------------------------------------

  /**
   * Vector similarity search using pgvector `<=>` operator (cosine distance).
   *
   * Filters by tenant_id, layer, agent, and date range. Returns results
   * sorted by similarity score.
   *
   * Req 4.2: Return semantically relevant results using vector similarity
   * search across all four memory layers.
   */
  async query(request: MemoryQuery): Promise<MemoryResult[]> {
    // Generate embedding for the query text
    const embedding = await this.embeddingProvider.generateEmbedding(request.text);

    // Execute vector similarity search
    const results = await this.memoryRepo.searchSimilar(
      request.tenantId,
      {
        embedding,
        layers: request.layers,
        agentId: request.agentId,
        dateRange: request.dateRange,
        limit: request.limit ?? 10,
      },
    );

    // Map to MemoryResult
    return results.map((result) => this.toMemoryResult(result.entry, result.similarity));
  }

  /**
   * Query memory by agent with optional layer filtering.
   *
   * Req 4.6: Support cross-agent memory queries within the same tenant.
   */
  async queryByAgent(
    agentId: string,
    queryText: string,
    layers?: MemoryLayer[],
  ): Promise<MemoryResult[]> {
    return this.query({
      text: queryText,
      tenantId: this.config.tenantId,
      agentId,
      layers,
      limit: 10,
    });
  }

  // -------------------------------------------------------------------------
  // Session — Load Agent Context (Req 4.5)
  // -------------------------------------------------------------------------

  /**
   * Load agent's working memory, recent episodic entries (last 7 days),
   * and applicable procedural patterns (top 5 by success rate).
   *
   * Req 4.5: When an agent starts a new session, load relevant working memory,
   * recent episodic context, and applicable procedural patterns.
   */
  async loadAgentContext(agentId: string): Promise<AgentMemoryContext> {
    const tenantId = this.config.tenantId;

    // Load working memory (latest entry for this agent)
    const workingRow = await this.memoryRepo.findWorkingMemory(tenantId, agentId);

    // Load recent episodic entries (last N days)
    const since = new Date();
    since.setDate(since.getDate() - this.recentEpisodicDays);
    const recentEpisodicRows = await this.memoryRepo.findRecentEpisodic(
      tenantId,
      since,
      50,
    );

    // Load top procedural patterns by success rate
    const proceduralRows = await this.memoryRepo.findTopProcedural(
      tenantId,
      this.topProceduralLimit,
    );

    return {
      agentId,
      workingMemory: workingRow ? this.rowToWorkingMemory(workingRow) : null,
      recentEpisodic: recentEpisodicRows.map((row) => this.rowToEpisodicEntry(row)),
      proceduralPatterns: proceduralRows.map((row) => this.rowToProceduralEntry(row)),
    };
  }

  // -------------------------------------------------------------------------
  // Conflict — Flag Conflicts (Req 4.7)
  // -------------------------------------------------------------------------

  /**
   * Mark conflicting entries with metadata, retaining both entries.
   *
   * Req 4.7: When a memory entry conflicts with an existing entry,
   * flag the conflict and retain both entries with metadata indicating
   * the conflict.
   */
  async flagConflict(
    entryId: string,
    conflictingEntryId: string,
    metadata: ConflictMetadata,
  ): Promise<void> {
    const tenantId = this.config.tenantId;

    // Flag both entries as conflicting with each other
    await this.memoryRepo.flagConflict(tenantId, entryId, conflictingEntryId);
    await this.memoryRepo.flagConflict(tenantId, conflictingEntryId, entryId);

    // Publish conflict event
    await this.publishConflictEvent(entryId, conflictingEntryId, metadata);
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Extract entities and relationships from an episodic entry and store
   * them as semantic memory entries.
   *
   * Req 4.3: Automatically extract and store entities and relationships
   * in semantic memory when an event is recorded in episodic memory.
   */
  private async extractAndStoreSemanticEntries(
    entry: EpisodicEntry,
    sourceEmbedding: number[],
  ): Promise<void> {
    if (!this.entityExtractor) return;

    try {
      const { entities, relationships } = await this.entityExtractor.extract(entry.content);

      if (entities.length === 0 && relationships.length === 0) return;

      // Create a semantic entry for the extracted knowledge
      const semanticContent = this.buildSemanticContent(entities, relationships);
      const embedding = await this.embeddingProvider.generateEmbedding(semanticContent);

      const metadata: Record<string, unknown> = {
        entityType: 'extracted_knowledge',
        relationships,
        confidence: 0.8, // auto-extracted entries have moderate confidence
        source: 'extracted',
        sourceEpisodicId: entry.id,
      };

      await this.memoryRepo.createWithEmbedding(this.config.tenantId, {
        tenantId: this.config.tenantId,
        layer: 'semantic',
        content: semanticContent,
        embedding,
        sourceAgentId: entry.sourceAgentId,
        tags: [...entry.tags, 'auto-extracted'],
        metadata,
        expiresAt: null,
        conflictsWith: null,
      });
    } catch {
      // Entity extraction failure should not block episodic storage.
      // The episodic entry is already persisted.
    }
  }

  /**
   * Build a human-readable content string from extracted entities and relationships.
   */
  private buildSemanticContent(
    entities: EntityReference[],
    relationships: Relationship[],
  ): string {
    const parts: string[] = [];

    if (entities.length > 0) {
      const entityDescriptions = entities.map(
        (e) => `${e.entityType}:${e.entityId} (${e.role})`,
      );
      parts.push(`Entities: ${entityDescriptions.join(', ')}`);
    }

    if (relationships.length > 0) {
      const relDescriptions = relationships.map(
        (r) => `${r.subjectId} ${r.predicate} ${r.objectId}`,
      );
      parts.push(`Relationships: ${relDescriptions.join('; ')}`);
    }

    return parts.join('. ');
  }

  /**
   * Publish a memory event to the Event Bus.
   */
  private async publishMemoryEvent(
    eventType: string,
    entryId: string,
    layer: MemoryLayer,
  ): Promise<void> {
    if (!this.eventBus) return;

    const event: SystemEvent = {
      source: 'seraphim.zikaron',
      type: eventType,
      detail: {
        entryId,
        layer,
        tenantId: this.config.tenantId,
      },
      metadata: {
        tenantId: this.config.tenantId,
        correlationId: entryId,
        timestamp: new Date(),
      },
    };

    try {
      await this.eventBus.publish(event);
    } catch {
      // Event publishing failure should not block memory operations.
    }
  }

  /**
   * Publish a conflict detection event.
   */
  private async publishConflictEvent(
    entryId: string,
    conflictingEntryId: string,
    metadata: ConflictMetadata,
  ): Promise<void> {
    if (!this.eventBus) return;

    const event: SystemEvent = {
      source: 'seraphim.zikaron',
      type: 'memory.conflict.detected',
      detail: {
        entryId,
        conflictingEntryId,
        reason: metadata.reason,
        detectedBy: metadata.detectedBy,
        detectedAt: metadata.detectedAt.toISOString(),
      },
      metadata: {
        tenantId: this.config.tenantId,
        correlationId: entryId,
        timestamp: new Date(),
      },
    };

    try {
      await this.eventBus.publish(event);
    } catch {
      // Event publishing failure should not block conflict flagging.
    }
  }

  // -------------------------------------------------------------------------
  // Row Mapping Helpers
  // -------------------------------------------------------------------------

  /**
   * Convert a MemoryEntryRow to a MemoryResult.
   */
  private toMemoryResult(row: MemoryEntryRow, similarity: number): MemoryResult {
    return {
      id: row.id,
      layer: row.layer,
      content: row.content,
      similarity,
      metadata: row.metadata,
      sourceAgentId: row.sourceAgentId ?? '',
      timestamp: row.createdAt,
    };
  }

  /**
   * Convert a MemoryEntryRow to a WorkingMemoryContext.
   */
  private rowToWorkingMemory(row: MemoryEntryRow): WorkingMemoryContext {
    const meta = row.metadata;
    return {
      id: row.id,
      tenantId: row.tenantId,
      layer: 'working',
      content: row.content,
      embedding: row.embedding ?? [],
      sourceAgentId: row.sourceAgentId ?? '',
      tags: row.tags,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt ?? undefined,
      conflictsWith: row.conflictsWith ?? undefined,
      agentId: (meta.agentId as string) ?? row.sourceAgentId ?? '',
      sessionId: (meta.sessionId as string) ?? '',
      taskContext: (meta.taskContext as Record<string, unknown>) ?? {},
      conversationHistory: (meta.conversationHistory as WorkingMemoryContext['conversationHistory']) ?? [],
      activeGoals: (meta.activeGoals as string[]) ?? [],
    };
  }

  /**
   * Convert a MemoryEntryRow to an EpisodicEntry.
   */
  private rowToEpisodicEntry(row: MemoryEntryRow): EpisodicEntry {
    const meta = row.metadata;
    return {
      id: row.id,
      tenantId: row.tenantId,
      layer: 'episodic',
      content: row.content,
      embedding: row.embedding ?? [],
      sourceAgentId: row.sourceAgentId ?? '',
      tags: row.tags,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt ?? undefined,
      conflictsWith: row.conflictsWith ?? undefined,
      eventType: (meta.eventType as string) ?? '',
      participants: (meta.participants as string[]) ?? [],
      outcome: (meta.outcome as EpisodicEntry['outcome']) ?? 'partial',
      relatedEntities: (meta.relatedEntities as EntityReference[]) ?? [],
    };
  }

  /**
   * Convert a MemoryEntryRow to a ProceduralEntry.
   */
  private rowToProceduralEntry(row: MemoryEntryRow): ProceduralEntry {
    const meta = row.metadata;
    return {
      id: row.id,
      tenantId: row.tenantId,
      layer: 'procedural',
      content: row.content,
      embedding: row.embedding ?? [],
      sourceAgentId: row.sourceAgentId ?? '',
      tags: row.tags,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt ?? undefined,
      conflictsWith: row.conflictsWith ?? undefined,
      workflowPattern: (meta.workflowPattern as string) ?? '',
      successRate: (meta.successRate as number) ?? 0,
      executionCount: (meta.executionCount as number) ?? 0,
      prerequisites: (meta.prerequisites as string[]) ?? [],
      steps: (meta.steps as ProceduralEntry['steps']) ?? [],
    };
  }
}
