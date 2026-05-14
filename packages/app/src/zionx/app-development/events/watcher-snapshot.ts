/**
 * Watcher Snapshot — stateful recovery for the workspace file watcher.
 *
 * On clean shutdown, persists a snapshot of known files per project.
 * On restart, computes a diff (added/modified/deleted) and emits synthetic events.
 *
 * Snapshot shape per file: { hash, mtime, size }
 * Recovery scan uses mtime+size fast path — only hashes files where stat differs.
 *
 * Bulk fallback (Refinement 2): if recovery diff > threshold (default 100),
 * emits a single bulk event instead of individual events. Hooks do NOT
 * subscribe to bulk events — pipeline pauses until manual review.
 *
 * Snapshot location: SERAPHIM_WATCHER_STATE_ROOT env var, default {WORKSPACE_ROOT}/../.watcher-state/
 * MUST NOT be inside the workspace root (validated at construction).
 */

import { createHash } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { WORKSPACE_ROOT } from '../workspace/workspace.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileEntry {
  hash: string;
  mtime: number;
  size: number;
}

export type SnapshotState = Record<string, FileEntry>;

export interface DiffResult {
  added: string[];
  modified: string[];
  deleted: string[];
  bulk: boolean;
}

export interface WatcherSnapshotConfig {
  /** Override snapshot root (default: {WORKSPACE_ROOT}/../.watcher-state/) */
  snapshotRoot?: string;
  /** Override workspace root for validation */
  workspaceRoot?: string;
  /** Bulk threshold — if diff exceeds this, return bulk indicator (default: 100) */
  bulkThreshold?: number;
  /** Debounce interval for saves in ms (default: 5000) */
  saveDebounceMs?: number;
  /** Max changes before forced save (default: 100) */
  saveMaxChanges?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BULK_THRESHOLD = parseInt(
  process.env.SERAPHIM_RECOVERY_BULK_THRESHOLD ?? '100',
  10,
) || 100;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class WatcherSnapshot {
  private readonly snapshotRoot: string;
  private readonly workspaceRoot: string;
  private readonly bulkThreshold: number;
  private readonly saveDebounceMs: number;
  private readonly saveMaxChanges: number;

  // Debounce state per project
  private pendingStates = new Map<string, SnapshotState>();
  private changeCounters = new Map<string, number>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(config: WatcherSnapshotConfig = {}) {
    this.workspaceRoot = config.workspaceRoot ?? WORKSPACE_ROOT;
    this.snapshotRoot = config.snapshotRoot
      ?? (process.env.SERAPHIM_WATCHER_STATE_ROOT
        ? resolve(process.env.SERAPHIM_WATCHER_STATE_ROOT)
        : resolve(this.workspaceRoot, '..', '.watcher-state'));
    this.bulkThreshold = config.bulkThreshold ?? DEFAULT_BULK_THRESHOLD;
    this.saveDebounceMs = config.saveDebounceMs ?? 5000;
    this.saveMaxChanges = config.saveMaxChanges ?? 100;

    // Validate: snapshot root must NOT be inside workspace root
    this.validateSnapshotLocation();

    // Ensure snapshot root exists
    if (!existsSync(this.snapshotRoot)) {
      mkdirSync(this.snapshotRoot, { recursive: true });
    }
  }

  /**
   * Load a project's snapshot from disk.
   * Returns empty state if file is missing or corrupt.
   */
  load(projectId: string): SnapshotState {
    const filePath = this.getSnapshotPath(projectId);
    if (!existsSync(filePath)) {
      return {};
    }

    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        console.warn(`[WatcherSnapshot] Corrupt snapshot for "${projectId}" — treating as empty`);
        return {};
      }
      return parsed as SnapshotState;
    } catch {
      console.warn(`[WatcherSnapshot] Failed to read snapshot for "${projectId}" — treating as empty`);
      return {};
    }
  }

  /**
   * Save a project's snapshot atomically (write to .tmp, rename).
   */
  save(projectId: string, state: SnapshotState): void {
    const filePath = this.getSnapshotPath(projectId);
    const tmpPath = filePath + '.tmp';
    const dir = join(this.snapshotRoot);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tmpPath, filePath);
  }

  /**
   * Compute the diff between a saved snapshot and the current workspace state.
   *
   * Uses mtime+size fast path: only hashes files where stat differs from snapshot.
   * If diff exceeds bulk threshold, returns { bulk: true } with counts only.
   *
   * @param projectId - The project to diff
   * @param projectPath - Absolute path to the project workspace directory
   */
  computeDiff(projectId: string, projectPath: string): DiffResult {
    const snapshot = this.load(projectId);
    const currentFiles = this.scanDirectory(projectPath);

    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    // Check current files against snapshot
    for (const [filePath, stat] of currentFiles) {
      const entry = snapshot[filePath];
      if (!entry) {
        // New file
        added.push(filePath);
      } else if (entry.mtime === stat.mtime && entry.size === stat.size) {
        // Fast path: unchanged (mtime + size match)
        continue;
      } else {
        // Stat differs — hash to confirm
        const fullPath = join(projectPath, filePath);
        const hash = this.hashFile(fullPath);
        if (hash !== entry.hash) {
          modified.push(filePath);
        }
        // If hash matches, just mtime/size drifted — update snapshot later
      }
    }

    // Check for deleted files
    for (const filePath of Object.keys(snapshot)) {
      if (!currentFiles.has(filePath)) {
        deleted.push(filePath);
      }
    }

    const totalChanges = added.length + modified.length + deleted.length;

    // Bulk fallback
    if (totalChanges > this.bulkThreshold) {
      console.warn(
        `[WatcherSnapshot] Recovery detected ${totalChanges} changes for "${projectId}" ` +
        `(threshold: ${this.bulkThreshold}). Bulk mode.`
      );
      return { added, modified, deleted, bulk: true };
    }

    return { added, modified, deleted, bulk: false };
  }

  /**
   * Build a fresh snapshot state from the current workspace directory.
   */
  buildState(projectPath: string): SnapshotState {
    const files = this.scanDirectory(projectPath);
    const state: SnapshotState = {};

    for (const [filePath, stat] of files) {
      const fullPath = join(projectPath, filePath);
      const hash = this.hashFile(fullPath);
      state[filePath] = { hash, mtime: stat.mtime, size: stat.size };
    }

    return state;
  }

  /**
   * Queue a debounced snapshot save for a project.
   * Saves after saveDebounceMs of inactivity OR saveMaxChanges changes.
   */
  queueSave(projectId: string, state: SnapshotState): void {
    this.pendingStates.set(projectId, state);
    const count = (this.changeCounters.get(projectId) ?? 0) + 1;
    this.changeCounters.set(projectId, count);

    // Force save if max changes reached
    if (count >= this.saveMaxChanges) {
      this.flushProject(projectId);
      return;
    }

    // Reset debounce timer
    const existing = this.debounceTimers.get(projectId);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(projectId, setTimeout(() => {
      this.flushProject(projectId);
    }, this.saveDebounceMs));
  }

  /**
   * Flush all pending snapshot writes synchronously.
   * Call on clean shutdown.
   */
  flushAll(): void {
    for (const [projectId] of this.pendingStates) {
      this.flushProject(projectId);
    }
  }

  /**
   * Get the snapshot root path (for testing/validation).
   */
  getSnapshotRoot(): string {
    return this.snapshotRoot;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private flushProject(projectId: string): void {
    const state = this.pendingStates.get(projectId);
    if (state) {
      this.save(projectId, state);
      this.pendingStates.delete(projectId);
      this.changeCounters.delete(projectId);
    }
    const timer = this.debounceTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(projectId);
    }
  }

  private getSnapshotPath(projectId: string): string {
    return join(this.snapshotRoot, `${projectId}.json`);
  }

  private validateSnapshotLocation(): void {
    const normalizedSnapshot = resolve(this.snapshotRoot).replace(/\\/g, '/');
    const normalizedWorkspace = resolve(this.workspaceRoot).replace(/\\/g, '/');

    if (normalizedSnapshot.startsWith(normalizedWorkspace + '/') || normalizedSnapshot === normalizedWorkspace) {
      throw new Error(
        `Snapshot root "${this.snapshotRoot}" must NOT be inside workspace root "${this.workspaceRoot}". ` +
        `Set SERAPHIM_WATCHER_STATE_ROOT to a path outside the workspace.`
      );
    }
  }

  /**
   * Scan a directory recursively, returning relative paths with stat info.
   */
  private scanDirectory(dirPath: string): Map<string, { mtime: number; size: number }> {
    const result = new Map<string, { mtime: number; size: number }>();
    if (!existsSync(dirPath)) return result;

    this.scanRecursive(dirPath, '', result);
    return result;
  }

  private scanRecursive(
    basePath: string,
    prefix: string,
    result: Map<string, { mtime: number; size: number }>,
  ): void {
    const entries = readdirSync(join(basePath, prefix), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        // Skip node_modules and dotfiles
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        this.scanRecursive(basePath, relativePath, result);
      } else {
        try {
          const stat = statSync(join(basePath, relativePath));
          result.set(relativePath, {
            mtime: Math.floor(stat.mtimeMs),
            size: stat.size,
          });
        } catch {
          // File may have been deleted between readdir and stat
        }
      }
    }
  }

  /**
   * Hash a file's content using SHA-256.
   */
  private hashFile(filePath: string): string {
    try {
      const content = readFileSync(filePath);
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return '';
    }
  }
}
