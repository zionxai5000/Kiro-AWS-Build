/**
 * Repository for the `completion_contracts` table.
 *
 * Validates: Requirements 3.3 (completion contract validation), 14.1 (multi-tenant isolation)
 */

import type { ConnectionPoolManager } from './connection.js';
import { BaseRepository } from './repository.js';

// ---------------------------------------------------------------------------
// DB row shape
// ---------------------------------------------------------------------------

export interface CompletionContractRow {
  id: string;
  tenantId: string;
  workflowType: string;
  version: string;
  outputSchema: Record<string, unknown>;
  verificationSteps: Record<string, unknown>[];
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// CompletionContractRepository
// ---------------------------------------------------------------------------

export class CompletionContractRepository extends BaseRepository<CompletionContractRow> {
  constructor(pool: ConnectionPoolManager) {
    super(pool, 'completion_contracts');
  }

  /**
   * Find a contract by workflow type and version.
   */
  async findByWorkflowAndVersion(
    tenantId: string,
    workflowType: string,
    version: string,
  ): Promise<CompletionContractRow | null> {
    const rows = await this.queryRows(
      tenantId,
      `SELECT * FROM completion_contracts WHERE tenant_id = $1 AND workflow_type = $2 AND version = $3 LIMIT 1`,
      [tenantId, workflowType, version],
    );
    return rows[0] ?? null;
  }

  /**
   * Find the latest version of a contract by workflow type.
   */
  async findLatestByWorkflow(
    tenantId: string,
    workflowType: string,
  ): Promise<CompletionContractRow | null> {
    const rows = await this.queryRows(
      tenantId,
      `SELECT * FROM completion_contracts WHERE tenant_id = $1 AND workflow_type = $2 ORDER BY created_at DESC LIMIT 1`,
      [tenantId, workflowType],
    );
    return rows[0] ?? null;
  }

  /**
   * Find all contracts for a workflow type.
   */
  async findAllByWorkflow(
    tenantId: string,
    workflowType: string,
  ): Promise<CompletionContractRow[]> {
    return this.queryRows(
      tenantId,
      `SELECT * FROM completion_contracts WHERE tenant_id = $1 AND workflow_type = $2 ORDER BY created_at DESC`,
      [tenantId, workflowType],
    );
  }

  /**
   * Create a completion contract.
   */
  override async create(
    tenantId: string,
    data: Partial<CompletionContractRow>,
  ): Promise<CompletionContractRow> {
    const rows = await this.queryRows(
      tenantId,
      `INSERT INTO completion_contracts (tenant_id, workflow_type, version, output_schema, verification_steps)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        tenantId,
        data.workflowType,
        data.version,
        JSON.stringify(data.outputSchema ?? {}),
        JSON.stringify(data.verificationSteps ?? []),
      ],
    );
    return rows[0];
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): CompletionContractRow {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      workflowType: row.workflow_type as string,
      version: row.version as string,
      outputSchema: (typeof row.output_schema === 'string'
        ? JSON.parse(row.output_schema)
        : row.output_schema ?? {}) as Record<string, unknown>,
      verificationSteps: (typeof row.verification_steps === 'string'
        ? JSON.parse(row.verification_steps)
        : row.verification_steps ?? []) as Record<string, unknown>[],
      createdAt: new Date(row.created_at as string),
    };
  }
}
