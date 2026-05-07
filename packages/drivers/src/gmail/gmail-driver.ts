/**
 * Gmail API Driver — email sending, receiving, and management via Gmail API.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for OAuth2
 * authentication, and implements all Gmail operations.
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

export const GMAIL_ERROR_CODES = {
  UNAUTHORIZED: 'GMAIL_UNAUTHORIZED',
  FORBIDDEN: 'GMAIL_FORBIDDEN',
  NOT_FOUND: 'GMAIL_NOT_FOUND',
  RATE_LIMITED: 'GMAIL_RATE_LIMITED',
  INVALID_PARAMS: 'GMAIL_INVALID_PARAMS',
  SEND_FAILED: 'GMAIL_SEND_FAILED',
  ATTACHMENT_TOO_LARGE: 'GMAIL_ATTACHMENT_TOO_LARGE',
  INVALID_RECIPIENT: 'GMAIL_INVALID_RECIPIENT',
  QUOTA_EXCEEDED: 'GMAIL_QUOTA_EXCEEDED',
  UNSUPPORTED_OPERATION: 'GMAIL_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GmailEmail {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  labels: string[];
  attachments?: GmailAttachment[];
  receivedAt: string;
  isRead: boolean;
}

export interface GmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messagesTotal: number;
  messagesUnread: number;
}

export interface GmailDraft {
  id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GmailDriverConfig {
  /** OAuth2 client ID for Gmail API. */
  clientId: string;
  /** The email address of the authenticated user. */
  userEmail: string;
  /** Maximum attachment size in bytes (default 25MB). */
  maxAttachmentSize?: number;
}

// ---------------------------------------------------------------------------
// Gmail Driver
// ---------------------------------------------------------------------------

export class GmailDriver extends BaseDriver<GmailDriverConfig> {
  readonly name = 'gmail';
  readonly version = '1.0.0';

  private _accessToken: string | null = null;
  private _driverConfig: GmailDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    super();
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: GmailDriverConfig): Promise<void> {
    if (!config.clientId) {
      throw new Error('Gmail OAuth2 client ID is required');
    }
    if (!config.userEmail) {
      throw new Error('Gmail user email is required');
    }

    this._accessToken = await this.credentialManager.getCredential('gmail', 'access-token');
    if (!this._accessToken) {
      throw new Error('Failed to retrieve Gmail access token from Credential Manager');
    }
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'gmail',
      authenticated: true,
      userEmail: config.userEmail,
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
      return this.errorResult(operationId, GMAIL_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'sendEmail':
        return this.handleSendEmail(operation, operationId);
      case 'receiveEmails':
        return this.handleReceiveEmails(operation, operationId);
      case 'searchEmails':
        return this.handleSearchEmails(operation, operationId);
      case 'getEmail':
        return this.handleGetEmail(operation, operationId);
      case 'deleteEmail':
        return this.handleDeleteEmail(operation, operationId);
      case 'createDraft':
        return this.handleCreateDraft(operation, operationId);
      case 'sendDraft':
        return this.handleSendDraft(operation, operationId);
      case 'listLabels':
        return this.handleListLabels(operationId);
      default:
        return this.errorResult(
          operationId,
          GMAIL_ERROR_CODES.UNSUPPORTED_OPERATION,
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

  private async handleSendEmail(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { to, cc, bcc, subject, body, htmlBody } = operation.params as {
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      body?: string;
      htmlBody?: string;
    };

    if (!to || to.length === 0) {
      return this.errorResult(operationId, GMAIL_ERROR_CODES.INVALID_PARAMS, 'At least one recipient (to) is required', false);
    }
    if (!subject) {
      return this.errorResult(operationId, GMAIL_ERROR_CODES.INVALID_PARAMS, 'subject is required for sendEmail', false);
    }
    if (!body && !htmlBody) {
      return this.errorResult(operationId, GMAIL_ERROR_CODES.INVALID_PARAMS, 'body or htmlBody is required for sendEmail', false);
    }

    const email: GmailEmail = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      threadId: `thread-${Date.now()}`,
      from: this._driverConfig!.userEmail,
      to,
      cc,
      bcc,
      subject,
      body: body ?? '',
      htmlBody,
      labels: ['SENT'],
      receivedAt: new Date().toISOString(),
      isRead: true,
    };

    const result: DriverResult = {
      success: true,
      data: email,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleReceiveEmails(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { maxResults, labelIds } = operation.params as {
      maxResults?: number;
      labelIds?: string[];
    };

    const result: DriverResult = {
      success: true,
      data: {
        emails: [] as GmailEmail[],
        resultSizeEstimate: 0,
        filters: { maxResults: maxResults ?? 20, labelIds },
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleSearchEmails(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { query, maxResults } = operation.params as {
      query?: string;
      maxResults?: number;
    };

    if (!query) {
      return this.errorResult(operationId, GMAIL_ERROR_CODES.INVALID_PARAMS, 'query is required for searchEmails', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        emails: [] as GmailEmail[],
        resultSizeEstimate: 0,
        query,
        maxResults: maxResults ?? 20,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetEmail(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { emailId } = operation.params as { emailId?: string };

    if (!emailId) {
      return this.errorResult(operationId, GMAIL_ERROR_CODES.INVALID_PARAMS, 'emailId is required for getEmail', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        id: emailId,
        threadId: `thread-${emailId}`,
        from: 'sender@example.com',
        to: [this._driverConfig!.userEmail],
        subject: 'Mock email',
        body: 'This is a structural mock email.',
        labels: ['INBOX'],
        receivedAt: new Date().toISOString(),
        isRead: false,
      } satisfies GmailEmail,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleDeleteEmail(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { emailId } = operation.params as { emailId?: string };

    if (!emailId) {
      return this.errorResult(operationId, GMAIL_ERROR_CODES.INVALID_PARAMS, 'emailId is required for deleteEmail', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        emailId,
        deleted: true,
        deletedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleCreateDraft(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { to, cc, bcc, subject, body, htmlBody } = operation.params as {
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      body?: string;
      htmlBody?: string;
    };

    if (!to || to.length === 0) {
      return this.errorResult(operationId, GMAIL_ERROR_CODES.INVALID_PARAMS, 'At least one recipient (to) is required for createDraft', false);
    }
    if (!subject) {
      return this.errorResult(operationId, GMAIL_ERROR_CODES.INVALID_PARAMS, 'subject is required for createDraft', false);
    }

    const draft: GmailDraft = {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      to,
      cc,
      bcc,
      subject,
      body: body ?? '',
      htmlBody,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: draft,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleSendDraft(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { draftId } = operation.params as { draftId?: string };

    if (!draftId) {
      return this.errorResult(operationId, GMAIL_ERROR_CODES.INVALID_PARAMS, 'draftId is required for sendDraft', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        draftId,
        messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sentAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleListLabels(operationId: string): Promise<DriverResult> {
    const labels: GmailLabel[] = [
      { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: 0, messagesUnread: 0 },
      { id: 'SENT', name: 'SENT', type: 'system', messagesTotal: 0, messagesUnread: 0 },
      { id: 'DRAFT', name: 'DRAFT', type: 'system', messagesTotal: 0, messagesUnread: 0 },
      { id: 'TRASH', name: 'TRASH', type: 'system', messagesTotal: 0, messagesUnread: 0 },
      { id: 'SPAM', name: 'SPAM', type: 'system', messagesTotal: 0, messagesUnread: 0 },
    ];

    const result: DriverResult = {
      success: true,
      data: {
        labels,
        totalLabels: labels.length,
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
    return `gmail-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
