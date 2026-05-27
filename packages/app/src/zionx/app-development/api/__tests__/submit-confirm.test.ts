/**
 * Tests for POST /app-dev/projects/:id/confirm-submit endpoint.
 *
 * The confirmSubmission handler now goes through Hook 9b (submitter) rather
 * than calling submitBuild() directly, and triggers Hook 10b (testflight
 * watcher) in the background. We mock both hooks here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHandlers } from '../handlers.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRunSubmitter = vi.fn();
vi.mock('../../pipeline/09b-submitter.js', () => ({
  run: (...args: unknown[]) => mockRunSubmitter(...args),
}));

const mockRunWatcher = vi.fn();
vi.mock('../../pipeline/10b-testflight-watcher.js', () => ({
  run: (...args: unknown[]) => mockRunWatcher(...args),
}));

const mockRunSubmissionPrep = vi.fn();
vi.mock('../../pipeline/09-submission-prep.js', () => ({
  run: (...args: unknown[]) => mockRunSubmissionPrep(...args),
}));

// Mock other pipeline imports that handlers.ts pulls in
vi.mock('../../pipeline/01-prompt-sanitizer.js', () => ({ run: vi.fn() }));
vi.mock('../../pipeline/05-build-preparer.js', () => ({ run: vi.fn() }));
vi.mock('../../pipeline/06-build-runner.js', () => ({ run: vi.fn() }));
vi.mock('../../services/llm-service.js', () => ({ LLMService: class {} }));
vi.mock('../../config/hooks.config.js', () => ({ isHookDryRun: () => false }));

const mockListFiles = vi.fn();
const mockGetProjectPath = vi.fn();
const mockReadFile = vi.fn();
const mockExists = vi.fn();
vi.mock('../../workspace/workspace.js', () => ({
  Workspace: class {
    listFiles = mockListFiles;
    getProjectPath = mockGetProjectPath;
    ensureProjectDir = vi.fn();
    readFile = mockReadFile;
    exists = mockExists;
  },
}));

vi.mock('../../events/event-types.js', () => ({
  createAppDevEvent: vi.fn().mockReturnValue({ type: 'test', payload: {} }),
  APPDEV_EVENTS: {
    PROJECT_CREATED: 'appdev.project.created',
    SUBMISSION_COMPLETED: 'appdev.submission.completed',
    BUILD_STATUS_CHANGED: 'appdev.build.status.changed',
  },
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockEventBus = { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn(), unsubscribe: vi.fn() };
const mockCredentialManager = {
  getCredential: vi.fn().mockResolvedValue('fake-expo-token'),
  rotateCredential: vi.fn(),
  getRotationSchedule: vi.fn(),
};

let handlers: ReturnType<typeof createHandlers>;

beforeEach(() => {
  vi.clearAllMocks();
  mockListFiles.mockResolvedValue(['app.json', 'eas.json']);
  mockGetProjectPath.mockReturnValue('/workspaces/test-001');
  mockReadFile.mockImplementation(async (_pid: string, rel: string) => {
    if (rel === 'eas.json') return JSON.stringify({ submit: { production: { ios: { ascAppId: '6773520429' } } } });
    if (rel === 'app.json') return JSON.stringify({ expo: { version: '1.0.0', ios: { buildNumber: '4' } } });
    throw new Error('not found');
  });
  mockExists.mockResolvedValue(false);
  mockRunSubmissionPrep.mockResolvedValue({
    success: true,
    hookId: 'submission-prep',
    dryRun: false,
    data: { readyForConfirmation: true, missingItems: [], checklist: { items: [], allPassed: true } },
    durationMs: 10,
  });
  // Default: submitter succeeds
  mockRunSubmitter.mockResolvedValue({
    success: true,
    hookId: 'submitter',
    dryRun: false,
    data: { status: 'submitted', submissionId: 'eas-sub-123', easBuildId: 'build-abc' },
    durationMs: 10,
  });
  // Watcher resolves immediately so the fire-and-forget doesn't leak.
  mockRunWatcher.mockResolvedValue({
    success: true,
    hookId: 'testflight-watcher',
    dryRun: false,
    data: { finalState: 'PROCESSING', history: [], totalElapsedMs: 1, buildFoundOnApple: false, skipped: false },
    durationMs: 1,
  });

  handlers = createHandlers({
    eventBus: mockEventBus as any,
    watcherSupervisor: { isHealthy: () => true } as any,
    workspace: {
      listFiles: mockListFiles,
      getProjectPath: mockGetProjectPath,
      ensureProjectDir: vi.fn(),
      readFile: mockReadFile,
      exists: mockExists,
    } as any,
    credentialManager: mockCredentialManager as any,
  });
});

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    params: { id: 'test-001' },
    body: { platform: 'ios', submissionId: 'sub-uuid-001', easBuildId: 'build-abc' },
    tenantId: 'tenant-1',
    userId: 'user-1',
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('confirmSubmission endpoint', () => {
  it('successful flow: ready checklist → submit → 200 with submissionId', async () => {
    const res = await handlers.confirmSubmission(makeReq());

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('submitted');
    expect(res.body.submissionId).toBe('sub-uuid-001');
    expect(res.body.platform).toBe('ios');
    expect(mockRunSubmitter).toHaveBeenCalledTimes(1);
    expect(mockRunSubmitter).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'ios',
        easBuildId: 'build-abc',
      }),
      expect.anything(),
    );
  });

  it('idempotent: same submissionId twice → second returns cached', async () => {
    const req = makeReq({ body: { platform: 'ios', submissionId: 'sub-uuid-idempotent', easBuildId: 'build-abc' } });
    const res1 = await handlers.confirmSubmission(req);
    expect(res1.statusCode).toBe(200);

    // Second call with same submissionId
    const res2 = await handlers.confirmSubmission(req);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.status).toBe('submitted');

    // submitter only called once (cached on second call)
    expect(mockRunSubmitter).toHaveBeenCalledTimes(1);
  });

  it('not ready: checklist has fail items → 400 with missingItems', async () => {
    mockRunSubmissionPrep.mockResolvedValueOnce({
      success: true,
      hookId: 'submission-prep',
      dryRun: false,
      data: { readyForConfirmation: false, missingItems: ['App icon missing'], checklist: { items: [], allPassed: false } },
      durationMs: 10,
    });

    const res = await handlers.confirmSubmission(makeReq({
      body: { platform: 'ios', submissionId: 'sub-uuid-002', easBuildId: 'build-abc' },
    }));

    expect(res.statusCode).toBe(400);
    expect(res.body.missingItems).toContain('App icon missing');
    expect(mockRunSubmitter).not.toHaveBeenCalled();
  });

  it('invalid platform → 400', async () => {
    const res = await handlers.confirmSubmission(makeReq({
      body: { platform: 'windows', submissionId: 'sub-uuid-003', easBuildId: 'build-abc' },
    }));

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('platform');
  });

  it('workspace not found → 404', async () => {
    mockListFiles.mockRejectedValueOnce(new Error('not found'));

    const res = await handlers.confirmSubmission(makeReq({
      body: { platform: 'ios', submissionId: 'sub-uuid-004', easBuildId: 'build-abc' },
    }));

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toContain('workspace not found');
  });

  it('submitter fails → 200 with status: failed (recoverable, not 500)', async () => {
    mockRunSubmitter.mockResolvedValueOnce({
      success: false,
      hookId: 'submitter',
      dryRun: false,
      error: 'EAS CLI timed out',
      data: { status: 'failed', errorMessage: 'EAS CLI timed out', easBuildId: 'build-abc' },
      durationMs: 10,
    });

    const res = await handlers.confirmSubmission(makeReq({
      body: { platform: 'android', submissionId: 'sub-uuid-005', easBuildId: 'build-abc' },
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.errorMessage).toBe('EAS CLI timed out');
  });
});
