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
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const REVENUECAT_ERROR_CODES = {
  UNAUTHORIZED: 'RC_UNAUTHORIZED',
  FORBIDDEN: 'RC_FORBIDDEN',
  NOT_FOUND: 'RC_NOT_FOUND',
  RATE_LIMITED: 'RC_RATE_LIMITED',
  INVALID_PARAMS: 'RC_INVALID_PARAMS',
  SUBSCRIBER_NOT_FOUND: 'RC_SUBSCRIBER_NOT_FOUND',
  ENTITLEMENT_NOT_FOUND: 'RC_ENTITLEMENT_NOT_FOUND',
  OFFERING_NOT_FOUND: 'RC_OFFERING_NOT_FOUND',
  UNSUPPORTED_OPERATION: 'RC_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RevenueCatSubscriptionStatus =
  | 'active'
  | 'expired'
  | 'in_grace_period'
  | 'in_billing_retry'
  | 'canceled'
  | 'paused';

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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RevenueCatDriverConfig {
  /** The RevenueCat secret API key name in Credential Manager. */
  apiKeyName: string;
  /** The RevenueCat project ID. */
  projectId: string;
}

// ---------------------------------------------------------------------------
// RevenueCat Driver
// ---------------------------------------------------------------------------

export class RevenueCatDriver extends BaseDriver<RevenueCatDriverConfig> {
  readonly name = 'revenuecat';
  readonly version = '1.0.0';

  private _apiKey: string | null = null;
  private _driverConfig: RevenueCatDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    super({ maxAttempts: 3, initialDelayMs: 1000 });
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: RevenueCatDriverConfig): Promise<void> {
    if (!config.apiKeyName) {
      throw new Error('RevenueCat API key name is required');
    }
    if (!config.projectId) {
      throw new Error('RevenueCat project ID is required');
    }

    this._apiKey = await this.credentialManager.getCredential('revenuecat', config.apiKeyName);
    if (!this._apiKey) {
      throw new Error('Failed to retrieve RevenueCat API key from Credential Manager');
    }
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'revenuecat',
      authenticated: true,
      projectId: config.projectId,
    });
  }

  protected async doDisconnect(): Promise<void> {
    this._apiKey = null;
    this._driverConfig = null;
    this._completedOperations.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOpId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, REVENUECAT_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'getSubscriber':
        return this.handleGetSubscriber(operation, operationId);
      case 'getEntitlements':
        return this.handleGetEntitlements(operation, operationId);
      case 'grantEntitlement':
        return this.handleGrantEntitlement(operation, operationId);
      case 'revokeEntitlement':
        return this.handleRevokeEntitlement(operation, operationId);
      case 'getOfferings':
        return this.handleGetOfferings(operation, operationId);
      case 'getRevenueMetrics':
        return this.handleGetRevenueMetrics(operation, operationId);
      case 'listSubscriptions':
        return this.handleListSubscriptions(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          REVENUECAT_ERROR_CODES.UNSUPPORTED_OPERATION,
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

  private async handleGetSubscriber(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { subscriberId } = operation.params as { subscriberId?: string };

    if (!subscriberId) {
      return this.errorResult(operationId, REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'subscriberId is required for getSubscriber', false);
    }

    const subscriber: RevenueCatSubscriber = {
      id: subscriberId,
      originalAppUserId: subscriberId,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      entitlements: [],
      subscriptions: [],
      nonSubscriptions: [],
    };

    const result: DriverResult = {
      success: true,
      data: subscriber,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetEntitlements(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { subscriberId } = operation.params as { subscriberId?: string };

    if (!subscriberId) {
      return this.errorResult(operationId, REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'subscriberId is required for getEntitlements', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        subscriberId,
        entitlements: [] as RevenueCatEntitlement[],
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGrantEntitlement(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { subscriberId, entitlementId, duration, productIdentifier } = operation.params as {
      subscriberId?: string;
      entitlementId?: string;
      duration?: string;
      productIdentifier?: string;
    };

    if (!subscriberId) {
      return this.errorResult(operationId, REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'subscriberId is required for grantEntitlement', false);
    }
    if (!entitlementId) {
      return this.errorResult(operationId, REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'entitlementId is required for grantEntitlement', false);
    }

    const entitlement: RevenueCatEntitlement = {
      id: entitlementId,
      isActive: true,
      willRenew: false,
      periodType: 'normal',
      productIdentifier: productIdentifier ?? 'promotional',
      purchaseDate: new Date().toISOString(),
      store: 'promotional',
    };

    const result: DriverResult = {
      success: true,
      data: {
        subscriberId,
        entitlement,
        grantedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleRevokeEntitlement(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { subscriberId, entitlementId } = operation.params as {
      subscriberId?: string;
      entitlementId?: string;
    };

    if (!subscriberId) {
      return this.errorResult(operationId, REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'subscriberId is required for revokeEntitlement', false);
    }
    if (!entitlementId) {
      return this.errorResult(operationId, REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'entitlementId is required for revokeEntitlement', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        subscriberId,
        entitlementId,
        revoked: true,
        revokedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetOfferings(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { limit } = operation.params as { limit?: number };

    const result: DriverResult = {
      success: true,
      data: {
        offerings: [] as RevenueCatOffering[],
        projectId: this._driverConfig!.projectId,
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

  private async handleGetRevenueMetrics(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { startDate, endDate } = operation.params as {
      startDate?: string;
      endDate?: string;
    };

    if (!startDate) {
      return this.errorResult(operationId, REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'startDate is required for getRevenueMetrics', false);
    }
    if (!endDate) {
      return this.errorResult(operationId, REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'endDate is required for getRevenueMetrics', false);
    }

    const metrics: RevenueCatRevenueMetrics = {
      activeSubscribers: 0,
      mrr: 0,
      revenue: 0,
      newSubscribers: 0,
      churnRate: 0,
      trialConversionRate: 0,
      period: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: metrics,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleListSubscriptions(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { subscriberId, status } = operation.params as {
      subscriberId?: string;
      status?: string;
    };

    if (!subscriberId) {
      return this.errorResult(operationId, REVENUECAT_ERROR_CODES.INVALID_PARAMS, 'subscriberId is required for listSubscriptions', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        subscriberId,
        subscriptions: [] as RevenueCatSubscription[],
        statusFilter: status ?? null,
        total: 0,
        retrievedAt: new Date().toISOString(),
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

  private createOpId(): string {
    return `rc-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
