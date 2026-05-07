"use strict";
/**
 * Gmail API Driver — email sending, receiving, and management via Gmail API.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for OAuth2
 * authentication, and implements all Gmail operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmailDriver = exports.GMAIL_ERROR_CODES = void 0;
const driver_js_1 = require("../base/driver.js");
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
exports.GMAIL_ERROR_CODES = {
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
};
// ---------------------------------------------------------------------------
// Gmail Driver
// ---------------------------------------------------------------------------
class GmailDriver extends driver_js_1.BaseDriver {
    credentialManager;
    name = 'gmail';
    version = '1.0.0';
    _accessToken = null;
    _driverConfig = null;
    _completedOperations = new Map();
    constructor(credentialManager) {
        super();
        this.credentialManager = credentialManager;
    }
    // =====================================================================
    // Lifecycle
    // =====================================================================
    async doConnect(config) {
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
    async doDisconnect() {
        this._accessToken = null;
        this._driverConfig = null;
        this._completedOperations.clear();
    }
    // =====================================================================
    // Execute
    // =====================================================================
    async doExecute(operation) {
        const operationId = this.createOpId();
        if (!this._driverConfig) {
            return this.errorResult(operationId, exports.GMAIL_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
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
                return this.errorResult(operationId, exports.GMAIL_ERROR_CODES.UNSUPPORTED_OPERATION, `Unsupported operation type: ${operation.type}`, false);
        }
    }
    async doVerify(operationId) {
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
    async handleSendEmail(operation, operationId) {
        const { to, cc, bcc, subject, body, htmlBody } = operation.params;
        if (!to || to.length === 0) {
            return this.errorResult(operationId, exports.GMAIL_ERROR_CODES.INVALID_PARAMS, 'At least one recipient (to) is required', false);
        }
        if (!subject) {
            return this.errorResult(operationId, exports.GMAIL_ERROR_CODES.INVALID_PARAMS, 'subject is required for sendEmail', false);
        }
        if (!body && !htmlBody) {
            return this.errorResult(operationId, exports.GMAIL_ERROR_CODES.INVALID_PARAMS, 'body or htmlBody is required for sendEmail', false);
        }
        const email = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            threadId: `thread-${Date.now()}`,
            from: this._driverConfig.userEmail,
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
        const result = {
            success: true,
            data: email,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleReceiveEmails(operation, operationId) {
        const { maxResults, labelIds } = operation.params;
        const result = {
            success: true,
            data: {
                emails: [],
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
    async handleSearchEmails(operation, operationId) {
        const { query, maxResults } = operation.params;
        if (!query) {
            return this.errorResult(operationId, exports.GMAIL_ERROR_CODES.INVALID_PARAMS, 'query is required for searchEmails', false);
        }
        const result = {
            success: true,
            data: {
                emails: [],
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
    async handleGetEmail(operation, operationId) {
        const { emailId } = operation.params;
        if (!emailId) {
            return this.errorResult(operationId, exports.GMAIL_ERROR_CODES.INVALID_PARAMS, 'emailId is required for getEmail', false);
        }
        const result = {
            success: true,
            data: {
                id: emailId,
                threadId: `thread-${emailId}`,
                from: 'sender@example.com',
                to: [this._driverConfig.userEmail],
                subject: 'Mock email',
                body: 'This is a structural mock email.',
                labels: ['INBOX'],
                receivedAt: new Date().toISOString(),
                isRead: false,
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleDeleteEmail(operation, operationId) {
        const { emailId } = operation.params;
        if (!emailId) {
            return this.errorResult(operationId, exports.GMAIL_ERROR_CODES.INVALID_PARAMS, 'emailId is required for deleteEmail', false);
        }
        const result = {
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
    async handleCreateDraft(operation, operationId) {
        const { to, cc, bcc, subject, body, htmlBody } = operation.params;
        if (!to || to.length === 0) {
            return this.errorResult(operationId, exports.GMAIL_ERROR_CODES.INVALID_PARAMS, 'At least one recipient (to) is required for createDraft', false);
        }
        if (!subject) {
            return this.errorResult(operationId, exports.GMAIL_ERROR_CODES.INVALID_PARAMS, 'subject is required for createDraft', false);
        }
        const draft = {
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
        const result = {
            success: true,
            data: draft,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleSendDraft(operation, operationId) {
        const { draftId } = operation.params;
        if (!draftId) {
            return this.errorResult(operationId, exports.GMAIL_ERROR_CODES.INVALID_PARAMS, 'draftId is required for sendDraft', false);
        }
        const result = {
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
    async handleListLabels(operationId) {
        const labels = [
            { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: 0, messagesUnread: 0 },
            { id: 'SENT', name: 'SENT', type: 'system', messagesTotal: 0, messagesUnread: 0 },
            { id: 'DRAFT', name: 'DRAFT', type: 'system', messagesTotal: 0, messagesUnread: 0 },
            { id: 'TRASH', name: 'TRASH', type: 'system', messagesTotal: 0, messagesUnread: 0 },
            { id: 'SPAM', name: 'SPAM', type: 'system', messagesTotal: 0, messagesUnread: 0 },
        ];
        const result = {
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
    createOpId() {
        return `gmail-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    errorResult(operationId, code, message, retryable, details) {
        return {
            success: false,
            error: { code, message, retryable, details },
            retryable,
            operationId,
        };
    }
}
exports.GmailDriver = GmailDriver;
//# sourceMappingURL=gmail-driver.js.map