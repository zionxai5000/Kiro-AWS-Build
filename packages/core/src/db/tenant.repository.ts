/**
 * Repository for the `tenants` table.
 *
 * Note: The tenants table uses `id` as the tenant identifier (not a separate
 * `tenant_id` column). RLS policy on tenants checks `id = current_setting('app.current_tenant_id')`.
 *
 * Validates: Requirements 14.1 (multi-tenant isolation)
 */

import type { ConnectionPoolManager } from './connection.js';
import { BaseRepository } from './repository.js';

// ---------------------------------------------------------------------------
// DB row shape
// ---------------------------------------------------------------------------

export interface TenantRow {
  id: string;
  name: string;
  type: 'king' | 'queen' | 'platform_user';
  parentTenantId: string | null;
  config: Record<string, unknown>;
  status: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// TenantRepository
// ---------------------------------------------------------------------------

export class TenantRepository extends BaseRepository<TenantRow> {
  constructor(pool: ConnectionPoolManager) {
    super(pool, 'tenants');
  }

  /**
   * Override findById — tenants table uses `id` as the tenant key.
   */
  override async findById(tenantId: string, id: string): Promise<TenantRow | null> {
    const rows = await this.pool.query<Record<string, unknown>>(
      tenantId,
      `SELECT * FROM tenants WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * Find a tenant by name.
   */
  async findByName(tenantId: string, name: string): Promise<TenantRow | null> {
    const rows = await this.queryRows(
      tenantId,
      `SELECT * FROM tenants WHERE name = $1 LIMIT 1`,
      [name],
    );
    return rows[0] ?? null;
  }

  /**
   * Find child tenants (Queens) of a parent tenant.
   */
  async findChildren(tenantId: string): Promise<TenantRow[]> {
    return this.queryRows(
      tenantId,
      `SELECT * FROM tenants WHERE parent_tenant_id = $1`,
      [tenantId],
    );
  }

  /**
   * Create a tenant. Overrides base to handle the tenants table structure
   * (no separate tenant_id column — the `id` IS the tenant).
   */
  override async create(tenantId: string, data: Partial<TenantRow>): Promise<TenantRow> {
    const rows = await this.pool.query<Record<string, unknown>>(
      tenantId,
      `INSERT INTO tenants (id, name, type, parent_tenant_id, config, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.id ?? tenantId,
        data.name,
        data.type,
        data.parentTenantId ?? null,
        JSON.stringify(data.config ?? {}),
        data.status ?? 'active',
      ],
    );
    return this.mapRow(rows[0]);
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): TenantRow {
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as TenantRow['type'],
      parentTenantId: (row.parent_tenant_id as string) ?? null,
      config: (typeof row.config === 'string'
        ? JSON.parse(row.config)
        : row.config ?? {}) as Record<string, unknown>,
      status: row.status as string,
      createdAt: new Date(row.created_at as string),
    };
  }
}
