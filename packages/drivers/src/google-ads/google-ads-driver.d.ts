/**
 * Google Ads API Driver — campaign management and performance analytics.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for OAuth2
 * authentication, and implements all Google Ads operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
import { BaseDriver } from '../base/driver.js';
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const GOOGLE_ADS_ERROR_CODES: {
    readonly UNAUTHORIZED: "GADS_UNAUTHORIZED";
    readonly FORBIDDEN: "GADS_FORBIDDEN";
    readonly NOT_FOUND: "GADS_NOT_FOUND";
    readonly RATE_LIMITED: "GADS_RATE_LIMITED";
    readonly INVALID_PARAMS: "GADS_INVALID_PARAMS";
    readonly CAMPAIGN_NOT_FOUND: "GADS_CAMPAIGN_NOT_FOUND";
    readonly AD_GROUP_NOT_FOUND: "GADS_AD_GROUP_NOT_FOUND";
    readonly BUDGET_EXCEEDED: "GADS_BUDGET_EXCEEDED";
    readonly POLICY_VIOLATION: "GADS_POLICY_VIOLATION";
    readonly BILLING_ERROR: "GADS_BILLING_ERROR";
    readonly UNSUPPORTED_OPERATION: "GADS_UNSUPPORTED_OPERATION";
};
export type GoogleAdsCampaignStatus = 'enabled' | 'paused' | 'removed';
export type GoogleAdsCampaignType = 'search' | 'display' | 'shopping' | 'video' | 'app' | 'performance_max' | 'demand_gen';
export type GoogleAdsAdGroupStatus = 'enabled' | 'paused' | 'removed';
export interface GoogleAdsCampaign {
    id: string;
    name: string;
    status: GoogleAdsCampaignStatus;
    type: GoogleAdsCampaignType;
    budgetAmountMicros: number;
    budgetCurrency: string;
    startDate?: string;
    endDate?: string;
    customerId: string;
    createdAt: string;
}
export interface GoogleAdsAdGroup {
    id: string;
    campaignId: string;
    name: string;
    status: GoogleAdsAdGroupStatus;
    cpcBidMicros?: number;
    createdAt: string;
}
export interface GoogleAdsPerformanceMetrics {
    campaignId?: string;
    adGroupId?: string;
    impressions: number;
    clicks: number;
    ctr: number;
    averageCpc: number;
    costMicros: number;
    conversions: number;
    conversionRate: number;
    costPerConversion: number;
    startDate: string;
    endDate: string;
    generatedAt: string;
}
export interface GoogleAdsKeyword {
    id: string;
    adGroupId: string;
    text: string;
    matchType: 'exact' | 'phrase' | 'broad';
    status: 'enabled' | 'paused' | 'removed';
    cpcBidMicros?: number;
}
export interface GoogleAdsDriverConfig {
    /** The OAuth2 client ID. */
    clientId: string;
    /** The Google Ads customer ID (without dashes). */
    customerId: string;
    /** The developer token key name in Credential Manager. */
    developerTokenKeyName: string;
    /** Optional manager account customer ID. */
    loginCustomerId?: string;
}
export declare class GoogleAdsDriver extends BaseDriver<GoogleAdsDriverConfig> {
    private readonly credentialManager;
    readonly name = "google-ads";
    readonly version = "1.0.0";
    private _accessToken;
    private _driverConfig;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: GoogleAdsDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleCreateCampaign;
    private handleGetCampaign;
    private handleUpdateCampaign;
    private handlePauseCampaign;
    private handleListCampaigns;
    private handleCreateAdGroup;
    private handleGetPerformance;
    private handleAddKeywords;
    private createOpId;
    private errorResult;
}
//# sourceMappingURL=google-ads-driver.d.ts.map