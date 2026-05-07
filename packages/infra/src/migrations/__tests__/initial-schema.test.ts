import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the initial schema migration (001_initial-schema).
 *
 * Since we can't run against a real PostgreSQL + pgvector instance in unit tests,
 * we verify the migration by mocking the MigrationBuilder and asserting that
 * the correct tables, indexes, constraints, and RLS policies are created.
 */

// Build a mock MigrationBuilder that records all calls
function createMockPgm() {
  const calls: { method: string; args: unknown[] }[] = [];

  const pgm = {
    func: (expr: string) => `PGM_FUNC(${expr})`,
    sql: vi.fn((sql: string) => calls.push({ method: 'sql', args: [sql] })),
    createTable: vi.fn((name: string, columns: Record<string, unknown>) =>
      calls.push({ method: 'createTable', args: [name, columns] }),
    ),
    dropTable: vi.fn((name: string, opts?: unknown) =>
      calls.push({ method: 'dropTable', args: [name, opts] }),
    ),
    addConstraint: vi.fn((table: string, name: string, def: unknown) =>
      calls.push({ method: 'addConstraint', args: [table, name, def] }),
    ),
    createIndex: vi.fn((table: string, columns: unknown, opts?: unknown) =>
      calls.push({ method: 'createIndex', args: [table, columns, opts] }),
    ),
  };

  return { pgm, calls };
}

// Dynamically import the migration (it's excluded from tsc, but vitest handles TS)
async function loadMigration() {
  return import('../001_initial-schema.js') as Promise<{
    up: (pgm: ReturnType<typeof createMockPgm>['pgm']) => Promise<void>;
    down: (pgm: ReturnType<typeof createMockPgm>['pgm']) => Promise<void>;
  }>;
}

describe('001_initial-schema migration', () => {
  let pgm: ReturnType<typeof createMockPgm>['pgm'];
  let calls: ReturnType<typeof createMockPgm>['calls'];

  beforeEach(() => {
    const mock = createMockPgm();
    pgm = mock.pgm;
    calls = mock.calls;
  });

  describe('up()', () => {
    it('should enable the pgvector extension', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const extensionCall = calls.find(
        (c) => c.method === 'sql' && (c.args[0] as string).includes('CREATE EXTENSION'),
      );
      expect(extensionCall).toBeDefined();
      expect(extensionCall!.args[0]).toContain('vector');
    });

    it('should create all 7 required tables', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const tableNames = calls
        .filter((c) => c.method === 'createTable')
        .map((c) => c.args[0] as string);

      expect(tableNames).toContain('tenants');
      expect(tableNames).toContain('agent_programs');
      expect(tableNames).toContain('state_machine_definitions');
      expect(tableNames).toContain('state_machine_instances');
      expect(tableNames).toContain('memory_entries');
      expect(tableNames).toContain('completion_contracts');
      expect(tableNames).toContain('token_usage');
      expect(tableNames).toHaveLength(7);
    });

    it('should create tenants table before tables that reference it', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const tableCreations = calls
        .filter((c) => c.method === 'createTable')
        .map((c) => c.args[0] as string);

      const tenantsIndex = tableCreations.indexOf('tenants');
      const agentProgramsIndex = tableCreations.indexOf('agent_programs');
      const memoryEntriesIndex = tableCreations.indexOf('memory_entries');

      expect(tenantsIndex).toBeLessThan(agentProgramsIndex);
      expect(tenantsIndex).toBeLessThan(memoryEntriesIndex);
    });

    it('should create memory_entries with vector(1536) embedding column', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const memoryTable = calls.find(
        (c) => c.method === 'createTable' && c.args[0] === 'memory_entries',
      );
      expect(memoryTable).toBeDefined();

      const columns = memoryTable!.args[1] as Record<string, { type: string }>;
      expect(columns['embedding'].type).toBe('vector(1536)');
    });

    it('should create HNSW index on memory_entries embedding column', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const hnswCall = calls.find(
        (c) =>
          c.method === 'sql' &&
          (c.args[0] as string).includes('hnsw') &&
          (c.args[0] as string).includes('idx_memory_embedding'),
      );
      expect(hnswCall).toBeDefined();
      expect(hnswCall!.args[0]).toContain('vector_cosine_ops');
      expect(hnswCall!.args[0]).toContain('m = 16');
      expect(hnswCall!.args[0]).toContain('ef_construction = 64');
    });

    it('should add layer CHECK constraint on memory_entries', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const layerConstraint = calls.find(
        (c) =>
          c.method === 'addConstraint' &&
          c.args[0] === 'memory_entries' &&
          c.args[1] === 'memory_entries_layer_check',
      );
      expect(layerConstraint).toBeDefined();

      const def = layerConstraint!.args[2] as { check: string };
      expect(def.check).toContain('episodic');
      expect(def.check).toContain('semantic');
      expect(def.check).toContain('procedural');
      expect(def.check).toContain('working');
    });

    it('should add tenant type CHECK constraint on tenants', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const typeConstraint = calls.find(
        (c) =>
          c.method === 'addConstraint' &&
          c.args[0] === 'tenants' &&
          c.args[1] === 'tenants_type_check',
      );
      expect(typeConstraint).toBeDefined();

      const def = typeConstraint!.args[2] as { check: string };
      expect(def.check).toContain('king');
      expect(def.check).toContain('queen');
      expect(def.check).toContain('platform_user');
    });

    it('should create unique constraints on versioned tables', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const uniqueConstraints = calls.filter(
        (c) =>
          c.method === 'addConstraint' &&
          (c.args[2] as { unique?: unknown }).unique !== undefined,
      );

      const constraintTables = uniqueConstraints.map((c) => c.args[0] as string);
      expect(constraintTables).toContain('agent_programs');
      expect(constraintTables).toContain('state_machine_definitions');
      expect(constraintTables).toContain('completion_contracts');
    });

    it('should create token_usage daily aggregation index', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const tokenIndex = calls.find(
        (c) =>
          c.method === 'createIndex' &&
          c.args[0] === 'token_usage' &&
          (c.args[2] as { name: string }).name === 'idx_token_usage_daily',
      );
      expect(tokenIndex).toBeDefined();
    });

    it('should enable RLS on all tables with tenant_id', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const rlsCalls = calls.filter(
        (c) =>
          c.method === 'sql' &&
          (c.args[0] as string).includes('ENABLE ROW LEVEL SECURITY'),
      );

      // 6 tables with tenant_id + tenants table itself = 7
      expect(rlsCalls).toHaveLength(7);
    });

    it('should create tenant isolation policies on all tables with tenant_id', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const tablesWithTenantId = [
        'agent_programs',
        'state_machine_definitions',
        'state_machine_instances',
        'memory_entries',
        'completion_contracts',
        'token_usage',
      ];

      for (const table of tablesWithTenantId) {
        const isolationPolicy = calls.find(
          (c) =>
            c.method === 'sql' &&
            (c.args[0] as string).includes('tenant_isolation_policy') &&
            (c.args[0] as string).includes(table),
        );
        expect(isolationPolicy, `Missing isolation policy for ${table}`).toBeDefined();
        expect(isolationPolicy!.args[0]).toContain('app.current_tenant_id');

        const insertPolicy = calls.find(
          (c) =>
            c.method === 'sql' &&
            (c.args[0] as string).includes('tenant_insert_policy') &&
            (c.args[0] as string).includes(table),
        );
        expect(insertPolicy, `Missing insert policy for ${table}`).toBeDefined();
      }
    });

    it('should create self-referencing RLS policy on tenants table', async () => {
      const migration = await loadMigration();
      await migration.up(pgm);

      const selfPolicy = calls.find(
        (c) =>
          c.method === 'sql' &&
          (c.args[0] as string).includes('tenant_self_policy') &&
          (c.args[0] as string).includes('tenants'),
      );
      expect(selfPolicy).toBeDefined();
      expect(selfPolicy!.args[0]).toContain('app.current_tenant_id');
    });
  });

  describe('down()', () => {
    it('should drop all RLS policies', async () => {
      const migration = await loadMigration();
      await migration.down(pgm);

      const dropPolicyCalls = calls.filter(
        (c) => c.method === 'sql' && (c.args[0] as string).includes('DROP POLICY'),
      );

      // 6 tables × 2 policies each + 2 for tenants = 14
      expect(dropPolicyCalls).toHaveLength(14);
    });

    it('should drop all tables in reverse dependency order', async () => {
      const migration = await loadMigration();
      await migration.down(pgm);

      const dropCalls = calls
        .filter((c) => c.method === 'dropTable')
        .map((c) => c.args[0] as string);

      // tenants should be dropped last (other tables reference it)
      const tenantsIndex = dropCalls.indexOf('tenants');
      const agentProgramsIndex = dropCalls.indexOf('agent_programs');
      expect(tenantsIndex).toBeGreaterThan(agentProgramsIndex);
    });

    it('should drop the vector extension', async () => {
      const migration = await loadMigration();
      await migration.down(pgm);

      const dropExtension = calls.find(
        (c) =>
          c.method === 'sql' && (c.args[0] as string).includes('DROP EXTENSION'),
      );
      expect(dropExtension).toBeDefined();
      expect(dropExtension!.args[0]).toContain('vector');
    });
  });
});
