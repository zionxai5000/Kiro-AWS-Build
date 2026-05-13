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
    it('returns 202 accepted', async () => {
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

      expect(res.statusCode).toBe(202);
      expect((res.body as { status: string }).status).toBe('accepted');
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
