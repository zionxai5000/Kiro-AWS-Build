/**
 * RevenueCat API Driver — in-app subscription management and revenue analytics.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for API key
 * authentication, and implements all RevenueCat operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
import { BaseDriver } from '../base/driver.js';
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const REVENUECAT_ERROR_CODES: {
    readonly UNAUTHORIZED: "RC_UNAUTHORIZED";
    readonly FORBIDDEN: "RC_FORBIDDEN";
    readonly NOT_FOUND: "RC_NOT_FOUND";
    readonly RATE_LIMITED: "RC_RATE_LIMITED";
    readonly INVALID_PARAMS: "RC_INVALID_PARAMS";
    readonly SUBSCRIBER_NOT_FOUND: "RC_SUBSCRIBER_NOT_FOUND";
    readonly ENTITLEMENT_NOT_FOUND: "RC_ENTITLEMENT_NOT_FOUND";
    readonly OFFERING_NOT_FOUND: "RC_OFFERING_NOT_FOUND";
    readonly UNSUPPORTED_OPERATION: "RC_UNSUPPORTED_OPERATION";
};
export type RevenueCatSubscriptionStatus = 'active' | 'expired' | 'in_grace_period' | 'in_billing_retry' | 'canceled' | 'paused';
export type RevenueCatStore = 'app_store' | 'play_store' | 'stripe' | 'promotional';
export interface RevenueCatSubscriber {
    id: string;
    originalAppUserId: string;
    firstSeen: string;
    lastSeen: string;
    entitlements: RevenueCatEntitlement[];
    subscriptions: RevenueCatSubscription[];
    nonSubscriptions: Record<string, unknown>[];
}
export interface RevenueCatEntitlement {
    id: string;
    isActive: boolean;
    willRenew: boolean;
    periodType: 'normal' | 'trial' | 'intro';
    productIdentifier: string;
    purchaseDate: string;
    expirationDate?: string;
    store: RevenueCatStore;
}
export interface RevenueCatSubscription {
    id: string;
    productIdentifier: string;
    status: RevenueCatSubscriptionStatus;
    purchaseDate: string;
    expirationDate?: string;
    store: RevenueCatStore;
    isSandbox: boolean;
    willRenew: boolean;
    unsubscribeDetectedAt?: string;
    billingIssueDetectedAt?: string;
}
export interface RevenueCatOffering {
    id: string;
    description: string;
    isCurrent: boolean;
    packages: RevenueCatPackage[];
}
export interface RevenueCatPackage {
    id: string;
    identifier: string;
    productIdentifier: string;
    platformProductIdentifier: string;
}
export interface RevenueCatRevenueMetrics {
    activeSubscribers: number;
    mrr: number;
    revenue: number;
    newSubscribers: number;
    churnRate: number;
    trialConversionRate: number;
    period: string;
    generatedAt: string;
}
export interface RevenueCatDriverConfig {
    /** The RevenueCat secret API key name in Credential Manager. */
    apiKeyName: string;
    /** The RevenueCat project ID. */
    projectId: string;
}
export declare class RevenueCatDriver extends BaseDriver<RevenueCatDriverConfig> {
    private readonly credentialManager;
    readonly name = "revenuecat";
    readonly version = "1.0.0";
    private _apiKey;
    private _driverConfig;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: RevenueCatDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleGetSubscriber;
    private handleGetEntitlements;
    private handleGrantEntitlement;
    private handleRevokeEntitlement;
    private handleGetOfferings;
    private handleGetRevenueMetrics;
    private handleListSubscriptions;
    private createOpId;
    private errorResult;
}
//# sourceMappingURL=revenuecat-driver.d.ts.map