/**
 * Layer 2: File Watcher (Local Real-Time Sync)
 *
 * - Watches vault/ folder for all file changes
 * - Parses frontmatter to detect actionable status changes
 * - Emits typed VaultEvents for the system to act on
 * - Writes agent output directly to vault as markdown notes
 */

import chokidar from 'chokidar';
import matter from 'gray-matter';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VaultEvent, VaultEventType, VaultNote, VaultSyncConfig } from './types.js';

export type VaultEventHandler = (event: VaultEvent) => Promise<void>;

export class VaultWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private config: VaultSyncConfig;
  private handlers: VaultEventHandler[] = [];
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private knownStates: Map<string, string> = new Map(); // path → last known status

  constructor(config: VaultSyncConfig) {
    this.config = config;
  }

  /**
   * Register an event handler.
   */
  onEvent(handler: VaultEventHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Start watching the vault folder.
   */
  start(): void {
    const watchPath = path.join(this.config.vaultPath, '**', '*.md');
    const debounceMs = this.config.watchDebounceMs ?? 1000;

    this.watcher = chokidar.watch(watchPath, {
      ignored: [
        /(^|[/\\])\./,           // ignore dotfiles (.obsidian/)
        /node_modules/,
        /\.git/,
        /copilot/,
        /\.claude/,
        /\.claudian/,
        /Templates\//,           // don't trigger on template files
      ],
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: debounceMs,
        pollInterval: 100,
      },
    });

    this.watcher.on('add', (filePath) => this.handleChange(filePath, 'created'));
    this.watcher.on('change', (filePath) => this.handleChange(filePath, 'updated'));
    this.watcher.on('unlink', (filePath) => this.handleDeletion(filePath));

    console.log(`[Vault Watcher] Watching: ${this.config.vaultPath}`);
  }

  /**
   * Stop watching.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[Vault Watcher] Stopped.');
    }
  }

  /**
   * Write a note to the vault (agent output → vault).
   */
  async writeNote(relativePath: string, frontmatter: Record<string, unknown>, content: string): Promise<void> {
    const fullPath = path.join(this.config.vaultPath, relativePath);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Format as markdown with frontmatter
    const fileContent = matter.stringify(content, frontmatter);
    fs.writeFileSync(fullPath, fileContent, 'utf-8');

    console.log(`[Vault Watcher] Wrote: ${relativePath}`);
  }

  /**
   * Read a note from the vault.
   */
  readNote(relativePath: string): VaultNote | null {
    const fullPath = path.join(this.config.vaultPath, relativePath);
    if (!fs.existsSync(fullPath)) return null;

    const raw = fs.readFileSync(fullPath, 'utf-8');
    const { data, content } = matter(raw);
    const stat = fs.statSync(fullPath);

    return {
      path: relativePath,
      frontmatter: data,
      content,
      lastModified: stat.mtime,
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async handleChange(filePath: string, changeType: 'created' | 'updated'): Promise<void> {
    const relativePath = path.relative(this.config.vaultPath, filePath).replace(/\\/g, '/');

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data: frontmatter, content } = matter(raw);

      // Determine event type based on path and frontmatter
      const eventType = this.classifyEvent(relativePath, frontmatter, changeType);
      if (!eventType) return; // not an actionable change

      const event: VaultEvent = {
        type: eventType,
        path: relativePath,
        frontmatter,
        content,
        timestamp: new Date(),
      };

      // Track state changes
      const currentStatus = frontmatter.status as string | undefined;
      const previousStatus = this.knownStates.get(relativePath);

      if (currentStatus) {
        this.knownStates.set(relativePath, currentStatus);
      }

      // Only emit status-change events if status actually changed
      if (eventType.includes('approved') || eventType.includes('rejected') || eventType.includes('activated') || eventType.includes('resolved')) {
        if (currentStatus === previousStatus) return; // no actual change
      }

      // Emit to all handlers
      for (const handler of this.handlers) {
        await handler(event);
      }
    } catch (err) {
      console.error(`[Vault Watcher] Error processing ${relativePath}:`, (err as Error).message);
    }
  }

  private async handleDeletion(filePath: string): Promise<void> {
    const relativePath = path.relative(this.config.vaultPath, filePath).replace(/\\/g, '/');

    const event: VaultEvent = {
      type: 'note.deleted',
      path: relativePath,
      frontmatter: {},
      content: '',
      timestamp: new Date(),
    };

    for (const handler of this.handlers) {
      await handler(event);
    }

    this.knownStates.delete(relativePath);
  }

  private classifyEvent(
    relativePath: string,
    frontmatter: Record<string, unknown>,
    changeType: 'created' | 'updated',
  ): VaultEventType | null {
    const status = frontmatter.status as string | undefined;

    // Directives
    if (relativePath.startsWith('00 - Command/Directives/')) {
      if (changeType === 'created') return 'directive.created';
      if (status === 'active') return 'directive.activated';
      return 'note.updated';
    }

    // Recommendations
    if (relativePath.startsWith('00 - Command/Recommendations/')) {
      if (status === 'Approved') return 'recommendation.approved';
      if (status === 'Rejected') return 'recommendation.rejected';
      return changeType === 'created' ? 'note.created' : 'note.updated';
    }

    // Escalations
    if (relativePath.startsWith('00 - Command/Escalations/')) {
      if (status === 'resolved') return 'escalation.resolved';
      return changeType === 'created' ? 'note.created' : 'note.updated';
    }

    // Generic
    return changeType === 'created' ? 'note.created' : 'note.updated';
  }
}
