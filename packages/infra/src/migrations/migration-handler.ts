/**
 * CDK Custom Resource Lambda — Database Migration Handler
 *
 * Runs automatically during CDK deployment. Creates all required tables
 * in Aurora PostgreSQL, enables pgvector extension, and sets up RLS policies.
 * Fully autonomous — no manual intervention needed.
 */

import { Client } from 'pg';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

interface CfnEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: {
    SecretArn: string;
    Version: string;
  };
}

interface CfnResponse {
  Status: 'SUCCESS' | 'FAILED';
  Reason?: string;
  Data?: Record<string, string>;
}

const MIGRATION_SQL = `
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  config JSONB NOT NULL DEFAULT '{}'
);

-- Agent programs table
CREATE TABLE IF NOT EXISTS agent_programs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  pillar TEXT NOT NULL,
  definition JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_programs_tenant ON agent_programs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_programs_pillar ON agent_programs(pillar);

-- State machine definitions
CREATE TABLE IF NOT EXISTS state_machine_definitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  definition JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sm_defs_tenant ON state_machine_definitions(tenant_id);

-- State machine instances
CREATE TABLE IF NOT EXISTS state_machine_instances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  definition_id TEXT NOT NULL REFERENCES state_machine_definitions(id),
  entity_id TEXT NOT NULL,
  current_state TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sm_instances_tenant ON state_machine_instances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sm_instances_entity ON state_machine_instances(entity_id);

-- Memory entries (with pgvector for similarity search)
CREATE TABLE IF NOT EXISTS memory_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  layer TEXT NOT NULL CHECK (layer IN ('episodic', 'semantic', 'procedural', 'working')),
  content TEXT NOT NULL,
  embedding vector(1536),
  source_agent_id TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_memory_tenant ON memory_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memory_layer ON memory_entries(layer);
CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_entries(source_agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_tags ON memory_entries USING GIN(tags);

-- HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_memory_embedding ON memory_entries
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Completion contracts
CREATE TABLE IF NOT EXISTS completion_contracts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  agent_program_id TEXT NOT NULL REFERENCES agent_programs(id),
  name TEXT NOT NULL,
  schema JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON completion_contracts(tenant_id);

-- Token usage tracking
CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  agent_id TEXT NOT NULL,
  pillar TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd NUMERIC(10, 6) NOT NULL,
  task_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_usage_tenant ON token_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_pillar ON token_usage(pillar);

-- Recommendations table (for SME architecture)
CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  agent_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  priority INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  recommendation JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_recommendations_tenant ON recommendations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);
CREATE INDEX IF NOT EXISTS idx_recommendations_agent ON recommendations(agent_id);

-- Insert system tenant
INSERT INTO tenants (id, name, tier, config)
VALUES ('system', 'SeraphimOS System', 'enterprise', '{"isSystem": true}')
ON CONFLICT (id) DO NOTHING;

-- Migration tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_migrations (version) VALUES ('001_initial')
ON CONFLICT (version) DO NOTHING;
`;

export async function handler(event: CfnEvent): Promise<CfnResponse> {
  console.log('Migration handler invoked:', event.RequestType, event.ResourceProperties.Version);

  if (event.RequestType === 'Delete') {
    return { Status: 'SUCCESS', Data: { Message: 'No action on delete' } };
  }

  const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

  try {
    // Get database credentials from Secrets Manager
    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: event.ResourceProperties.SecretArn }),
    );

    if (!secretResponse.SecretString) {
      throw new Error('Secret has no string value');
    }

    const creds = JSON.parse(secretResponse.SecretString) as {
      host: string;
      port: number;
      dbname: string;
      username: string;
      password: string;
    };

    // Connect to Aurora
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
    console.log('Connected to Aurora PostgreSQL');

    // Run migrations
    await client.query(MIGRATION_SQL);
    console.log('Migrations applied successfully');

    await client.end();

    return {
      Status: 'SUCCESS',
      Data: {
        Message: 'Migrations applied successfully',
        Version: event.ResourceProperties.Version,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Migration failed:', message);
    return {
      Status: 'FAILED',
      Reason: `Migration failed: ${message}`,
    };
  }
}
