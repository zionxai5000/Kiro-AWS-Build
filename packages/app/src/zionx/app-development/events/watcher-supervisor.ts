/**
 * Watcher Supervisor — restarts the workspace watcher on crash with circuit breaker.
 *
 * Behavior:
 * - Restarts the watcher automatically on error
 * - Circuit breaker: 3 crashes in 60s = circuit opens permanently
 * - When circuit opens:
 *   • Publishes system.health event with status: 'critical'
 *   • Exposes isHealthy() = false (API layer checks this to return 503)
 *   • Provides manual restart() method for operator recovery
 * - Documents recovery procedure
 *
 * MANUAL RECOVERY PROCEDURE:
 * When the watcher circuit opens (3 crashes in 60s), the supervisor stops
 * retrying automatically. To recover without restarting the shaar server:
 *
 *   1. Fix the underlying issue (disk full, permissions, workspace deleted)
 *   2. Call supervisor.restart() — this resets the circuit breaker and starts fresh
 *   3. Verify supervisor.isHealthy() returns true
 *   4. The system.health event will be emitted with status: 'recovered'
 *
 * This can be triggered via an admin API endpoint (e.g., POST /app-dev/admin/restart-watcher)
 * or programmatically from the production server.
 */

import { WorkspaceWatcher, type WorkspaceWatcherOptions } from './workspace-watcher.js';
import { WatcherSnapshot } from './watcher-snapshot.js';
import { createAppDevEvent, APPDEV_EVENTS } from './event-types.js';
import type { EventBusService, SystemEvent } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WatcherSupervisorOptions extends WorkspaceWatcherOptions {
  /** Max crashes before circuit opens (default: 3) */
  maxCrashes?: number;
  /** Window in ms for counting crashes (default: 60000) */
  crashWindowMs?: number;
  /** Delay before restart attempt in ms (default: 1000) */
  restartDelayMs?: number;
}

export type SupervisorState = 'healthy' | 'restarting' | 'circuit_open' | 'stopped';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class WatcherSupervisor {
  private watcher: WorkspaceWatcher | null = null;
  private _state: SupervisorState = 'stopped';
  private crashes: number[] = []; // timestamps
  private readonly maxCrashes: number;
  private readonly crashWindowMs: number;
  private readonly restartDelayMs: number;
  private readonly watcherOpts: WorkspaceWatcherOptions;
  private readonly eventBus: EventBusService;
  private readonly snapshot: WatcherSnapshot;

  constructor(opts: WatcherSupervisorOptions) {
    this.maxCrashes = opts.maxCrashes ?? 3;
    this.crashWindowMs = opts.crashWindowMs ?? 60_000;
    this.restartDelayMs = opts.restartDelayMs ?? 1000;
    this.watcherOpts = opts;
    this.eventBus = opts.eventBus;
    this.snapshot = new WatcherSnapshot({
      workspaceRoot: opts.workspaceRoot,
    });
  }

  get state(): SupervisorState {
    return this._state;
  }

  /**
   * Is the watcher healthy and running?
   * API layer checks this to decide whether to accept new project creation.
   */
  isHealthy(): boolean {
    return this._state === 'healthy';
  }

  /**
   * Start the supervisor and its managed watcher.
   * Runs snapshot recovery on start to emit events for changes missed while down.
   */
  async start(): Promise<void> {
    if (this._state === 'healthy') return;
    this._state = 'restarting';
    await this.startWatcher();

    // Run snapshot recovery after watcher is ready
    if ((this._state as SupervisorState) === 'healthy') {
      await this.runRecovery();
    }
  }

  /**
   * Stop the supervisor and its managed watcher.
   * Flushes all pending snapshot writes before stopping.
   */
  async stop(): Promise<void> {
    this.snapshot.flushAll();
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }
    this._state = 'stopped';
  }

  /**
   * Manual recovery: reset circuit breaker and restart.
   * Call this after fixing the underlying issue that caused crashes.
   */
  async restart(): Promise<void> {
    this.crashes = [];
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }
    this._state = 'restarting';
    await this.startWatcher();

    // Emit recovery event
    const event: SystemEvent = {
      source: 'seraphim.app-development',
      type: 'system.health',
      detail: {
        component: 'workspace-watcher',
        status: 'recovered',
        message: 'Watcher supervisor manually restarted — circuit breaker reset.',
      },
      metadata: {
        tenantId: this.watcherOpts.tenantId ?? 'system',
        correlationId: `watcher-recovery-${Date.now()}`,
        timestamp: new Date(),
      },
    };
    await this.eventBus.publish(event).catch(() => {});
  }

  /**
   * Get the managed watcher instance (for accessing RecentWritesRegistry).
   */
  getWatcher(): WorkspaceWatcher | null {
    return this.watcher;
  }

  /**
   * Get the snapshot instance (for external access if needed).
   */
  getSnapshot(): WatcherSnapshot {
    return this.snapshot;
  }

  /**
   * Notify the supervisor of a file event (for snapshot updates).
   * Called by the watcher or externally after file changes.
   */
  onFileEvent(projectId: string, projectPath: string): void {
    // Queue a debounced snapshot update
    const state = this.snapshot.buildState(projectPath);
    this.snapshot.queueSave(projectId, state);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Run snapshot recovery: compute diff for known projects, emit events.
   */
  private async runRecovery(): Promise<void> {
    const workspaceRoot = this.watcherOpts.workspaceRoot;
    if (!workspaceRoot) return;

    try {
      const { existsSync, readdirSync, statSync } = await import('node:fs');
      const { join } = await import('node:path');

      if (!existsSync(workspaceRoot)) return;

      const entries = readdirSync(workspaceRoot, { withFileTypes: true });
      const tenantId = this.watcherOpts.tenantId ?? 'system';

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;

        const projectId = entry.name;
        const projectPath = join(workspaceRoot, projectId);

        const diff = this.snapshot.computeDiff(projectId, projectPath);
        const totalChanges = diff.added.length + diff.modified.length + diff.deleted.length;

        if (totalChanges === 0) continue;

        if (diff.bulk) {
          // Bulk fallback — emit single bulk event, don't fire individual hooks
          console.warn(`[WatcherSupervisor] Recovery bulk mode for "${projectId}": ${totalChanges} changes`);
          await this.eventBus.publish({
            source: 'seraphim.app-development',
            type: 'appdev.watcher.recovery.bulk',
            detail: {
              projectId,
              addedCount: diff.added.length,
              modifiedCount: diff.modified.length,
              deletedCount: diff.deleted.length,
            },
            metadata: { tenantId, correlationId: `recovery-${projectId}-${Date.now()}`, timestamp: new Date() },
          }).catch(() => {});
        } else {
          // Emit individual synthetic events
          for (const filePath of diff.added) {
            await this.eventBus.publish(createAppDevEvent(
              APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
              { projectId, filePath, changeType: 'add' },
              tenantId,
            )).catch(() => {});
          }
          for (const filePath of diff.modified) {
            await this.eventBus.publish(createAppDevEvent(
              APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
              { projectId, filePath, changeType: 'change' },
              tenantId,
            )).catch(() => {});
          }
          for (const filePath of diff.deleted) {
            await this.eventBus.publish(createAppDevEvent(
              APPDEV_EVENTS.WORKSPACE_FILE_CHANGED,
              { projectId, filePath, changeType: 'unlink' },
              tenantId,
            )).catch(() => {});
          }
        }

        // Update snapshot to current state
        const newState = this.snapshot.buildState(projectPath);
        this.snapshot.save(projectId, newState);
      }
    } catch (error) {
      console.error('[WatcherSupervisor] Recovery failed:', (error as Error).message);
    }
  }

  private async startWatcher(): Promise<void> {
    this.watcher = new WorkspaceWatcher(this.watcherOpts);

    this.watcher.onError = (error) => {
      this.handleCrash(error);
    };

    try {
      await this.watcher.start();
      this._state = 'healthy';
    } catch (error) {
      this.handleCrash(error as Error);
    }
  }

  private handleCrash(error: Error): void {
    const now = Date.now();
    this.crashes.push(now);

    // Prune crashes outside the window
    const cutoff = now - this.crashWindowMs;
    this.crashes = this.crashes.filter(t => t > cutoff);

    console.error(`[WatcherSupervisor] Watcher crashed (${this.crashes.length}/${this.maxCrashes} in window):`, error.message);

    if (this.crashes.length >= this.maxCrashes) {
      this.openCircuit();
      return;
    }

    // Schedule restart
    this._state = 'restarting';
    setTimeout(() => {
      this.startWatcher().catch((err) => {
        console.error('[WatcherSupervisor] Restart failed:', err);
      });
    }, this.restartDelayMs);
  }

  private openCircuit(): void {
    this._state = 'circuit_open';
    console.error(
      `[WatcherSupervisor] CIRCUIT OPEN — watcher crashed ${this.maxCrashes} times in ${this.crashWindowMs}ms. ` +
      `File watcher is DOWN. New project creation will return 503. ` +
      `Manual recovery: call supervisor.restart() after fixing the underlying issue.`
    );

    // Emit critical health event — LOUD failure
    const event: SystemEvent = {
      source: 'seraphim.app-development',
      type: 'system.health',
      detail: {
        component: 'workspace-watcher',
        status: 'critical',
        message: `File watcher circuit OPEN — ${this.maxCrashes} crashes in ${this.crashWindowMs}ms. App creation paused.`,
        crashCount: this.crashes.length,
        lastCrashAt: new Date().toISOString(),
        recoveryProcedure: 'Fix underlying issue, then call supervisor.restart()',
      },
      metadata: {
        tenantId: this.watcherOpts.tenantId ?? 'system',
        correlationId: `watcher-circuit-open-${Date.now()}`,
        timestamp: new Date(),
      },
    };

    this.eventBus.publish(event).catch(() => {
      // Even if event publishing fails, the state is set — API will 503
    });
  }
}
