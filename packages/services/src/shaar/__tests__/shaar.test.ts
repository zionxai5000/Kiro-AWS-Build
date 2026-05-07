/**
 * Unit tests for Shaar API Layer
 *
 * Validates: Requirements 9.1, 9.2, 9.4, 19.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShaarAPIRouter } from '../api-routes.js';
import { ShaarWebSocketHandler } from '../websocket-handler.js';
import { CommandRouter } from '../command-router.js';
import type { APIRequest } from '../api-routes.js';
import { CognitoAuthService } from '../../auth/cognito.js';
import { AuthMiddleware } from '../../auth/middleware.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockRuntime() {
  return {
    listAgents: vi.fn().mockResolvedValue([
      { id: 'agent-1', pillar: 'eretz', state: 'ready' },
      { id: 'agent-2', pillar: 'otzar', state: 'executing' },
    ]),
    getState: vi.fn().mockResolvedValue({ id: 'agent-1', state: 'ready', pillar: 'eretz' }),
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
    query: vi.fn().mockResolvedValue([{ id: 'audit-1', actionType: 'test' }]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true }),
  } as any;
}

function createMockOtzar() {
  return {
    getCostReport: vi.fn().mockResolvedValue({ totalCost: 100, byAgent: {} }),
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
    path: '/agents',
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
// API Router Tests (without auth middleware — backward compatible)
// ---------------------------------------------------------------------------

describe('ShaarAPIRouter', () => {
  let router: ShaarAPIRouter;

  beforeEach(() => {
    router = new ShaarAPIRouter(
      createMockRuntime(),
      createMockAudit(),
      createMockOtzar(),
      createMockMishmar(),
    );
  });

  it('should return agents list', async () => {
    const res = await router.handleRequest(makeRequest({ method: 'GET', path: '/agents' }));
    expect(res.statusCode).toBe(200);
    expect((res.body as any).agents).toHaveLength(2);
  });

  it('should return agent detail', async () => {
    const res = await router.handleRequest(makeRequest({ method: 'GET', path: '/agents/agent-1' }));
    expect(res.statusCode).toBe(200);
    expect((res.body as any).agent).toBeDefined();
  });

  it('should return cost data', async () => {
    const res = await router.handleRequest(makeRequest({ method: 'GET', path: '/costs', query: {} }));
    expect(res.statusCode).toBe(200);
    expect((res.body as any).costs).toBeDefined();
  });

  it('should return audit entries', async () => {
    const res = await router.handleRequest(makeRequest({ method: 'GET', path: '/audit', query: {} }));
    expect(res.statusCode).toBe(200);
    expect((res.body as any).entries).toBeDefined();
  });

  it('should return health status', async () => {
    const res = await router.handleRequest(makeRequest({ method: 'GET', path: '/health' }));
    expect(res.statusCode).toBe(200);
    expect((res.body as any).status).toBe('healthy');
  });

  it('should return 404 for unknown routes', async () => {
    const res = await router.handleRequest(makeRequest({ method: 'GET', path: '/unknown' }));
    expect(res.statusCode).toBe(404);
  });

  it('should reject unauthorized requests', async () => {
    const mockMishmar = createMockMishmar();
    mockMishmar.authorize.mockResolvedValue({ authorized: false, reason: 'Denied', auditId: 'a-2' });
    const r = new ShaarAPIRouter(createMockRuntime(), createMockAudit(), createMockOtzar(), mockMishmar);
    const res = await r.handleRequest(makeRequest());
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// API Router Tests (with auth middleware — JWT validation)
// ---------------------------------------------------------------------------

describe('ShaarAPIRouter with AuthMiddleware', () => {
  let router: ShaarAPIRouter;
  let authService: CognitoAuthService;
  let authMiddleware: AuthMiddleware;
  let validToken: string;

  beforeEach(async () => {
    authService = new CognitoAuthService();
    authMiddleware = new AuthMiddleware(authService);

    await authService.register('king@example.com', 'tenant-1', 'king');
    const loginResult = await authService.login('king@example.com');
    validToken = loginResult.token!.accessToken;

    router = new ShaarAPIRouter(
      createMockRuntime(),
      createMockAudit(),
      createMockOtzar(),
      createMockMishmar(),
      authMiddleware,
    );
  });

  it('should authenticate and handle request with valid token', async () => {
    const res = await router.handleRequest(
      makeRequest({
        method: 'GET',
        path: '/agents',
        headers: { authorization: `Bearer ${validToken}` },
      }),
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).agents).toHaveLength(2);
  });

  it('should return 401 for missing authorization header', async () => {
    const res = await router.handleRequest(
      makeRequest({ method: 'GET', path: '/agents', headers: {} }),
    );
    expect(res.statusCode).toBe(401);
    expect((res.body as any).error).toBe('Authentication failed');
  });

  it('should return 401 for invalid token', async () => {
    const res = await router.handleRequest(
      makeRequest({
        method: 'GET',
        path: '/agents',
        headers: { authorization: 'Bearer invalid-token-xyz' },
      }),
    );
    expect(res.statusCode).toBe(401);
  });

  it('should return 401 for malformed authorization header', async () => {
    const res = await router.handleRequest(
      makeRequest({
        method: 'GET',
        path: '/agents',
        headers: { authorization: 'Basic abc123' },
      }),
    );
    expect(res.statusCode).toBe(401);
  });

  it('should extract tenant and role from authenticated token', async () => {
    const mockMishmar = createMockMishmar();
    const r = new ShaarAPIRouter(
      createMockRuntime(),
      createMockAudit(),
      createMockOtzar(),
      mockMishmar,
      authMiddleware,
    );

    await r.handleRequest(
      makeRequest({
        method: 'GET',
        path: '/agents',
        headers: { authorization: `Bearer ${validToken}` },
      }),
    );

    // Verify Mishmar was called with the tenant from the token
    expect(mockMishmar.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { tenantId: 'tenant-1' },
      }),
    );
  });

  it('should enforce Mishmar authorization after JWT authentication', async () => {
    const mockMishmar = createMockMishmar();
    mockMishmar.authorize.mockResolvedValue({ authorized: false, reason: 'Denied', auditId: 'a-2' });
    const r = new ShaarAPIRouter(
      createMockRuntime(),
      createMockAudit(),
      createMockOtzar(),
      mockMishmar,
      authMiddleware,
    );

    const res = await r.handleRequest(
      makeRequest({
        method: 'GET',
        path: '/agents',
        headers: { authorization: `Bearer ${validToken}` },
      }),
    );
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// WebSocket Handler Tests
// ---------------------------------------------------------------------------

describe('ShaarWebSocketHandler', () => {
  let handler: ShaarWebSocketHandler;

  beforeEach(() => {
    handler = new ShaarWebSocketHandler();
  });

  it('should handle connection and disconnection', () => {
    handler.connect('conn-1', 'tenant-1', 'user-1');
    expect(handler.getConnectionCount()).toBe(1);
    handler.disconnect('conn-1');
    expect(handler.getConnectionCount()).toBe(0);
  });

  it('should broadcast to subscribed connections', () => {
    handler.connect('conn-1', 'tenant-1', 'user-1');
    handler.connect('conn-2', 'tenant-1', 'user-2');

    const msg = ShaarWebSocketHandler.createMessage('agent.state.changed', { agentId: 'a-1' });
    const recipients = handler.broadcast(msg, 'tenant-1');
    expect(recipients).toHaveLength(2);
  });

  it('should filter by tenant', () => {
    handler.connect('conn-1', 'tenant-1', 'user-1');
    handler.connect('conn-2', 'tenant-2', 'user-2');

    const msg = ShaarWebSocketHandler.createMessage('alert.triggered', { alert: 'test' });
    const recipients = handler.broadcast(msg, 'tenant-1');
    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toBe('conn-1');
  });

  it('should format messages as JSON', () => {
    const msg = ShaarWebSocketHandler.createMessage('cost.updated', { total: 100 });
    const formatted = handler.formatMessage(msg);
    const parsed = JSON.parse(formatted);
    expect(parsed.type).toBe('cost.updated');
    expect(parsed.data.total).toBe(100);
  });

  it('should unsubscribe from specific events', () => {
    handler.connect('conn-1', 'tenant-1', 'user-1');
    handler.unsubscribe('conn-1', ['cost.updated', 'alert.triggered']);

    const costMsg = ShaarWebSocketHandler.createMessage('cost.updated', { total: 50 });
    const costRecipients = handler.broadcast(costMsg, 'tenant-1');
    expect(costRecipients).toHaveLength(0);

    // Should still receive agent state changes
    const agentMsg = ShaarWebSocketHandler.createMessage('agent.state.changed', { agentId: 'a-1' });
    const agentRecipients = handler.broadcast(agentMsg, 'tenant-1');
    expect(agentRecipients).toHaveLength(1);
  });

  it('should subscribe to additional events', () => {
    handler.connect('conn-1', 'tenant-1', 'user-1');
    // Unsubscribe from all, then subscribe to just one
    handler.unsubscribe('conn-1', ['agent.state.changed', 'cost.updated', 'alert.triggered', 'workflow.progress', 'system.health']);
    handler.subscribe('conn-1', ['system.health']);

    const healthMsg = ShaarWebSocketHandler.createMessage('system.health', { status: 'ok' });
    const recipients = handler.broadcast(healthMsg, 'tenant-1');
    expect(recipients).toHaveLength(1);

    const costMsg = ShaarWebSocketHandler.createMessage('cost.updated', { total: 50 });
    const costRecipients = handler.broadcast(costMsg, 'tenant-1');
    expect(costRecipients).toHaveLength(0);
  });

  it('should get connections by tenant', () => {
    handler.connect('conn-1', 'tenant-1', 'user-1');
    handler.connect('conn-2', 'tenant-1', 'user-2');
    handler.connect('conn-3', 'tenant-2', 'user-3');

    const tenant1Conns = handler.getConnectionsByTenant('tenant-1');
    expect(tenant1Conns).toHaveLength(2);

    const tenant2Conns = handler.getConnectionsByTenant('tenant-2');
    expect(tenant2Conns).toHaveLength(1);
  });

  it('should get a specific connection by ID', () => {
    handler.connect('conn-1', 'tenant-1', 'user-1');
    const conn = handler.getConnection('conn-1');
    expect(conn).toBeDefined();
    expect(conn!.tenantId).toBe('tenant-1');
    expect(conn!.userId).toBe('user-1');
  });
});

// ---------------------------------------------------------------------------
// WebSocket Handler Tests (with authentication)
// ---------------------------------------------------------------------------

describe('ShaarWebSocketHandler with AuthMiddleware', () => {
  let authService: CognitoAuthService;
  let authMiddleware: AuthMiddleware;
  let handler: ShaarWebSocketHandler;
  let validToken: string;

  beforeEach(async () => {
    authService = new CognitoAuthService();
    authMiddleware = new AuthMiddleware(authService);
    handler = new ShaarWebSocketHandler(authMiddleware);

    await authService.register('king@example.com', 'tenant-1', 'king');
    const loginResult = await authService.login('king@example.com');
    validToken = loginResult.token!.accessToken;
  });

  it('should accept authenticated WebSocket connection', async () => {
    const result = await handler.authenticateAndConnect('conn-1', validToken);
    expect(result.success).toBe(true);
    expect(result.connection).toBeDefined();
    expect(result.connection!.tenantId).toBe('tenant-1');
    expect(result.connection!.authenticated).toBe(true);
    expect(handler.getConnectionCount()).toBe(1);
  });

  it('should reject WebSocket connection with invalid token', async () => {
    const result = await handler.authenticateAndConnect('conn-1', 'invalid-token');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(handler.getConnectionCount()).toBe(0);
  });

  it('should reject WebSocket connection with no token', async () => {
    const result = await handler.authenticateAndConnect('conn-1');
    expect(result.success).toBe(false);
    expect(handler.getConnectionCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Command Router Tests
// ---------------------------------------------------------------------------

describe('CommandRouter', () => {
  let router: CommandRouter;

  beforeEach(() => {
    router = new CommandRouter();
  });

  it('should parse "list agents" command', () => {
    const cmd = router.parse({ source: 'dashboard', rawText: 'list agents', userId: 'u1', tenantId: 't1' });
    expect(cmd.action).toBe('list_agents');
  });

  it('should parse "status agent-1" command', () => {
    const cmd = router.parse({ source: 'api', rawText: 'status agent-1', userId: 'u1', tenantId: 't1' });
    expect(cmd.action).toBe('get_agent_status');
    expect(cmd.params.agentId).toBe('agent-1');
  });

  it('should parse "costs eretz" command', () => {
    const cmd = router.parse({ source: 'imessage', rawText: 'costs eretz', userId: 'u1', tenantId: 't1' });
    expect(cmd.action).toBe('get_costs');
    expect(cmd.params.pillar).toBe('eretz');
  });

  it('should produce same result regardless of source channel', () => {
    const result = router.verifyUniformSemantics('list agents', 'u1', 't1');
    expect(result).toBe(true);
  });

  it('should handle unknown commands gracefully', () => {
    const cmd = router.parse({ source: 'cli', rawText: 'do something weird', userId: 'u1', tenantId: 't1' });
    expect(cmd.action).toBe('do');
  });
});
