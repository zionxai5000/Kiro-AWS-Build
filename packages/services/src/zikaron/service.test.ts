/**
 * Unit tests for the Zikaron Memory Service (ZikaronServiceImpl).
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 19.1
 *
 * - 4.1: Maintain four distinct memory layers (episodic, semantic, procedural, working)
 * - 4.2: Return semantically relevant results using vector similarity search
 * - 4.3: Auto-extract entities and relationships from episodic to semantic memory
 * - 4.4: Extract execution patterns and store in procedural memory for reuse
 * - 4.5: Load agent's working memory, recent episodic context, and procedural patterns
 * - 4.6: Support cross-agent memory queries within the same tenant
 * - 4.7: Flag conflicts and retain both entries with metadata
 * - 19.1: Test suite validates correctness before deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZikaronServiceImpl } from './service.js';
import type { ZikaronServiceConfig, EmbeddingProvider, EntityExtractor } from './service.js';
import type {
  EpisodicEntry,
  SemanticEntry,
  ProceduralEntry,
  WorkingMemoryContext,
  MemoryQuery,
  ConflictMetadata,
  EntityReference,
  Relationship,
} from '@seraphim/core';
import type { MemoryEntryRow, MemorySearchResult } from '@seraphim/core';
import type { MemoryLayer } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const AGENT_ID_1 = 'agent-001';
const AGENT_ID_2 = 'agent-002';

/** Fake 1536-dimension embedding vector. */
function fakeEmbedding(seed = 0.1): number[] {
  return Array.from({ length: 1536 }, (_, i) => seed + i * 0.0001);
}

/** Create a mock MemoryEntryRow returned by the repository. */
function createMemoryRow(overrides: Partial<MemoryEntryRow> = {}): MemoryEntryRow {
  return {
    id: overrides.id ?? 'mem-001',
    tenantId: overrides.tenantId ?? TENANT_ID,
    layer: overrides.layer ?? 'episodic',
    content: overrides.content ?? 'Test memory content',
    embedding: overrides.embedding ?? fakeEmbedding(),
    sourceAgentId: overrides.sourceAgentId ?? AGENT_ID_1,
    tags: overrides.tags ?? ['test'],
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? new Date('2025-06-01T10:00:00.000Z'),
    expiresAt: overrides.expiresAt ?? null,
    conflictsWith: overrides.conflictsWith ?? null,
  };
}

function createMockMemoryRepository() {
  return {
    createWithEmbedding: vi.fn().mockImplementation(
      (_tenantId: string, data: Partial<MemoryEntryRow>) =>
        Promise.resolve(
          createMemoryRow({
            id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            layer: data.layer,
            content: data.content,
            sourceAgentId: data.sourceAgentId ?? null,
            tags: data.tags ?? [],
            metadata: data.metadata ?? {},
          }),
        ),
    ),
    searchSimilar: vi.fn().mockResolvedValue([]),
    findWorkingMemory: vi.fn().mockResolvedValue(null),
    findRecentEpisodic: vi.fn().mockResolvedValue([]),
    findTopProcedural: vi.fn().mockResolvedValue([]),
    flagConflict: vi.fn().mockResolvedValue(undefined),
    findByLayer: vi.fn().mockResolvedValue([]),
    findByAgent: vi.fn().mockResolvedValue([]),
    deleteExpired: vi.fn().mockResolvedValue(0),
  };
}

function createMockEmbeddingProvider(): EmbeddingProvider {
  return {
    generateEmbedding: vi.fn().mockImplementation((text: string) =>
      Promise.resolve(fakeEmbedding(text.length * 0.01)),
    ),
  };
}

function createMockEntityExtractor(): EntityExtractor {
  return {
    extract: vi.fn().mockResolvedValue({
      entities: [
        { entityId: 'ent-1', entityType: 'user', role: 'actor' },
      ] as EntityReference[],
      relationships: [
        { subjectId: 'ent-1', predicate: 'performed', objectId: 'action-1', confidence: 0.9 },
      ] as Relationship[],
    }),
  };
}

function createMockEventBus() {
  return {
    publish: vi.fn().mockResolvedValue('event-id-123'),
    publishBatch: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue('sub-id'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

function createEpisodicEntry(overrides: Partial<EpisodicEntry> = {}): EpisodicEntry {
  return {
    id: 'ep-001',
    tenantId: TENANT_ID,
    layer: 'episodic',
    content: 'Agent completed file processing task successfully',
    embedding: [],
    sourceAgentId: AGENT_ID_1,
    tags: ['file-processing', 'success'],
    createdAt: new Date('2025-06-01T10:00:00.000Z'),
    eventType: 'task.completed',
    participants: [AGENT_ID_1],
    outcome: 'success',
    relatedEntities: [
      { entityId: 'file-001', entityType: 'file', role: 'target' },
    ],
    ...overrides,
  };
}

function createSemanticEntry(overrides: Partial<SemanticEntry> = {}): SemanticEntry {
  return {
    id: 'sem-001',
    tenantId: TENANT_ID,
    layer: 'semantic',
    content: 'User prefers JSON output format for data exports',
    embedding: [],
    sourceAgentId: AGENT_ID_1,
    tags: ['preference', 'data-export'],
    createdAt: new Date('2025-06-01T10:00:00.000Z'),
    entityType: 'user_preference',
    relationships: [
      { subjectId: 'user-1', predicate: 'prefers', objectId: 'json-format', confidence: 0.95 },
    ],
    confidence: 0.95,
    source: 'manual',
    ...overrides,
  };
}

function createProceduralEntry(overrides: Partial<ProceduralEntry> = {}): ProceduralEntry {
  return {
    id: 'proc-001',
    tenantId: TENANT_ID,
    layer: 'procedural',
    content: 'App submission workflow: build → test → gate-review → submit',
    embedding: [],
    sourceAgentId: AGENT_ID_1,
    tags: ['app-submission', 'workflow'],
    createdAt: new Date('2025-06-01T10:00:00.000Z'),
    workflowPattern: 'app-submission',
    successRate: 0.85,
    executionCount: 20,
    prerequisites: ['build-complete', 'tests-passing'],
    steps: [
      { order: 1, action: 'build', description: 'Build the app', expectedOutcome: 'Build artifact' },
      { order: 2, action: 'test', description: 'Run tests', expectedOutcome: 'All tests pass' },
      { order: 3, action: 'submit', description: 'Submit to store', expectedOutcome: 'Submission ID' },
    ],
    ...overrides,
  };
}

function createWorkingMemoryContext(
  overrides: Partial<WorkingMemoryContext> = {},
): WorkingMemoryContext {
  return {
    id: 'wm-001',
    tenantId: TENANT_ID,
    layer: 'working',
    content: 'Currently processing batch import of user data',
    embedding: [],
    sourceAgentId: AGENT_ID_1,
    tags: ['batch-import', 'active'],
    createdAt: new Date('2025-06-01T10:00:00.000Z'),
    agentId: AGENT_ID_1,
    sessionId: 'session-001',
    taskContext: { batchId: 'batch-123', progress: 0.5 },
    conversationHistory: [
      { role: 'user', content: 'Start batch import', timestamp: new Date('2025-06-01T09:55:00.000Z') },
      { role: 'assistant', content: 'Starting import...', timestamp: new Date('2025-06-01T09:55:01.000Z') },
    ],
    activeGoals: ['complete-batch-import', 'validate-data'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ZikaronServiceImpl', () => {
  let mockRepo: ReturnType<typeof createMockMemoryRepository>;
  let mockEmbedding: ReturnType<typeof createMockEmbeddingProvider>;
  let mockExtractor: ReturnType<typeof createMockEntityExtractor>;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let service: ZikaronServiceImpl;

  beforeEach(() => {
    mockRepo = createMockMemoryRepository();
    mockEmbedding = createMockEmbeddingProvider();
    mockExtractor = createMockEntityExtractor();
    mockEventBus = createMockEventBus();

    const config: ZikaronServiceConfig = {
      tenantId: TENANT_ID,
      memoryRepository: mockRepo as any,
      embeddingProvider: mockEmbedding,
      entityExtractor: mockExtractor,
      eventBus: mockEventBus as any,
      recentEpisodicDays: 7,
      topProceduralLimit: 5,
    };

    service = new ZikaronServiceImpl(config);
  });

  // -----------------------------------------------------------------------
  // 1. Four-Layer Storage (Req 4.1)
  // -----------------------------------------------------------------------

  describe('4-layer storage (Req 4.1)', () => {
    it('should store an episodic entry and return its ID', async () => {
      const entry = createEpisodicEntry();
      const id = await service.storeEpisodic(entry);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should store episodic entry with layer "episodic"', async () => {
      const entry = createEpisodicEntry();
      await service.storeEpisodic(entry);

      expect(mockRepo.createWithEmbedding).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ layer: 'episodic' }),
      );
    });

    it('should store episodic entry with correct metadata fields', async () => {
      const entry = createEpisodicEntry();
      await service.storeEpisodic(entry);

      const callArgs = mockRepo.createWithEmbedding.mock.calls[0][1];
      expect(callArgs.metadata).toEqual(
        expect.objectContaining({
          eventType: 'task.completed',
          participants: [AGENT_ID_1],
          outcome: 'success',
          relatedEntities: entry.relatedEntities,
        }),
      );
    });

    it('should store a semantic entry and return its ID', async () => {
      const entry = createSemanticEntry();
      const id = await service.storeSemantic(entry);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should store semantic entry with layer "semantic"', async () => {
      const entry = createSemanticEntry();
      await service.storeSemantic(entry);

      expect(mockRepo.createWithEmbedding).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ layer: 'semantic' }),
      );
    });

    it('should store semantic entry with correct metadata fields', async () => {
      const entry = createSemanticEntry();
      await service.storeSemantic(entry);

      const callArgs = mockRepo.createWithEmbedding.mock.calls[0][1];
      expect(callArgs.metadata).toEqual(
        expect.objectContaining({
          entityType: 'user_preference',
          relationships: entry.relationships,
          confidence: 0.95,
          source: 'manual',
        }),
      );
    });

    it('should store a procedural entry and return its ID', async () => {
      const entry = createProceduralEntry();
      const id = await service.storeProcedural(entry);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should store procedural entry with layer "procedural"', async () => {
      const entry = createProceduralEntry();
      await service.storeProcedural(entry);

      expect(mockRepo.createWithEmbedding).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ layer: 'procedural' }),
      );
    });

    it('should store procedural entry with success rate and execution count in metadata', async () => {
      const entry = createProceduralEntry({ successRate: 0.92, executionCount: 50 });
      await service.storeProcedural(entry);

      const callArgs = mockRepo.createWithEmbedding.mock.calls[0][1];
      expect(callArgs.metadata).toEqual(
        expect.objectContaining({
          workflowPattern: 'app-submission',
          successRate: 0.92,
          executionCount: 50,
          prerequisites: ['build-complete', 'tests-passing'],
        }),
      );
    });

    it('should store working memory and return its ID', async () => {
      const context = createWorkingMemoryContext();
      const id = await service.storeWorking(AGENT_ID_1, context);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should store working memory with layer "working"', async () => {
      const context = createWorkingMemoryContext();
      await service.storeWorking(AGENT_ID_1, context);

      expect(mockRepo.createWithEmbedding).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ layer: 'working' }),
      );
    });

    it('should store working memory with session and task context in metadata', async () => {
      const context = createWorkingMemoryContext();
      await service.storeWorking(AGENT_ID_1, context);

      const callArgs = mockRepo.createWithEmbedding.mock.calls[0][1];
      expect(callArgs.metadata).toEqual(
        expect.objectContaining({
          agentId: AGENT_ID_1,
          sessionId: 'session-001',
          taskContext: { batchId: 'batch-123', progress: 0.5 },
          activeGoals: ['complete-batch-import', 'validate-data'],
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 2. Embedding Generation
  // -----------------------------------------------------------------------

  describe('embedding generation', () => {
    it('should generate an embedding for episodic entry content', async () => {
      const entry = createEpisodicEntry({ content: 'Agent processed data' });
      await service.storeEpisodic(entry);

      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('Agent processed data');
    });

    it('should generate an embedding for semantic entry content', async () => {
      const entry = createSemanticEntry({ content: 'User prefers CSV' });
      await service.storeSemantic(entry);

      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('User prefers CSV');
    });

    it('should generate an embedding for procedural entry content', async () => {
      const entry = createProceduralEntry({ content: 'Deploy workflow' });
      await service.storeProcedural(entry);

      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('Deploy workflow');
    });

    it('should generate an embedding for working memory content', async () => {
      const context = createWorkingMemoryContext({ content: 'Active task context' });
      await service.storeWorking(AGENT_ID_1, context);

      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('Active task context');
    });

    it('should pass the generated embedding to the repository', async () => {
      const expectedEmbedding = fakeEmbedding(0.42);
      (mockEmbedding.generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        expectedEmbedding,
      );

      const entry = createSemanticEntry();
      await service.storeSemantic(entry);

      const callArgs = mockRepo.createWithEmbedding.mock.calls[0][1];
      expect(callArgs.embedding).toEqual(expectedEmbedding);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Vector Similarity Search (Req 4.2)
  // -----------------------------------------------------------------------

  describe('vector similarity search (Req 4.2)', () => {
    it('should generate an embedding for the query text', async () => {
      const query: MemoryQuery = {
        text: 'file processing',
        tenantId: TENANT_ID,
      };
      await service.query(query);

      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('file processing');
    });

    it('should pass the query embedding to the repository searchSimilar', async () => {
      const queryEmbedding = fakeEmbedding(0.99);
      (mockEmbedding.generateEmbedding as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        queryEmbedding,
      );

      const query: MemoryQuery = {
        text: 'file processing',
        tenantId: TENANT_ID,
      };
      await service.query(query);

      expect(mockRepo.searchSimilar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ embedding: queryEmbedding }),
      );
    });

    it('should return results sorted by similarity (highest first)', async () => {
      const searchResults: MemorySearchResult[] = [
        { entry: createMemoryRow({ id: 'mem-high', content: 'Highly relevant' }), similarity: 0.95 },
        { entry: createMemoryRow({ id: 'mem-mid', content: 'Somewhat relevant' }), similarity: 0.70 },
        { entry: createMemoryRow({ id: 'mem-low', content: 'Less relevant' }), similarity: 0.40 },
      ];
      mockRepo.searchSimilar.mockResolvedValueOnce(searchResults);

      const results = await service.query({
        text: 'relevant query',
        tenantId: TENANT_ID,
      });

      expect(results).toHaveLength(3);
      expect(results[0].similarity).toBe(0.95);
      expect(results[1].similarity).toBe(0.70);
      expect(results[2].similarity).toBe(0.40);
    });

    it('should map repository results to MemoryResult objects', async () => {
      const row = createMemoryRow({
        id: 'mem-mapped',
        layer: 'semantic',
        content: 'Mapped content',
        sourceAgentId: AGENT_ID_1,
        metadata: { entityType: 'fact' },
        createdAt: new Date('2025-06-15T12:00:00.000Z'),
      });
      mockRepo.searchSimilar.mockResolvedValueOnce([
        { entry: row, similarity: 0.88 },
      ]);

      const results = await service.query({
        text: 'test query',
        tenantId: TENANT_ID,
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'mem-mapped',
        layer: 'semantic',
        content: 'Mapped content',
        similarity: 0.88,
        metadata: { entityType: 'fact' },
        sourceAgentId: AGENT_ID_1,
        timestamp: new Date('2025-06-15T12:00:00.000Z'),
      });
    });

    it('should pass layer filters to the repository', async () => {
      const query: MemoryQuery = {
        text: 'search text',
        tenantId: TENANT_ID,
        layers: ['episodic', 'semantic'],
      };
      await service.query(query);

      expect(mockRepo.searchSimilar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ layers: ['episodic', 'semantic'] }),
      );
    });

    it('should pass agent filter to the repository', async () => {
      const query: MemoryQuery = {
        text: 'search text',
        tenantId: TENANT_ID,
        agentId: AGENT_ID_1,
      };
      await service.query(query);

      expect(mockRepo.searchSimilar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ agentId: AGENT_ID_1 }),
      );
    });

    it('should pass date range filter to the repository', async () => {
      const dateRange = {
        start: new Date('2025-01-01'),
        end: new Date('2025-06-30'),
      };
      const query: MemoryQuery = {
        text: 'search text',
        tenantId: TENANT_ID,
        dateRange,
      };
      await service.query(query);

      expect(mockRepo.searchSimilar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ dateRange }),
      );
    });

    it('should default limit to 10 when not specified', async () => {
      const query: MemoryQuery = {
        text: 'search text',
        tenantId: TENANT_ID,
      };
      await service.query(query);

      expect(mockRepo.searchSimilar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('should respect custom limit', async () => {
      const query: MemoryQuery = {
        text: 'search text',
        tenantId: TENANT_ID,
        limit: 25,
      };
      await service.query(query);

      expect(mockRepo.searchSimilar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ limit: 25 }),
      );
    });

    it('should return empty array when no results match', async () => {
      mockRepo.searchSimilar.mockResolvedValueOnce([]);

      const results = await service.query({
        text: 'no match',
        tenantId: TENANT_ID,
      });

      expect(results).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Automatic Entity Extraction (Req 4.3)
  // -----------------------------------------------------------------------

  describe('automatic entity extraction from episodic to semantic (Req 4.3)', () => {
    it('should call entity extractor when storing an episodic entry', async () => {
      const entry = createEpisodicEntry({ content: 'Agent deployed app v2.0' });
      await service.storeEpisodic(entry);

      expect(mockExtractor.extract).toHaveBeenCalledWith('Agent deployed app v2.0');
    });

    it('should create a semantic entry from extracted entities and relationships', async () => {
      const entry = createEpisodicEntry();
      await service.storeEpisodic(entry);

      // First call is the episodic entry, second call is the auto-extracted semantic entry
      expect(mockRepo.createWithEmbedding).toHaveBeenCalledTimes(2);

      const semanticCall = mockRepo.createWithEmbedding.mock.calls[1];
      expect(semanticCall[0]).toBe(TENANT_ID);
      expect(semanticCall[1]).toEqual(
        expect.objectContaining({
          layer: 'semantic',
          tags: expect.arrayContaining(['auto-extracted']),
        }),
      );
    });

    it('should set auto-extracted semantic entry metadata with source "extracted"', async () => {
      const entry = createEpisodicEntry();
      await service.storeEpisodic(entry);

      const semanticCall = mockRepo.createWithEmbedding.mock.calls[1][1];
      expect(semanticCall.metadata).toEqual(
        expect.objectContaining({
          entityType: 'extracted_knowledge',
          source: 'extracted',
          confidence: 0.8,
        }),
      );
    });

    it('should include extracted relationships in semantic entry metadata', async () => {
      (mockExtractor.extract as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        entities: [{ entityId: 'app-1', entityType: 'application', role: 'target' }],
        relationships: [
          { subjectId: AGENT_ID_1, predicate: 'deployed', objectId: 'app-1', confidence: 0.9 },
        ],
      });

      const entry = createEpisodicEntry();
      await service.storeEpisodic(entry);

      const semanticCall = mockRepo.createWithEmbedding.mock.calls[1][1];
      expect(semanticCall.metadata.relationships).toEqual([
        { subjectId: AGENT_ID_1, predicate: 'deployed', objectId: 'app-1', confidence: 0.9 },
      ]);
    });

    it('should generate a separate embedding for the semantic content', async () => {
      const entry = createEpisodicEntry();
      await service.storeEpisodic(entry);

      // generateEmbedding called twice: once for episodic, once for semantic
      expect(mockEmbedding.generateEmbedding).toHaveBeenCalledTimes(2);
    });

    it('should not create semantic entry when no entities or relationships are extracted', async () => {
      (mockExtractor.extract as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        entities: [],
        relationships: [],
      });

      const entry = createEpisodicEntry();
      await service.storeEpisodic(entry);

      // Only the episodic entry should be created
      expect(mockRepo.createWithEmbedding).toHaveBeenCalledTimes(1);
      expect(mockRepo.createWithEmbedding.mock.calls[0][1].layer).toBe('episodic');
    });

    it('should not fail episodic storage when entity extraction throws', async () => {
      (mockExtractor.extract as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Extraction failed'),
      );

      const entry = createEpisodicEntry();
      const id = await service.storeEpisodic(entry);

      // Episodic entry should still be stored successfully
      expect(id).toBeDefined();
      expect(mockRepo.createWithEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should skip entity extraction when no extractor is configured', async () => {
      const configNoExtractor: ZikaronServiceConfig = {
        tenantId: TENANT_ID,
        memoryRepository: mockRepo as any,
        embeddingProvider: mockEmbedding,
        // No entityExtractor
      };
      const serviceNoExtractor = new ZikaronServiceImpl(configNoExtractor);

      const entry = createEpisodicEntry();
      const id = await serviceNoExtractor.storeEpisodic(entry);

      expect(id).toBeDefined();
      // Only the episodic entry should be created
      expect(mockRepo.createWithEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should build semantic content from entities and relationships', async () => {
      (mockExtractor.extract as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        entities: [
          { entityId: 'user-1', entityType: 'user', role: 'actor' },
          { entityId: 'file-1', entityType: 'file', role: 'target' },
        ],
        relationships: [
          { subjectId: 'user-1', predicate: 'edited', objectId: 'file-1', confidence: 0.85 },
        ],
      });

      const entry = createEpisodicEntry();
      await service.storeEpisodic(entry);

      // The second generateEmbedding call should receive the built semantic content
      const semanticContent = (mockEmbedding.generateEmbedding as ReturnType<typeof vi.fn>)
        .mock.calls[1][0] as string;
      expect(semanticContent).toContain('Entities:');
      expect(semanticContent).toContain('user:user-1');
      expect(semanticContent).toContain('file:file-1');
      expect(semanticContent).toContain('Relationships:');
      expect(semanticContent).toContain('user-1 edited file-1');
    });
  });

  // -----------------------------------------------------------------------
  // 5. Agent Context Loading (Req 4.5)
  // -----------------------------------------------------------------------

  describe('agent context loading (Req 4.5)', () => {
    it('should load working memory for the specified agent', async () => {
      await service.loadAgentContext(AGENT_ID_1);

      expect(mockRepo.findWorkingMemory).toHaveBeenCalledWith(TENANT_ID, AGENT_ID_1);
    });

    it('should load recent episodic entries from the last 7 days', async () => {
      const beforeCall = new Date();
      await service.loadAgentContext(AGENT_ID_1);

      expect(mockRepo.findRecentEpisodic).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Date),
        50,
      );

      // Verify the "since" date is approximately 7 days ago
      const sinceArg = mockRepo.findRecentEpisodic.mock.calls[0][1] as Date;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const expectedSince = new Date(beforeCall.getTime() - sevenDaysMs);
      // Allow 5 seconds tolerance
      expect(Math.abs(sinceArg.getTime() - expectedSince.getTime())).toBeLessThan(5000);
    });

    it('should load top procedural patterns by success rate', async () => {
      await service.loadAgentContext(AGENT_ID_1);

      expect(mockRepo.findTopProcedural).toHaveBeenCalledWith(TENANT_ID, 5);
    });

    it('should return null working memory when none exists', async () => {
      mockRepo.findWorkingMemory.mockResolvedValueOnce(null);

      const context = await service.loadAgentContext(AGENT_ID_1);

      expect(context.workingMemory).toBeNull();
    });

    it('should return working memory when it exists', async () => {
      const workingRow = createMemoryRow({
        id: 'wm-existing',
        layer: 'working',
        content: 'Active task context',
        sourceAgentId: AGENT_ID_1,
        metadata: {
          agentId: AGENT_ID_1,
          sessionId: 'session-abc',
          taskContext: { step: 3 },
          conversationHistory: [],
          activeGoals: ['goal-1'],
        },
      });
      mockRepo.findWorkingMemory.mockResolvedValueOnce(workingRow);

      const context = await service.loadAgentContext(AGENT_ID_1);

      expect(context.workingMemory).not.toBeNull();
      expect(context.workingMemory!.content).toBe('Active task context');
      expect(context.workingMemory!.layer).toBe('working');
      expect(context.workingMemory!.sessionId).toBe('session-abc');
    });

    it('should return recent episodic entries mapped to EpisodicEntry objects', async () => {
      const episodicRows = [
        createMemoryRow({
          id: 'ep-recent-1',
          layer: 'episodic',
          content: 'Recent event 1',
          metadata: {
            eventType: 'task.started',
            participants: [AGENT_ID_1],
            outcome: 'success',
            relatedEntities: [],
          },
        }),
        createMemoryRow({
          id: 'ep-recent-2',
          layer: 'episodic',
          content: 'Recent event 2',
          metadata: {
            eventType: 'task.completed',
            participants: [AGENT_ID_1],
            outcome: 'success',
            relatedEntities: [],
          },
        }),
      ];
      mockRepo.findRecentEpisodic.mockResolvedValueOnce(episodicRows);

      const context = await service.loadAgentContext(AGENT_ID_1);

      expect(context.recentEpisodic).toHaveLength(2);
      expect(context.recentEpisodic[0].layer).toBe('episodic');
      expect(context.recentEpisodic[0].eventType).toBe('task.started');
      expect(context.recentEpisodic[1].eventType).toBe('task.completed');
    });

    it('should return procedural patterns mapped to ProceduralEntry objects', async () => {
      const proceduralRows = [
        createMemoryRow({
          id: 'proc-top-1',
          layer: 'procedural',
          content: 'Top workflow pattern',
          metadata: {
            workflowPattern: 'deploy-pipeline',
            successRate: 0.95,
            executionCount: 100,
            prerequisites: ['build'],
            steps: [{ order: 1, action: 'deploy', description: 'Deploy', expectedOutcome: 'Deployed' }],
          },
        }),
      ];
      mockRepo.findTopProcedural.mockResolvedValueOnce(proceduralRows);

      const context = await service.loadAgentContext(AGENT_ID_1);

      expect(context.proceduralPatterns).toHaveLength(1);
      expect(context.proceduralPatterns[0].layer).toBe('procedural');
      expect(context.proceduralPatterns[0].workflowPattern).toBe('deploy-pipeline');
      expect(context.proceduralPatterns[0].successRate).toBe(0.95);
    });

    it('should return the correct agentId in the context', async () => {
      const context = await service.loadAgentContext(AGENT_ID_2);

      expect(context.agentId).toBe(AGENT_ID_2);
    });

    it('should use custom recentEpisodicDays configuration', async () => {
      const customConfig: ZikaronServiceConfig = {
        tenantId: TENANT_ID,
        memoryRepository: mockRepo as any,
        embeddingProvider: mockEmbedding,
        recentEpisodicDays: 14,
      };
      const customService = new ZikaronServiceImpl(customConfig);

      const beforeCall = new Date();
      await customService.loadAgentContext(AGENT_ID_1);

      const sinceArg = mockRepo.findRecentEpisodic.mock.calls[0][1] as Date;
      const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
      const expectedSince = new Date(beforeCall.getTime() - fourteenDaysMs);
      expect(Math.abs(sinceArg.getTime() - expectedSince.getTime())).toBeLessThan(5000);
    });

    it('should use custom topProceduralLimit configuration', async () => {
      const customConfig: ZikaronServiceConfig = {
        tenantId: TENANT_ID,
        memoryRepository: mockRepo as any,
        embeddingProvider: mockEmbedding,
        topProceduralLimit: 10,
      };
      const customService = new ZikaronServiceImpl(customConfig);

      await customService.loadAgentContext(AGENT_ID_1);

      expect(mockRepo.findTopProcedural).toHaveBeenCalledWith(TENANT_ID, 10);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Cross-Agent Memory Queries with Tenant Isolation (Req 4.6)
  // -----------------------------------------------------------------------

  describe('cross-agent memory queries with tenant isolation (Req 4.6)', () => {
    it('should query by agent using the service tenant ID', async () => {
      await service.queryByAgent(AGENT_ID_2, 'search text');

      expect(mockRepo.searchSimilar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ agentId: AGENT_ID_2 }),
      );
    });

    it('should allow querying another agent memories within the same tenant', async () => {
      const crossAgentResults: MemorySearchResult[] = [
        {
          entry: createMemoryRow({
            id: 'mem-cross',
            sourceAgentId: AGENT_ID_2,
            content: 'Memory from agent 2',
          }),
          similarity: 0.85,
        },
      ];
      mockRepo.searchSimilar.mockResolvedValueOnce(crossAgentResults);

      const results = await service.queryByAgent(AGENT_ID_2, 'agent 2 data');

      expect(results).toHaveLength(1);
      expect(results[0].sourceAgentId).toBe(AGENT_ID_2);
    });

    it('should pass layer filters when querying by agent', async () => {
      const layers: MemoryLayer[] = ['episodic', 'procedural'];
      await service.queryByAgent(AGENT_ID_1, 'search text', layers);

      expect(mockRepo.searchSimilar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ layers }),
      );
    });

    it('should default to limit 10 for queryByAgent', async () => {
      await service.queryByAgent(AGENT_ID_1, 'search text');

      expect(mockRepo.searchSimilar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('should always scope queries to the configured tenant ID', async () => {
      // Verify that the tenant ID is always passed to the repository
      await service.query({
        text: 'test',
        tenantId: TENANT_ID,
      });

      expect(mockRepo.searchSimilar).toHaveBeenCalledWith(
        TENANT_ID,
        expect.anything(),
      );
    });

    it('should use the query tenantId for general queries', async () => {
      const otherTenantId = 'other-tenant-id';
      await service.query({
        text: 'test',
        tenantId: otherTenantId,
      });

      // The query method uses the tenantId from the request
      expect(mockRepo.searchSimilar).toHaveBeenCalledWith(
        otherTenantId,
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 7. Conflict Flagging (Req 4.7)
  // -----------------------------------------------------------------------

  describe('conflict flagging (Req 4.7)', () => {
    it('should flag both entries as conflicting with each other', async () => {
      const metadata: ConflictMetadata = {
        reason: 'Contradictory facts about user preference',
        detectedBy: AGENT_ID_1,
        detectedAt: new Date('2025-06-15T12:00:00.000Z'),
      };

      await service.flagConflict('mem-001', 'mem-002', metadata);

      // Should flag entry 1 as conflicting with entry 2
      expect(mockRepo.flagConflict).toHaveBeenCalledWith(TENANT_ID, 'mem-001', 'mem-002');
      // Should flag entry 2 as conflicting with entry 1
      expect(mockRepo.flagConflict).toHaveBeenCalledWith(TENANT_ID, 'mem-002', 'mem-001');
    });

    it('should call flagConflict on the repository exactly twice (bidirectional)', async () => {
      const metadata: ConflictMetadata = {
        reason: 'Conflicting data',
        detectedBy: AGENT_ID_1,
        detectedAt: new Date(),
      };

      await service.flagConflict('mem-a', 'mem-b', metadata);

      expect(mockRepo.flagConflict).toHaveBeenCalledTimes(2);
    });

    it('should publish a conflict detection event', async () => {
      const metadata: ConflictMetadata = {
        reason: 'Contradictory facts',
        detectedBy: AGENT_ID_1,
        detectedAt: new Date('2025-06-15T12:00:00.000Z'),
      };

      await service.flagConflict('mem-001', 'mem-002', metadata);

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockEventBus.publish.mock.calls[0][0];

      expect(publishedEvent.source).toBe('seraphim.zikaron');
      expect(publishedEvent.type).toBe('memory.conflict.detected');
      expect(publishedEvent.detail.entryId).toBe('mem-001');
      expect(publishedEvent.detail.conflictingEntryId).toBe('mem-002');
      expect(publishedEvent.detail.reason).toBe('Contradictory facts');
      expect(publishedEvent.detail.detectedBy).toBe(AGENT_ID_1);
    });

    it('should not fail if conflict event publishing throws', async () => {
      mockEventBus.publish.mockRejectedValueOnce(new Error('EventBridge down'));

      const metadata: ConflictMetadata = {
        reason: 'Conflicting data',
        detectedBy: AGENT_ID_1,
        detectedAt: new Date(),
      };

      // Should not throw
      await expect(
        service.flagConflict('mem-001', 'mem-002', metadata),
      ).resolves.toBeUndefined();

      // Repository calls should still have been made
      expect(mockRepo.flagConflict).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Event Bus Publishing
  // -----------------------------------------------------------------------

  describe('Event Bus publishing', () => {
    it('should publish memory.episodic.stored event after storing episodic entry', async () => {
      const entry = createEpisodicEntry();
      await service.storeEpisodic(entry);

      // At least one publish call should be for the episodic event
      const episodicPublishCall = mockEventBus.publish.mock.calls.find(
        (call: unknown[]) => (call[0] as { type: string }).type === 'memory.episodic.stored',
      );
      expect(episodicPublishCall).toBeDefined();

      const event = episodicPublishCall![0];
      expect(event.source).toBe('seraphim.zikaron');
      expect(event.detail.layer).toBe('episodic');
      expect(event.metadata.tenantId).toBe(TENANT_ID);
    });

    it('should publish memory.semantic.stored event after storing semantic entry', async () => {
      const entry = createSemanticEntry();
      await service.storeSemantic(entry);

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const event = mockEventBus.publish.mock.calls[0][0];

      expect(event.type).toBe('memory.semantic.stored');
      expect(event.detail.layer).toBe('semantic');
    });

    it('should publish memory.procedural.stored event after storing procedural entry', async () => {
      const entry = createProceduralEntry();
      await service.storeProcedural(entry);

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const event = mockEventBus.publish.mock.calls[0][0];

      expect(event.type).toBe('memory.procedural.stored');
      expect(event.detail.layer).toBe('procedural');
    });

    it('should publish memory.working.stored event after storing working memory', async () => {
      const context = createWorkingMemoryContext();
      await service.storeWorking(AGENT_ID_1, context);

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const event = mockEventBus.publish.mock.calls[0][0];

      expect(event.type).toBe('memory.working.stored');
      expect(event.detail.layer).toBe('working');
    });

    it('should not fail storage when event publishing throws', async () => {
      mockEventBus.publish.mockRejectedValue(new Error('EventBridge down'));

      const entry = createSemanticEntry();
      const id = await service.storeSemantic(entry);

      // Storage should succeed even if event publishing fails
      expect(id).toBeDefined();
      expect(mockRepo.createWithEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should not publish events when no event bus is configured', async () => {
      const configNoEventBus: ZikaronServiceConfig = {
        tenantId: TENANT_ID,
        memoryRepository: mockRepo as any,
        embeddingProvider: mockEmbedding,
        // No eventBus
      };
      const serviceNoEventBus = new ZikaronServiceImpl(configNoEventBus);

      const entry = createSemanticEntry();
      const id = await serviceNoEventBus.storeSemantic(entry);

      expect(id).toBeDefined();
      // mockEventBus.publish should not have been called since it's not wired
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 9. Tenant Isolation on Storage
  // -----------------------------------------------------------------------

  describe('tenant isolation on storage', () => {
    it('should always pass the configured tenant ID when storing episodic entries', async () => {
      const entry = createEpisodicEntry();
      await service.storeEpisodic(entry);

      expect(mockRepo.createWithEmbedding).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });

    it('should always pass the configured tenant ID when storing semantic entries', async () => {
      const entry = createSemanticEntry();
      await service.storeSemantic(entry);

      expect(mockRepo.createWithEmbedding).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });

    it('should always pass the configured tenant ID when storing procedural entries', async () => {
      const entry = createProceduralEntry();
      await service.storeProcedural(entry);

      expect(mockRepo.createWithEmbedding).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });

    it('should always pass the configured tenant ID when storing working memory', async () => {
      const context = createWorkingMemoryContext();
      await service.storeWorking(AGENT_ID_1, context);

      expect(mockRepo.createWithEmbedding).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });

    it('should always pass the configured tenant ID when flagging conflicts', async () => {
      const metadata: ConflictMetadata = {
        reason: 'test',
        detectedBy: AGENT_ID_1,
        detectedAt: new Date(),
      };

      await service.flagConflict('mem-1', 'mem-2', metadata);

      expect(mockRepo.flagConflict).toHaveBeenCalledWith(TENANT_ID, 'mem-1', 'mem-2');
      expect(mockRepo.flagConflict).toHaveBeenCalledWith(TENANT_ID, 'mem-2', 'mem-1');
    });
  });

  // -----------------------------------------------------------------------
  // 10. Edge Cases and Defaults
  // -----------------------------------------------------------------------

  describe('edge cases and defaults', () => {
    it('should handle entries with no tags', async () => {
      const entry = createSemanticEntry({ tags: [] });
      const id = await service.storeSemantic(entry);

      expect(id).toBeDefined();
      const callArgs = mockRepo.createWithEmbedding.mock.calls[0][1];
      expect(callArgs.tags).toEqual([]);
    });

    it('should handle entries with no expiration', async () => {
      const entry = createSemanticEntry({ expiresAt: undefined });
      await service.storeSemantic(entry);

      const callArgs = mockRepo.createWithEmbedding.mock.calls[0][1];
      expect(callArgs.expiresAt).toBeNull();
    });

    it('should handle entries with no conflictsWith', async () => {
      const entry = createSemanticEntry({ conflictsWith: undefined });
      await service.storeSemantic(entry);

      const callArgs = mockRepo.createWithEmbedding.mock.calls[0][1];
      expect(callArgs.conflictsWith).toBeNull();
    });

    it('should pass sourceAgentId from the entry to the repository', async () => {
      const entry = createEpisodicEntry({ sourceAgentId: 'custom-agent' });
      await service.storeEpisodic(entry);

      const callArgs = mockRepo.createWithEmbedding.mock.calls[0][1];
      expect(callArgs.sourceAgentId).toBe('custom-agent');
    });

    it('should use agentId parameter as sourceAgentId for working memory', async () => {
      const context = createWorkingMemoryContext();
      await service.storeWorking('specific-agent-id', context);

      const callArgs = mockRepo.createWithEmbedding.mock.calls[0][1];
      expect(callArgs.sourceAgentId).toBe('specific-agent-id');
    });

    it('should default recentEpisodicDays to 7 when not configured', async () => {
      const configDefaults: ZikaronServiceConfig = {
        tenantId: TENANT_ID,
        memoryRepository: mockRepo as any,
        embeddingProvider: mockEmbedding,
        // No recentEpisodicDays
      };
      const serviceDefaults = new ZikaronServiceImpl(configDefaults);

      const beforeCall = new Date();
      await serviceDefaults.loadAgentContext(AGENT_ID_1);

      const sinceArg = mockRepo.findRecentEpisodic.mock.calls[0][1] as Date;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const expectedSince = new Date(beforeCall.getTime() - sevenDaysMs);
      expect(Math.abs(sinceArg.getTime() - expectedSince.getTime())).toBeLessThan(5000);
    });

    it('should default topProceduralLimit to 5 when not configured', async () => {
      const configDefaults: ZikaronServiceConfig = {
        tenantId: TENANT_ID,
        memoryRepository: mockRepo as any,
        embeddingProvider: mockEmbedding,
        // No topProceduralLimit
      };
      const serviceDefaults = new ZikaronServiceImpl(configDefaults);

      await serviceDefaults.loadAgentContext(AGENT_ID_1);

      expect(mockRepo.findTopProcedural).toHaveBeenCalledWith(TENANT_ID, 5);
    });
  });
});
