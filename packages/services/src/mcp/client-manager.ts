/**
 * MCP Client Manager — In-memory implementation of the MCPClientManager interface.
 *
 * Manages outbound connections to external MCP servers, handling tool discovery,
 * invocation, retry with exponential backoff, circuit breaker logic, and
 * keyword-based capability search. The actual transport layer is abstracted
 * via the MCPTransportAdapter interface (defaults to a no-op for testing).
 *
 * Requirements: 36b.6, 36b.7, 36b.8, 36b.9
 */

import type {
  MCPClientManager,
  MCPClientConfig,
  MCPClientConnection,
  MCPToolDefinition,
  MCPToolResult,
  MCPToolMatch,
  MCPTransportAdapter,
  MCPCostTracker,
  MCPRequest,
  MCPResponse,
} from './types.js';
import { MCP_ERROR_CODES } from './types.js';

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/** Internal state for a managed connection including transport and config. */
interface ConnectionState {
  connection: MCPClientConnection;
  config: MCPClientConfig;
  transport: MCPTransportAdapter;
  /** Cached tool definitions from last discovery */
  toolCache: MCPToolDefinition[] | null;
  /** Circuit breaker state */
  circuitBreaker: CircuitBreakerState;
}

/** Circuit breaker state machine. */
interface CircuitBreakerState {
  /** Current state of the circuit breaker */
  state: 'closed' | 'open' | 'half-open';
  /** Number of consecutive failures */
  failureCount: number;
  /** Timestamp when the circuit was opened */
  openedAt: number | null;
  /** Threshold of failures before opening the circuit */
  failureThreshold: number;
  /** Duration in ms before transitioning from open to half-open */
  resetTimeoutMs: number;
}

// ---------------------------------------------------------------------------
// Default Transport Adapter (no-op, for testing/wiring later)
// ---------------------------------------------------------------------------

/**
 * A no-op transport adapter that always fails.
 * Real transports (stdio, SSE, WebSocket) will be injected at integration time.
 */
class NoOpTransportAdapter implements MCPTransportAdapter {
  async connect(): Promise<void> {
    // No-op: real transport wired later
  }

  async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: MCP_ERROR_CODES.INTERNAL_ERROR,
        message: 'No transport adapter configured',
      },
    };
  }

  async disconnect(): Promise<void> {
    // No-op
  }

  isConnected(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * MCPClientManagerImpl manages outbound connections to external MCP servers.
 *
 * Features:
 * - Connection lifecycle with retry and exponential backoff (Req 36b.6)
 * - Tool discovery and caching from connected servers (Req 36b.7)
 * - Tool invocation with timeout enforcement and cost tracking (Req 36b.8)
 * - Keyword-based capability search across all connections (Req 36b.9)
 * - Circuit breaker per connection (opens after 5 failures, half-open after 60s)
 * - Connection health monitoring with automatic reconnection
 */
export class MCPClientManagerImpl implements MCPClientManager {
  /** Active connections indexed by connection ID */
  private readonly connections = new Map<string, ConnectionState>();

  /** Optional cost tracking callback (wired to Otzar later) */
  private readonly costTracker: MCPCostTracker | undefined;

  /** Factory for creating transport adapters (enables testing) */
  private readonly transportFactory: (config: MCPClientConfig) => MCPTransportAdapter;

  /** Counter for generating unique connection IDs */
  private connectionCounter = 0;

  /**
   * Create a new MCPClientManagerImpl.
   *
   * @param options - Optional configuration for transport and cost tracking.
   */
  constructor(options?: {
    transportFactory?: (config: MCPClientConfig) => MCPTransportAdapter;
    costTracker?: MCPCostTracker;
  }) {
    this.transportFactory = options?.transportFactory ?? (() => new NoOpTransportAdapter());
    this.costTracker = options?.costTracker;
  }

  // -------------------------------------------------------------------------
  // Connection Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Connect to an external MCP server.
   *
   * Establishes a connection with retry and exponential backoff on failure.
   *
   * @param serverUrl - The URL of the external MCP server.
   * @param config - Connection configuration including transport and retry policy.
   * @returns The established connection state.
   * @throws Error if connection fails after all retry attempts.
   */
  async connect(serverUrl: string, config: MCPClientConfig): Promise<MCPClientConnection> {
    const connectionId = this.generateConnectionId();
    const transport = this.transportFactory(config);
    const maxRetries = config.retryPolicy?.maxRetries ?? 3;
    const backoffMs = config.retryPolicy?.backoffMs ?? 1000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await transport.connect(serverUrl, config.authToken);

        const connection: MCPClientConnection = {
          id: connectionId,
          serverUrl,
          status: 'connected',
          connectedAt: new Date(),
          lastActivity: new Date(),
          tools: [],
          errorCount: 0,
        };

        const state: ConnectionState = {
          connection,
          config,
          transport,
          toolCache: null,
          circuitBreaker: {
            state: 'closed',
            failureCount: 0,
            openedAt: null,
            failureThreshold: 5,
            resetTimeoutMs: 60_000,
          },
        };

        this.connections.set(connectionId, state);
        return connection;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const delay = backoffMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Failed to connect to ${serverUrl} after ${maxRetries + 1} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Disconnect from an external MCP server.
   *
   * @param connectionId - The connection to disconnect.
   * @throws Error if the connection does not exist.
   */
  async disconnect(connectionId: string): Promise<void> {
    const state = this.connections.get(connectionId);
    if (!state) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    try {
      await state.transport.disconnect();
    } finally {
      state.connection.status = 'disconnected';
      this.connections.delete(connectionId);
    }
  }

  /**
   * Reconnect to an external MCP server using the existing configuration.
   *
   * @param connectionId - The connection to reconnect.
   * @throws Error if the connection does not exist or reconnection fails.
   */
  async reconnect(connectionId: string): Promise<void> {
    const state = this.connections.get(connectionId);
    if (!state) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    state.connection.status = 'reconnecting';

    const maxRetries = state.config.retryPolicy?.maxRetries ?? 3;
    const backoffMs = state.config.retryPolicy?.backoffMs ?? 1000;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await state.transport.disconnect();
        await state.transport.connect(state.connection.serverUrl, state.config.authToken);

        state.connection.status = 'connected';
        state.connection.lastActivity = new Date();
        state.connection.errorCount = 0;
        state.circuitBreaker.state = 'closed';
        state.circuitBreaker.failureCount = 0;
        state.circuitBreaker.openedAt = null;
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const delay = backoffMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    state.connection.status = 'error';
    throw new Error(
      `Failed to reconnect ${connectionId} after ${maxRetries + 1} attempts: ${lastError?.message}`,
    );
  }

  // -------------------------------------------------------------------------
  // Tool Discovery
  // -------------------------------------------------------------------------

  /**
   * Discover tools available on a connected external MCP server.
   *
   * Results are cached per connection. Subsequent calls return the cached
   * tools unless the cache is invalidated by reconnection.
   *
   * @param connectionId - The connection to discover tools on.
   * @returns Array of tool definitions available on the server.
   * @throws Error if the connection does not exist or is not connected.
   */
  async discoverTools(connectionId: string): Promise<MCPToolDefinition[]> {
    const state = this.getConnectedState(connectionId);

    // Return cached tools if available
    if (state.toolCache !== null) {
      return state.toolCache;
    }

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: `discover-${Date.now()}`,
      method: 'tools/list',
    };

    const response = await state.transport.sendRequest(request);

    if (response.error) {
      throw new Error(`Tool discovery failed: ${response.error.message}`);
    }

    const result = response.result as { tools?: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      outputSchema?: Record<string, unknown>;
      requiredAuthority?: string;
      costEstimate?: number;
    }> };

    const tools: MCPToolDefinition[] = (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
      requiredAuthority: t.requiredAuthority ?? 'L4',
      costEstimate: t.costEstimate,
      // Remote tools use a proxy handler (actual invocation goes through invokeTool)
      handler: async () => ({ success: false, error: 'Use invokeTool() for remote tools' }),
    }));

    // Cache and store on connection
    state.toolCache = tools;
    state.connection.tools = tools;
    state.connection.lastActivity = new Date();

    return tools;
  }

  // -------------------------------------------------------------------------
  // Tool Invocation
  // -------------------------------------------------------------------------

  /**
   * Invoke a tool on a connected external MCP server.
   *
   * Enforces timeout, tracks cost via the optional Otzar callback, and
   * updates the circuit breaker on success/failure.
   *
   * @param connectionId - The connection hosting the tool.
   * @param toolName - The name of the tool to invoke.
   * @param args - Arguments to pass to the tool.
   * @returns The tool invocation result.
   * @throws Error if the connection is not found, circuit is open, or timeout is exceeded.
   */
  async invokeTool(
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    const state = this.getConnectedState(connectionId);

    // Check circuit breaker
    if (this.isCircuitOpen(state.circuitBreaker)) {
      return {
        success: false,
        error: `Circuit breaker open for connection ${connectionId}. Too many failures.`,
      };
    }

    const timeout = state.config.timeout ?? 30_000;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: `invoke-${Date.now()}`,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    };

    const startTime = Date.now();

    try {
      const response = await this.withTimeout(
        state.transport.sendRequest(request),
        timeout,
      );

      const durationMs = Date.now() - startTime;

      if (response.error) {
        this.recordFailure(state);
        return {
          success: false,
          error: response.error.message,
          durationMs,
        };
      }

      // Success — reset circuit breaker
      this.recordSuccess(state);
      state.connection.lastActivity = new Date();

      // Track cost via Otzar callback
      const costEstimate = this.findToolCostEstimate(state, toolName);
      if (this.costTracker) {
        this.costTracker(connectionId, toolName, durationMs, costEstimate);
      }

      // Parse the MCP response content
      const result = response.result as {
        content?: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      if (result?.isError) {
        return {
          success: false,
          error: result.content?.[0]?.text ?? 'Tool execution failed',
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
      const durationMs = Date.now() - startTime;
      this.recordFailure(state);

      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: message,
        durationMs,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Capability Search
  // -------------------------------------------------------------------------

  /**
   * Find tools matching a capability description using keyword-based search.
   *
   * Searches across all connected servers' discovered tools. Uses simple
   * keyword overlap scoring (embedding similarity will be added when Zikaron
   * is wired).
   *
   * @param description - Natural language description of the desired capability.
   * @returns Array of matching tools sorted by relevance score (descending).
   */
  async findToolByCapability(description: string): Promise<MCPToolMatch[]> {
    const matches: MCPToolMatch[] = [];
    const keywords = this.extractKeywords(description);

    if (keywords.length === 0) {
      return [];
    }

    for (const [connectionId, state] of this.connections) {
      if (state.connection.status !== 'connected') continue;

      const tools = state.toolCache ?? state.connection.tools;
      for (const tool of tools) {
        const score = this.computeRelevanceScore(tool, keywords);
        if (score > 0) {
          matches.push({
            tool,
            connectionId,
            serverUrl: state.connection.serverUrl,
            relevanceScore: score,
          });
        }
      }
    }

    // Sort by relevance score descending
    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return matches;
  }

  // -------------------------------------------------------------------------
  // Connection Health
  // -------------------------------------------------------------------------

  /**
   * Get the health/status of a connection.
   *
   * @param connectionId - The connection to query.
   * @returns The connection state or undefined if not found.
   */
  getConnectionHealth(connectionId: string): MCPClientConnection | undefined {
    const state = this.connections.get(connectionId);
    return state?.connection;
  }

  /**
   * Get all active connections.
   *
   * @returns Array of all managed connections.
   */
  getConnections(): MCPClientConnection[] {
    return Array.from(this.connections.values()).map((s) => s.connection);
  }

  // -------------------------------------------------------------------------
  // Circuit Breaker (Private)
  // -------------------------------------------------------------------------

  /**
   * Check if the circuit breaker is in an open state (blocking requests).
   * Transitions from open to half-open after the reset timeout.
   */
  private isCircuitOpen(cb: CircuitBreakerState): boolean {
    if (cb.state === 'closed') return false;

    if (cb.state === 'open' && cb.openedAt !== null) {
      const elapsed = Date.now() - cb.openedAt;
      if (elapsed >= cb.resetTimeoutMs) {
        // Transition to half-open: allow one request through
        cb.state = 'half-open';
        return false;
      }
      return true;
    }

    // half-open: allow the request through
    return false;
  }

  /**
   * Record a successful operation — resets the circuit breaker.
   */
  private recordSuccess(state: ConnectionState): void {
    state.circuitBreaker.state = 'closed';
    state.circuitBreaker.failureCount = 0;
    state.circuitBreaker.openedAt = null;
    state.connection.errorCount = 0;
  }

  /**
   * Record a failed operation — increments failure count and may open the circuit.
   */
  private recordFailure(state: ConnectionState): void {
    state.circuitBreaker.failureCount++;
    state.connection.errorCount++;

    if (state.circuitBreaker.failureCount >= state.circuitBreaker.failureThreshold) {
      state.circuitBreaker.state = 'open';
      state.circuitBreaker.openedAt = Date.now();
    }
  }

  // -------------------------------------------------------------------------
  // Keyword Search (Private)
  // -------------------------------------------------------------------------

  /**
   * Extract keywords from a description string.
   * Lowercases, removes punctuation, and filters common stop words.
   */
  private extractKeywords(description: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'can', 'shall',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
      'that', 'this', 'it', 'and', 'or', 'but', 'not', 'if', 'then',
    ]);

    return description
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 1 && !stopWords.has(word));
  }

  /**
   * Compute a relevance score (0-1) for a tool against a set of keywords.
   * Uses keyword overlap between the query and the tool's name + description.
   */
  private computeRelevanceScore(tool: MCPToolDefinition, keywords: string[]): number {
    const toolText = `${tool.name} ${tool.description}`.toLowerCase();
    const toolWords = toolText.replace(/[^\w\s]/g, '').split(/\s+/);
    const toolWordSet = new Set(toolWords);

    let matchCount = 0;
    for (const keyword of keywords) {
      // Check exact match or partial match (substring in any tool word)
      if (toolWordSet.has(keyword)) {
        matchCount++;
      } else if (toolWords.some((w) => w.includes(keyword) || keyword.includes(w))) {
        matchCount += 0.5;
      }
    }

    return Math.min(matchCount / keywords.length, 1);
  }

  // -------------------------------------------------------------------------
  // Helpers (Private)
  // -------------------------------------------------------------------------

  /**
   * Get a connection state, throwing if not found or not connected.
   */
  private getConnectedState(connectionId: string): ConnectionState {
    const state = this.connections.get(connectionId);
    if (!state) {
      throw new Error(`Connection not found: ${connectionId}`);
    }
    if (state.connection.status !== 'connected' && state.connection.status !== 'reconnecting') {
      throw new Error(`Connection ${connectionId} is not active (status: ${state.connection.status})`);
    }
    return state;
  }

  /**
   * Find the cost estimate for a tool from the cached tool definitions.
   */
  private findToolCostEstimate(state: ConnectionState, toolName: string): number | undefined {
    const tools = state.toolCache ?? state.connection.tools;
    const tool = tools.find((t) => t.name === toolName);
    return tool?.costEstimate;
  }

  /**
   * Wrap a promise with a timeout.
   * @throws Error if the promise does not resolve within the timeout.
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /** Generate a unique connection ID. */
  private generateConnectionId(): string {
    this.connectionCounter++;
    return `mcp-conn-${this.connectionCounter}-${Date.now()}`;
  }

  /** Sleep for a given duration (used for retry backoff). */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
