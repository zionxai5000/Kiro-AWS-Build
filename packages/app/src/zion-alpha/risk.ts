/**
 * Zion Alpha Trading — Risk Management
 *
 * Enforces position size limits and daily loss limits via Otzar,
 * blocks trades exceeding limits.
 *
 * Requirements: 13.2, 13.3
 */

import type { OtzarService } from '@seraphim/core/interfaces/otzar-service.js';
import type { RiskParameters, TradingPlatform } from './strategy.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenPosition {
  tradeId: string;
  marketId: string;
  platform: TradingPlatform;
  direction: 'long' | 'short';
  sizeUsd: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  openedAt: string;
}

export interface DailyPnLSummary {
  date: string;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  tradesExecuted: number;
  tradesWon: number;
  tradesLost: number;
}

export interface RiskCheckResult {
  allowed: boolean;
  reason: string;
  currentExposure: number;
  maxExposure: number;
  currentDailyLoss: number;
  maxDailyLoss: number;
}

// ---------------------------------------------------------------------------
// Risk Manager
// ---------------------------------------------------------------------------

export class RiskManager {
  private openPositions: OpenPosition[] = [];
  private dailyRealizedPnL = 0;
  private dailyTradeCount = 0;
  private dailyWins = 0;
  private dailyLosses = 0;

  constructor(
    private readonly riskParams: RiskParameters,
    private readonly otzarService: OtzarService,
  ) {}

  /**
   * Check if a new trade is allowed given current risk exposure.
   */
  async checkTradeAllowed(
    sizeUsd: number,
    platform: TradingPlatform,
  ): Promise<RiskCheckResult> {
    const currentExposure = this.getTotalExposure();
    const newExposure = currentExposure + sizeUsd;

    // Check position size limit
    if (sizeUsd > this.riskParams.maxPositionSizeUsd) {
      return {
        allowed: false,
        reason: `Position size ($${sizeUsd}) exceeds maximum ($${this.riskParams.maxPositionSizeUsd})`,
        currentExposure,
        maxExposure: this.riskParams.maxPositionSizeUsd,
        currentDailyLoss: Math.abs(Math.min(this.dailyRealizedPnL, 0)),
        maxDailyLoss: this.riskParams.maxDailyLossUsd,
      };
    }

    // Check open position count
    if (this.openPositions.length >= this.riskParams.maxOpenPositions) {
      return {
        allowed: false,
        reason: `Maximum open positions (${this.riskParams.maxOpenPositions}) reached`,
        currentExposure,
        maxExposure: this.riskParams.maxPositionSizeUsd,
        currentDailyLoss: Math.abs(Math.min(this.dailyRealizedPnL, 0)),
        maxDailyLoss: this.riskParams.maxDailyLossUsd,
      };
    }

    // Check daily loss limit
    const currentDailyLoss = Math.abs(Math.min(this.dailyRealizedPnL + this.getUnrealizedPnL(), 0));
    if (currentDailyLoss >= this.riskParams.maxDailyLossUsd) {
      return {
        allowed: false,
        reason: `Daily loss limit ($${this.riskParams.maxDailyLossUsd}) reached. Current loss: $${currentDailyLoss.toFixed(2)}`,
        currentExposure,
        maxExposure: this.riskParams.maxPositionSizeUsd,
        currentDailyLoss,
        maxDailyLoss: this.riskParams.maxDailyLossUsd,
      };
    }

    // Check budget with Otzar
    const budgetCheck = await this.otzarService.checkBudget('zion-alpha-trading', sizeUsd);

    if (!budgetCheck.allowed) {
      return {
        allowed: false,
        reason: 'Otzar budget limit reached',
        currentExposure,
        maxExposure: this.riskParams.maxPositionSizeUsd,
        currentDailyLoss,
        maxDailyLoss: this.riskParams.maxDailyLossUsd,
      };
    }

    return {
      allowed: true,
      reason: 'Trade within all risk limits',
      currentExposure,
      maxExposure: this.riskParams.maxPositionSizeUsd,
      currentDailyLoss,
      maxDailyLoss: this.riskParams.maxDailyLossUsd,
    };
  }

  /**
   * Register a new open position.
   */
  addPosition(position: OpenPosition): void {
    this.openPositions.push(position);
    this.dailyTradeCount++;
  }

  /**
   * Close a position and record the P&L.
   */
  closePosition(tradeId: string, exitPrice: number): number {
    const idx = this.openPositions.findIndex((p) => p.tradeId === tradeId);
    if (idx === -1) return 0;

    const position = this.openPositions[idx];
    const pnl = position.direction === 'long'
      ? (exitPrice - position.entryPrice) * position.sizeUsd
      : (position.entryPrice - exitPrice) * position.sizeUsd;

    this.dailyRealizedPnL += pnl;
    if (pnl >= 0) {
      this.dailyWins++;
    } else {
      this.dailyLosses++;
    }

    this.openPositions.splice(idx, 1);
    return pnl;
  }

  /**
   * Get total current exposure across all open positions.
   */
  getTotalExposure(): number {
    return this.openPositions.reduce((sum, p) => sum + p.sizeUsd, 0);
  }

  /**
   * Get total unrealized P&L across all open positions.
   */
  getUnrealizedPnL(): number {
    return this.openPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  }

  /**
   * Get daily P&L summary.
   */
  getDailyPnLSummary(): DailyPnLSummary {
    return {
      date: new Date().toISOString().split('T')[0]!,
      realizedPnL: this.dailyRealizedPnL,
      unrealizedPnL: this.getUnrealizedPnL(),
      totalPnL: this.dailyRealizedPnL + this.getUnrealizedPnL(),
      tradesExecuted: this.dailyTradeCount,
      tradesWon: this.dailyWins,
      tradesLost: this.dailyLosses,
    };
  }

  /**
   * Get all open positions.
   */
  getOpenPositions(): OpenPosition[] {
    return [...this.openPositions];
  }

  /**
   * Reset daily counters (called at start of each trading day).
   */
  resetDaily(): void {
    this.dailyRealizedPnL = 0;
    this.dailyTradeCount = 0;
    this.dailyWins = 0;
    this.dailyLosses = 0;
  }
}
