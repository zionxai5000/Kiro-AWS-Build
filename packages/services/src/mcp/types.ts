/**
 * MCP (Model Context Protocol) Server Host — Type Definitions
 *
 * Types for the MCP Server Host, tool definitions, connections,
 * and JSON-RPC protocol messages.
 *
 * Requirements: 36a.1, 36a.2, 36a.3, 36a.4
 */

// ---------------------------------------------------------------------------
// MCP Tool Definition
// ---------------------------------------------------------------------------

/** Defines a tool exposed via the MCP protocol. */
export interface MCPToolDefinition {
  /** Unique tool name (scoped to the agent) */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** JSON Schema defining the tool's input parameters */
  inputSchema: Record<string, unknown>;
  /** JSON Schema defining the tool's output format */
  outputSchema?: Record<string, unknown>;
  /** Minimum authority level required to invoke this tool */
  requiredAuthority: string;
  /** Estimated cost in USD per invocation */
  costEstimate?: number;
  /** The handler function invoked when the tool is called */
  handler: (params: Record<string, unknown>) => Promise<MCPToolResult>;
}

// ---------------------------------------------------------------------------
// MCP Tool Result
// ---------------------------------------------------------------------------

/** Result returned from an MCP tool invocation. */
export interface MCPToolResult {
  /** Whether the tool invocation succeeded */
  success: boolean;
  /** The output data from the tool */
  output?: unknown;
  /** Error message if the invocation failed */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// MCP Server Configuration
// ---------------------------------------------------------------------------

/** Configuration for an MCP server instance. */
export interface MCPServerConfig {
  /** The agent ID this server exposes tools for */
  agentId: string;
  /** Transport type (for future wiring) */
  transport: 'stdio' | 'sse' | 'websocket';
  /** Port number (for SSE/WebSocket transports) */
  port?: number;
  /** Whether authentication is required for connections */
  authRequired: boolean;
  /** Rate limiting configuration */
  rateLimits: MCPRateLimitConfig;
}

/** Rate limiting configuration for MCP connections. */
export interface MCPRateLimitConfig {
  /** Maximum requests per window */
  maxRequestsPerWindow: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

// ---------------------------------------------------------------------------
// MCP Connection
// ---------------------------------------------------------------------------

/** Represents an active MCP client connection. */
export interface MCPConnection {
  /** Unique connection identifier */
  id: string;
  /** The client identifier (provided during initialize) */
  clientId: string;
  /** The agent ID this connection is associated with */
  agentId: string;
  /** When the connection was established */
  connectedAt: Date;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Whether the connection has been authenticated */
  authenticated: boolean;
}

// ---------------------------------------------------------------------------
// MCP Server State
// ---------------------------------------------------------------------------

/** Represents the state of an MCP server for a given agent. */
export interface MCPServer {
  /** The agent ID this server belongs to */
  agentId: string;
  /** Current server status */
  status: 'running' | 'stopped' | 'error';
  /** Registered tools for this server */
  tools: Map<string, MCPToolDefinition>;
  /** Active connections to this server */
  connections: Map<string, MCPConnection>;
  /** Server configuration */
  config: MCPServerConfig;
}

// ---------------------------------------------------------------------------
// JSON-RPC Protocol Types
// ---------------------------------------------------------------------------

/** A JSON-RPC 2.0 request message. */
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/** A JSON-RPC 2.0 success response. */
export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: MCPError;
}

/** A JSON-RPC 2.0 error object. */
export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// MCP Error Codes (JSON-RPC standard + MCP-specific)
// ---------------------------------------------------------------------------

export const MCP_ERROR_CODES = {
  /** Standard JSON-RPC errors */
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  /** MCP-specific errors */
  UNAUTHORIZED: -32001,
  RATE_LIMITED: -32002,
  TOOL_NOT_FOUND: -32003,
  TOOL_EXECUTION_ERROR: -32004,
  SERVER_NOT_RUNNING: -32005,
} as const;

// ---------------------------------------------------------------------------
// Auth Validator
// ---------------------------------------------------------------------------

/** Function type for validating MCP connection authentication. */
export type MCPAuthValidator = (
  connectionId: string,
  clientId: string,
  token?: string,
) => Promise<boolean>;

// ---------------------------------------------------------------------------
// MCP Server Host Interface
// ---------------------------------------------------------------------------

/** Interface for the MCP Server Host that manages MCP servers for agents. */
export interface MCPServerHost {
  /** Start an MCP server for a given agent */
  startServer(config: MCPServerConfig): Promise<void>;

  /** Stop an MCP server for a given agent */
  stopServer(agentId: string): Promise<void>;

  /** Register a tool on an agent's MCP server */
  registerTool(agentId: string, tool: MCPToolDefinition): void;

  /** Unregister a tool from an agent's MCP server */
  unregisterTool(agentId: string, toolName: string): void;

  /** Handle an incoming MCP request for a connection */
  handleRequest(connectionId: string, request: MCPRequest): Promise<MCPResponse>;

  /** Establish a new connection to an agent's server */
  connect(agentId: string, connectionId: string, token?: string): Promise<MCPResponse>;

  /** Disconnect a client from an agent's server */
  disconnect(connectionId: string): void;

  /** Get the current state of a server */
  getServer(agentId: string): MCPServer | undefined;

  /** Get all active servers */
  getServers(): MCPServer[];
}

// ---------------------------------------------------------------------------
// MCP Client Configuration (for consuming external MCP servers)
// Requirements: 36b.6, 36b.7, 36b.8, 36b.9
// ---------------------------------------------------------------------------

/** Configuration for connecting to an external MCP server as a client. */
export interface MCPClientConfig {
  /** URL of the external MCP server */
  serverUrl: string;
  /** Transport protocol to use */
  transport: 'stdio' | 'sse' | 'websocket';
  /** Optional authentication token */
  authToken?: string;
  /** Request timeout in milliseconds (default 30000) */
  timeout?: number;
  /** Retry policy for connection failures */
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

/** Represents an active connection to an external MCP server. */
export interface MCPClientConnection {
  /** Unique connection identifier */
  id: string;
  /** URL of the connected server */
  serverUrl: string;
  /** Current connection status */
  status: 'connected' | 'disconnected' | 'reconnecting' | 'error';
  /** When the connection was established */
  connectedAt?: Date;
  /** Last activity timestamp */
  lastActivity?: Date;
  /** Tools discovered on this server */
  tools: MCPToolDefinition[];
  /** Consecutive error count (for circuit breaker) */
  errorCount: number;
}

/** A tool match result from capability-based search. */
export interface MCPToolMatch {
  /** The matched tool definition */
  tool: MCPToolDefinition;
  /** Connection ID where this tool is available */
  connectionId: string;
  /** Server URL where this tool is available */
  serverUrl: string;
  /** Relevance score (0-1, higher is better) */
  relevanceScore: number;
}

// ---------------------------------------------------------------------------
// MCP Tool Registry Types
// Requirements: 36c.10, 36c.11, 36c.12
// ---------------------------------------------------------------------------

/** An entry in the MCP Tool Registry representing a registered tool. */
export interface MCPRegistryEntry {
  /** Unique tool identifier (format: {source}:{agentId|serverUrl}:{toolName}) */
  toolId: string;
  /** Tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Whether the tool is internal (agent) or external (MCP server) */
  source: 'internal' | 'external';
  /** Agent ID (for internal tools) */
  agentId?: string;
  /** Server URL (for external tools) */
  serverUrl?: string;
  /** JSON Schema defining the tool's input parameters */
  inputSchema: Record<string, unknown>;
  /** JSON Schema defining the tool's output format */
  outputSchema?: Record<string, unknown>;
  /** Minimum authority level required to invoke this tool */
  requiredAuthority: string;
  /** Current availability status */
  availability: 'available' | 'degraded' | 'unavailable';
  /** Estimated cost in USD per invocation */
  costEstimate?: number;
  /** Last health check timestamp */
  lastHealthCheck?: Date;
  /** When the tool was registered */
  registeredAt: Date;
}

/** A tool match result from the registry's capability-based search. */
export interface MCPRegistryToolMatch {
  /** The matched registry entry */
  entry: MCPRegistryEntry;
  /** Relevance score (0-1, higher is better) */
  relevanceScore: number;
}

/** Interface for the MCP Tool Registry that manages all available tools. */
export interface MCPToolRegistry {
  /** Register internal tools for an agent with schema validation */
  registerInternalTools(agentId: string, tools: MCPToolDefinition[]): void;
  /** Register tools from an external MCP server */
  registerExternalServer(serverUrl: string, tools: MCPToolDefinition[]): void;
  /** Unregister all tools for an agent */
  unregisterAgent(agentId: string): void;
  /** Unregister all tools for an external server */
  unregisterServer(serverUrl: string): void;
  /** List all registered tools */
  listAllTools(): MCPRegistryEntry[];
  /** Search tools by keyword matching on name and description */
  searchTools(query: string): MCPRegistryEntry[];
  /** Get a specific tool's schema by ID */
  getToolSchema(toolId: string): MCPRegistryEntry | undefined;
  /** Find tools matching a capability description using keyword similarity */
  findByCapability(capabilityDescription: string): MCPRegistryToolMatch[];
  /** Get tool count breakdown by source */
  getToolCount(): { internal: number; external: number; total: number };
  /** Update a tool's availability status */
  updateAvailability(toolId: string, availability: 'available' | 'degraded' | 'unavailable'): void;
}

// ---------------------------------------------------------------------------
// MCP Client Types (for consuming external MCP servers)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Kiro-Seraphim Bridge Types
// Requirements: 36d.13, 36d.14, 36d.15
// ---------------------------------------------------------------------------

/** Current status of the Kiro-Seraphim bridge connection. */
export type BridgeStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error';

/** Kiro IDE tool names that can be invoked from SeraphimOS agents. */
export type KiroToolName = 'readFile' | 'writeFile' | 'runCommand' | 'search' | 'getDiagnostics';

/** Represents a tool invocation request from SeraphimOS to Kiro. */
export interface KiroToolInvocation {
  /** The Kiro tool to invoke */
  tool: KiroToolName;
  /** Arguments to pass to the tool */
  args: Record<string, unknown>;
}

/** Interface for the Kiro-Seraphim MCP Bridge. */
export interface KiroSeraphimBridge {
  /** Establish the bridge connection with a Kiro session */
  connect(sessionId: string): Promise<void>;
  /** Disconnect the bridge */
  disconnect(): Promise<void>;
  /** Get current bridge status */
  getStatus(): BridgeStatus;
  /** Get the connected session ID */
  getSessionId(): string | null;

  // Kiro → Seraphim direction
  /** Handle a tool call from Kiro to a SeraphimOS agent */
  handleKiroToolCall(agentId: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult>;
  /** Get all agent tools available to Kiro */
  getExposedTools(): MCPToolDefinition[];

  // Seraphim → Kiro direction
  /** Invoke a Kiro tool from a SeraphimOS agent */
  invokeKiroTool(invocation: KiroToolInvocation): Promise<MCPToolResult>;
  /** Check if a specific Kiro tool is available */
  isKiroToolAvailable(tool: KiroToolName): boolean;
}

// ---------------------------------------------------------------------------
// MCP Client Types (for consuming external MCP servers)
// ---------------------------------------------------------------------------

/** Optional transport adapter for MCP client connections (enables testing). */
export interface MCPTransportAdapter {
  /** Establish a connection to the server */
  connect(serverUrl: string, authToken?: string): Promise<void>;
  /** Send a request and receive a response */
  sendRequest(request: MCPRequest): Promise<MCPResponse>;
  /** Close the connection */
  disconnect(): Promise<void>;
  /** Whether the transport is currently connected */
  isConnected(): boolean;
}

/** Optional cost tracking callback for Otzar integration. */
export type MCPCostTracker = (
  connectionId: string,
  toolName: string,
  durationMs: number,
  costEstimate?: number,
) => void;

/** Interface for the MCP Client Manager that connects to external MCP servers. */
export interface MCPClientManager {
  /** Connect to an external MCP server */
  connect(serverUrl: string, config: MCPClientConfig): Promise<MCPClientConnection>;
  /** Disconnect from an external MCP server */
  disconnect(connectionId: string): Promise<void>;
  /** Reconnect to an external MCP server */
  reconnect(connectionId: string): Promise<void>;
  /** Discover tools available on a connected server */
  discoverTools(connectionId: string): Promise<MCPToolDefinition[]>;
  /** Find tools matching a capability description (keyword-based search) */
  findToolByCapability(description: string): Promise<MCPToolMatch[]>;
  /** Invoke a tool on a connected external server */
  invokeTool(connectionId: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult>;
  /** Get the health/status of a connection */
  getConnectionHealth(connectionId: string): MCPClientConnection | undefined;
  /** Get all active connections */
  getConnections(): MCPClientConnection[];
}
