/**
 * Unit tests for the MCP Server Host.
 *
 * Requirements: 36a.1, 36a.2, 36a.3, 36a.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPServerHostImpl } from './server-host.js';
import type {
  MCPServerConfig,
  MCPToolDefinition,
  MCPRequest,
  MCPAuthValidator,
} from './types.js';
import { MCP_ERROR_CODES } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(agentId = 'agent-1', overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    agentId,
    transport: 'stdio',
    authRequired: false,
    rateLimits: {
      maxRequestsPerWindow: 100,
      windowMs: 60_000,
    },
    ...overrides,
  };
}

function makeTool(name = 'test-tool', overrides: Partial<MCPToolDefinition> = {}): MCPToolDefinition {
  return {
    name,
    description: `A test tool: ${name}`,
    inputSchema: {
      type: 'object',
      properties: { input: { type: 'string' } },
    },
    requiredAuthority: 'L4',
    handler: async (params) => ({
      success: true,
      output: { echo: params },
    }),
    ...overrides,
  };
}

function makeRequest(method: string, params?: Record<string, unknown>, id: string | number = 1): MCPRequest {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCPServerHostImpl', () => {
  let host: MCPServerHostImpl;

  beforeEach(() => {
    host = new MCPServerHostImpl();
  });

  // -------------------------------------------------------------------------
  // Server Lifecycle
  // -------------------------------------------------------------------------

  describe('startServer / stopServer', () => {
    it('should start a server for an agent', async () => {
      await host.startServer(makeConfig('agent-1'));

      const server = host.getServer('agent-1');
      expect(server).toBeDefined();
      expect(server!.status).toBe('running');
      expect(server!.agentId).toBe('agent-1');
    });

    it('should throw if server already running for agent', async () => {
      await host.startServer(makeConfig('agent-1'));
      await expect(host.startServer(makeConfig('agent-1'))).rejects.toThrow(
        'MCP server already running for agent: agent-1',
      );
    });

    it('should stop a running server', async () => {
      await host.startServer(makeConfig('agent-1'));
      await host.stopServer('agent-1');

      expect(host.getServer('agent-1')).toBeUndefined();
    });

    it('should throw if stopping a non-existent server', async () => {
      await expect(host.stopServer('agent-1')).rejects.toThrow(
        'No MCP server running for agent: agent-1',
      );
    });

    it('should clean up connections when stopping', async () => {
      await host.startServer(makeConfig('agent-1'));
      await host.connect('agent-1', 'conn-1');

      await host.stopServer('agent-1');

      // Connection should be cleaned up — handleRequest should fail
      const response = await host.handleRequest('conn-1', makeRequest('ping'));
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(MCP_ERROR_CODES.UNAUTHORIZED);
    });

    it('should list all active servers', async () => {
      await host.startServer(makeConfig('agent-1'));
      await host.startServer(makeConfig('agent-2'));

      const servers = host.getServers();
      expect(servers).toHaveLength(2);
      expect(servers.map((s) => s.agentId).sort()).toEqual(['agent-1', 'agent-2']);
    });
  });

  // -------------------------------------------------------------------------
  // Tool Registration
  // -------------------------------------------------------------------------

  describe('registerTool / unregisterTool', () => {
    beforeEach(async () => {
      await host.startServer(makeConfig('agent-1'));
    });

    it('should register a tool on an agent server', () => {
      host.registerTool('agent-1', makeTool('my-tool'));

      const server = host.getServer('agent-1');
      expect(server!.tools.has('my-tool')).toBe(true);
    });

    it('should throw if registering duplicate tool name', () => {
      host.registerTool('agent-1', makeTool('my-tool'));
      expect(() => host.registerTool('agent-1', makeTool('my-tool'))).toThrow(
        'Tool already registered: my-tool',
      );
    });

    it('should throw if no server running for agent', () => {
      expect(() => host.registerTool('no-agent', makeTool())).toThrow(
        'No MCP server running for agent: no-agent',
      );
    });

    it('should unregister a tool', () => {
      host.registerTool('agent-1', makeTool('my-tool'));
      host.unregisterTool('agent-1', 'my-tool');

      const server = host.getServer('agent-1');
      expect(server!.tools.has('my-tool')).toBe(false);
    });

    it('should throw if unregistering non-existent tool', () => {
      expect(() => host.unregisterTool('agent-1', 'no-tool')).toThrow(
        'Tool not registered: no-tool',
      );
    });

    it('should expose registered tools via tools/list', async () => {
      host.registerTool('agent-1', makeTool('tool-a'));
      host.registerTool('agent-1', makeTool('tool-b'));

      await host.connect('agent-1', 'conn-1');
      const response = await host.handleRequest('conn-1', makeRequest('tools/list'));

      expect(response.error).toBeUndefined();
      const result = response.result as { tools: Array<{ name: string }> };
      expect(result.tools).toHaveLength(2);
      expect(result.tools.map((t) => t.name).sort()).toEqual(['tool-a', 'tool-b']);
    });

    it('should not expose unregistered tools via tools/list', async () => {
      host.registerTool('agent-1', makeTool('tool-a'));
      host.registerTool('agent-1', makeTool('tool-b'));
      host.unregisterTool('agent-1', 'tool-a');

      await host.connect('agent-1', 'conn-1');
      const response = await host.handleRequest('conn-1', makeRequest('tools/list'));

      const result = response.result as { tools: Array<{ name: string }> };
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('tool-b');
    });
  });

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  describe('authentication', () => {
    it('should reject connection when auth fails', async () => {
      const rejectAll: MCPAuthValidator = async () => false;
      const secureHost = new MCPServerHostImpl(rejectAll);

      await secureHost.startServer(makeConfig('agent-1', { authRequired: true }));
      const response = await secureHost.connect('agent-1', 'conn-1', 'bad-token');

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(MCP_ERROR_CODES.UNAUTHORIZED);
    });

    it('should accept connection when auth succeeds', async () => {
      const acceptAll: MCPAuthValidator = async () => true;
      const secureHost = new MCPServerHostImpl(acceptAll);

      await secureHost.startServer(makeConfig('agent-1', { authRequired: true }));
      const response = await secureHost.connect('agent-1', 'conn-1', 'good-token');

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
    });

    it('should skip auth when authRequired is false', async () => {
      const rejectAll: MCPAuthValidator = async () => false;
      const noAuthHost = new MCPServerHostImpl(rejectAll);

      await noAuthHost.startServer(makeConfig('agent-1', { authRequired: false }));
      const response = await noAuthHost.connect('agent-1', 'conn-1');

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
    });

    it('should reject requests from unconnected clients', async () => {
      await host.startServer(makeConfig('agent-1'));

      const response = await host.handleRequest('unknown-conn', makeRequest('ping'));
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(MCP_ERROR_CODES.UNAUTHORIZED);
    });
  });

  // -------------------------------------------------------------------------
  // Rate Limiting
  // -------------------------------------------------------------------------

  describe('rate limiting', () => {
    it('should block requests exceeding rate limit', async () => {
      await host.startServer(
        makeConfig('agent-1', {
          rateLimits: { maxRequestsPerWindow: 3, windowMs: 60_000 },
        }),
      );
      await host.connect('agent-1', 'conn-1');

      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        const res = await host.handleRequest('conn-1', makeRequest('ping', undefined, i));
        expect(res.error).toBeUndefined();
      }

      // 4th request should be rate limited
      const res = await host.handleRequest('conn-1', makeRequest('ping', undefined, 4));
      expect(res.error).toBeDefined();
      expect(res.error!.code).toBe(MCP_ERROR_CODES.RATE_LIMITED);
    });

    it('should allow requests after window expires', async () => {
      vi.useFakeTimers();

      await host.startServer(
        makeConfig('agent-1', {
          rateLimits: { maxRequestsPerWindow: 2, windowMs: 1000 },
        }),
      );
      await host.connect('agent-1', 'conn-1');

      // Use up the limit
      await host.handleRequest('conn-1', makeRequest('ping', undefined, 1));
      await host.handleRequest('conn-1', makeRequest('ping', undefined, 2));

      // Should be rate limited
      const limited = await host.handleRequest('conn-1', makeRequest('ping', undefined, 3));
      expect(limited.error!.code).toBe(MCP_ERROR_CODES.RATE_LIMITED);

      // Advance time past the window
      vi.advanceTimersByTime(1100);

      // Should succeed now
      const allowed = await host.handleRequest('conn-1', makeRequest('ping', undefined, 4));
      expect(allowed.error).toBeUndefined();

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Protocol Handlers
  // -------------------------------------------------------------------------

  describe('protocol handlers', () => {
    beforeEach(async () => {
      await host.startServer(makeConfig('agent-1'));
      await host.connect('agent-1', 'conn-1');
    });

    describe('initialize', () => {
      it('should return server info and capabilities', async () => {
        const response = await host.handleRequest('conn-1', makeRequest('initialize'));

        expect(response.error).toBeUndefined();
        const result = response.result as Record<string, unknown>;
        expect(result.protocolVersion).toBe('2024-11-05');
        expect(result.serverInfo).toEqual({
          name: 'seraphim-agent-1',
          version: '1.0.0',
        });
        expect(result.capabilities).toEqual({
          tools: { listChanged: true },
        });
      });
    });

    describe('ping', () => {
      it('should return pong', async () => {
        const response = await host.handleRequest('conn-1', makeRequest('ping'));

        expect(response.error).toBeUndefined();
        expect(response.result).toEqual({ status: 'pong' });
      });
    });

    describe('tools/list', () => {
      it('should return empty list when no tools registered', async () => {
        const response = await host.handleRequest('conn-1', makeRequest('tools/list'));

        expect(response.error).toBeUndefined();
        const result = response.result as { tools: unknown[] };
        expect(result.tools).toEqual([]);
      });

      it('should return all registered tools with schemas', async () => {
        host.registerTool('agent-1', makeTool('get-status'));
        host.registerTool('agent-1', makeTool('run-task'));

        const response = await host.handleRequest('conn-1', makeRequest('tools/list'));

        const result = response.result as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
        expect(result.tools).toHaveLength(2);

        const statusTool = result.tools.find((t) => t.name === 'get-status');
        expect(statusTool).toBeDefined();
        expect(statusTool!.description).toBe('A test tool: get-status');
        expect(statusTool!.inputSchema).toEqual({
          type: 'object',
          properties: { input: { type: 'string' } },
        });
      });
    });

    describe('tools/call', () => {
      it('should invoke tool handler and return result', async () => {
        const handler = vi.fn().mockResolvedValue({
          success: true,
          output: { result: 'hello' },
        });
        host.registerTool('agent-1', makeTool('greet', { handler }));

        const response = await host.handleRequest(
          'conn-1',
          makeRequest('tools/call', { name: 'greet', arguments: { name: 'world' } }),
        );

        expect(response.error).toBeUndefined();
        expect(handler).toHaveBeenCalledWith({ name: 'world' });

        const result = response.result as { content: Array<{ type: string; text: string }>; isError: boolean };
        expect(result.isError).toBe(false);
        expect(JSON.parse(result.content[0].text)).toEqual({ result: 'hello' });
      });

      it('should return error content when tool fails gracefully', async () => {
        const handler = vi.fn().mockResolvedValue({
          success: false,
          error: 'Something went wrong',
        });
        host.registerTool('agent-1', makeTool('fail-tool', { handler }));

        const response = await host.handleRequest(
          'conn-1',
          makeRequest('tools/call', { name: 'fail-tool', arguments: {} }),
        );

        expect(response.error).toBeUndefined();
        const result = response.result as { content: Array<{ text: string }>; isError: boolean };
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Something went wrong');
      });

      it('should return error response when tool throws', async () => {
        const handler = vi.fn().mockRejectedValue(new Error('Unexpected crash'));
        host.registerTool('agent-1', makeTool('crash-tool', { handler }));

        const response = await host.handleRequest(
          'conn-1',
          makeRequest('tools/call', { name: 'crash-tool', arguments: {} }),
        );

        expect(response.error).toBeDefined();
        expect(response.error!.code).toBe(MCP_ERROR_CODES.TOOL_EXECUTION_ERROR);
        expect(response.error!.message).toContain('Unexpected crash');
      });

      it('should return error for non-existent tool', async () => {
        const response = await host.handleRequest(
          'conn-1',
          makeRequest('tools/call', { name: 'no-such-tool', arguments: {} }),
        );

        expect(response.error).toBeDefined();
        expect(response.error!.code).toBe(MCP_ERROR_CODES.TOOL_NOT_FOUND);
      });

      it('should return error when name param is missing', async () => {
        const response = await host.handleRequest(
          'conn-1',
          makeRequest('tools/call', { arguments: {} }),
        );

        expect(response.error).toBeDefined();
        expect(response.error!.code).toBe(MCP_ERROR_CODES.INVALID_PARAMS);
      });

      it('should pass empty object when arguments not provided', async () => {
        const handler = vi.fn().mockResolvedValue({ success: true, output: 'ok' });
        host.registerTool('agent-1', makeTool('no-args', { handler }));

        await host.handleRequest(
          'conn-1',
          makeRequest('tools/call', { name: 'no-args' }),
        );

        expect(handler).toHaveBeenCalledWith({});
      });
    });

    describe('unknown method', () => {
      it('should return METHOD_NOT_FOUND for unknown methods', async () => {
        const response = await host.handleRequest(
          'conn-1',
          makeRequest('unknown/method'),
        );

        expect(response.error).toBeDefined();
        expect(response.error!.code).toBe(MCP_ERROR_CODES.METHOD_NOT_FOUND);
        expect(response.error!.message).toContain('unknown/method');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Connection Tracking
  // -------------------------------------------------------------------------

  describe('connection tracking', () => {
    beforeEach(async () => {
      await host.startServer(makeConfig('agent-1'));
    });

    it('should track connections on the server', async () => {
      await host.connect('agent-1', 'conn-1');
      await host.connect('agent-1', 'conn-2');

      const server = host.getServer('agent-1');
      expect(server!.connections.size).toBe(2);
      expect(server!.connections.has('conn-1')).toBe(true);
      expect(server!.connections.has('conn-2')).toBe(true);
    });

    it('should remove connection on disconnect', async () => {
      await host.connect('agent-1', 'conn-1');
      host.disconnect('conn-1');

      const server = host.getServer('agent-1');
      expect(server!.connections.size).toBe(0);
    });

    it('should update lastActivity on request', async () => {
      vi.useFakeTimers();
      const startTime = new Date();
      vi.setSystemTime(startTime);

      await host.connect('agent-1', 'conn-1');

      vi.advanceTimersByTime(5000);
      await host.handleRequest('conn-1', makeRequest('ping'));

      const server = host.getServer('agent-1');
      const conn = server!.connections.get('conn-1');
      expect(conn!.lastActivity.getTime()).toBeGreaterThan(startTime.getTime());

      vi.useRealTimers();
    });

    it('should handle disconnect for unknown connection gracefully', () => {
      // Should not throw
      host.disconnect('unknown-conn');
    });

    it('should return error when connecting to non-existent server', async () => {
      const response = await host.connect('no-agent', 'conn-1');
      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(MCP_ERROR_CODES.SERVER_NOT_RUNNING);
    });
  });
});
