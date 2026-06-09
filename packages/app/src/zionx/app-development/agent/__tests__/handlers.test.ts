/**
 * Phase 9.7 — agent-message + sandbox handler unit tests.
 *
 * Covers the deterministic branches of:
 *   • POST /app-dev/projects/:id/agent-message
 *   • GET  /app-dev/projects/:id/sandbox
 *   • POST /app-dev/projects/:id/sandbox/wake
 *   • POST /app-dev/projects/:id/sandbox/hibernate
 *
 * The full agent loop and the live E2B path are NOT exercised here; those
 * are covered by harness-smoke + agent-loop tests and by the live probe
 * scripts. These tests focus on the validation, ownership, and "no
 * sandbox" branches that are 100% deterministic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { APIRequest, APIResponse } from '@seraphim/services/shaar/api-routes.js';
import { createHandlers } from '../../api/handlers.js';

// ---------------------------------------------------------------------------
// Test doubles — the smallest plausible deps that satisfy the factory.
// ---------------------------------------------------------------------------

class FakeWorkspace {
  meta = new Map<string, Record<string, unknown>>();
  ensured = new Set<string>();
  files = new Map<string, Map<string, string>>();

  async ensureProjectDir(id: string): Promise<void> {
    this.ensured.add(id);
    if (!this.files.has(id)) this.files.set(id, new Map());
  }
  async writeProjectMeta(id: string, meta: Record<string, unknown>): Promise<void> {
    this.meta.set(id, { ...(this.meta.get(id) ?? {}), ...meta });
  }
  async readProjectMeta(id: string): Promise<Record<string, unknown> | null> {
    return this.meta.get(id) ?? null;
  }
  async readFile(): Promise<string> { return ''; }
  async writeFile(): Promise<void> { /* noop */ }
  async listFiles(): Promise<string[]> { return []; }
  async exists(): Promise<boolean> { return false; }
  async delete(): Promise<void> { /* noop */ }
}

const fakeWatcher = { isHealthy: () => true } as unknown as Parameters<typeof createHandlers>[0]['watcherSupervisor'];

const fakeEventBus = {
  publish: async () => { /* swallow */ },
} as unknown as Parameters<typeof createHandlers>[0]['eventBus'];

function makeReq(overrides: Partial<APIRequest> = {}): APIRequest {
  return {
    method: 'POST',
    path: '/app-dev/projects/p1/agent-message',
    params: { id: 'p1' },
    query: {},
    body: null,
    headers: {},
    tenantId: 't1',
    userId: 'u1',
    role: 'king',
    ...overrides,
  };
}

function makeHandlers(workspace: FakeWorkspace) {
  return createHandlers({
    eventBus: fakeEventBus,
    watcherSupervisor: fakeWatcher,
    workspace: workspace as unknown as Parameters<typeof createHandlers>[0]['workspace'],
  });
}

// ---------------------------------------------------------------------------

describe('handlers — agentMessage', () => {
  let ws: FakeWorkspace;

  beforeEach(() => {
    ws = new FakeWorkspace();
  });

  it('400 when projectId is missing', async () => {
    const h = makeHandlers(ws);
    const res = await h.agentMessage(makeReq({ params: {} }));
    expect(res.statusCode).toBe(400);
  });

  it('400 when prompt is missing', async () => {
    const h = makeHandlers(ws);
    const res = await h.agentMessage(makeReq({ body: {} }));
    expect(res.statusCode).toBe(400);
  });

  it('404 when project does not exist (ownership check)', async () => {
    const h = makeHandlers(ws);
    const res = await h.agentMessage(makeReq({ body: { prompt: 'hi' } }));
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/not found/i);
  });

  it('403 when caller does not own the project', async () => {
    ws.meta.set('p1', { ownerId: 'someone-else' });
    const h = makeHandlers(ws);
    const res = await h.agentMessage(makeReq({ body: { prompt: 'hi' }, userId: 'u1' }));
    expect(res.statusCode).toBe(403);
  });

  it('200 + streamHandler when ownership passes', async () => {
    ws.meta.set('p1', { ownerId: 'u1' });
    const h = makeHandlers(ws);
    const res: APIResponse = await h.agentMessage(makeReq({ body: { prompt: 'hi' }, userId: 'u1' }));
    expect(res.statusCode).toBe(200);
    expect(typeof res.streamHandler).toBe('function');
  });
});

describe('handlers — getSandboxStatus', () => {
  let ws: FakeWorkspace;

  beforeEach(() => {
    ws = new FakeWorkspace();
    delete (globalThis as unknown as { __zionxSandboxClient?: unknown }).__zionxSandboxClient;
  });
  afterEach(() => {
    delete (globalThis as unknown as { __zionxSandboxClient?: unknown }).__zionxSandboxClient;
  });

  it('400 when projectId is missing', async () => {
    const h = makeHandlers(ws);
    const res = await h.getSandboxStatus(makeReq({ method: 'GET', params: {} }));
    expect(res.statusCode).toBe(400);
  });

  it('404 when project does not exist', async () => {
    const h = makeHandlers(ws);
    const res = await h.getSandboxStatus(makeReq({ method: 'GET' }));
    expect(res.statusCode).toBe(404);
  });

  it('returns "unavailable" when no sandbox client is provisioned', async () => {
    ws.meta.set('p1', { ownerId: 'u1' });
    const h = makeHandlers(ws);
    const res = await h.getSandboxStatus(makeReq({ method: 'GET' }));
    expect(res.statusCode).toBe(200);
    expect((res.body as { status: string }).status).toBe('unavailable');
  });

  it('returns "live" + publicUrl when sandbox client resolves', async () => {
    ws.meta.set('p1', { ownerId: 'u1' });
    (globalThis as unknown as { __zionxSandboxClient: unknown }).__zionxSandboxClient = {
      getPublicUrl: async () => 'https://example.e2b.app',
    };
    const h = makeHandlers(ws);
    const res = await h.getSandboxStatus(makeReq({ method: 'GET' }));
    expect(res.statusCode).toBe(200);
    expect((res.body as { status: string; publicUrl: string }).status).toBe('live');
    expect((res.body as { publicUrl: string }).publicUrl).toBe('https://example.e2b.app');
  });

  it('returns "idle" when sandbox getPublicUrl rejects', async () => {
    ws.meta.set('p1', { ownerId: 'u1' });
    (globalThis as unknown as { __zionxSandboxClient: unknown }).__zionxSandboxClient = {
      getPublicUrl: async () => { throw new Error('not provisioned'); },
    };
    const h = makeHandlers(ws);
    const res = await h.getSandboxStatus(makeReq({ method: 'GET' }));
    expect(res.statusCode).toBe(200);
    expect((res.body as { status: string }).status).toBe('idle');
  });
});

describe('handlers — wakeSandbox', () => {
  let ws: FakeWorkspace;

  beforeEach(() => {
    ws = new FakeWorkspace();
    delete (globalThis as unknown as { __zionxSandboxClient?: unknown }).__zionxSandboxClient;
  });
  afterEach(() => {
    delete (globalThis as unknown as { __zionxSandboxClient?: unknown }).__zionxSandboxClient;
  });

  it('503 when no sandbox client is configured', async () => {
    ws.meta.set('p1', { ownerId: 'u1' });
    const h = makeHandlers(ws);
    const res = await h.wakeSandbox(makeReq());
    expect(res.statusCode).toBe(503);
  });

  it('200 + live status when wake succeeds', async () => {
    ws.meta.set('p1', { ownerId: 'u1' });
    let runCommandCalled = false;
    (globalThis as unknown as { __zionxSandboxClient: unknown }).__zionxSandboxClient = {
      getPublicUrl: async () => 'https://example.e2b.app',
      runCommand: async () => {
        runCommandCalled = true;
        return { stdout: '', exitCode: 0 };
      },
      writeFile: async () => { /* noop */ },
    };
    const h = makeHandlers(ws);
    const res = await h.wakeSandbox(makeReq());
    expect(res.statusCode).toBe(200);
    expect((res.body as { status: string }).status).toBe('live');
    expect(runCommandCalled).toBe(true);
  });

  it('502 when sandbox getPublicUrl rejects', async () => {
    ws.meta.set('p1', { ownerId: 'u1' });
    (globalThis as unknown as { __zionxSandboxClient: unknown }).__zionxSandboxClient = {
      getPublicUrl: async () => { throw new Error('boot failed'); },
      runCommand: async () => ({ stdout: '', exitCode: 0 }),
      writeFile: async () => { /* noop */ },
    };
    const h = makeHandlers(ws);
    const res = await h.wakeSandbox(makeReq());
    expect(res.statusCode).toBe(502);
  });
});

describe('handlers — hibernateSandbox', () => {
  let ws: FakeWorkspace;

  beforeEach(() => {
    ws = new FakeWorkspace();
    delete (globalThis as unknown as { __zionxSandboxClient?: unknown }).__zionxSandboxClient;
  });
  afterEach(() => {
    delete (globalThis as unknown as { __zionxSandboxClient?: unknown }).__zionxSandboxClient;
  });

  it('503 when no sandbox client is configured', async () => {
    ws.meta.set('p1', { ownerId: 'u1' });
    const h = makeHandlers(ws);
    const res = await h.hibernateSandbox(makeReq());
    expect(res.statusCode).toBe(503);
  });

  it('200 + idle status after dispose', async () => {
    ws.meta.set('p1', { ownerId: 'u1' });
    let disposeCalled = false;
    (globalThis as unknown as { __zionxSandboxClient: unknown }).__zionxSandboxClient = {
      dispose: async () => { disposeCalled = true; },
    };
    const h = makeHandlers(ws);
    const res = await h.hibernateSandbox(makeReq());
    expect(res.statusCode).toBe(200);
    expect((res.body as { status: string }).status).toBe('idle');
    expect(disposeCalled).toBe(true);
  });

  it('502 when dispose rejects', async () => {
    ws.meta.set('p1', { ownerId: 'u1' });
    (globalThis as unknown as { __zionxSandboxClient: unknown }).__zionxSandboxClient = {
      dispose: async () => { throw new Error('disposal failed'); },
    };
    const h = makeHandlers(ws);
    const res = await h.hibernateSandbox(makeReq());
    expect(res.statusCode).toBe(502);
  });
});

describe('handlers — createProject ownership stamping (Phase 5 regression)', () => {
  let ws: FakeWorkspace;

  beforeEach(() => {
    ws = new FakeWorkspace();
  });

  it('stamps ownerId from req.userId on the new project', async () => {
    const h = makeHandlers(ws);
    const res = await h.createProject(makeReq({
      body: { name: 'Test App', description: 'desc' },
      userId: 'king',
      params: {},
    }));
    expect(res.statusCode).toBe(201);
    const id = (res.body as { projectId: string }).projectId;
    expect(ws.meta.get(id)?.ownerId).toBe('king');
  });

  it('falls back to "anonymous" when no userId is present', async () => {
    const h = makeHandlers(ws);
    const res = await h.createProject(makeReq({
      body: { name: 'Test App' },
      userId: '',
      params: {},
    }));
    const id = (res.body as { projectId: string }).projectId;
    expect(ws.meta.get(id)?.ownerId).toBe('anonymous');
  });
});

describe('handlers — generateCode deprecation (Phase 12 sunset)', () => {
  let ws: FakeWorkspace;

  beforeEach(() => {
    ws = new FakeWorkspace();
  });

  it('writes Sunset + Deprecation + Link headers on the SSE response', async () => {
    const h = makeHandlers(ws);
    const res = await h.generateCode(makeReq({
      method: 'POST',
      params: { id: 'p1' },
      body: { prompt: 'build me a thing' },
    }));
    expect(res.statusCode).toBe(200);
    expect(typeof res.streamHandler).toBe('function');

    // Capture the headers the streamHandler writes.
    const captured: { status?: number; headers?: Record<string, string> } = {};
    const fakeRes = {
      writableEnded: false,
      destroyed: false,
      writeHead(status: number, headers: Record<string, string>) {
        captured.status = status;
        captured.headers = headers;
        // Force-end the response so the async generation work does not run.
        this.writableEnded = true;
        return this;
      },
      write() { return true; },
      end() { this.writableEnded = true; },
      on() { /* noop */ },
    };
    // streamHandler kicks off async work; we only care about the synchronous
    // header write at the top.
    res.streamHandler!(fakeRes as never);

    expect(captured.status).toBe(200);
    expect(captured.headers?.['Content-Type']).toBe('text/event-stream');
    expect(captured.headers?.['Deprecation']).toBe('true');
    expect(captured.headers?.['Sunset']).toMatch(/2026/);
    expect(captured.headers?.['Link']).toContain('/agent-message');
    expect(captured.headers?.['Link']).toContain('rel="successor-version"');
  });
});
