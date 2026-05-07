/**
 * PostgreSQL-backed repositories for production use.
 *
 * These wrap the in-memory repositories with write-through to Aurora PostgreSQL.
 * Reads come from in-memory (fast), writes go to both in-memory and Aurora (durable).
 *
 * This hybrid approach gives us:
 * - Fast reads (no DB round-trip for API responses)
 * - Durable writes (agent state persists across container restarts)
 * - Graceful degradation (if Aurora is down, in-memory still works)
 */

import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

export interface PgConfig {
  client: Client;
  tenantId: string;
}

/**
 * Persists agent deployments and token usage to Aurora PostgreSQL.
 * Called after in-memory operations succeed.
 */
export class PgPersistenceLayer {
  private readonly client: Client;
  private readonly tenantId: string;
  private connected = false;

  constructor(config: PgConfig) {
    this.client = config.client;
    this.tenantId = config.tenantId;
  }

  async initialize(): Promise<boolean> {
    try {
      await this.client.query(`SET app.current_tenant_id = $1`, [this.tenantId]);
      this.connected = true;
      return true;
    } catch (err) {
      console.error('PgPersistenceLayer: failed to initialize', (err as Error).message);
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Persist an agent program deployment to Aurora.
   */
  async persistAgentProgram(program: {
    id: string;
    name: string;
    version: string;
    pillar: string;
    definition: Record<string, unknown>;
  }): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.query(
        `INSERT INTO agent_programs (id, tenant_id, name, version, pillar, definition, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         ON CONFLICT (tenant_id, name, version) DO UPDATE SET
           definition = EXCLUDED.definition,
           status = 'active',
           updated_at = NOW()`,
        [program.id, this.tenantId, program.name, program.version, program.pillar, JSON.stringify(program.definition)],
      );
    } catch (err) {
      console.error(`PgPersistenceLayer: failed to persist agent program ${program.name}:`, (err as Error).message);
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
    if (!this.connected) return;
    try {
      await this.client.query(
        `INSERT INTO token_usage (id, tenant_id, agent_id, pillar, provider, model, input_tokens, output_tokens, cost_usd, task_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [randomUUID(), this.tenantId, usage.agentId, usage.pillar, usage.provider, usage.model, usage.inputTokens, usage.outputTokens, usage.costUsd, usage.taskType],
      );
    } catch (err) {
      console.error('PgPersistenceLayer: failed to persist token usage:', (err as Error).message);
    }
  }

  /**
   * Persist a memory entry to Aurora (with vector embedding).
   */
  async persistMemoryEntry(entry: {
    id: string;
    layer: string;
    content: string;
    embedding: number[];
    sourceAgentId: string;
    tags: string[];
    metadata: Record<string, unknown>;
  }): Promise<void> {
    if (!this.connected) return;
    try {
      const embeddingStr = entry.embedding.length > 0
        ? `[${entry.embedding.join(',')}]`
        : null;

      await this.client.query(
        `INSERT INTO memory_entries (id, tenant_id, layer, content, embedding, source_agent_id, tags, metadata)
         VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [entry.id, this.tenantId, entry.layer, entry.content, embeddingStr, entry.sourceAgentId, entry.tags, JSON.stringify(entry.metadata)],
      );
    } catch (err) {
      console.error('PgPersistenceLayer: failed to persist memory entry:', (err as Error).message);
    }
  }

  /**
   * Persist a recommendation to Aurora.
   */
  async persistRecommendation(rec: {
    id: string;
    agentId: string;
    domain: string;
    priority: number;
    status: string;
    recommendation: Record<string, unknown>;
  }): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.query(
        `INSERT INTO recommendations (id, tenant_id, agent_id, domain, priority, status, recommendation)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           recommendation = EXCLUDED.recommendation`,
        [rec.id, this.tenantId, rec.agentId, rec.domain, rec.priority, rec.status, JSON.stringify(rec.recommendation)],
      );
    } catch (err) {
      console.error('PgPersistenceLayer: failed to persist recommendation:', (err as Error).message);
    }
  }

  /**
   * Query agent programs from Aurora.
   */
  async loadAgentPrograms(): Promise<Array<{ id: string; name: string; version: string; pillar: string; definition: Record<string, unknown> }>> {
    if (!this.connected) return [];
    try {
      const result = await this.client.query(
        `SELECT id, name, version, pillar, definition FROM agent_programs WHERE tenant_id = $1 AND status = 'active'`,
        [this.tenantId],
      );
      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        version: row.version,
        pillar: row.pillar,
        definition: typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition,
      }));
    } catch (err) {
      console.error('PgPersistenceLayer: failed to load agent programs:', (err as Error).message);
      return [];
    }
  }

  /**
   * Get total token spend for today.
   */
  async getTodaySpend(): Promise<number> {
    if (!this.connected) return 0;
    try {
      const result = await this.client.query(
        `SELECT COALESCE(SUM(cost_usd), 0) as total FROM token_usage
         WHERE tenant_id = $1 AND created_at >= CURRENT_DATE`,
        [this.tenantId],
      );
      return parseFloat(result.rows[0]?.total ?? '0');
    } catch {
      return 0;
    }
  }

  async close(): Promise<void> {
    if (this.connected) {
      try { await this.client.end(); } catch { /* ignore */ }
      this.connected = false;
    }
  }
}
