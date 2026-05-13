/**
 * MCP Tool Registry — In-memory implementation of the MCPToolRegistry interface.
 *
 * Manages a unified registry of all available tools (internal agent tools and
 * external MCP server tools). Supports dynamic registration, keyword-based
 * search, and capability matching using keyword overlap scoring.
 *
 * Requirements: 36c.10, 36c.11, 36c.12
 */

import type {
  MCPToolRegistry,
  MCPToolDefinition,
  MCPRegistryEntry,
  MCPRegistryToolMatch,
} from './types.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * MCPToolRegistryImpl manages a unified registry of all available tools.
 *
 * Features:
 * - Internal tool registration with schema validation (Req 36c.10)
 * - External server tool registration with health monitoring (Req 36c.11)
 * - Query and discovery: listAllTools, searchTools, getToolSchema (Req 36c.12)
 * - Semantic capability matching using keyword overlap scoring
 * - Dynamic registration: tools added immediately without restart
 */
export class MCPToolRegistryImpl implements MCPToolRegistry {
  /** All registered tools indexed by toolId */
  private readonly registry = new Map<string, MCPRegistryEntry>();

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Register internal tools for an agent with schema validation.
   *
   * Each tool must have a name, description, and inputSchema. Tools that
   * fail validation are skipped with a warning.
   *
   * @param agentId - The agent ID these tools belong to.
   * @param tools - Array of tool definitions to register.
   * @throws Error if agentId is empty.
   */
  registerInternalTools(agentId: string, tools: MCPToolDefinition[]): void {
    if (!agentId || agentId.trim().length === 0) {
      throw new Error('agentId is required for internal tool registration');
    }

    for (const tool of tools) {
      if (!this.validateToolDefinition(tool)) {
        continue;
      }

      const toolId = this.generateToolId('internal', agentId, tool.name);
      const entry: MCPRegistryEntry = {
        toolId,
        name: tool.name,
        description: tool.description,
        source: 'internal',
        agentId,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        requiredAuthority: tool.requiredAuthority,
        availability: 'available',
        costEstimate: tool.costEstimate,
        registeredAt: new Date(),
      };

      this.registry.set(toolId, entry);
    }
  }

  /**
   * Register tools from an external MCP server.
   *
   * @param serverUrl - The URL of the external MCP server.
   * @param tools - Array of tool definitions discovered on the server.
   * @throws Error if serverUrl is empty.
   */
  registerExternalServer(serverUrl: string, tools: MCPToolDefinition[]): void {
    if (!serverUrl || serverUrl.trim().length === 0) {
      throw new Error('serverUrl is required for external server registration');
    }

    for (const tool of tools) {
      if (!this.validateToolDefinition(tool)) {
        continue;
      }

      const toolId = this.generateToolId('external', serverUrl, tool.name);
      const entry: MCPRegistryEntry = {
        toolId,
        name: tool.name,
        description: tool.description,
        source: 'external',
        serverUrl,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        requiredAuthority: tool.requiredAuthority,
        availability: 'available',
        costEstimate: tool.costEstimate,
        lastHealthCheck: new Date(),
        registeredAt: new Date(),
      };

      this.registry.set(toolId, entry);
    }
  }

  /**
   * Unregister all tools for a given agent.
   *
   * @param agentId - The agent whose tools should be removed.
   */
  unregisterAgent(agentId: string): void {
    for (const [toolId, entry] of this.registry) {
      if (entry.source === 'internal' && entry.agentId === agentId) {
        this.registry.delete(toolId);
      }
    }
  }

  /**
   * Unregister all tools for a given external server.
   *
   * @param serverUrl - The server URL whose tools should be removed.
   */
  unregisterServer(serverUrl: string): void {
    for (const [toolId, entry] of this.registry) {
      if (entry.source === 'external' && entry.serverUrl === serverUrl) {
        this.registry.delete(toolId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Query and Discovery
  // -------------------------------------------------------------------------

  /**
   * List all registered tools.
   *
   * @returns Array of all registry entries.
   */
  listAllTools(): MCPRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Search tools by keyword matching on name and description.
   *
   * @param query - Search query string.
   * @returns Array of matching registry entries.
   */
  searchTools(query: string): MCPRegistryEntry[] {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const keywords = this.extractKeywords(query);
    if (keywords.length === 0) {
      return [];
    }

    const results: Array<{ entry: MCPRegistryEntry; score: number }> = [];

    for (const entry of this.registry.values()) {
      const score = this.computeKeywordScore(entry, keywords);
      if (score > 0) {
        results.push({ entry, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.map((r) => r.entry);
  }

  /**
   * Get a specific tool's schema by ID.
   *
   * @param toolId - The unique tool identifier.
   * @returns The registry entry or undefined if not found.
   */
  getToolSchema(toolId: string): MCPRegistryEntry | undefined {
    return this.registry.get(toolId);
  }

  /**
   * Find tools matching a capability description using keyword similarity.
   *
   * Uses keyword overlap scoring (same approach as client-manager) to find
   * tools whose name and description match the given capability description.
   *
   * @param capabilityDescription - Natural language description of the desired capability.
   * @returns Array of matching tools sorted by relevance score (descending).
   */
  findByCapability(capabilityDescription: string): MCPRegistryToolMatch[] {
    if (!capabilityDescription || capabilityDescription.trim().length === 0) {
      return [];
    }

    const keywords = this.extractKeywords(capabilityDescription);
    if (keywords.length === 0) {
      return [];
    }

    const matches: MCPRegistryToolMatch[] = [];

    for (const entry of this.registry.values()) {
      const score = this.computeRelevanceScore(entry, keywords);
      if (score > 0) {
        matches.push({ entry, relevanceScore: score });
      }
    }

    // Sort by relevance score descending
    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return matches;
  }

  // -------------------------------------------------------------------------
  // Status and Metrics
  // -------------------------------------------------------------------------

  /**
   * Get tool count breakdown by source.
   *
   * @returns Object with internal, external, and total counts.
   */
  getToolCount(): { internal: number; external: number; total: number } {
    let internal = 0;
    let external = 0;

    for (const entry of this.registry.values()) {
      if (entry.source === 'internal') {
        internal++;
      } else {
        external++;
      }
    }

    return { internal, external, total: internal + external };
  }

  /**
   * Update a tool's availability status.
   *
   * @param toolId - The tool to update.
   * @param availability - The new availability status.
   * @throws Error if the tool is not found.
   */
  updateAvailability(
    toolId: string,
    availability: 'available' | 'degraded' | 'unavailable',
  ): void {
    const entry = this.registry.get(toolId);
    if (!entry) {
      throw new Error(`Tool not found: ${toolId}`);
    }
    entry.availability = availability;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Validate that a tool definition has the required fields.
   */
  private validateToolDefinition(tool: MCPToolDefinition): boolean {
    if (!tool.name || tool.name.trim().length === 0) {
      return false;
    }
    if (!tool.description || tool.description.trim().length === 0) {
      return false;
    }
    if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
      return false;
    }
    return true;
  }

  /**
   * Generate a unique tool ID in the format {source}:{identifier}:{toolName}.
   */
  private generateToolId(source: 'internal' | 'external', identifier: string, toolName: string): string {
    return `${source}:${identifier}:${toolName}`;
  }

  /**
   * Extract keywords from a string.
   * Lowercases, removes punctuation, and filters common stop words.
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'can', 'shall',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
      'that', 'this', 'it', 'and', 'or', 'but', 'not', 'if', 'then',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 1 && !stopWords.has(word));
  }

  /**
   * Compute a keyword match score for search operations.
   * Returns the number of keyword matches (not normalized).
   */
  private computeKeywordScore(entry: MCPRegistryEntry, keywords: string[]): number {
    const entryText = `${entry.name} ${entry.description}`.toLowerCase();
    const entryWords = entryText.replace(/[^\w\s]/g, '').split(/\s+/);
    const entryWordSet = new Set(entryWords);

    let score = 0;
    for (const keyword of keywords) {
      if (entryWordSet.has(keyword)) {
        score++;
      } else if (entryWords.some((w) => w.includes(keyword) || keyword.includes(w))) {
        score += 0.5;
      }
    }

    return score;
  }

  /**
   * Compute a relevance score (0-1) for capability matching.
   * Uses keyword overlap between the query and the entry's name + description.
   */
  private computeRelevanceScore(entry: MCPRegistryEntry, keywords: string[]): number {
    const entryText = `${entry.name} ${entry.description}`.toLowerCase();
    const entryWords = entryText.replace(/[^\w\s]/g, '').split(/\s+/);
    const entryWordSet = new Set(entryWords);

    let matchCount = 0;
    for (const keyword of keywords) {
      if (entryWordSet.has(keyword)) {
        matchCount++;
      } else if (entryWords.some((w) => w.includes(keyword) || keyword.includes(w))) {
        matchCount += 0.5;
      }
    }

    return Math.min(matchCount / keywords.length, 1);
  }
}
