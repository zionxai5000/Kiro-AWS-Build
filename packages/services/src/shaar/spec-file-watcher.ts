/**
 * Shaar Service — Spec File Watcher
 *
 * Watches the `.kiro/specs/seraphim-os-core/` directory for changes to
 * markdown files. On change, computes a SHA-256 content hash and publishes
 * a `spec.document.updated` event via the provided broadcast callback.
 *
 * Uses Node.js `fs.watch` (no external dependencies) with 300ms debounce
 * to avoid rapid-fire events during editor saves.
 *
 * Requirements: 47h.28, 47h.29, 47h.30, 47h.31, 47h.32
 */

import { watch, readFile, type FSWatcher } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, basename } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Valid spec document types that can be watched. */
export type SpecDocumentType = 'requirements' | 'design' | 'capabilities';

/** The event shape pushed via WebSocket when a spec document changes. */
export interface SpecDocumentUpdatedEvent {
  type: 'spec.document.updated';
  data: {
    documentType: SpecDocumentType;
    hash: string;
    timestamp: string;
  };
  timestamp: string;
}

/** Callback invoked when a spec document change is detected. */
export type SpecChangeCallback = (event: SpecDocumentUpdatedEvent) => void;

/** Configuration for the SpecFileWatcher. */
export interface SpecFileWatcherOptions {
  /** Absolute or relative path to the spec directory. */
  specDir: string;
  /** Callback invoked when a document change is detected. */
  onChanged: SpecChangeCallback;
  /** Debounce interval in milliseconds. Defaults to 300. */
  debounceMs?: number;
}

// ---------------------------------------------------------------------------
// File → Document Type Mapping
// ---------------------------------------------------------------------------

const FILE_TO_DOC_TYPE: Record<string, SpecDocumentType> = {
  'requirements.md': 'requirements',
  'design.md': 'design',
  'capabilities.md': 'capabilities',
};

// ---------------------------------------------------------------------------
// SpecFileWatcher
// ---------------------------------------------------------------------------

/**
 * SpecFileWatcher monitors the spec directory for markdown file changes
 * and publishes update events with content hashes for change detection.
 */
export class SpecFileWatcher {
  private specDir: string;
  private onChanged: SpecChangeCallback;
  private debounceMs: number;
  private watcher: FSWatcher | null = null;
  private lastHashes = new Map<SpecDocumentType, string>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: SpecFileWatcherOptions) {
    this.specDir = resolve(options.specDir);
    this.onChanged = options.onChanged;
    this.debounceMs = options.debounceMs ?? 300;
  }

  /**
   * Start watching the spec directory for file changes.
   * Computes initial hashes for all known spec documents.
   */
  async start(): Promise<void> {
    // Compute initial hashes so we can detect real changes
    await this.computeInitialHashes();

    try {
      this.watcher = watch(this.specDir, { persistent: false }, (eventType, filename) => {
        if (!filename) return;
        this.handleFileEvent(filename);
      });

      this.watcher.on('error', (err) => {
        console.warn('[SpecFileWatcher] Watcher error:', (err as Error).message);
      });
    } catch (err) {
      console.warn('[SpecFileWatcher] Could not start watcher:', (err as Error).message);
    }
  }

  /**
   * Stop watching and clean up all timers.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Get the last known hash for a document type.
   * Useful for the Document API to include in responses.
   */
  getLastHash(documentType: SpecDocumentType): string | undefined {
    return this.lastHashes.get(documentType);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private handleFileEvent(filename: string): void {
    const docType = FILE_TO_DOC_TYPE[filename];
    if (!docType) return; // Not a tracked spec file

    // Debounce: clear any existing timer for this file
    const existing = this.debounceTimers.get(filename);
    if (existing) {
      clearTimeout(existing);
    }

    this.debounceTimers.set(
      filename,
      setTimeout(() => {
        this.debounceTimers.delete(filename);
        this.processChange(filename, docType);
      }, this.debounceMs),
    );
  }

  private processChange(filename: string, docType: SpecDocumentType): void {
    const filePath = resolve(this.specDir, filename);

    readFile(filePath, 'utf-8', (err, content) => {
      if (err) {
        console.warn(`[SpecFileWatcher] Could not read ${filename}:`, err.message);
        return;
      }

      const hash = this.computeHash(content);
      const previousHash = this.lastHashes.get(docType);

      // Only publish if the content actually changed
      if (hash === previousHash) return;

      this.lastHashes.set(docType, hash);

      const now = new Date().toISOString();
      const event: SpecDocumentUpdatedEvent = {
        type: 'spec.document.updated',
        data: {
          documentType: docType,
          hash,
          timestamp: now,
        },
        timestamp: now,
      };

      this.onChanged(event);
    });
  }

  private async computeInitialHashes(): Promise<void> {
    const { readFile: readFileAsync } = await import('node:fs/promises');

    for (const [filename, docType] of Object.entries(FILE_TO_DOC_TYPE)) {
      const filePath = resolve(this.specDir, filename);
      try {
        const content = await readFileAsync(filePath, 'utf-8');
        this.lastHashes.set(docType, this.computeHash(content));
      } catch {
        // File may not exist yet — that's fine
      }
    }
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
