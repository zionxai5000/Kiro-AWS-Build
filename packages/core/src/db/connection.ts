/**
 * Database connection pool manager for Aurora PostgreSQL.
 *
 * Reads connection credentials from AWS Secrets Manager at runtime.
 * Sets `app.current_tenant_id` session variable on each client checkout
 * to enforce row-level security (RLS) policies.
 *
 * Validates: Requirements 14.1 (multi-tenant isolation), 20.1 (credentials from Secrets Manager)
 */

import { Pool, type PoolClient, type PoolConfig } from 'pg';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DatabaseCredentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface ConnectionPoolOptions {
  /** AWS Secrets Manager secret name or ARN for the DB credentials. */
  secretName: string;
  /** AWS region for Secrets Manager. Defaults to `us-east-1`. */
  region?: string;
  /** Maximum number of clients in the pool. Defaults to 20. */
  maxConnections?: number;
  /** Idle timeout in milliseconds. Defaults to 30 000. */
  idleTimeoutMs?: number;
  /** Connection timeout in milliseconds. Defaults to 5 000. */
  connectionTimeoutMs?: number;
  /** SSL mode. Defaults to true for Aurora. */
  ssl?: boolean;
}

// ---------------------------------------------------------------------------
// ConnectionPoolManager
// ---------------------------------------------------------------------------

export class ConnectionPoolManager {
  private pool: Pool | null = null;
  private readonly secretsClient: SecretsManagerClient;
  private readonly options: Required<ConnectionPoolOptions>;
  private credentials: DatabaseCredentials | null = null;

  constructor(options: ConnectionPoolOptions) {
    this.options = {
      secretName: options.secretName,
      region: options.region ?? 'us-east-1',
      maxConnections: options.maxConnections ?? 20,
      idleTimeoutMs: options.idleTimeoutMs ?? 30_000,
      connectionTimeoutMs: options.connectionTimeoutMs ?? 5_000,
      ssl: options.ssl ?? true,
    };

    this.secretsClient = new SecretsManagerClient({ region: this.options.region });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialise the connection pool by fetching credentials from Secrets Manager.
   * Must be called before any queries.
   */
  async initialize(): Promise<void> {
    this.credentials = await this.fetchCredentials();

    const poolConfig: PoolConfig = {
      host: this.credentials.host,
      port: this.credentials.port,
      database: this.credentials.database,
      user: this.credentials.username,
      password: this.credentials.password,
      max: this.options.maxConnections,
      idleTimeoutMillis: this.options.idleTimeoutMs,
      connectionTimeoutMillis: this.options.connectionTimeoutMs,
      ssl: this.options.ssl ? { rejectUnauthorized: true } : undefined,
    };

    this.pool = new Pool(poolConfig);

    // Verify connectivity
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  /**
   * Drain the pool and release all connections.
   */
  async shutdown(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  // -----------------------------------------------------------------------
  // Tenant-scoped client
  // -----------------------------------------------------------------------

  /**
   * Acquire a client from the pool with the `app.current_tenant_id` session
   * variable set for RLS enforcement.
   *
   * **Callers must release the client** when done (use `try / finally`).
   */
  async getClient(tenantId: string): Promise<PoolClient> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      // Set the session variable used by RLS policies
      await client.query("SET app.current_tenant_id = $1", [tenantId]);
    } catch (err) {
      client.release();
      throw err;
    }

    return client;
  }

  /**
   * Execute a single query within a tenant-scoped session.
   * Automatically acquires and releases a client.
   */
  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    tenantId: string,
    text: string,
    values?: unknown[],
  ): Promise<T[]> {
    const client = await this.getClient(tenantId);
    try {
      const result = await client.query<T>(text, values);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a callback inside a transaction with tenant isolation.
   */
  async transaction<T>(
    tenantId: string,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getClient(tenantId);
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // -----------------------------------------------------------------------
  // Pool stats (useful for health checks)
  // -----------------------------------------------------------------------

  getPoolStats(): { total: number; idle: number; waiting: number } {
    const pool = this.getPool();
    return {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error(
        'ConnectionPoolManager has not been initialized. Call initialize() first.',
      );
    }
    return this.pool;
  }

  private async fetchCredentials(): Promise<DatabaseCredentials> {
    const command = new GetSecretValueCommand({
      SecretId: this.options.secretName,
    });

    const response = await this.secretsClient.send(command);

    if (!response.SecretString) {
      throw new Error(
        `Secret "${this.options.secretName}" has no string value.`,
      );
    }

    const parsed: unknown = JSON.parse(response.SecretString);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('host' in parsed) ||
      !('port' in parsed) ||
      !('dbname' in parsed) ||
      !('username' in parsed) ||
      !('password' in parsed)
    ) {
      throw new Error(
        `Secret "${this.options.secretName}" does not contain the expected credential fields (host, port, dbname, username, password).`,
      );
    }

    const secret = parsed as Record<string, unknown>;

    return {
      host: String(secret.host),
      port: Number(secret.port),
      database: String(secret.dbname),
      username: String(secret.username),
      password: String(secret.password),
    };
  }
}
