/**
 * ZionX Agent — MCP Tool Definitions
 *
 * Tools exposed by the ZionX (App Factory) agent for app pipeline status,
 * pipeline triggering, gate check results, and design system queries.
 *
 * Requirements: 36a.5
 */

import type { MCPToolDefinition } from '../types.js';

/**
 * Returns the array of MCP tool definitions for the ZionX agent.
 */
export function getZionXTools(): MCPToolDefinition[] {
  return [
    {
      name: 'get_app_status',
      description: 'Get status of apps in the pipeline. Shows current stage, progress, and any blockers for apps being developed by ZionX.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: {
            type: 'string',
            description: 'Specific app ID to query. Omit for all apps.',
          },
          stage: {
            type: 'string',
            enum: ['ideation', 'design', 'development', 'testing', 'review', 'deployment', 'live'],
            description: 'Filter apps by current pipeline stage.',
          },
          includeMetrics: {
            type: 'boolean',
            description: 'Whether to include performance metrics for live apps.',
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
            apps: [],
            total: 0,
            filter: {
              appId: params.appId ?? null,
              stage: params.stage ?? 'all',
            },
            lastUpdated: new Date().toISOString(),
          },
        };
      },
    },
    {
      name: 'trigger_pipeline',
      description: 'Trigger a pipeline stage for an app. Advances the app to the next stage or re-runs the current stage with updated parameters.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: {
            type: 'string',
            description: 'The app ID to trigger the pipeline for.',
          },
          stage: {
            type: 'string',
            enum: ['design', 'development', 'testing', 'review', 'deployment'],
            description: 'The pipeline stage to trigger.',
          },
          parameters: {
            type: 'object',
            description: 'Optional parameters for the pipeline stage execution.',
          },
          force: {
            type: 'boolean',
            description: 'Whether to force-trigger even if gates have not passed.',
          },
        },
        required: ['appId', 'stage'],
      },
      requiredAuthority: 'L2',
      costEstimate: 0.10,
      handler: async (params) => {
        return {
          success: true,
          output: {
            appId: params.appId,
            stage: params.stage,
            triggeredAt: new Date().toISOString(),
            executionId: `exec-${Date.now()}`,
            status: 'triggered',
          },
        };
      },
    },
    {
      name: 'get_gate_results',
      description: 'Get gate check results for an app. Shows which quality gates have passed or failed for a given pipeline stage transition.',
      inputSchema: {
        type: 'object',
        properties: {
          appId: {
            type: 'string',
            description: 'The app ID to get gate results for.',
          },
          stage: {
            type: 'string',
            enum: ['design', 'development', 'testing', 'review', 'deployment'],
            description: 'The pipeline stage to get gate results for.',
          },
          executionId: {
            type: 'string',
            description: 'Specific execution ID. Omit for the latest execution.',
          },
        },
        required: ['appId'],
      },
      requiredAuthority: 'L4',
      costEstimate: 0,
      handler: async (params) => {
        return {
          success: true,
          output: {
            appId: params.appId,
            stage: params.stage ?? 'latest',
            gates: [],
            overallResult: 'pending',
            executionId: params.executionId ?? null,
          },
        };
      },
    },
    {
      name: 'query_design_system',
      description: 'Query the design intelligence system. Search for design tokens, component patterns, and UI guidelines used across ZionX apps.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for design system elements.',
          },
          category: {
            type: 'string',
            enum: ['tokens', 'components', 'patterns', 'guidelines', 'icons'],
            description: 'Category of design system elements to search.',
          },
          platform: {
            type: 'string',
            enum: ['ios', 'android', 'web', 'all'],
            description: 'Target platform to filter results.',
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
            results: [],
            total: 0,
            query: params.query,
            category: params.category ?? 'all',
            platform: params.platform ?? 'all',
          },
        };
      },
    },
  ];
}
