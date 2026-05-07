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
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const GMAIL_ERROR_CODES: {
    readonly UNAUTHORIZED: "GMAIL_UNAUTHORIZED";
    readonly FORBIDDEN: "GMAIL_FORBIDDEN";
    readonly NOT_FOUND: "GMAIL_NOT_FOUND";
    readonly RATE_LIMITED: "GMAIL_RATE_LIMITED";
    readonly INVALID_PARAMS: "GMAIL_INVALID_PARAMS";
    readonly SEND_FAILED: "GMAIL_SEND_FAILED";
    readonly ATTACHMENT_TOO_LARGE: "GMAIL_ATTACHMENT_TOO_LARGE";
    readonly INVALID_RECIPIENT: "GMAIL_INVALID_RECIPIENT";
    readonly QUOTA_EXCEEDED: "GMAIL_QUOTA_EXCEEDED";
    readonly UNSUPPORTED_OPERATION: "GMAIL_UNSUPPORTED_OPERATION";
};
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
export interface GmailDriverConfig {
    /** OAuth2 client ID for Gmail API. */
    clientId: string;
    /** The email address of the authenticated user. */
    userEmail: string;
    /** Maximum attachment size in bytes (default 25MB). */
    maxAttachmentSize?: number;
}
export declare class GmailDriver extends BaseDriver<GmailDriverConfig> {
    private readonly credentialManager;
    readonly name = "gmail";
    readonly version = "1.0.0";
    private _accessToken;
    private _driverConfig;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: GmailDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleSendEmail;
    private handleReceiveEmails;
    private handleSearchEmails;
    private handleGetEmail;
    private handleDeleteEmail;
    private handleCreateDraft;
    private handleSendDraft;
    private handleListLabels;
    private createOpId;
    private errorResult;
}
//# sourceMappingURL=gmail-driver.d.ts.map