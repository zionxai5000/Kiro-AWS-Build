import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Workspace, DirectoryTraversalError, WorkspaceError } from '../workspace.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Workspace', () => {
  let workspace: Workspace;
  let testRoot: string;
  const testProjectId = `test-project-${Date.now()}`;

  beforeEach(() => {
    // Use a temp directory for tests to avoid polluting the repo
    testRoot = join(tmpdir(), `seraphim-workspace-test-${Date.now()}`);
    mkdirSync(testRoot, { recursive: true });
    process.env.SERAPHIM_WORKSPACE_ROOT = testRoot;

    // Re-import would be needed to pick up env change, but since WORKSPACE_ROOT
    // is resolved at module load time, we test via the class methods which use
    // the env-based root. For testing, we instantiate directly.
    workspace = new Workspace();
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
    delete process.env.SERAPHIM_WORKSPACE_ROOT;
  });

  describe('getProjectPath', () => {
    it('returns absolute path for valid projectId', () => {
      const path = workspace.getProjectPath('my-project');
      expect(path).toContain('my-project');
    });

    it('rejects empty projectId', () => {
      expect(() => workspace.getProjectPath('')).toThrow(WorkspaceError);
    });

    it('rejects projectId with path separators', () => {
      expect(() => workspace.getProjectPath('foo/bar')).toThrow(WorkspaceError);
      expect(() => workspace.getProjectPath('foo\\bar')).toThrow(WorkspaceError);
    });

    it('rejects ".." as projectId', () => {
      expect(() => workspace.getProjectPath('..')).toThrow(DirectoryTraversalError);
    });
  });

  describe('ensureProjectDir', () => {
    it('creates the project directory', async () => {
      const path = await workspace.ensureProjectDir(testProjectId);
      expect(existsSync(path)).toBe(true);
    });

    it('is idempotent — calling twice does not error', async () => {
      await workspace.ensureProjectDir(testProjectId);
      await workspace.ensureProjectDir(testProjectId);
    });
  });

  describe('writeFile + readFile', () => {
    it('writes and reads a file', async () => {
      await workspace.ensureProjectDir(testProjectId);
      await workspace.writeFile(testProjectId, 'src/index.ts', 'console.log("hello");');
      const content = await workspace.readFile(testProjectId, 'src/index.ts');
      expect(content).toBe('console.log("hello");');
    });

    it('creates parent directories automatically', async () => {
      await workspace.ensureProjectDir(testProjectId);
      await workspace.writeFile(testProjectId, 'deep/nested/dir/file.txt', 'content');
      const content = await workspace.readFile(testProjectId, 'deep/nested/dir/file.txt');
      expect(content).toBe('content');
    });
  });

  describe('listFiles', () => {
    it('returns empty array for non-existent project', async () => {
      const files = await workspace.listFiles('nonexistent-project');
      expect(files).toEqual([]);
    });

    it('lists all files recursively', async () => {
      const listProjectId = `list-test-${Date.now()}`;
      await workspace.ensureProjectDir(listProjectId);
      await workspace.writeFile(listProjectId, 'a.ts', 'a');
      await workspace.writeFile(listProjectId, 'src/b.ts', 'b');
      await workspace.writeFile(listProjectId, 'src/lib/c.ts', 'c');

      const files = await workspace.listFiles(listProjectId);
      expect(files.sort()).toEqual(['a.ts', 'src/b.ts', 'src/lib/c.ts'].sort());
    });
  });

  describe('exists', () => {
    it('returns true for existing file', async () => {
      await workspace.ensureProjectDir(testProjectId);
      await workspace.writeFile(testProjectId, 'exists.txt', 'yes');
      expect(await workspace.exists(testProjectId, 'exists.txt')).toBe(true);
    });

    it('returns false for non-existing file', async () => {
      await workspace.ensureProjectDir(testProjectId);
      expect(await workspace.exists(testProjectId, 'nope.txt')).toBe(false);
    });
  });

  describe('directory traversal protection', () => {
    it('rejects "../etc/passwd" in readFile', async () => {
      await expect(
        workspace.readFile(testProjectId, '../../etc/passwd'),
      ).rejects.toThrow(DirectoryTraversalError);
    });

    it('rejects "../etc/passwd" in writeFile', async () => {
      await expect(
        workspace.writeFile(testProjectId, '../../etc/passwd', 'hacked'),
      ).rejects.toThrow(DirectoryTraversalError);
    });

    it('rejects "../etc/passwd" in exists', async () => {
      await expect(
        workspace.exists(testProjectId, '../../etc/passwd'),
      ).rejects.toThrow(DirectoryTraversalError);
    });

    it('rejects absolute paths', async () => {
      await expect(
        workspace.readFile(testProjectId, '/etc/passwd'),
      ).rejects.toThrow(DirectoryTraversalError);
    });

    it('rejects paths with null bytes', async () => {
      await expect(
        workspace.readFile(testProjectId, 'file\0.txt'),
      ).rejects.toThrow(DirectoryTraversalError);
    });

    it('rejects "foo/../../../etc/passwd" (embedded traversal)', async () => {
      await expect(
        workspace.readFile(testProjectId, 'foo/../../../etc/passwd'),
      ).rejects.toThrow(DirectoryTraversalError);
    });
  });
});
