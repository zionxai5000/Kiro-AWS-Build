/**
 * Layer 1: Git-Based Sync (Durable Baseline)
 *
 * - Auto-commits vault changes on interval
 * - Pushes to GitHub so agents can read directives
 * - Pulls agent output back into vault
 * - Works offline, auditable, survives anything
 */

import { simpleGit, SimpleGit } from 'simple-git';
import { GitSyncState, VaultSyncConfig } from './types.js';

export class GitSync {
  private git: SimpleGit;
  private interval: ReturnType<typeof setInterval> | null = null;
  private config: VaultSyncConfig;

  constructor(config: VaultSyncConfig) {
    this.config = config;
    this.git = simpleGit(config.vaultPath);
  }

  /**
   * Start the auto-commit/push cycle.
   */
  async start(): Promise<void> {
    // Verify we're in a git repo
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      console.log('[Git Sync] Vault is not a git repo — initializing...');
      await this.git.init();
      console.log('[Git Sync] Git initialized in vault.');
    }

    const commitInterval = this.config.gitAutoCommitInterval ?? 60_000;

    this.interval = setInterval(async () => {
      try {
        await this.syncCycle();
      } catch (err) {
        console.error('[Git Sync] Cycle error:', (err as Error).message);
      }
    }, commitInterval);

    console.log(`[Git Sync] Started — auto-commit every ${commitInterval / 1000}s`);

    // Run one cycle immediately
    await this.syncCycle();
  }

  /**
   * Stop the auto-commit cycle.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[Git Sync] Stopped.');
    }
  }

  /**
   * Run one sync cycle: pull → commit changes → push.
   */
  async syncCycle(): Promise<void> {
    const status = await this.git.status();

    // Pull first (get agent output)
    try {
      await this.git.pull(this.config.gitRemote ?? 'origin', this.config.gitBranch ?? 'main', {
        '--rebase': 'true',
      });
    } catch {
      // Pull may fail if no remote configured yet — that's OK
    }

    // Commit any local changes
    if (!status.isClean()) {
      await this.git.add('.');
      const summary = await this.git.commit(
        `[vault-sync] Auto-commit: ${status.modified.length} modified, ${status.not_added.length} new`,
        { '--allow-empty': null },
      );
      console.log(`[Git Sync] Committed: ${summary.commit}`);

      // Push
      try {
        await this.git.push(this.config.gitRemote ?? 'origin', this.config.gitBranch ?? 'main');
        console.log('[Git Sync] Pushed to remote.');
      } catch (err) {
        console.warn('[Git Sync] Push failed (will retry next cycle):', (err as Error).message);
      }
    }
  }

  /**
   * Force an immediate sync (used after important vault changes).
   */
  async forceSync(): Promise<void> {
    await this.syncCycle();
  }

  /**
   * Get current git state.
   */
  async getState(): Promise<GitSyncState> {
    const status = await this.git.status();
    const log = await this.git.log({ maxCount: 1 });

    return {
      lastCommitHash: log.latest?.hash ?? 'none',
      lastPushTime: new Date(), // simplified — would track actual push time
      pendingChanges: status.modified.length + status.not_added.length + status.deleted.length,
      isClean: status.isClean(),
    };
  }
}
