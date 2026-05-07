/**
 * Repository for the `memory_entries` table (Zikaron memory system).
 *
 * Supports vector similarity search via pgvector `<=>` operator.
 *
 * Validates: Requirements 4.1 (Zikaron memory layers), 14.1 (multi-tenant isolation)
 */

import type { MemoryLayer } from '../types/enums.js';
import type { ConnectionPoolManager } from './connection.js';
import { BaseRepository } from './repository.js';

// ---------------------------------------------------------------------------
// DB row shape
// ---------------------------------------------------------------------------

export interface MemoryEntryRow {
  id: string;
  tenantId: string;
  layer: MemoryLayer;
  content: string;
  embedding: number[] | null;
  sourceAgentId: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date | null;
  conflictsWith: string[] | null;
}

// ---------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------

export interface MemorySearchOptions {
  /** Embedding vector for similarity search (1536 dimensions). */
  embedding: number[];
  /** Filter by memory layer(s). */
  layers?: MemoryLayer[];
  /** Filter by source agent. */
  agentId?: string;
  /** Date range filter. */
  dateRange?: { start: Date; end: Date };
  /** Maximum results. Defaults to 10. */
  limit?: number;
}

export interface MemorySearchResult {
  entry: MemoryEntryRow;
  similarity: number;
}

// ---------------------------------------------------------------------------
// MemoryRepository
// ---------------------------------------------------------------------------

export class MemoryRepository extends BaseRepository<MemoryEntryRow> {
  constructor(pool: ConnectionPoolManager) {
    super(pool, 'memory_entries');
  }

  /**
   * Vector similarity search using cosine distance.
   */
  async searchSimilar(
    tenantId: string,
    options: MemorySearchOptions,
  ): Promise<MemorySearchResult[]> {
    const limit = options.limit ?? 10;
    const conditions: string[] = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let paramIndex = 2;

    // Embedding for similarity — pgvector uses `<=>` for cosine distance
    const embeddingParam = `$${paramIndex}`;
    values.push(JSON.stringify(options.embedding));
    paramIndex++;

    if (options.layers && options.layers.length > 0) {
      conditions.push(`layer = ANY($${paramIndex})`);
      values.push(options.layers);
      paramIndex++;
    }

    if (options.agentId) {
      conditions.push(`source_agent_id = $${paramIndex}`);
      values.push(options.agentId);
      paramIndex++;
    }

    if (options.dateRange) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(options.dateRange.start.toISOString());
      paramIndex++;
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(options.dateRange.end.toISOString());
      paramIndex++;
    }

    // Exclude entries without embeddings
    conditions.push('embedding IS NOT NULL');

    const where = conditions.join(' AND ');

    const rows = await this.queryRaw(
      tenantId,
      `SELECT *, 1 - (embedding <=> ${embeddingParam}::vector) AS similarity
       FROM memory_entries
       WHERE ${where}
       ORDER BY embedding <=> ${embeddingParam}::vector ASC
       LIMIT $${paramIndex}`,
      [...values, limit],
    );

    return rows.map((row) => ({
      entry: this.mapRow(row),
      similarity: Number(row.similarity),
    }));
  }

  /**
   * Find entries by layer.
   */
  async findByLayer(
    tenantId: string,
    layer: MemoryLayer,
    limit = 100,
  ): Promise<MemoryEntryRow[]> {
    return this.queryRows(
      tenantId,
      `SELECT * FROM memory_entries WHERE tenant_id = $1 AND layer = $2 ORDER BY created_at DESC LIMIT $3`,
      [tenantId, layer, limit],
    );
  }

  /**
   * Find entries by source agent.
   */
  async findByAgent(
    tenantId: string,
    agentId: string,
    limit = 100,
  ): Promise<MemoryEntryRow[]> {
    return this.queryRows(
      tenantId,
      `SELECT * FROM memory_entries WHERE tenant_id = $1 AND source_agent_id = $2 ORDER BY created_at DESC LIMIT $3`,
      [tenantId, agentId, limit],
    );
  }

  /**
   * Find working memory for a specific agent (latest entry).
   */
  async findWorkingMemory(
    tenantId: string,
    agentId: string,
  ): Promise<MemoryEntryRow | null> {
    const rows = await this.queryRows(
      tenantId,
      `SELECT * FROM memory_entries WHERE tenant_id = $1 AND layer = 'working' AND source_agent_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [tenantId, agentId],
    );
    return rows[0] ?? null;
  }

  /**
   * Find recent episodic entries within a date range.
   */
  async findRecentEpisodic(
    tenantId: string,
    since: Date,
    limit = 50,
  ): Promise<MemoryEntryRow[]> {
    return this.queryRows(
      tenantId,
      `SELECT * FROM memory_entries WHERE tenant_id = $1 AND layer = 'episodic' AND created_at >= $2 ORDER BY created_at DESC LIMIT $3`,
      [tenantId, since.toISOString(), limit],
    );
  }

  /**
   * Find top procedural patterns by success rate (stored in metadata).
   */
  async findTopProcedural(
    tenantId: string,
    limit = 5,
  ): Promise<MemoryEntryRow[]> {
    return this.queryRows(
      tenantId,
      `SELECT * FROM memory_entries
       WHERE tenant_id = $1 AND layer = 'procedural'
       ORDER BY (metadata->>'successRate')::float DESC NULLS LAST
       LIMIT $2`,
      [tenantId, limit],
    );
  }

  /**
   * Flag a conflict between two memory entries.
   */
  async flagConflict(
    tenantId: string,
    entryId: string,
    conflictsWithId: string,
  ): Promise<void> {
    await this.pool.query(
      tenantId,
      `UPDATE memory_entries
       SET conflicts_with = array_append(COALESCE(conflicts_with, ARRAY[]::uuid[]), $1::uuid)
       WHERE id = $2 AND tenant_id = $3`,
      [conflictsWithId, entryId, tenantId],
    );
  }

  /**
   * Delete expired entries.
   */
  async deleteExpired(tenantId: string): Promise<number> {
    const rows = await this.queryRaw(
      tenantId,
      `DELETE FROM memory_entries WHERE tenant_id = $1 AND expires_at IS NOT NULL AND expires_at < NOW() RETURNING id`,
      [tenantId],
    );
    return rows.length;
  }

  /**
   * Create a memory entry with embedding vector.
   */
  async createWithEmbedding(
    tenantId: string,
    data: Omit<MemoryEntryRow, 'id' | 'createdAt'>,
  ): Promise<MemoryEntryRow> {
    const rows = await this.queryRows(
      tenantId,
      `INSERT INTO memory_entries (tenant_id, layer, content, embedding, source_agent_id, tags, metadata, expires_at, conflicts_with)
       VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        tenantId,
        data.layer,
        data.content,
        data.embedding ? JSON.stringify(data.embedding) : null,
        data.sourceAgentId,
        data.tags,
        JSON.stringify(data.metadata),
        data.expiresAt?.toISOString() ?? null,
        data.conflictsWith,
      ],
    );
    return rows[0];
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): MemoryEntryRow {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      layer: row.layer as MemoryLayer,
      content: row.content as string,
      embedding: row.embedding ? this.parseEmbedding(row.embedding) : null,
      sourceAgentId: (row.source_agent_id as string) ?? null,
      tags: (row.tags as string[]) ?? [],
      metadata: (typeof row.metadata === 'string'
        ? JSON.parse(row.metadata)
        : row.metadata ?? {}) as Record<string, unknown>,
      createdAt: new Date(row.created_at as string),
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
      conflictsWith: (row.conflicts_with as string[]) ?? null,
    };
  }

  /**
   * Parse pgvector embedding from string representation `[0.1,0.2,...]` to number[].
   */
  private parseEmbedding(value: unknown): number[] {
    if (Array.isArray(value)) return value as number[];
    if (typeof value === 'string') {
      const trimmed = value.replace(/^\[|\]$/g, '');
      return trimmed.split(',').map(Number);
    }
    return [];
  }
}
