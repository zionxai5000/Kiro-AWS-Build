/**
 * ZionX App Development Studio — AI Edit Controller
 *
 * Processes natural language edit commands from the King, translates them into
 * code modifications via the ZionX agent, runs tests after each edit, triggers
 * preview reloads, and manages undo/redo by restoring file state from edit history.
 *
 * Requirements: 42d.10, 42d.11, 42d.12
 */

import type { StudioSessionManager } from './session-manager.js';
import type { PreviewServer } from './preview-server.js';
import type { FileNode, FileChange, TestResult, EditCommand, EditResult } from './types.js';

// ---------------------------------------------------------------------------
// Dependency Interfaces (for injection)
// ---------------------------------------------------------------------------

export interface CodeGenerator {
  generateEdit(
    sessionId: string,
    command: string,
    currentFiles: FileNode[],
  ): Promise<FileChange[]>;
}

export interface TestRunner {
  runTests(sessionId: string, changedFiles: string[]): Promise<TestResult[]>;
}

export interface HookEmitter {
  emit(hookName: string, payload: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AIEditControllerConfig {
  sessionManager: StudioSessionManager;
  previewServer: PreviewServer;
  codeGenerator: CodeGenerator;
  testRunner: TestRunner;
  hookEmitter: HookEmitter;
}

// ---------------------------------------------------------------------------
// AI Edit Controller Interface
// ---------------------------------------------------------------------------

export interface IAIEditController {
  /** Process a natural language edit command */
  applyEdit(sessionId: string, command: string): Promise<EditResult>;

  /** Undo the last edit (restores file state) */
  undoEdit(sessionId: string): Promise<EditResult>;

  /** Redo a previously undone edit */
  redoEdit(sessionId: string): Promise<EditResult>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * AI Edit Controller — orchestrates the edit → test → preview → hook cycle.
 *
 * Flow for applyEdit:
 * 1. Get current session and file tree from session manager
 * 2. Call codeGenerator.generateEdit() to get FileChange[] from the NL command
 * 3. Apply file changes to the session's file tree
 * 4. Call testRunner.runTests() on the changed files
 * 5. Push the EditCommand to session's undo stack
 * 6. Trigger preview reload
 * 7. Emit `app.code.changed` hook
 * 8. Return result with testsPassed status
 */
export class AIEditController implements IAIEditController {
  private readonly sessionManager: StudioSessionManager;
  private readonly previewServer: PreviewServer;
  private readonly codeGenerator: CodeGenerator;
  private readonly testRunner: TestRunner;
  private readonly hookEmitter: HookEmitter;

  constructor(config: AIEditControllerConfig) {
    this.sessionManager = config.sessionManager;
    this.previewServer = config.previewServer;
    this.codeGenerator = config.codeGenerator;
    this.testRunner = config.testRunner;
    this.hookEmitter = config.hookEmitter;
  }

  async applyEdit(sessionId: string, command: string): Promise<EditResult> {
    // 1. Get current session
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      return { success: false, error: `Session not found: ${sessionId}` };
    }

    // 2. Generate file changes from natural language command
    let fileChanges: FileChange[];
    try {
      fileChanges = await this.codeGenerator.generateEdit(
        sessionId,
        command,
        session.fileTree,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Code generation failed';
      return { success: false, error: message };
    }

    if (fileChanges.length === 0) {
      return { success: false, error: 'No file changes generated' };
    }

    // 3. Apply file changes to the session's file tree
    const updatedFileTree = applyFileChanges(session.fileTree, fileChanges);
    await this.sessionManager.updateFileTree(sessionId, updatedFileTree);

    // 4. Run tests on changed files
    const changedPaths = fileChanges.map((fc) => fc.path);
    let testResults: TestResult[];
    try {
      testResults = await this.testRunner.runTests(sessionId, changedPaths);
    } catch {
      testResults = [];
    }

    const testsPassed = testResults.length === 0 || testResults.every((t) => t.passed);

    // 5. Create and push the EditCommand
    const editCommand: EditCommand = {
      id: generateEditId(),
      timestamp: new Date(),
      description: command,
      fileChanges,
      testResults,
    };

    await this.sessionManager.pushEdit(sessionId, editCommand);

    // 6. Trigger preview reload
    try {
      this.previewServer.triggerReload(sessionId);
    } catch {
      // Preview may not be connected; non-fatal
    }

    // 7. Emit hook
    this.hookEmitter.emit('app.code.changed', {
      sessionId,
      editId: editCommand.id,
      action: 'apply',
      testsPassed,
      changedFiles: changedPaths,
    });

    // 8. Return result
    return {
      success: true,
      editCommand,
      testsPassed,
    };
  }

  async undoEdit(sessionId: string): Promise<EditResult> {
    // 1. Pop from undo stack
    const edit = await this.sessionManager.undo(sessionId);
    if (!edit) {
      return { success: false, error: 'Nothing to undo' };
    }

    // 2. Reverse the file changes (swap newContent/previousContent)
    const reversedChanges = reverseFileChanges(edit.fileChanges);

    // 3. Update the file tree in the session
    const session = await this.sessionManager.getSession(sessionId);
    if (session) {
      const updatedFileTree = applyFileChanges(session.fileTree, reversedChanges);
      await this.sessionManager.updateFileTree(sessionId, updatedFileTree);
    }

    // 4. Trigger preview reload
    try {
      this.previewServer.triggerReload(sessionId);
    } catch {
      // Preview may not be connected; non-fatal
    }

    // 5. Emit hook
    this.hookEmitter.emit('app.code.changed', {
      sessionId,
      editId: edit.id,
      action: 'undo',
      changedFiles: edit.fileChanges.map((fc) => fc.path),
    });

    return {
      success: true,
      editCommand: edit,
    };
  }

  async redoEdit(sessionId: string): Promise<EditResult> {
    // 1. Pop from redo stack
    const edit = await this.sessionManager.redo(sessionId);
    if (!edit) {
      return { success: false, error: 'Nothing to redo' };
    }

    // 2. Re-apply the file changes
    const session = await this.sessionManager.getSession(sessionId);
    if (session) {
      const updatedFileTree = applyFileChanges(session.fileTree, edit.fileChanges);
      await this.sessionManager.updateFileTree(sessionId, updatedFileTree);
    }

    // 3. Trigger preview reload
    try {
      this.previewServer.triggerReload(sessionId);
    } catch {
      // Preview may not be connected; non-fatal
    }

    // 4. Emit hook
    this.hookEmitter.emit('app.code.changed', {
      sessionId,
      editId: edit.id,
      action: 'redo',
      changedFiles: edit.fileChanges.map((fc) => fc.path),
    });

    return {
      success: true,
      editCommand: edit,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateEditId(): string {
  return `edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Reverse file changes by swapping previousContent and newContent.
 * For 'create' operations, the reverse is 'delete' and vice versa.
 */
function reverseFileChanges(changes: FileChange[]): FileChange[] {
  return changes.map((change) => ({
    path: change.path,
    previousContent: change.newContent,
    newContent: change.previousContent,
    type: change.type === 'create' ? 'delete' : change.type === 'delete' ? 'create' : 'modify',
  }));
}

/**
 * Apply file changes to a file tree, updating content for modified files,
 * adding new files for creates, and removing files for deletes.
 */
function applyFileChanges(fileTree: FileNode[], changes: FileChange[]): FileNode[] {
  let tree = [...fileTree];

  for (const change of changes) {
    switch (change.type) {
      case 'modify':
        tree = updateFileContent(tree, change.path, change.newContent);
        break;
      case 'create':
        tree = addFileToTree(tree, change.path, change.newContent);
        break;
      case 'delete':
        tree = removeFileFromTree(tree, change.path);
        break;
    }
  }

  return tree;
}

function updateFileContent(tree: FileNode[], path: string, content: string): FileNode[] {
  return tree.map((node) => {
    if (node.path === path) {
      return { ...node, content };
    }
    if (node.children) {
      return { ...node, children: updateFileContent(node.children, path, content) };
    }
    return node;
  });
}

function addFileToTree(tree: FileNode[], path: string, content: string): FileNode[] {
  const parts = path.split('/').filter(Boolean);
  const fileName = parts[parts.length - 1];

  // Check if file already exists at top level
  const existing = tree.find((n) => n.path === path);
  if (existing) {
    return updateFileContent(tree, path, content);
  }

  // Add as a new file node at the top level of the tree
  const newNode: FileNode = {
    path,
    name: fileName,
    type: 'file',
    content,
  };

  return [...tree, newNode];
}

function removeFileFromTree(tree: FileNode[], path: string): FileNode[] {
  return tree
    .filter((node) => node.path !== path)
    .map((node) => {
      if (node.children) {
        return { ...node, children: removeFileFromTree(node.children, path) };
      }
      return node;
    });
}
