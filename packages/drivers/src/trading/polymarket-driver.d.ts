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
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const POLYMARKET_ERROR_CODES: {
    readonly UNAUTHORIZED: "POLY_UNAUTHORIZED";
    readonly FORBIDDEN: "POLY_FORBIDDEN";
    readonly NOT_FOUND: "POLY_NOT_FOUND";
    readonly RATE_LIMITED: "POLY_RATE_LIMITED";
    readonly INVALID_PARAMS: "POLY_INVALID_PARAMS";
    readonly INSUFFICIENT_BALANCE: "POLY_INSUFFICIENT_BALANCE";
    readonly POSITION_LIMIT_EXCEEDED: "POLY_POSITION_LIMIT_EXCEEDED";
    readonly DAILY_LOSS_LIMIT_EXCEEDED: "POLY_DAILY_LOSS_LIMIT_EXCEEDED";
    readonly MARKET_CLOSED: "POLY_MARKET_CLOSED";
    readonly TRADE_FAILED: "POLY_TRADE_FAILED";
    readonly UNSUPPORTED_OPERATION: "POLY_UNSUPPORTED_OPERATION";
};
export type PolymarketOutcome = 'Yes' | 'No';
export type PolymarketOrderType = 'market' | 'limit' | 'gtc';
export type PolymarketOrderStatus = 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'expired';
export type PolymarketMarketStatus = 'active' | 'closed' | 'resolved';
export interface PolymarketMarket {
    id: string;
    conditionId: string;
    question: string;
    status: PolymarketMarketStatus;
    outcomePrices: {
        yes: number;
        no: number;
    };
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
export declare class PolymarketDriver extends BaseDriver<PolymarketDriverConfig> {
    private readonly credentialManager;
    readonly name = "polymarket";
    readonly version = "1.0.0";
    private _apiKey;
    private _driverConfig;
    private readonly _completedOperations;
    private _riskState;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: PolymarketDriverConfig): Promise<void>;
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
//# sourceMappingURL=polymarket-driver.d.ts.map