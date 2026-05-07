/**
 * Auto-Migration Module
 *
 * Runs database schema migrations automatically on server boot.
 * Connects to Aurora PostgreSQL via credentials from Secrets Manager,
 * creates tables if they don't exist, and seeds the system tenant.
 *
 * This is the autonomous approach — no manual migration steps needed.
 */

import { Client } from 'pg';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

export interface MigrationResult {
  success: boolean;
  tablesCreated: string[];
  error?: string;
}

export interface AuroraCredentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/**
 * Fetch Aurora credentials from Secrets Manager.
 */
export async function getAuroraCredentials(
  secretName: string,
  region: string = 'us-east-1',
): Promise<AuroraCredentials | null> {
  try {
    const client = new SecretsManagerClient({ region });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );

    if (!response.SecretString) return null;

    const secret = JSON.parse(response.SecretString) as Record<string, unknown>;
    return {
      host: String(secret.host),
      port: Number(secret.port ?? 5432),
      database: String(secret.dbname ?? secret.database ?? 'seraphim'),
      username: String(secret.username),
      password: String(secret.password),
    };
  } catch (err) {
    console.error('[auto-migrate] Failed to fetch credentials:', (err as Error).message);
    return null;
  }
}

/**
 * Run the initial schema migration against Aurora.
 * Idempotent — uses IF NOT EXISTS for all DDL.
 */
export async function runMigrations(creds: AuroraCredentials): Promise<MigrationResult> {
  const client = new Client({
    host: creds.host,
    port: creds.port,
    database: creds.database,
    user: creds.username,
    password: creds.password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  const tablesCreated: string[] = [];

  try {
    await client.connect();
    console.log('[auto-migrate] Connected to Aurora PostgreSQL');

    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('[auto-migrate] pgvector extension enabled');

    // Create tables (idempotent)
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
    tablesCreated.push('tenants');

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
    tablesCreated.push('agent_programs');

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
    tablesCreated.push('state_machine_definitions');

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
    tablesCreated.push('state_machine_instances');

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
    tablesCreated.push('memory_entries');

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
    tablesCreated.push('completion_contracts');

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
    tablesCreated.push('token_usage');

    // Create indexes (idempotent)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_memory_tenant_layer ON memory_entries(tenant_id, layer);
      CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_entries(source_agent_id);
      CREATE INDEX IF NOT EXISTS idx_memory_created ON memory_entries(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_token_usage_daily ON token_usage(tenant_id, agent_id, created_at);
    `);

    // HNSW index for vector search (skip if already exists)
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_memory_embedding
          ON memory_entries USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)
      `);
    } catch {
      // HNSW index may already exist or vector column may not support it yet
      console.log('[auto-migrate] HNSW index skipped (may already exist)');
    }

    // Seed system tenant (idempotent)
    await client.query(`
      INSERT INTO tenants (id, name, type, config)
      VALUES ('00000000-0000-0000-0000-000000000001', 'System', 'king', '{"isSystem": true}')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('[auto-migrate] System tenant seeded');

    console.log(`[auto-migrate] Migration complete — ${tablesCreated.length} tables ensured`);
    return { success: true, tablesCreated };
  } catch (err) {
    const message = (err as Error).message;
    console.error('[auto-migrate] Migration failed:', message);
    return { success: false, tablesCreated, error: message };
  } finally {
    await client.end().catch(() => {});
  }
}
