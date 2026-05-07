"use strict";
/**
 * Stripe API Driver — payment processing, subscription management, and invoice handling.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for API key
 * authentication, and implements all Stripe operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeDriver = exports.STRIPE_ERROR_CODES = void 0;
const driver_js_1 = require("../base/driver.js");
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
exports.STRIPE_ERROR_CODES = {
    UNAUTHORIZED: 'STRIPE_UNAUTHORIZED',
    FORBIDDEN: 'STRIPE_FORBIDDEN',
    NOT_FOUND: 'STRIPE_NOT_FOUND',
    RATE_LIMITED: 'STRIPE_RATE_LIMITED',
    INVALID_PARAMS: 'STRIPE_INVALID_PARAMS',
    CARD_DECLINED: 'STRIPE_CARD_DECLINED',
    INSUFFICIENT_FUNDS: 'STRIPE_INSUFFICIENT_FUNDS',
    EXPIRED_CARD: 'STRIPE_EXPIRED_CARD',
    PROCESSING_ERROR: 'STRIPE_PROCESSING_ERROR',
    SUBSCRIPTION_INACTIVE: 'STRIPE_SUBSCRIPTION_INACTIVE',
    INVOICE_NOT_FOUND: 'STRIPE_INVOICE_NOT_FOUND',
    UNSUPPORTED_OPERATION: 'STRIPE_UNSUPPORTED_OPERATION',
};
// ---------------------------------------------------------------------------
// Stripe Driver
// ---------------------------------------------------------------------------
class StripeDriver extends driver_js_1.BaseDriver {
    credentialManager;
    name = 'stripe';
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
            throw new Error('Stripe API key name is required');
        }
        this._apiKey = await this.credentialManager.getCredential('stripe', config.apiKeyName);
        if (!this._apiKey) {
            throw new Error('Failed to retrieve Stripe API key from Credential Manager');
        }
        this._driverConfig = config;
        this.updateSessionData({
            provider: 'stripe',
            authenticated: true,
            testMode: config.testMode ?? false,
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
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
        }
        switch (operation.type) {
            case 'createPayment':
                return this.handleCreatePayment(operation, operationId);
            case 'getPayment':
                return this.handleGetPayment(operation, operationId);
            case 'refundPayment':
                return this.handleRefundPayment(operation, operationId);
            case 'createSubscription':
                return this.handleCreateSubscription(operation, operationId);
            case 'cancelSubscription':
                return this.handleCancelSubscription(operation, operationId);
            case 'getSubscription':
                return this.handleGetSubscription(operation, operationId);
            case 'listSubscriptions':
                return this.handleListSubscriptions(operation, operationId);
            case 'createInvoice':
                return this.handleCreateInvoice(operation, operationId);
            case 'getInvoice':
                return this.handleGetInvoice(operation, operationId);
            case 'listInvoices':
                return this.handleListInvoices(operation, operationId);
            case 'createCustomer':
                return this.handleCreateCustomer(operation, operationId);
            case 'getCustomer':
                return this.handleGetCustomer(operation, operationId);
            default:
                return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.UNSUPPORTED_OPERATION, `Unsupported operation type: ${operation.type}`, false);
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
    async handleCreatePayment(operation, operationId) {
        const { amount, currency, customerId, description, metadata } = operation.params;
        if (amount === undefined || amount <= 0) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'amount must be a positive number', false);
        }
        if (!currency) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'currency is required for createPayment', false);
        }
        if (!customerId) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'customerId is required for createPayment', false);
        }
        const payment = {
            id: `pi_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            amount,
            currency,
            status: 'succeeded',
            customerId,
            description,
            metadata: metadata ?? {},
            createdAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: payment,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetPayment(operation, operationId) {
        const { paymentId } = operation.params;
        if (!paymentId) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'paymentId is required for getPayment', false);
        }
        const result = {
            success: true,
            data: {
                id: paymentId,
                amount: 0,
                currency: 'usd',
                status: 'succeeded',
                customerId: 'cus_unknown',
                metadata: {},
                createdAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleRefundPayment(operation, operationId) {
        const { paymentId, amount, reason } = operation.params;
        if (!paymentId) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'paymentId is required for refundPayment', false);
        }
        const result = {
            success: true,
            data: {
                refundId: `re_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                paymentId,
                amount: amount ?? 0,
                reason: reason ?? 'requested_by_customer',
                status: 'succeeded',
                createdAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleCreateSubscription(operation, operationId) {
        const { customerId, priceId, metadata } = operation.params;
        if (!customerId) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'customerId is required for createSubscription', false);
        }
        if (!priceId) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'priceId is required for createSubscription', false);
        }
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const subscription = {
            id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            customerId,
            status: 'active',
            priceId,
            currentPeriodStart: now.toISOString(),
            currentPeriodEnd: periodEnd.toISOString(),
            cancelAtPeriodEnd: false,
            metadata: metadata ?? {},
            createdAt: now.toISOString(),
        };
        const result = {
            success: true,
            data: subscription,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleCancelSubscription(operation, operationId) {
        const { subscriptionId, cancelAtPeriodEnd } = operation.params;
        if (!subscriptionId) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'subscriptionId is required for cancelSubscription', false);
        }
        const result = {
            success: true,
            data: {
                subscriptionId,
                status: cancelAtPeriodEnd ? 'active' : 'canceled',
                cancelAtPeriodEnd: cancelAtPeriodEnd ?? false,
                canceledAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetSubscription(operation, operationId) {
        const { subscriptionId } = operation.params;
        if (!subscriptionId) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'subscriptionId is required for getSubscription', false);
        }
        const now = new Date();
        const result = {
            success: true,
            data: {
                id: subscriptionId,
                customerId: 'cus_unknown',
                status: 'active',
                priceId: 'price_unknown',
                currentPeriodStart: now.toISOString(),
                currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                cancelAtPeriodEnd: false,
                metadata: {},
                createdAt: now.toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleListSubscriptions(operation, operationId) {
        const { customerId, status, limit } = operation.params;
        const result = {
            success: true,
            data: {
                subscriptions: [],
                customerId: customerId ?? null,
                statusFilter: status ?? null,
                total: 0,
                limit: limit ?? 10,
                retrievedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleCreateInvoice(operation, operationId) {
        const { customerId, subscriptionId, dueDate, metadata } = operation.params;
        if (!customerId) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'customerId is required for createInvoice', false);
        }
        const invoice = {
            id: `in_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            customerId,
            subscriptionId,
            status: 'draft',
            amountDue: 0,
            amountPaid: 0,
            currency: 'usd',
            dueDate,
            createdAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: invoice,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetInvoice(operation, operationId) {
        const { invoiceId } = operation.params;
        if (!invoiceId) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'invoiceId is required for getInvoice', false);
        }
        const result = {
            success: true,
            data: {
                id: invoiceId,
                customerId: 'cus_unknown',
                status: 'open',
                amountDue: 0,
                amountPaid: 0,
                currency: 'usd',
                createdAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleListInvoices(operation, operationId) {
        const { customerId, status, limit } = operation.params;
        const result = {
            success: true,
            data: {
                invoices: [],
                customerId: customerId ?? null,
                statusFilter: status ?? null,
                total: 0,
                limit: limit ?? 10,
                retrievedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleCreateCustomer(operation, operationId) {
        const { email, name, metadata } = operation.params;
        if (!email) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'email is required for createCustomer', false);
        }
        const customer = {
            id: `cus_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            email,
            name,
            metadata: metadata ?? {},
            createdAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: customer,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetCustomer(operation, operationId) {
        const { customerId } = operation.params;
        if (!customerId) {
            return this.errorResult(operationId, exports.STRIPE_ERROR_CODES.INVALID_PARAMS, 'customerId is required for getCustomer', false);
        }
        const result = {
            success: true,
            data: {
                id: customerId,
                email: 'unknown@example.com',
                metadata: {},
                createdAt: new Date().toISOString(),
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
        return `stripe-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
exports.StripeDriver = StripeDriver;
//# sourceMappingURL=stripe-driver.js.map