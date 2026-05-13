/**
 * ZionX App Development Studio — Phase 9 Database Migrations
 *
 * Defines migration schemas for all Phase 9 studio tables:
 * - studio_sessions: Core session state with tenant/app indexes
 * - studio_edit_history: Edit command history with session index
 * - studio_store_assets: Store asset metadata with session/type indexes
 * - studio_ad_creatives: Ad creative metadata with session/format indexes
 *
 * These are migration definitions (SQL strings) consumed by the existing
 * migration runner. They do not execute SQL directly.
 *
 * Requirements: 42a.1, 42d.11, 42h.24, 42i.28
 */

// ---------------------------------------------------------------------------
// Migration Definition Interface
// ---------------------------------------------------------------------------

export interface MigrationDefinition {
  id: string;
  name: string;
  up: string;
  down: string;
}

// ---------------------------------------------------------------------------
// Migration: studio_sessions
// ---------------------------------------------------------------------------

const STUDIO_SESSIONS_MIGRATION: MigrationDefinition = {
  id: 'phase9_001',
  name: 'create_studio_sessions',
  up: `
    CREATE TABLE IF NOT EXISTS studio_sessions (
      session_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      project_state JSONB NOT NULL DEFAULT '{}',
      file_tree JSONB NOT NULL DEFAULT '[]',
      build_status JSONB NOT NULL DEFAULT '{"ios":{"status":"idle"},"android":{"status":"idle"}}',
      preview_connection JSONB NOT NULL DEFAULT '{"status":"disconnected"}',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_studio_sessions_tenant_id ON studio_sessions (tenant_id);
    CREATE INDEX idx_studio_sessions_app_id ON studio_sessions (app_id);
    CREATE INDEX idx_studio_sessions_created_at ON studio_sessions (created_at DESC);
  `,
  down: `
    DROP INDEX IF EXISTS idx_studio_sessions_created_at;
    DROP INDEX IF EXISTS idx_studio_sessions_app_id;
    DROP INDEX IF EXISTS idx_studio_sessions_tenant_id;
    DROP TABLE IF EXISTS studio_sessions;
  `,
};

// ---------------------------------------------------------------------------
// Migration: studio_edit_history
// ---------------------------------------------------------------------------

const STUDIO_EDIT_HISTORY_MIGRATION: MigrationDefinition = {
  id: 'phase9_002',
  name: 'create_studio_edit_history',
  up: `
    CREATE TABLE IF NOT EXISTS studio_edit_history (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES studio_sessions(session_id) ON DELETE CASCADE,
      edit_command JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_studio_edit_history_session_created
      ON studio_edit_history (session_id, created_at DESC);
  `,
  down: `
    DROP INDEX IF EXISTS idx_studio_edit_history_session_created;
    DROP TABLE IF EXISTS studio_edit_history;
  `,
};

// ---------------------------------------------------------------------------
// Migration: studio_store_assets
// ---------------------------------------------------------------------------

const STUDIO_STORE_ASSETS_MIGRATION: MigrationDefinition = {
  id: 'phase9_003',
  name: 'create_studio_store_assets',
  up: `
    CREATE TABLE IF NOT EXISTS studio_store_assets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      platform TEXT NOT NULL,
      device_size TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      caption TEXT,
      locale TEXT,
      validation_status TEXT NOT NULL DEFAULT 'pending',
      validation_errors JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_studio_store_assets_session_id ON studio_store_assets (session_id);
    CREATE INDEX idx_studio_store_assets_type ON studio_store_assets (type);
    CREATE INDEX idx_studio_store_assets_platform ON studio_store_assets (platform);
  `,
  down: `
    DROP INDEX IF EXISTS idx_studio_store_assets_platform;
    DROP INDEX IF EXISTS idx_studio_store_assets_type;
    DROP INDEX IF EXISTS idx_studio_store_assets_session_id;
    DROP TABLE IF EXISTS studio_store_assets;
  `,
};

// ---------------------------------------------------------------------------
// Migration: studio_ad_creatives
// ---------------------------------------------------------------------------

const STUDIO_AD_CREATIVES_MIGRATION: MigrationDefinition = {
  id: 'phase9_004',
  name: 'create_studio_ad_creatives',
  up: `
    CREATE TABLE IF NOT EXISTS studio_ad_creatives (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      format TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      duration_seconds REAL NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      has_interactive_elements BOOLEAN NOT NULL DEFAULT FALSE,
      validation_status TEXT NOT NULL DEFAULT 'pending',
      validation_errors JSONB,
      network_compatibility TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_studio_ad_creatives_session_id ON studio_ad_creatives (session_id);
    CREATE INDEX idx_studio_ad_creatives_format ON studio_ad_creatives (format);
  `,
  down: `
    DROP INDEX IF EXISTS idx_studio_ad_creatives_format;
    DROP INDEX IF EXISTS idx_studio_ad_creatives_session_id;
    DROP TABLE IF EXISTS studio_ad_creatives;
  `,
};

// ---------------------------------------------------------------------------
// Export All Phase 9 Migrations
// ---------------------------------------------------------------------------

/**
 * Returns all Phase 9 migration definitions in execution order.
 * The migration runner should apply these sequentially (001 → 004).
 */
export function getPhase9Migrations(): MigrationDefinition[] {
  return [
    STUDIO_SESSIONS_MIGRATION,
    STUDIO_EDIT_HISTORY_MIGRATION,
    STUDIO_STORE_ASSETS_MIGRATION,
    STUDIO_AD_CREATIVES_MIGRATION,
  ];
}
