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
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const STRIPE_ERROR_CODES = {
  UNAUTHORIZED: 'STRIPE_UNAUTHORIZED',
  FORBIDDEN: 'STRIPE_FORBIDDEN',
  NOT_FOUND: 'STRIPE_NOT_FOUND',
  RATE_LIMITED: 'STRIPE_RATE_LIMITED',
  INVALID_PARAMS: 'STRIPE_INVALID_PARAMS',
  CARD_DECLINED: 'STRIPE_CARD_DECLINED',
  INSUFFICIENT_FUNDS: 'STRIPE_INSUFFICIENT_FUNDS',
  EXPIRED_CARD: 'STRIPE_EXPIRED_CARD',
  PROCESSING_ERROR: 'STRIPE_PROCESSING_ERROR',
  SUBSCRIPTION_INACTIVE: 'STRIPE_SUBSCRIPTION_INACTIVE',
  INVOICE_NOT_FOUND: 'STRIPE_INVOICE_NOT_FOUND',
  UNSUPPORTED_OPERATION: 'STRIPE_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StripePaymentStatus = 'succeeded' | 'pending' | 'failed' | 'canceled' | 'requires_action';

export type StripeSubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'trialing'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface StripeDriverConfig {
  /** The Stripe secret API key name in Credential Manager. */
  apiKeyName: string;
  /** Whether to use Stripe test mode. */
  testMode?: boolean;
}

// ---------------------------------------------------------------------------
// Stripe Driver
// ---------------------------------------------------------------------------

export class StripeDriver extends BaseDriver<StripeDriverConfig> {
  readonly name = 'stripe';
  readonly version = '1.0.0';

  private _apiKey: string | null = null;
  private _driverConfig: StripeDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    super({ maxAttempts: 3, initialDelayMs: 1000 });
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: StripeDriverConfig): Promise<void> {
    if (!config.apiKeyName) {
      throw new Error('Stripe API key name is required');
    }

    this._apiKey = await this.credentialManager.getCredential('stripe', config.apiKeyName);
    if (!this._apiKey) {
      throw new Error('Failed to retrieve Stripe API key from Credential Manager');
    }
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'stripe',
      authenticated: true,
      testMode: config.testMode ?? false,
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
      return this.errorResult(operationId, STRIPE_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'createPayment':
        return this.handleCreatePayment(operation, operationId);
      case 'getPayment':
        return this.handleGetPayment(operation, operationId);
      case 'refundPayment':
        return this.handleRefundPayment(operation, operationId);
      case 'createSubscription':
        return this.handleCreateSubscription(operation, operationId);
      case 'cancelSubscription':
        return this.handleCancelSubscription(operation, operationId);
      case 'getSubscription':
        return this.handleGetSubscription(operation, operationId);
      case 'listSubscriptions':
        return this.handleListSubscriptions(operation, operationId);
      case 'createInvoice':
        return this.handleCreateInvoice(operation, operationId);
      case 'getInvoice':
        return this.handleGetInvoice(operation, operationId);
      case 'listInvoices':
        return this.handleListInvoices(operation, operationId);
      case 'createCustomer':
        return this.handleCreateCustomer(operation, operationId);
      case 'getCustomer':
        return this.handleGetCustomer(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          STRIPE_ERROR_CODES.UNSUPPORTED_OPERATION,
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

  private async handleCreatePayment(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { amount, currency, customerId, description, metadata } = operation.params as {
      amount?: number;
      currency?: string;
      customerId?: string;
      description?: string;
      metadata?: Record<string, string>;
    };

    if (amount === undefined || amount <= 0) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'amount must be a positive number', false);
    }
    if (!currency) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'currency is required for createPayment', false);
    }
    if (!customerId) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'customerId is required for createPayment', false);
    }

    const payment: StripePayment = {
      id: `pi_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      amount,
      currency,
      status: 'succeeded',
      customerId,
      description,
      metadata: metadata ?? {},
      createdAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: payment,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetPayment(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { paymentId } = operation.params as { paymentId?: string };

    if (!paymentId) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'paymentId is required for getPayment', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        id: paymentId,
        amount: 0,
        currency: 'usd',
        status: 'succeeded' as StripePaymentStatus,
        customerId: 'cus_unknown',
        metadata: {},
        createdAt: new Date().toISOString(),
      } satisfies StripePayment,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleRefundPayment(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { paymentId, amount, reason } = operation.params as {
      paymentId?: string;
      amount?: number;
      reason?: string;
    };

    if (!paymentId) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'paymentId is required for refundPayment', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        refundId: `re_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        paymentId,
        amount: amount ?? 0,
        reason: reason ?? 'requested_by_customer',
        status: 'succeeded',
        createdAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleCreateSubscription(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { customerId, priceId, metadata } = operation.params as {
      customerId?: string;
      priceId?: string;
      metadata?: Record<string, string>;
    };

    if (!customerId) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'customerId is required for createSubscription', false);
    }
    if (!priceId) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'priceId is required for createSubscription', false);
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const subscription: StripeSubscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      customerId,
      status: 'active',
      priceId,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false,
      metadata: metadata ?? {},
      createdAt: now.toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: subscription,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleCancelSubscription(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { subscriptionId, cancelAtPeriodEnd } = operation.params as {
      subscriptionId?: string;
      cancelAtPeriodEnd?: boolean;
    };

    if (!subscriptionId) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'subscriptionId is required for cancelSubscription', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        subscriptionId,
        status: cancelAtPeriodEnd ? 'active' : 'canceled',
        cancelAtPeriodEnd: cancelAtPeriodEnd ?? false,
        canceledAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetSubscription(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { subscriptionId } = operation.params as { subscriptionId?: string };

    if (!subscriptionId) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'subscriptionId is required for getSubscription', false);
    }

    const now = new Date();
    const result: DriverResult = {
      success: true,
      data: {
        id: subscriptionId,
        customerId: 'cus_unknown',
        status: 'active' as StripeSubscriptionStatus,
        priceId: 'price_unknown',
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        cancelAtPeriodEnd: false,
        metadata: {},
        createdAt: now.toISOString(),
      } satisfies StripeSubscription,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleListSubscriptions(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { customerId, status, limit } = operation.params as {
      customerId?: string;
      status?: string;
      limit?: number;
    };

    const result: DriverResult = {
      success: true,
      data: {
        subscriptions: [] as StripeSubscription[],
        customerId: customerId ?? null,
        statusFilter: status ?? null,
        total: 0,
        limit: limit ?? 10,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleCreateInvoice(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { customerId, subscriptionId, dueDate, metadata } = operation.params as {
      customerId?: string;
      subscriptionId?: string;
      dueDate?: string;
      metadata?: Record<string, string>;
    };

    if (!customerId) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'customerId is required for createInvoice', false);
    }

    const invoice: StripeInvoice = {
      id: `in_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      customerId,
      subscriptionId,
      status: 'draft',
      amountDue: 0,
      amountPaid: 0,
      currency: 'usd',
      dueDate,
      createdAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: invoice,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetInvoice(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { invoiceId } = operation.params as { invoiceId?: string };

    if (!invoiceId) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'invoiceId is required for getInvoice', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        id: invoiceId,
        customerId: 'cus_unknown',
        status: 'open' as StripeInvoiceStatus,
        amountDue: 0,
        amountPaid: 0,
        currency: 'usd',
        createdAt: new Date().toISOString(),
      } satisfies StripeInvoice,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleListInvoices(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { customerId, status, limit } = operation.params as {
      customerId?: string;
      status?: string;
      limit?: number;
    };

    const result: DriverResult = {
      success: true,
      data: {
        invoices: [] as StripeInvoice[],
        customerId: customerId ?? null,
        statusFilter: status ?? null,
        total: 0,
        limit: limit ?? 10,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleCreateCustomer(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { email, name, metadata } = operation.params as {
      email?: string;
      name?: string;
      metadata?: Record<string, string>;
    };

    if (!email) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'email is required for createCustomer', false);
    }

    const customer: StripeCustomer = {
      id: `cus_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      email,
      name,
      metadata: metadata ?? {},
      createdAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: customer,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetCustomer(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { customerId } = operation.params as { customerId?: string };

    if (!customerId) {
      return this.errorResult(operationId, STRIPE_ERROR_CODES.INVALID_PARAMS, 'customerId is required for getCustomer', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        id: customerId,
        email: 'unknown@example.com',
        metadata: {},
        createdAt: new Date().toISOString(),
      } satisfies StripeCustomer,
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
    return `stripe-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
