/**
 * Repository for `state_machine_definitions` and `state_machine_instances` tables.
 *
 * Validates: Requirements 14.1 (multi-tenant isolation)
 */

import type { ConnectionPoolManager } from './connection.js';
import { BaseRepository, type PaginationOptions, type QueryResult } from './repository.js';

// ---------------------------------------------------------------------------
// DB row shapes
// ---------------------------------------------------------------------------

export interface StateMachineDefinitionRow {
  id: string;
  tenantId: string;
  name: string;
  version: string;
  definition: Record<string, unknown>;
  createdAt: Date;
}

export interface StateMachineInstanceRow {
  id: string;
  definitionId: string;
  entityId: string;
  tenantId: string;
  currentState: string;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// StateMachineDefinitionRepository
// ---------------------------------------------------------------------------

export class StateMachineDefinitionRepository extends BaseRepository<StateMachineDefinitionRow> {
  constructor(pool: ConnectionPoolManager) {
    super(pool, 'state_machine_definitions');
  }

  /**
   * Find a definition by name and version.
   */
  async findByNameAndVersion(
    tenantId: string,
    name: string,
    version: string,
  ): Promise<StateMachineDefinitionRow | null> {
    const rows = await this.queryRows(
      tenantId,
      `SELECT * FROM state_machine_definitions WHERE tenant_id = $1 AND name = $2 AND version = $3 LIMIT 1`,
      [tenantId, name, version],
    );
    return rows[0] ?? null;
  }

  /**
   * Find the latest version of a definition by name.
   */
  async findLatestByName(
    tenantId: string,
    name: string,
  ): Promise<StateMachineDefinitionRow | null> {
    const rows = await this.queryRows(
      tenantId,
      `SELECT * FROM state_machine_definitions WHERE tenant_id = $1 AND name = $2 ORDER BY created_at DESC LIMIT 1`,
      [tenantId, name],
    );
    return rows[0] ?? null;
  }

  protected mapRow(row: Record<string, unknown>): StateMachineDefinitionRow {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      name: row.name as string,
      version: row.version as string,
      definition: (typeof row.definition === 'string'
        ? JSON.parse(row.definition)
        : row.definition ?? {}) as Record<string, unknown>,
      createdAt: new Date(row.created_at as string),
    };
  }
}

// ---------------------------------------------------------------------------
// StateMachineInstanceRepository
// ---------------------------------------------------------------------------

export class StateMachineInstanceRepository extends BaseRepository<StateMachineInstanceRow> {
  constructor(pool: ConnectionPoolManager) {
    super(pool, 'state_machine_instances');
  }

  /**
   * Find an instance by entity ID.
   */
  async findByEntityId(
    tenantId: string,
    entityId: string,
  ): Promise<StateMachineInstanceRow | null> {
    const rows = await this.queryRows(
      tenantId,
      `SELECT * FROM state_machine_instances WHERE tenant_id = $1 AND entity_id = $2 LIMIT 1`,
      [tenantId, entityId],
    );
    return rows[0] ?? null;
  }

  /**
   * Find all instances for a given definition.
   */
  async findByDefinitionId(
    tenantId: string,
    definitionId: string,
    pagination?: PaginationOptions,
  ): Promise<QueryResult<StateMachineInstanceRow>> {
    const limit = pagination?.limit ?? 100;
    const offset = pagination?.offset ?? 0;

    const [rows, countRows] = await Promise.all([
      this.queryRows(
        tenantId,
        `SELECT * FROM state_machine_instances WHERE tenant_id = $1 AND definition_id = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
        [tenantId, definitionId, limit, offset],
      ),
      this.queryRaw(
        tenantId,
        `SELECT COUNT(*)::int AS total FROM state_machine_instances WHERE tenant_id = $1 AND definition_id = $2`,
        [tenantId, definitionId],
      ),
    ]);

    return {
      rows,
      total: (countRows[0]?.total as number) ?? 0,
    };
  }

  /**
   * Find instances in a specific state.
   */
  async findByState(
    tenantId: string,
    currentState: string,
  ): Promise<StateMachineInstanceRow[]> {
    return this.queryRows(
      tenantId,
      `SELECT * FROM state_machine_instances WHERE tenant_id = $1 AND current_state = $2 ORDER BY updated_at DESC`,
      [tenantId, currentState],
    );
  }

  /**
   * Update the current state and data of an instance.
   */
  async updateState(
    tenantId: string,
    id: string,
    currentState: string,
    data: Record<string, unknown>,
  ): Promise<StateMachineInstanceRow | null> {
    const rows = await this.queryRows(
      tenantId,
      `UPDATE state_machine_instances
       SET current_state = $1, data = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [currentState, JSON.stringify(data), id, tenantId],
    );
    return rows[0] ?? null;
  }

  protected mapRow(row: Record<string, unknown>): StateMachineInstanceRow {
    return {
      id: row.id as string,
      definitionId: row.definition_id as string,
      entityId: row.entity_id as string,
      tenantId: row.tenant_id as string,
      currentState: row.current_state as string,
      data: (typeof row.data === 'string'
        ? JSON.parse(row.data)
        : row.data ?? {}) as Record<string, unknown>,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
