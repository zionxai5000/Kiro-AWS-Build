/**
 * Unit tests for the database layer.
 *
 * Tests the ConnectionPoolManager, BaseRepository, and all concrete repositories
 * using mocked pg clients. Validates tenant isolation is enforced on all queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionPoolManager } from './connection.js';
import { BaseRepository } from './repository.js';
import { AgentProgramRepository } from './agent-program.repository.js';
import { TenantRepository } from './tenant.repository.js';
import {
  StateMachineDefinitionRepository,
  StateMachineInstanceRepository,
} from './state-machine.repository.js';
import { MemoryRepository } from './memory.repository.js';
import { TokenUsageRepository } from './token-usage.repository.js';
import { CompletionContractRepository } from './completion-contract.repository.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock ConnectionPoolManager that captures queries.
 */
function createMockPool() {
  const queries: Array<{ text: string; values?: unknown[] }> = [];

  const mockPool = {
    query: vi.fn(async (_tenantId: string, text: string, values?: unknown[]) => {
      queries.push({ text, values });
      return [];
    }),
    transaction: vi.fn(
      async <T>(_tenantId: string, fn: (client: unknown) => Promise<T>) => {
        return fn({
          query: vi.fn(async () => ({ rows: [] })),
        });
      },
    ),
  } as unknown as ConnectionPoolManager;

  return { mockPool, queries };
}

/**
 * Creates a mock pool that returns specific rows for the next query.
 */
function createMockPoolWithRows(rows: Record<string, unknown>[]) {
  const queries: Array<{ text: string; values?: unknown[] }> = [];

  const mockPool = {
    query: vi.fn(async (_tenantId: string, text: string, values?: unknown[]) => {
      queries.push({ text, values });
      return rows;
    }),
    transaction: vi.fn(
      async <T>(_tenantId: string, fn: (client: unknown) => Promise<T>) => {
        return fn({
          query: vi.fn(async () => ({ rows })),
        });
      },
    ),
  } as unknown as ConnectionPoolManager;

  return { mockPool, queries };
}

// ---------------------------------------------------------------------------
// ConnectionPoolManager
// ---------------------------------------------------------------------------

describe('ConnectionPoolManager', () => {
  it('should throw if not initialized before use', () => {
    const manager = new ConnectionPoolManager({
      secretName: 'test-secret',
      region: 'us-east-1',
    });

    // getPoolStats calls getPool() internally which throws
    expect(() => manager.getPoolStats()).toThrow(
      'ConnectionPoolManager has not been initialized',
    );
  });

  it('should accept configuration options with defaults', () => {
    const manager = new ConnectionPoolManager({
      secretName: 'my-db-secret',
    });

    // The manager should be constructable without errors
    expect(manager).toBeDefined();
  });

  it('should accept full configuration options', () => {
    const manager = new ConnectionPoolManager({
      secretName: 'my-db-secret',
      region: 'eu-west-1',
      maxConnections: 50,
      idleTimeoutMs: 60_000,
      connectionTimeoutMs: 10_000,
      ssl: false,
    });

    expect(manager).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// BaseRepository — tenant isolation
// ---------------------------------------------------------------------------

describe('BaseRepository — tenant isolation', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('findById always includes tenant_id in the WHERE clause', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new AgentProgramRepository(mockPool);

    await repo.findById(TENANT_ID, 'some-id');

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('tenant_id');
    expect(queries[0].values).toContain(TENANT_ID);
  });

  it('findAll always includes tenant_id in the WHERE clause', async () => {
    const { mockPool, queries } = createMockPoolWithRows([]);

    // Need to return rows for both the data query and the count query
    let callCount = 0;
    (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation(
      async (_tenantId: string, text: string, values?: unknown[]) => {
        queries.push({ text, values });
        callCount++;
        if (text.includes('COUNT')) {
          return [{ total: 0 }];
        }
        return [];
      },
    );

    const repo = new AgentProgramRepository(mockPool);
    await repo.findAll(TENANT_ID);

    // Both the data query and count query should include tenant_id
    expect(queries.length).toBeGreaterThanOrEqual(2);
    for (const q of queries) {
      expect(q.text).toContain('tenant_id');
      expect(q.values).toContain(TENANT_ID);
    }
  });

  it('delete always includes tenant_id in the WHERE clause', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new AgentProgramRepository(mockPool);

    await repo.delete(TENANT_ID, 'some-id');

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('tenant_id');
    expect(queries[0].values).toContain(TENANT_ID);
  });

  it('create always includes tenant_id', async () => {
    const row = {
      id: 'new-id',
      tenant_id: TENANT_ID,
      name: 'test-agent',
      version: '1.0.0',
      pillar: 'eretz',
      definition: '{}',
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { mockPool, queries } = createMockPoolWithRows([row]);
    const repo = new AgentProgramRepository(mockPool);

    await repo.create(TENANT_ID, {
      name: 'test-agent',
      version: '1.0.0',
      pillar: 'eretz',
      definition: {},
      status: 'draft',
    } as Partial<import('./agent-program.repository.js').AgentProgramRow>);

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('tenant_id');
    expect(queries[0].values).toContain(TENANT_ID);
  });

  it('update always includes tenant_id in the WHERE clause', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new AgentProgramRepository(mockPool);

    await repo.update(TENANT_ID, 'some-id', {
      status: 'active',
    } as Partial<import('./agent-program.repository.js').AgentProgramRow>);

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('tenant_id');
    expect(queries[0].values).toContain(TENANT_ID);
  });
});

// ---------------------------------------------------------------------------
// AgentProgramRepository
// ---------------------------------------------------------------------------

describe('AgentProgramRepository', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('maps database rows to AgentProgramRow correctly', async () => {
    const now = new Date().toISOString();
    const dbRow = {
      id: 'prog-1',
      tenant_id: TENANT_ID,
      name: 'my-agent',
      version: '2.0.0',
      pillar: 'eretz',
      definition: { systemPrompt: 'hello' },
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    const { mockPool } = createMockPoolWithRows([dbRow]);
    const repo = new AgentProgramRepository(mockPool);

    const result = await repo.findById(TENANT_ID, 'prog-1');

    expect(result).toEqual({
      id: 'prog-1',
      tenantId: TENANT_ID,
      name: 'my-agent',
      version: '2.0.0',
      pillar: 'eretz',
      definition: { systemPrompt: 'hello' },
      status: 'active',
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  });

  it('findByNameAndVersion includes tenant_id, name, and version', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new AgentProgramRepository(mockPool);

    await repo.findByNameAndVersion(TENANT_ID, 'my-agent', '1.0.0');

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('tenant_id');
    expect(queries[0].text).toContain('name');
    expect(queries[0].text).toContain('version');
    expect(queries[0].values).toEqual([TENANT_ID, 'my-agent', '1.0.0']);
  });

  it('findByPillar includes tenant_id and pillar', async () => {
    const { mockPool, queries } = createMockPool();

    let callCount = 0;
    (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation(
      async (_tenantId: string, text: string, values?: unknown[]) => {
        queries.push({ text, values });
        callCount++;
        if (text.includes('COUNT')) return [{ total: 0 }];
        return [];
      },
    );

    const repo = new AgentProgramRepository(mockPool);
    await repo.findByPillar(TENANT_ID, 'eretz');

    const dataQuery = queries.find((q) => !q.text.includes('COUNT'));
    expect(dataQuery?.text).toContain('tenant_id');
    expect(dataQuery?.text).toContain('pillar');
  });

  it('returns null when findById finds no rows', async () => {
    const { mockPool } = createMockPoolWithRows([]);
    const repo = new AgentProgramRepository(mockPool);

    const result = await repo.findById(TENANT_ID, 'nonexistent');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TenantRepository
// ---------------------------------------------------------------------------

describe('TenantRepository', () => {
  const TENANT_ID = 'tenant-king-1';

  it('maps database rows to TenantRow correctly', async () => {
    const now = new Date().toISOString();
    const dbRow = {
      id: TENANT_ID,
      name: 'King Tenant',
      type: 'king',
      parent_tenant_id: null,
      config: { theme: 'dark' },
      status: 'active',
      created_at: now,
    };

    const { mockPool } = createMockPoolWithRows([dbRow]);
    const repo = new TenantRepository(mockPool);

    const result = await repo.findById(TENANT_ID, TENANT_ID);

    expect(result).toEqual({
      id: TENANT_ID,
      name: 'King Tenant',
      type: 'king',
      parentTenantId: null,
      config: { theme: 'dark' },
      status: 'active',
      createdAt: new Date(now),
    });
  });

  it('findByName queries by name', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new TenantRepository(mockPool);

    await repo.findByName(TENANT_ID, 'King Tenant');

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('name');
    expect(queries[0].values).toContain('King Tenant');
  });

  it('findChildren queries by parent_tenant_id', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new TenantRepository(mockPool);

    await repo.findChildren(TENANT_ID);

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('parent_tenant_id');
    expect(queries[0].values).toContain(TENANT_ID);
  });
});

// ---------------------------------------------------------------------------
// StateMachineDefinitionRepository
// ---------------------------------------------------------------------------

describe('StateMachineDefinitionRepository', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('maps database rows correctly', async () => {
    const now = new Date().toISOString();
    const dbRow = {
      id: 'def-1',
      tenant_id: TENANT_ID,
      name: 'app-lifecycle',
      version: '1.0.0',
      definition: { states: {} },
      created_at: now,
    };

    const { mockPool } = createMockPoolWithRows([dbRow]);
    const repo = new StateMachineDefinitionRepository(mockPool);

    const result = await repo.findById(TENANT_ID, 'def-1');

    expect(result).toEqual({
      id: 'def-1',
      tenantId: TENANT_ID,
      name: 'app-lifecycle',
      version: '1.0.0',
      definition: { states: {} },
      createdAt: new Date(now),
    });
  });

  it('findByNameAndVersion includes all filter params', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new StateMachineDefinitionRepository(mockPool);

    await repo.findByNameAndVersion(TENANT_ID, 'app-lifecycle', '2.0.0');

    expect(queries).toHaveLength(1);
    expect(queries[0].values).toEqual([TENANT_ID, 'app-lifecycle', '2.0.0']);
  });
});

// ---------------------------------------------------------------------------
// StateMachineInstanceRepository
// ---------------------------------------------------------------------------

describe('StateMachineInstanceRepository', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('maps database rows correctly', async () => {
    const now = new Date().toISOString();
    const dbRow = {
      id: 'inst-1',
      definition_id: 'def-1',
      entity_id: 'entity-1',
      tenant_id: TENANT_ID,
      current_state: 'ready',
      data: { count: 5 },
      created_at: now,
      updated_at: now,
    };

    const { mockPool } = createMockPoolWithRows([dbRow]);
    const repo = new StateMachineInstanceRepository(mockPool);

    const result = await repo.findById(TENANT_ID, 'inst-1');

    expect(result).toEqual({
      id: 'inst-1',
      definitionId: 'def-1',
      entityId: 'entity-1',
      tenantId: TENANT_ID,
      currentState: 'ready',
      data: { count: 5 },
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  });

  it('findByEntityId queries by entity_id and tenant_id', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new StateMachineInstanceRepository(mockPool);

    await repo.findByEntityId(TENANT_ID, 'entity-1');

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('entity_id');
    expect(queries[0].text).toContain('tenant_id');
  });

  it('updateState updates current_state and data', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new StateMachineInstanceRepository(mockPool);

    await repo.updateState(TENANT_ID, 'inst-1', 'executing', { step: 2 });

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('current_state');
    expect(queries[0].text).toContain('tenant_id');
    expect(queries[0].values).toContain('executing');
    expect(queries[0].values).toContain(TENANT_ID);
  });
});

// ---------------------------------------------------------------------------
// MemoryRepository
// ---------------------------------------------------------------------------

describe('MemoryRepository', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('maps database rows correctly', async () => {
    const now = new Date().toISOString();
    const dbRow = {
      id: 'mem-1',
      tenant_id: TENANT_ID,
      layer: 'episodic',
      content: 'Something happened',
      embedding: null,
      source_agent_id: 'agent-1',
      tags: ['event', 'important'],
      metadata: { eventType: 'task_completed' },
      created_at: now,
      expires_at: null,
      conflicts_with: null,
    };

    const { mockPool } = createMockPoolWithRows([dbRow]);
    const repo = new MemoryRepository(mockPool);

    const result = await repo.findById(TENANT_ID, 'mem-1');

    expect(result).toEqual({
      id: 'mem-1',
      tenantId: TENANT_ID,
      layer: 'episodic',
      content: 'Something happened',
      embedding: null,
      sourceAgentId: 'agent-1',
      tags: ['event', 'important'],
      metadata: { eventType: 'task_completed' },
      createdAt: new Date(now),
      expiresAt: null,
      conflictsWith: null,
    });
  });

  it('searchSimilar includes tenant_id and embedding in query', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new MemoryRepository(mockPool);

    const embedding = Array(1536).fill(0.1);
    await repo.searchSimilar(TENANT_ID, { embedding });

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('tenant_id');
    expect(queries[0].text).toContain('<=>');
    expect(queries[0].text).toContain('similarity');
  });

  it('searchSimilar applies layer filter', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new MemoryRepository(mockPool);

    const embedding = Array(1536).fill(0.1);
    await repo.searchSimilar(TENANT_ID, {
      embedding,
      layers: ['episodic', 'semantic'],
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('layer = ANY');
  });

  it('searchSimilar applies date range filter', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new MemoryRepository(mockPool);

    const embedding = Array(1536).fill(0.1);
    await repo.searchSimilar(TENANT_ID, {
      embedding,
      dateRange: {
        start: new Date('2026-01-01'),
        end: new Date('2026-12-31'),
      },
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('created_at >=');
    expect(queries[0].text).toContain('created_at <=');
  });

  it('findByLayer queries by layer and tenant_id', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new MemoryRepository(mockPool);

    await repo.findByLayer(TENANT_ID, 'procedural');

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('tenant_id');
    expect(queries[0].text).toContain('layer');
    expect(queries[0].values).toContain('procedural');
  });

  it('findWorkingMemory queries for working layer by agent', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new MemoryRepository(mockPool);

    await repo.findWorkingMemory(TENANT_ID, 'agent-1');

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain("layer = 'working'");
    expect(queries[0].text).toContain('source_agent_id');
  });

  it('flagConflict updates conflicts_with array', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new MemoryRepository(mockPool);

    await repo.flagConflict(TENANT_ID, 'mem-1', 'mem-2');

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('conflicts_with');
    expect(queries[0].text).toContain('array_append');
    expect(queries[0].text).toContain('tenant_id');
  });

  it('parses pgvector string embedding format', async () => {
    const now = new Date().toISOString();
    const dbRow = {
      id: 'mem-2',
      tenant_id: TENANT_ID,
      layer: 'semantic',
      content: 'A fact',
      embedding: '[0.1,0.2,0.3]',
      source_agent_id: null,
      tags: [],
      metadata: {},
      created_at: now,
      expires_at: null,
      conflicts_with: null,
    };

    const { mockPool } = createMockPoolWithRows([dbRow]);
    const repo = new MemoryRepository(mockPool);

    const result = await repo.findById(TENANT_ID, 'mem-2');

    expect(result?.embedding).toEqual([0.1, 0.2, 0.3]);
  });
});

// ---------------------------------------------------------------------------
// TokenUsageRepository
// ---------------------------------------------------------------------------

describe('TokenUsageRepository', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('maps database rows correctly', async () => {
    const now = new Date().toISOString();
    const dbRow = {
      id: 'usage-1',
      tenant_id: TENANT_ID,
      agent_id: 'agent-1',
      pillar: 'eretz',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: 0.015,
      task_type: 'code_generation',
      created_at: now,
    };

    const { mockPool } = createMockPoolWithRows([dbRow]);
    const repo = new TokenUsageRepository(mockPool);

    const result = await repo.findById(TENANT_ID, 'usage-1');

    expect(result).toEqual({
      id: 'usage-1',
      tenantId: TENANT_ID,
      agentId: 'agent-1',
      pillar: 'eretz',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.015,
      taskType: 'code_generation',
      createdAt: new Date(now),
    });
  });

  it('record inserts with all required fields', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new TokenUsageRepository(mockPool);

    await repo.record(TENANT_ID, {
      tenantId: TENANT_ID,
      agentId: 'agent-1',
      pillar: 'eretz',
      provider: 'openai',
      model: 'gpt-4o',
      inputTokens: 2000,
      outputTokens: 800,
      costUsd: 0.03,
      taskType: 'analysis',
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('INSERT INTO token_usage');
    expect(queries[0].values).toContain(TENANT_ID);
    expect(queries[0].values).toContain('agent-1');
  });

  it('getAggregate queries with date range and tenant_id', async () => {
    const { mockPool, queries } = createMockPoolWithRows([
      {
        total_input_tokens: 5000,
        total_output_tokens: 2000,
        total_cost_usd: 0.1,
        count: 10,
      },
    ]);
    const repo = new TokenUsageRepository(mockPool);

    const result = await repo.getAggregate(TENANT_ID, {
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31'),
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('tenant_id');
    expect(result.totalInputTokens).toBe(5000);
    expect(result.totalOutputTokens).toBe(2000);
    expect(result.totalCostUsd).toBe(0.1);
    expect(result.count).toBe(10);
  });

  it('getUsageByAgent groups by agent_id', async () => {
    const { mockPool, queries } = createMockPoolWithRows([
      {
        agent_id: 'agent-1',
        total_cost_usd: 0.05,
        total_input_tokens: 3000,
        total_output_tokens: 1000,
      },
    ]);
    const repo = new TokenUsageRepository(mockPool);

    const result = await repo.getUsageByAgent(TENANT_ID, {
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31'),
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('GROUP BY agent_id');
    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe('agent-1');
  });
});

// ---------------------------------------------------------------------------
// CompletionContractRepository
// ---------------------------------------------------------------------------

describe('CompletionContractRepository', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('maps database rows correctly', async () => {
    const now = new Date().toISOString();
    const dbRow = {
      id: 'cc-1',
      tenant_id: TENANT_ID,
      workflow_type: 'app-submission',
      version: '1.0.0',
      output_schema: { type: 'object', properties: {} },
      verification_steps: [{ name: 'check-metadata', type: 'schema_validation' }],
      created_at: now,
    };

    const { mockPool } = createMockPoolWithRows([dbRow]);
    const repo = new CompletionContractRepository(mockPool);

    const result = await repo.findById(TENANT_ID, 'cc-1');

    expect(result).toEqual({
      id: 'cc-1',
      tenantId: TENANT_ID,
      workflowType: 'app-submission',
      version: '1.0.0',
      outputSchema: { type: 'object', properties: {} },
      verificationSteps: [{ name: 'check-metadata', type: 'schema_validation' }],
      createdAt: new Date(now),
    });
  });

  it('findByWorkflowAndVersion includes all filter params', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new CompletionContractRepository(mockPool);

    await repo.findByWorkflowAndVersion(TENANT_ID, 'app-submission', '1.0.0');

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('workflow_type');
    expect(queries[0].text).toContain('version');
    expect(queries[0].text).toContain('tenant_id');
    expect(queries[0].values).toEqual([TENANT_ID, 'app-submission', '1.0.0']);
  });

  it('findLatestByWorkflow orders by created_at DESC', async () => {
    const { mockPool, queries } = createMockPool();
    const repo = new CompletionContractRepository(mockPool);

    await repo.findLatestByWorkflow(TENANT_ID, 'app-submission');

    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('ORDER BY created_at DESC');
    expect(queries[0].text).toContain('LIMIT 1');
  });
});
