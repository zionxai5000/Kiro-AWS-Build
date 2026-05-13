/**
 * Unit tests for ZionX App Development Studio — AI Edit Controller
 *
 * Validates: Requirements 42d.10, 42d.11, 42d.12
 *
 * Tests natural language edit processing, test execution after edits,
 * preview reload triggering, undo/redo file state restoration, and
 * hook emission after every edit operation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIEditController } from '../edit-controller.js';
import type {
  CodeGenerator,
  TestRunner,
  HookEmitter,
  AIEditControllerConfig,
} from '../edit-controller.js';
import type { StudioSessionManager } from '../session-manager.js';
import type { PreviewServer } from '../preview-server.js';
import type {
  FileNode,
  FileChange,
  TestResult,
  EditCommand,
  StudioSession,
} from '../types.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockSession(overrides: Partial<StudioSession> = {}): StudioSession {
  return {
    sessionId: 'session-1',
    tenantId: 'tenant-1',
    appId: 'app-1',
    projectState: {
      appName: 'TestApp',
      appDescription: 'A test app',
      designSystem: {
        colorPalette: {},
        typography: {},
        spacing: {},
        components: [],
        iconography: '',
        animations: {},
      },
      screens: [],
      navigation: { type: 'stack', screens: [], initialRoute: '' },
      integrations: [],
      monetization: { model: 'freemium' },
      targetPlatforms: ['ios'],
    },
    fileTree: [
      { path: 'src/App.tsx', name: 'App.tsx', type: 'file', content: 'const x = 1;' },
      { path: 'src/utils.ts', name: 'utils.ts', type: 'file', content: 'export {}' },
    ],
    buildStatus: { ios: { status: 'idle' }, android: { status: 'idle' } },
    previewConnection: { status: 'connected' },
    undoStack: [],
    redoStack: [],
    createdAt: new Date(),
    lastActivityAt: new Date(),
    ...overrides,
  };
}

function createMockSessionManager(): StudioSessionManager & {
  _session: StudioSession | null;
  _undoStack: EditCommand[];
  _redoStack: EditCommand[];
} {
  const undoStack: EditCommand[] = [];
  const redoStack: EditCommand[] = [];
  let session: StudioSession | null = createMockSession();

  return {
    _session: session,
    _undoStack: undoStack,
    _redoStack: redoStack,
    getSession: vi.fn(async () => session),
    createSession: vi.fn(),
    updateProjectState: vi.fn(),
    updateFileTree: vi.fn(async (_sid: string, fileTree: FileNode[]) => {
      if (session) session.fileTree = fileTree;
    }),
    updateBuildStatus: vi.fn(),
    pushEdit: vi.fn(async (_sid: string, edit: EditCommand) => {
      undoStack.push(edit);
      redoStack.length = 0;
    }),
    undo: vi.fn(async () => {
      const edit = undoStack.pop() ?? null;
      if (edit) redoStack.push(edit);
      return edit;
    }),
    redo: vi.fn(async () => {
      const edit = redoStack.pop() ?? null;
      if (edit) undoStack.push(edit);
      return edit;
    }),
    touchActivity: vi.fn(),
    deleteSession: vi.fn(),
    listSessions: vi.fn(),
  };
}

function createMockCodeGenerator(fileChanges?: FileChange[]): CodeGenerator {
  const defaultChanges: FileChange[] = [
    {
      path: 'src/App.tsx',
      previousContent: 'const x = 1;',
      newContent: 'const x = 2;',
      type: 'modify',
    },
  ];

  return {
    generateEdit: vi.fn(async () => fileChanges ?? defaultChanges),
  };
}

function createMockTestRunner(results?: TestResult[]): TestRunner {
  const defaultResults: TestResult[] = [
    { name: 'App renders', passed: true, duration: 50 },
  ];

  return {
    runTests: vi.fn(async () => results ?? defaultResults),
  };
}

function createMockHookEmitter(): HookEmitter & { calls: Array<{ hookName: string; payload: Record<string, unknown> }> } {
  const calls: Array<{ hookName: string; payload: Record<string, unknown> }> = [];
  return {
    calls,
    emit: vi.fn((hookName: string, payload: Record<string, unknown>) => {
      calls.push({ hookName, payload });
    }),
  };
}

function createMockPreviewServer(): Pick<PreviewServer, 'triggerReload'> & { reloadCalls: string[] } {
  const reloadCalls: string[] = [];
  return {
    reloadCalls,
    triggerReload: vi.fn((sessionId: string) => {
      reloadCalls.push(sessionId);
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIEditController', () => {
  let sessionManager: ReturnType<typeof createMockSessionManager>;
  let codeGenerator: CodeGenerator;
  let testRunner: TestRunner;
  let hookEmitter: ReturnType<typeof createMockHookEmitter>;
  let previewServer: ReturnType<typeof createMockPreviewServer>;
  let controller: AIEditController;

  beforeEach(() => {
    sessionManager = createMockSessionManager();
    codeGenerator = createMockCodeGenerator();
    testRunner = createMockTestRunner();
    hookEmitter = createMockHookEmitter();
    previewServer = createMockPreviewServer();

    const config: AIEditControllerConfig = {
      sessionManager,
      previewServer: previewServer as unknown as PreviewServer,
      codeGenerator,
      testRunner,
      hookEmitter,
    };

    controller = new AIEditController(config);
  });

  // -------------------------------------------------------------------------
  // applyEdit
  // -------------------------------------------------------------------------

  describe('applyEdit', () => {
    it('produces file changes and triggers tests', async () => {
      const result = await controller.applyEdit('session-1', 'Change x to 2');

      expect(codeGenerator.generateEdit).toHaveBeenCalledWith(
        'session-1',
        'Change x to 2',
        expect.any(Array),
      );
      expect(testRunner.runTests).toHaveBeenCalledWith('session-1', ['src/App.tsx']);
      expect(result.success).toBe(true);
      expect(result.editCommand).toBeDefined();
      expect(result.editCommand!.fileChanges).toHaveLength(1);
    });

    it('pushes to undo stack and triggers reload when tests pass', async () => {
      const result = await controller.applyEdit('session-1', 'Change x to 2');

      expect(result.success).toBe(true);
      expect(result.testsPassed).toBe(true);
      expect(sessionManager.pushEdit).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ description: 'Change x to 2' }),
      );
      expect(previewServer.triggerReload).toHaveBeenCalledWith('session-1');
    });

    it('still pushes edit but marks testsPassed=false when tests fail', async () => {
      const failingResults: TestResult[] = [
        { name: 'App renders', passed: false, duration: 30, error: 'TypeError' },
      ];
      testRunner = createMockTestRunner(failingResults);

      const config: AIEditControllerConfig = {
        sessionManager,
        previewServer: previewServer as unknown as PreviewServer,
        codeGenerator,
        testRunner,
        hookEmitter,
      };
      controller = new AIEditController(config);

      const result = await controller.applyEdit('session-1', 'Break something');

      expect(result.success).toBe(true);
      expect(result.testsPassed).toBe(false);
      expect(sessionManager.pushEdit).toHaveBeenCalled();
      expect(previewServer.triggerReload).toHaveBeenCalledWith('session-1');
    });

    it('returns error when session not found', async () => {
      sessionManager.getSession = vi.fn(async () => null);

      const result = await controller.applyEdit('non-existent', 'Do something');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('returns error when code generation fails', async () => {
      codeGenerator.generateEdit = vi.fn(async () => {
        throw new Error('AI model unavailable');
      });

      const config: AIEditControllerConfig = {
        sessionManager,
        previewServer: previewServer as unknown as PreviewServer,
        codeGenerator,
        testRunner,
        hookEmitter,
      };
      controller = new AIEditController(config);

      const result = await controller.applyEdit('session-1', 'Do something');

      expect(result.success).toBe(false);
      expect(result.error).toBe('AI model unavailable');
    });

    it('returns error when no file changes generated', async () => {
      codeGenerator = createMockCodeGenerator([]);

      const config: AIEditControllerConfig = {
        sessionManager,
        previewServer: previewServer as unknown as PreviewServer,
        codeGenerator,
        testRunner,
        hookEmitter,
      };
      controller = new AIEditController(config);

      const result = await controller.applyEdit('session-1', 'Do nothing');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No file changes generated');
    });

    it('emits app.code.changed hook after successful edit', async () => {
      await controller.applyEdit('session-1', 'Change x to 2');

      expect(hookEmitter.emit).toHaveBeenCalledWith(
        'app.code.changed',
        expect.objectContaining({
          sessionId: 'session-1',
          action: 'apply',
          testsPassed: true,
          changedFiles: ['src/App.tsx'],
        }),
      );
    });

    it('updates file tree in session manager', async () => {
      await controller.applyEdit('session-1', 'Change x to 2');

      expect(sessionManager.updateFileTree).toHaveBeenCalledWith(
        'session-1',
        expect.any(Array),
      );
    });
  });

  // -------------------------------------------------------------------------
  // undoEdit
  // -------------------------------------------------------------------------

  describe('undoEdit', () => {
    it('restores previous file state', async () => {
      // First apply an edit so there's something to undo
      await controller.applyEdit('session-1', 'Change x to 2');

      const result = await controller.undoEdit('session-1');

      expect(result.success).toBe(true);
      expect(result.editCommand).toBeDefined();
      expect(sessionManager.undo).toHaveBeenCalledWith('session-1');
      expect(sessionManager.updateFileTree).toHaveBeenCalled();
    });

    it('returns error when undo stack is empty', async () => {
      const result = await controller.undoEdit('session-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nothing to undo');
    });

    it('triggers preview reload after undo', async () => {
      await controller.applyEdit('session-1', 'Change x to 2');
      previewServer.reloadCalls.length = 0;

      await controller.undoEdit('session-1');

      expect(previewServer.triggerReload).toHaveBeenCalledWith('session-1');
    });

    it('emits app.code.changed hook after undo', async () => {
      await controller.applyEdit('session-1', 'Change x to 2');
      hookEmitter.calls.length = 0;

      await controller.undoEdit('session-1');

      expect(hookEmitter.emit).toHaveBeenCalledWith(
        'app.code.changed',
        expect.objectContaining({
          sessionId: 'session-1',
          action: 'undo',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // redoEdit
  // -------------------------------------------------------------------------

  describe('redoEdit', () => {
    it('re-applies undone edit', async () => {
      // Apply then undo, so there's something to redo
      await controller.applyEdit('session-1', 'Change x to 2');
      await controller.undoEdit('session-1');

      const result = await controller.redoEdit('session-1');

      expect(result.success).toBe(true);
      expect(result.editCommand).toBeDefined();
      expect(sessionManager.redo).toHaveBeenCalledWith('session-1');
      expect(sessionManager.updateFileTree).toHaveBeenCalled();
    });

    it('returns error when redo stack is empty', async () => {
      const result = await controller.redoEdit('session-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nothing to redo');
    });

    it('triggers preview reload after redo', async () => {
      await controller.applyEdit('session-1', 'Change x to 2');
      await controller.undoEdit('session-1');
      previewServer.reloadCalls.length = 0;

      await controller.redoEdit('session-1');

      expect(previewServer.triggerReload).toHaveBeenCalledWith('session-1');
    });

    it('emits app.code.changed hook after redo', async () => {
      await controller.applyEdit('session-1', 'Change x to 2');
      await controller.undoEdit('session-1');
      hookEmitter.calls.length = 0;

      await controller.redoEdit('session-1');

      expect(hookEmitter.emit).toHaveBeenCalledWith(
        'app.code.changed',
        expect.objectContaining({
          sessionId: 'session-1',
          action: 'redo',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Preview reload
  // -------------------------------------------------------------------------

  describe('preview reload', () => {
    it('triggers reload after applyEdit', async () => {
      await controller.applyEdit('session-1', 'Change x to 2');
      expect(previewServer.triggerReload).toHaveBeenCalledWith('session-1');
    });

    it('triggers reload after undoEdit', async () => {
      await controller.applyEdit('session-1', 'Change x to 2');
      (previewServer.triggerReload as ReturnType<typeof vi.fn>).mockClear();

      await controller.undoEdit('session-1');
      expect(previewServer.triggerReload).toHaveBeenCalledWith('session-1');
    });

    it('triggers reload after redoEdit', async () => {
      await controller.applyEdit('session-1', 'Change x to 2');
      await controller.undoEdit('session-1');
      (previewServer.triggerReload as ReturnType<typeof vi.fn>).mockClear();

      await controller.redoEdit('session-1');
      expect(previewServer.triggerReload).toHaveBeenCalledWith('session-1');
    });

    it('does not fail if preview server throws', async () => {
      (previewServer.triggerReload as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Preview not connected');
      });

      const result = await controller.applyEdit('session-1', 'Change x to 2');
      expect(result.success).toBe(true);
    });
  });
});
