/**
 * Database Bootstrap Module
 *
 * Autonomously connects to Aurora PostgreSQL, runs migrations if needed,
 * and seeds the system tenant. Called on production server startup.
 *
 * This makes SeraphimOS fully self-bootstrapping — no manual migration steps.
 */

import { Client } from 'pg';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

export interface BootstrapResult {
  connected: boolean;
  migrated: boolean;
  seeded: boolean;
  error?: string;
  mode: 'aurora' | 'in-memory';
}

interface AuroraCredentials {
  host: string;
  port: number;
  dbname: string;
  username: string;
  password: string;
}

/**
 * Attempt to bootstrap the database. Returns connection info or falls back gracefully.
 */
export async function bootstrapDatabase(region: string): Promise<BootstrapResult> {
  try {
    // 1. Fetch credentials from Secrets Manager
    const creds = await fetchAuroraCredentials(region);
    if (!creds) {
      console.log('⚠️  No Aurora credentials found — running in-memory mode');
      return { connected: false, migrated: false, seeded: false, mode: 'in-memory' };
    }

    // 2. Connect to Aurora
    const client = new Client({
      host: creds.host,
      port: creds.port,
      database: creds.dbname,
      user: creds.username,
      password: creds.password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    await client.connect();
    console.log('✅ Connected to Aurora PostgreSQL');

    // 3. Check if migrations have been run (check for tenants table)
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'tenants'
      ) as exists
    `);

    let migrated = false;
    if (!tableCheck.rows[0]?.exists) {
      console.log('📦 Running database migrations...');
      await runMigrations(client);
      migrated = true;
      console.log('✅ Migrations complete');
    } else {
      console.log('✅ Database schema already exists');
    }

    // 4. Seed system tenant if not exists
    let seeded = false;
    const tenantCheck = await client.query(
      `SELECT id FROM tenants WHERE name = 'system' LIMIT 1`
    );

    if (tenantCheck.rows.length === 0) {
      // Temporarily disable RLS for seeding (we're the superuser)
      await client.query(`SET app.current_tenant_id = '00000000-0000-0000-0000-000000000001'`);
      await client.query(`
        INSERT INTO tenants (id, name, type, config, status)
        VALUES ('00000000-0000-0000-0000-000000000001', 'system', 'king', '{"role": "platform_owner"}', 'active')
        ON CONFLICT DO NOTHING
      `);
      seeded = true;
      console.log('✅ System tenant seeded');
    }

    await client.end();

    return { connected: true, migrated, seeded, mode: 'aurora' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`⚠️  Database bootstrap failed: ${message}`);
    console.log('⚠️  Falling back to in-memory mode');
    return { connected: false, migrated: false, seeded: false, error: message, mode: 'in-memory' };
  }
}

async function fetchAuroraCredentials(region: string): Promise<AuroraCredentials | null> {
  try {
    const client = new SecretsManagerClient({ region });

    // Try to find the Aurora secret by listing secrets with Aurora in the name
    // The CDK-generated secret name follows the pattern: SeraphimAuroraSecret*
    const secretId = process.env['AURORA_SECRET_NAME'] ?? await findAuroraSecret(client);
    if (!secretId) return null;

    const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    if (!response.SecretString) return null;

    const parsed = JSON.parse(response.SecretString) as Record<string, unknown>;
    return {
      host: String(parsed['host'] ?? ''),
      port: Number(parsed['port'] ?? 5432),
      dbname: String(parsed['dbname'] ?? 'seraphim'),
      username: String(parsed['username'] ?? 'postgres'),
      password: String(parsed['password'] ?? ''),
    };
  } catch {
    return null;
  }
}

async function findAuroraSecret(client: SecretsManagerClient): Promise<string | null> {
  try {
    // Use the AWS SDK to list secrets — look for one containing 'Aurora'
    const { ListSecretsCommand } = await import('@aws-sdk/client-secrets-manager');
    const response = await client.send(new ListSecretsCommand({ MaxResults: 100 }));
    const auroraSecret = response.SecretList?.find(s =>
      s.Name?.toLowerCase().includes('aurora')
    );
    return auroraSecret?.Name ?? null;
  } catch {
    return null;
  }
}

async function runMigrations(client: Client): Promise<void> {
  // Create pgvector extension
  await client.query('CREATE EXTENSION IF NOT EXISTS vector');

  // Tenants table
  await client.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL CHECK (type IN ('king', 'queen', 'platform_user')),
      parent_tenant_id UUID REFERENCES tenants(id),
      config JSONB DEFAULT '{}',
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Agent Programs
  await client.query(`
    CREATE TABLE IF NOT EXISTS agent_programs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      name VARCHAR(255) NOT NULL,
      version VARCHAR(50) NOT NULL,
      pillar VARCHAR(100) NOT NULL,
      definition JSONB NOT NULL,
      status VARCHAR(50) DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, name, version)
    )
  `);

  // State Machine Definitions
  await client.query(`
    CREATE TABLE IF NOT EXISTS state_machine_definitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      name VARCHAR(255) NOT NULL,
      version VARCHAR(50) NOT NULL,
      definition JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, name, version)
    )
  `);

  // State Machine Instances
  await client.query(`
    CREATE TABLE IF NOT EXISTS state_machine_instances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      definition_id UUID NOT NULL REFERENCES state_machine_definitions(id),
      entity_id VARCHAR(255) NOT NULL,
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      current_state VARCHAR(100) NOT NULL,
      data JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Memory Entries with pgvector
  await client.query(`
    CREATE TABLE IF NOT EXISTS memory_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      layer VARCHAR(20) NOT NULL CHECK (layer IN ('episodic', 'semantic', 'procedural', 'working')),
      content TEXT NOT NULL,
      embedding vector(1536),
      source_agent_id UUID,
      tags TEXT[] DEFAULT ARRAY[]::text[],
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      conflicts_with UUID[]
    )
  `);

  // HNSW index for vector similarity search
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_memory_embedding
      ON memory_entries USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_memory_tenant_layer ON memory_entries (tenant_id, layer)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_entries (source_agent_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_memory_created ON memory_entries (created_at DESC)`);

  // Completion Contracts
  await client.query(`
    CREATE TABLE IF NOT EXISTS completion_contracts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      workflow_type VARCHAR(255) NOT NULL,
      version VARCHAR(50) NOT NULL,
      output_schema JSONB NOT NULL,
      verification_steps JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, workflow_type, version)
    )
  `);

  // Token Usage
  await client.query(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      agent_id UUID NOT NULL,
      pillar VARCHAR(100) NOT NULL,
      provider VARCHAR(50) NOT NULL,
      model VARCHAR(100) NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_usd DECIMAL(10, 6) NOT NULL,
      task_type VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_token_usage_daily ON token_usage (tenant_id, agent_id, created_at)`);

  // Enable Row-Level Security
  const rlsTables = ['agent_programs', 'state_machine_definitions', 'state_machine_instances', 'memory_entries', 'completion_contracts', 'token_usage'];

  for (const table of rlsTables) {
    await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await client.query(`
      DO $$ BEGIN
        CREATE POLICY tenant_isolation_policy ON ${table}
          USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE POLICY tenant_insert_policy ON ${table}
          FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  // Tenants RLS
  await client.query('ALTER TABLE tenants ENABLE ROW LEVEL SECURITY');
  await client.query(`
    DO $$ BEGIN
      CREATE POLICY tenant_self_policy ON tenants
        USING (id = current_setting('app.current_tenant_id')::uuid);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
}
