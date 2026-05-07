/**
 * Stripe API Driver — payment processing, subscription management, and invoice handling.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for API key
 * authentication, and implements all Stripe operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
import { BaseDriver } from '../base/driver.js';
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const STRIPE_ERROR_CODES: {
    readonly UNAUTHORIZED: "STRIPE_UNAUTHORIZED";
    readonly FORBIDDEN: "STRIPE_FORBIDDEN";
    readonly NOT_FOUND: "STRIPE_NOT_FOUND";
    readonly RATE_LIMITED: "STRIPE_RATE_LIMITED";
    readonly INVALID_PARAMS: "STRIPE_INVALID_PARAMS";
    readonly CARD_DECLINED: "STRIPE_CARD_DECLINED";
    readonly INSUFFICIENT_FUNDS: "STRIPE_INSUFFICIENT_FUNDS";
    readonly EXPIRED_CARD: "STRIPE_EXPIRED_CARD";
    readonly PROCESSING_ERROR: "STRIPE_PROCESSING_ERROR";
    readonly SUBSCRIPTION_INACTIVE: "STRIPE_SUBSCRIPTION_INACTIVE";
    readonly INVOICE_NOT_FOUND: "STRIPE_INVOICE_NOT_FOUND";
    readonly UNSUPPORTED_OPERATION: "STRIPE_UNSUPPORTED_OPERATION";
};
export type StripePaymentStatus = 'succeeded' | 'pending' | 'failed' | 'canceled' | 'requires_action';
export type StripeSubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing' | 'incomplete' | 'incomplete_expired' | 'paused';
export type StripeInvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
export interface StripePayment {
    id: string;
    amount: number;
    currency: string;
    status: StripePaymentStatus;
    customerId: string;
    description?: string;
    metadata: Record<string, string>;
    createdAt: string;
}
export interface StripeSubscription {
    id: string;
    customerId: string;
    status: StripeSubscriptionStatus;
    priceId: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    metadata: Record<string, string>;
    createdAt: string;
}
export interface StripeInvoice {
    id: string;
    customerId: string;
    subscriptionId?: string;
    status: StripeInvoiceStatus;
    amountDue: number;
    amountPaid: number;
    currency: string;
    dueDate?: string;
    paidAt?: string;
    createdAt: string;
}
export interface StripeCustomer {
    id: string;
    email: string;
    name?: string;
    metadata: Record<string, string>;
    createdAt: string;
}
export interface StripeDriverConfig {
    /** The Stripe secret API key name in Credential Manager. */
    apiKeyName: string;
    /** Whether to use Stripe test mode. */
    testMode?: boolean;
}
export declare class StripeDriver extends BaseDriver<StripeDriverConfig> {
    private readonly credentialManager;
    readonly name = "stripe";
    readonly version = "1.0.0";
    private _apiKey;
    private _driverConfig;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: StripeDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleCreatePayment;
    private handleGetPayment;
    private handleRefundPayment;
    private handleCreateSubscription;
    private handleCancelSubscription;
    private handleGetSubscription;
    private handleListSubscriptions;
    private handleCreateInvoice;
    private handleGetInvoice;
    private handleListInvoices;
    private handleCreateCustomer;
    private handleGetCustomer;
    private createOpId;
    private errorResult;
}
//# sourceMappingURL=stripe-driver.d.ts.map