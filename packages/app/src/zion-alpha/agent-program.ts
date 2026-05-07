/**
 * Zion Alpha Trading — Agent Program Definition
 *
 * Defines the Zion Alpha agent program with a state machine for the trading
 * lifecycle: scanning → evaluating → positioning → monitoring → exiting → settled.
 *
 * Authority level L3 (peer verification for trades above threshold).
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import type {
  AgentProgram,
  StateMachineDefinition,
  CompletionContract,
} from '@seraphim/core';

// ---------------------------------------------------------------------------
// Zion Alpha State Machine Definition
// ---------------------------------------------------------------------------

export const ZION_ALPHA_STATE_MACHINE: StateMachineDefinition = {
  id: 'zion-alpha-trading-lifecycle',
  name: 'Zion Alpha Trading Lifecycle',
  version: '1.0.0',

  states: {
    scanning: {
      name: 'scanning',
      type: 'initial',
      onEnter: [{ type: 'log', config: { message: 'Market scanning initiated' } }],
    },
    evaluating: {
      name: 'evaluating',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Evaluating opportunity against risk parameters' } }],
      timeout: { duration: 300000, transitionTo: 'scanning' }, // 5m timeout
    },
    positioning: {
      name: 'positioning',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Executing trade entry' } }],
    },
    monitoring: {
      name: 'monitoring',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Monitoring open position' } }],
    },
    exiting: {
      name: 'exiting',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Executing trade exit' } }],
    },
    settled: {
      name: 'settled',
      type: 'terminal',
      onEnter: [{ type: 'log', config: { message: 'Trade settled and recorded' } }],
    },
  },

  initialState: 'scanning',
  terminalStates: ['settled'],

  transitions: [
    {
      from: 'scanning',
      to: 'evaluating',
      event: 'opportunity_found',
      gates: [
        {
          id: 'gate-market-open',
          name: 'Market Open Check',
          type: 'condition',
          config: { requiresMarketOpen: true },
          required: true,
        },
      ],
    },
    {
      from: 'evaluating',
      to: 'positioning',
      event: 'opportunity_approved',
      gates: [
        {
          id: 'gate-risk-check',
          name: 'Risk Parameters Check',
          type: 'validation',
          config: { requiresRiskApproval: true },
          required: true,
        },
        {
          id: 'gate-position-size',
          name: 'Position Size Limit',
          type: 'validation',
          config: { enforcePositionLimit: true },
          required: true,
        },
        {
          id: 'gate-daily-loss',
          name: 'Daily Loss Limit',
          type: 'validation',
          config: { enforceDailyLossLimit: true },
          required: true,
        },
        {
          id: 'gate-budget-check',
          name: 'Budget Availability',
          type: 'validation',
          config: { requiresBudgetApproval: true },
          required: true,
        },
      ],
      actions: [{ type: 'execute_trade', config: { action: 'enter' } }],
    },
    {
      from: 'evaluating',
      to: 'scanning',
      event: 'opportunity_rejected',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Opportunity rejected — does not meet risk parameters' } }],
    },
    {
      from: 'positioning',
      to: 'monitoring',
      event: 'position_opened',
      gates: [],
    },
    {
      from: 'positioning',
      to: 'scanning',
      event: 'position_failed',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Trade execution failed' } }],
    },
    {
      from: 'monitoring',
      to: 'exiting',
      event: 'exit_trigger',
      gates: [],
      actions: [{ type: 'execute_trade', config: { action: 'exit' } }],
    },
    {
      from: 'monitoring',
      to: 'exiting',
      event: 'stop_loss_hit',
      gates: [],
      actions: [{ type: 'execute_trade', config: { action: 'stop_loss' } }],
    },
    {
      from: 'monitoring',
      to: 'exiting',
      event: 'take_profit_hit',
      gates: [],
      actions: [{ type: 'execute_trade', config: { action: 'take_profit' } }],
    },
    {
      from: 'exiting',
      to: 'settled',
      event: 'trade_settled',
      gates: [],
      actions: [{ type: 'log_trade', config: { action: 'record_outcome' } }],
    },
  ],

  metadata: {
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-15T00:00:00Z'),
    description:
      'Zion Alpha Trading lifecycle — manages trades from market scanning through evaluation, positioning, monitoring, and settlement.',
  },
};

// ---------------------------------------------------------------------------
// Completion Contracts
// ---------------------------------------------------------------------------

export const ZION_ALPHA_COMPLETION_CONTRACTS: CompletionContract[] = [
  {
    id: 'zion-alpha-evaluation-complete',
    workflowType: 'evaluating',
    version: '1.0.0',
    outputSchema: {
      type: 'object',
      required: ['marketId', 'direction', 'confidence', 'riskScore'],
      properties: {
        marketId: { type: 'string' },
        direction: { type: 'string', enum: ['long', 'short'] },
        confidence: { type: 'number', minimum: 0, maximum: 100 },
        riskScore: { type: 'number', minimum: 0, maximum: 100 },
        reasoning: { type: 'string' },
      },
    },
    verificationSteps: [
      {
        name: 'Risk score within bounds',
        type: 'schema_validation',
        config: { maxRiskScore: 70 },
        required: true,
        timeout: 30000,
      },
    ],
    description: 'Validates that opportunity evaluation produced a risk-assessed decision.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'zion-alpha-trade-complete',
    workflowType: 'positioning',
    version: '1.0.0',
    outputSchema: {
      type: 'object',
      required: ['tradeId', 'platform', 'marketId', 'direction', 'size', 'entryPrice'],
      properties: {
        tradeId: { type: 'string' },
        platform: { type: 'string', enum: ['kalshi', 'polymarket'] },
        marketId: { type: 'string' },
        direction: { type: 'string', enum: ['long', 'short'] },
        size: { type: 'number', minimum: 0 },
        entryPrice: { type: 'number', minimum: 0 },
      },
    },
    verificationSteps: [
      {
        name: 'Trade execution confirmed',
        type: 'external_check',
        config: { checkPlatformConfirmation: true },
        required: true,
        timeout: 60000,
      },
    ],
    description: 'Validates that a trade was successfully executed.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
];

// ---------------------------------------------------------------------------
// Zion Alpha Agent Program
// ---------------------------------------------------------------------------

export const ZION_ALPHA_AGENT_PROGRAM: AgentProgram = {
  id: 'zion-alpha-trading',
  name: 'Zion Alpha Trading',
  version: '1.0.0',
  pillar: 'otzar',

  systemPrompt: `You are the Zion Alpha Trading agent. Your mission is to autonomously scan prediction markets (Kalshi, Polymarket), evaluate opportunities against strict risk parameters, execute trades within position and daily loss limits, monitor open positions, and exit on trigger conditions. Every trade decision must be logged with reasoning, market data, and outcome. You must never exceed position size limits or daily loss limits.`,

  tools: [
    {
      name: 'scan_markets',
      description: 'Scan prediction markets for opportunities',
      inputSchema: {
        type: 'object',
        required: ['platforms'],
        properties: {
          platforms: { type: 'array', items: { type: 'string', enum: ['kalshi', 'polymarket'] } },
          categories: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'evaluate_opportunity',
      description: 'Evaluate a market opportunity against risk parameters',
      inputSchema: {
        type: 'object',
        required: ['marketId', 'platform'],
        properties: {
          marketId: { type: 'string' },
          platform: { type: 'string', enum: ['kalshi', 'polymarket'] },
        },
      },
    },
    {
      name: 'execute_trade',
      description: 'Execute a trade on a prediction market',
      inputSchema: {
        type: 'object',
        required: ['marketId', 'platform', 'direction', 'size'],
        properties: {
          marketId: { type: 'string' },
          platform: { type: 'string', enum: ['kalshi', 'polymarket'] },
          direction: { type: 'string', enum: ['long', 'short'] },
          size: { type: 'number' },
        },
      },
    },
    {
      name: 'close_position',
      description: 'Close an open position',
      inputSchema: {
        type: 'object',
        required: ['tradeId', 'platform'],
        properties: {
          tradeId: { type: 'string' },
          platform: { type: 'string', enum: ['kalshi', 'polymarket'] },
        },
      },
    },
  ],

  stateMachine: ZION_ALPHA_STATE_MACHINE,
  completionContracts: ZION_ALPHA_COMPLETION_CONTRACTS,

  authorityLevel: 'L3',
  allowedActions: [
    'scan_markets',
    'evaluate_opportunity',
    'execute_trade',
    'close_position',
    'get_positions',
    'get_balance',
    'log_decision',
  ],
  deniedActions: [
    'exceed_position_limit',
    'exceed_daily_loss_limit',
    'trade_outside_approved_markets',
    'modify_risk_parameters',
  ],

  modelPreference: {
    preferred: 'gpt-4o',
    fallback: 'claude-sonnet-4-20250514',
    costCeiling: 2.0,
    taskTypeOverrides: {
      analysis: 'gpt-4o',
      classification: 'gpt-4o-mini',
    },
  },

  tokenBudget: { daily: 100000, monthly: 2000000 },

  testSuite: {
    suiteId: 'zion-alpha-test-suite',
    path: 'packages/app/src/zion-alpha/__tests__',
    requiredCoverage: 80,
  },

  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
  createdBy: 'system',
  changelog: [
    {
      version: '1.0.0',
      date: new Date('2026-01-01T00:00:00Z'),
      author: 'system',
      description: 'Initial Zion Alpha Trading agent program definition.',
    },
  ],
};
