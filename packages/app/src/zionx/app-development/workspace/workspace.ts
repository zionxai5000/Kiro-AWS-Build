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
import { readFile as readFileAsync, writeFile as writeFileAsync, mkdir, readdir, stat } from 'node:fs/promises';

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
   * Read a file from a project's workspace.
   * @param projectId - The project identifier.
   * @param relativePath - Path relative to the project directory.
   * @returns The file contents as a string.
   */
  async readFile(projectId: string, relativePath: string): Promise<string> {
    validateRelativePath(relativePath);
    const filePath = join(this.getProjectPath(projectId), relativePath);
    return readFileAsync(filePath, 'utf-8');
  }

  /**
   * Read binary content from a project's workspace.
   * @param projectId - The project identifier.
   * @param relativePath - Path relative to the project directory.
   * @returns The file contents as a Buffer.
   */
  async readBinaryFile(projectId: string, relativePath: string): Promise<Buffer> {
    validateRelativePath(relativePath);
    const filePath = join(this.getProjectPath(projectId), relativePath);
    return readFileAsync(filePath);
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
  }

  /**
   * List all files in a project's workspace (recursive).
   * Returns paths relative to the project directory.
   */
  async listFiles(projectId: string): Promise<string[]> {
    const projectPath = this.getProjectPath(projectId);
    if (!existsSync(projectPath)) return [];
    return this.listFilesRecursive(projectPath, '');
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
