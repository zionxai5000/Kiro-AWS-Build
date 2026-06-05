/**
 * Preview proxy unit tests — token round-trip + ownership/auth refusals.
 *
 * The proxy itself is a `streamHandler`, which is harder to unit-test
 * without a full HTTP harness. We focus on the deterministic auth-related
 * code paths that DON'T need a real upstream sandbox.
 */

import { describe, it, expect } from 'vitest';
import type { WorkspaceLike } from '../types.js';
import {
  createPreviewRoutes,
  __test__,
} from '../../api/preview-proxy.js';
import type { APIRequest } from '@seraphim/services/shaar/api-routes.js';

class MemoryWorkspace implements WorkspaceLike {
  files = new Map<string, string>();
  meta: Record<string, unknown> | null = null;
  async readFile(_p: string, path: string): Promise<string> {
    if (path === '.meta/project.json' && this.meta) return JSON.stringify(this.meta);
    const v = this.files.get(path);
    if (v === undefined) throw new Error(`ENOENT ${path}`);
    return v;
  }
  async writeFile(_p: string, path: string, content: string): Promise<void> {
    if (path === '.meta/project.json') {
      try { this.meta = JSON.parse(content) as Record<string, unknown>; } catch { /* ignore */ }
    }
    this.files.set(path, content);
  }
  async listFiles(_p: string): Promise<string[]> { return [...this.files.keys()].sort(); }
  async exists(_p: string, path: string): Promise<boolean> {
    if (path === '.meta/project.json') return this.meta !== null;
    return this.files.has(path);
  }
  async delete(_p: string, path: string): Promise<void> { this.files.delete(path); }
  // Workspace shim — preview-proxy calls workspace.readProjectMeta directly.
  async readProjectMeta(): Promise<Record<string, unknown> | null> { return this.meta; }
}

const SECRET = 'test-preview-proxy-secret';

function makeReq(overrides: Partial<APIRequest> = {}): APIRequest {
  // The production router strips `/api` before dispatching, so handlers see
  // `/preview/...`. Tests reproduce that.
  return {
    method: 'GET',
    path: '/preview/p1',
    params: { projectId: 'p1' },
    query: {},
    body: null,
    headers: {},
    tenantId: 't1',
    userId: '',
    role: 'king',
    ...overrides,
  };
}

describe('preview-proxy', () => {
  it('signs and verifies a token', () => {
    const t = __test__.signToken(
      { projectId: 'p1', userId: 'u1', exp: Date.now() + 60_000 },
      SECRET,
    );
    expect(__test__.verifyToken(t, SECRET)).toMatchObject({ projectId: 'p1', userId: 'u1' });
    expect(__test__.verifyToken(t, 'other-secret')).toBeNull();
    expect(__test__.verifyToken('garbage', SECRET)).toBeNull();
  });

  it('rejects expired tokens', () => {
    const expired = __test__.signToken(
      { projectId: 'p1', userId: 'u1', exp: Date.now() - 1 },
      SECRET,
    );
    expect(__test__.verifyToken(expired, SECRET)).toBeNull();
  });

  it('rejects anonymous proxy requests when there is no token', async () => {
    const ws = new MemoryWorkspace();
    ws.meta = { ownerId: 'u1' };
    const routes = createPreviewRoutes({
      workspace: ws as never,
      resolveSandboxUrl: async () => null,
      signingSecret: SECRET,
    });
    const proxy = routes.find((r) => r.method === 'GET' && r.path === '/preview/:projectId/*')!;
    const res = await proxy.handler(makeReq());
    expect(res.statusCode).toBe(401);
  });

  it('rejects a different user (403)', async () => {
    const ws = new MemoryWorkspace();
    ws.meta = { ownerId: 'u1' };
    const routes = createPreviewRoutes({
      workspace: ws as never,
      resolveSandboxUrl: async () => null,
      signingSecret: SECRET,
    });
    const proxy = routes.find((r) => r.method === 'GET' && r.path === '/preview/:projectId/*')!;
    const res = await proxy.handler(makeReq({ userId: 'u2' }));
    expect(res.statusCode).toBe(403);
  });

  it('serves the not-yet-provisioned placeholder when sandbox URL is null', async () => {
    const ws = new MemoryWorkspace();
    ws.meta = { ownerId: 'u1' };
    const routes = createPreviewRoutes({
      workspace: ws as never,
      resolveSandboxUrl: async () => null,
      signingSecret: SECRET,
    });
    const proxy = routes.find((r) => r.method === 'GET' && r.path === '/preview/:projectId/*')!;
    const res = await proxy.handler(makeReq({ userId: 'u1' }));
    expect(res.statusCode).toBe(503);
    expect(res.streamHandler).toBeTypeOf('function');
  });

  it('accepts a valid signed token even without a session', async () => {
    const ws = new MemoryWorkspace();
    ws.meta = { ownerId: 'u1' };
    const routes = createPreviewRoutes({
      workspace: ws as never,
      resolveSandboxUrl: async () => null,
      signingSecret: SECRET,
    });
    const proxy = routes.find((r) => r.method === 'GET' && r.path === '/preview/:projectId/*')!;
    const token = __test__.signToken(
      { projectId: 'p1', userId: 'u1', exp: Date.now() + 60_000 },
      SECRET,
    );
    const res = await proxy.handler(makeReq({ userId: '', query: { token } }));
    expect(res.statusCode).toBe(503); // not provisioned, but auth passed
  });

  it('rejects a token whose projectId mismatches the URL', async () => {
    const ws = new MemoryWorkspace();
    ws.meta = { ownerId: 'u1' };
    const routes = createPreviewRoutes({
      workspace: ws as never,
      resolveSandboxUrl: async () => null,
      signingSecret: SECRET,
    });
    const proxy = routes.find((r) => r.method === 'GET' && r.path === '/preview/:projectId/*')!;
    const tokenForOtherProject = __test__.signToken(
      { projectId: 'OTHER', userId: 'u1', exp: Date.now() + 60_000 },
      SECRET,
    );
    const res = await proxy.handler(makeReq({ userId: '', query: { token: tokenForOtherProject } }));
    expect(res.statusCode).toBe(401);
  });

  it('issues a 1-hour signed token via POST /token', async () => {
    const ws = new MemoryWorkspace();
    ws.meta = { ownerId: 'u1' };
    const routes = createPreviewRoutes({
      workspace: ws as never,
      resolveSandboxUrl: async () => null,
      signingSecret: SECRET,
    });
    const tokenIssuer = routes.find((r) => r.method === 'POST')!;
    const res = await tokenIssuer.handler(makeReq({ userId: 'u1', method: 'POST' }));
    expect(res.statusCode).toBe(200);
    const body = res.body as { token: string; urlPattern: string; expiresAt: string };
    expect(body.urlPattern).toContain('/api/preview/p1/');
    expect(body.token).toBeTruthy();
    const verified = __test__.verifyToken(body.token, SECRET);
    expect(verified?.userId).toBe('u1');
    expect(verified?.projectId).toBe('p1');
  });
});
