/**
 * ZionX App Development Studio — Session Manager
 *
 * Manages the lifecycle of app development sessions: creation, state persistence,
 * file tree tracking, build status, preview connection, and undo/redo history.
 * Sessions are per-tenant, per-app. The in-memory implementation is designed
 * for future database persistence via the repository pattern.
 *
 * Requirements: 42a.1, 42c.8, 42d.11
 */

import type {
  StudioSession,
  ProjectState,
  FileNode,
  PlatformBuildStatus,
  EditCommand,
  BuildStatus,
  PreviewConnection,
} from './types.js';

// ---------------------------------------------------------------------------
// Session Manager Interface
// ---------------------------------------------------------------------------

export interface StudioSessionManager {
  createSession(
    tenantId: string,
    appId: string,
    initialState: Partial<ProjectState>,
  ): Promise<StudioSession>;

  getSession(sessionId: string): Promise<StudioSession | null>;

  updateProjectState(
    sessionId: string,
    updates: Partial<ProjectState>,
  ): Promise<void>;

  updateFileTree(sessionId: string, fileTree: FileNode[]): Promise<void>;

  updateBuildStatus(
    sessionId: string,
    platform: 'ios' | 'android',
    status: PlatformBuildStatus,
  ): Promise<void>;

  pushEdit(sessionId: string, edit: EditCommand): Promise<void>;

  undo(sessionId: string): Promise<EditCommand | null>;

  redo(sessionId: string): Promise<EditCommand | null>;

  touchActivity(sessionId: string): Promise<void>;

  deleteSession(sessionId: string): Promise<void>;

  listSessions(tenantId: string): Promise<StudioSession[]>;
}

// ---------------------------------------------------------------------------
// Default Implementation (In-Memory)
// ---------------------------------------------------------------------------

function generateSessionId(): string {
  return `studio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultBuildStatus(): BuildStatus {
  return {
    ios: { status: 'idle' },
    android: { status: 'idle' },
  };
}

function createDefaultPreviewConnection(): PreviewConnection {
  return { status: 'disconnected' };
}

function createDefaultProjectState(
  partial: Partial<ProjectState>,
): ProjectState {
  return {
    appName: partial.appName ?? '',
    appDescription: partial.appDescription ?? '',
    designSystem: partial.designSystem ?? {
      colorPalette: {},
      typography: {},
      spacing: {},
      components: [],
      iconography: '',
      animations: {},
    },
    screens: partial.screens ?? [],
    navigation: partial.navigation ?? {
      type: 'stack',
      screens: [],
      initialRoute: '',
    },
    integrations: partial.integrations ?? [],
    monetization: partial.monetization ?? { model: 'freemium' },
    targetPlatforms: partial.targetPlatforms ?? ['ios', 'android'],
  };
}

/**
 * In-memory implementation of StudioSessionManager.
 *
 * Stores sessions in a Map keyed by sessionId. Designed so the interface
 * can be backed by Aurora/DynamoDB in production without changing consumers.
 */
export class DefaultStudioSessionManager implements StudioSessionManager {
  private readonly sessions: Map<string, StudioSession> = new Map();

  async createSession(
    tenantId: string,
    appId: string,
    initialState: Partial<ProjectState>,
  ): Promise<StudioSession> {
    const now = new Date();
    const session: StudioSession = {
      sessionId: generateSessionId(),
      tenantId,
      appId,
      projectState: createDefaultProjectState(initialState),
      fileTree: [],
      buildStatus: createDefaultBuildStatus(),
      previewConnection: createDefaultPreviewConnection(),
      undoStack: [],
      redoStack: [],
      createdAt: now,
      lastActivityAt: now,
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  async getSession(sessionId: string): Promise<StudioSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async updateProjectState(
    sessionId: string,
    updates: Partial<ProjectState>,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.projectState = { ...session.projectState, ...updates };
    session.lastActivityAt = new Date();
  }

  async updateFileTree(
    sessionId: string,
    fileTree: FileNode[],
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.fileTree = fileTree;
    session.lastActivityAt = new Date();
  }

  async updateBuildStatus(
    sessionId: string,
    platform: 'ios' | 'android',
    status: PlatformBuildStatus,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.buildStatus[platform] = status;
    session.lastActivityAt = new Date();
  }

  async pushEdit(sessionId: string, edit: EditCommand): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.undoStack.push(edit);
    // Pushing a new edit clears the redo stack (standard undo/redo behavior)
    session.redoStack = [];
    session.lastActivityAt = new Date();
  }

  async undo(sessionId: string): Promise<EditCommand | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const edit = session.undoStack.pop() ?? null;
    if (edit) {
      session.redoStack.push(edit);
      session.lastActivityAt = new Date();
    }

    return edit;
  }

  async redo(sessionId: string): Promise<EditCommand | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const edit = session.redoStack.pop() ?? null;
    if (edit) {
      session.undoStack.push(edit);
      session.lastActivityAt = new Date();
    }

    return edit;
  }

  async touchActivity(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.lastActivityAt = new Date();
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async listSessions(tenantId: string): Promise<StudioSession[]> {
    const results: StudioSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.tenantId === tenantId) {
        results.push(session);
      }
    }
    return results;
  }
}
