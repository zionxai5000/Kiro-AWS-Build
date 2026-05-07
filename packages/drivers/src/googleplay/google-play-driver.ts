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
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Google Play Rejection Reasons
// ---------------------------------------------------------------------------

export interface GooglePlayRejectionReason {
  code: string;
  category: 'policy_violation' | 'content_issue' | 'technical_issue' | 'metadata_issue' | 'security_issue';
  description: string;
  policyReference?: string;
  remediationHint: string;
}

export const GOOGLE_PLAY_REJECTION_REASONS: Record<string, GooglePlayRejectionReason> = {
  'POLICY_DECEPTIVE_BEHAVIOR': {
    code: 'POLICY_DECEPTIVE_BEHAVIOR',
    category: 'policy_violation',
    description: 'App engages in deceptive behavior such as misleading claims or hidden functionality',
    policyReference: 'Deceptive Behavior Policy',
    remediationHint: 'Remove any misleading claims, hidden functionality, or deceptive UI patterns from the app.',
  },
  'POLICY_MALWARE': {
    code: 'POLICY_MALWARE',
    category: 'policy_violation',
    description: 'App contains or facilitates the distribution of malware',
    policyReference: 'Malware Policy',
    remediationHint: 'Remove all malicious code, ensure no unauthorized data collection, and scan with security tools.',
  },
  'POLICY_INAPPROPRIATE_CONTENT': {
    code: 'POLICY_INAPPROPRIATE_CONTENT',
    category: 'content_issue',
    description: 'App contains content that violates Google Play content policies',
    policyReference: 'Inappropriate Content Policy',
    remediationHint: 'Review and remove content that violates Google Play content guidelines including hate speech, violence, or adult content.',
  },
  'POLICY_IMPERSONATION': {
    code: 'POLICY_IMPERSONATION',
    category: 'policy_violation',
    description: 'App impersonates another app, developer, or entity',
    policyReference: 'Impersonation Policy',
    remediationHint: 'Ensure app branding, name, and icon are original and do not impersonate other apps or entities.',
  },
  'CONTENT_RATING_MISMATCH': {
    code: 'CONTENT_RATING_MISMATCH',
    category: 'content_issue',
    description: 'App content does not match the declared content rating',
    policyReference: 'Content Rating Guidelines',
    remediationHint: 'Complete the content rating questionnaire accurately to reflect actual app content.',
  },
  'TECHNICAL_ANR': {
    code: 'TECHNICAL_ANR',
    category: 'technical_issue',
    description: 'App has excessive Application Not Responding (ANR) errors',
    remediationHint: 'Optimize long-running operations, move heavy work off the main thread, and test on low-end devices.',
  },
  'TECHNICAL_CRASH_RATE': {
    code: 'TECHNICAL_CRASH_RATE',
    category: 'technical_issue',
    description: 'App has an excessive crash rate exceeding acceptable thresholds',
    remediationHint: 'Fix crash-causing bugs, add proper error handling, and test across multiple device configurations.',
  },
  'TECHNICAL_PERMISSIONS': {
    code: 'TECHNICAL_PERMISSIONS',
    category: 'technical_issue',
    description: 'App requests permissions that are not justified by its functionality',
    policyReference: 'Permissions Policy',
    remediationHint: 'Remove unnecessary permission requests and provide clear justification for required permissions.',
  },
  'METADATA_MISSING_DESCRIPTION': {
    code: 'METADATA_MISSING_DESCRIPTION',
    category: 'metadata_issue',
    description: 'Store listing is missing a required description or has insufficient detail',
    remediationHint: 'Provide a complete and accurate app description in all required languages.',
  },
  'METADATA_MISLEADING_SCREENSHOTS': {
    code: 'METADATA_MISLEADING_SCREENSHOTS',
    category: 'metadata_issue',
    description: 'Screenshots do not accurately represent the app experience',
    remediationHint: 'Update screenshots to accurately reflect the current app UI and functionality.',
  },
  'SECURITY_DATA_SAFETY': {
    code: 'SECURITY_DATA_SAFETY',
    category: 'security_issue',
    description: 'Data safety section is inaccurate or incomplete',
    policyReference: 'Data Safety Section',
    remediationHint: 'Review and update the data safety form to accurately reflect all data collection and sharing practices.',
  },
  'SECURITY_TARGET_SDK': {
    code: 'SECURITY_TARGET_SDK',
    category: 'security_issue',
    description: 'App targets an SDK version below the minimum required by Google Play',
    policyReference: 'Target API Level Requirements',
    remediationHint: 'Update the app to target the minimum required API level as specified by Google Play requirements.',
  },
};

// ---------------------------------------------------------------------------
// Google Play Error Codes
// ---------------------------------------------------------------------------

export const GOOGLE_PLAY_ERROR_CODES = {
  UNAUTHORIZED: 'GP_UNAUTHORIZED',
  FORBIDDEN: 'GP_FORBIDDEN',
  NOT_FOUND: 'GP_NOT_FOUND',
  CONFLICT: 'GP_CONFLICT',
  RATE_LIMITED: 'GP_RATE_LIMITED',
  INVALID_PARAMS: 'GP_INVALID_PARAMS',
  BUNDLE_PROCESSING: 'GP_BUNDLE_PROCESSING',
  REVIEW_IN_PROGRESS: 'GP_REVIEW_IN_PROGRESS',
  APP_REJECTED: 'GP_APP_REJECTED',
  UNSUPPORTED_OPERATION: 'GP_UNSUPPORTED_OPERATION',
  UPLOAD_FAILED: 'GP_UPLOAD_FAILED',
  SUBSCRIPTION_ERROR: 'GP_SUBSCRIPTION_ERROR',
} as const;

// ---------------------------------------------------------------------------
// Review Status
// ---------------------------------------------------------------------------

export type GooglePlayReviewStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'PUBLISHED'
  | 'UNPUBLISHED';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GooglePlayDriverConfig {
  /** Google Play Developer API service account email. */
  serviceAccountEmail: string;
  /** Google Cloud project ID. */
  projectId: string;
  /** Android package name (e.g., com.example.app). */
  packageName: string;
}

// ---------------------------------------------------------------------------
// Google Play Console Driver
// ---------------------------------------------------------------------------

export class GooglePlayDriver extends BaseDriver<GooglePlayDriverConfig> {
  readonly name = 'google-play';
  readonly version = '1.0.0';

  private _accessToken: string | null = null;
  private _driverConfig: GooglePlayDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    // Google Play retry: 3 attempts, 2s initial delay
    super({ maxAttempts: 3, initialDelayMs: 2000 });
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: GooglePlayDriverConfig): Promise<void> {
    if (!config.serviceAccountEmail) {
      throw new Error('Google Play Developer API service account email is required');
    }
    if (!config.projectId) {
      throw new Error('Google Cloud project ID is required');
    }
    if (!config.packageName) {
      throw new Error('Android package name is required');
    }

    this._accessToken = await this.credentialManager.getCredential('google-play', 'service-account-key');
    if (!this._accessToken) {
      throw new Error('Failed to retrieve Google Play service account key from Credential Manager');
    }
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'google',
      authenticated: true,
      serviceAccountEmail: config.serviceAccountEmail,
      projectId: config.projectId,
      packageName: config.packageName,
    });
  }

  protected async doDisconnect(): Promise<void> {
    this._accessToken = null;
    this._driverConfig = null;
    this._completedOperations.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOperationId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'createApp':
        return this.handleCreateApp(operation, operationId);
      case 'uploadBundle':
        return this.handleUploadBundle(operation, operationId);
      case 'submitForReview':
        return this.handleSubmitForReview(operation, operationId);
      case 'checkReviewStatus':
        return this.handleCheckReviewStatus(operation, operationId);
      case 'updateListing':
        return this.handleUpdateListing(operation, operationId);
      case 'uploadScreenshots':
        return this.handleUploadScreenshots(operation, operationId);
      case 'manageSubscriptions':
        return this.handleManageSubscriptions(operation, operationId);
      case 'getAppAnalytics':
        return this.handleGetAppAnalytics(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          GOOGLE_PLAY_ERROR_CODES.UNSUPPORTED_OPERATION,
          `Unsupported operation type: ${operation.type}`,
          false,
        );
    }
  }

  protected async doVerify(operationId: string): Promise<VerificationResult> {
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

  private async handleCreateApp(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { packageName, title, defaultLanguage, appCategory } = operation.params as {
      packageName?: string;
      title?: string;
      defaultLanguage?: string;
      appCategory?: string;
    };

    if (!packageName) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'packageName is required for createApp', false);
    }
    if (!title) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'title is required for createApp', false);
    }
    if (!defaultLanguage) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'defaultLanguage is required for createApp', false);
    }
    if (!appCategory) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'appCategory is required for createApp', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        appId: `gp-app-${Date.now()}`,
        packageName,
        title,
        defaultLanguage,
        appCategory,
        status: 'DRAFT' as GooglePlayReviewStatus,
        createdAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleUploadBundle(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { packageName, bundlePath, versionCode, versionName, track } = operation.params as {
      packageName?: string;
      bundlePath?: string;
      versionCode?: number;
      versionName?: string;
      track?: string;
    };

    if (!packageName) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'packageName is required for uploadBundle', false);
    }
    if (!bundlePath) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'bundlePath is required for uploadBundle', false);
    }
    if (!versionCode) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'versionCode is required for uploadBundle', false);
    }
    if (!versionName) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'versionName is required for uploadBundle', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        bundleId: `bundle-${Date.now()}`,
        packageName,
        versionCode,
        versionName,
        track: track ?? 'internal',
        processingState: 'PROCESSING',
        uploadedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleSubmitForReview(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { packageName, editId, track } = operation.params as {
      packageName?: string;
      editId?: string;
      track?: string;
    };

    if (!packageName) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'packageName is required for submitForReview', false);
    }
    if (!editId) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'editId is required for submitForReview', false);
    }
    if (!track) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'track is required for submitForReview', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        submissionId: `gp-sub-${Date.now()}`,
        packageName,
        editId,
        track,
        reviewStatus: 'PENDING_REVIEW' as GooglePlayReviewStatus,
        submittedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleCheckReviewStatus(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { packageName, editId } = operation.params as {
      packageName?: string;
      editId?: string;
    };

    if (!packageName) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'packageName is required for checkReviewStatus', false);
    }
    if (!editId) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'editId is required for checkReviewStatus', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        packageName,
        editId,
        reviewStatus: 'IN_REVIEW' as GooglePlayReviewStatus,
        lastCheckedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleUpdateListing(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { packageName, language, listing } = operation.params as {
      packageName?: string;
      language?: string;
      listing?: Record<string, unknown>;
    };

    if (!packageName) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'packageName is required for updateListing', false);
    }
    if (!language) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'language is required for updateListing', false);
    }
    if (!listing || typeof listing !== 'object') {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'listing object is required for updateListing', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        packageName,
        language,
        updatedFields: Object.keys(listing),
        updatedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleUploadScreenshots(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { packageName, language, imageType, screenshots } = operation.params as {
      packageName?: string;
      language?: string;
      imageType?: string;
      screenshots?: string[];
    };

    if (!packageName) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'packageName is required for uploadScreenshots', false);
    }
    if (!language) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'language is required for uploadScreenshots', false);
    }
    if (!imageType) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'imageType is required for uploadScreenshots', false);
    }
    if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'screenshots array is required for uploadScreenshots', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        packageName,
        language,
        imageType,
        uploadedCount: screenshots.length,
        screenshotIds: screenshots.map((_, i) => `gp-screenshot-${Date.now()}-${i}`),
        uploadedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleManageSubscriptions(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { packageName, action: subAction, subscriptionId, basePlanId, details } = operation.params as {
      packageName?: string;
      action?: string;
      subscriptionId?: string;
      basePlanId?: string;
      details?: Record<string, unknown>;
    };

    if (!packageName) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'packageName is required for manageSubscriptions', false);
    }
    if (!subAction) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'action is required for manageSubscriptions', false);
    }

    const validActions = ['create', 'update', 'delete', 'list', 'archive', 'activate'];
    if (!validActions.includes(subAction)) {
      return this.errorResult(
        operationId,
        GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS,
        `Invalid subscription action: ${subAction}. Must be one of: ${validActions.join(', ')}`,
        false,
      );
    }

    const result: DriverResult = {
      success: true,
      data: {
        packageName,
        action: subAction,
        subscriptionId: subscriptionId ?? `gp-sub-${Date.now()}`,
        basePlanId: basePlanId ?? `base-plan-${Date.now()}`,
        details: details ?? {},
        processedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetAppAnalytics(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { packageName, startDate, endDate, metrics } = operation.params as {
      packageName?: string;
      startDate?: string;
      endDate?: string;
      metrics?: string[];
    };

    if (!packageName) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'packageName is required for getAppAnalytics', false);
    }
    if (!startDate) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'startDate is required for getAppAnalytics', false);
    }
    if (!endDate) {
      return this.errorResult(operationId, GOOGLE_PLAY_ERROR_CODES.INVALID_PARAMS, 'endDate is required for getAppAnalytics', false);
    }

    const requestedMetrics = metrics ?? ['installs', 'uninstalls', 'ratings', 'crashes', 'anrs', 'revenue'];

    const result: DriverResult = {
      success: true,
      data: {
        packageName,
        startDate,
        endDate,
        metrics: Object.fromEntries(
          requestedMetrics.map((metric) => [
            metric,
            { value: 0, trend: 'stable' },
          ]),
        ),
        generatedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  // =====================================================================
  // Rejection Handling
  // =====================================================================

  /**
   * Parse a rejection response and return structured rejection reasons.
   * Used by the ZionX App Factory to understand why an app was rejected
   * and generate remediation plans (Requirement 11.4).
   */
  parseRejection(rejectionCodes: string[]): GooglePlayRejectionReason[] {
    return rejectionCodes
      .map((code) => GOOGLE_PLAY_REJECTION_REASONS[code])
      .filter((reason): reason is GooglePlayRejectionReason => reason !== undefined);
  }

  /**
   * Simulate a rejection result for a given app.
   * Returns a DriverResult with rejection details including reasons and remediation hints.
   */
  createRejectionResult(
    operationId: string,
    packageName: string,
    editId: string,
    rejectionCodes: string[],
  ): DriverResult {
    const reasons = this.parseRejection(rejectionCodes);

    return {
      success: false,
      error: {
        code: GOOGLE_PLAY_ERROR_CODES.APP_REJECTED,
        message: `App ${packageName} edit ${editId} was rejected`,
        retryable: false,
        details: {
          packageName,
          editId,
          reviewStatus: 'REJECTED' as GooglePlayReviewStatus,
          rejectionReasons: reasons,
          rejectedAt: new Date().toISOString(),
        },
      },
      retryable: false,
      operationId,
    };
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private createOperationId(): string {
    return `gp-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private errorResult(
    operationId: string,
    code: string,
    message: string,
    retryable: boolean,
    details?: Record<string, unknown>,
  ): DriverResult {
    return {
      success: false,
      error: { code, message, retryable, details },
      retryable,
      operationId,
    };
  }
}
