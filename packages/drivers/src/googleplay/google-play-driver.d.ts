/**
 * Google Play Console Driver — Google Play Store app submission and management.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for service account
 * authentication, and handles Google Play-specific error codes and rejection reasons.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 11.2, 11.3, 11.4
 */
import { BaseDriver } from '../base/driver.js';
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export interface GooglePlayRejectionReason {
    code: string;
    category: 'policy_violation' | 'content_issue' | 'technical_issue' | 'metadata_issue' | 'security_issue';
    description: string;
    policyReference?: string;
    remediationHint: string;
}
export declare const GOOGLE_PLAY_REJECTION_REASONS: Record<string, GooglePlayRejectionReason>;
export declare const GOOGLE_PLAY_ERROR_CODES: {
    readonly UNAUTHORIZED: "GP_UNAUTHORIZED";
    readonly FORBIDDEN: "GP_FORBIDDEN";
    readonly NOT_FOUND: "GP_NOT_FOUND";
    readonly CONFLICT: "GP_CONFLICT";
    readonly RATE_LIMITED: "GP_RATE_LIMITED";
    readonly INVALID_PARAMS: "GP_INVALID_PARAMS";
    readonly BUNDLE_PROCESSING: "GP_BUNDLE_PROCESSING";
    readonly REVIEW_IN_PROGRESS: "GP_REVIEW_IN_PROGRESS";
    readonly APP_REJECTED: "GP_APP_REJECTED";
    readonly UNSUPPORTED_OPERATION: "GP_UNSUPPORTED_OPERATION";
    readonly UPLOAD_FAILED: "GP_UPLOAD_FAILED";
    readonly SUBSCRIPTION_ERROR: "GP_SUBSCRIPTION_ERROR";
};
export type GooglePlayReviewStatus = 'DRAFT' | 'PENDING_REVIEW' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'PUBLISHED' | 'UNPUBLISHED';
export interface GooglePlayDriverConfig {
    /** Google Play Developer API service account email. */
    serviceAccountEmail: string;
    /** Google Cloud project ID. */
    projectId: string;
    /** Android package name (e.g., com.example.app). */
    packageName: string;
}
export declare class GooglePlayDriver extends BaseDriver<GooglePlayDriverConfig> {
    private readonly credentialManager;
    readonly name = "google-play";
    readonly version = "1.0.0";
    private _accessToken;
    private _driverConfig;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: GooglePlayDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleCreateApp;
    private handleUploadBundle;
    private handleSubmitForReview;
    private handleCheckReviewStatus;
    private handleUpdateListing;
    private handleUploadScreenshots;
    private handleManageSubscriptions;
    private handleGetAppAnalytics;
    /**
     * Parse a rejection response and return structured rejection reasons.
     * Used by the ZionX App Factory to understand why an app was rejected
     * and generate remediation plans (Requirement 11.4).
     */
    parseRejection(rejectionCodes: string[]): GooglePlayRejectionReason[];
    /**
     * Simulate a rejection result for a given app.
     * Returns a DriverResult with rejection details including reasons and remediation hints.
     */
    createRejectionResult(operationId: string, packageName: string, editId: string, rejectionCodes: string[]): DriverResult;
    private createOperationId;
    private errorResult;
}
//# sourceMappingURL=google-play-driver.d.ts.map