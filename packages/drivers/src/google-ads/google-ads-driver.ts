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
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const GOOGLE_ADS_ERROR_CODES = {
  UNAUTHORIZED: 'GADS_UNAUTHORIZED',
  FORBIDDEN: 'GADS_FORBIDDEN',
  NOT_FOUND: 'GADS_NOT_FOUND',
  RATE_LIMITED: 'GADS_RATE_LIMITED',
  INVALID_PARAMS: 'GADS_INVALID_PARAMS',
  CAMPAIGN_NOT_FOUND: 'GADS_CAMPAIGN_NOT_FOUND',
  AD_GROUP_NOT_FOUND: 'GADS_AD_GROUP_NOT_FOUND',
  BUDGET_EXCEEDED: 'GADS_BUDGET_EXCEEDED',
  POLICY_VIOLATION: 'GADS_POLICY_VIOLATION',
  BILLING_ERROR: 'GADS_BILLING_ERROR',
  UNSUPPORTED_OPERATION: 'GADS_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GoogleAdsCampaignStatus = 'enabled' | 'paused' | 'removed';

export type GoogleAdsCampaignType =
  | 'search'
  | 'display'
  | 'shopping'
  | 'video'
  | 'app'
  | 'performance_max'
  | 'demand_gen';

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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Google Ads Driver
// ---------------------------------------------------------------------------

export class GoogleAdsDriver extends BaseDriver<GoogleAdsDriverConfig> {
  readonly name = 'google-ads';
  readonly version = '1.0.0';

  private _accessToken: string | null = null;
  private _driverConfig: GoogleAdsDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    super({ maxAttempts: 3, initialDelayMs: 2000 });
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: GoogleAdsDriverConfig): Promise<void> {
    if (!config.clientId) {
      throw new Error('Google Ads OAuth2 client ID is required');
    }
    if (!config.customerId) {
      throw new Error('Google Ads customer ID is required');
    }
    if (!config.developerTokenKeyName) {
      throw new Error('Google Ads developer token key name is required');
    }

    this._accessToken = await this.credentialManager.getCredential('google-ads', config.developerTokenKeyName);
    if (!this._accessToken) {
      throw new Error('Failed to retrieve Google Ads developer token from Credential Manager');
    }
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'google',
      authenticated: true,
      customerId: config.customerId,
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
    const operationId = this.createOpId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'createCampaign':
        return this.handleCreateCampaign(operation, operationId);
      case 'getCampaign':
        return this.handleGetCampaign(operation, operationId);
      case 'updateCampaign':
        return this.handleUpdateCampaign(operation, operationId);
      case 'pauseCampaign':
        return this.handlePauseCampaign(operation, operationId);
      case 'listCampaigns':
        return this.handleListCampaigns(operation, operationId);
      case 'createAdGroup':
        return this.handleCreateAdGroup(operation, operationId);
      case 'getPerformance':
        return this.handleGetPerformance(operation, operationId);
      case 'addKeywords':
        return this.handleAddKeywords(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          GOOGLE_ADS_ERROR_CODES.UNSUPPORTED_OPERATION,
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

  private async handleCreateCampaign(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { name, type, budgetAmountMicros, budgetCurrency, startDate, endDate } = operation.params as {
      name?: string;
      type?: GoogleAdsCampaignType;
      budgetAmountMicros?: number;
      budgetCurrency?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!name) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'name is required for createCampaign', false);
    }
    if (!type) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'type is required for createCampaign', false);
    }
    if (budgetAmountMicros === undefined || budgetAmountMicros <= 0) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'budgetAmountMicros must be a positive number', false);
    }

    const campaign: GoogleAdsCampaign = {
      id: `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      status: 'enabled',
      type,
      budgetAmountMicros,
      budgetCurrency: budgetCurrency ?? 'USD',
      startDate,
      endDate,
      customerId: this._driverConfig!.customerId,
      createdAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: campaign,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetCampaign(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { campaignId } = operation.params as { campaignId?: string };

    if (!campaignId) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'campaignId is required for getCampaign', false);
    }

    const campaign: GoogleAdsCampaign = {
      id: campaignId,
      name: 'Mock Campaign',
      status: 'enabled',
      type: 'search',
      budgetAmountMicros: 0,
      budgetCurrency: 'USD',
      customerId: this._driverConfig!.customerId,
      createdAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: campaign,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleUpdateCampaign(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { campaignId, name, budgetAmountMicros, startDate, endDate } = operation.params as {
      campaignId?: string;
      name?: string;
      budgetAmountMicros?: number;
      startDate?: string;
      endDate?: string;
    };

    if (!campaignId) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'campaignId is required for updateCampaign', false);
    }

    const updatedFields: string[] = [];
    if (name !== undefined) updatedFields.push('name');
    if (budgetAmountMicros !== undefined) updatedFields.push('budgetAmountMicros');
    if (startDate !== undefined) updatedFields.push('startDate');
    if (endDate !== undefined) updatedFields.push('endDate');

    if (updatedFields.length === 0) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'At least one field must be provided for updateCampaign', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        campaignId,
        updatedFields,
        updatedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handlePauseCampaign(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { campaignId } = operation.params as { campaignId?: string };

    if (!campaignId) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'campaignId is required for pauseCampaign', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        campaignId,
        status: 'paused' as GoogleAdsCampaignStatus,
        pausedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleListCampaigns(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { status, limit } = operation.params as {
      status?: string;
      limit?: number;
    };

    const result: DriverResult = {
      success: true,
      data: {
        campaigns: [] as GoogleAdsCampaign[],
        customerId: this._driverConfig!.customerId,
        statusFilter: status ?? null,
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

  private async handleCreateAdGroup(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { campaignId, name, cpcBidMicros } = operation.params as {
      campaignId?: string;
      name?: string;
      cpcBidMicros?: number;
    };

    if (!campaignId) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'campaignId is required for createAdGroup', false);
    }
    if (!name) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'name is required for createAdGroup', false);
    }

    const adGroup: GoogleAdsAdGroup = {
      id: `adgroup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      campaignId,
      name,
      status: 'enabled',
      cpcBidMicros,
      createdAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: adGroup,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetPerformance(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { campaignId, adGroupId, startDate, endDate } = operation.params as {
      campaignId?: string;
      adGroupId?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!startDate) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'startDate is required for getPerformance', false);
    }
    if (!endDate) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'endDate is required for getPerformance', false);
    }

    const metrics: GoogleAdsPerformanceMetrics = {
      campaignId,
      adGroupId,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      averageCpc: 0,
      costMicros: 0,
      conversions: 0,
      conversionRate: 0,
      costPerConversion: 0,
      startDate,
      endDate,
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

  private async handleAddKeywords(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { adGroupId, keywords } = operation.params as {
      adGroupId?: string;
      keywords?: Array<{ text: string; matchType: string; cpcBidMicros?: number }>;
    };

    if (!adGroupId) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'adGroupId is required for addKeywords', false);
    }
    if (!keywords || keywords.length === 0) {
      return this.errorResult(operationId, GOOGLE_ADS_ERROR_CODES.INVALID_PARAMS, 'keywords array is required for addKeywords', false);
    }

    const createdKeywords: GoogleAdsKeyword[] = keywords.map((kw, idx) => ({
      id: `kw-${Date.now()}-${idx}`,
      adGroupId,
      text: kw.text,
      matchType: (kw.matchType as GoogleAdsKeyword['matchType']) ?? 'broad',
      status: 'enabled' as const,
      cpcBidMicros: kw.cpcBidMicros,
    }));

    const result: DriverResult = {
      success: true,
      data: {
        adGroupId,
        keywords: createdKeywords,
        addedCount: createdKeywords.length,
        addedAt: new Date().toISOString(),
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
    return `gads-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
