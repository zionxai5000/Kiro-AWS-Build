/**
 * Kalshi Trading Platform Driver — prediction market trading on Kalshi.
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

export const KALSHI_ERROR_CODES = {
  UNAUTHORIZED: 'KALSHI_UNAUTHORIZED',
  FORBIDDEN: 'KALSHI_FORBIDDEN',
  NOT_FOUND: 'KALSHI_NOT_FOUND',
  RATE_LIMITED: 'KALSHI_RATE_LIMITED',
  INVALID_PARAMS: 'KALSHI_INVALID_PARAMS',
  INSUFFICIENT_BALANCE: 'KALSHI_INSUFFICIENT_BALANCE',
  POSITION_LIMIT_EXCEEDED: 'KALSHI_POSITION_LIMIT_EXCEEDED',
  DAILY_LOSS_LIMIT_EXCEEDED: 'KALSHI_DAILY_LOSS_LIMIT_EXCEEDED',
  MARKET_CLOSED: 'KALSHI_MARKET_CLOSED',
  TRADE_FAILED: 'KALSHI_TRADE_FAILED',
  UNSUPPORTED_OPERATION: 'KALSHI_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KalshiOrderSide = 'yes' | 'no';
export type KalshiOrderType = 'market' | 'limit';
export type KalshiOrderStatus = 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'expired';
export type KalshiMarketStatus = 'open' | 'closed' | 'settled';

export interface KalshiMarket {
  id: string;
  ticker: string;
  title: string;
  status: KalshiMarketStatus;
  yesPrice: number;
  noPrice: number;
  volume: number;
  expirationDate: string;
}

export interface KalshiPosition {
  marketId: string;
  ticker: string;
  side: KalshiOrderSide;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface KalshiTrade {
  tradeId: string;
  marketId: string;
  ticker: string;
  side: KalshiOrderSide;
  type: KalshiOrderType;
  quantity: number;
  price: number;
  status: KalshiOrderStatus;
  filledQuantity: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface KalshiDriverConfig {
  /** Kalshi API key ID. */
  apiKeyId: string;
  /** Maximum position size in contracts per market. */
  maxPositionSize: number;
  /** Maximum daily loss in USD before blocking further trades. */
  dailyLossLimitUsd: number;
  /** Whether to use the demo/sandbox environment. */
  sandbox?: boolean;
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
// Kalshi Driver
// ---------------------------------------------------------------------------

export class KalshiDriver extends BaseDriver<KalshiDriverConfig> {
  readonly name = 'kalshi';
  readonly version = '1.0.0';

  private _apiKey: string | null = null;
  private _driverConfig: KalshiDriverConfig | null = null;
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

  protected async doConnect(config: KalshiDriverConfig): Promise<void> {
    if (!config.apiKeyId) {
      throw new Error('Kalshi API key ID is required');
    }
    if (config.maxPositionSize <= 0) {
      throw new Error('maxPositionSize must be a positive number');
    }
    if (config.dailyLossLimitUsd <= 0) {
      throw new Error('dailyLossLimitUsd must be a positive number');
    }

    this._apiKey = await this.credentialManager.getCredential('kalshi', 'api-key');
    if (!this._apiKey) {
      throw new Error('Failed to retrieve Kalshi API key from Credential Manager');
    }
    this._driverConfig = config;

    // Reset risk state on new connection
    this._riskState = {
      dailyRealizedLoss: 0,
      trackingDate: this.todayUTC(),
      positionsByMarket: new Map(),
    };

    this.updateSessionData({
      provider: 'kalshi',
      authenticated: true,
      apiKeyId: config.apiKeyId,
      sandbox: config.sandbox ?? false,
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
      return this.errorResult(operationId, KALSHI_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
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
          KALSHI_ERROR_CODES.UNSUPPORTED_OPERATION,
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
    const { status, limit, cursor, ticker } = operation.params as {
      status?: KalshiMarketStatus;
      limit?: number;
      cursor?: string;
      ticker?: string;
    };

    const result: DriverResult = {
      success: true,
      data: {
        markets: [] as KalshiMarket[],
        cursor: cursor ?? null,
        filters: { status, limit: limit ?? 20, ticker },
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetPositions(operationId: string): Promise<DriverResult> {
    const positions: KalshiPosition[] = [];

    // Return positions from risk state tracking
    for (const [marketId, quantity] of this._riskState.positionsByMarket.entries()) {
      if (quantity !== 0) {
        positions.push({
          marketId,
          ticker: `TICKER-${marketId}`,
          side: quantity > 0 ? 'yes' : 'no',
          quantity: Math.abs(quantity),
          averagePrice: 0.50,
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
    const { marketId, side, quantity, price, type } = operation.params as {
      marketId?: string;
      side?: KalshiOrderSide;
      quantity?: number;
      price?: number;
      type?: KalshiOrderType;
    };

    // --- Parameter validation ---
    if (!marketId) {
      return this.errorResult(operationId, KALSHI_ERROR_CODES.INVALID_PARAMS, 'marketId is required for placeTrade', false);
    }
    if (!side || !['yes', 'no'].includes(side)) {
      return this.errorResult(operationId, KALSHI_ERROR_CODES.INVALID_PARAMS, 'side must be "yes" or "no"', false);
    }
    if (!quantity || quantity <= 0) {
      return this.errorResult(operationId, KALSHI_ERROR_CODES.INVALID_PARAMS, 'quantity must be a positive number', false);
    }
    if (price !== undefined && (price < 0.01 || price > 0.99)) {
      return this.errorResult(operationId, KALSHI_ERROR_CODES.INVALID_PARAMS, 'price must be between 0.01 and 0.99', false);
    }

    const orderType: KalshiOrderType = type ?? 'market';

    // --- Position size validation (Requirement 13.2) ---
    const currentPosition = this._riskState.positionsByMarket.get(marketId) ?? 0;
    const newPosition = currentPosition + quantity;
    if (newPosition > this._driverConfig!.maxPositionSize) {
      return this.errorResult(
        operationId,
        KALSHI_ERROR_CODES.POSITION_LIMIT_EXCEEDED,
        `Position size ${newPosition} would exceed limit of ${this._driverConfig!.maxPositionSize} for market ${marketId}`,
        false,
        {
          currentPosition,
          requestedQuantity: quantity,
          maxPositionSize: this._driverConfig!.maxPositionSize,
        },
      );
    }

    // --- Daily loss limit check (Requirement 13.2) ---
    const tradePrice = price ?? 0.50;
    const potentialLoss = quantity * tradePrice;
    if (this._riskState.dailyRealizedLoss + potentialLoss > this._driverConfig!.dailyLossLimitUsd) {
      return this.errorResult(
        operationId,
        KALSHI_ERROR_CODES.DAILY_LOSS_LIMIT_EXCEEDED,
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

    const trade: KalshiTrade = {
      tradeId: `kalshi-trade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      marketId,
      ticker: `TICKER-${marketId}`,
      side,
      type: orderType,
      quantity,
      price: tradePrice,
      status: 'filled',
      filledQuantity: quantity,
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
      return this.errorResult(operationId, KALSHI_ERROR_CODES.INVALID_PARAMS, 'tradeId is required for cancelTrade', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        tradeId,
        status: 'cancelled' as KalshiOrderStatus,
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
        trades: [] as KalshiTrade[],
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
        currency: 'USD',
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
    return `kalshi-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
