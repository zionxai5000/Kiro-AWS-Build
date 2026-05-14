import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHandlers, type AppDevHandlerDeps } from '../handlers.js';
import type { APIRequest } from '@seraphim/services/shaar/api-routes.js';
import type { EventBusService, SystemEvent } from '@seraphim/core';
import type { WatcherSupervisor } from '../../events/watcher-supervisor.js';
import { Workspace } from '../../workspace/workspace.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusService & { events: SystemEvent[] } {
  const events: SystemEvent[] = [];
  return {
    events,
    async publish(event: SystemEvent) { events.push(event); return 'id'; },
    async publishBatch(batch: SystemEvent[]) { events.push(...batch); return []; },
    async subscribe() { return 'sub'; },
    async unsubscribe() {},
    async getDeadLetterMessages() { return []; },
    async retryDeadLetter() {},
  };
}

function createMockSupervisor(healthy: boolean) {
  return {
    isHealthy: () => healthy,
    state: healthy ? 'healthy' : 'circuit_open',
    start: async () => {},
    stop: async () => {},
    restart: async () => {},
    getWatcher: () => null,
  } as unknown as WatcherSupervisor;
}

function createRequest(overrides: Partial<APIRequest> = {}): APIRequest {
  return {
    method: 'POST',
    path: '/app-dev/projects',
    params: {},
    query: {},
    body: null,
    headers: {},
    tenantId: 'tenant-1',
    userId: 'user-1',
    role: 'king',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App Dev Handlers', () => {
  let testRoot: string;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let workspace: Workspace;
  let auditService: { recordAction: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    testRoot = join(tmpdir(), `handlers-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(testRoot, { recursive: true });
    process.env.SERAPHIM_WORKSPACE_ROOT = testRoot;
    eventBus = createMockEventBus();
    workspace = new Workspace();
    auditService = { recordAction: vi.fn().mockResolvedValue('audit-id') };
  });

  afterEach(() => {
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
    delete process.env.SERAPHIM_WORKSPACE_ROOT;
  });

  describe('createProject', () => {
    it('returns 201 with project details on success', async () => {
      const handlers = createHandlers({
        eventBus,
        watcherSupervisor: createMockSupervisor(true),
        workspace,
      });

      const req = createRequest({ body: { name: 'My App', description: 'A test app', platform: 'ios' } });
      const res = await handlers.createProject(req);

      expect(res.statusCode).toBe(201);
      const body = res.body as { projectId: string; name: string; platform: string };
      expect(body.name).toBe('My App');
      expect(body.platform).toBe('ios');
      expect(body.projectId).toMatch(/^proj-/);
    });

    it('returns 503 when watcher is unhealthy', async () => {
      const handlers = createHandlers({
        eventBus,
        watcherSupervisor: createMockSupervisor(false),
        workspace,
      });

      const req = createRequest({ body: { name: 'My App' } });
      const res = await handlers.createProject(req);

      expect(res.statusCode).toBe(503);
      expect((res.body as { error: string }).error).toBe('Service unavailable');
    });

    it('returns 400 when name is missing', async () => {
      const handlers = createHandlers({
        eventBus,
        watcherSupervisor: createMockSupervisor(true),
        workspace,
      });

      const req = createRequest({ body: {} });
      const res = await handlers.createProject(req);

      expect(res.statusCode).toBe(400);
    });

    it('publishes project.created event', async () => {
      const handlers = createHandlers({
        eventBus,
        watcherSupervisor: createMockSupervisor(true),
        workspace,
      });

      const req = createRequest({ body: { name: 'Event App' } });
      await handlers.createProject(req);

      const projectEvents = eventBus.events.filter(e => e.type === 'appdev.project.created');
      expect(projectEvents.length).toBe(1);
      expect((projectEvents[0]!.detail as { name: string }).name).toBe('Event App');
    });
  });

  describe('generateCode', () => {
    it('returns 200 with streamHandler for SSE', async () => {
      const handlers = createHandlers({
        eventBus,
        watcherSupervisor: createMockSupervisor(true),
        workspace,
      });

      const req = createRequest({
        path: '/app-dev/projects/proj-1/generate',
        params: { id: 'proj-1' },
        body: { prompt: 'Build a todo app' },
      });
      const res = await handlers.generateCode(req);

      expect(res.statusCode).toBe(200);
      expect(res.streamHandler).toBeDefined();
      expect(typeof res.streamHandler).toBe('function');
    });

    it('returns 400 when prompt is missing', async () => {
      const handlers = createHandlers({
        eventBus,
        watcherSupervisor: createMockSupervisor(true),
        workspace,
      });

      const req = createRequest({
        params: { id: 'proj-1' },
        body: {},
      });
      const res = await handlers.generateCode(req);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('confirmSubmission', () => {
    it('returns 200 and writes audit trail', async () => {
      const handlers = createHandlers({
        eventBus,
        watcherSupervisor: createMockSupervisor(true),
        workspace,
        auditService: auditService as any,
      });

      const req = createRequest({
        params: { id: 'proj-1' },
        userId: 'king-user-1',
      });
      const res = await handlers.confirmSubmission(req);

      expect(res.statusCode).toBe(200);
      expect((res.body as { status: string }).status).toBe('confirmed');
      expect((res.body as { confirmedBy: string }).confirmedBy).toBe('king-user-1');

      // Audit trail written
      expect(auditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'app_submission_confirmed',
          target: 'proj-1',
          actingAgentId: 'king-user-1',
        }),
      );
    });
  });

  describe('getProject', () => {
    it('returns 200 with project status', async () => {
      const handlers = createHandlers({
        eventBus,
        watcherSupervisor: createMockSupervisor(true),
        workspace,
      });

      const req = createRequest({
        method: 'GET',
        params: { id: 'nonexistent-proj' },
      });
      const res = await handlers.getProject(req);

      expect(res.statusCode).toBe(200);
      expect((res.body as { fileCount: number }).fileCount).toBe(0);
    });
  });

  describe('listProjectFiles', () => {
    it('returns 200 with empty file list for new project', async () => {
      const handlers = createHandlers({
        eventBus,
        watcherSupervisor: createMockSupervisor(true),
        workspace,
      });

      const req = createRequest({
        method: 'GET',
        params: { id: 'empty-proj' },
      });
      const res = await handlers.listProjectFiles(req);

      expect(res.statusCode).toBe(200);
      expect((res.body as { files: string[] }).files).toEqual([]);
    });
  });
});


// ===========================================================================
// Build endpoint tests
// ===========================================================================

// Mock the pipeline hooks for build endpoint testing
vi.mock('../../pipeline/05-build-preparer.js', () => ({
  run: vi.fn(),
}));

vi.mock('../../pipeline/06-build-runner.js', () => ({
  run: vi.fn(),
}));

import { run as mockRunBuildPreparer } from '../../pipeline/05-build-preparer.js';
import { run as mockRunBuildRunner } from '../../pipeline/06-build-runner.js';

describe('App Dev Handlers — buildProject endpoint', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let workspace: Workspace;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = createMockEventBus();
    workspace = new Workspace();

    // Default: both hooks succeed
    vi.mocked(mockRunBuildPreparer).mockResolvedValue({
      success: true,
      hookId: 'build-preparer',
      dryRun: false,
      data: {
        ready: true,
        projectId: 'proj-1',
        platform: 'ios',
        buildNumber: '6',
        version: '1.0.0',
        credentialInfo: { keyId: 'KEY', issuerId: 'UUID', p8Content: 'p8' },
        errors: [],
      },
      durationMs: 100,
    });

    vi.mocked(mockRunBuildRunner).mockResolvedValue({
      success: true,
      hookId: 'build-runner',
      dryRun: false,
      data: { buildId: 'build-abc-123', projectId: 'proj-1', platform: 'ios', status: 'queued' },
      durationMs: 200,
    });
  });

  function createBuildRequest(overrides: Partial<APIRequest> = {}): APIRequest {
    return {
      method: 'POST',
      path: '/app-dev/projects/proj-1/build',
      params: { id: 'proj-1' },
      query: {},
      body: { platform: 'ios' },
      headers: {},
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'king',
      ...overrides,
    };
  }

  it('valid request returns 200 with buildId', async () => {
    const handlers = createHandlers({
      eventBus,
      watcherSupervisor: createMockSupervisor(true),
      workspace,
      credentialManager: {
        async getCredential() { return 'token'; },
        async rotateCredential() { return { success: true, driverName: '' }; },
        async getRotationSchedule() { return []; },
      },
    });

    const res = await handlers.buildProject(createBuildRequest());

    expect(res.statusCode).toBe(200);
    const body = res.body as { buildId: string; status: string; platform: string };
    expect(body.buildId).toBe('build-abc-123');
    expect(body.status).toBe('queued');
    expect(body.platform).toBe('ios');

    // Both hooks called in order
    expect(mockRunBuildPreparer).toHaveBeenCalledTimes(1);
    expect(mockRunBuildRunner).toHaveBeenCalledTimes(1);
  });

  it('invalid platform returns 400', async () => {
    const handlers = createHandlers({
      eventBus,
      watcherSupervisor: createMockSupervisor(true),
      workspace,
      credentialManager: {
        async getCredential() { return 'token'; },
        async rotateCredential() { return { success: true, driverName: '' }; },
        async getRotationSchedule() { return []; },
      },
    });

    const res = await handlers.buildProject(createBuildRequest({ body: { platform: 'desktop' } }));

    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toContain('platform');
    expect(mockRunBuildPreparer).not.toHaveBeenCalled();
    expect(mockRunBuildRunner).not.toHaveBeenCalled();
  });

  it('rate limit exceeded returns 429 with Retry-After', async () => {
    const handlers = createHandlers({
      eventBus,
      watcherSupervisor: createMockSupervisor(true),
      workspace,
      credentialManager: {
        async getCredential() { return 'token'; },
        async rotateCredential() { return { success: true, driverName: '' }; },
        async getRotationSchedule() { return []; },
      },
    });

    // Use unique project ID to avoid pollution from other tests
    const req = () => createBuildRequest({ params: { id: 'rate-limit-proj' }, path: '/app-dev/projects/rate-limit-proj/build' });

    // Make 3 successful requests
    await handlers.buildProject(req());
    await handlers.buildProject(req());
    await handlers.buildProject(req());

    // 4th should be rate limited
    const res = await handlers.buildProject(req());
    expect(res.statusCode).toBe(429);
    expect((res.body as any).error).toContain('Rate limit');
    expect(res.headers?.['Retry-After']).toBe('3600');
  });

  it('different projectId is NOT rate limited by another project', async () => {
    const handlers = createHandlers({
      eventBus,
      watcherSupervisor: createMockSupervisor(true),
      workspace,
      credentialManager: {
        async getCredential() { return 'token'; },
        async rotateCredential() { return { success: true, driverName: '' }; },
        async getRotationSchedule() { return []; },
      },
    });

    // Exhaust rate limit for proj-A
    for (let i = 0; i < 3; i++) {
      await handlers.buildProject(createBuildRequest({ params: { id: 'proj-A' } }));
    }

    // proj-B should still work
    const res = await handlers.buildProject(createBuildRequest({ params: { id: 'proj-B' } }));
    expect(res.statusCode).toBe(200);
  });

  it('Hook 5 failure returns 400 with errors', async () => {
    vi.mocked(mockRunBuildPreparer).mockResolvedValue({
      success: false,
      hookId: 'build-preparer',
      dryRun: false,
      error: 'Validation failed: expo.name is required',
      data: { ready: false, projectId: 'proj-1', platform: 'ios', errors: ['expo.name is required'] },
      durationMs: 50,
    });

    const handlers = createHandlers({
      eventBus,
      watcherSupervisor: createMockSupervisor(true),
      workspace,
      credentialManager: {
        async getCredential() { return 'token'; },
        async rotateCredential() { return { success: true, driverName: '' }; },
        async getRotationSchedule() { return []; },
      },
    });

    const res = await handlers.buildProject(createBuildRequest({ params: { id: 'hook5-fail-proj' } }));

    expect(res.statusCode).toBe(400);
    expect((res.body as any).errors).toContain('expo.name is required');
    // Hook 6 should NOT be called
    expect(mockRunBuildRunner).not.toHaveBeenCalled();
  });

  it('Hook 6 failure returns 500', async () => {
    vi.mocked(mockRunBuildRunner).mockResolvedValue({
      success: false,
      hookId: 'build-runner',
      dryRun: false,
      error: 'EAS build submission failed: not authenticated',
      data: { buildId: '', projectId: 'proj-1', platform: 'ios', status: 'queued' },
      durationMs: 100,
    });

    const handlers = createHandlers({
      eventBus,
      watcherSupervisor: createMockSupervisor(true),
      workspace,
      credentialManager: {
        async getCredential() { return 'token'; },
        async rotateCredential() { return { success: true, driverName: '' }; },
        async getRotationSchedule() { return []; },
      },
    });

    const res = await handlers.buildProject(createBuildRequest({ params: { id: 'hook6-fail-proj' } }));

    expect(res.statusCode).toBe(500);
    expect((res.body as any).error).toContain('submission failed');
  });

  it('Hook 5 failure does NOT count against rate limit', async () => {
    // Hook 5 always fails
    vi.mocked(mockRunBuildPreparer).mockResolvedValue({
      success: false,
      hookId: 'build-preparer',
      dryRun: false,
      error: 'validation failed',
      data: { ready: false, projectId: 'proj-1', platform: 'ios', errors: ['bad'] },
      durationMs: 10,
    });

    const handlers = createHandlers({
      eventBus,
      watcherSupervisor: createMockSupervisor(true),
      workspace,
      credentialManager: {
        async getCredential() { return 'token'; },
        async rotateCredential() { return { success: true, driverName: '' }; },
        async getRotationSchedule() { return []; },
      },
    });

    const projId = 'no-burn-proj';
    const req = () => createBuildRequest({ params: { id: projId } });

    // Make 5 failed requests (all Hook 5 failures)
    for (let i = 0; i < 5; i++) {
      const res = await handlers.buildProject(req());
      expect(res.statusCode).toBe(400); // Hook 5 failure
    }

    // Now make Hook 5 succeed — should NOT be rate limited (failures didn't count)
    vi.mocked(mockRunBuildPreparer).mockResolvedValue({
      success: true, hookId: 'build-preparer', dryRun: false,
      data: { ready: true, projectId: projId, platform: 'ios', buildNumber: '1', errors: [] },
      durationMs: 10,
    });

    const res = await handlers.buildProject(req());
    // Should succeed (not 429) because failed attempts didn't burn quota
    expect(res.statusCode).toBe(200);
  });
});
