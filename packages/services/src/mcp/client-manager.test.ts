/**
 * Unit tests for the MCP Client Manager.
 *
 * Requirements: 36b.6, 36b.7, 36b.8, 36b.9
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPClientManagerImpl } from './client-manager.js';
import type {
  MCPClientConfig,
  MCPTransportAdapter,
  MCPRequest,
  MCPResponse,
  MCPCostTracker,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<MCPClientConfig> = {}): MCPClientConfig {
  return {
    serverUrl: 'https://mcp.example.com',
    transport: 'sse',
    timeout: 5000,
    retryPolicy: { maxRetries: 2, backoffMs: 10 },
    ...overrides,
  };
}

/**
 * Creates a mock transport adapter with configurable behavior.
 */
function makeMockTransport(options?: {
  connectFails?: boolean;
  connectFailCount?: number;
  sendResponse?: MCPResponse | ((req: MCPRequest) => MCPResponse);
  sendFails?: boolean;
}): MCPTransportAdapter & {
  connectCalls: number;
  disconnectCalls: number;
  sentRequests: MCPRequest[];
} {
  let connectCalls = 0;
  let connectFailures = 0;
  const maxConnectFailures = options?.connectFailCount ?? (options?.connectFails ? Infinity : 0);

  const transport = {
    connectCalls: 0,
    disconnectCalls: 0,
    sentRequests: [] as MCPRequest[],

    async connect(_serverUrl: string, _authToken?: string): Promise<void> {
      connectCalls++;
      transport.connectCalls = connectCalls;
      if (connectFailures < maxConnectFailures) {
        connectFailures++;
        throw new Error('Connection refused');
      }
    },

    async sendRequest(request: MCPRequest): Promise<MCPResponse> {
      transport.sentRequests.push(request);
      if (options?.sendFails) {
        throw new Error('Transport error');
      }
      if (options?.sendResponse) {
        if (typeof options.sendResponse === 'function') {
          return options.sendResponse(request);
        }
        return options.sendResponse;
      }
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: { tools: [] },
      };
    },

    async disconnect(): Promise<void> {
      transport.disconnectCalls++;
    },

    isConnected(): boolean {
      return connectCalls > 0 && connectFailures < maxConnectFailures;
    },
  };

  return transport;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCPClientManagerImpl', () => {
  let manager: MCPClientManagerImpl;
  let mockTransport: ReturnType<typeof makeMockTransport>;

  beforeEach(() => {
    mockTransport = makeMockTransport();
    manager = new MCPClientManagerImpl({
      transportFactory: () => mockTransport,
    });
  });

  // -------------------------------------------------------------------------
  // Connection Establishment
  // -------------------------------------------------------------------------

  describe('connect', () => {
    it('should establish a connection to an external server', async () => {
      const conn = await manager.connect('https://mcp.example.com', makeConfig());

      expect(conn.id).toBeDefined();
      expect(conn.serverUrl).toBe('https://mcp.example.com');
      expect(conn.status).toBe('connected');
      expect(conn.connectedAt).toBeInstanceOf(Date);
      expect(conn.errorCount).toBe(0);
    });

    it('should retry on connection failure with exponential backoff', async () => {
      // Fails first 2 times, succeeds on 3rd
      const failingTransport = makeMockTransport({ connectFailCount: 2 });
      const retryManager = new MCPClientManagerImpl({
        transportFactory: () => failingTransport,
      });

      const conn = await retryManager.connect(
        'https://mcp.example.com',
        makeConfig({ retryPolicy: { maxRetries: 3, backoffMs: 1 } }),
      );

      expect(conn.status).toBe('connected');
      expect(failingTransport.connectCalls).toBe(3); // 2 failures + 1 success
    });

    it('should throw after exhausting all retry attempts', async () => {
      const alwaysFailTransport = makeMockTransport({ connectFails: true });
      const failManager = new MCPClientManagerImpl({
        transportFactory: () => alwaysFailTransport,
      });

      await expect(
        failManager.connect(
          'https://mcp.example.com',
          makeConfig({ retryPolicy: { maxRetries: 2, backoffMs: 1 } }),
        ),
      ).rejects.toThrow(/Failed to connect.*after 3 attempts/);
    });

    it('should track multiple connections', async () => {
      await manager.connect('https://server-1.com', makeConfig({ serverUrl: 'https://server-1.com' }));
      await manager.connect('https://server-2.com', makeConfig({ serverUrl: 'https://server-2.com' }));

      const connections = manager.getConnections();
      expect(connections).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Disconnection and Reconnection
  // -------------------------------------------------------------------------

  describe('disconnect', () => {
    it('should disconnect from a server', async () => {
      const conn = await manager.connect('https://mcp.example.com', makeConfig());
      await manager.disconnect(conn.id);

      expect(manager.getConnections()).toHaveLength(0);
      expect(manager.getConnectionHealth(conn.id)).toBeUndefined();
    });

    it('should throw when disconnecting unknown connection', async () => {
      await expect(manager.disconnect('unknown-id')).rejects.toThrow('Connection not found');
    });
  });

  describe('reconnect', () => {
    it('should reconnect an existing connection', async () => {
      const conn = await manager.connect('https://mcp.example.com', makeConfig());
      await manager.reconnect(conn.id);

      const health = manager.getConnectionHealth(conn.id);
      expect(health?.status).toBe('connected');
      expect(health?.errorCount).toBe(0);
    });

    it('should throw when reconnecting unknown connection', async () => {
      await expect(manager.reconnect('unknown-id')).rejects.toThrow('Connection not found');
    });

    it('should set status to error when reconnection fails', async () => {
      const conn = await manager.connect('https://mcp.example.com', makeConfig());

      // Make transport fail on reconnect
      const failTransport = makeMockTransport({ connectFails: true });
      const failManager = new MCPClientManagerImpl({
        transportFactory: () => failTransport,
      });
      // Connect first (will fail), so we test via the main manager
      // Instead, we'll manipulate the existing connection's transport behavior
      // by creating a manager with a transport that fails after initial connect
      let callCount = 0;
      const conditionalTransport = makeMockTransport({
        sendResponse: { jsonrpc: '2.0', id: '1', result: {} },
      });
      // Override connect to fail after first call
      const originalConnect = conditionalTransport.connect.bind(conditionalTransport);
      conditionalTransport.connect = async (url: string, token?: string) => {
        callCount++;
        if (callCount > 1) {
          throw new Error('Connection refused');
        }
        return originalConnect(url, token);
      };

      const mgr = new MCPClientManagerImpl({
        transportFactory: () => conditionalTransport,
      });

      const c = await mgr.connect('https://mcp.example.com', makeConfig({ retryPolicy: { maxRetries: 1, backoffMs: 1 } }));

      await expect(mgr.reconnect(c.id)).rejects.toThrow(/Failed to reconnect/);

      const health = mgr.getConnectionHealth(c.id);
      expect(health?.status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // Tool Discovery
  // -------------------------------------------------------------------------

  describe('discoverTools', () => {
    it('should discover tools from a connected server', async () => {
      const toolsResponse: MCPResponse = {
        jsonrpc: '2.0',
        id: '1',
        result: {
          tools: [
            {
              name: 'file-read',
              description: 'Read a file from disk',
              inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
            },
            {
              name: 'file-write',
              description: 'Write content to a file',
              inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
            },
          ],
        },
      };

      const transport = makeMockTransport({ sendResponse: toolsResponse });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      const tools = await mgr.discoverTools(conn.id);

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('file-read');
      expect(tools[1].name).toBe('file-write');
      expect(tools[0].description).toBe('Read a file from disk');
    });

    it('should cache discovered tools', async () => {
      const transport = makeMockTransport({
        sendResponse: {
          jsonrpc: '2.0',
          id: '1',
          result: { tools: [{ name: 'cached-tool', description: 'A tool', inputSchema: {} }] },
        },
      });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      await mgr.discoverTools(conn.id);
      await mgr.discoverTools(conn.id);

      // Should only send one request (cached on second call)
      expect(transport.sentRequests).toHaveLength(1);
    });

    it('should throw when discovering tools on unknown connection', async () => {
      await expect(manager.discoverTools('unknown-id')).rejects.toThrow('Connection not found');
    });

    it('should throw when server returns an error', async () => {
      const transport = makeMockTransport({
        sendResponse: {
          jsonrpc: '2.0',
          id: '1',
          error: { code: -32603, message: 'Internal server error' },
        },
      });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      await expect(mgr.discoverTools(conn.id)).rejects.toThrow('Tool discovery failed');
    });
  });

  // -------------------------------------------------------------------------
  // Tool Invocation
  // -------------------------------------------------------------------------

  describe('invokeTool', () => {
    it('should invoke a tool and return the result', async () => {
      const transport = makeMockTransport({
        sendResponse: (req: MCPRequest) => {
          if (req.method === 'tools/call') {
            return {
              jsonrpc: '2.0',
              id: req.id,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ data: 'hello' }) }],
                isError: false,
              },
            };
          }
          return { jsonrpc: '2.0', id: req.id, result: { tools: [] } };
        },
      });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      const result = await mgr.invokeTool(conn.id, 'greet', { name: 'world' });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ data: 'hello' });
      expect(result.durationMs).toBeDefined();
    });

    it('should return failure when tool execution returns isError', async () => {
      const transport = makeMockTransport({
        sendResponse: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            content: [{ type: 'text', text: 'Something went wrong' }],
            isError: true,
          },
        },
      });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      const result = await mgr.invokeTool(conn.id, 'fail-tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
    });

    it('should return failure when server returns error response', async () => {
      const transport = makeMockTransport({
        sendResponse: {
          jsonrpc: '2.0',
          id: '1',
          error: { code: -32004, message: 'Tool execution error' },
        },
      });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      const result = await mgr.invokeTool(conn.id, 'broken-tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool execution error');
    });

    it('should handle transport errors gracefully', async () => {
      const transport = makeMockTransport({ sendFails: true });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      const result = await mgr.invokeTool(conn.id, 'any-tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transport error');
    });

    it('should enforce timeout on tool invocations', async () => {
      vi.useFakeTimers();

      const transport = makeMockTransport();
      // Override sendRequest to never resolve
      transport.sendRequest = () => new Promise(() => {});

      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig({ timeout: 100 }));

      const resultPromise = mgr.invokeTool(conn.id, 'slow-tool', {});

      vi.advanceTimersByTime(150);

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');

      vi.useRealTimers();
    });

    it('should call cost tracker on successful invocation', async () => {
      const costTracker: MCPCostTracker = vi.fn();
      const transport = makeMockTransport({
        sendResponse: (req: MCPRequest) => {
          if (req.method === 'tools/list') {
            return {
              jsonrpc: '2.0',
              id: req.id,
              result: {
                tools: [{ name: 'paid-tool', description: 'Costs money', inputSchema: {}, costEstimate: 0.05 }],
              },
            };
          }
          return {
            jsonrpc: '2.0',
            id: req.id,
            result: {
              content: [{ type: 'text', text: '"ok"' }],
              isError: false,
            },
          };
        },
      });

      const mgr = new MCPClientManagerImpl({
        transportFactory: () => transport,
        costTracker,
      });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      // Discover tools first so cost estimate is cached
      await mgr.discoverTools(conn.id);
      await mgr.invokeTool(conn.id, 'paid-tool', {});

      expect(costTracker).toHaveBeenCalledWith(
        conn.id,
        'paid-tool',
        expect.any(Number),
        0.05,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Circuit Breaker
  // -------------------------------------------------------------------------

  describe('circuit breaker', () => {
    it('should open circuit after 5 consecutive failures', async () => {
      const transport = makeMockTransport({ sendFails: true });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      // Trigger 5 failures
      for (let i = 0; i < 5; i++) {
        await mgr.invokeTool(conn.id, 'failing-tool', {});
      }

      // 6th call should be blocked by circuit breaker
      const result = await mgr.invokeTool(conn.id, 'failing-tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Circuit breaker open');
    });

    it('should transition to half-open after reset timeout', async () => {
      vi.useFakeTimers();

      const transport = makeMockTransport({ sendFails: true });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      // Trigger 5 failures to open circuit
      for (let i = 0; i < 5; i++) {
        await mgr.invokeTool(conn.id, 'failing-tool', {});
      }

      // Circuit is open
      const blocked = await mgr.invokeTool(conn.id, 'failing-tool', {});
      expect(blocked.error).toContain('Circuit breaker open');

      // Advance past reset timeout (60s)
      vi.advanceTimersByTime(61_000);

      // Should allow one request through (half-open)
      const halfOpen = await mgr.invokeTool(conn.id, 'failing-tool', {});
      // It will fail (transport still fails) but it was allowed through
      expect(halfOpen.error).toBe('Transport error');

      vi.useRealTimers();
    });

    it('should close circuit on successful request after half-open', async () => {
      vi.useFakeTimers();

      let shouldFail = true;
      const transport = makeMockTransport();
      transport.sendRequest = async (req: MCPRequest) => {
        if (shouldFail) {
          throw new Error('Transport error');
        }
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: { content: [{ type: 'text', text: '"ok"' }], isError: false },
        };
      };

      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      // Trigger 5 failures
      for (let i = 0; i < 5; i++) {
        await mgr.invokeTool(conn.id, 'tool', {});
      }

      // Advance past reset timeout
      vi.advanceTimersByTime(61_000);

      // Fix the transport
      shouldFail = false;

      // Half-open request should succeed and close the circuit
      const result = await mgr.invokeTool(conn.id, 'tool', {});
      expect(result.success).toBe(true);

      // Subsequent requests should work normally
      const next = await mgr.invokeTool(conn.id, 'tool', {});
      expect(next.success).toBe(true);

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Capability Search
  // -------------------------------------------------------------------------

  describe('findToolByCapability', () => {
    it('should find tools matching a capability description', async () => {
      const transport = makeMockTransport({
        sendResponse: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            tools: [
              { name: 'file-read', description: 'Read contents of a file from the filesystem', inputSchema: {} },
              { name: 'file-write', description: 'Write content to a file on disk', inputSchema: {} },
              { name: 'http-get', description: 'Make an HTTP GET request to a URL', inputSchema: {} },
            ],
          },
        },
      });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());
      await mgr.discoverTools(conn.id);

      const matches = await mgr.findToolByCapability('read file contents');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].tool.name).toBe('file-read');
      expect(matches[0].relevanceScore).toBeGreaterThan(0);
      expect(matches[0].connectionId).toBe(conn.id);
      expect(matches[0].serverUrl).toBe('https://mcp.example.com');
    });

    it('should return empty array for no matches', async () => {
      const transport = makeMockTransport({
        sendResponse: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            tools: [
              { name: 'calculator', description: 'Perform arithmetic calculations', inputSchema: {} },
            ],
          },
        },
      });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());
      await mgr.discoverTools(conn.id);

      const matches = await mgr.findToolByCapability('deploy kubernetes cluster');

      expect(matches).toHaveLength(0);
    });

    it('should sort results by relevance score descending', async () => {
      const transport = makeMockTransport({
        sendResponse: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            tools: [
              { name: 'http-get', description: 'Make HTTP GET request', inputSchema: {} },
              { name: 'http-post', description: 'Make HTTP POST request with body', inputSchema: {} },
              { name: 'file-read', description: 'Read a file', inputSchema: {} },
            ],
          },
        },
      });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());
      await mgr.discoverTools(conn.id);

      const matches = await mgr.findToolByCapability('HTTP request');

      expect(matches.length).toBeGreaterThanOrEqual(2);
      // Both HTTP tools should rank higher than file-read
      const httpTools = matches.filter((m) => m.tool.name.startsWith('http'));
      expect(httpTools.length).toBe(2);
      for (let i = 0; i < matches.length - 1; i++) {
        expect(matches[i].relevanceScore).toBeGreaterThanOrEqual(matches[i + 1].relevanceScore);
      }
    });

    it('should return empty for empty description', async () => {
      const matches = await manager.findToolByCapability('');
      expect(matches).toHaveLength(0);
    });

    it('should search across multiple connections', async () => {
      const transport1 = makeMockTransport({
        sendResponse: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            tools: [{ name: 'db-query', description: 'Query a database', inputSchema: {} }],
          },
        },
      });
      const transport2 = makeMockTransport({
        sendResponse: {
          jsonrpc: '2.0',
          id: '1',
          result: {
            tools: [{ name: 'db-migrate', description: 'Run database migrations', inputSchema: {} }],
          },
        },
      });

      let callCount = 0;
      const mgr = new MCPClientManagerImpl({
        transportFactory: () => {
          callCount++;
          return callCount === 1 ? transport1 : transport2;
        },
      });

      const conn1 = await mgr.connect('https://server-1.com', makeConfig());
      const conn2 = await mgr.connect('https://server-2.com', makeConfig());
      await mgr.discoverTools(conn1.id);
      await mgr.discoverTools(conn2.id);

      const matches = await mgr.findToolByCapability('database');

      expect(matches).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Connection Health
  // -------------------------------------------------------------------------

  describe('getConnectionHealth', () => {
    it('should return connection health for existing connection', async () => {
      const conn = await manager.connect('https://mcp.example.com', makeConfig());

      const health = manager.getConnectionHealth(conn.id);

      expect(health).toBeDefined();
      expect(health!.status).toBe('connected');
      expect(health!.serverUrl).toBe('https://mcp.example.com');
      expect(health!.errorCount).toBe(0);
    });

    it('should return undefined for unknown connection', () => {
      const health = manager.getConnectionHealth('unknown-id');
      expect(health).toBeUndefined();
    });

    it('should reflect error count after failures', async () => {
      const transport = makeMockTransport({ sendFails: true });
      const mgr = new MCPClientManagerImpl({ transportFactory: () => transport });
      const conn = await mgr.connect('https://mcp.example.com', makeConfig());

      await mgr.invokeTool(conn.id, 'tool', {});
      await mgr.invokeTool(conn.id, 'tool', {});

      const health = mgr.getConnectionHealth(conn.id);
      expect(health!.errorCount).toBe(2);
    });
  });

  describe('getConnections', () => {
    it('should return all active connections', async () => {
      await manager.connect('https://server-1.com', makeConfig());
      await manager.connect('https://server-2.com', makeConfig());

      const connections = manager.getConnections();
      expect(connections).toHaveLength(2);
    });

    it('should return empty array when no connections', () => {
      expect(manager.getConnections()).toHaveLength(0);
    });
  });
});
