/**
 * Unit tests for Zion Alpha Trading
 *
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 19.1
 *
 * Tests opportunity evaluation, position size limits, daily loss limits,
 * and trade decision logging.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ZION_ALPHA_AGENT_PROGRAM,
  ZION_ALPHA_STATE_MACHINE,
} from '../agent-program.js';
import { TradingStrategy } from '../strategy.js';
import type { RiskParameters, MarketOpportunity } from '../strategy.js';
import { RiskManager } from '../risk.js';
import { TradeExecutor } from '../execution.js';
import { TradeLogger } from '../logging.js';
import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import type { XOAuditService } from '@seraphim/core/interfaces/xo-audit-service.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const defaultRiskParams: RiskParameters = {
  maxPositionSizeUsd: 1000,
  maxDailyLossUsd: 500,
  maxOpenPositions: 5,
  minConfidence: 50,
  maxRiskScore: 70,
  stopLossPercent: 10,
  takeProfitPercent: 20,
};

function createMockLLM() {
  return {
    execute: vi.fn().mockResolvedValue({
      success: true,
      operationId: 'op-1',
      data: { text: 'Analysis result' },
    }),
  };
}

function createMockOtzar(): OtzarService {
  return {
    routeTask: vi.fn().mockResolvedValue({ model: 'gpt-4o', provider: 'openai' }),
    checkBudget: vi.fn().mockResolvedValue({ allowed: true, remaining: 50000 }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getCostReport: vi.fn().mockResolvedValue({ totalCost: 0, byAgent: {}, byPillar: {} }),
    getDailyOptimizationReport: vi.fn().mockResolvedValue({}),
    checkCache: vi.fn().mockResolvedValue(null),
    storeCache: vi.fn().mockResolvedValue(undefined),
  } as unknown as OtzarService;
}

function createMockAudit(): XOAuditService {
  return {
    recordAction: vi.fn().mockResolvedValue(undefined),
    recordGovernanceDecision: vi.fn().mockResolvedValue(undefined),
    recordStateTransition: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true }),
  } as unknown as XOAuditService;
}

function createMockZikaron(): ZikaronService {
  return {
    storeEpisodic: vi.fn().mockResolvedValue(undefined),
    storeSemantic: vi.fn().mockResolvedValue(undefined),
    storeProcedural: vi.fn().mockResolvedValue(undefined),
    storeWorking: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadAgentContext: vi.fn().mockResolvedValue({ working: [], episodic: [], procedural: [] }),
    flagConflict: vi.fn().mockResolvedValue(undefined),
  } as unknown as ZikaronService;
}

function createMockTradingDriver(success = true) {
  return {
    execute: vi.fn().mockResolvedValue({
      success,
      operationId: 'op-1',
      data: success ? { orderId: 'order-123', avgPrice: 0.65, lastPrice: 0.7 } : undefined,
      error: success ? undefined : { message: 'Trade failed' },
    }),
  };
}

function sampleOpportunity(overrides: Partial<MarketOpportunity> = {}): MarketOpportunity {
  return {
    marketId: 'market-1',
    platform: 'kalshi',
    title: 'Will BTC exceed $100k by end of month?',
    category: 'crypto',
    currentPrice: 0.35,
    volume: 15000,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Agent Program Tests
// ---------------------------------------------------------------------------

describe('Zion Alpha Agent Program', () => {
  it('should have a valid agent program definition', () => {
    expect(ZION_ALPHA_AGENT_PROGRAM.id).toBe('zion-alpha-trading');
    expect(ZION_ALPHA_AGENT_PROGRAM.pillar).toBe('otzar');
    expect(ZION_ALPHA_AGENT_PROGRAM.authorityLevel).toBe('L3');
  });

  it('should define all trading lifecycle states', () => {
    const states = Object.keys(ZION_ALPHA_STATE_MACHINE.states);
    expect(states).toContain('scanning');
    expect(states).toContain('evaluating');
    expect(states).toContain('positioning');
    expect(states).toContain('monitoring');
    expect(states).toContain('exiting');
    expect(states).toContain('settled');
  });

  it('should require risk and position gates for trade entry', () => {
    const t = ZION_ALPHA_STATE_MACHINE.transitions.find(
      (t) => t.from === 'evaluating' && t.to === 'positioning',
    );
    expect(t).toBeDefined();
    expect(t!.gates.some((g) => g.id === 'gate-risk-check')).toBe(true);
    expect(t!.gates.some((g) => g.id === 'gate-position-size')).toBe(true);
    expect(t!.gates.some((g) => g.id === 'gate-daily-loss')).toBe(true);
  });

  it('should deny exceeding position and daily loss limits', () => {
    expect(ZION_ALPHA_AGENT_PROGRAM.deniedActions).toContain('exceed_position_limit');
    expect(ZION_ALPHA_AGENT_PROGRAM.deniedActions).toContain('exceed_daily_loss_limit');
  });
});

// ---------------------------------------------------------------------------
// Strategy Tests
// ---------------------------------------------------------------------------

describe('TradingStrategy', () => {
  let strategy: TradingStrategy;

  beforeEach(() => {
    strategy = new TradingStrategy(createMockLLM(), defaultRiskParams);
  });

  it('should evaluate opportunity and approve when within risk parameters', async () => {
    const result = await strategy.evaluateOpportunity(sampleOpportunity(), 0, 0);

    expect(result.marketId).toBe('market-1');
    expect(result.approved).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(defaultRiskParams.minConfidence);
    expect(result.riskScore).toBeLessThanOrEqual(defaultRiskParams.maxRiskScore);
    expect(result.direction).toBeDefined();
    expect(result.suggestedSize).toBeGreaterThan(0);
  });

  it('should reject when max open positions reached', async () => {
    const result = await strategy.evaluateOpportunity(sampleOpportunity(), 0, 5);

    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toContain('open positions');
  });

  it('should reject when daily loss limit reached', async () => {
    const result = await strategy.evaluateOpportunity(sampleOpportunity(), -500, 0);

    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toContain('Daily loss limit');
  });

  it('should calculate position size within limits', () => {
    const result = strategy.calculatePositionSize(0.35, 0.315);

    expect(result.sizeUsd).toBeLessThanOrEqual(defaultRiskParams.maxPositionSizeUsd);
    expect(result.withinLimits).toBe(true);
    expect(result.contracts).toBeGreaterThan(0);
  });

  it('should determine exit conditions', () => {
    const conditions = strategy.getExitConditions(0.35, 'long', '2026-12-31T00:00:00Z');

    expect(conditions).toHaveLength(3);
    expect(conditions.some((c) => c.type === 'stop_loss')).toBe(true);
    expect(conditions.some((c) => c.type === 'take_profit')).toBe(true);
    expect(conditions.some((c) => c.type === 'time_expiry')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Risk Manager Tests
// ---------------------------------------------------------------------------

describe('RiskManager', () => {
  let riskManager: RiskManager;
  let mockOtzar: OtzarService;

  beforeEach(() => {
    mockOtzar = createMockOtzar();
    riskManager = new RiskManager(defaultRiskParams, mockOtzar);
  });

  it('should allow trade within all limits', async () => {
    const result = await riskManager.checkTradeAllowed(500, 'kalshi');
    expect(result.allowed).toBe(true);
  });

  it('should block trade exceeding position size limit', async () => {
    const result = await riskManager.checkTradeAllowed(1500, 'kalshi');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Position size');
  });

  it('should block trade when max open positions reached', async () => {
    for (let i = 0; i < 5; i++) {
      riskManager.addPosition({
        tradeId: `t-${i}`,
        marketId: `m-${i}`,
        platform: 'kalshi',
        direction: 'long',
        sizeUsd: 100,
        entryPrice: 0.5,
        currentPrice: 0.5,
        unrealizedPnL: 0,
        openedAt: '',
      });
    }

    const result = await riskManager.checkTradeAllowed(100, 'kalshi');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('open positions');
  });

  it('should block trade when daily loss limit reached', async () => {
    // Simulate losses
    riskManager.addPosition({
      tradeId: 't-1',
      marketId: 'm-1',
      platform: 'kalshi',
      direction: 'long',
      sizeUsd: 1000,
      entryPrice: 0.5,
      currentPrice: 0.3,
      unrealizedPnL: -500,
      openedAt: '',
    });

    const result = await riskManager.checkTradeAllowed(100, 'kalshi');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily loss limit');
  });

  it('should track P&L when closing positions', () => {
    riskManager.addPosition({
      tradeId: 't-1',
      marketId: 'm-1',
      platform: 'kalshi',
      direction: 'long',
      sizeUsd: 100,
      entryPrice: 0.5,
      currentPrice: 0.5,
      unrealizedPnL: 0,
      openedAt: '',
    });

    const pnl = riskManager.closePosition('t-1', 0.6);
    expect(pnl).toBeGreaterThan(0);

    const summary = riskManager.getDailyPnLSummary();
    expect(summary.realizedPnL).toBeGreaterThan(0);
    expect(summary.tradesWon).toBe(1);
  });

  it('should block trade when Otzar budget is exhausted', async () => {
    (mockOtzar.checkBudget as any).mockResolvedValue({ allowed: false, remaining: 0 });

    const result = await riskManager.checkTradeAllowed(100, 'kalshi');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('budget');
  });
});

// ---------------------------------------------------------------------------
// Trade Logging Tests
// ---------------------------------------------------------------------------

describe('TradeLogger', () => {
  let logger: TradeLogger;
  let mockAudit: XOAuditService;
  let mockZikaron: ZikaronService;

  beforeEach(() => {
    mockAudit = createMockAudit();
    mockZikaron = createMockZikaron();
    logger = new TradeLogger(mockAudit, mockZikaron);
  });

  it('should log trade decision to XO Audit and Zikaron', async () => {
    const entry = await logger.logDecision({
      action: 'entry',
      marketId: 'market-1',
      platform: 'kalshi',
      reasoning: 'Strong signal detected',
      marketData: { price: 0.35, volume: 15000 },
      outcome: 'executed',
      tradeId: 'trade-1',
    });

    expect(entry.id).toBeDefined();
    expect(entry.decision.action).toBe('entry');
    expect(mockAudit.recordAction).toHaveBeenCalledTimes(1);
    expect(mockZikaron.storeEpisodic).toHaveBeenCalledTimes(1);
  });

  it('should capture reasoning and market data in audit log', async () => {
    await logger.logDecision({
      action: 'exit',
      marketId: 'market-1',
      platform: 'polymarket',
      reasoning: 'Stop loss triggered',
      marketData: { price: 0.28, pnl: -35 },
      outcome: 'loss',
      tradeId: 'trade-2',
    });

    expect(mockAudit.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'trade_exit',
        details: expect.objectContaining({
          reasoning: 'Stop loss triggered',
          marketData: expect.objectContaining({ price: 0.28 }),
        }),
      }),
    );
  });

  it('should log hold decisions', async () => {
    const entry = await logger.logHold(
      'market-1',
      'kalshi',
      'Position within parameters, continuing to monitor',
      { price: 0.4 },
      'trade-3',
    );

    expect(entry.decision.action).toBe('hold');
    expect(mockAudit.recordAction).toHaveBeenCalled();
  });
});
