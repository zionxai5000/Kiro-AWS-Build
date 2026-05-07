/**
 * PostgreSQL Persistence Layer for Production Server
 *
 * Provides write-through persistence to Aurora PostgreSQL.
 * The production server uses in-memory repos for fast reads,
 * and this layer mirrors writes to Aurora for durability.
 *
 * When the server restarts, it rehydrates from Aurora.
 */

import { Client } from 'pg';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  ListSecretsCommand,
} from '@aws-sdk/client-secrets-manager';

export interface PgPersistenceConfig {
  region: string;
  secretName?: string;
}

export class PgPersistence {
  private client: Client | null = null;
  private connected = false;
  private readonly region: string;
  private readonly secretName?: string;
  private tenantId = '00000000-0000-0000-0000-000000000001'; // system tenant

  constructor(config: PgPersistenceConfig) {
    this.region = config.region;
    this.secretName = config.secretName;
  }

  async connect(): Promise<boolean> {
    try {
      const secretsClient = new SecretsManagerClient({ region: this.region });

      // Find Aurora secret
      let secretId = this.secretName;
      if (!secretId) {
        const listResp = await secretsClient.send(new ListSecretsCommand({ MaxResults: 100 }));
        const auroraSecret = listResp.SecretList?.find(s => s.Name?.toLowerCase().includes('aurora'));
        secretId = auroraSecret?.Name;
      }
      if (!secretId) return false;

      const resp = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
      if (!resp.SecretString) return false;

      const creds = JSON.parse(resp.SecretString) as Record<string, unknown>;

      this.client = new Client({
        host: String(creds['host']),
        port: Number(creds['port'] ?? 5432),
        database: String(creds['dbname'] ?? 'seraphim'),
        user: String(creds['username']),
        password: String(creds['password']),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      });

      await this.client.connect();
      await this.client.query('SELECT 1');
      this.connected = true;
      return true;
    } catch (err) {
      console.warn(`PgPersistence: connection failed — ${(err as Error).message}`);
      this.connected = false;
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Persist an agent deployment to Aurora.
   */
  async persistAgentDeploy(agent: {
    id: string;
    name: string;
    version: string;
    pillar: string;
    definition: Record<string, unknown>;
  }): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      await this.client.query(`SET app.current_tenant_id = $1`, [this.tenantId]);
      await this.client.query(
        `INSERT INTO agent_programs (id, tenant_id, name, version, pillar, definition, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         ON CONFLICT (tenant_id, name, version) DO UPDATE SET definition = $6, status = 'active', updated_at = NOW()`,
        [agent.id, this.tenantId, agent.name, agent.version, agent.pillar, JSON.stringify(agent.definition)],
      );
    } catch (err) {
      console.warn(`PgPersistence: persistAgentDeploy failed — ${(err as Error).message}`);
    }
  }

  /**
   * Persist token usage to Aurora.
   */
  async persistTokenUsage(usage: {
    agentId: string;
    pillar: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    taskType: string;
  }): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      await this.client.query(`SET app.current_tenant_id = $1`, [this.tenantId]);
      await this.client.query(
        `INSERT INTO token_usage (tenant_id, agent_id, pillar, provider, model, input_tokens, output_tokens, cost_usd, task_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [this.tenantId, usage.agentId, usage.pillar, usage.provider, usage.model, usage.inputTokens, usage.outputTokens, usage.costUsd, usage.taskType],
      );
    } catch (err) {
      console.warn(`PgPersistence: persistTokenUsage failed — ${(err as Error).message}`);
    }
  }

  /**
   * Persist a memory entry to Aurora (with embedding placeholder).
   */
  async persistMemoryEntry(entry: {
    id: string;
    layer: string;
    content: string;
    sourceAgentId: string;
    tags: string[];
    metadata: Record<string, unknown>;
  }): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      await this.client.query(`SET app.current_tenant_id = $1`, [this.tenantId]);
      await this.client.query(
        `INSERT INTO memory_entries (id, tenant_id, layer, content, source_agent_id, tags, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [entry.id, this.tenantId, entry.layer, entry.content, entry.sourceAgentId, entry.tags, JSON.stringify(entry.metadata)],
      );
    } catch (err) {
      console.warn(`PgPersistence: persistMemoryEntry failed — ${(err as Error).message}`);
    }
  }

  /**
   * Persist an audit record to Aurora (supplementary to DynamoDB).
   */
  async persistAuditEntry(entry: {
    agentId: string;
    actionType: string;
    target: string;
    outcome: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    // Audit goes to DynamoDB primarily, but we log a summary to PG for joins
    if (!this.connected || !this.client) return;
    try {
      await this.client.query(`SET app.current_tenant_id = $1`, [this.tenantId]);
      // We don't have a dedicated audit table in PG (it's in DynamoDB)
      // but we can log to memory_entries as episodic for correlation
      await this.client.query(
        `INSERT INTO memory_entries (tenant_id, layer, content, source_agent_id, tags, metadata)
         VALUES ($1, 'episodic', $2, $3, $4, $5)`,
        [
          this.tenantId,
          `Audit: ${entry.actionType} on ${entry.target} → ${entry.outcome}`,
          entry.agentId,
          ['audit', entry.actionType, entry.outcome],
          JSON.stringify(entry.details),
        ],
      );
    } catch (err) {
      // Non-critical — audit is in DynamoDB
    }
  }

  /**
   * Get count of deployed agents from Aurora (for health check).
   */
  async getAgentCount(): Promise<number> {
    if (!this.connected || !this.client) return 0;
    try {
      await this.client.query(`SET app.current_tenant_id = $1`, [this.tenantId]);
      const result = await this.client.query(`SELECT COUNT(*) as count FROM agent_programs WHERE status = 'active'`);
      return parseInt(result.rows[0]?.count ?? '0', 10);
    } catch {
      return 0;
    }
  }

  /**
   * Get total token spend from Aurora.
   */
  async getTotalSpend(): Promise<number> {
    if (!this.connected || !this.client) return 0;
    try {
      await this.client.query(`SET app.current_tenant_id = $1`, [this.tenantId]);
      const result = await this.client.query(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM token_usage`);
      return parseFloat(result.rows[0]?.total ?? '0');
    } catch {
      return 0;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.connected = false;
    }
  }
}
