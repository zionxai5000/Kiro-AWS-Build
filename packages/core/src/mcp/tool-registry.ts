/**
 * MCP Tool Registry — Dynamic tool discovery and selection.
 *
 * Requirements: 51.1, 51.2, 51.3, 51.4, 51.5, 51.6, 51.7
 */

import type { MCPToolDescriptor } from '../agent-runtime/cognition-envelope.js';

export class MCPToolRegistry {
  private tools: Map<string, MCPToolDescriptor> = new Map();

  /**
   * Register a tool in the registry.
   */
  register(tool: MCPToolDescriptor): void {
    this.tools.set(tool.id, tool);
  }

  /**
   * Remove a tool from the registry.
   */
  unregister(toolId: string): void {
    this.tools.delete(toolId);
  }

  /**
   * Discover tools matching a semantic query (capability tags).
   */
  discover(capabilities: string[]): MCPToolDescriptor[] {
    const results: MCPToolDescriptor[] = [];
    for (const tool of this.tools.values()) {
      if (tool.status === 'unavailable') continue;
      const matchScore = capabilities.filter(cap =>
        tool.capabilities.some(tc => tc.toLowerCase().includes(cap.toLowerCase()))
      ).length;
      if (matchScore > 0) results.push(tool);
    }
    return results.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  }

  /**
   * Select the best tool for a task based on cost, reliability, and permissions.
   */
  selectBest(
    capabilities: string[],
    maxCost: number,
    minReliability: number,
    authorityLevel: 'L1' | 'L2' | 'L3' | 'L4',
  ): MCPToolDescriptor | null {
    const AUTHORITY_ORDER = ['L4', 'L3', 'L2', 'L1'];
    const agentLevel = AUTHORITY_ORDER.indexOf(authorityLevel);

    const candidates = this.discover(capabilities).filter(tool => {
      if (tool.costPerInvocation > maxCost) return false;
      if (tool.reliabilityScore < minReliability) return false;
      const toolLevel = AUTHORITY_ORDER.indexOf(tool.requiredAuthorityLevel);
      if (toolLevel > agentLevel) return false; // Agent doesn't have sufficient authority
      return true;
    });

    if (candidates.length === 0) return null;

    // Score: higher reliability + lower cost = better
    candidates.sort((a, b) => {
      const scoreA = a.reliabilityScore * 100 - a.costPerInvocation * 10;
      const scoreB = b.reliabilityScore * 100 - b.costPerInvocation * 10;
      return scoreB - scoreA;
    });

    return candidates[0]!;
  }

  /**
   * Get fallback tools for a given tool.
   */
  getFallbacks(toolId: string): MCPToolDescriptor[] {
    const tool = this.tools.get(toolId);
    if (!tool) return [];
    return tool.fallbackTools
      .map(id => this.tools.get(id))
      .filter((t): t is MCPToolDescriptor => t !== undefined && t.status !== 'unavailable');
  }

  /**
   * Get all registered tools.
   */
  listAll(): MCPToolDescriptor[] {
    return Array.from(this.tools.values());
  }

  /**
   * Update tool health status.
   */
  updateHealth(toolId: string, status: 'available' | 'degraded' | 'unavailable'): void {
    const tool = this.tools.get(toolId);
    if (tool) {
      tool.status = status;
      tool.lastHealthCheck = new Date();
    }
  }

  /**
   * Record a tool invocation result (updates reliability score).
   */
  recordInvocation(toolId: string, success: boolean): void {
    const tool = this.tools.get(toolId);
    if (tool) {
      // Exponential moving average for reliability
      const alpha = 0.1;
      tool.reliabilityScore = tool.reliabilityScore * (1 - alpha) + (success ? 1 : 0) * alpha;
    }
  }
}
