/**
 * MCP (Model Context Protocol) module.
 *
 * Provides MCP server hosting for SeraphimOS agents, enabling external
 * systems (Kiro, other MCP clients) to discover and invoke agent tools
 * through the standard MCP protocol. Also provides the MCP Client Manager
 * for connecting to external MCP servers as a client, and the MCP Tool
 * Registry for unified tool discovery and management.
 */

export { MCPServerHostImpl } from './server-host.js';
export { MCPClientManagerImpl } from './client-manager.js';
export { MCPToolRegistryImpl } from './tool-registry.js';
export { KiroSeraphimBridgeImpl } from './kiro-bridge.js';
export type {
  MCPServerHost,
  MCPServerConfig,
  MCPServer,
  MCPConnection,
  MCPToolDefinition,
  MCPToolResult,
  MCPRequest,
  MCPResponse,
  MCPError,
  MCPAuthValidator,
  MCPRateLimitConfig,
  MCPClientManager,
  MCPClientConfig,
  MCPClientConnection,
  MCPToolMatch,
  MCPTransportAdapter,
  MCPCostTracker,
  MCPToolRegistry,
  MCPRegistryEntry,
  MCPRegistryToolMatch,
  KiroSeraphimBridge,
  KiroToolInvocation,
  KiroToolName,
  BridgeStatus,
} from './types.js';
export { MCP_ERROR_CODES } from './types.js';
