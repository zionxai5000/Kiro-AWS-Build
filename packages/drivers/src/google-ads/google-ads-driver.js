"use strict";
/**
 * Google Ads API Driver — campaign management and performance analytics.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for OAuth2
 * authentication, and implements all Google Ads operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleAdsDriver = exports.GOOGLE_ADS_ERROR_CODES = void 0;
const driver_js_1 = require("../base/driver.js");
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
exports.GOOGLE_ADS_ERROR_CODES = {
    UNAUTHORIZED: 'GADS_UNAUTHORIZED',
    FORBIDDEN: 'GADS_FORBIDDEN',
    NOT_FOUND: 'GADS_NOT_FOUND',
    RATE_LIMITED: 'GADS_RATE_LIMITED',
    INVALID_PARAMS: 'GADS_INVALID_PARAMS',
    CAMPAIGN_NOT_FOUND: 'GADS_CAMPAIGN_NOT_FOUND',
    AD_GROUP_NOT_FOUND: 'GADS_AD_GROUP_NOT_FOUND',
    BUDGET_EXCEEDED: 'GADS_BUDGET_EXCEEDED',
    POLICY_VIOLATION: 'GADS_POLICY_VIOLATION',
    BILLING_ERROR: 'GADS_BILLING_ERROR',
    UNSUPPORTED_OPERATION: 'GADS_UNSUPPORTED_OPERATION',
};
// ---------------------------------------------------------------------------
// Google Ads Driver
// ---------------------------------------------------------------------------
class GoogleAdsDriver extends driver_js_1.BaseDriver {
    credentialManager;
    name = 'google-ads';
    version = '1.0.0';
    _accessToken = null;
    _driverConfig = null;
    _completedOperations = new Map();
    constructor(credentialManager) {
        super({ maxAttempts: 3, initialDelayMs: 2000 });
        this.credentialManager = credentialManager;
    }
    // =====================================================================
    // Lifecycle
    // =====================================================================
    async doConnect(config) {
        if (!config.clientId) {
            throw new Error('Google Ads OAuth2 client ID is required');
        }
        if (!config.customerId) {
            throw new Error('Google Ads customer ID is required');
        }
        if (!config.developerTokenKeyName) {
            throw new Error('Google Ads developer token key name is required');
        }
        this._accessToken = await this.credentialManager.getCredential('google-ads', config.developerTokenKeyName);
        if (!this._accessToken) {
            throw new Error('Failed to retrieve Google Ads developer token from Credential Manager');
        }
        this._driverConfig = config;
        this.updateSessionData({
            provider: 'google',
            authenticated: true,
            customerId: config.customerId,
        });
    }
    async doDisconnect() {
        this._accessToken = null;
        this._driverConfig = null;
        this._completedOperations.clear();
    }
    // =====================================================================
    // Execute
    // =====================================================================
    async doExecute(operation) {
        const operationId = this.createOpId();
        if (!this._driverConfig) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
        }
        switch (operation.type) {
            case 'createCampaign':
                return this.handleCreateCampaign(operation, operationId);
            case 'getCampaign':
                return this.handleGetCampaign(operation, operationId);
            case 'updateCampaign':
                return this.handleUpdateCampaign(operation, operationId);
            case 'pauseCampaign':
                return this.handlePauseCampaign(operation, operationId);
            case 'listCampaigns':
                return this.handleListCampaigns(operation, operationId);
            case 'createAdGroup':
                return this.handleCreateAdGroup(operation, operationId);
            case 'getPerformance':
                return this.handleGetPerformance(operation, operationId);
            case 'addKeywords':
                return this.handleAddKeywords(operation, operationId);
            default:
                return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.UNSUPPORTED_OPERATION, `Unsupported operation type: ${operation.type}`, false);
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
    async handleCreateCampaign(operation, operationId) {
        const { name, type, budgetAmountMicros, budgetCurrency, startDate, endDate } = operation.params;
        if (!name) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'name is required for createCampaign', false);
        }
        if (!type) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'type is required for createCampaign', false);
        }
        if (budgetAmountMicros === undefined || budgetAmountMicros <= 0) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'budgetAmountMicros must be a positive number', false);
        }
        const campaign = {
            id: `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            status: 'enabled',
            type,
            budgetAmountMicros,
            budgetCurrency: budgetCurrency ?? 'USD',
            startDate,
            endDate,
            customerId: this._driverConfig.customerId,
            createdAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: campaign,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetCampaign(operation, operationId) {
        const { campaignId } = operation.params;
        if (!campaignId) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'campaignId is required for getCampaign', false);
        }
        const campaign = {
            id: campaignId,
            name: 'Mock Campaign',
            status: 'enabled',
            type: 'search',
            budgetAmountMicros: 0,
            budgetCurrency: 'USD',
            customerId: this._driverConfig.customerId,
            createdAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: campaign,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleUpdateCampaign(operation, operationId) {
        const { campaignId, name, budgetAmountMicros, startDate, endDate } = operation.params;
        if (!campaignId) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'campaignId is required for updateCampaign', false);
        }
        const updatedFields = [];
        if (name !== undefined)
            updatedFields.push('name');
        if (budgetAmountMicros !== undefined)
            updatedFields.push('budgetAmountMicros');
        if (startDate !== undefined)
            updatedFields.push('startDate');
        if (endDate !== undefined)
            updatedFields.push('endDate');
        if (updatedFields.length === 0) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'At least one field must be provided for updateCampaign', false);
        }
        const result = {
            success: true,
            data: {
                campaignId,
                updatedFields,
                updatedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handlePauseCampaign(operation, operationId) {
        const { campaignId } = operation.params;
        if (!campaignId) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'campaignId is required for pauseCampaign', false);
        }
        const result = {
            success: true,
            data: {
                campaignId,
                status: 'paused',
                pausedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleListCampaigns(operation, operationId) {
        const { status, limit } = operation.params;
        const result = {
            success: true,
            data: {
                campaigns: [],
                customerId: this._driverConfig.customerId,
                statusFilter: status ?? null,
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
    async handleCreateAdGroup(operation, operationId) {
        const { campaignId, name, cpcBidMicros } = operation.params;
        if (!campaignId) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'campaignId is required for createAdGroup', false);
        }
        if (!name) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'name is required for createAdGroup', false);
        }
        const adGroup = {
            id: `adgroup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            campaignId,
            name,
            status: 'enabled',
            cpcBidMicros,
            createdAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: adGroup,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetPerformance(operation, operationId) {
        const { campaignId, adGroupId, startDate, endDate } = operation.params;
        if (!startDate) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'startDate is required for getPerformance', false);
        }
        if (!endDate) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'endDate is required for getPerformance', false);
        }
        const metrics = {
            campaignId,
            adGroupId,
            impressions: 0,
            clicks: 0,
            ctr: 0,
            averageCpc: 0,
            costMicros: 0,
            conversions: 0,
            conversionRate: 0,
            costPerConversion: 0,
            startDate,
            endDate,
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
    async handleAddKeywords(operation, operationId) {
        const { adGroupId, keywords } = operation.params;
        if (!adGroupId) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'adGroupId is required for addKeywords', false);
        }
        if (!keywords || keywords.length === 0) {
            return this.errorResult(operationId, exports.GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'keywords array is required for addKeywords', false);
        }
        const createdKeywords = keywords.map((kw, idx) => ({
            id: `kw-${Date.now()}-${idx}`,
            adGroupId,
            text: kw.text,
            matchType: kw.matchType ?? 'broad',
            status: 'enabled',
            cpcBidMicros: kw.cpcBidMicros,
        }));
        const result = {
            success: true,
            data: {
                adGroupId,
                keywords: createdKeywords,
                addedCount: createdKeywords.length,
                addedAt: new Date().toISOString(),
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
        return `gads-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
exports.GoogleAdsDriver = GoogleAdsDriver;
//# sourceMappingURL=google-ads-driver.js.map