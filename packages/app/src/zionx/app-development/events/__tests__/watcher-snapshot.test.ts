import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WatcherSnapshot, type SnapshotState } from '../watcher-snapshot.js';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDirs() {
  const base = join(tmpdir(), `snapshot-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const workspaceRoot = join(base, 'workspaces');
  const snapshotRoot = join(base, '.watcher-state');
  const projectPath = join(workspaceRoot, 'test-project');

  mkdirSync(projectPath, { recursive: true });
  mkdirSync(snapshotRoot, { recursive: true });

  return { base, workspaceRoot, snapshotRoot, projectPath };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WatcherSnapshot', () => {
  let dirs: ReturnType<typeof createTestDirs>;
  let snapshot: WatcherSnapshot;

  beforeEach(() => {
    dirs = createTestDirs();
    snapshot = new WatcherSnapshot({
      workspaceRoot: dirs.workspaceRoot,
      snapshotRoot: dirs.snapshotRoot,
      bulkThreshold: 100,
      saveDebounceMs: 100,
      saveMaxChanges: 10,
    });
  });

  afterEach(() => {
    snapshot.flushAll();
    if (existsSync(dirs.base)) {
      rmSync(dirs.base, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // Serialize / Deserialize
  // =========================================================================

  describe('load and save', () => {
    it('round-trips snapshot state', () => {
      const state: SnapshotState = {
        'src/index.ts': { hash: 'abc123', mtime: 1000, size: 50 },
        'package.json': { hash: 'def456', mtime: 2000, size: 200 },
      };

      snapshot.save('test-project', state);
      const loaded = snapshot.load('test-project');

      expect(loaded).toEqual(state);
    });

    it('returns empty state for missing snapshot file', () => {
      const loaded = snapshot.load('nonexistent-project');
      expect(loaded).toEqual({});
    });

    it('returns empty state for corrupt JSON', () => {
      const filePath = join(dirs.snapshotRoot, 'corrupt-project.json');
      writeFileSync(filePath, 'not valid json {{{', 'utf-8');

      const loaded = snapshot.load('corrupt-project');
      expect(loaded).toEqual({});
    });

    it('returns empty state for non-object JSON (array)', () => {
      const filePath = join(dirs.snapshotRoot, 'array-project.json');
      writeFileSync(filePath, '[1,2,3]', 'utf-8');

      const loaded = snapshot.load('array-project');
      expect(loaded).toEqual({});
    });

    it('atomic write: existing snapshot survives simulated crash', () => {
      // Save a valid snapshot
      const state: SnapshotState = { 'a.ts': { hash: 'aaa', mtime: 100, size: 10 } };
      snapshot.save('test-project', state);

      // Simulate a .tmp file left behind (crash mid-write)
      const tmpPath = join(dirs.snapshotRoot, 'test-project.json.tmp');
      writeFileSync(tmpPath, 'partial garbage', 'utf-8');

      // Load should still return the valid snapshot (not the .tmp)
      const loaded = snapshot.load('test-project');
      expect(loaded).toEqual(state);
    });
  });

  // =========================================================================
  // Diff Computation
  // =========================================================================

  describe('computeDiff', () => {
    it('detects added files', () => {
      // Empty snapshot, one file in workspace
      writeFileSync(join(dirs.projectPath, 'new.ts'), 'content');

      const diff = snapshot.computeDiff('test-project', dirs.projectPath);

      expect(diff.added).toContain('new.ts');
      expect(diff.modified).toHaveLength(0);
      expect(diff.deleted).toHaveLength(0);
      expect(diff.bulk).toBe(false);
    });

    it('detects deleted files', () => {
      // Snapshot has a file, workspace doesn't
      const state: SnapshotState = {
        'deleted.ts': { hash: 'xxx', mtime: 100, size: 10 },
      };
      snapshot.save('test-project', state);

      const diff = snapshot.computeDiff('test-project', dirs.projectPath);

      expect(diff.deleted).toContain('deleted.ts');
      expect(diff.added).toHaveLength(0);
      expect(diff.bulk).toBe(false);
    });

    it('detects modified files (hash changed)', () => {
      // Create file and save snapshot
      writeFileSync(join(dirs.projectPath, 'mod.ts'), 'original');
      const state = snapshot.buildState(dirs.projectPath);
      snapshot.save('test-project', state);

      // Modify the file (change content but keep same path)
      writeFileSync(join(dirs.projectPath, 'mod.ts'), 'modified content');

      const diff = snapshot.computeDiff('test-project', dirs.projectPath);

      expect(diff.modified).toContain('mod.ts');
      expect(diff.bulk).toBe(false);
    });

    it('mtime+size fast path: unchanged file is NOT hashed', () => {
      // Create file and build state
      writeFileSync(join(dirs.projectPath, 'stable.ts'), 'stable');
      const state = snapshot.buildState(dirs.projectPath);
      snapshot.save('test-project', state);

      // File hasn't changed — diff should be empty
      const diff = snapshot.computeDiff('test-project', dirs.projectPath);

      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.deleted).toHaveLength(0);
    });

    it('empty workspace produces empty diff', () => {
      const diff = snapshot.computeDiff('test-project', dirs.projectPath);
      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.deleted).toHaveLength(0);
      expect(diff.bulk).toBe(false);
    });

    it('missing snapshot treats all files as added', () => {
      writeFileSync(join(dirs.projectPath, 'a.ts'), 'a');
      writeFileSync(join(dirs.projectPath, 'b.ts'), 'b');

      const diff = snapshot.computeDiff('test-project', dirs.projectPath);

      expect(diff.added).toHaveLength(2);
      expect(diff.added).toContain('a.ts');
      expect(diff.added).toContain('b.ts');
    });
  });

  // =========================================================================
  // Bulk Threshold
  // =========================================================================

  describe('bulk threshold', () => {
    it('returns bulk: true when diff exceeds threshold', () => {
      const smallThreshold = new WatcherSnapshot({
        workspaceRoot: dirs.workspaceRoot,
        snapshotRoot: dirs.snapshotRoot,
        bulkThreshold: 3,
      });

      // Create 5 files (exceeds threshold of 3)
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(dirs.projectPath, `file${i}.ts`), `content ${i}`);
      }

      const diff = smallThreshold.computeDiff('test-project', dirs.projectPath);

      expect(diff.bulk).toBe(true);
      expect(diff.added.length).toBe(5); // counts are still available
    });

    it('returns bulk: false when diff is within threshold', () => {
      writeFileSync(join(dirs.projectPath, 'one.ts'), 'one');

      const diff = snapshot.computeDiff('test-project', dirs.projectPath);

      expect(diff.bulk).toBe(false);
    });
  });

  // =========================================================================
  // Snapshot Location Validation
  // =========================================================================

  describe('snapshot location validation', () => {
    it('throws if snapshot root is inside workspace root', () => {
      expect(() => new WatcherSnapshot({
        workspaceRoot: dirs.workspaceRoot,
        snapshotRoot: join(dirs.workspaceRoot, '.state'),
      })).toThrow('must NOT be inside workspace root');
    });

    it('does not throw if snapshot root is outside workspace root', () => {
      expect(() => new WatcherSnapshot({
        workspaceRoot: dirs.workspaceRoot,
        snapshotRoot: dirs.snapshotRoot,
      })).not.toThrow();
    });
  });

  // =========================================================================
  // Debounced Save
  // =========================================================================

  describe('queueSave (debounced)', () => {
    it('saves after debounce interval', async () => {
      const state: SnapshotState = { 'x.ts': { hash: 'h', mtime: 1, size: 1 } };
      snapshot.queueSave('test-project', state);

      // Not saved yet
      expect(snapshot.load('test-project')).toEqual({});

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(snapshot.load('test-project')).toEqual(state);
    });

    it('force-saves after maxChanges', () => {
      const state: SnapshotState = { 'y.ts': { hash: 'h', mtime: 1, size: 1 } };

      // Queue 10 changes (maxChanges = 10)
      for (let i = 0; i < 10; i++) {
        snapshot.queueSave('test-project', state);
      }

      // Should be saved immediately (no debounce wait)
      expect(snapshot.load('test-project')).toEqual(state);
    });

    it('flushAll saves all pending', () => {
      const state1: SnapshotState = { 'a.ts': { hash: 'a', mtime: 1, size: 1 } };
      const state2: SnapshotState = { 'b.ts': { hash: 'b', mtime: 2, size: 2 } };

      snapshot.queueSave('proj-1', state1);
      snapshot.queueSave('proj-2', state2);

      snapshot.flushAll();

      expect(snapshot.load('proj-1')).toEqual(state1);
      expect(snapshot.load('proj-2')).toEqual(state2);
    });
  });

  // =========================================================================
  // buildState
  // =========================================================================

  describe('buildState', () => {
    it('builds state with hash, mtime, size for all files', () => {
      writeFileSync(join(dirs.projectPath, 'index.ts'), 'export {}');
      mkdirSync(join(dirs.projectPath, 'src'), { recursive: true });
      writeFileSync(join(dirs.projectPath, 'src', 'app.ts'), 'const x = 1;');

      const state = snapshot.buildState(dirs.projectPath);

      expect(Object.keys(state)).toHaveLength(2);
      expect(state['index.ts']).toBeDefined();
      expect(state['index.ts']!.hash).toHaveLength(64); // SHA-256 hex
      expect(state['index.ts']!.mtime).toBeGreaterThan(0);
      expect(state['index.ts']!.size).toBeGreaterThan(0);
      expect(state['src/app.ts']).toBeDefined();
    });
  });
});
