/**
 * Layer 3: Obsidian Local REST API Driver
 *
 * - Programmatic vault access for Seraphim agents
 * - Read/write/search notes via HTTP
 * - Requires Obsidian running with Local REST API plugin (port 27124)
 * - Implements the SeraphimOS Driver interface pattern
 */

import { VaultNote, VaultSyncConfig, ObsidianSearchResult } from './types.js';

export type DriverStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

export class ObsidianApiDriver {
  private config: VaultSyncConfig;
  private _status: DriverStatus = 'disconnected';
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: VaultSyncConfig) {
    this.config = config;
    this.baseUrl = config.obsidianApiUrl ?? 'https://127.0.0.1:27124';
    this.headers = {
      'Content-Type': 'application/json',
      ...(config.obsidianApiToken
        ? { Authorization: `Bearer ${config.obsidianApiToken}` }
        : {}),
    };
  }

  get status(): DriverStatus {
    return this._status;
  }

  /**
   * Connect to Obsidian's Local REST API.
   */
  async connect(): Promise<{ connected: boolean; message: string }> {
    this._status = 'connecting';
    try {
      const response = await this.fetch('/');
      if (response.ok) {
        this._status = 'ready';
        console.log('[Obsidian API] Connected to Local REST API');
        return { connected: true, message: 'Connected' };
      }
      this._status = 'error';
      return { connected: false, message: `HTTP ${response.status}` };
    } catch (err) {
      this._status = 'error';
      const message = (err as Error).message;
      console.warn(`[Obsidian API] Connection failed: ${message}`);
      return { connected: false, message };
    }
  }

  /**
   * Check if Obsidian is running and API is accessible.
   */
  async healthCheck(): Promise<{ healthy: boolean; status: DriverStatus }> {
    try {
      const response = await this.fetch('/');
      const healthy = response.ok;
      this._status = healthy ? 'ready' : 'error';
      return { healthy, status: this._status };
    } catch {
      this._status = 'disconnected';
      return { healthy: false, status: this._status };
    }
  }

  /**
   * Read a vault note by path.
   */
  async readNote(vaultPath: string): Promise<VaultNote | null> {
    try {
      const response = await this.fetch(`/vault/${encodeURIComponent(vaultPath)}`, {
        headers: { ...this.headers, Accept: 'application/vnd.olrapi.note+json' },
      });
      if (!response.ok) return null;

      const data = await response.json();
      return {
        path: vaultPath,
        frontmatter: data.frontmatter ?? {},
        content: data.content ?? '',
        lastModified: new Date(data.stat?.mtime ?? Date.now()),
      };
    } catch {
      return null;
    }
  }

  /**
   * Write/update a vault note.
   */
  async writeNote(vaultPath: string, content: string): Promise<boolean> {
    try {
      const response = await this.fetch(`/vault/${encodeURIComponent(vaultPath)}`, {
        method: 'PUT',
        headers: { ...this.headers, 'Content-Type': 'text/markdown' },
        body: content,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Append content to an existing note.
   */
  async appendToNote(vaultPath: string, content: string): Promise<boolean> {
    try {
      const response = await this.fetch(`/vault/${encodeURIComponent(vaultPath)}`, {
        method: 'POST',
        headers: { ...this.headers, 'Content-Type': 'text/markdown' },
        body: content,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Delete a vault note.
   */
  async deleteNote(vaultPath: string): Promise<boolean> {
    try {
      const response = await this.fetch(`/vault/${encodeURIComponent(vaultPath)}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Search vault content.
   */
  async search(query: string): Promise<ObsidianSearchResult[]> {
    try {
      const response = await this.fetch('/search/simple/', {
        method: 'POST',
        body: JSON.stringify({ query }),
      });
      if (!response.ok) return [];
      return (await response.json()) as ObsidianSearchResult[];
    } catch {
      return [];
    }
  }

  /**
   * List all files in vault.
   */
  async listFiles(): Promise<string[]> {
    try {
      const response = await this.fetch('/vault/');
      if (!response.ok) return [];
      const data = await response.json();
      return data.files ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Get the currently active file in Obsidian.
   */
  async getActiveFile(): Promise<string | null> {
    try {
      const response = await this.fetch('/active/');
      if (!response.ok) return null;
      const text = await response.text();
      return text || null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async fetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    // Note: Local REST API uses HTTPS with self-signed cert
    // In production, use NODE_TLS_REJECT_UNAUTHORIZED=0 or trust the cert
    const fetchFn = (globalThis as Record<string, unknown>).fetch as typeof fetch;
    return fetchFn(url, {
      ...options,
      headers: { ...this.headers, ...options?.headers },
    });
  }
}
