/**
 * Workspace Watcher — chokidar-based file watcher for the workspace root.
 *
 * Watches {WORKSPACE_ROOT}/ for file changes across all projects.
 * Routes events by path to the correct projectId.
 * Consults RecentWritesRegistry to suppress own writes (anti-feedback-loop).
 * Publishes appdev.workspace.file.changed events to the event bus.
 *
 * One watcher for all projects. Project ID is extracted from the path:
 *   {WORKSPACE_ROOT}/{projectId}/...
 *
 * Uses awaitWriteFinish for write stabilization on Windows (NTFS event coalescing).
 */

import { watch, type FSWatcher } from 'chokidar';
import { relative, sep } from 'node:path';
import { WORKSPACE_ROOT } from '../workspace/workspace.js';
import { RecentWritesRegistry } from './recent-writes.js';
import { APPDEV_EVENTS, createAppDevEvent, type FileChangeType } from './event-types.js';
import type { EventBusService } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceWatcherOptions {
  /** Override workspace root (useful for testing) */
  workspaceRoot?: string;
  /** Event bus to publish file change events to */
  eventBus: EventBusService;
  /** Recent writes registry for anti-feedback-loop */
  recentWrites?: RecentWritesRegistry;
  /** Tenant ID for events (default: 'system') */
  tenantId?: string;
  /** awaitWriteFinish stabilityThreshold in ms (default: 300) */
  stabilityThresholdMs?: number;
}

export type WatcherState = 'stopped' | 'starting' | 'ready' | 'error';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class WorkspaceWatcher {
  private watcher: FSWatcher | null = null;
  private _state: WatcherState = 'stopped';
  private readonly workspaceRoot: string;
  private readonly eventBus: EventBusService;
  private readonly recentWrites: RecentWritesRegistry;
  private readonly tenantId: string;
  private readonly stabilityThresholdMs: number;

  /** Error handler — set by supervisor for crash detection */
  public onError: ((error: Error) => void) | null = null;

  constructor(opts: WorkspaceWatcherOptions) {
    this.workspaceRoot = opts.workspaceRoot ?? WORKSPACE_ROOT;
    this.eventBus = opts.eventBus;
    this.recentWrites = opts.recentWrites ?? new RecentWritesRegistry();
    this.tenantId = opts.tenantId ?? 'system';
    this.stabilityThresholdMs = opts.stabilityThresholdMs ?? 300;
  }

  get state(): WatcherState {
    return this._state;
  }

  /**
   * Start watching the workspace root.
   * Resolves when the watcher is ready (initial scan complete).
   */
  async start(): Promise<void> {
    if (this._state === 'ready' || this._state === 'starting') {
      return;
    }

    this._state = 'starting';

    return new Promise<void>((resolve, reject) => {
      this.watcher = watch(this.workspaceRoot, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: this.stabilityThresholdMs,
          pollInterval: 100,
        },
        // Ignore dotfiles and node_modules inside generated projects
        ignored: [
          /(^|[/\\])\../, // dotfiles
          '**/node_modules/**',
        ],
      });

      this.watcher.on('ready', () => {
        this._state = 'ready';
        resolve();
      });

      this.watcher.on('add', (filePath) => this.handleEvent(filePath, 'add'));
      this.watcher.on('change', (filePath) => this.handleEvent(filePath, 'change'));
      this.watcher.on('unlink', (filePath) => this.handleEvent(filePath, 'unlink'));

      this.watcher.on('error', (error) => {
        this._state = 'error';
        if (this.onError) {
          this.onError(error instanceof Error ? error : new Error(String(error)));
        }
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  /**
   * Stop the watcher and release resources.
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this._state = 'stopped';
  }

  /**
   * Get the RecentWritesRegistry (for hooks to mark their own writes).
   */
  getRecentWrites(): RecentWritesRegistry {
    return this.recentWrites;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private handleEvent(filePath: string, changeType: FileChangeType): void {
    // Normalize to forward slashes
    const normalized = filePath.replace(/\\/g, '/');

    // Check anti-feedback-loop registry
    if (this.recentWrites.isOwnWrite(normalized)) {
      return; // Suppress — this was our own write
    }

    // Extract projectId from path: {workspaceRoot}/{projectId}/...
    const relativePath = this.getRelativePath(normalized);
    if (!relativePath) return;

    const segments = relativePath.split('/');
    if (segments.length < 2) return; // Need at least projectId/filename

    const projectId = segments[0]!;
    const fileRelativePath = segments.slice(1).join('/');

    // Publish event (fire-and-forget — don't block the watcher)
    const event = createAppDevEvent(
      APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
      { projectId, filePath: fileRelativePath, changeType },
      this.tenantId,
    );

    this.eventBus.publish(event).catch((err) => {
      // Log but don't crash the watcher
      console.error(`[WorkspaceWatcher] Failed to publish event:`, err);
    });
  }

  private getRelativePath(normalizedPath: string): string | null {
    const normalizedRoot = this.workspaceRoot.replace(/\\/g, '/');
    if (!normalizedPath.startsWith(normalizedRoot)) {
      return null;
    }
    // Strip root + leading slash
    let rel = normalizedPath.slice(normalizedRoot.length);
    if (rel.startsWith('/')) rel = rel.slice(1);
    return rel || null;
  }
}
