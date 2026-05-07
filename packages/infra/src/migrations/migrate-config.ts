/**
 * Migration configuration for node-pg-migrate.
 *
 * At runtime the connection string is read from the DATABASE_URL environment
 * variable (which should be populated from AWS Secrets Manager).
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx node-pg-migrate up
 */

import type { RunnerOption } from 'node-pg-migrate';

const migrateConfig: Partial<RunnerOption> = {
  databaseUrl: process.env['DATABASE_URL'] ?? '',
  dir: 'src/migrations',
  direction: 'up',
  migrationsTable: 'pgmigrations',
  schema: 'public',
  createSchema: false,
  createMigrationsSchema: false,
  verbose: true,
  log: console.log,
};

export default migrateConfig;
