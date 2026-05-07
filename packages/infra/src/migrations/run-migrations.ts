/**
 * Programmatic migration runner.
 *
 * Can be invoked from a CDK custom resource Lambda, a CLI script,
 * or directly in tests. Reads DATABASE_URL from the environment.
 *
 * The actual migration files (001_*.ts etc.) are loaded by node-pg-migrate's
 * own TypeScript loader at runtime — they are excluded from the project's
 * tsc build.
 *
 * Usage (CLI):
 *   DATABASE_URL=postgres://... npm run migrate:up --workspace=packages/infra
 *
 * Usage (programmatic):
 *   import { runMigrations } from '@seraphim/infra';
 *   await runMigrations({ databaseUrl: '...' });
 */

import path from 'node:path';

export interface MigrationRunnerOptions {
  /** PostgreSQL connection string. Falls back to DATABASE_URL env var. */
  databaseUrl?: string;
  /** Direction: 'up' (default) or 'down'. */
  direction?: 'up' | 'down';
  /** Number of migrations to run. Defaults to Infinity (all pending). */
  count?: number;
}

export async function runMigrations(options: MigrationRunnerOptions = {}): Promise<void> {
  const databaseUrl = options.databaseUrl ?? process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Set it as an environment variable or pass databaseUrl in options.',
    );
  }

  // Dynamic import to bridge CJS → ESM (node-pg-migrate v8 is ESM-only)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const nodePgMigrate: { default: (opts: Record<string, unknown>) => Promise<void> } =
    await (Function('return import("node-pg-migrate")')() as Promise<{
      default: (opts: Record<string, unknown>) => Promise<void>;
    }>);

  const migrate = nodePgMigrate.default;

  await migrate({
    databaseUrl,
    dir: path.resolve(__dirname),
    direction: options.direction ?? 'up',
    count: options.count ?? Infinity,
    migrationsTable: 'pgmigrations',
    schema: 'public',
    createSchema: false,
    createMigrationsSchema: false,
    verbose: true,
    log: console.log,
  });
}

// Allow direct execution: npx tsx src/migrations/run-migrations.ts
const isMain = typeof require !== 'undefined' && require.main === module;

if (isMain) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed successfully.');
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
