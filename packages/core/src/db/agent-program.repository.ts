/**
 * Repository for the `agent_programs` table.
 *
 * Validates: Requirements 14.1 (multi-tenant isolation)
 */

import type { ConnectionPoolManager } from './connection.js';
import { BaseRepository, type PaginationOptions, type QueryResult } from './repository.js';

// ---------------------------------------------------------------------------
// DB row shape
// ---------------------------------------------------------------------------

export interface AgentProgramRow {
  id: string;
  tenantId: string;
  name: string;
  version: string;
  pillar: string;
  definition: Record<string, unknown>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// AgentProgramRepository
// ---------------------------------------------------------------------------

export class AgentProgramRepository extends BaseRepository<AgentProgramRow> {
  constructor(pool: ConnectionPoolManager) {
    super(pool, 'agent_programs');
  }

  /**
   * Find an agent program by name and version within a tenant.
   */
  async findByNameAndVersion(
    tenantId: string,
    name: string,
    version: string,
  ): Promise<AgentProgramRow | null> {
    const rows = await this.queryRows(
      tenantId,
      `SELECT * FROM agent_programs WHERE tenant_id = $1 AND name = $2 AND version = $3 LIMIT 1`,
      [tenantId, name, version],
    );
    return rows[0] ?? null;
  }

  /**
   * Find all versions of an agent program by name.
   */
  async findAllVersions(
    tenantId: string,
    name: string,
  ): Promise<AgentProgramRow[]> {
    return this.queryRows(
      tenantId,
      `SELECT * FROM agent_programs WHERE tenant_id = $1 AND name = $2 ORDER BY created_at DESC`,
      [tenantId, name],
    );
  }

  /**
   * Find agent programs by pillar.
   */
  async findByPillar(
    tenantId: string,
    pillar: string,
    pagination?: PaginationOptions,
  ): Promise<QueryResult<AgentProgramRow>> {
    const limit = pagination?.limit ?? 100;
    const offset = pagination?.offset ?? 0;

    const [rows, countRows] = await Promise.all([
      this.queryRows(
        tenantId,
        `SELECT * FROM agent_programs WHERE tenant_id = $1 AND pillar = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
        [tenantId, pillar, limit, offset],
      ),
      this.queryRaw(
        tenantId,
        `SELECT COUNT(*)::int AS total FROM agent_programs WHERE tenant_id = $1 AND pillar = $2`,
        [tenantId, pillar],
      ),
    ]);

    return {
      rows,
      total: (countRows[0]?.total as number) ?? 0,
    };
  }

  /**
   * Find agent programs by status.
   */
  async findByStatus(
    tenantId: string,
    status: string,
  ): Promise<AgentProgramRow[]> {
    return this.queryRows(
      tenantId,
      `SELECT * FROM agent_programs WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC`,
      [tenantId, status],
    );
  }

  /**
   * Update the status of an agent program.
   */
  async updateStatus(
    tenantId: string,
    id: string,
    status: string,
  ): Promise<AgentProgramRow | null> {
    return this.update(tenantId, id, { status } as Partial<AgentProgramRow>);
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): AgentProgramRow {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      name: row.name as string,
      version: row.version as string,
      pillar: row.pillar as string,
      definition: (typeof row.definition === 'string'
        ? JSON.parse(row.definition)
        : row.definition ?? {}) as Record<string, unknown>,
      status: row.status as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
