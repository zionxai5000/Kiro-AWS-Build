/**
 * ensureEasProjectLinked — Unit Tests
 *
 * Tests the EAS project linkage helper that runs before build submission.
 * Covers: missing app.json, malformed JSON, already linked, init success,
 * and the paranoia case where init succeeds but app.json isn't updated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureEasProjectLinked } from '../06-build-runner.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRunEasCommand = vi.fn();
vi.mock('../../services/eas-cli-wrapper.js', () => ({
  runEasCommand: (...args: unknown[]) => mockRunEasCommand(...args),
}));

const mockReadFile = vi.fn();
vi.mock('../../workspace/workspace.js', () => ({
  Workspace: class {},
}));

function createMockWorkspace() {
  return { readFile: mockReadFile } as any;
}

function makeAppJson(projectId?: string): string {
  const json: any = {
    expo: {
      name: 'TestApp',
      slug: 'test-app',
      version: '1.0.0',
    },
  };
  if (projectId) {
    json.expo.extra = { eas: { projectId } };
  }
  return JSON.stringify(json, null, 2);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ensureEasProjectLinked', () => {
  const baseArgs = {
    projectPath: '/tmp/workspaces/proj-1',
    projectId: 'proj-1',
    expoToken: 'test-token-123',
    log: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Case 1: throws when app.json is missing', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'));

    await expect(
      ensureEasProjectLinked({ ...baseArgs, workspace: createMockWorkspace() }),
    ).rejects.toThrow('workspace missing app.json');

    expect(mockRunEasCommand).not.toHaveBeenCalled();
  });

  it('Case 2: throws when app.json is invalid JSON', async () => {
    mockReadFile.mockResolvedValue('not valid json {{{');

    await expect(
      ensureEasProjectLinked({ ...baseArgs, workspace: createMockWorkspace() }),
    ).rejects.toThrow('workspace app.json is malformed');

    expect(mockRunEasCommand).not.toHaveBeenCalled();
  });

  it('Case 3: skips init when project is already linked', async () => {
    mockReadFile.mockResolvedValue(makeAppJson('existing-id-123'));

    const result = await ensureEasProjectLinked({
      ...baseArgs,
      workspace: createMockWorkspace(),
    });

    expect(result).toBe('existing-id-123');
    expect(mockRunEasCommand).not.toHaveBeenCalled();
    expect(baseArgs.log).toHaveBeenCalledWith(
      expect.stringContaining('already linked: existing-id-123'),
    );
  });

  it('Case 4: runs init when not linked, succeeds', async () => {
    // First read: no projectId
    // Second read (after init): has projectId
    mockReadFile
      .mockResolvedValueOnce(makeAppJson())
      .mockResolvedValueOnce(makeAppJson('new-id-456'));

    mockRunEasCommand.mockResolvedValue({
      stdout: 'Project linked',
      stderr: '',
      exitCode: 0,
      parsedJson: null,
    });

    const result = await ensureEasProjectLinked({
      ...baseArgs,
      workspace: createMockWorkspace(),
    });

    expect(result).toBe('new-id-456');
    expect(mockRunEasCommand).toHaveBeenCalledTimes(1);
    expect(mockRunEasCommand).toHaveBeenCalledWith(
      ['project:init', '--non-interactive'],
      expect.objectContaining({
        cwd: '/tmp/workspaces/proj-1',
        expoToken: 'test-token-123',
        timeoutMs: 30_000,
      }),
    );
  });

  it('Case 5: throws when init succeeds but app.json not updated', async () => {
    // Both reads return no projectId
    mockReadFile
      .mockResolvedValueOnce(makeAppJson())
      .mockResolvedValueOnce(makeAppJson());

    mockRunEasCommand.mockResolvedValue({
      stdout: 'Done',
      stderr: '',
      exitCode: 0,
      parsedJson: null,
    });

    await expect(
      ensureEasProjectLinked({ ...baseArgs, workspace: createMockWorkspace() }),
    ).rejects.toThrow('eas project:init reported success but app.json still has no projectId');
  });

  it('propagates eas CLI errors clearly', async () => {
    mockReadFile.mockResolvedValue(makeAppJson());
    mockRunEasCommand.mockRejectedValue(new Error('EAS CLI exited with code 1: network timeout'));

    await expect(
      ensureEasProjectLinked({ ...baseArgs, workspace: createMockWorkspace() }),
    ).rejects.toThrow('eas project:init failed');
  });
});
