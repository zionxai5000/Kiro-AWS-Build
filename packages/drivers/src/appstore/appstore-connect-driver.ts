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
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// App Store Rejection Reasons
// ---------------------------------------------------------------------------

export interface RejectionReason {
  code: string;
  category: 'guideline_violation' | 'metadata_issue' | 'binary_issue' | 'legal_issue' | 'design_issue';
  description: string;
  guidelineSection?: string;
  remediationHint: string;
}

export const APP_STORE_REJECTION_REASONS: Record<string, RejectionReason> = {
  'GUIDELINE_2_1': {
    code: 'GUIDELINE_2_1',
    category: 'guideline_violation',
    description: 'App completeness — app crashed or had obvious bugs during review',
    guidelineSection: '2.1',
    remediationHint: 'Ensure the app is fully tested and does not crash during normal usage flows.',
  },
  'GUIDELINE_2_3': {
    code: 'GUIDELINE_2_3',
    category: 'binary_issue',
    description: 'Accurate metadata — app description does not match functionality',
    guidelineSection: '2.3',
    remediationHint: 'Update the app description to accurately reflect the app functionality.',
  },
  'GUIDELINE_3_1_1': {
    code: 'GUIDELINE_3_1_1',
    category: 'guideline_violation',
    description: 'In-App Purchase — digital content must use IAP, not external payment',
    guidelineSection: '3.1.1',
    remediationHint: 'Use Apple In-App Purchase for all digital goods and subscriptions.',
  },
  'GUIDELINE_4_0': {
    code: 'GUIDELINE_4_0',
    category: 'design_issue',
    description: 'Design — app does not meet minimum quality or design standards',
    guidelineSection: '4.0',
    remediationHint: 'Improve the app UI/UX to meet Apple Human Interface Guidelines.',
  },
  'GUIDELINE_5_1_1': {
    code: 'GUIDELINE_5_1_1',
    category: 'legal_issue',
    description: 'Data collection and storage — privacy policy missing or inadequate',
    guidelineSection: '5.1.1',
    remediationHint: 'Add a comprehensive privacy policy URL and ensure data handling disclosures are accurate.',
  },
  'METADATA_MISSING_SCREENSHOTS': {
    code: 'METADATA_MISSING_SCREENSHOTS',
    category: 'metadata_issue',
    description: 'Required screenshots are missing for one or more device sizes',
    remediationHint: 'Upload screenshots for all required device sizes (iPhone 6.7", 6.5", iPad Pro).',
  },
  'METADATA_INVALID_RATING': {
    code: 'METADATA_INVALID_RATING',
    category: 'metadata_issue',
    description: 'Content rating questionnaire answers do not match app content',
    remediationHint: 'Review and update the age rating questionnaire to match actual app content.',
  },
  'BINARY_CRASH_ON_LAUNCH': {
    code: 'BINARY_CRASH_ON_LAUNCH',
    category: 'binary_issue',
    description: 'The binary crashed on launch during review',
    remediationHint: 'Test the release build on a physical device and fix any launch crashes.',
  },
  'BINARY_MISSING_ENTITLEMENTS': {
    code: 'BINARY_MISSING_ENTITLEMENTS',
    category: 'binary_issue',
    description: 'Required entitlements or capabilities are missing from the binary',
    remediationHint: 'Ensure all required entitlements are configured in the Xcode project and provisioning profile.',
  },
  'BINARY_INVALID_SIGNATURE': {
    code: 'BINARY_INVALID_SIGNATURE',
    category: 'binary_issue',
    description: 'The binary has an invalid code signature',
    remediationHint: 'Re-sign the binary with a valid distribution certificate and provisioning profile.',
  },
};

// ---------------------------------------------------------------------------
// App Store Connect Error Codes
// ---------------------------------------------------------------------------

export const APP_STORE_ERROR_CODES = {
  UNAUTHORIZED: 'ASC_UNAUTHORIZED',
  FORBIDDEN: 'ASC_FORBIDDEN',
  NOT_FOUND: 'ASC_NOT_FOUND',
  CONFLICT: 'ASC_CONFLICT',
  RATE_LIMITED: 'ASC_RATE_LIMITED',
  INVALID_PARAMS: 'ASC_INVALID_PARAMS',
  BUILD_PROCESSING: 'ASC_BUILD_PROCESSING',
  REVIEW_IN_PROGRESS: 'ASC_REVIEW_IN_PROGRESS',
  APP_REJECTED: 'ASC_APP_REJECTED',
  UNSUPPORTED_OPERATION: 'ASC_UNSUPPORTED_OPERATION',
  UPLOAD_FAILED: 'ASC_UPLOAD_FAILED',
  SUBSCRIPTION_ERROR: 'ASC_SUBSCRIPTION_ERROR',
} as const;

// ---------------------------------------------------------------------------
// Review Status
// ---------------------------------------------------------------------------

export type ReviewStatus =
  | 'WAITING_FOR_REVIEW'
  | 'IN_REVIEW'
  | 'PENDING_DEVELOPER_RELEASE'
  | 'APPROVED'
  | 'REJECTED'
  | 'METADATA_REJECTED'
  | 'REMOVED_FROM_SALE'
  | 'DEVELOPER_REJECTED'
  | 'DEVELOPER_REMOVED_FROM_SALE';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AppStoreConnectDriverConfig {
  /** App Store Connect API Key ID. */
  keyId: string;
  /** App Store Connect Issuer ID. */
  issuerId: string;
  /** Team ID for the Apple Developer account. */
  teamId: string;
}

// ---------------------------------------------------------------------------
// App Store Connect Driver
// ---------------------------------------------------------------------------

export class AppStoreConnectDriver extends BaseDriver<AppStoreConnectDriverConfig> {
  readonly name = 'appstore-connect';
  readonly version = '1.0.0';

  private _jwtToken: string | null = null;
  private _driverConfig: AppStoreConnectDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    // App Store Connect retry: 3 attempts, 2s initial delay
    super({ maxAttempts: 3, initialDelayMs: 2000 });
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: AppStoreConnectDriverConfig): Promise<void> {
    if (!config.keyId) {
      throw new Error('App Store Connect API Key ID is required');
    }
    if (!config.issuerId) {
      throw new Error('App Store Connect Issuer ID is required');
    }
    if (!config.teamId) {
      throw new Error('App Store Connect Team ID is required');
    }

    this._jwtToken = await this.credentialManager.getCredential('appstore-connect', 'api-key');
    if (!this._jwtToken) {
      throw new Error('Failed to retrieve App Store Connect API key (JWT) from Credential Manager');
    }
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'apple',
      authenticated: true,
      keyId: config.keyId,
      issuerId: config.issuerId,
      teamId: config.teamId,
    });
  }

  protected async doDisconnect(): Promise<void> {
    this._jwtToken = null;
    this._driverConfig = null;
    this._completedOperations.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOperationId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'createApp':
        return this.handleCreateApp(operation, operationId);
      case 'uploadBuild':
        return this.handleUploadBuild(operation, operationId);
      case 'submitForReview':
        return this.handleSubmitForReview(operation, operationId);
      case 'checkReviewStatus':
        return this.handleCheckReviewStatus(operation, operationId);
      case 'updateMetadata':
        return this.handleUpdateMetadata(operation, operationId);
      case 'uploadScreenshots':
        return this.handleUploadScreenshots(operation, operationId);
      case 'manageSubscriptions':
        return this.handleManageSubscriptions(operation, operationId);
      case 'getAppAnalytics':
        return this.handleGetAppAnalytics(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          APP_STORE_ERROR_CODES.UNSUPPORTED_OPERATION,
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
    const { bundleId, name, primaryLocale, sku } = operation.params as {
      bundleId?: string;
      name?: string;
      primaryLocale?: string;
      sku?: string;
    };

    if (!bundleId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'bundleId is required for createApp', false);
    }
    if (!name) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'name is required for createApp', false);
    }
    if (!primaryLocale) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'primaryLocale is required for createApp', false);
    }
    if (!sku) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'sku is required for createApp', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        appId: `app-${Date.now()}`,
        bundleId,
        name,
        primaryLocale,
        sku,
        status: 'PREPARE_FOR_SUBMISSION',
        createdAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleUploadBuild(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { appId, buildPath, version, buildNumber } = operation.params as {
      appId?: string;
      buildPath?: string;
      version?: string;
      buildNumber?: string;
    };

    if (!appId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'appId is required for uploadBuild', false);
    }
    if (!buildPath) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'buildPath is required for uploadBuild', false);
    }
    if (!version) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'version is required for uploadBuild', false);
    }
    if (!buildNumber) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'buildNumber is required for uploadBuild', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        buildId: `build-${Date.now()}`,
        appId,
        version,
        buildNumber,
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
    const { appId, versionId, buildId } = operation.params as {
      appId?: string;
      versionId?: string;
      buildId?: string;
    };

    if (!appId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'appId is required for submitForReview', false);
    }
    if (!versionId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'versionId is required for submitForReview', false);
    }
    if (!buildId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'buildId is required for submitForReview', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        submissionId: `sub-${Date.now()}`,
        appId,
        versionId,
        buildId,
        reviewStatus: 'WAITING_FOR_REVIEW' as ReviewStatus,
        submittedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleCheckReviewStatus(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { appId, versionId } = operation.params as {
      appId?: string;
      versionId?: string;
    };

    if (!appId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'appId is required for checkReviewStatus', false);
    }
    if (!versionId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'versionId is required for checkReviewStatus', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        appId,
        versionId,
        reviewStatus: 'IN_REVIEW' as ReviewStatus,
        lastCheckedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleUpdateMetadata(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { appId, versionId, metadata } = operation.params as {
      appId?: string;
      versionId?: string;
      metadata?: Record<string, unknown>;
    };

    if (!appId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'appId is required for updateMetadata', false);
    }
    if (!versionId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'versionId is required for updateMetadata', false);
    }
    if (!metadata || typeof metadata !== 'object') {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'metadata object is required for updateMetadata', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        appId,
        versionId,
        updatedFields: Object.keys(metadata),
        updatedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleUploadScreenshots(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { appId, versionId, locale, deviceType, screenshots } = operation.params as {
      appId?: string;
      versionId?: string;
      locale?: string;
      deviceType?: string;
      screenshots?: string[];
    };

    if (!appId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'appId is required for uploadScreenshots', false);
    }
    if (!versionId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'versionId is required for uploadScreenshots', false);
    }
    if (!locale) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'locale is required for uploadScreenshots', false);
    }
    if (!deviceType) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'deviceType is required for uploadScreenshots', false);
    }
    if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'screenshots array is required for uploadScreenshots', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        appId,
        versionId,
        locale,
        deviceType,
        uploadedCount: screenshots.length,
        screenshotIds: screenshots.map((_, i) => `screenshot-${Date.now()}-${i}`),
        uploadedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleManageSubscriptions(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { appId, action: subAction, subscriptionGroupId, subscriptionId, details } = operation.params as {
      appId?: string;
      action?: string;
      subscriptionGroupId?: string;
      subscriptionId?: string;
      details?: Record<string, unknown>;
    };

    if (!appId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'appId is required for manageSubscriptions', false);
    }
    if (!subAction) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'action is required for manageSubscriptions', false);
    }

    const validActions = ['create', 'update', 'delete', 'list'];
    if (!validActions.includes(subAction)) {
      return this.errorResult(
        operationId,
        APP_STORE_ERROR_CODES.INVALID_PARAMS,
        `Invalid subscription action: ${subAction}. Must be one of: ${validActions.join(', ')}`,
        false,
      );
    }

    const result: DriverResult = {
      success: true,
      data: {
        appId,
        action: subAction,
        subscriptionGroupId: subscriptionGroupId ?? `group-${Date.now()}`,
        subscriptionId: subscriptionId ?? `sub-${Date.now()}`,
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
    const { appId, startDate, endDate, metrics } = operation.params as {
      appId?: string;
      startDate?: string;
      endDate?: string;
      metrics?: string[];
    };

    if (!appId) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'appId is required for getAppAnalytics', false);
    }
    if (!startDate) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'startDate is required for getAppAnalytics', false);
    }
    if (!endDate) {
      return this.errorResult(operationId, APP_STORE_ERROR_CODES.INVALID_PARAMS, 'endDate is required for getAppAnalytics', false);
    }

    const requestedMetrics = metrics ?? ['impressions', 'downloads', 'revenue', 'crashes'];

    const result: DriverResult = {
      success: true,
      data: {
        appId,
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
  parseRejection(rejectionCodes: string[]): RejectionReason[] {
    return rejectionCodes
      .map((code) => APP_STORE_REJECTION_REASONS[code])
      .filter((reason): reason is RejectionReason => reason !== undefined);
  }

  /**
   * Simulate a rejection result for a given app version.
   * Returns a DriverResult with rejection details including reasons and remediation hints.
   */
  createRejectionResult(
    operationId: string,
    appId: string,
    versionId: string,
    rejectionCodes: string[],
  ): DriverResult {
    const reasons = this.parseRejection(rejectionCodes);

    return {
      success: false,
      error: {
        code: APP_STORE_ERROR_CODES.APP_REJECTED,
        message: `App version ${versionId} was rejected`,
        retryable: false,
        details: {
          appId,
          versionId,
          reviewStatus: 'REJECTED' as ReviewStatus,
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
    return `asc-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
