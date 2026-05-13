/**
 * Recent Writes Registry — anti-feedback-loop mechanism for the file watcher.
 *
 * When a pipeline hook writes a file to the workspace, it registers the path
 * here. The file watcher checks this registry before emitting events — if the
 * path was recently written by a hook, the event is suppressed to prevent
 * infinite loops (hook writes file → watcher fires → hook runs again → ...).
 *
 * TTL-based: entries expire after a configurable duration (default 2000ms).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecentWritesOptions {
  /** Time-to-live for entries in milliseconds (default: 2000) */
  ttlMs?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class RecentWritesRegistry {
  private readonly entries = new Map<string, number>(); // path → timestamp
  private readonly ttlMs: number;

  constructor(opts: RecentWritesOptions = {}) {
    this.ttlMs = opts.ttlMs ?? 2000;
  }

  /**
   * Mark a file path as recently written by a hook.
   * Call this BEFORE writing the file.
   */
  markAsOwnWrite(filePath: string): void {
    this.entries.set(this.normalize(filePath), Date.now());
  }

  /**
   * Check if a file path was recently written by a hook.
   * Returns true if the path is in the registry and within TTL.
   * Also prunes expired entries opportunistically.
   */
  isOwnWrite(filePath: string): boolean {
    const normalized = this.normalize(filePath);
    const timestamp = this.entries.get(normalized);

    if (timestamp === undefined) {
      return false;
    }

    const elapsed = Date.now() - timestamp;
    if (elapsed > this.ttlMs) {
      // Expired — remove and return false
      this.entries.delete(normalized);
      return false;
    }

    return true;
  }

  /**
   * Get the number of active (non-expired) entries.
   */
  size(): number {
    this.prune();
    return this.entries.size;
  }

  /**
   * Clear all entries. Useful for testing.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Remove all expired entries.
   */
  prune(): void {
    const now = Date.now();
    for (const [path, timestamp] of this.entries) {
      if (now - timestamp > this.ttlMs) {
        this.entries.delete(path);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Normalize path separators to forward slashes for consistent matching.
   */
  private normalize(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }
}
