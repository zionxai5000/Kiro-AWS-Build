/**
 * Unit tests for Document API endpoint (GET /api/specs/:documentType)
 *
 * Validates: Requirements 47e.19, 47f.22, 47g.25
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShaarAPIRouter } from '../api-routes.js';
import type { APIRequest } from '../api-routes.js';

// Mock Node.js fs/promises and crypto
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}));

import { readFile, stat } from 'node:fs/promises';

const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);

// ---------------------------------------------------------------------------
// Mocks for ShaarAPIRouter dependencies
// ---------------------------------------------------------------------------

function createMockRuntime() {
  return {
    listAgents: vi.fn().mockResolvedValue([]),
    getState: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue({ success: true }),
    deploy: vi.fn().mockResolvedValue({ id: 'agent-1' }),
    terminate: vi.fn().mockResolvedValue(undefined),
    upgrade: vi.fn().mockResolvedValue(undefined),
    getHealth: vi.fn().mockResolvedValue({ healthy: true }),
  } as any;
}

function createMockAudit() {
  return {
    recordAction: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true }),
  } as any;
}

function createMockOtzar() {
  return {
    getCostReport: vi.fn().mockResolvedValue({ totalCost: 0, byAgent: {} }),
  } as any;
}

function createMockMishmar() {
  return {
    authorize: vi.fn().mockResolvedValue({ authorized: true, reason: 'OK', auditId: 'a-1' }),
  } as any;
}

function makeRequest(overrides: Partial<APIRequest> = {}): APIRequest {
  return {
    method: 'GET',
    path: '/specs/requirements',
    params: {},
    query: {},
    body: undefined,
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

describe('Document API — GET /specs/:documentType', () => {
  let router: ShaarAPIRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new ShaarAPIRouter(
      createMockRuntime(),
      createMockAudit(),
      createMockOtzar(),
      createMockMishmar(),
    );
  });

  it('should return requirements.md content with lastModified and hash', async () => {
    const content = '# Requirements\n\nSome requirements content';
    const mtime = new Date('2024-06-15T10:30:00Z');

    mockReadFile.mockResolvedValue(content);
    mockStat.mockResolvedValue({ mtime } as any);

    const res = await router.handleRequest(makeRequest({ path: '/specs/requirements' }));

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.content).toBe(content);
    expect(body.lastModified).toBe('2024-06-15T10:30:00.000Z');
    expect(body.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should return design.md content', async () => {
    const content = '# Design\n\nArchitecture overview';
    const mtime = new Date('2024-07-01T08:00:00Z');

    mockReadFile.mockResolvedValue(content);
    mockStat.mockResolvedValue({ mtime } as any);

    const res = await router.handleRequest(makeRequest({ path: '/specs/design' }));

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.content).toBe(content);
    expect(body.lastModified).toBe('2024-07-01T08:00:00.000Z');
    expect(body.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should return capabilities.md content', async () => {
    const content = '# Capabilities\n\nPlatform capabilities';
    const mtime = new Date('2024-08-20T14:00:00Z');

    mockReadFile.mockResolvedValue(content);
    mockStat.mockResolvedValue({ mtime } as any);

    const res = await router.handleRequest(makeRequest({ path: '/specs/capabilities' }));

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.content).toBe(content);
    expect(body.lastModified).toBe('2024-08-20T14:00:00.000Z');
    expect(body.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should compute correct SHA-256 hash of content', async () => {
    const content = 'Hello, World!';
    const mtime = new Date('2024-01-01T00:00:00Z');

    mockReadFile.mockResolvedValue(content);
    mockStat.mockResolvedValue({ mtime } as any);

    const res = await router.handleRequest(makeRequest({ path: '/specs/requirements' }));

    const body = res.body as any;
    // SHA-256 of "Hello, World!" is known
    const { createHash } = await import('node:crypto');
    const expectedHash = createHash('sha256').update(content).digest('hex');
    expect(body.hash).toBe(expectedHash);
  });

  it('should return 404 for invalid document type', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/specs/invalid' }));

    expect(res.statusCode).toBe(404);
    const body = res.body as any;
    expect(body.error).toBe('Invalid document type');
    expect(body.validTypes).toEqual(['requirements', 'design', 'capabilities']);
  });

  it('should return 404 for unknown document types like tasks', async () => {
    const res = await router.handleRequest(makeRequest({ path: '/specs/tasks' }));

    expect(res.statusCode).toBe(404);
    const body = res.body as any;
    expect(body.error).toBe('Invalid document type');
  });

  it('should return 404 when file does not exist (ENOENT)', async () => {
    const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
    enoentError.code = 'ENOENT';

    mockReadFile.mockRejectedValue(enoentError);
    mockStat.mockRejectedValue(enoentError);

    const res = await router.handleRequest(makeRequest({ path: '/specs/requirements' }));

    expect(res.statusCode).toBe(404);
    const body = res.body as any;
    expect(body.error).toBe('Document not found');
    expect(body.documentType).toBe('requirements');
  });

  it('should return 500 on read errors (non-ENOENT)', async () => {
    const permError = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
    permError.code = 'EACCES';

    mockReadFile.mockRejectedValue(permError);
    mockStat.mockRejectedValue(permError);

    const res = await router.handleRequest(makeRequest({ path: '/specs/requirements' }));

    expect(res.statusCode).toBe(500);
    const body = res.body as any;
    expect(body.error).toBe('Failed to read document');
    expect(body.message).toContain('EACCES');
  });

  it('should be accessible as a registered route', () => {
    const routes = router.getRoutes();
    const specRoute = routes.find(r => r.path === '/specs/:documentType' && r.method === 'GET');
    expect(specRoute).toBeDefined();
  });
});
