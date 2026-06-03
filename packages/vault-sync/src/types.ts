/**
 * Vault Sync — Type Definitions
 *
 * Shared types for the three-layer Obsidian-Seraphim sync system.
 */

// ---------------------------------------------------------------------------
// Vault Note
// ---------------------------------------------------------------------------

export interface VaultNote {
  path: string;                    // relative to vault root, e.g., "00 - Command/Directives/my-directive.md"
  frontmatter: Record<string, unknown>;
  content: string;
  lastModified: Date;
}

export interface NoteFrontmatter {
  tags?: string[];
  status?: 'draft' | 'active' | 'Pending' | 'Approved' | 'Rejected' | 'resolved';
  source?: string;
  priority?: string;
  target_pillar?: string;
  date?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Vault Events (emitted by file watcher)
// ---------------------------------------------------------------------------

export type VaultEventType =
  | 'directive.created'
  | 'directive.activated'
  | 'recommendation.approved'
  | 'recommendation.rejected'
  | 'escalation.resolved'
  | 'note.created'
  | 'note.updated'
  | 'note.deleted';

export interface VaultEvent {
  type: VaultEventType;
  path: string;
  frontmatter: Record<string, unknown>;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sync Layer Config
// ---------------------------------------------------------------------------

export interface VaultSyncConfig {
  vaultPath: string;               // absolute path to vault/ folder
  gitEnabled: boolean;
  gitRemote?: string;              // e.g., "origin"
  gitBranch?: string;              // e.g., "main"
  gitAutoCommitInterval?: number;  // ms between auto-commits (default: 60000)

  watcherEnabled: boolean;
  watchDebounceMs?: number;        // debounce file changes (default: 1000)

  obsidianApiEnabled: boolean;
  obsidianApiUrl?: string;         // default: "https://127.0.0.1:27124"
  obsidianApiToken?: string;       // API token from Local REST API plugin

  eventBusEnabled: boolean;
  awsRegion?: string;
  eventBusName?: string;           // EventBridge bus name
}

// ---------------------------------------------------------------------------
// Obsidian REST API Types
// ---------------------------------------------------------------------------

export interface ObsidianApiResponse {
  status: number;
  message?: string;
}

export interface ObsidianSearchResult {
  filename: string;
  score: number;
  matches: Array<{
    match: { start: number; end: number };
    context: string;
  }>;
}

// ---------------------------------------------------------------------------
// Git Sync State
// ---------------------------------------------------------------------------

export interface GitSyncState {
  lastCommitHash: string;
  lastPushTime: Date;
  pendingChanges: number;
  isClean: boolean;
}

// ---------------------------------------------------------------------------
// Event Bus Integration
// ---------------------------------------------------------------------------

export interface SeraphimEvent {
  source: string;
  type: string;
  detail: Record<string, unknown>;
  metadata: {
    tenantId: string;
    correlationId: string;
    timestamp: string;
  };
}
