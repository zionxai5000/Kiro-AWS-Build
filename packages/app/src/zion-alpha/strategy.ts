/**
 * Zion Alpha Trading — Strategy
 *
 * Implements opportunity evaluation against risk parameters, position sizing
 * logic, and entry/exit trigger conditions.
 *
 * Requirements: 13.1, 13.2
 */

import type { DriverResult } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Driver interfaces
// ---------------------------------------------------------------------------

export interface TradingDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

export interface LLMDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TradingPlatform = 'kalshi' | 'polymarket';
export type TradeDirection = 'long' | 'short';

export interface MarketOpportunity {
  marketId: string;
  platform: TradingPlatform;
  title: string;
  category: string;
  currentPrice: number; // 0-1 probability
  volume: number;
  expiresAt: string;
}

export interface RiskParameters {
  maxPositionSizeUsd: number;
  maxDailyLossUsd: number;
  maxOpenPositions: number;
  minConfidence: number;
  maxRiskScore: number;
  stopLossPercent: number;
  takeProfitPercent: number;
}

export interface EvaluationResult {
  marketId: string;
  platform: TradingPlatform;
  direction: TradeDirection;
  confidence: number; // 0-100
  riskScore: number; // 0-100
  reasoning: string;
  suggestedSize: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  approved: boolean;
  rejectionReason?: string;
}

export interface PositionSizeResult {
  sizeUsd: number;
  contracts: number;
  riskPerContract: number;
  totalRisk: number;
  withinLimits: boolean;
  limitViolation?: string;
}

export interface ExitCondition {
  type: 'stop_loss' | 'take_profit' | 'time_expiry' | 'manual';
  triggerPrice?: number;
  triggerTime?: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Strategy Engine
// ---------------------------------------------------------------------------

export class TradingStrategy {
  constructor(
    private readonly llmDriver: LLMDriver,
    private readonly riskParams: RiskParameters,
  ) {}

  /**
   * Evaluate a market opportunity against risk parameters.
   */
  async evaluateOpportunity(
    opportunity: MarketOpportunity,
    currentDailyPnL: number,
    openPositionCount: number,
  ): Promise<EvaluationResult> {
    // Check if we can take new positions
    if (openPositionCount >= this.riskParams.maxOpenPositions) {
      return this.rejectedResult(opportunity, 'Maximum open positions reached');
    }

    if (currentDailyPnL <= -this.riskParams.maxDailyLossUsd) {
      return this.rejectedResult(opportunity, 'Daily loss limit reached');
    }

    // Use LLM to analyze the opportunity
    const prompt = [
      `Analyze this prediction market opportunity:`,
      `Market: ${opportunity.title}`,
      `Platform: ${opportunity.platform}`,
      `Current price: ${opportunity.currentPrice}`,
      `Volume: ${opportunity.volume}`,
      `Expires: ${opportunity.expiresAt}`,
      `Provide: direction (long/short), confidence (0-100), risk score (0-100), and reasoning.`,
    ].join('\n');

    const llmResult = await this.llmDriver.execute({
      type: 'generate',
      params: { prompt, maxTokens: 1000, temperature: 0.2, taskType: 'analysis' },
    });

    // Derive evaluation from market data
    const direction = this.determineDirection(opportunity);
    const confidence = this.calculateConfidence(opportunity);
    const riskScore = this.calculateRiskScore(opportunity);

    // Check against risk parameters
    if (confidence < this.riskParams.minConfidence) {
      return this.rejectedResult(opportunity, `Confidence (${confidence}) below minimum (${this.riskParams.minConfidence})`);
    }

    if (riskScore > this.riskParams.maxRiskScore) {
      return this.rejectedResult(opportunity, `Risk score (${riskScore}) exceeds maximum (${this.riskParams.maxRiskScore})`);
    }

    const entryPrice = opportunity.currentPrice;
    const stopLoss = direction === 'long'
      ? entryPrice * (1 - this.riskParams.stopLossPercent / 100)
      : entryPrice * (1 + this.riskParams.stopLossPercent / 100);
    const takeProfit = direction === 'long'
      ? entryPrice * (1 + this.riskParams.takeProfitPercent / 100)
      : entryPrice * (1 - this.riskParams.takeProfitPercent / 100);

    const positionSize = this.calculatePositionSize(entryPrice, stopLoss);

    return {
      marketId: opportunity.marketId,
      platform: opportunity.platform,
      direction,
      confidence,
      riskScore,
      reasoning: `Market "${opportunity.title}" shows ${direction} opportunity with ${confidence}% confidence.`,
      suggestedSize: positionSize.sizeUsd,
      entryPrice,
      stopLoss,
      takeProfit,
      approved: positionSize.withinLimits,
      rejectionReason: positionSize.withinLimits ? undefined : positionSize.limitViolation,
    };
  }

  /**
   * Calculate position size based on risk parameters.
   */
  calculatePositionSize(
    entryPrice: number,
    stopLoss: number,
  ): PositionSizeResult {
    const riskPerContract = Math.abs(entryPrice - stopLoss);
    if (riskPerContract === 0) {
      return {
        sizeUsd: 0,
        contracts: 0,
        riskPerContract: 0,
        totalRisk: 0,
        withinLimits: false,
        limitViolation: 'Risk per contract is zero — invalid stop loss',
      };
    }

    // Size position so max loss equals a fraction of max position size
    const maxRiskUsd = this.riskParams.maxPositionSizeUsd * 0.1; // Risk 10% of max position
    const contracts = Math.floor(maxRiskUsd / riskPerContract);
    const sizeUsd = contracts * entryPrice;
    const totalRisk = contracts * riskPerContract;

    const withinLimits = sizeUsd <= this.riskParams.maxPositionSizeUsd;

    return {
      sizeUsd,
      contracts,
      riskPerContract,
      totalRisk,
      withinLimits,
      limitViolation: withinLimits ? undefined : `Position size ($${sizeUsd}) exceeds limit ($${this.riskParams.maxPositionSizeUsd})`,
    };
  }

  /**
   * Determine exit conditions for a position.
   */
  getExitConditions(
    entryPrice: number,
    direction: TradeDirection,
    expiresAt: string,
  ): ExitCondition[] {
    const stopLossPrice = direction === 'long'
      ? entryPrice * (1 - this.riskParams.stopLossPercent / 100)
      : entryPrice * (1 + this.riskParams.stopLossPercent / 100);

    const takeProfitPrice = direction === 'long'
      ? entryPrice * (1 + this.riskParams.takeProfitPercent / 100)
      : entryPrice * (1 - this.riskParams.takeProfitPercent / 100);

    return [
      {
        type: 'stop_loss',
        triggerPrice: stopLossPrice,
        description: `Stop loss at ${stopLossPrice.toFixed(4)} (${this.riskParams.stopLossPercent}% from entry)`,
      },
      {
        type: 'take_profit',
        triggerPrice: takeProfitPrice,
        description: `Take profit at ${takeProfitPrice.toFixed(4)} (${this.riskParams.takeProfitPercent}% from entry)`,
      },
      {
        type: 'time_expiry',
        triggerTime: expiresAt,
        description: `Market expires at ${expiresAt}`,
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private determineDirection(opportunity: MarketOpportunity): TradeDirection {
    // Simple heuristic: if price is below 0.5, go long (expect it to rise)
    return opportunity.currentPrice < 0.5 ? 'long' : 'short';
  }

  private calculateConfidence(opportunity: MarketOpportunity): number {
    // Higher volume = higher confidence, price extremes = higher confidence
    const volumeSignal = Math.min(opportunity.volume / 10000, 1) * 30;
    const priceSignal = Math.abs(opportunity.currentPrice - 0.5) * 2 * 40;
    const base = 30;
    return Math.min(Math.round(base + volumeSignal + priceSignal), 100);
  }

  private calculateRiskScore(opportunity: MarketOpportunity): number {
    // Low volume = higher risk, price near 0.5 = higher risk (uncertain)
    const volumeRisk = Math.max(1 - opportunity.volume / 10000, 0) * 40;
    const priceRisk = (1 - Math.abs(opportunity.currentPrice - 0.5) * 2) * 40;
    const base = 20;
    return Math.min(Math.round(base + volumeRisk + priceRisk), 100);
  }

  private rejectedResult(opportunity: MarketOpportunity, reason: string): EvaluationResult {
    return {
      marketId: opportunity.marketId,
      platform: opportunity.platform,
      direction: 'long',
      confidence: 0,
      riskScore: 100,
      reasoning: reason,
      suggestedSize: 0,
      entryPrice: opportunity.currentPrice,
      stopLoss: 0,
      takeProfit: 0,
      approved: false,
      rejectionReason: reason,
    };
  }
}
