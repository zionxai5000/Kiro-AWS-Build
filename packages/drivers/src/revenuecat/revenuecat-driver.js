"use strict";
/**
 * RevenueCat API Driver — in-app subscription management and revenue analytics.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for API key
 * authentication, and implements all RevenueCat operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevenueCatDriver = exports.REVENUECAT_ERROR_CODES = void 0;
const driver_js_1 = require("../base/driver.js");
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
exports.REVENUECAT_ERROR_CODES = {
    UNAUTHORIZED: 'RC_UNAUTHORIZED',
    FORBIDDEN: 'RC_FORBIDDEN',
    NOT_FOUND: 'RC_NOT_FOUND',
    RATE_LIMITED: 'RC_RATE_LIMITED',
    INVALID_PARAMS: 'RC_INVALID_PARAMS',
    SUBSCRIBER_NOT_FOUND: 'RC_SUBSCRIBER_NOT_FOUND',
    ENTITLEMENT_NOT_FOUND: 'RC_ENTITLEMENT_NOT_FOUND',
    OFFERING_NOT_FOUND: 'RC_OFFERING_NOT_FOUND',
    UNSUPPORTED_OPERATION: 'RC_UNSUPPORTED_OPERATION',
};
// ---------------------------------------------------------------------------
// RevenueCat Driver
// ---------------------------------------------------------------------------
class RevenueCatDriver extends driver_js_1.BaseDriver {
    credentialManager;
    name = 'revenuecat';
    version = '1.0.0';
    _apiKey = null;
    _driverConfig = null;
    _completedOperations = new Map();
    constructor(credentialManager) {
        super({ maxAttempts: 3, initialDelayMs: 1000 });
        this.credentialManager = credentialManager;
    }
    // =====================================================================
    // Lifecycle
    // =====================================================================
    async doConnect(config) {
        if (!config.apiKeyName) {
            throw new Error('RevenueCat API key name is required');
        }
        if (!config.projectId) {
            throw new Error('RevenueCat project ID is required');
        }
        this._apiKey = await this.credentialManager.getCredential('revenuecat', config.apiKeyName);
        if (!this._apiKey) {
            throw new Error('Failed to retrieve RevenueCat API key from Credential Manager');
        }
        this._driverConfig = config;
        this.updateSessionData({
            provider: 'revenuecat',
            authenticated: true,
            projectId: config.projectId,
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
        const operationId = this.createOpId();
        if (!this._driverConfig) {
            return this.errorResult(operationId, exports.REVENUECAT_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
        }
        switch (operation.type) {
            case 'getSubscriber':
                return this.handleGetSubscriber(operation, operationId);
            case 'getEntitlements':
                return this.handleGetEntitlements(operation, operationId);
            case 'grantEntitlement':
                return this.handleGrantEntitlement(operation, operationId);
            case 'revokeEntitlement':
                return this.handleRevokeEntitlement(operation, operationId);
            case 'getOfferings':
                return this.handleGetOfferings(operation, operationId);
            case 'getRevenueMetrics':
                return this.handleGetRevenueMetrics(operation, operationId);
            case 'listSubscriptions':
                return this.handleListSubscriptions(operation, operationId);
            default:
                return this.errorResult(operationId, exports.REVENUECAT_ERROR_CODES.UNSUPPORTED_OPERATION, `Unsupported operation type: ${operation.type}`, false);
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
    async handleGetSubscriber(operation, operationId) {
        const { subscriberId } = operation.params;
        if (!subscriberId) {
            return this.errorResult(operationId, exports.REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'subscriberId is required for getSubscriber', false);
        }
        const subscriber = {
            id: subscriberId,
            originalAppUserId: subscriberId,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            entitlements: [],
            subscriptions: [],
            nonSubscriptions: [],
        };
        const result = {
            success: true,
            data: subscriber,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetEntitlements(operation, operationId) {
        const { subscriberId } = operation.params;
        if (!subscriberId) {
            return this.errorResult(operationId, exports.REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'subscriberId is required for getEntitlements', false);
        }
        const result = {
            success: true,
            data: {
                subscriberId,
                entitlements: [],
                retrievedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGrantEntitlement(operation, operationId) {
        const { subscriberId, entitlementId, duration, productIdentifier } = operation.params;
        if (!subscriberId) {
            return this.errorResult(operationId, exports.REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'subscriberId is required for grantEntitlement', false);
        }
        if (!entitlementId) {
            return this.errorResult(operationId, exports.REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'entitlementId is required for grantEntitlement', false);
        }
        const entitlement = {
            id: entitlementId,
            isActive: true,
            willRenew: false,
            periodType: 'normal',
            productIdentifier: productIdentifier ?? 'promotional',
            purchaseDate: new Date().toISOString(),
            store: 'promotional',
        };
        const result = {
            success: true,
            data: {
                subscriberId,
                entitlement,
                grantedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleRevokeEntitlement(operation, operationId) {
        const { subscriberId, entitlementId } = operation.params;
        if (!subscriberId) {
            return this.errorResult(operationId, exports.REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'subscriberId is required for revokeEntitlement', false);
        }
        if (!entitlementId) {
            return this.errorResult(operationId, exports.REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'entitlementId is required for revokeEntitlement', false);
        }
        const result = {
            success: true,
            data: {
                subscriberId,
                entitlementId,
                revoked: true,
                revokedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetOfferings(operation, operationId) {
        const { limit } = operation.params;
        const result = {
            success: true,
            data: {
                offerings: [],
                projectId: this._driverConfig.projectId,
                total: 0,
                limit: limit ?? 20,
                retrievedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetRevenueMetrics(operation, operationId) {
        const { startDate, endDate } = operation.params;
        if (!startDate) {
            return this.errorResult(operationId, exports.REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'startDate is required for getRevenueMetrics', false);
        }
        if (!endDate) {
            return this.errorResult(operationId, exports.REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'endDate is required for getRevenueMetrics', false);
        }
        const metrics = {
            activeSubscribers: 0,
            mrr: 0,
            revenue: 0,
            newSubscribers: 0,
            churnRate: 0,
            trialConversionRate: 0,
            period: `${startDate} to ${endDate}`,
            generatedAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: metrics,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleListSubscriptions(operation, operationId) {
        const { subscriberId, status } = operation.params;
        if (!subscriberId) {
            return this.errorResult(operationId, exports.REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'subscriberId is required for listSubscriptions', false);
        }
        const result = {
            success: true,
            data: {
                subscriberId,
                subscriptions: [],
                statusFilter: status ?? null,
                total: 0,
                retrievedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    // =====================================================================
    // Helpers
    // =====================================================================
    createOpId() {
        return `rc-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
exports.RevenueCatDriver = RevenueCatDriver;
//# sourceMappingURL=revenuecat-driver.js.map