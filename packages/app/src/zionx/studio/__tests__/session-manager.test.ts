/**
 * Unit tests for ZionX App Development Studio — Session Manager
 *
 * Validates: Requirements 42a.1, 42d.11, 42c.8
 *
 * Tests session creation, undo/redo stack management, file tree updates,
 * build status transitions, and activity tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultStudioSessionManager } from '../session-manager.js';
import type { StudioSessionManager } from '../session-manager.js';
import type {
  ProjectState,
  FileNode,
  PlatformBuildStatus,
  EditCommand,
} from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validInitialState(): Partial<ProjectState> {
  return {
    appName: 'FitTracker',
    appDescription: 'A fitness tracking app',
    targetPlatforms: ['ios', 'android'],
  };
}

function createEditCommand(id: string, description: string): EditCommand {
  return {
    id,
    timestamp: new Date(),
    description,
    fileChanges: [
      {
        path: 'src/App.tsx',
        previousContent: 'const color = "red";',
        newContent: 'const color = "blue";',
        type: 'modify',
      },
    ],
  };
}

function createFileTree(): FileNode[] {
  return [
    {
      path: '/src',
      name: 'src',
      type: 'directory',
      children: [
        { path: '/src/App.tsx', name: 'App.tsx', type: 'file', language: 'typescript' },
        { path: '/src/index.ts', name: 'index.ts', type: 'file', language: 'typescript' },
      ],
    },
    { path: '/package.json', name: 'package.json', type: 'file', language: 'json' },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultStudioSessionManager', () => {
  let manager: StudioSessionManager;

  beforeEach(() => {
    manager = new DefaultStudioSessionManager();
  });

  describe('createSession', () => {
    it('creates a session with valid project state', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());

      expect(session.sessionId).toBeTruthy();
      expect(session.tenantId).toBe('tenant-1');
      expect(session.appId).toBe('app-1');
      expect(session.projectState.appName).toBe('FitTracker');
      expect(session.projectState.appDescription).toBe('A fitness tracking app');
      expect(session.projectState.targetPlatforms).toEqual(['ios', 'android']);
    });

    it('initializes with empty undo/redo stacks', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());

      expect(session.undoStack).toEqual([]);
      expect(session.redoStack).toEqual([]);
    });

    it('initializes with idle build status for both platforms', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());

      expect(session.buildStatus.ios.status).toBe('idle');
      expect(session.buildStatus.android.status).toBe('idle');
    });

    it('initializes with disconnected preview', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());

      expect(session.previewConnection.status).toBe('disconnected');
    });

    it('sets createdAt and lastActivityAt timestamps', async () => {
      const before = new Date();
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      const after = new Date();

      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(session.lastActivityAt.getTime()).toEqual(session.createdAt.getTime());
    });

    it('fills defaults for missing project state fields', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', {});

      expect(session.projectState.appName).toBe('');
      expect(session.projectState.screens).toEqual([]);
      expect(session.projectState.navigation.type).toBe('stack');
      expect(session.projectState.monetization.model).toBe('freemium');
    });
  });

  describe('getSession', () => {
    it('returns the session by id', async () => {
      const created = await manager.createSession('tenant-1', 'app-1', validInitialState());
      const fetched = await manager.getSession(created.sessionId);

      expect(fetched).not.toBeNull();
      expect(fetched!.sessionId).toBe(created.sessionId);
    });

    it('returns null for non-existent session', async () => {
      const result = await manager.getSession('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('updateProjectState', () => {
    it('merges partial updates into project state', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      await manager.updateProjectState(session.sessionId, { appName: 'FitTracker Pro' });

      const updated = await manager.getSession(session.sessionId);
      expect(updated!.projectState.appName).toBe('FitTracker Pro');
      expect(updated!.projectState.appDescription).toBe('A fitness tracking app');
    });

    it('updates lastActivityAt', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      const originalActivity = session.lastActivityAt;

      // Small delay to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 5));
      await manager.updateProjectState(session.sessionId, { appName: 'Updated' });

      const updated = await manager.getSession(session.sessionId);
      expect(updated!.lastActivityAt.getTime()).toBeGreaterThan(originalActivity.getTime());
    });

    it('throws for non-existent session', async () => {
      await expect(
        manager.updateProjectState('non-existent', { appName: 'X' }),
      ).rejects.toThrow('Session not found');
    });
  });

  describe('updateFileTree', () => {
    it('replaces the file tree', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      const fileTree = createFileTree();

      await manager.updateFileTree(session.sessionId, fileTree);

      const updated = await manager.getSession(session.sessionId);
      expect(updated!.fileTree).toEqual(fileTree);
      expect(updated!.fileTree).toHaveLength(2);
    });

    it('throws for non-existent session', async () => {
      await expect(
        manager.updateFileTree('non-existent', []),
      ).rejects.toThrow('Session not found');
    });
  });

  describe('updateBuildStatus', () => {
    it('updates iOS build status', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      const status: PlatformBuildStatus = {
        status: 'building',
        progress: 45,
        buildId: 'build-123',
        startedAt: new Date(),
      };

      await manager.updateBuildStatus(session.sessionId, 'ios', status);

      const updated = await manager.getSession(session.sessionId);
      expect(updated!.buildStatus.ios.status).toBe('building');
      expect(updated!.buildStatus.ios.progress).toBe(45);
      expect(updated!.buildStatus.ios.buildId).toBe('build-123');
    });

    it('updates Android build status independently', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());

      await manager.updateBuildStatus(session.sessionId, 'android', {
        status: 'success',
        completedAt: new Date(),
      });

      const updated = await manager.getSession(session.sessionId);
      expect(updated!.buildStatus.android.status).toBe('success');
      expect(updated!.buildStatus.ios.status).toBe('idle');
    });

    it('transitions from building to failed with error', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());

      await manager.updateBuildStatus(session.sessionId, 'ios', {
        status: 'building',
        startedAt: new Date(),
      });
      await manager.updateBuildStatus(session.sessionId, 'ios', {
        status: 'failed',
        error: 'Code signing failed',
        completedAt: new Date(),
      });

      const updated = await manager.getSession(session.sessionId);
      expect(updated!.buildStatus.ios.status).toBe('failed');
      expect(updated!.buildStatus.ios.error).toBe('Code signing failed');
    });

    it('throws for non-existent session', async () => {
      await expect(
        manager.updateBuildStatus('non-existent', 'ios', { status: 'idle' }),
      ).rejects.toThrow('Session not found');
    });
  });

  describe('undo/redo stack', () => {
    it('pushEdit adds to undo stack', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      const edit = createEditCommand('edit-1', 'Change header color');

      await manager.pushEdit(session.sessionId, edit);

      const updated = await manager.getSession(session.sessionId);
      expect(updated!.undoStack).toHaveLength(1);
      expect(updated!.undoStack[0].id).toBe('edit-1');
    });

    it('pushEdit clears redo stack', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());

      await manager.pushEdit(session.sessionId, createEditCommand('edit-1', 'First'));
      await manager.undo(session.sessionId);

      // Redo stack should have one item
      let updated = await manager.getSession(session.sessionId);
      expect(updated!.redoStack).toHaveLength(1);

      // Pushing a new edit clears redo
      await manager.pushEdit(session.sessionId, createEditCommand('edit-2', 'Second'));
      updated = await manager.getSession(session.sessionId);
      expect(updated!.redoStack).toHaveLength(0);
    });

    it('undo moves edit from undo stack to redo stack', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      await manager.pushEdit(session.sessionId, createEditCommand('edit-1', 'First'));
      await manager.pushEdit(session.sessionId, createEditCommand('edit-2', 'Second'));

      const undone = await manager.undo(session.sessionId);

      expect(undone).not.toBeNull();
      expect(undone!.id).toBe('edit-2');

      const updated = await manager.getSession(session.sessionId);
      expect(updated!.undoStack).toHaveLength(1);
      expect(updated!.redoStack).toHaveLength(1);
      expect(updated!.redoStack[0].id).toBe('edit-2');
    });

    it('undo returns null when stack is empty', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      const result = await manager.undo(session.sessionId);
      expect(result).toBeNull();
    });

    it('redo moves edit from redo stack back to undo stack', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      await manager.pushEdit(session.sessionId, createEditCommand('edit-1', 'First'));
      await manager.undo(session.sessionId);

      const redone = await manager.redo(session.sessionId);

      expect(redone).not.toBeNull();
      expect(redone!.id).toBe('edit-1');

      const updated = await manager.getSession(session.sessionId);
      expect(updated!.undoStack).toHaveLength(1);
      expect(updated!.redoStack).toHaveLength(0);
    });

    it('redo returns null when stack is empty', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      const result = await manager.redo(session.sessionId);
      expect(result).toBeNull();
    });

    it('supports multiple undo/redo cycles', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      await manager.pushEdit(session.sessionId, createEditCommand('edit-1', 'First'));
      await manager.pushEdit(session.sessionId, createEditCommand('edit-2', 'Second'));
      await manager.pushEdit(session.sessionId, createEditCommand('edit-3', 'Third'));

      // Undo all three
      await manager.undo(session.sessionId);
      await manager.undo(session.sessionId);
      await manager.undo(session.sessionId);

      let updated = await manager.getSession(session.sessionId);
      expect(updated!.undoStack).toHaveLength(0);
      expect(updated!.redoStack).toHaveLength(3);

      // Redo two
      await manager.redo(session.sessionId);
      await manager.redo(session.sessionId);

      updated = await manager.getSession(session.sessionId);
      expect(updated!.undoStack).toHaveLength(2);
      expect(updated!.redoStack).toHaveLength(1);
    });
  });

  describe('touchActivity', () => {
    it('updates lastActivityAt timestamp', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      const original = session.lastActivityAt;

      await new Promise((r) => setTimeout(r, 5));
      await manager.touchActivity(session.sessionId);

      const updated = await manager.getSession(session.sessionId);
      expect(updated!.lastActivityAt.getTime()).toBeGreaterThan(original.getTime());
    });

    it('throws for non-existent session', async () => {
      await expect(manager.touchActivity('non-existent')).rejects.toThrow('Session not found');
    });
  });

  describe('deleteSession', () => {
    it('removes the session', async () => {
      const session = await manager.createSession('tenant-1', 'app-1', validInitialState());
      await manager.deleteSession(session.sessionId);

      const result = await manager.getSession(session.sessionId);
      expect(result).toBeNull();
    });

    it('does not throw for non-existent session', async () => {
      await expect(manager.deleteSession('non-existent')).resolves.not.toThrow();
    });
  });

  describe('listSessions', () => {
    it('returns sessions for a specific tenant', async () => {
      await manager.createSession('tenant-1', 'app-1', { appName: 'App A' });
      await manager.createSession('tenant-1', 'app-2', { appName: 'App B' });
      await manager.createSession('tenant-2', 'app-3', { appName: 'App C' });

      const sessions = await manager.listSessions('tenant-1');
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.projectState.appName).sort()).toEqual(['App A', 'App B']);
    });

    it('returns empty array for tenant with no sessions', async () => {
      const sessions = await manager.listSessions('no-sessions-tenant');
      expect(sessions).toEqual([]);
    });
  });
});
