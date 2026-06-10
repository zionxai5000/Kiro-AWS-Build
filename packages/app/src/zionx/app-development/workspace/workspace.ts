/**
 * Workspace Abstraction — manages the /generated/{projectId}/ directory structure.
 *
 * Provides safe file operations with directory traversal protection.
 * The workspace root is resolved ONCE at module load time to prevent
 * cwd changes from relocating the workspace mid-execution.
 *
 * Root discovery method: walks up from this file's directory (__dirname)
 * looking for the nearest package.json that contains a "workspaces" field.
 * This identifies the monorepo root reliably regardless of cwd.
 * Uses __dirname which is available in Node16 CommonJS output.
 *
 * Override: set SERAPHIM_WORKSPACE_ROOT environment variable to use a
 * custom absolute path instead of the default {repoRoot}/workspaces/.
 */

import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { readFile as readFileAsync, writeFile as writeFileAsync, mkdir, readdir, stat, cp } from 'node:fs/promises';
import type { S3WorkspaceStore } from '../services/s3-workspace-store.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

export class DirectoryTraversalError extends WorkspaceError {
  constructor(relativePath: string) {
    super(`Directory traversal detected: "${relativePath}" — path must not contain ".." or be absolute`);
    this.name = 'DirectoryTraversalError';
  }
}

// ---------------------------------------------------------------------------
// Repo Root Discovery
// ---------------------------------------------------------------------------

/**
 * Discover the monorepo root by walking up from this file's directory looking for
 * a package.json with a "workspaces" field.
 *
 * Method: Uses __dirname (available in Node16/CommonJS output) to get the
 * directory of this compiled file, then walks up the tree.
 */
function discoverRepoRoot(): string {
  let current = __dirname;

  for (let i = 0; i < 20; i++) { // max 20 levels to prevent infinite loop
    const pkgPath = join(current, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) {
          return current;
        }
      } catch {
        // malformed package.json, keep walking
      }
    }
    const parent = dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }

  throw new WorkspaceError(
    'Could not discover monorepo root. No package.json with "workspaces" field found. ' +
    'Set SERAPHIM_WORKSPACE_ROOT environment variable as a fallback.',
  );
}

// ---------------------------------------------------------------------------
// Workspace Root — resolved ONCE at module load time
// ---------------------------------------------------------------------------

const REPO_ROOT = discoverRepoRoot();

/**
 * The absolute path to the workspace root directory.
 * Resolved once at module load. Does not change during execution.
 */
export const WORKSPACE_ROOT: string = process.env.SERAPHIM_WORKSPACE_ROOT
  ? resolve(process.env.SERAPHIM_WORKSPACE_ROOT)
  : join(REPO_ROOT, 'workspaces');

// ---------------------------------------------------------------------------
// Path Validation
// ---------------------------------------------------------------------------

/**
 * Validate a relative path against directory traversal attacks.
 * Rejects paths containing "..", absolute paths, and null bytes.
 */
function validateRelativePath(relativePath: string): void {
  if (!relativePath) {
    throw new WorkspaceError('relativePath must not be empty');
  }
  if (isAbsolute(relativePath)) {
    throw new DirectoryTraversalError(relativePath);
  }
  if (relativePath.includes('\0')) {
    throw new DirectoryTraversalError(relativePath);
  }

  // Normalize and check for traversal
  const normalized = relative('.', relativePath);
  if (normalized.startsWith('..') || normalized.includes('/..') || normalized.includes('\\..')) {
    throw new DirectoryTraversalError(relativePath);
  }

  // Also reject raw ".." segments in the original path
  const segments = relativePath.split(/[/\\]/);
  if (segments.includes('..')) {
    throw new DirectoryTraversalError(relativePath);
  }
}

/**
 * Validate a project ID (no path separators, no traversal).
 */
function validateProjectId(projectId: string): void {
  if (!projectId) {
    throw new WorkspaceError('projectId must not be empty');
  }
  if (/[/\\]/.test(projectId)) {
    throw new WorkspaceError(`Invalid projectId: "${projectId}" — must not contain path separators`);
  }
  if (projectId === '.' || projectId === '..') {
    throw new DirectoryTraversalError(projectId);
  }
}

// ---------------------------------------------------------------------------
// Workspace Class
// ---------------------------------------------------------------------------

export class Workspace {
  /**
   * Optional durable storage backend. When set, every writeFile / writeBinaryFile
   * mirrors to S3 in the background so workspaces survive Fargate restarts.
   * Reads always go through the local filesystem; the S3 store is hydrated to
   * disk at server boot via S3WorkspaceStore.hydrateAll().
   */
  private durableStore: S3WorkspaceStore | null = null;

  /**
   * Inject the S3 store at boot (after hydrateAll completes). Optional.
   * If never set, Workspace operates in local-only mode (matches pre-Phase-A
   * behavior).
   */
  setDurableStore(store: S3WorkspaceStore): void {
    this.durableStore = store;
  }

  /**
   * Inspect whether durable persistence is wired. Used by /app-dev/health to
   * surface "projects are persistent" vs "projects are ephemeral" to the
   * dashboard.
   */
  hasDurableStore(): boolean {
    return this.durableStore !== null;
  }

  /**
   * Get the absolute path to a project's workspace directory.
   */
  getProjectPath(projectId: string): string {
    validateProjectId(projectId);
    return join(WORKSPACE_ROOT, projectId);
  }

  /**
   * Ensure the project directory exists. Creates it if missing.
   */
  async ensureProjectDir(projectId: string): Promise<string> {
    const projectPath = this.getProjectPath(projectId);
    await mkdir(projectPath, { recursive: true });
    return projectPath;
  }

  /**
   * Copy `templates/golden-starter/` into the project workspace.
   *
   * This is what gives the agent a real working starting point — without
   * it the project directory is empty and the agent tries to scaffold
   * from scratch via `npm install`, which fails when E2B network is
   * constrained. After seed, the project has the canonical Expo SDK 54
   * shell, tokens, components, store, and onboarding flow already in
   * place; the agent customizes from there.
   *
   * Idempotent — if package.json already exists at the project root we
   * assume seeding happened and skip. Returns true if files were copied.
   *
   * Multi-task safe: writes go through `writeFile` so they mirror to the
   * durable S3 store. Without this, only the task that handled
   * createProject would have the seeded files; other Fargate tasks
   * processing the same project would see an empty workspace.
   */
  async seedFromGoldenStarter(projectId: string): Promise<boolean> {
    const projectPath = await this.ensureProjectDir(projectId);
    // Idempotent — skip if already seeded.
    const pkgPath = join(projectPath, 'package.json');
    if (existsSync(pkgPath)) return false;

    const starterPath = join(REPO_ROOT, 'templates', 'golden-starter');
    if (!existsSync(starterPath)) {
      // Starter not in place — leave empty. The agent will scaffold via
      // run_command. This is the legacy path.
      return false;
    }

    // Walk the starter recursively and writeFile each entry through the
    // workspace API so durable-store mirroring catches it.
    const skipDirs = new Set(['node_modules', '.expo']);
    const walk = async (dir: string, rel: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skipDirs.has(entry.name)) continue;
        const fullSrc = join(dir, entry.name);
        const fullRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(fullSrc, fullRel);
        } else if (entry.isFile()) {
          try {
            const buf = await readFileAsync(fullSrc);
            // Heuristic: if first 8KB is mostly printable, treat as text
            // and use writeFile (mirrors to S3). Otherwise binary path.
            const head = buf.subarray(0, Math.min(8192, buf.length));
            const printable = head.filter((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)).length;
            const isText = printable / Math.max(1, head.length) > 0.85;
            if (isText) {
              await this.writeFile(projectId, fullRel, buf.toString('utf-8'));
            } else {
              await this.writeBinaryFile(projectId, fullRel, buf);
            }
          } catch (e) {
            console.warn(`[seedFromGoldenStarter] copy ${fullRel}: ${(e as Error).message}`);
          }
        }
      }
    };
    await walk(starterPath, '');
    return true;
  }

  /**
   * List all known project IDs by reading the workspace root.
   * List every project ID. Walks both local disk and the durable store
   * to handle the multi-task case where this Fargate task hasn't yet
   * hydrated a project that another task created.
   * Returns an empty array if neither layer has any projects.
   */
  async listProjects(): Promise<string[]> {
    const ids = new Set<string>();
    if (existsSync(WORKSPACE_ROOT)) {
      try {
        const entries = await readdir(WORKSPACE_ROOT, { withFileTypes: true });
        for (const e of entries) if (e.isDirectory()) ids.add(e.name);
      } catch { /* ignore */ }
    }
    if (this.durableStore) {
      try {
        const remote = await this.durableStore.listProjects();
        for (const id of remote) ids.add(id);
      } catch { /* ignore */ }
    }
    return Array.from(ids);
  }

  /**
   * Get metadata for a project: id, file count, mtime of newest file,
   * and the prompt that started it (read from .meta/prompt.txt if present).
   */
  async getProjectMeta(projectId: string): Promise<{
    projectId: string;
    fileCount: number;
    createdAt: string | null;
    updatedAt: string | null;
    name?: string;
    prompt?: string;
  }> {
    const projectPath = this.getProjectPath(projectId);
    if (!existsSync(projectPath)) {
      return { projectId, fileCount: 0, createdAt: null, updatedAt: null };
    }

    const files = await this.listFiles(projectId);
    let newest = 0;
    let oldest = Number.POSITIVE_INFINITY;
    for (const f of files) {
      try {
        const fp = join(projectPath, f);
        const s = await stat(fp);
        const m = s.mtimeMs;
        if (m > newest) newest = m;
        const c = s.ctimeMs;
        if (c < oldest) oldest = c;
      } catch { /* skip */ }
    }
    if (oldest === Number.POSITIVE_INFINITY) oldest = newest;

    let name: string | undefined;
    let prompt: string | undefined;
    try {
      const meta = JSON.parse(await this.readFile(projectId, '.meta/project.json'));
      name = meta?.name;
      prompt = meta?.prompt;
    } catch { /* meta optional */ }

    return {
      projectId,
      fileCount: files.length,
      createdAt: oldest ? new Date(oldest).toISOString() : null,
      updatedAt: newest ? new Date(newest).toISOString() : null,
      name,
      prompt,
    };
  }

  /**
   * Persist project-level metadata (name, original prompt) under .meta/project.json.
   * Used by the createProject API and the dashboard project list.
   *
   * Accepts arbitrary fields for forward-compatibility — `ownerId` (Phase 5)
   * and `qualityGate` (Phase 5) are written through this path.
   */
  async writeProjectMeta(
    projectId: string,
    meta: { name: string; prompt?: string; description?: string; ownerId?: string } & Record<string, unknown>,
  ): Promise<void> {
    await this.writeFile(projectId, '.meta/project.json', JSON.stringify({
      ...meta,
      updatedAt: new Date().toISOString(),
    }, null, 2));
  }

  /**
   * Read the raw project meta JSON. Returns null if missing/unreadable.
   * Used by the project-ownership check and the studio sidebar.
   */
  async readProjectMeta(projectId: string): Promise<Record<string, unknown> | null> {
    try {
      return JSON.parse(await this.readFile(projectId, '.meta/project.json')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Read a file from a project's workspace.
   *
   * Multi-task safe: if the file isn't on local disk, fall back to the
   * durable S3 store. This handles the "task A wrote it, task B reads it"
   * race that's been killing project ownership checks across Fargate
   * tasks. When S3 returns content, we ALSO mirror it to local disk so
   * subsequent reads on the same task are fast.
   *
   * @param projectId - The project identifier.
   * @param relativePath - Path relative to the project directory.
   * @returns The file contents as a string.
   */
  async readFile(projectId: string, relativePath: string): Promise<string> {
    validateRelativePath(relativePath);
    const filePath = join(this.getProjectPath(projectId), relativePath);
    try {
      return await readFileAsync(filePath, 'utf-8');
    } catch (err) {
      // Local miss — try durable store.
      if (this.durableStore) {
        try {
          const buf = await this.durableStore.readFile(projectId, relativePath);
          if (buf) {
            // Hydrate to local disk for next time. Don't await — fire and forget.
            void (async () => {
              try {
                await mkdir(dirname(filePath), { recursive: true });
                await writeFileAsync(filePath, buf);
              } catch { /* ignore */ }
            })();
            return buf.toString('utf-8');
          }
        } catch { /* ignore */ }
      }
      throw err;
    }
  }

  /**
   * Read binary content from a project's workspace.
   * Same multi-task fallback as `readFile`.
   * @param projectId - The project identifier.
   * @param relativePath - Path relative to the project directory.
   * @returns The file contents as a Buffer.
   */
  async readBinaryFile(projectId: string, relativePath: string): Promise<Buffer> {
    validateRelativePath(relativePath);
    const filePath = join(this.getProjectPath(projectId), relativePath);
    try {
      return await readFileAsync(filePath);
    } catch (err) {
      if (this.durableStore) {
        try {
          const buf = await this.durableStore.readFile(projectId, relativePath);
          if (buf) {
            void (async () => {
              try {
                await mkdir(dirname(filePath), { recursive: true });
                await writeFileAsync(filePath, buf);
              } catch { /* ignore */ }
            })();
            return buf;
          }
        } catch { /* ignore */ }
      }
      throw err;
    }
  }

  /**
   * Write a file to a project's workspace.
   * Creates parent directories as needed.
   * @param projectId - The project identifier.
   * @param relativePath - Path relative to the project directory.
   * @param content - The file content to write.
   */
  async writeFile(projectId: string, relativePath: string, content: string): Promise<void> {
    validateRelativePath(relativePath);
    const filePath = join(this.getProjectPath(projectId), relativePath);
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFileAsync(filePath, content, 'utf-8');
    // Mirror to durable storage (best-effort, never blocks).
    if (this.durableStore) {
      void this.durableStore.mirrorFile(projectId, relativePath, content);
    }
  }

  /**
   * Write binary content (Buffer) to a project's workspace.
   * Creates parent directories as needed.
   * @param projectId - The project identifier.
   * @param relativePath - Path relative to the project directory.
   * @param content - The binary content to write (Buffer).
   */
  async writeBinaryFile(projectId: string, relativePath: string, content: Buffer): Promise<void> {
    validateRelativePath(relativePath);
    const filePath = join(this.getProjectPath(projectId), relativePath);
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFileAsync(filePath, content);
    // Mirror to durable storage (best-effort, never blocks).
    if (this.durableStore) {
      void this.durableStore.mirrorFile(projectId, relativePath, content);
    }
  }

  /**
   * List all files in a project's workspace (recursive).
   * Returns paths relative to the project directory.
   */
  async listFiles(projectId: string): Promise<string[]> {
    const projectPath = this.getProjectPath(projectId);
    const files = new Set<string>();
    if (existsSync(projectPath)) {
      try {
        const local = await this.listFilesRecursive(projectPath, '');
        for (const f of local) files.add(f);
      } catch { /* ignore */ }
    }
    // Multi-task fallback — also pick up files this task hasn't hydrated.
    if (this.durableStore) {
      try {
        const remote = await this.durableStore.listFilesForProject(projectId);
        for (const f of remote) files.add(f);
      } catch { /* ignore */ }
    }
    return Array.from(files).sort();
  }

  /**
   * Check if a file exists in a project's workspace.
   */
  async exists(projectId: string, relativePath: string): Promise<boolean> {
    validateRelativePath(relativePath);
    const filePath = join(this.getProjectPath(projectId), relativePath);
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async listFilesRecursive(basePath: string, prefix: string): Promise<string[]> {
    const entries = await readdir(join(basePath, prefix), { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const nested = await this.listFilesRecursive(basePath, entryPath);
        files.push(...nested);
      } else {
        files.push(entryPath);
      }
    }

    return files;
  }
}
