/**
 * Project ownership middleware tests — covers all four code paths:
 *   1. Project not found → 404
 *   2. Unowned project + authenticated user → claim + 200
 *   3. Owner mismatch → 403
 *   4. Anonymous against unowned project → 401
 */

import { describe, it, expect } from 'vitest';
import { requireProjectOwner } from '../../api/project-ownership.js';

interface FakeWorkspace {
  meta: Record<string, unknown> | null;
  written: Array<Record<string, unknown>>;
  readProjectMeta: () => Promise<Record<string, unknown> | null>;
  writeProjectMeta: (id: string, meta: Record<string, unknown>) => Promise<void>;
}

function makeWorkspace(initialMeta: Record<string, unknown> | null): FakeWorkspace {
  const ws: FakeWorkspace = {
    meta: initialMeta,
    written: [],
    async readProjectMeta() { return ws.meta; },
    async writeProjectMeta(_id, meta) {
      ws.written.push(meta);
      ws.meta = meta;
    },
  };
  return ws;
}

function makeReq(userId = ''): { userId: string; tenantId: string; role: string; params: Record<string, string>; method: string; path: string; query: Record<string, string>; body: unknown; headers: Record<string, string> } {
  return {
    userId, tenantId: 't1', role: 'king',
    params: {}, query: {}, body: null, headers: {},
    method: 'POST', path: '/app-dev/projects/p1/agent-message',
  };
}

describe('requireProjectOwner', () => {
  it('returns 404 when project meta is missing', async () => {
    const ws = makeWorkspace(null);
    const r = await requireProjectOwner(makeReq('u1') as never, ws as never, 'p1');
    expect(r.reject?.statusCode).toBe(404);
  });

  it('claims an unowned project for the current user', async () => {
    const ws = makeWorkspace({ name: 'legacy-project' });
    const r = await requireProjectOwner(makeReq('u1') as never, ws as never, 'p1');
    expect(r.reject).toBeUndefined();
    expect(r.ownerId).toBe('u1');
    expect(ws.written.length).toBe(1);
    expect(ws.written[0]?.ownerId).toBe('u1');
  });

  it('rejects anonymous claim attempts (401)', async () => {
    const ws = makeWorkspace({ name: 'legacy-project' });
    const r = await requireProjectOwner(makeReq('') as never, ws as never, 'p1');
    expect(r.reject?.statusCode).toBe(401);
    expect(ws.written.length).toBe(0);
  });

  it('passes when ownerId matches', async () => {
    const ws = makeWorkspace({ name: 'p', ownerId: 'u1' });
    const r = await requireProjectOwner(makeReq('u1') as never, ws as never, 'p1');
    expect(r.reject).toBeUndefined();
    expect(r.ownerId).toBe('u1');
    expect(ws.written.length).toBe(0);
  });

  it('rejects on owner mismatch (403)', async () => {
    const ws = makeWorkspace({ name: 'p', ownerId: 'u1' });
    const r = await requireProjectOwner(makeReq('u2') as never, ws as never, 'p1');
    expect(r.reject?.statusCode).toBe(403);
  });

  it('rejects anonymous user with owned project (401)', async () => {
    const ws = makeWorkspace({ name: 'p', ownerId: 'u1' });
    const r = await requireProjectOwner(makeReq('') as never, ws as never, 'p1');
    expect(r.reject?.statusCode).toBe(401);
  });
});
