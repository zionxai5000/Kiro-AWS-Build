/**
 * Zion Alpha Agent — MCP Tool Definitions
 *
 * Tools exposed by the Zion Alpha (Trading) agent for position management,
 * strategy monitoring, market scanning, and trade history retrieval.
 *
 * Requirements: 36a.5
 */

import type { MCPToolDefinition } from '../types.js';

/**
 * Returns the array of MCP tool definitions for the Zion Alpha agent.
 */
export function getZionAlphaTools(): MCPToolDefinition[] {
  return [
    {
      name: 'get_positions',
      description: 'Get current open positions. Shows all active trading positions with entry price, current value, P&L, and risk metrics.',
      inputSchema: {
        type: 'object',
        properties: {
          market: {
            type: 'string',
            description: 'Filter positions by market (e.g., "kalshi", "crypto", "equities").',
          },
          strategy: {
            type: 'string',
            description: 'Filter positions by strategy name.',
          },
          minValue: {
            type: 'number',
            description: 'Minimum position value threshold.',
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
            positions: [],
            total: 0,
            filter: {
              market: params.market ?? 'all',
              strategy: params.strategy ?? 'all',
            },
            totalValue: 0,
            totalPnL: 0,
            lastUpdated: new Date().toISOString(),
          },
        };
      },
    },
    {
      name: 'get_strategy_status',
      description: 'Get trading strategy performance. Shows active strategies with their win rate, P&L, risk metrics, and current allocation.',
      inputSchema: {
        type: 'object',
        properties: {
          strategyId: {
            type: 'string',
            description: 'Specific strategy ID to query. Omit for all strategies.',
          },
          timeRange: {
            type: 'string',
            enum: ['24h', '7d', '30d', '90d', 'all-time'],
            description: 'Time range for performance metrics.',
          },
          includeBacktest: {
            type: 'boolean',
            description: 'Whether to include backtest results alongside live performance.',
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
            strategies: [],
            total: 0,
            strategyId: params.strategyId ?? null,
            timeRange: params.timeRange ?? '30d',
            aggregatePerformance: {
              winRate: 0,
              totalPnL: 0,
              sharpeRatio: 0,
              maxDrawdown: 0,
            },
          },
        };
      },
    },
    {
      name: 'get_market_scans',
      description: 'Get recent market scan results and opportunities. Shows identified trading opportunities from automated market analysis with confidence scores and risk levels.',
      inputSchema: {
        type: 'object',
        properties: {
          markets: {
            type: 'array',
            items: { type: 'string' },
            description: 'Markets to scan (e.g., ["kalshi", "crypto"]). Omit for all configured markets.',
          },
          strategy: {
            type: 'string',
            description: 'Strategy to use for opportunity evaluation.',
          },
          minConfidence: {
            type: 'number',
            description: 'Minimum confidence threshold (0-1) for reported opportunities.',
          },
          maxRisk: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Maximum acceptable risk level for opportunities.',
          },
        },
        required: [],
      },
      requiredAuthority: 'L2',
      costEstimate: 0.05,
      handler: async (params) => {
        return {
          success: true,
          output: {
            scanId: `scan-${Date.now()}`,
            markets: params.markets ?? ['all'],
            opportunities: [],
            totalScanned: 0,
            minConfidence: params.minConfidence ?? 0.7,
            maxRisk: params.maxRisk ?? 'medium',
            completedAt: new Date().toISOString(),
          },
        };
      },
    },
    {
      name: 'get_trade_history',
      description: 'Get recent trade history. Returns executed trades with entry/exit details, P&L, and strategy attribution.',
      inputSchema: {
        type: 'object',
        properties: {
          timeRange: {
            type: 'string',
            enum: ['24h', '7d', '30d', '90d'],
            description: 'Time range for trade history.',
          },
          market: {
            type: 'string',
            description: 'Filter trades by market.',
          },
          strategy: {
            type: 'string',
            description: 'Filter trades by strategy.',
          },
          outcome: {
            type: 'string',
            enum: ['win', 'loss', 'breakeven', 'all'],
            description: 'Filter trades by outcome.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of trades to return.',
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
            trades: [],
            total: 0,
            filter: {
              timeRange: params.timeRange ?? '7d',
              market: params.market ?? 'all',
              strategy: params.strategy ?? 'all',
              outcome: params.outcome ?? 'all',
            },
            summary: {
              totalTrades: 0,
              winRate: 0,
              totalPnL: 0,
              avgHoldTime: '0h',
            },
          },
        };
      },
    },
  ];
}
