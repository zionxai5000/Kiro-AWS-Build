/**
 * Repository for the `token_usage` table.
 *
 * Tracks LLM token consumption per agent, pillar, and model for cost management.
 *
 * Validates: Requirements 5.2 (budget enforcement), 14.1 (multi-tenant isolation)
 */

import type { ConnectionPoolManager } from './connection.js';
import { BaseRepository } from './repository.js';

// ---------------------------------------------------------------------------
// DB row shape
// ---------------------------------------------------------------------------

export interface TokenUsageRow {
  id: string;
  tenantId: string;
  agentId: string;
  pillar: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  taskType: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Aggregation types
// ---------------------------------------------------------------------------

export interface UsageAggregate {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  count: number;
}

export interface UsageByAgent {
  agentId: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface UsageByPillar {
  pillar: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface UsageByModel {
  provider: string;
  model: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

// ---------------------------------------------------------------------------
// TokenUsageRepository
// ---------------------------------------------------------------------------

export class TokenUsageRepository extends BaseRepository<TokenUsageRow> {
  constructor(pool: ConnectionPoolManager) {
    super(pool, 'token_usage');
  }

  /**
   * Record a new token usage entry.
   */
  async record(
    tenantId: string,
    data: Omit<TokenUsageRow, 'id' | 'createdAt'>,
  ): Promise<TokenUsageRow> {
    const rows = await this.queryRows(
      tenantId,
      `INSERT INTO token_usage (tenant_id, agent_id, pillar, provider, model, input_tokens, output_tokens, cost_usd, task_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        tenantId,
        data.agentId,
        data.pillar,
        data.provider,
        data.model,
        data.inputTokens,
        data.outputTokens,
        data.costUsd,
        data.taskType,
      ],
    );
    return rows[0];
  }

  /**
   * Get aggregate usage for a tenant within a date range.
   */
  async getAggregate(
    tenantId: string,
    dateRange: { start: Date; end: Date },
  ): Promise<UsageAggregate> {
    const rows = await this.queryRaw(
      tenantId,
      `SELECT
         COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
         COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens,
         COALESCE(SUM(cost_usd), 0)::float AS total_cost_usd,
         COUNT(*)::int AS count
       FROM token_usage
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [tenantId, dateRange.start.toISOString(), dateRange.end.toISOString()],
    );

    const row = rows[0] ?? {};
    return {
      totalInputTokens: Number(row.total_input_tokens ?? 0),
      totalOutputTokens: Number(row.total_output_tokens ?? 0),
      totalCostUsd: Number(row.total_cost_usd ?? 0),
      count: Number(row.count ?? 0),
    };
  }

  /**
   * Get daily usage for a specific agent.
   */
  async getDailyUsageByAgent(
    tenantId: string,
    agentId: string,
    date: Date,
  ): Promise<UsageAggregate> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const rows = await this.queryRaw(
      tenantId,
      `SELECT
         COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
         COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens,
         COALESCE(SUM(cost_usd), 0)::float AS total_cost_usd,
         COUNT(*)::int AS count
       FROM token_usage
       WHERE tenant_id = $1 AND agent_id = $2 AND created_at >= $3 AND created_at <= $4`,
      [tenantId, agentId, startOfDay.toISOString(), endOfDay.toISOString()],
    );

    const row = rows[0] ?? {};
    return {
      totalInputTokens: Number(row.total_input_tokens ?? 0),
      totalOutputTokens: Number(row.total_output_tokens ?? 0),
      totalCostUsd: Number(row.total_cost_usd ?? 0),
      count: Number(row.count ?? 0),
    };
  }

  /**
   * Get usage breakdown by agent.
   */
  async getUsageByAgent(
    tenantId: string,
    dateRange: { start: Date; end: Date },
  ): Promise<UsageByAgent[]> {
    const rows = await this.queryRaw(
      tenantId,
      `SELECT
         agent_id,
         COALESCE(SUM(cost_usd), 0)::float AS total_cost_usd,
         COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
         COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens
       FROM token_usage
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY agent_id
       ORDER BY total_cost_usd DESC`,
      [tenantId, dateRange.start.toISOString(), dateRange.end.toISOString()],
    );

    return rows.map((r) => ({
      agentId: r.agent_id as string,
      totalCostUsd: Number(r.total_cost_usd),
      totalInputTokens: Number(r.total_input_tokens),
      totalOutputTokens: Number(r.total_output_tokens),
    }));
  }

  /**
   * Get usage breakdown by pillar.
   */
  async getUsageByPillar(
    tenantId: string,
    dateRange: { start: Date; end: Date },
  ): Promise<UsageByPillar[]> {
    const rows = await this.queryRaw(
      tenantId,
      `SELECT
         pillar,
         COALESCE(SUM(cost_usd), 0)::float AS total_cost_usd,
         COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
         COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens
       FROM token_usage
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY pillar
       ORDER BY total_cost_usd DESC`,
      [tenantId, dateRange.start.toISOString(), dateRange.end.toISOString()],
    );

    return rows.map((r) => ({
      pillar: r.pillar as string,
      totalCostUsd: Number(r.total_cost_usd),
      totalInputTokens: Number(r.total_input_tokens),
      totalOutputTokens: Number(r.total_output_tokens),
    }));
  }

  /**
   * Get usage breakdown by model.
   */
  async getUsageByModel(
    tenantId: string,
    dateRange: { start: Date; end: Date },
  ): Promise<UsageByModel[]> {
    const rows = await this.queryRaw(
      tenantId,
      `SELECT
         provider,
         model,
         COALESCE(SUM(cost_usd), 0)::float AS total_cost_usd,
         COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
         COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens
       FROM token_usage
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY provider, model
       ORDER BY total_cost_usd DESC`,
      [tenantId, dateRange.start.toISOString(), dateRange.end.toISOString()],
    );

    return rows.map((r) => ({
      provider: r.provider as string,
      model: r.model as string,
      totalCostUsd: Number(r.total_cost_usd),
      totalInputTokens: Number(r.total_input_tokens),
      totalOutputTokens: Number(r.total_output_tokens),
    }));
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): TokenUsageRow {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      agentId: row.agent_id as string,
      pillar: row.pillar as string,
      provider: row.provider as string,
      model: row.model as string,
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      costUsd: Number(row.cost_usd),
      taskType: (row.task_type as string) ?? null,
      createdAt: new Date(row.created_at as string),
    };
  }
}
