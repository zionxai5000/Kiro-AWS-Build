/**
 * App Store Connect Driver — Apple App Store submission and management.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for JWT authentication,
 * and handles App Store-specific error codes and rejection reasons.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 11.2, 11.3, 11.4
 */
import { BaseDriver } from '../base/driver.js';
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export interface RejectionReason {
    code: string;
    category: 'guideline_violation' | 'metadata_issue' | 'binary_issue' | 'legal_issue' | 'design_issue';
    description: string;
    guidelineSection?: string;
    remediationHint: string;
}
export declare const APP_STORE_REJECTION_REASONS: Record<string, RejectionReason>;
export declare const APP_STORE_ERROR_CODES: {
    readonly UNAUTHORIZED: "ASC_UNAUTHORIZED";
    readonly FORBIDDEN: "ASC_FORBIDDEN";
    readonly NOT_FOUND: "ASC_NOT_FOUND";
    readonly CONFLICT: "ASC_CONFLICT";
    readonly RATE_LIMITED: "ASC_RATE_LIMITED";
    readonly INVALID_PARAMS: "ASC_INVALID_PARAMS";
    readonly BUILD_PROCESSING: "ASC_BUILD_PROCESSING";
    readonly REVIEW_IN_PROGRESS: "ASC_REVIEW_IN_PROGRESS";
    readonly APP_REJECTED: "ASC_APP_REJECTED";
    readonly UNSUPPORTED_OPERATION: "ASC_UNSUPPORTED_OPERATION";
    readonly UPLOAD_FAILED: "ASC_UPLOAD_FAILED";
    readonly SUBSCRIPTION_ERROR: "ASC_SUBSCRIPTION_ERROR";
};
export type ReviewStatus = 'WAITING_FOR_REVIEW' | 'IN_REVIEW' | 'PENDING_DEVELOPER_RELEASE' | 'APPROVED' | 'REJECTED' | 'METADATA_REJECTED' | 'REMOVED_FROM_SALE' | 'DEVELOPER_REJECTED' | 'DEVELOPER_REMOVED_FROM_SALE';
export interface AppStoreConnectDriverConfig {
    /** App Store Connect API Key ID. */
    keyId: string;
    /** App Store Connect Issuer ID. */
    issuerId: string;
    /** Team ID for the Apple Developer account. */
    teamId: string;
}
export declare class AppStoreConnectDriver extends BaseDriver<AppStoreConnectDriverConfig> {
    private readonly credentialManager;
    readonly name = "appstore-connect";
    readonly version = "1.0.0";
    private _jwtToken;
    private _driverConfig;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: AppStoreConnectDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleCreateApp;
    private handleUploadBuild;
    private handleSubmitForReview;
    private handleCheckReviewStatus;
    private handleUpdateMetadata;
    private handleUploadScreenshots;
    private handleManageSubscriptions;
    private handleGetAppAnalytics;
    /**
     * Parse a rejection response and return structured rejection reasons.
     * Used by the ZionX App Factory to understand why an app was rejected
     * and generate remediation plans (Requirement 11.4).
     */
    parseRejection(rejectionCodes: string[]): RejectionReason[];
    /**
     * Simulate a rejection result for a given app version.
     * Returns a DriverResult with rejection details including reasons and remediation hints.
     */
    createRejectionResult(operationId: string, appId: string, versionId: string, rejectionCodes: string[]): DriverResult;
    private createOperationId;
    private errorResult;
}
//# sourceMappingURL=appstore-connect-driver.d.ts.map