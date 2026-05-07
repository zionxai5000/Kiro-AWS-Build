/**
 * Zion Alpha Trading — Strategy
 *
 * Implements opportunity evaluation against risk parameters, position sizing
 * logic, and entry/exit trigger conditions.
 *
 * Requirements: 13.1, 13.2
 */
import type { DriverResult } from '@seraphim/core';
export interface TradingDriver {
    execute(operation: {
        type: string;
        params: Record<string, unknown>;
    }): Promise<DriverResult>;
}
export interface LLMDriver {
    execute(operation: {
        type: string;
        params: Record<string, unknown>;
    }): Promise<DriverResult>;
}
export type TradingPlatform = 'kalshi' | 'polymarket';
export type TradeDirection = 'long' | 'short';
export interface MarketOpportunity {
    marketId: string;
    platform: TradingPlatform;
    title: string;
    category: string;
    currentPrice: number;
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
    confidence: number;
    riskScore: number;
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
export declare class TradingStrategy {
    private readonly llmDriver;
    private readonly riskParams;
    constructor(llmDriver: LLMDriver, riskParams: RiskParameters);
    /**
     * Evaluate a market opportunity against risk parameters.
     */
    evaluateOpportunity(opportunity: MarketOpportunity, currentDailyPnL: number, openPositionCount: number): Promise<EvaluationResult>;
    /**
     * Calculate position size based on risk parameters.
     */
    calculatePositionSize(entryPrice: number, stopLoss: number): PositionSizeResult;
    /**
     * Determine exit conditions for a position.
     */
    getExitConditions(entryPrice: number, direction: TradeDirection, expiresAt: string): ExitCondition[];
    private determineDirection;
    private calculateConfidence;
    private calculateRiskScore;
    private rejectedResult;
}
//# sourceMappingURL=strategy.d.ts.map