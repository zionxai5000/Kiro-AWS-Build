"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.KalshiDriver = exports.KALSHI_ERROR_CODES = void 0;
const driver_js_1 = require("../base/driver.js");
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
exports.KALSHI_ERROR_CODES = {
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
};
// ---------------------------------------------------------------------------
// Kalshi Driver
// ---------------------------------------------------------------------------
class KalshiDriver extends driver_js_1.BaseDriver {
    credentialManager;
    name = 'kalshi';
    version = '1.0.0';
    _apiKey = null;
    _driverConfig = null;
    _completedOperations = new Map();
    _riskState = {
        dailyRealizedLoss: 0,
        trackingDate: this.todayUTC(),
        positionsByMarket: new Map(),
    };
    constructor(credentialManager) {
        // Trading-specific retry: 3 attempts, 1s initial delay
        super({ maxAttempts: 3, initialDelayMs: 1000 });
        this.credentialManager = credentialManager;
    }
    // =====================================================================
    // Lifecycle
    // =====================================================================
    async doConnect(config) {
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
    async doDisconnect() {
        this._apiKey = null;
        this._driverConfig = null;
        this._completedOperations.clear();
    }
    // =====================================================================
    // Execute
    // =====================================================================
    async doExecute(operation) {
        const operationId = this.createOperationId();
        if (!this._driverConfig) {
            return this.errorResult(operationId, exports.KALSHI_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
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
                return this.errorResult(operationId, exports.KALSHI_ERROR_CODES.UNSUPPORTED_OPERATION, `Unsupported operation type: ${operation.type}`, false);
        }
    }
    async doVerify(operationId) {
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
    async handleGetMarkets(operation, operationId) {
        const { status, limit, cursor, ticker } = operation.params;
        const result = {
            success: true,
            data: {
                markets: [],
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
    async handleGetPositions(operationId) {
        const positions = [];
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
        const result = {
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
    async handlePlaceTrade(operation, operationId) {
        const { marketId, side, quantity, price, type } = operation.params;
        // --- Parameter validation ---
        if (!marketId) {
            return this.errorResult(operationId, exports.KALSHI_ERROR_CODES.INVALID_PARAMS, 'marketId is required for placeTrade', false);
        }
        if (!side || !['yes', 'no'].includes(side)) {
            return this.errorResult(operationId, exports.KALSHI_ERROR_CODES.INVALID_PARAMS, 'side must be "yes" or "no"', false);
        }
        if (!quantity || quantity <= 0) {
            return this.errorResult(operationId, exports.KALSHI_ERROR_CODES.INVALID_PARAMS, 'quantity must be a positive number', false);
        }
        if (price !== undefined && (price < 0.01 || price > 0.99)) {
            return this.errorResult(operationId, exports.KALSHI_ERROR_CODES.INVALID_PARAMS, 'price must be between 0.01 and 0.99', false);
        }
        const orderType = type ?? 'market';
        // --- Position size validation (Requirement 13.2) ---
        const currentPosition = this._riskState.positionsByMarket.get(marketId) ?? 0;
        const newPosition = currentPosition + quantity;
        if (newPosition > this._driverConfig.maxPositionSize) {
            return this.errorResult(operationId, exports.KALSHI_ERROR_CODES.POSITION_LIMIT_EXCEEDED, `Position size ${newPosition} would exceed limit of ${this._driverConfig.maxPositionSize} for market ${marketId}`, false, {
                currentPosition,
                requestedQuantity: quantity,
                maxPositionSize: this._driverConfig.maxPositionSize,
            });
        }
        // --- Daily loss limit check (Requirement 13.2) ---
        const tradePrice = price ?? 0.50;
        const potentialLoss = quantity * tradePrice;
        if (this._riskState.dailyRealizedLoss + potentialLoss > this._driverConfig.dailyLossLimitUsd) {
            return this.errorResult(operationId, exports.KALSHI_ERROR_CODES.DAILY_LOSS_LIMIT_EXCEEDED, `Trade would risk exceeding daily loss limit of $${this._driverConfig.dailyLossLimitUsd}`, false, {
                currentDailyLoss: this._riskState.dailyRealizedLoss,
                potentialAdditionalLoss: potentialLoss,
                dailyLossLimit: this._driverConfig.dailyLossLimitUsd,
            });
        }
        // --- Execute trade (mock) ---
        this._riskState.positionsByMarket.set(marketId, newPosition);
        const trade = {
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
        const result = {
            success: true,
            data: trade,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleCancelTrade(operation, operationId) {
        const { tradeId } = operation.params;
        if (!tradeId) {
            return this.errorResult(operationId, exports.KALSHI_ERROR_CODES.INVALID_PARAMS, 'tradeId is required for cancelTrade', false);
        }
        const result = {
            success: true,
            data: {
                tradeId,
                status: 'cancelled',
                cancelledAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetTradeHistory(operation, operationId) {
        const { marketId, startDate, endDate, limit, cursor } = operation.params;
        const result = {
            success: true,
            data: {
                trades: [],
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
    async handleGetBalance(operationId) {
        const result = {
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
    recordRealizedLoss(amount) {
        this.resetDailyLossIfNewDay();
        this._riskState.dailyRealizedLoss += amount;
    }
    /** Get the current daily realized loss. */
    getDailyRealizedLoss() {
        this.resetDailyLossIfNewDay();
        return this._riskState.dailyRealizedLoss;
    }
    /** Get the current position size for a market. */
    getPositionSize(marketId) {
        return this._riskState.positionsByMarket.get(marketId) ?? 0;
    }
    resetDailyLossIfNewDay() {
        const today = this.todayUTC();
        if (this._riskState.trackingDate !== today) {
            this._riskState.dailyRealizedLoss = 0;
            this._riskState.trackingDate = today;
        }
    }
    /** Overridable for testing. */
    todayUTC() {
        return new Date().toISOString().slice(0, 10);
    }
    // =====================================================================
    // Helpers
    // =====================================================================
    createOperationId() {
        return `kalshi-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    errorResult(operationId, code, message, retryable, details) {
        return {
            success: false,
            error: { code, message, retryable, details },
            retryable,
            operationId,
        };
    }
}
exports.KalshiDriver = KalshiDriver;
//# sourceMappingURL=kalshi-driver.js.map