/**
 * Base repository class that enforces `tenant_id` filtering on all queries.
 *
 * Every concrete repository extends this class and inherits automatic
 * tenant isolation — the base never issues a query without a `tenant_id`
 * predicate (or the RLS session variable set via ConnectionPoolManager).
 *
 * Validates: Requirements 14.1 (multi-tenant isolation), 20.4 (network-level tenant isolation)
 */

import type { PoolClient } from 'pg';
import type { ConnectionPoolManager } from './connection.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface QueryResult<T> {
  rows: T[];
  total: number;
}

// ---------------------------------------------------------------------------
// BaseRepository
// ---------------------------------------------------------------------------

export abstract class BaseRepository<T> {
  protected readonly tableName: string;
  protected readonly pool: ConnectionPoolManager;

  constructor(pool: ConnectionPoolManager, tableName: string) {
    this.pool = pool;
    this.tableName = tableName;
  }

  // -----------------------------------------------------------------------
  // CRUD — all methods require tenantId for RLS enforcement
  // -----------------------------------------------------------------------

  /**
   * Find a single row by primary key within the tenant scope.
   */
  async findById(tenantId: string, id: string): Promise<T | null> {
    const rows = await this.pool.query<Record<string, unknown>>(
      tenantId,
      `SELECT * FROM ${this.tableName} WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [id, tenantId],
    );
    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * Find all rows for a tenant with optional pagination.
   */
  async findAll(
    tenantId: string,
    pagination?: PaginationOptions,
  ): Promise<QueryResult<T>> {
    const limit = pagination?.limit ?? 100;
    const offset = pagination?.offset ?? 0;

    const [rows, countRows] = await Promise.all([
      this.pool.query<Record<string, unknown>>(
        tenantId,
        `SELECT * FROM ${this.tableName} WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      ),
      this.pool.query<Record<string, unknown>>(
        tenantId,
        `SELECT COUNT(*)::int AS total FROM ${this.tableName} WHERE tenant_id = $1`,
        [tenantId],
      ),
    ]);

    return {
      rows: rows.map((r) => this.mapRow(r)),
      total: (countRows[0]?.total as number) ?? 0,
    };
  }

  /**
   * Insert a new row. Returns the inserted row.
   */
  async create(tenantId: string, data: Partial<T>): Promise<T> {
    const { columns, placeholders, values } = this.buildInsert(data, tenantId);

    const rows = await this.pool.query<Record<string, unknown>>(
      tenantId,
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values,
    );

    return this.mapRow(rows[0]);
  }

  /**
   * Update a row by id within the tenant scope. Returns the updated row or null.
   */
  async update(
    tenantId: string,
    id: string,
    data: Partial<T>,
  ): Promise<T | null> {
    const { setClauses, values } = this.buildUpdate(data);
    const paramIndex = values.length + 1;

    const rows = await this.pool.query<Record<string, unknown>>(
      tenantId,
      `UPDATE ${this.tableName} SET ${setClauses}, updated_at = NOW() WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} RETURNING *`,
      [...values, id, tenantId],
    );

    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * Delete a row by id within the tenant scope. Returns true if a row was deleted.
   */
  async delete(tenantId: string, id: string): Promise<boolean> {
    const rows = await this.pool.query<Record<string, unknown>>(
      tenantId,
      `DELETE FROM ${this.tableName} WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId],
    );
    return rows.length > 0;
  }

  // -----------------------------------------------------------------------
  // Protected helpers for subclasses
  // -----------------------------------------------------------------------

  /**
   * Run an arbitrary tenant-scoped query and map the results.
   */
  protected async queryRows(
    tenantId: string,
    sql: string,
    values?: unknown[],
  ): Promise<T[]> {
    const rows = await this.pool.query<Record<string, unknown>>(
      tenantId,
      sql,
      values,
    );
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Run an arbitrary tenant-scoped query returning raw rows.
   */
  protected async queryRaw<R extends Record<string, unknown> = Record<string, unknown>>(
    tenantId: string,
    sql: string,
    values?: unknown[],
  ): Promise<R[]> {
    return this.pool.query<R>(tenantId, sql, values);
  }

  /**
   * Execute within a transaction.
   */
  protected async withTransaction<R>(
    tenantId: string,
    fn: (client: PoolClient) => Promise<R>,
  ): Promise<R> {
    return this.pool.transaction(tenantId, fn);
  }

  // -----------------------------------------------------------------------
  // Abstract — subclasses must implement
  // -----------------------------------------------------------------------

  /**
   * Map a raw database row to the domain type `T`.
   */
  protected abstract mapRow(row: Record<string, unknown>): T;

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildInsert(
    data: Partial<T>,
    tenantId: string,
  ): { columns: string; placeholders: string; values: unknown[] } {
    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );

    // Always include tenant_id
    const columns: string[] = ['tenant_id'];
    const values: unknown[] = [tenantId];
    let paramIndex = 2;

    for (const [key, value] of entries) {
      const col = this.toSnakeCase(key);
      if (col === 'tenant_id') continue; // already added
      columns.push(col);
      values.push(this.serializeValue(value));
      paramIndex++;
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    return { columns: columns.join(', '), placeholders, values };
  }

  private buildUpdate(
    data: Partial<T>,
  ): { setClauses: string; values: unknown[] } {
    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([key, v]) => v !== undefined && key !== 'id' && key !== 'tenantId',
    );

    const clauses: string[] = [];
    const values: unknown[] = [];

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      clauses.push(`${this.toSnakeCase(key)} = $${i + 1}`);
      values.push(this.serializeValue(value));
    }

    return { setClauses: clauses.join(', '), values };
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private serializeValue(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      // pg driver handles JSON serialization for jsonb columns,
      // but arrays of primitives need to stay as arrays for text[] columns.
      if (Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')) {
        return value;
      }
      return JSON.stringify(value);
    }
    return value;
  }
}
