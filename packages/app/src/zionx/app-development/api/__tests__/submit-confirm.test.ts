/**
 * Tests for POST /app-dev/projects/:id/confirm-submit endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHandlers } from '../handlers.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSubmitBuild = vi.fn();
vi.mock('../../services/eas-cli-wrapper.js', () => ({
  submitBuild: (...args: unknown[]) => mockSubmitBuild(...args),
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
vi.mock('../../workspace/workspace.js', () => ({
  Workspace: class {
    listFiles = mockListFiles;
    getProjectPath = mockGetProjectPath;
    ensureProjectDir = vi.fn();
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
  mockRunSubmissionPrep.mockResolvedValue({
    success: true,
    hookId: 'submission-prep',
    dryRun: false,
    data: { readyForConfirmation: true, missingItems: [], checklist: { items: [], allPassed: true } },
    durationMs: 10,
  });
  mockSubmitBuild.mockResolvedValue({ status: 'submitted', submissionId: 'eas-sub-123' });

  handlers = createHandlers({
    eventBus: mockEventBus as any,
    watcherSupervisor: { isHealthy: () => true } as any,
    workspace: { listFiles: mockListFiles, getProjectPath: mockGetProjectPath, ensureProjectDir: vi.fn() } as any,
    credentialManager: mockCredentialManager as any,
  });
});

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    params: { id: 'test-001' },
    body: { platform: 'ios', submissionId: 'sub-uuid-001' },
    tenantId: 'tenant-1',
    userId: 'user-1',
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Tests (6)
// ---------------------------------------------------------------------------

describe('confirmSubmission endpoint', () => {
  it('successful flow: ready checklist → submit → 200 with submissionId', async () => {
    const res = await handlers.confirmSubmission(makeReq());

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('submitted');
    expect(res.body.submissionId).toBe('sub-uuid-001');
    expect(res.body.platform).toBe('ios');
    expect(mockSubmitBuild).toHaveBeenCalledTimes(1);
    expect(mockSubmitBuild).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'ios',
      cwd: '/workspaces/test-001',
    }));
  });

  it('idempotent: same submissionId twice → second returns cached', async () => {
    const req = makeReq({ body: { platform: 'ios', submissionId: 'sub-uuid-idempotent' } });
    const res1 = await handlers.confirmSubmission(req);
    expect(res1.statusCode).toBe(200);

    // Second call with same submissionId
    const res2 = await handlers.confirmSubmission(req);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.status).toBe('submitted');

    // submitBuild only called once (cached on second call)
    expect(mockSubmitBuild).toHaveBeenCalledTimes(1);
  });

  it('not ready: checklist has fail items → 400 with missingItems', async () => {
    mockRunSubmissionPrep.mockResolvedValueOnce({
      success: true,
      hookId: 'submission-prep',
      dryRun: false,
      data: { readyForConfirmation: false, missingItems: ['App icon missing'], checklist: { items: [], allPassed: false } },
      durationMs: 10,
    });

    const res = await handlers.confirmSubmission(makeReq({ body: { platform: 'ios', submissionId: 'sub-uuid-002' } }));

    expect(res.statusCode).toBe(400);
    expect(res.body.missingItems).toContain('App icon missing');
    expect(mockSubmitBuild).not.toHaveBeenCalled();
  });

  it('invalid platform → 400', async () => {
    const res = await handlers.confirmSubmission(makeReq({ body: { platform: 'windows', submissionId: 'sub-uuid-003' } }));

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('platform');
  });

  it('workspace not found → 404', async () => {
    mockListFiles.mockRejectedValueOnce(new Error('not found'));

    const res = await handlers.confirmSubmission(makeReq({ body: { platform: 'ios', submissionId: 'sub-uuid-004' } }));

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toContain('workspace not found');
  });

  it('submitBuild fails → 200 with status: failed (recoverable, not 500)', async () => {
    mockSubmitBuild.mockResolvedValueOnce({ status: 'failed', errorMessage: 'EAS CLI timed out' });

    const res = await handlers.confirmSubmission(makeReq({ body: { platform: 'android', submissionId: 'sub-uuid-005' } }));

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.errorMessage).toBe('EAS CLI timed out');
  });
});
