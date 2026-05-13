/**
 * Kiro-Seraphim MCP Bridge — Implementation of the KiroSeraphimBridge interface.
 *
 * Provides bidirectional tool invocation between Kiro IDE sessions and
 * SeraphimOS agents. Kiro can discover and invoke agent tools, and agents
 * can invoke Kiro IDE tools (readFile, writeFile, runCommand, search,
 * getDiagnostics) through the bridge.
 *
 * Features:
 * - Kiro → Seraphim: expose all agent MCP tools to Kiro IDE sessions (Req 36d.13)
 * - Seraphim → Kiro: allow agents to invoke Kiro tools through the bridge (Req 36d.14)
 * - Persistent connection management with automatic reconnection (Req 36d.15)
 * - Bridge status monitoring
 *
 * Requirements: 36d.13, 36d.14, 36d.15
 */

import type {
  KiroSeraphimBridge,
  KiroToolInvocation,
  KiroToolName,
  BridgeStatus,
  MCPServerHost,
  MCPToolRegistry,
  MCPToolDefinition,
  MCPToolResult,
  MCPTransportAdapter,
  MCPRequest,
} from './types.js';
import { MCP_ERROR_CODES } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The set of supported Kiro tool names. */
const SUPPORTED_KIRO_TOOLS: ReadonlySet<KiroToolName> = new Set([
  'readFile',
  'writeFile',
  'runCommand',
  'search',
  'getDiagnostics',
]);

/** Default reconnection configuration. */
const DEFAULT_RECONNECT_CONFIG = {
  maxRetries: 5,
  backoffMs: 1000,
  maxBackoffMs: 30_000,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * KiroSeraphimBridgeImpl manages the bidirectional MCP bridge between
 * Kiro IDE sessions and SeraphimOS agents.
 *
 * The bridge operates in two directions:
 * 1. Kiro → Seraphim: Kiro can discover and invoke agent tools via the
 *    MCPServerHost and MCPToolRegistry.
 * 2. Seraphim → Kiro: Agents can invoke Kiro IDE tools (readFile, writeFile,
 *    runCommand, search, getDiagnostics) via the MCPTransportAdapter.
 */
export class KiroSeraphimBridgeImpl implements KiroSeraphimBridge {
  /** Current bridge connection status */
  private status: BridgeStatus = 'disconnected';

  /** The connected Kiro session ID */
  private sessionId: string | null = null;

  /** MCP Server Host for routing Kiro tool calls to agents */
  private readonly serverHost: MCPServerHost;

  /** MCP Tool Registry for discovering available agent tools */
  private readonly toolRegistry: MCPToolRegistry;

  /** Transport adapter for communicating with Kiro (Seraphim → Kiro direction) */
  private readonly transport: MCPTransportAdapter | null;

  /** Reconnection configuration */
  private readonly reconnectConfig: {
    maxRetries: number;
    backoffMs: number;
    maxBackoffMs: number;
  };

  /** Whether automatic reconnection is in progress */
  private reconnecting = false;

  /**
   * Create a new KiroSeraphimBridgeImpl.
   *
   * @param serverHost - MCP Server Host for routing Kiro → Seraphim tool calls.
   * @param toolRegistry - MCP Tool Registry for discovering available tools.
   * @param transport - Optional transport adapter for Seraphim → Kiro communication.
   * @param reconnectConfig - Optional reconnection configuration.
   */
  constructor(
    serverHost: MCPServerHost,
    toolRegistry: MCPToolRegistry,
    transport?: MCPTransportAdapter,
    reconnectConfig?: { maxRetries?: number; backoffMs?: number; maxBackoffMs?: number },
  ) {
    this.serverHost = serverHost;
    this.toolRegistry = toolRegistry;
    this.transport = transport ?? null;
    this.reconnectConfig = {
      maxRetries: reconnectConfig?.maxRetries ?? DEFAULT_RECONNECT_CONFIG.maxRetries,
      backoffMs: reconnectConfig?.backoffMs ?? DEFAULT_RECONNECT_CONFIG.backoffMs,
      maxBackoffMs: reconnectConfig?.maxBackoffMs ?? DEFAULT_RECONNECT_CONFIG.maxBackoffMs,
    };
  }

  // -------------------------------------------------------------------------
  // Connection Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Establish the bridge connection with a Kiro session.
   *
   * Connects the transport adapter (if available) and sets the bridge
   * status to 'connected'.
   *
   * @param sessionId - The Kiro session identifier to connect to.
   * @throws Error if sessionId is empty or connection fails.
   */
  async connect(sessionId: string): Promise<void> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new Error('sessionId is required to establish bridge connection');
    }

    try {
      // Connect the transport if available (for Seraphim → Kiro direction)
      if (this.transport) {
        await this.transport.connect(sessionId);
      }

      this.sessionId = sessionId;
      this.status = 'connected';
    } catch (err) {
      this.status = 'error';
      const message = err instanceof Error ? err.message : 'Unknown connection error';
      throw new Error(`Failed to establish bridge connection: ${message}`);
    }
  }

  /**
   * Disconnect the bridge.
   *
   * Tears down the transport connection and resets the bridge state.
   */
  async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.disconnect();
      }
    } finally {
      this.sessionId = null;
      this.status = 'disconnected';
      this.reconnecting = false;
    }
  }

  /**
   * Get current bridge status.
   *
   * @returns The current BridgeStatus.
   */
  getStatus(): BridgeStatus {
    return this.status;
  }

  /**
   * Get the connected session ID.
   *
   * @returns The session ID or null if not connected.
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  // -------------------------------------------------------------------------
  // Kiro → Seraphim Direction
  // -------------------------------------------------------------------------

  /**
   * Handle a tool call from Kiro to a SeraphimOS agent.
   *
   * Routes the tool call to the appropriate agent's MCP server via the
   * MCPServerHost. The agent must have a running server with the requested
   * tool registered.
   *
   * @param agentId - The target agent ID.
   * @param toolName - The name of the tool to invoke.
   * @param args - Arguments to pass to the tool.
   * @returns The tool invocation result.
   */
  async handleKiroToolCall(
    agentId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    if (this.status !== 'connected') {
      return {
        success: false,
        error: 'Bridge is not connected',
      };
    }

    // Verify the agent has a running server
    const server = this.serverHost.getServer(agentId);
    if (!server) {
      return {
        success: false,
        error: `No MCP server running for agent: ${agentId}`,
      };
    }

    if (server.status !== 'running') {
      return {
        success: false,
        error: `MCP server for agent ${agentId} is not running (status: ${server.status})`,
      };
    }

    // Find the tool on the agent's server
    const tool = server.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found on agent ${agentId}: ${toolName}`,
      };
    }

    // Invoke the tool handler
    try {
      const startTime = Date.now();
      const result = await tool.handler(args);
      const durationMs = Date.now() - startTime;

      return {
        ...result,
        durationMs,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: `Tool execution error: ${message}`,
      };
    }
  }

  /**
   * Get all agent tools available to Kiro.
   *
   * Returns all tools from the registry that are currently available,
   * providing Kiro with a unified view of all agent capabilities.
   *
   * @returns Array of tool definitions available to Kiro.
   */
  getExposedTools(): MCPToolDefinition[] {
    const entries = this.toolRegistry.listAllTools();
    const tools: MCPToolDefinition[] = [];

    for (const entry of entries) {
      if (entry.availability !== 'available') {
        continue;
      }

      tools.push({
        name: entry.name,
        description: entry.description,
        inputSchema: entry.inputSchema,
        outputSchema: entry.outputSchema,
        requiredAuthority: entry.requiredAuthority,
        costEstimate: entry.costEstimate,
        // Handler is a proxy — actual invocation goes through handleKiroToolCall
        handler: async (params: Record<string, unknown>) => {
          if (entry.source === 'internal' && entry.agentId) {
            return this.handleKiroToolCall(entry.agentId, entry.name, params);
          }
          return { success: false, error: 'Tool source not supported for direct invocation' };
        },
      });
    }

    return tools;
  }

  // -------------------------------------------------------------------------
  // Seraphim → Kiro Direction
  // -------------------------------------------------------------------------

  /**
   * Invoke a Kiro tool from a SeraphimOS agent.
   *
   * Sends a tool invocation request to the connected Kiro session through
   * the transport adapter. Requires an active bridge connection and a
   * configured transport.
   *
   * @param invocation - The Kiro tool invocation request.
   * @returns The tool invocation result.
   */
  async invokeKiroTool(invocation: KiroToolInvocation): Promise<MCPToolResult> {
    if (this.status !== 'connected') {
      // Attempt automatic reconnection
      if (this.sessionId && !this.reconnecting) {
        const reconnected = await this.attemptReconnect();
        if (!reconnected) {
          return {
            success: false,
            error: 'Bridge is not connected and reconnection failed',
          };
        }
      } else {
        return {
          success: false,
          error: 'Bridge is not connected',
        };
      }
    }

    if (!this.transport) {
      return {
        success: false,
        error: 'No transport adapter configured for Seraphim → Kiro communication',
      };
    }

    if (!this.isKiroToolAvailable(invocation.tool)) {
      return {
        success: false,
        error: `Kiro tool not available: ${invocation.tool}`,
      };
    }

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: `kiro-${invocation.tool}-${Date.now()}`,
      method: 'tools/call',
      params: {
        name: invocation.tool,
        arguments: invocation.args,
      },
    };

    try {
      const startTime = Date.now();
      const response = await this.transport.sendRequest(request);
      const durationMs = Date.now() - startTime;

      if (response.error) {
        return {
          success: false,
          error: response.error.message,
          durationMs,
        };
      }

      // Parse the MCP response content
      const result = response.result as {
        content?: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      if (result?.isError) {
        return {
          success: false,
          error: result.content?.[0]?.text ?? 'Kiro tool execution failed',
          durationMs,
        };
      }

      let output: unknown;
      try {
        output = result?.content?.[0]?.text
          ? JSON.parse(result.content[0].text)
          : result;
      } catch {
        output = result?.content?.[0]?.text ?? result;
      }

      return {
        success: true,
        output,
        durationMs,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      // If transport error, mark as disconnected and attempt reconnect
      if (this.transport && !this.transport.isConnected()) {
        this.status = 'disconnected';
        // Fire-and-forget reconnection attempt
        void this.attemptReconnect();
      }

      return {
        success: false,
        error: `Kiro tool invocation failed: ${message}`,
      };
    }
  }

  /**
   * Check if a specific Kiro tool is available.
   *
   * A tool is available if the bridge is connected (or has a session for
   * reconnection) and the tool name is in the supported set.
   *
   * @param tool - The Kiro tool name to check.
   * @returns Whether the tool is available for invocation.
   */
  isKiroToolAvailable(tool: KiroToolName): boolean {
    if (this.status !== 'connected') {
      return false;
    }

    if (!this.transport) {
      return false;
    }

    return SUPPORTED_KIRO_TOOLS.has(tool);
  }

  // -------------------------------------------------------------------------
  // Automatic Reconnection (Private)
  // -------------------------------------------------------------------------

  /**
   * Attempt to reconnect the bridge with exponential backoff.
   *
   * @returns Whether reconnection was successful.
   */
  private async attemptReconnect(): Promise<boolean> {
    if (this.reconnecting || !this.sessionId || !this.transport) {
      return false;
    }

    this.reconnecting = true;
    this.status = 'reconnecting';

    const { maxRetries, backoffMs, maxBackoffMs } = this.reconnectConfig;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.transport.connect(this.sessionId);
        this.status = 'connected';
        this.reconnecting = false;
        return true;
      } catch {
        const delay = Math.min(backoffMs * Math.pow(2, attempt), maxBackoffMs);
        await this.sleep(delay);
      }
    }

    this.status = 'error';
    this.reconnecting = false;
    return false;
  }

  /**
   * Sleep for a given duration (used for reconnection backoff).
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
