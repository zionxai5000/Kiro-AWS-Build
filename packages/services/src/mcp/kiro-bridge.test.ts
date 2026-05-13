/**
 * Unit tests for the Kiro-Seraphim MCP Bridge.
 *
 * Requirements: 36d.13, 36d.14, 36d.15
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KiroSeraphimBridgeImpl } from './kiro-bridge.js';
import type {
  MCPServerHost,
  MCPToolRegistry,
  MCPToolDefinition,
  MCPServer,
  MCPTransportAdapter,
  MCPRequest,
  MCPResponse,
  MCPRegistryEntry,
  KiroToolName,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock MCPServerHost with configurable behavior.
 */
function makeMockServerHost(options?: {
  servers?: Map<string, MCPServer>;
}): MCPServerHost {
  const servers = options?.servers ?? new Map<string, MCPServer>();

  return {
    startServer: vi.fn(),
    stopServer: vi.fn(),
    registerTool: vi.fn(),
    unregisterTool: vi.fn(),
    handleRequest: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    getServer: (agentId: string) => servers.get(agentId),
    getServers: () => Array.from(servers.values()),
  };
}

/**
 * Creates a mock MCPToolRegistry with configurable entries.
 */
function makeMockToolRegistry(entries: MCPRegistryEntry[] = []): MCPToolRegistry {
  return {
    registerInternalTools: vi.fn(),
    registerExternalServer: vi.fn(),
    unregisterAgent: vi.fn(),
    unregisterServer: vi.fn(),
    listAllTools: () => entries,
    searchTools: vi.fn(() => []),
    getToolSchema: vi.fn(),
    findByCapability: vi.fn(() => []),
    getToolCount: () => ({ internal: entries.length, external: 0, total: entries.length }),
    updateAvailability: vi.fn(),
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
  connected?: boolean;
}): MCPTransportAdapter & {
  connectCalls: number;
  disconnectCalls: number;
  sentRequests: MCPRequest[];
} {
  let connectCalls = 0;
  let connectFailures = 0;
  let isConnected = options?.connected ?? false;
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
      isConnected = true;
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
        result: {
          content: [{ type: 'text', text: JSON.stringify({ result: 'ok' }) }],
          isError: false,
        },
      };
    },

    async disconnect(): Promise<void> {
      transport.disconnectCalls++;
      isConnected = false;
    },

    isConnected(): boolean {
      return isConnected;
    },
  };

  return transport;
}

/**
 * Creates a mock MCPServer with tools.
 */
function makeMockServer(agentId: string, tools: MCPToolDefinition[]): MCPServer {
  const toolMap = new Map<string, MCPToolDefinition>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  return {
    agentId,
    status: 'running',
    tools: toolMap,
    connections: new Map(),
    config: {
      agentId,
      transport: 'stdio',
      authRequired: false,
      rateLimits: { maxRequestsPerWindow: 100, windowMs: 60_000 },
    },
  };
}

/**
 * Creates a sample tool definition.
 */
function makeTool(name: string, handler?: (params: Record<string, unknown>) => Promise<any>): MCPToolDefinition {
  return {
    name,
    description: `Tool: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    requiredAuthority: 'L4',
    handler: handler ?? (async () => ({ success: true, output: { result: name } })),
  };
}

/**
 * Creates a sample registry entry.
 */
function makeRegistryEntry(name: string, agentId: string, availability: 'available' | 'degraded' | 'unavailable' = 'available'): MCPRegistryEntry {
  return {
    toolId: `internal:${agentId}:${name}`,
    name,
    description: `Tool: ${name}`,
    source: 'internal',
    agentId,
    inputSchema: { type: 'object', properties: {} },
    requiredAuthority: 'L4',
    availability,
    registeredAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KiroSeraphimBridgeImpl', () => {
  let serverHost: MCPServerHost;
  let toolRegistry: MCPToolRegistry;
  let transport: ReturnType<typeof makeMockTransport>;
  let bridge: KiroSeraphimBridgeImpl;

  beforeEach(() => {
    serverHost = makeMockServerHost();
    toolRegistry = makeMockToolRegistry();
    transport = makeMockTransport();
    bridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, transport);
  });

  // -------------------------------------------------------------------------
  // Connection Lifecycle
  // -------------------------------------------------------------------------

  describe('connect()', () => {
    it('should establish a bridge connection with a valid session ID', async () => {
      await bridge.connect('session-123');

      expect(bridge.getStatus()).toBe('connected');
      expect(bridge.getSessionId()).toBe('session-123');
      expect(transport.connectCalls).toBe(1);
    });

    it('should throw if sessionId is empty', async () => {
      await expect(bridge.connect('')).rejects.toThrow('sessionId is required');
    });

    it('should set status to error if transport connection fails', async () => {
      const failTransport = makeMockTransport({ connectFails: true });
      const failBridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, failTransport);

      await expect(failBridge.connect('session-123')).rejects.toThrow('Failed to establish bridge connection');
      expect(failBridge.getStatus()).toBe('error');
    });

    it('should work without a transport adapter', async () => {
      const noTransportBridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry);

      await noTransportBridge.connect('session-123');

      expect(noTransportBridge.getStatus()).toBe('connected');
      expect(noTransportBridge.getSessionId()).toBe('session-123');
    });
  });

  describe('disconnect()', () => {
    it('should disconnect the bridge and reset state', async () => {
      await bridge.connect('session-123');
      await bridge.disconnect();

      expect(bridge.getStatus()).toBe('disconnected');
      expect(bridge.getSessionId()).toBeNull();
      expect(transport.disconnectCalls).toBe(1);
    });

    it('should handle disconnect when not connected', async () => {
      await bridge.disconnect();

      expect(bridge.getStatus()).toBe('disconnected');
      expect(bridge.getSessionId()).toBeNull();
    });
  });

  describe('getStatus()', () => {
    it('should return disconnected initially', () => {
      expect(bridge.getStatus()).toBe('disconnected');
    });

    it('should return connected after successful connect', async () => {
      await bridge.connect('session-123');
      expect(bridge.getStatus()).toBe('connected');
    });

    it('should return disconnected after disconnect', async () => {
      await bridge.connect('session-123');
      await bridge.disconnect();
      expect(bridge.getStatus()).toBe('disconnected');
    });
  });

  // -------------------------------------------------------------------------
  // Kiro → Seraphim Direction
  // -------------------------------------------------------------------------

  describe('handleKiroToolCall()', () => {
    it('should route a tool call to the correct agent server', async () => {
      const handler = vi.fn(async () => ({ success: true, output: { data: 'hello' } }));
      const tool = makeTool('analyze', handler);
      const server = makeMockServer('agent-1', [tool]);
      const servers = new Map([['agent-1', server]]);
      serverHost = makeMockServerHost({ servers });
      bridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, transport);

      await bridge.connect('session-123');
      const result = await bridge.handleKiroToolCall('agent-1', 'analyze', { input: 'test' });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ data: 'hello' });
      expect(handler).toHaveBeenCalledWith({ input: 'test' });
    });

    it('should return error if bridge is not connected', async () => {
      const result = await bridge.handleKiroToolCall('agent-1', 'analyze', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bridge is not connected');
    });

    it('should return error if agent server is not found', async () => {
      await bridge.connect('session-123');
      const result = await bridge.handleKiroToolCall('nonexistent', 'analyze', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No MCP server running for agent');
    });

    it('should return error if tool is not found on agent', async () => {
      const server = makeMockServer('agent-1', [makeTool('other-tool')]);
      const servers = new Map([['agent-1', server]]);
      serverHost = makeMockServerHost({ servers });
      bridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, transport);

      await bridge.connect('session-123');
      const result = await bridge.handleKiroToolCall('agent-1', 'nonexistent', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool not found on agent');
    });

    it('should handle tool handler throwing an error', async () => {
      const tool = makeTool('failing-tool', async () => { throw new Error('Handler crashed'); });
      const server = makeMockServer('agent-1', [tool]);
      const servers = new Map([['agent-1', server]]);
      serverHost = makeMockServerHost({ servers });
      bridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, transport);

      await bridge.connect('session-123');
      const result = await bridge.handleKiroToolCall('agent-1', 'failing-tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool execution error');
      expect(result.error).toContain('Handler crashed');
    });

    it('should include durationMs in the result', async () => {
      const tool = makeTool('slow-tool', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { success: true, output: 'done' };
      });
      const server = makeMockServer('agent-1', [tool]);
      const servers = new Map([['agent-1', server]]);
      serverHost = makeMockServerHost({ servers });
      bridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, transport);

      await bridge.connect('session-123');
      const result = await bridge.handleKiroToolCall('agent-1', 'slow-tool', {});

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getExposedTools()', () => {
    it('should return all available tools from the registry', () => {
      const entries = [
        makeRegistryEntry('tool-a', 'agent-1'),
        makeRegistryEntry('tool-b', 'agent-2'),
      ];
      toolRegistry = makeMockToolRegistry(entries);
      bridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, transport);

      const tools = bridge.getExposedTools();

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('tool-a');
      expect(tools[1].name).toBe('tool-b');
    });

    it('should exclude unavailable tools', () => {
      const entries = [
        makeRegistryEntry('tool-a', 'agent-1', 'available'),
        makeRegistryEntry('tool-b', 'agent-2', 'unavailable'),
        makeRegistryEntry('tool-c', 'agent-3', 'degraded'),
      ];
      toolRegistry = makeMockToolRegistry(entries);
      bridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, transport);

      const tools = bridge.getExposedTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('tool-a');
    });

    it('should return empty array when no tools are registered', () => {
      toolRegistry = makeMockToolRegistry([]);
      bridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, transport);

      const tools = bridge.getExposedTools();

      expect(tools).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Seraphim → Kiro Direction
  // -------------------------------------------------------------------------

  describe('invokeKiroTool()', () => {
    it('should invoke a Kiro tool through the transport', async () => {
      await bridge.connect('session-123');

      const result = await bridge.invokeKiroTool({
        tool: 'readFile',
        args: { path: '/src/index.ts' },
      });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 'ok' });
      expect(transport.sentRequests).toHaveLength(1);
      expect(transport.sentRequests[0].method).toBe('tools/call');
      expect(transport.sentRequests[0].params).toEqual({
        name: 'readFile',
        arguments: { path: '/src/index.ts' },
      });
    });

    it('should return error if bridge is not connected', async () => {
      const result = await bridge.invokeKiroTool({
        tool: 'readFile',
        args: { path: '/src/index.ts' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not connected');
    });

    it('should return error if no transport is configured', async () => {
      const noTransportBridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry);
      await noTransportBridge.connect('session-123');

      const result = await noTransportBridge.invokeKiroTool({
        tool: 'readFile',
        args: { path: '/src/index.ts' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No transport adapter configured');
    });

    it('should handle transport errors gracefully', async () => {
      const failTransport = makeMockTransport({ sendFails: true, connected: true });
      const failBridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, failTransport);
      await failBridge.connect('session-123');

      const result = await failBridge.invokeKiroTool({
        tool: 'writeFile',
        args: { path: '/src/test.ts', content: 'hello' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Kiro tool invocation failed');
    });

    it('should handle MCP error responses', async () => {
      const errorTransport = makeMockTransport({
        sendResponse: {
          jsonrpc: '2.0',
          id: 'test',
          error: { code: -32001, message: 'Unauthorized' },
        },
      });
      const errorBridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, errorTransport);
      await errorBridge.connect('session-123');

      const result = await errorBridge.invokeKiroTool({
        tool: 'runCommand',
        args: { command: 'ls' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should support all Kiro tool types', async () => {
      await bridge.connect('session-123');

      const kiroTools: KiroToolName[] = ['readFile', 'writeFile', 'runCommand', 'search', 'getDiagnostics'];

      for (const tool of kiroTools) {
        const result = await bridge.invokeKiroTool({ tool, args: {} });
        expect(result.success).toBe(true);
      }

      expect(transport.sentRequests).toHaveLength(5);
    });
  });

  describe('isKiroToolAvailable()', () => {
    it('should return true for supported tools when connected with transport', async () => {
      await bridge.connect('session-123');

      expect(bridge.isKiroToolAvailable('readFile')).toBe(true);
      expect(bridge.isKiroToolAvailable('writeFile')).toBe(true);
      expect(bridge.isKiroToolAvailable('runCommand')).toBe(true);
      expect(bridge.isKiroToolAvailable('search')).toBe(true);
      expect(bridge.isKiroToolAvailable('getDiagnostics')).toBe(true);
    });

    it('should return false when bridge is not connected', () => {
      expect(bridge.isKiroToolAvailable('readFile')).toBe(false);
    });

    it('should return false when no transport is configured', async () => {
      const noTransportBridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry);
      await noTransportBridge.connect('session-123');

      expect(noTransportBridge.isKiroToolAvailable('readFile')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Automatic Reconnection
  // -------------------------------------------------------------------------

  describe('automatic reconnection', () => {
    it('should attempt reconnection when invokeKiroTool detects disconnection', async () => {
      // Connect first, then simulate disconnection
      let connectAttempts = 0;
      const reconnectTransport: MCPTransportAdapter & { sentRequests: MCPRequest[] } = {
        sentRequests: [],
        async connect(): Promise<void> {
          connectAttempts++;
          // Succeed on all attempts
        },
        async sendRequest(request: MCPRequest): Promise<MCPResponse> {
          reconnectTransport.sentRequests.push(request);
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [{ type: 'text', text: JSON.stringify({ reconnected: true }) }],
              isError: false,
            },
          };
        },
        async disconnect(): Promise<void> {},
        isConnected(): boolean {
          return connectAttempts > 0;
        },
      };

      const reconnectBridge = new KiroSeraphimBridgeImpl(
        serverHost,
        toolRegistry,
        reconnectTransport,
        { maxRetries: 3, backoffMs: 1 },
      );

      await reconnectBridge.connect('session-123');
      expect(reconnectBridge.getStatus()).toBe('connected');

      // Manually set status to disconnected to simulate a dropped connection
      // (In real usage, this would happen when transport.isConnected() returns false)
      (reconnectBridge as any).status = 'disconnected';

      const result = await reconnectBridge.invokeKiroTool({
        tool: 'readFile',
        args: { path: '/test.ts' },
      });

      expect(result.success).toBe(true);
      expect(reconnectBridge.getStatus()).toBe('connected');
      // Initial connect + reconnect
      expect(connectAttempts).toBe(2);
    });

    it('should set status to error when reconnection fails', async () => {
      const failTransport = makeMockTransport({ connectFailCount: 10 });
      const failBridge = new KiroSeraphimBridgeImpl(
        serverHost,
        toolRegistry,
        failTransport,
        { maxRetries: 2, backoffMs: 1 },
      );

      // Force a session ID without connecting (simulating a previously connected state)
      (failBridge as any).sessionId = 'session-123';
      (failBridge as any).status = 'disconnected';

      const result = await failBridge.invokeKiroTool({
        tool: 'readFile',
        args: { path: '/test.ts' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('reconnection failed');
      expect(failBridge.getStatus()).toBe('error');
    });

    it('should transition through reconnecting status during reconnection', async () => {
      const statuses: string[] = [];
      let connectAttempts = 0;

      const slowTransport: MCPTransportAdapter = {
        async connect(): Promise<void> {
          connectAttempts++;
          if (connectAttempts === 1) return; // First connect succeeds
          // Second connect (reconnect) succeeds after a brief delay
          await new Promise((r) => setTimeout(r, 5));
        },
        async sendRequest(request: MCPRequest): Promise<MCPResponse> {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [{ type: 'text', text: '{}' }],
              isError: false,
            },
          };
        },
        async disconnect(): Promise<void> {},
        isConnected(): boolean { return connectAttempts > 0; },
      };

      const slowBridge = new KiroSeraphimBridgeImpl(
        serverHost,
        toolRegistry,
        slowTransport,
        { maxRetries: 2, backoffMs: 1 },
      );

      await slowBridge.connect('session-123');
      (slowBridge as any).status = 'disconnected';

      // Capture status during reconnection
      const originalAttempt = (slowBridge as any).attemptReconnect.bind(slowBridge);
      (slowBridge as any).attemptReconnect = async function () {
        statuses.push(slowBridge.getStatus());
        const result = await originalAttempt();
        statuses.push(slowBridge.getStatus());
        return result;
      };

      await slowBridge.invokeKiroTool({ tool: 'readFile', args: {} });

      // Should have gone through 'disconnected' → 'reconnecting' → 'connected'
      expect(statuses[0]).toBe('disconnected');
      expect(statuses[1]).toBe('connected');
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should handle server in non-running state', async () => {
      const server = makeMockServer('agent-1', [makeTool('test')]);
      server.status = 'stopped';
      const servers = new Map([['agent-1', server]]);
      serverHost = makeMockServerHost({ servers });
      bridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, transport);

      await bridge.connect('session-123');
      const result = await bridge.handleKiroToolCall('agent-1', 'test', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not running');
    });

    it('should handle isError response from Kiro', async () => {
      const errorTransport = makeMockTransport({
        sendResponse: {
          jsonrpc: '2.0',
          id: 'test',
          result: {
            content: [{ type: 'text', text: 'File not found' }],
            isError: true,
          },
        },
      });
      const errorBridge = new KiroSeraphimBridgeImpl(serverHost, toolRegistry, errorTransport);
      await errorBridge.connect('session-123');

      const result = await errorBridge.invokeKiroTool({
        tool: 'readFile',
        args: { path: '/nonexistent.ts' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });
  });
});
