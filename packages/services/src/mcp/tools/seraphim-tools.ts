/**
 * Seraphim Agent — MCP Tool Definitions
 *
 * Tools exposed by the Seraphim orchestrator agent for system health monitoring,
 * directive submission, recommendation retrieval, and parallel execution status.
 *
 * Requirements: 36a.5
 */

import type { MCPToolDefinition } from '../types.js';

/**
 * Returns the array of MCP tool definitions for the Seraphim agent.
 */
export function getSeraphimTools(): MCPToolDefinition[] {
  return [
    {
      name: 'system_health',
      description: 'Get overall system health status including agent states, service availability, and resource utilization across all pillars.',
      inputSchema: {
        type: 'object',
        properties: {
          pillar: {
            type: 'string',
            description: 'Optional pillar to filter health status (e.g., "zionx", "zxmg", "zion-alpha"). Omit for system-wide health.',
          },
          includeMetrics: {
            type: 'boolean',
            description: 'Whether to include detailed resource metrics in the response.',
          },
        },
        required: [],
      },
      requiredAuthority: 'L4',
      costEstimate: 0,
      handler: async (params) => {
        return {
          success: true,
          output: {
            status: 'healthy',
            pillar: params.pillar ?? 'all',
            agents: { total: 5, healthy: 5, degraded: 0 },
            services: { total: 6, running: 6, stopped: 0 },
            uptime: '99.97%',
            lastChecked: new Date().toISOString(),
          },
        };
      },
    },
    {
      name: 'submit_directive',
      description: 'Submit a directive to Seraphim for processing. Directives are high-level instructions from the King that Seraphim decomposes into tasks for subsidiary agents.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short title summarizing the directive.',
          },
          content: {
            type: 'string',
            description: 'Full directive content describing the desired outcome.',
          },
          priority: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
            description: 'Priority level for processing.',
          },
          targetPillars: {
            type: 'array',
            items: { type: 'string' },
            description: 'Pillars this directive applies to. Omit for Seraphim to determine automatically.',
          },
        },
        required: ['title', 'content', 'priority'],
      },
      requiredAuthority: 'L2',
      costEstimate: 0.05,
      handler: async (params) => {
        return {
          success: true,
          output: {
            directiveId: `dir-${Date.now()}`,
            status: 'accepted',
            title: params.title,
            priority: params.priority,
            estimatedCompletionTime: '2h',
            assignedPillars: params.targetPillars ?? ['auto-detected'],
          },
        };
      },
    },
    {
      name: 'get_recommendations',
      description: 'Get pending recommendations from the queue. Recommendations are suggestions from agents that require King approval before execution.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'approved', 'rejected', 'all'],
            description: 'Filter recommendations by status.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of recommendations to return.',
          },
          pillar: {
            type: 'string',
            description: 'Filter by originating pillar.',
          },
        },
        required: [],
      },
      requiredAuthority: 'L4',
      costEstimate: 0,
      handler: async (params) => {
        return {
          success: true,
          output: {
            recommendations: [],
            total: 0,
            filter: {
              status: params.status ?? 'pending',
              pillar: params.pillar ?? 'all',
            },
          },
        };
      },
    },
    {
      name: 'get_parallel_status',
      description: 'Get status of active parallel executions. Shows currently running parallel task groups, their progress, and resource consumption.',
      inputSchema: {
        type: 'object',
        properties: {
          executionId: {
            type: 'string',
            description: 'Specific parallel execution ID to query. Omit for all active executions.',
          },
          includeCompleted: {
            type: 'boolean',
            description: 'Whether to include recently completed parallel executions.',
          },
        },
        required: [],
      },
      requiredAuthority: 'L4',
      costEstimate: 0,
      handler: async (params) => {
        return {
          success: true,
          output: {
            activeExecutions: [],
            totalActive: 0,
            executionId: params.executionId ?? null,
            includeCompleted: params.includeCompleted ?? false,
          },
        };
      },
    },
  ];
}
