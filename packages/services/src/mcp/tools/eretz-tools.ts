/**
 * Eretz Agent — MCP Tool Definitions
 *
 * Tools exposed by the Eretz (holding company) agent for portfolio metrics,
 * synergy detection, pattern library queries, and directive enrichment.
 *
 * Requirements: 36a.5
 */

import type { MCPToolDefinition } from '../types.js';

/**
 * Returns the array of MCP tool definitions for the Eretz agent.
 */
export function getEretzTools(): MCPToolDefinition[] {
  return [
    {
      name: 'get_portfolio_metrics',
      description: 'Get aggregated portfolio metrics across subsidiaries including revenue, growth rates, operational efficiency, and cross-pillar performance indicators.',
      inputSchema: {
        type: 'object',
        properties: {
          timeRange: {
            type: 'string',
            enum: ['24h', '7d', '30d', '90d', 'ytd'],
            description: 'Time range for metrics aggregation.',
          },
          pillars: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific pillars to include. Omit for all.',
          },
          metrics: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific metrics to retrieve (e.g., "revenue", "growth", "efficiency").',
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
            timeRange: params.timeRange ?? '30d',
            pillars: params.pillars ?? ['zionx', 'zxmg', 'zion-alpha'],
            aggregated: {
              totalRevenue: 0,
              growthRate: 0,
              operationalEfficiency: 0,
            },
            lastUpdated: new Date().toISOString(),
          },
        };
      },
    },
    {
      name: 'get_synergy_status',
      description: 'Get current synergy detection and activation status. Shows identified cross-pillar synergies, their activation state, and estimated value.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['detected', 'active', 'completed', 'all'],
            description: 'Filter synergies by activation status.',
          },
          minValue: {
            type: 'number',
            description: 'Minimum estimated value threshold to filter synergies.',
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
            synergies: [],
            total: 0,
            filter: {
              status: params.status ?? 'all',
              minValue: params.minValue ?? 0,
            },
            totalEstimatedValue: 0,
          },
        };
      },
    },
    {
      name: 'query_pattern_library',
      description: 'Search the reusable business pattern library. Patterns are proven strategies, workflows, and approaches that can be applied across pillars.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to find relevant patterns.',
          },
          category: {
            type: 'string',
            enum: ['growth', 'efficiency', 'monetization', 'engagement', 'risk-management'],
            description: 'Pattern category to filter by.',
          },
          applicablePillar: {
            type: 'string',
            description: 'Filter patterns applicable to a specific pillar.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of patterns to return.',
          },
        },
        required: ['query'],
      },
      requiredAuthority: 'L4',
      costEstimate: 0.01,
      handler: async (params) => {
        return {
          success: true,
          output: {
            patterns: [],
            total: 0,
            query: params.query,
            category: params.category ?? 'all',
          },
        };
      },
    },
    {
      name: 'enrich_directive',
      description: 'Enrich a directive with business intelligence. Adds context from portfolio data, historical patterns, and cross-pillar insights to improve directive execution.',
      inputSchema: {
        type: 'object',
        properties: {
          directiveId: {
            type: 'string',
            description: 'ID of the directive to enrich.',
          },
          enrichmentTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['market-context', 'historical-patterns', 'resource-availability', 'risk-assessment'],
            },
            description: 'Types of enrichment to apply.',
          },
        },
        required: ['directiveId'],
      },
      requiredAuthority: 'L2',
      costEstimate: 0.03,
      handler: async (params) => {
        return {
          success: true,
          output: {
            directiveId: params.directiveId,
            enrichments: [],
            enrichmentTypes: params.enrichmentTypes ?? ['market-context', 'historical-patterns'],
            enrichedAt: new Date().toISOString(),
          },
        };
      },
    },
  ];
}
