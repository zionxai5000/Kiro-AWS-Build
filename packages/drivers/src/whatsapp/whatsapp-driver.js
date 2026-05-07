"use strict";
/**
 * WhatsApp Business API Driver — messaging, media, and business profile management
 * via WhatsApp Business Cloud API.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for access token
 * authentication, and implements all WhatsApp Business operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppDriver = exports.WHATSAPP_ERROR_CODES = void 0;
const driver_js_1 = require("../base/driver.js");
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
exports.WHATSAPP_ERROR_CODES = {
    UNAUTHORIZED: 'WHATSAPP_UNAUTHORIZED',
    FORBIDDEN: 'WHATSAPP_FORBIDDEN',
    NOT_FOUND: 'WHATSAPP_NOT_FOUND',
    RATE_LIMITED: 'WHATSAPP_RATE_LIMITED',
    INVALID_PARAMS: 'WHATSAPP_INVALID_PARAMS',
    RECIPIENT_NOT_FOUND: 'WHATSAPP_RECIPIENT_NOT_FOUND',
    TEMPLATE_NOT_FOUND: 'WHATSAPP_TEMPLATE_NOT_FOUND',
    MEDIA_TOO_LARGE: 'WHATSAPP_MEDIA_TOO_LARGE',
    MESSAGE_FAILED: 'WHATSAPP_MESSAGE_FAILED',
    UNSUPPORTED_OPERATION: 'WHATSAPP_UNSUPPORTED_OPERATION',
};
// ---------------------------------------------------------------------------
// WhatsApp Driver
// ---------------------------------------------------------------------------
class WhatsAppDriver extends driver_js_1.BaseDriver {
    credentialManager;
    name = 'whatsapp';
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
        if (!config.accessTokenKeyName) {
            throw new Error('WhatsApp access token key name is required');
        }
        if (!config.phoneNumberId) {
            throw new Error('WhatsApp phone number ID is required');
        }
        if (!config.businessAccountId) {
            throw new Error('WhatsApp Business Account ID is required');
        }
        this._accessToken = await this.credentialManager.getCredential('whatsapp', config.accessTokenKeyName);
        if (!this._accessToken) {
            throw new Error('Failed to retrieve WhatsApp access token from Credential Manager');
        }
        this._driverConfig = config;
        this.updateSessionData({
            provider: 'whatsapp',
            authenticated: true,
            phoneNumberId: config.phoneNumberId,
            businessAccountId: config.businessAccountId,
            apiVersion: config.apiVersion ?? 'v18.0',
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
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
        }
        switch (operation.type) {
            case 'sendMessage':
                return this.handleSendMessage(operation, operationId);
            case 'sendTemplate':
                return this.handleSendTemplate(operation, operationId);
            case 'getMessages':
                return this.handleGetMessages(operation, operationId);
            case 'sendMedia':
                return this.handleSendMedia(operation, operationId);
            case 'markAsRead':
                return this.handleMarkAsRead(operation, operationId);
            case 'getBusinessProfile':
                return this.handleGetBusinessProfile(operationId);
            case 'sendLocation':
                return this.handleSendLocation(operation, operationId);
            case 'sendContact':
                return this.handleSendContact(operation, operationId);
            default:
                return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.UNSUPPORTED_OPERATION, `Unsupported operation type: ${operation.type}`, false);
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
    async handleSendMessage(operation, operationId) {
        const { to, text, previewUrl } = operation.params;
        if (!to) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'to (recipient phone number) is required for sendMessage', false);
        }
        if (!text) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'text is required for sendMessage', false);
        }
        const message = {
            id: `wamid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: this._driverConfig.phoneNumberId,
            to,
            timestamp: new Date().toISOString(),
            type: 'text',
            text: { body: text, previewUrl },
            status: 'sent',
        };
        const result = {
            success: true,
            data: message,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleSendTemplate(operation, operationId) {
        const { to, templateName, languageCode, components } = operation.params;
        if (!to) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'to (recipient phone number) is required for sendTemplate', false);
        }
        if (!templateName) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'templateName is required for sendTemplate', false);
        }
        const message = {
            id: `wamid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: this._driverConfig.phoneNumberId,
            to,
            timestamp: new Date().toISOString(),
            type: 'template',
            template: {
                name: templateName,
                language: { code: languageCode ?? 'en_US' },
                components,
            },
            status: 'sent',
        };
        const result = {
            success: true,
            data: message,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetMessages(operation, operationId) {
        const { limit, after } = operation.params;
        const result = {
            success: true,
            data: {
                messages: [],
                totalCount: 0,
                limit: limit ?? 20,
                after,
                retrievedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleSendMedia(operation, operationId) {
        const { to, mediaType, mediaUrl, mediaId, caption, filename } = operation.params;
        if (!to) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'to (recipient phone number) is required for sendMedia', false);
        }
        if (!mediaType) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'mediaType is required for sendMedia', false);
        }
        if (!mediaUrl && !mediaId) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'mediaUrl or mediaId is required for sendMedia', false);
        }
        const mediaContent = {
            id: mediaId,
            link: mediaUrl,
            caption,
            filename,
        };
        const message = {
            id: `wamid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: this._driverConfig.phoneNumberId,
            to,
            timestamp: new Date().toISOString(),
            type: mediaType,
            status: 'sent',
        };
        // Assign media to the correct field based on type
        switch (mediaType) {
            case 'image':
                message.image = mediaContent;
                break;
            case 'document':
                message.document = mediaContent;
                break;
            case 'video':
                message.video = mediaContent;
                break;
            case 'audio':
                message.audio = mediaContent;
                break;
        }
        const result = {
            success: true,
            data: message,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleMarkAsRead(operation, operationId) {
        const { messageId } = operation.params;
        if (!messageId) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'messageId is required for markAsRead', false);
        }
        const result = {
            success: true,
            data: {
                messageId,
                markedAsRead: true,
                markedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetBusinessProfile(operationId) {
        const profile = {
            about: 'SeraphimOS Business Account',
            address: '',
            description: 'Autonomous orchestration platform',
            email: '',
            vertical: 'TECH',
            websites: [],
        };
        const result = {
            success: true,
            data: profile,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleSendLocation(operation, operationId) {
        const { to, latitude, longitude, name, address } = operation.params;
        if (!to) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'to (recipient phone number) is required for sendLocation', false);
        }
        if (latitude === undefined || latitude === null) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'latitude is required for sendLocation', false);
        }
        if (longitude === undefined || longitude === null) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'longitude is required for sendLocation', false);
        }
        const message = {
            id: `wamid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: this._driverConfig.phoneNumberId,
            to,
            timestamp: new Date().toISOString(),
            type: 'location',
            location: { latitude, longitude, name, address },
            status: 'sent',
        };
        const result = {
            success: true,
            data: message,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleSendContact(operation, operationId) {
        const { to, contacts } = operation.params;
        if (!to) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'to (recipient phone number) is required for sendContact', false);
        }
        if (!contacts || contacts.length === 0) {
            return this.errorResult(operationId, exports.WHATSAPP_ERROR_CODES.INVALID_PARAMS, 'contacts array is required for sendContact', false);
        }
        const message = {
            id: `wamid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: this._driverConfig.phoneNumberId,
            to,
            timestamp: new Date().toISOString(),
            type: 'contacts',
            contacts,
            status: 'sent',
        };
        const result = {
            success: true,
            data: message,
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
        return `whatsapp-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
exports.WhatsAppDriver = WhatsAppDriver;
//# sourceMappingURL=whatsapp-driver.js.map