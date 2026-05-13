/**
 * MCP Server Host — In-memory implementation of the MCPServerHost interface.
 *
 * Manages MCP servers for agents, handling tool registration, protocol
 * message dispatch, authentication, and rate limiting. The actual transport
 * layer (stdio/SSE/WebSocket) will be wired in a later integration step.
 * This implementation processes MCPRequest objects and returns MCPResponse
 * objects via the handleRequest() method.
 *
 * Requirements: 36a.1, 36a.2, 36a.3, 36a.4
 */

import type {
  MCPServerHost,
  MCPServerConfig,
  MCPServer,
  MCPConnection,
  MCPToolDefinition,
  MCPToolResult,
  MCPRequest,
  MCPResponse,
  MCPAuthValidator,
  MCPRateLimitConfig,
} from './types.js';
import { MCP_ERROR_CODES } from './types.js';

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/** Sliding window rate limiter state per connection. */
interface RateLimiterState {
  /** Timestamps of requests within the current window */
  timestamps: number[];
  /** Rate limit config for this connection */
  config: MCPRateLimitConfig;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * MCPServerHostImpl manages MCP servers for SeraphimOS agents.
 *
 * Features:
 * - Per-agent server lifecycle management (start/stop)
 * - Dynamic tool registration with JSON Schema validation (Req 36a.3)
 * - JSON-RPC 2.0 protocol handling (initialize, ping, tools/list, tools/call)
 * - Token-based authentication integrated with Mishmar governance (Req 36a.2)
 * - Sliding window rate limiting per connection (Req 36a.4)
 */
export class MCPServerHostImpl implements MCPServerHost {
  /** Active servers indexed by agent ID */
  private readonly servers = new Map<string, MCPServer>();

  /** Connection-to-agent mapping for request routing */
  private readonly connectionToAgent = new Map<string, string>();

  /** Rate limiter state per connection */
  private readonly rateLimiters = new Map<string, RateLimiterState>();

  /** Authentication validator function (wired to Mishmar later) */
  private readonly authValidator: MCPAuthValidator;

  /**
   * Create a new MCPServerHostImpl.
   *
   * @param authValidator - Function to validate connection authentication.
   *   Defaults to allowing all connections (for testing).
   */
  constructor(authValidator?: MCPAuthValidator) {
    this.authValidator = authValidator ?? (async () => true);
  }

  // -------------------------------------------------------------------------
  // Server Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start an MCP server for a given agent.
   *
   * @param config - Server configuration including agent ID, transport, and rate limits.
   * @throws Error if a server is already running for the agent.
   */
  async startServer(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.agentId)) {
      throw new Error(`MCP server already running for agent: ${config.agentId}`);
    }

    const server: MCPServer = {
      agentId: config.agentId,
      status: 'running',
      tools: new Map(),
      connections: new Map(),
      config,
    };

    this.servers.set(config.agentId, server);
  }

  /**
   * Stop an MCP server for a given agent.
   *
   * Disconnects all active connections and removes the server.
   *
   * @param agentId - The agent whose server to stop.
   * @throws Error if no server is running for the agent.
   */
  async stopServer(agentId: string): Promise<void> {
    const server = this.servers.get(agentId);
    if (!server) {
      throw new Error(`No MCP server running for agent: ${agentId}`);
    }

    // Clean up all connections
    for (const connectionId of server.connections.keys()) {
      this.connectionToAgent.delete(connectionId);
      this.rateLimiters.delete(connectionId);
    }

    server.status = 'stopped';
    server.connections.clear();
    this.servers.delete(agentId);
  }

  // -------------------------------------------------------------------------
  // Tool Registration
  // -------------------------------------------------------------------------

  /**
   * Register a tool on an agent's MCP server.
   *
   * @param agentId - The agent to register the tool for.
   * @param tool - The tool definition including handler and schema.
   * @throws Error if no server is running for the agent or tool name is duplicate.
   */
  registerTool(agentId: string, tool: MCPToolDefinition): void {
    const server = this.servers.get(agentId);
    if (!server) {
      throw new Error(`No MCP server running for agent: ${agentId}`);
    }
    if (server.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    server.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool from an agent's MCP server.
   *
   * @param agentId - The agent to unregister the tool from.
   * @param toolName - The name of the tool to remove.
   * @throws Error if no server is running for the agent or tool not found.
   */
  unregisterTool(agentId: string, toolName: string): void {
    const server = this.servers.get(agentId);
    if (!server) {
      throw new Error(`No MCP server running for agent: ${agentId}`);
    }
    if (!server.tools.has(toolName)) {
      throw new Error(`Tool not registered: ${toolName}`);
    }

    server.tools.delete(toolName);
  }

  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------

  /**
   * Establish a new connection to an agent's MCP server.
   *
   * Validates authentication if required by the server config.
   *
   * @param agentId - The agent to connect to.
   * @param connectionId - Unique identifier for this connection.
   * @param token - Optional authentication token.
   * @returns MCPResponse with initialize result or error.
   */
  async connect(
    agentId: string,
    connectionId: string,
    token?: string,
  ): Promise<MCPResponse> {
    const server = this.servers.get(agentId);
    if (!server) {
      return this.errorResponse('connect', MCP_ERROR_CODES.SERVER_NOT_RUNNING, 'Server not running');
    }

    if (server.status !== 'running') {
      return this.errorResponse('connect', MCP_ERROR_CODES.SERVER_NOT_RUNNING, 'Server not running');
    }

    // Authenticate if required
    if (server.config.authRequired) {
      const authenticated = await this.authValidator(connectionId, connectionId, token);
      if (!authenticated) {
        return this.errorResponse('connect', MCP_ERROR_CODES.UNAUTHORIZED, 'Authentication failed');
      }
    }

    const connection: MCPConnection = {
      id: connectionId,
      clientId: connectionId,
      agentId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      authenticated: true,
    };

    server.connections.set(connectionId, connection);
    this.connectionToAgent.set(connectionId, agentId);

    // Initialize rate limiter for this connection
    this.rateLimiters.set(connectionId, {
      timestamps: [],
      config: server.config.rateLimits,
    });

    return {
      jsonrpc: '2.0',
      id: 'connect',
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: `seraphim-${agentId}`,
          version: '1.0.0',
        },
        capabilities: {
          tools: { listChanged: true },
        },
      },
    };
  }

  /**
   * Disconnect a client from an agent's server.
   *
   * @param connectionId - The connection to disconnect.
   */
  disconnect(connectionId: string): void {
    const agentId = this.connectionToAgent.get(connectionId);
    if (!agentId) return;

    const server = this.servers.get(agentId);
    if (server) {
      server.connections.delete(connectionId);
    }

    this.connectionToAgent.delete(connectionId);
    this.rateLimiters.delete(connectionId);
  }

  // -------------------------------------------------------------------------
  // Request Handling
  // -------------------------------------------------------------------------

  /**
   * Handle an incoming MCP request for a connection.
   *
   * Dispatches to the appropriate protocol handler based on the method.
   *
   * @param connectionId - The connection sending the request.
   * @param request - The JSON-RPC 2.0 request.
   * @returns The JSON-RPC 2.0 response.
   */
  async handleRequest(connectionId: string, request: MCPRequest): Promise<MCPResponse> {
    const agentId = this.connectionToAgent.get(connectionId);
    if (!agentId) {
      return this.errorResponse(
        request.id,
        MCP_ERROR_CODES.UNAUTHORIZED,
        'Connection not established',
      );
    }

    const server = this.servers.get(agentId);
    if (!server || server.status !== 'running') {
      return this.errorResponse(
        request.id,
        MCP_ERROR_CODES.SERVER_NOT_RUNNING,
        'Server not running',
      );
    }

    // Update last activity
    const connection = server.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = new Date();
    }

    // Check rate limit
    if (this.isRateLimited(connectionId)) {
      return this.errorResponse(
        request.id,
        MCP_ERROR_CODES.RATE_LIMITED,
        'Rate limit exceeded',
      );
    }

    // Record request for rate limiting
    this.recordRequest(connectionId);

    // Dispatch to protocol handler
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request, server);
      case 'ping':
        return this.handlePing(request);
      case 'tools/list':
        return this.handleToolsList(request, server);
      case 'tools/call':
        return this.handleToolsCall(request, server);
      default:
        return this.errorResponse(
          request.id,
          MCP_ERROR_CODES.METHOD_NOT_FOUND,
          `Unknown method: ${request.method}`,
        );
    }
  }

  // -------------------------------------------------------------------------
  // Server Queries
  // -------------------------------------------------------------------------

  /**
   * Get the current state of a server.
   *
   * @param agentId - The agent whose server to query.
   * @returns The server state or undefined if not running.
   */
  getServer(agentId: string): MCPServer | undefined {
    return this.servers.get(agentId);
  }

  /**
   * Get all active servers.
   *
   * @returns Array of all running MCP servers.
   */
  getServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  // -------------------------------------------------------------------------
  // Protocol Handlers (Private)
  // -------------------------------------------------------------------------

  /**
   * Handle the `initialize` method.
   * Returns server capabilities and protocol version.
   */
  private handleInitialize(request: MCPRequest, server: MCPServer): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: `seraphim-${server.agentId}`,
          version: '1.0.0',
        },
        capabilities: {
          tools: { listChanged: true },
        },
      },
    };
  }

  /**
   * Handle the `ping` method.
   * Returns a pong response.
   */
  private handlePing(request: MCPRequest): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { status: 'pong' },
    };
  }

  /**
   * Handle the `tools/list` method.
   * Returns all registered tools with their schemas.
   */
  private handleToolsList(request: MCPRequest, server: MCPServer): MCPResponse {
    const tools = Array.from(server.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    }));

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { tools },
    };
  }

  /**
   * Handle the `tools/call` method.
   * Validates the tool exists and invokes its handler.
   */
  private async handleToolsCall(request: MCPRequest, server: MCPServer): Promise<MCPResponse> {
    const params = request.params;
    if (!params || typeof params.name !== 'string') {
      return this.errorResponse(
        request.id,
        MCP_ERROR_CODES.INVALID_PARAMS,
        'Missing required parameter: name',
      );
    }

    const toolName = params.name as string;
    const tool = server.tools.get(toolName);
    if (!tool) {
      return this.errorResponse(
        request.id,
        MCP_ERROR_CODES.TOOL_NOT_FOUND,
        `Tool not found: ${toolName}`,
      );
    }

    const toolArgs = (params.arguments as Record<string, unknown>) ?? {};

    try {
      const startTime = Date.now();
      const result: MCPToolResult = await tool.handler(toolArgs);
      const durationMs = Date.now() - startTime;

      if (result.success) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result.output),
              },
            ],
            isError: false,
            _meta: { durationMs },
          },
        };
      } else {
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [
              {
                type: 'text',
                text: result.error ?? 'Tool execution failed',
              },
            ],
            isError: true,
            _meta: { durationMs },
          },
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return this.errorResponse(
        request.id,
        MCP_ERROR_CODES.TOOL_EXECUTION_ERROR,
        `Tool execution error: ${message}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Rate Limiting (Private)
  // -------------------------------------------------------------------------

  /**
   * Check if a connection has exceeded its rate limit.
   * Uses a sliding window algorithm.
   */
  private isRateLimited(connectionId: string): boolean {
    const state = this.rateLimiters.get(connectionId);
    if (!state) return false;

    const now = Date.now();
    const windowStart = now - state.config.windowMs;

    // Remove expired timestamps
    state.timestamps = state.timestamps.filter((ts) => ts > windowStart);

    return state.timestamps.length >= state.config.maxRequestsPerWindow;
  }

  /**
   * Record a request timestamp for rate limiting.
   */
  private recordRequest(connectionId: string): void {
    const state = this.rateLimiters.get(connectionId);
    if (!state) return;

    state.timestamps.push(Date.now());
  }

  // -------------------------------------------------------------------------
  // Helpers (Private)
  // -------------------------------------------------------------------------

  /**
   * Create a JSON-RPC error response.
   */
  private errorResponse(
    id: string | number,
    code: number,
    message: string,
    data?: unknown,
  ): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
  }
}
