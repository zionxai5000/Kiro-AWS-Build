/**
 * Polymarket Trading Platform Driver — prediction market trading on Polymarket.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for API key
 * authentication, and implements position size validation and daily loss
 * limit checks before trade execution.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 13.1, 13.2, 13.3
 */

import { BaseDriver } from '../base/driver.js';
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const POLYMARKET_ERROR_CODES = {
  UNAUTHORIZED: 'POLY_UNAUTHORIZED',
  FORBIDDEN: 'POLY_FORBIDDEN',
  NOT_FOUND: 'POLY_NOT_FOUND',
  RATE_LIMITED: 'POLY_RATE_LIMITED',
  INVALID_PARAMS: 'POLY_INVALID_PARAMS',
  INSUFFICIENT_BALANCE: 'POLY_INSUFFICIENT_BALANCE',
  POSITION_LIMIT_EXCEEDED: 'POLY_POSITION_LIMIT_EXCEEDED',
  DAILY_LOSS_LIMIT_EXCEEDED: 'POLY_DAILY_LOSS_LIMIT_EXCEEDED',
  MARKET_CLOSED: 'POLY_MARKET_CLOSED',
  TRADE_FAILED: 'POLY_TRADE_FAILED',
  UNSUPPORTED_OPERATION: 'POLY_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolymarketOutcome = 'Yes' | 'No';
export type PolymarketOrderType = 'market' | 'limit' | 'gtc';
export type PolymarketOrderStatus = 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'expired';
export type PolymarketMarketStatus = 'active' | 'closed' | 'resolved';

export interface PolymarketMarket {
  id: string;
  conditionId: string;
  question: string;
  status: PolymarketMarketStatus;
  outcomePrices: { yes: number; no: number };
  volume: number;
  liquidity: number;
  endDate: string;
  category: string;
}

export interface PolymarketPosition {
  marketId: string;
  conditionId: string;
  outcome: PolymarketOutcome;
  shares: number;
  averageCost: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface PolymarketTrade {
  tradeId: string;
  marketId: string;
  conditionId: string;
  outcome: PolymarketOutcome;
  type: PolymarketOrderType;
  shares: number;
  price: number;
  status: PolymarketOrderStatus;
  filledShares: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PolymarketDriverConfig {
  /** Polymarket API key. */
  apiKey: string;
  /** Maximum position size in shares per market. */
  maxPositionSize: number;
  /** Maximum daily loss in USD before blocking further trades. */
  dailyLossLimitUsd: number;
  /** Polymarket CLOB API endpoint override (optional). */
  clobApiUrl?: string;
}

// ---------------------------------------------------------------------------
// Risk State (tracked per session)
// ---------------------------------------------------------------------------

interface RiskState {
  /** Running total of realized losses for the current day (UTC). */
  dailyRealizedLoss: number;
  /** Date string (YYYY-MM-DD) for the current tracking day. */
  trackingDate: string;
  /** Current positions by market ID for position size checks. */
  positionsByMarket: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Polymarket Driver
// ---------------------------------------------------------------------------

export class PolymarketDriver extends BaseDriver<PolymarketDriverConfig> {
  readonly name = 'polymarket';
  readonly version = '1.0.0';

  private _apiKey: string | null = null;
  private _driverConfig: PolymarketDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();
  private _riskState: RiskState = {
    dailyRealizedLoss: 0,
    trackingDate: this.todayUTC(),
    positionsByMarket: new Map(),
  };

  constructor(private readonly credentialManager: CredentialManager) {
    // Trading-specific retry: 3 attempts, 1s initial delay
    super({ maxAttempts: 3, initialDelayMs: 1000 });
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: PolymarketDriverConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('Polymarket API key is required');
    }
    if (config.maxPositionSize <= 0) {
      throw new Error('maxPositionSize must be a positive number');
    }
    if (config.dailyLossLimitUsd <= 0) {
      throw new Error('dailyLossLimitUsd must be a positive number');
    }

    this._apiKey = await this.credentialManager.getCredential('polymarket', 'api-key');
    if (!this._apiKey) {
      throw new Error('Failed to retrieve Polymarket API key from Credential Manager');
    }
    this._driverConfig = config;

    // Reset risk state on new connection
    this._riskState = {
      dailyRealizedLoss: 0,
      trackingDate: this.todayUTC(),
      positionsByMarket: new Map(),
    };

    this.updateSessionData({
      provider: 'polymarket',
      authenticated: true,
      clobApiUrl: config.clobApiUrl ?? 'https://clob.polymarket.com',
    });
  }

  protected async doDisconnect(): Promise<void> {
    this._apiKey = null;
    this._driverConfig = null;
    this._completedOperations.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOperationId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, POLYMARKET_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    // Reset daily loss tracking if the day has rolled over
    this.resetDailyLossIfNewDay();

    switch (operation.type) {
      case 'getMarkets':
        return this.handleGetMarkets(operation, operationId);
      case 'getPositions':
        return this.handleGetPositions(operationId);
      case 'placeTrade':
        return this.handlePlaceTrade(operation, operationId);
      case 'cancelTrade':
        return this.handleCancelTrade(operation, operationId);
      case 'getTradeHistory':
        return this.handleGetTradeHistory(operation, operationId);
      case 'getBalance':
        return this.handleGetBalance(operationId);
      default:
        return this.errorResult(
          operationId,
          POLYMARKET_ERROR_CODES.UNSUPPORTED_OPERATION,
          `Unsupported operation type: ${operation.type}`,
          false,
        );
    }
  }

  protected async doVerify(operationId: string): Promise<VerificationResult> {
    const result = this._completedOperations.get(operationId);
    return {
      verified: result !== undefined,
      operationId,
      details: result ? { success: result.success } : undefined,
    };
  }

  // =====================================================================
  // Operation Handlers
  // =====================================================================

  private async handleGetMarkets(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { status, category, limit, cursor } = operation.params as {
      status?: PolymarketMarketStatus;
      category?: string;
      limit?: number;
      cursor?: string;
    };

    const result: DriverResult = {
      success: true,
      data: {
        markets: [] as PolymarketMarket[],
        cursor: cursor ?? null,
        filters: { status, category, limit: limit ?? 20 },
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetPositions(operationId: string): Promise<DriverResult> {
    const positions: PolymarketPosition[] = [];

    // Return positions from risk state tracking
    for (const [marketId, shares] of this._riskState.positionsByMarket.entries()) {
      if (shares !== 0) {
        positions.push({
          marketId,
          conditionId: `cond-${marketId}`,
          outcome: shares > 0 ? 'Yes' : 'No',
          shares: Math.abs(shares),
          averageCost: 0.50,
          currentPrice: 0.50,
          unrealizedPnl: 0,
        });
      }
    }

    const result: DriverResult = {
      success: true,
      data: {
        positions,
        totalPositions: positions.length,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handlePlaceTrade(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { marketId, outcome, shares, price, type } = operation.params as {
      marketId?: string;
      outcome?: PolymarketOutcome;
      shares?: number;
      price?: number;
      type?: PolymarketOrderType;
    };

    // --- Parameter validation ---
    if (!marketId) {
      return this.errorResult(operationId, POLYMARKET_ERROR_CODES.INVALID_PARAMS, 'marketId is required for placeTrade', false);
    }
    if (!outcome || !['Yes', 'No'].includes(outcome)) {
      return this.errorResult(operationId, POLYMARKET_ERROR_CODES.INVALID_PARAMS, 'outcome must be "Yes" or "No"', false);
    }
    if (!shares || shares <= 0) {
      return this.errorResult(operationId, POLYMARKET_ERROR_CODES.INVALID_PARAMS, 'shares must be a positive number', false);
    }
    if (price !== undefined && (price < 0.01 || price > 0.99)) {
      return this.errorResult(operationId, POLYMARKET_ERROR_CODES.INVALID_PARAMS, 'price must be between 0.01 and 0.99', false);
    }

    const orderType: PolymarketOrderType = type ?? 'market';

    // --- Position size validation (Requirement 13.2) ---
    const currentPosition = this._riskState.positionsByMarket.get(marketId) ?? 0;
    const newPosition = currentPosition + shares;
    if (newPosition > this._driverConfig!.maxPositionSize) {
      return this.errorResult(
        operationId,
        POLYMARKET_ERROR_CODES.POSITION_LIMIT_EXCEEDED,
        `Position size ${newPosition} would exceed limit of ${this._driverConfig!.maxPositionSize} for market ${marketId}`,
        false,
        {
          currentPosition,
          requestedShares: shares,
          maxPositionSize: this._driverConfig!.maxPositionSize,
        },
      );
    }

    // --- Daily loss limit check (Requirement 13.2) ---
    const tradePrice = price ?? 0.50;
    const potentialLoss = shares * tradePrice;
    if (this._riskState.dailyRealizedLoss + potentialLoss > this._driverConfig!.dailyLossLimitUsd) {
      return this.errorResult(
        operationId,
        POLYMARKET_ERROR_CODES.DAILY_LOSS_LIMIT_EXCEEDED,
        `Trade would risk exceeding daily loss limit of $${this._driverConfig!.dailyLossLimitUsd}`,
        false,
        {
          currentDailyLoss: this._riskState.dailyRealizedLoss,
          potentialAdditionalLoss: potentialLoss,
          dailyLossLimit: this._driverConfig!.dailyLossLimitUsd,
        },
      );
    }

    // --- Execute trade (mock) ---
    this._riskState.positionsByMarket.set(marketId, newPosition);

    const trade: PolymarketTrade = {
      tradeId: `poly-trade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      marketId,
      conditionId: `cond-${marketId}`,
      outcome,
      type: orderType,
      shares,
      price: tradePrice,
      status: 'filled',
      filledShares: shares,
      createdAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: trade,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleCancelTrade(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { tradeId } = operation.params as { tradeId?: string };

    if (!tradeId) {
      return this.errorResult(operationId, POLYMARKET_ERROR_CODES.INVALID_PARAMS, 'tradeId is required for cancelTrade', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        tradeId,
        status: 'cancelled' as PolymarketOrderStatus,
        cancelledAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetTradeHistory(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { marketId, startDate, endDate, limit, cursor } = operation.params as {
      marketId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      cursor?: string;
    };

    const result: DriverResult = {
      success: true,
      data: {
        trades: [] as PolymarketTrade[],
        cursor: cursor ?? null,
        filters: {
          marketId,
          startDate,
          endDate,
          limit: limit ?? 50,
        },
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetBalance(operationId: string): Promise<DriverResult> {
    const result: DriverResult = {
      success: true,
      data: {
        balance: 0,
        availableBalance: 0,
        reservedBalance: 0,
        currency: 'USDC',
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  // =====================================================================
  // Risk Management Helpers
  // =====================================================================

  /**
   * Record a realized loss for daily loss tracking.
   * Called externally when a position is closed at a loss.
   */
  recordRealizedLoss(amount: number): void {
    this.resetDailyLossIfNewDay();
    this._riskState.dailyRealizedLoss += amount;
  }

  /** Get the current daily realized loss. */
  getDailyRealizedLoss(): number {
    this.resetDailyLossIfNewDay();
    return this._riskState.dailyRealizedLoss;
  }

  /** Get the current position size for a market. */
  getPositionSize(marketId: string): number {
    return this._riskState.positionsByMarket.get(marketId) ?? 0;
  }

  private resetDailyLossIfNewDay(): void {
    const today = this.todayUTC();
    if (this._riskState.trackingDate !== today) {
      this._riskState.dailyRealizedLoss = 0;
      this._riskState.trackingDate = today;
    }
  }

  /** Overridable for testing. */
  protected todayUTC(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private createOperationId(): string {
    return `poly-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private errorResult(
    operationId: string,
    code: string,
    message: string,
    retryable: boolean,
    details?: Record<string, unknown>,
  ): DriverResult {
    return {
      success: false,
      error: { code, message, retryable, details },
      retryable,
      operationId,
    };
  }
}
