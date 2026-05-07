/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Initial schema migration for SeraphimOS.
 *
 * Creates all core tables, indexes, and row-level security policies.
 * Validates: Requirements 4.1 (Zikaron memory layers), 14.1 (multi-tenant isolation),
 *            20.4 (network/data-level tenant isolation).
 *
 * This file is executed by node-pg-migrate CLI which handles its own TS loading.
 * It uses `exports` syntax compatible with both CJS and the node-pg-migrate runner.
 */

import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Apply the initial schema: extensions, tables, indexes, and RLS policies.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // ---------------------------------------------------------------
  // Extensions
  // ---------------------------------------------------------------
  pgm.sql('CREATE EXTENSION IF NOT EXISTS vector');

  // ---------------------------------------------------------------
  // Tenants (must be created first — other tables reference it)
  // ---------------------------------------------------------------
  pgm.createTable('tenants', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'varchar(255)', notNull: true },
    type: { type: 'varchar(50)', notNull: true },
    parent_tenant_id: {
      type: 'uuid',
      references: 'tenants(id)',
    },
    config: { type: 'jsonb', default: "'{}'" },
    status: { type: 'varchar(50)', default: "'active'" },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.addConstraint('tenants', 'tenants_type_check', {
    check: "type IN ('king', 'queen', 'platform_user')",
  });

  // ---------------------------------------------------------------
  // Agent Programs
  // ---------------------------------------------------------------
  pgm.createTable('agent_programs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    name: { type: 'varchar(255)', notNull: true },
    version: { type: 'varchar(50)', notNull: true },
    pillar: { type: 'varchar(100)', notNull: true },
    definition: { type: 'jsonb', notNull: true },
    status: { type: 'varchar(50)', default: "'draft'" },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.addConstraint('agent_programs', 'agent_programs_tenant_name_version_unique', {
    unique: ['tenant_id', 'name', 'version'],
  });

  // ---------------------------------------------------------------
  // State Machine Definitions
  // ---------------------------------------------------------------
  pgm.createTable('state_machine_definitions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    name: { type: 'varchar(255)', notNull: true },
    version: { type: 'varchar(50)', notNull: true },
    definition: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.addConstraint('state_machine_definitions', 'smd_tenant_name_version_unique', {
    unique: ['tenant_id', 'name', 'version'],
  });

  // ---------------------------------------------------------------
  // State Machine Instances
  // ---------------------------------------------------------------
  pgm.createTable('state_machine_instances', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    definition_id: { type: 'uuid', notNull: true, references: 'state_machine_definitions(id)' },
    entity_id: { type: 'varchar(255)', notNull: true },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    current_state: { type: 'varchar(100)', notNull: true },
    data: { type: 'jsonb', default: "'{}'" },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  // ---------------------------------------------------------------
  // Memory Entries (with pgvector)
  // ---------------------------------------------------------------
  pgm.createTable('memory_entries', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    layer: { type: 'varchar(20)', notNull: true },
    content: { type: 'text', notNull: true },
    embedding: { type: 'vector(1536)' },
    source_agent_id: { type: 'uuid' },
    tags: { type: 'text[]', default: "ARRAY[]::text[]" },
    metadata: { type: 'jsonb', default: "'{}'" },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
    expires_at: { type: 'timestamptz' },
    conflicts_with: { type: 'uuid[]' },
  });

  pgm.addConstraint('memory_entries', 'memory_entries_layer_check', {
    check: "layer IN ('episodic', 'semantic', 'procedural', 'working')",
  });

  // HNSW index for fast vector similarity search
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_memory_embedding
      ON memory_entries USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
  `);

  // Composite indexes for filtered vector search
  pgm.createIndex('memory_entries', ['tenant_id', 'layer'], {
    name: 'idx_memory_tenant_layer',
    ifNotExists: true,
  });

  pgm.createIndex('memory_entries', ['source_agent_id'], {
    name: 'idx_memory_agent',
    ifNotExists: true,
  });

  pgm.createIndex('memory_entries', [{ name: 'created_at', sort: 'DESC' }], {
    name: 'idx_memory_created',
    ifNotExists: true,
  });

  // ---------------------------------------------------------------
  // Completion Contracts
  // ---------------------------------------------------------------
  pgm.createTable('completion_contracts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    workflow_type: { type: 'varchar(255)', notNull: true },
    version: { type: 'varchar(50)', notNull: true },
    output_schema: { type: 'jsonb', notNull: true },
    verification_steps: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.addConstraint('completion_contracts', 'cc_tenant_workflow_version_unique', {
    unique: ['tenant_id', 'workflow_type', 'version'],
  });

  // ---------------------------------------------------------------
  // Token Usage Tracking
  // ---------------------------------------------------------------
  pgm.createTable('token_usage', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants(id)' },
    agent_id: { type: 'uuid', notNull: true },
    pillar: { type: 'varchar(100)', notNull: true },
    provider: { type: 'varchar(50)', notNull: true },
    model: { type: 'varchar(100)', notNull: true },
    input_tokens: { type: 'integer', notNull: true },
    output_tokens: { type: 'integer', notNull: true },
    cost_usd: { type: 'decimal(10, 6)', notNull: true },
    task_type: { type: 'varchar(100)' },
    created_at: { type: 'timestamptz', default: pgm.func('NOW()') },
  });

  pgm.createIndex('token_usage', ['tenant_id', 'agent_id', 'created_at'], {
    name: 'idx_token_usage_daily',
    ifNotExists: true,
  });

  // ---------------------------------------------------------------
  // Row-Level Security (RLS) — tenant isolation
  // ---------------------------------------------------------------
  const tablesWithTenantId = [
    'agent_programs',
    'state_machine_definitions',
    'state_machine_instances',
    'memory_entries',
    'completion_contracts',
    'token_usage',
  ];

  for (const table of tablesWithTenantId) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);

    // Policy: rows visible only when tenant_id matches the session variable
    pgm.sql(`
      CREATE POLICY tenant_isolation_policy ON ${table}
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    `);

    // Policy: inserts must set tenant_id to the current tenant
    pgm.sql(`
      CREATE POLICY tenant_insert_policy ON ${table}
        FOR INSERT
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid)
    `);
  }

  // Tenants table: users can only see their own tenant row
  pgm.sql('ALTER TABLE tenants ENABLE ROW LEVEL SECURITY');
  pgm.sql(`
    CREATE POLICY tenant_self_policy ON tenants
      USING (id = current_setting('app.current_tenant_id')::uuid)
  `);
  pgm.sql(`
    CREATE POLICY tenant_self_insert_policy ON tenants
      FOR INSERT
      WITH CHECK (id = current_setting('app.current_tenant_id')::uuid)
  `);
}

/**
 * Rollback: drop all tables and the vector extension.
 */
export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop RLS policies first
  const allTables = [
    'agent_programs',
    'state_machine_definitions',
    'state_machine_instances',
    'memory_entries',
    'completion_contracts',
    'token_usage',
  ];

  for (const table of allTables) {
    pgm.sql(`DROP POLICY IF EXISTS tenant_isolation_policy ON ${table}`);
    pgm.sql(`DROP POLICY IF EXISTS tenant_insert_policy ON ${table}`);
  }

  pgm.sql('DROP POLICY IF EXISTS tenant_self_policy ON tenants');
  pgm.sql('DROP POLICY IF EXISTS tenant_self_insert_policy ON tenants');

  // Drop tables in reverse dependency order
  pgm.dropTable('token_usage', { ifExists: true });
  pgm.dropTable('completion_contracts', { ifExists: true });
  pgm.dropTable('memory_entries', { ifExists: true });
  pgm.dropTable('state_machine_instances', { ifExists: true });
  pgm.dropTable('state_machine_definitions', { ifExists: true });
  pgm.dropTable('agent_programs', { ifExists: true });
  pgm.dropTable('tenants', { ifExists: true });

  pgm.sql('DROP EXTENSION IF EXISTS vector');
}
