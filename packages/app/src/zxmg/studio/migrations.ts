/**
 * ZXMG Video Development Studio — Database Migrations
 *
 * Defines Phase 10 database migrations for the video development studio.
 * Includes tables for pipeline items, channels, rendered scenes, performance
 * metrics, and trend research data.
 *
 * Requirements: 44h.37, 44h.38, 44h.39, 44h.40
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationDefinition {
  id: string;
  name: string;
  up: string;
  down: string;
}

// ---------------------------------------------------------------------------
// Migration Definitions
// ---------------------------------------------------------------------------

/**
 * Returns all Phase 10 database migrations for the ZXMG Video Studio.
 *
 * Tables created:
 * - video_pipeline_items: Tracks video pipeline state and metadata
 * - video_channels: Channel configurations and analytics
 * - video_rendered_scenes: Individual rendered scene clips
 * - video_performance: Video performance metrics over time
 * - video_trend_research: Trend research reports per channel
 */
export function getPhase10Migrations(): MigrationDefinition[] {
  return [
    {
      id: 'phase10-001',
      name: 'create_video_pipeline_items',
      up: `
        CREATE TABLE IF NOT EXISTS video_pipeline_items (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ideated',
          concept JSONB,
          script TEXT,
          video_url TEXT,
          thumbnails JSONB,
          metadata JSONB,
          feedback JSONB,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX idx_video_pipeline_items_channel_id ON video_pipeline_items(channel_id);
        CREATE INDEX idx_video_pipeline_items_status ON video_pipeline_items(status);
      `,
      down: `
        DROP INDEX IF EXISTS idx_video_pipeline_items_status;
        DROP INDEX IF EXISTS idx_video_pipeline_items_channel_id;
        DROP TABLE IF EXISTS video_pipeline_items;
      `,
    },
    {
      id: 'phase10-002',
      name: 'create_video_channels',
      up: `
        CREATE TABLE IF NOT EXISTS video_channels (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          niche TEXT,
          config JSONB,
          analytics JSONB,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX idx_video_channels_name ON video_channels(name);
      `,
      down: `
        DROP INDEX IF EXISTS idx_video_channels_name;
        DROP TABLE IF EXISTS video_channels;
      `,
    },
    {
      id: 'phase10-003',
      name: 'create_video_rendered_scenes',
      up: `
        CREATE TABLE IF NOT EXISTS video_rendered_scenes (
          id TEXT PRIMARY KEY,
          video_id TEXT NOT NULL,
          scene_id TEXT NOT NULL,
          clip_url TEXT NOT NULL,
          model TEXT,
          duration REAL,
          cost REAL
        );
        CREATE INDEX idx_video_rendered_scenes_video_id ON video_rendered_scenes(video_id);
      `,
      down: `
        DROP INDEX IF EXISTS idx_video_rendered_scenes_video_id;
        DROP TABLE IF EXISTS video_rendered_scenes;
      `,
    },
    {
      id: 'phase10-004',
      name: 'create_video_performance',
      up: `
        CREATE TABLE IF NOT EXISTS video_performance (
          id TEXT PRIMARY KEY,
          video_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          metrics JSONB,
          retention_curve JSONB,
          recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX idx_video_performance_video_id ON video_performance(video_id);
        CREATE INDEX idx_video_performance_channel_id ON video_performance(channel_id);
      `,
      down: `
        DROP INDEX IF EXISTS idx_video_performance_channel_id;
        DROP INDEX IF EXISTS idx_video_performance_video_id;
        DROP TABLE IF EXISTS video_performance;
      `,
    },
    {
      id: 'phase10-005',
      name: 'create_video_trend_research',
      up: `
        CREATE TABLE IF NOT EXISTS video_trend_research (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL,
          report JSONB,
          confidence REAL,
          generated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX idx_video_trend_research_channel_id ON video_trend_research(channel_id);
      `,
      down: `
        DROP INDEX IF EXISTS idx_video_trend_research_channel_id;
        DROP TABLE IF EXISTS video_trend_research;
      `,
    },
  ];
}
