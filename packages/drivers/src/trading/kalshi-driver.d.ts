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
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const KALSHI_ERROR_CODES: {
    readonly UNAUTHORIZED: "KALSHI_UNAUTHORIZED";
    readonly FORBIDDEN: "KALSHI_FORBIDDEN";
    readonly NOT_FOUND: "KALSHI_NOT_FOUND";
    readonly RATE_LIMITED: "KALSHI_RATE_LIMITED";
    readonly INVALID_PARAMS: "KALSHI_INVALID_PARAMS";
    readonly INSUFFICIENT_BALANCE: "KALSHI_INSUFFICIENT_BALANCE";
    readonly POSITION_LIMIT_EXCEEDED: "KALSHI_POSITION_LIMIT_EXCEEDED";
    readonly DAILY_LOSS_LIMIT_EXCEEDED: "KALSHI_DAILY_LOSS_LIMIT_EXCEEDED";
    readonly MARKET_CLOSED: "KALSHI_MARKET_CLOSED";
    readonly TRADE_FAILED: "KALSHI_TRADE_FAILED";
    readonly UNSUPPORTED_OPERATION: "KALSHI_UNSUPPORTED_OPERATION";
};
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
export declare class KalshiDriver extends BaseDriver<KalshiDriverConfig> {
    private readonly credentialManager;
    readonly name = "kalshi";
    readonly version = "1.0.0";
    private _apiKey;
    private _driverConfig;
    private readonly _completedOperations;
    private _riskState;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: KalshiDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleGetMarkets;
    private handleGetPositions;
    private handlePlaceTrade;
    private handleCancelTrade;
    private handleGetTradeHistory;
    private handleGetBalance;
    /**
     * Record a realized loss for daily loss tracking.
     * Called externally when a position is closed at a loss.
     */
    recordRealizedLoss(amount: number): void;
    /** Get the current daily realized loss. */
    getDailyRealizedLoss(): number;
    /** Get the current position size for a market. */
    getPositionSize(marketId: string): number;
    private resetDailyLossIfNewDay;
    /** Overridable for testing. */
    protected todayUTC(): string;
    private createOperationId;
    private errorResult;
}
//# sourceMappingURL=kalshi-driver.d.ts.map