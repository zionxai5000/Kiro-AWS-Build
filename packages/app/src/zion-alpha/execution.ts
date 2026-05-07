/**
 * Zion Alpha Trading — Trade Execution
 *
 * Executes trades via Kalshi and Polymarket drivers, monitors open positions
 * at configured intervals, executes exit strategies on trigger conditions.
 *
 * Requirements: 13.1, 13.3
 */

import type { DriverResult } from '@seraphim/core';
import type { TradingPlatform, TradeDirection, MarketOpportunity, EvaluationResult, ExitCondition } from './strategy.js';
import type { RiskManager, OpenPosition } from './risk.js';
import type { TradeLogger } from './logging.js';

// ---------------------------------------------------------------------------
// Driver interface
// ---------------------------------------------------------------------------

export interface TradingDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TradeOrder {
  marketId: string;
  platform: TradingPlatform;
  direction: TradeDirection;
  sizeUsd: number;
  limitPrice?: number;
}

export interface TradeExecutionResult {
  tradeId: string;
  marketId: string;
  platform: TradingPlatform;
  direction: TradeDirection;
  sizeUsd: number;
  executedPrice: number;
  status: 'filled' | 'partial' | 'rejected' | 'failed';
  executedAt: string;
  error?: string;
}

export interface PositionMonitorResult {
  tradeId: string;
  currentPrice: number;
  unrealizedPnL: number;
  exitTriggered: boolean;
  exitType?: 'stop_loss' | 'take_profit' | 'time_expiry';
}

// ---------------------------------------------------------------------------
// Trade Executor
// ---------------------------------------------------------------------------

export class TradeExecutor {
  constructor(
    private readonly drivers: Map<TradingPlatform, TradingDriver>,
    private readonly riskManager: RiskManager,
    private readonly logger: TradeLogger,
  ) {}

  /**
   * Execute a trade entry based on an approved evaluation.
   */
  async enterTrade(evaluation: EvaluationResult): Promise<TradeExecutionResult> {
    if (!evaluation.approved) {
      return {
        tradeId: '',
        marketId: evaluation.marketId,
        platform: evaluation.platform,
        direction: evaluation.direction,
        sizeUsd: 0,
        executedPrice: 0,
        status: 'rejected',
        executedAt: new Date().toISOString(),
        error: evaluation.rejectionReason ?? 'Evaluation not approved',
      };
    }

    // Check risk limits
    const riskCheck = await this.riskManager.checkTradeAllowed(
      evaluation.suggestedSize,
      evaluation.platform,
    );

    if (!riskCheck.allowed) {
      await this.logger.logDecision({
        action: 'entry_blocked',
        marketId: evaluation.marketId,
        platform: evaluation.platform,
        reasoning: riskCheck.reason,
        marketData: { price: evaluation.entryPrice },
        outcome: 'blocked',
      });

      return {
        tradeId: '',
        marketId: evaluation.marketId,
        platform: evaluation.platform,
        direction: evaluation.direction,
        sizeUsd: 0,
        executedPrice: 0,
        status: 'rejected',
        executedAt: new Date().toISOString(),
        error: riskCheck.reason,
      };
    }

    // Execute via platform driver
    const driver = this.drivers.get(evaluation.platform);
    if (!driver) {
      return {
        tradeId: '',
        marketId: evaluation.marketId,
        platform: evaluation.platform,
        direction: evaluation.direction,
        sizeUsd: 0,
        executedPrice: 0,
        status: 'failed',
        executedAt: new Date().toISOString(),
        error: `No driver configured for ${evaluation.platform}`,
      };
    }

    const result = await driver.execute({
      type: 'placeTrade',
      params: {
        marketId: evaluation.marketId,
        side: evaluation.direction === 'long' ? 'yes' : 'no',
        count: Math.floor(evaluation.suggestedSize / evaluation.entryPrice),
        limitPrice: evaluation.entryPrice,
      },
    });

    const resultData = (result.data ?? {}) as Record<string, unknown>;
    const tradeId = (resultData.orderId as string) ?? `trade-${Date.now()}`;
    const executedPrice = (resultData.avgPrice as number) ?? evaluation.entryPrice;

    if (result.success) {
      // Register position with risk manager
      this.riskManager.addPosition({
        tradeId,
        marketId: evaluation.marketId,
        platform: evaluation.platform,
        direction: evaluation.direction,
        sizeUsd: evaluation.suggestedSize,
        entryPrice: executedPrice,
        currentPrice: executedPrice,
        unrealizedPnL: 0,
        openedAt: new Date().toISOString(),
      });

      await this.logger.logDecision({
        action: 'entry',
        marketId: evaluation.marketId,
        platform: evaluation.platform,
        reasoning: evaluation.reasoning,
        marketData: { price: executedPrice, size: evaluation.suggestedSize },
        outcome: 'executed',
        tradeId,
      });
    }

    return {
      tradeId,
      marketId: evaluation.marketId,
      platform: evaluation.platform,
      direction: evaluation.direction,
      sizeUsd: evaluation.suggestedSize,
      executedPrice,
      status: result.success ? 'filled' : 'failed',
      executedAt: new Date().toISOString(),
      error: result.success ? undefined : result.error?.message,
    };
  }

  /**
   * Monitor an open position and check exit conditions.
   */
  async monitorPosition(
    position: OpenPosition,
    exitConditions: ExitCondition[],
  ): Promise<PositionMonitorResult> {
    const driver = this.drivers.get(position.platform);
    if (!driver) {
      return {
        tradeId: position.tradeId,
        currentPrice: position.currentPrice,
        unrealizedPnL: position.unrealizedPnL,
        exitTriggered: false,
      };
    }

    // Get current market price
    const result = await driver.execute({
      type: 'getMarkets',
      params: { marketId: position.marketId },
    });

    const resultData = (result.data ?? {}) as Record<string, unknown>;
    const currentPrice = (resultData.lastPrice as number) ?? position.currentPrice;

    const unrealizedPnL = position.direction === 'long'
      ? (currentPrice - position.entryPrice) * position.sizeUsd
      : (position.entryPrice - currentPrice) * position.sizeUsd;

    // Check exit conditions
    for (const condition of exitConditions) {
      if (condition.type === 'stop_loss' && condition.triggerPrice !== undefined) {
        const triggered = position.direction === 'long'
          ? currentPrice <= condition.triggerPrice
          : currentPrice >= condition.triggerPrice;
        if (triggered) {
          return { tradeId: position.tradeId, currentPrice, unrealizedPnL, exitTriggered: true, exitType: 'stop_loss' };
        }
      }

      if (condition.type === 'take_profit' && condition.triggerPrice !== undefined) {
        const triggered = position.direction === 'long'
          ? currentPrice >= condition.triggerPrice
          : currentPrice <= condition.triggerPrice;
        if (triggered) {
          return { tradeId: position.tradeId, currentPrice, unrealizedPnL, exitTriggered: true, exitType: 'take_profit' };
        }
      }

      if (condition.type === 'time_expiry' && condition.triggerTime) {
        if (new Date() >= new Date(condition.triggerTime)) {
          return { tradeId: position.tradeId, currentPrice, unrealizedPnL, exitTriggered: true, exitType: 'time_expiry' };
        }
      }
    }

    return { tradeId: position.tradeId, currentPrice, unrealizedPnL, exitTriggered: false };
  }

  /**
   * Execute a trade exit.
   */
  async exitTrade(
    position: OpenPosition,
    exitType: 'stop_loss' | 'take_profit' | 'time_expiry' | 'manual',
    currentPrice: number,
  ): Promise<TradeExecutionResult> {
    const driver = this.drivers.get(position.platform);
    if (!driver) {
      return {
        tradeId: position.tradeId,
        marketId: position.marketId,
        platform: position.platform,
        direction: position.direction,
        sizeUsd: position.sizeUsd,
        executedPrice: 0,
        status: 'failed',
        executedAt: new Date().toISOString(),
        error: `No driver for ${position.platform}`,
      };
    }

    const result = await driver.execute({
      type: 'placeTrade',
      params: {
        marketId: position.marketId,
        side: position.direction === 'long' ? 'no' : 'yes', // Opposite side to close
        count: Math.floor(position.sizeUsd / position.entryPrice),
        limitPrice: currentPrice,
      },
    });

    const resultData = (result.data ?? {}) as Record<string, unknown>;
    const executedPrice = (resultData.avgPrice as number) ?? currentPrice;

    if (result.success) {
      const pnl = this.riskManager.closePosition(position.tradeId, executedPrice);

      await this.logger.logDecision({
        action: 'exit',
        marketId: position.marketId,
        platform: position.platform,
        reasoning: `Exit triggered: ${exitType}. P&L: $${pnl.toFixed(2)}`,
        marketData: { price: executedPrice, pnl },
        outcome: pnl >= 0 ? 'profit' : 'loss',
        tradeId: position.tradeId,
      });
    }

    return {
      tradeId: position.tradeId,
      marketId: position.marketId,
      platform: position.platform,
      direction: position.direction,
      sizeUsd: position.sizeUsd,
      executedPrice,
      status: result.success ? 'filled' : 'failed',
      executedAt: new Date().toISOString(),
      error: result.success ? undefined : result.error?.message,
    };
  }
}
