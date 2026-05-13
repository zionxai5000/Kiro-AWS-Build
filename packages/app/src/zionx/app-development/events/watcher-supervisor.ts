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

  constructor(opts: WatcherSupervisorOptions) {
    this.maxCrashes = opts.maxCrashes ?? 3;
    this.crashWindowMs = opts.crashWindowMs ?? 60_000;
    this.restartDelayMs = opts.restartDelayMs ?? 1000;
    this.watcherOpts = opts;
    this.eventBus = opts.eventBus;
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
   */
  async start(): Promise<void> {
    if (this._state === 'healthy') return;
    this._state = 'restarting';
    await this.startWatcher();
  }

  /**
   * Stop the supervisor and its managed watcher.
   */
  async stop(): Promise<void> {
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

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

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
