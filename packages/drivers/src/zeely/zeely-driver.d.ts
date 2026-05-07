/**
 * Zeely API Driver — landing page and funnel management.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for API key
 * authentication, and implements all Zeely operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
import { BaseDriver } from '../base/driver.js';
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const ZEELY_ERROR_CODES: {
    readonly UNAUTHORIZED: "ZEELY_UNAUTHORIZED";
    readonly FORBIDDEN: "ZEELY_FORBIDDEN";
    readonly NOT_FOUND: "ZEELY_NOT_FOUND";
    readonly RATE_LIMITED: "ZEELY_RATE_LIMITED";
    readonly INVALID_PARAMS: "ZEELY_INVALID_PARAMS";
    readonly PAGE_NOT_FOUND: "ZEELY_PAGE_NOT_FOUND";
    readonly FUNNEL_NOT_FOUND: "ZEELY_FUNNEL_NOT_FOUND";
    readonly TEMPLATE_NOT_FOUND: "ZEELY_TEMPLATE_NOT_FOUND";
    readonly DOMAIN_UNAVAILABLE: "ZEELY_DOMAIN_UNAVAILABLE";
    readonly UNSUPPORTED_OPERATION: "ZEELY_UNSUPPORTED_OPERATION";
};
export type ZeelyPageStatus = 'draft' | 'published' | 'archived' | 'scheduled';
export type ZeelyFunnelStatus = 'draft' | 'active' | 'paused' | 'archived';
export interface ZeelyLandingPage {
    id: string;
    name: string;
    slug: string;
    status: ZeelyPageStatus;
    templateId?: string;
    customDomain?: string;
    url: string;
    views: number;
    conversions: number;
    conversionRate: number;
    createdAt: string;
    updatedAt: string;
    publishedAt?: string;
}
export interface ZeelyFunnel {
    id: string;
    name: string;
    status: ZeelyFunnelStatus;
    steps: ZeelyFunnelStep[];
    totalVisitors: number;
    totalConversions: number;
    overallConversionRate: number;
    createdAt: string;
    updatedAt: string;
}
export interface ZeelyFunnelStep {
    id: string;
    name: string;
    order: number;
    pageId: string;
    visitors: number;
    conversions: number;
    dropOffRate: number;
}
export interface ZeelyTemplate {
    id: string;
    name: string;
    category: string;
    previewUrl: string;
    description: string;
}
export interface ZeelyAnalytics {
    pageId?: string;
    funnelId?: string;
    views: number;
    uniqueVisitors: number;
    conversions: number;
    conversionRate: number;
    averageTimeOnPage: number;
    bounceRate: number;
    startDate: string;
    endDate: string;
    generatedAt: string;
}
export interface ZeelyDriverConfig {
    /** The Zeely API key name in Credential Manager. */
    apiKeyName: string;
    /** The Zeely workspace ID. */
    workspaceId: string;
}
export declare class ZeelyDriver extends BaseDriver<ZeelyDriverConfig> {
    private readonly credentialManager;
    readonly name = "zeely";
    readonly version = "1.0.0";
    private _apiKey;
    private _driverConfig;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: ZeelyDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleCreatePage;
    private handleGetPage;
    private handleUpdatePage;
    private handlePublishPage;
    private handleListPages;
    private handleCreateFunnel;
    private handleGetFunnel;
    private handleUpdateFunnel;
    private handleGetAnalytics;
    private handleListTemplates;
    private createOpId;
    private errorResult;
}
//# sourceMappingURL=zeely-driver.d.ts.map