"use strict";
/**
 * Telegram Bot API Driver — messaging, media, and chat management via Telegram Bot API.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for bot token
 * authentication, and implements all Telegram Bot operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramDriver = exports.TELEGRAM_ERROR_CODES = void 0;
const driver_js_1 = require("../base/driver.js");
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
exports.TELEGRAM_ERROR_CODES = {
    UNAUTHORIZED: 'TELEGRAM_UNAUTHORIZED',
    FORBIDDEN: 'TELEGRAM_FORBIDDEN',
    NOT_FOUND: 'TELEGRAM_NOT_FOUND',
    RATE_LIMITED: 'TELEGRAM_RATE_LIMITED',
    INVALID_PARAMS: 'TELEGRAM_INVALID_PARAMS',
    CHAT_NOT_FOUND: 'TELEGRAM_CHAT_NOT_FOUND',
    MESSAGE_TOO_LONG: 'TELEGRAM_MESSAGE_TOO_LONG',
    FILE_TOO_LARGE: 'TELEGRAM_FILE_TOO_LARGE',
    BOT_BLOCKED: 'TELEGRAM_BOT_BLOCKED',
    UNSUPPORTED_OPERATION: 'TELEGRAM_UNSUPPORTED_OPERATION',
};
// ---------------------------------------------------------------------------
// Telegram Driver
// ---------------------------------------------------------------------------
class TelegramDriver extends driver_js_1.BaseDriver {
    credentialManager;
    name = 'telegram';
    version = '1.0.0';
    _botToken = null;
    _driverConfig = null;
    _completedOperations = new Map();
    _updateOffset = 0;
    constructor(credentialManager) {
        super();
        this.credentialManager = credentialManager;
    }
    // =====================================================================
    // Lifecycle
    // =====================================================================
    async doConnect(config) {
        if (!config.botTokenKeyName) {
            throw new Error('Telegram bot token key name is required');
        }
        this._botToken = await this.credentialManager.getCredential('telegram', config.botTokenKeyName);
        if (!this._botToken) {
            throw new Error('Failed to retrieve Telegram bot token from Credential Manager');
        }
        this._driverConfig = config;
        this._updateOffset = 0;
        this.updateSessionData({
            provider: 'telegram',
            authenticated: true,
            webhookUrl: config.webhookUrl ?? null,
        });
    }
    async doDisconnect() {
        this._botToken = null;
        this._driverConfig = null;
        this._completedOperations.clear();
        this._updateOffset = 0;
    }
    // =====================================================================
    // Execute
    // =====================================================================
    async doExecute(operation) {
        const operationId = this.createOpId();
        if (!this._driverConfig) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
        }
        switch (operation.type) {
            case 'sendMessage':
                return this.handleSendMessage(operation, operationId);
            case 'getUpdates':
                return this.handleGetUpdates(operation, operationId);
            case 'sendPhoto':
                return this.handleSendPhoto(operation, operationId);
            case 'sendDocument':
                return this.handleSendDocument(operation, operationId);
            case 'editMessage':
                return this.handleEditMessage(operation, operationId);
            case 'deleteMessage':
                return this.handleDeleteMessage(operation, operationId);
            case 'getChat':
                return this.handleGetChat(operation, operationId);
            case 'getChatMembers':
                return this.handleGetChatMembers(operation, operationId);
            default:
                return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.UNSUPPORTED_OPERATION, `Unsupported operation type: ${operation.type}`, false);
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
        const { chatId, text, parseMode, replyToMessageId } = operation.params;
        if (!chatId) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for sendMessage', false);
        }
        if (!text) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'text is required for sendMessage', false);
        }
        const maxLen = this._driverConfig.maxMessageLength ?? 4096;
        if (text.length > maxLen) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.MESSAGE_TOO_LONG, `Message exceeds maximum length of ${maxLen} characters`, false);
        }
        const message = {
            messageId: Math.floor(Math.random() * 1000000) + 1,
            chatId,
            from: { id: 0, isBot: true, firstName: 'Bot' },
            date: Math.floor(Date.now() / 1000),
            text,
            replyToMessageId,
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
    async handleGetUpdates(operation, operationId) {
        const { offset, limit, timeout } = operation.params;
        const result = {
            success: true,
            data: {
                updates: [],
                offset: offset ?? this._updateOffset,
                limit: limit ?? 100,
                timeout: timeout ?? 0,
                retrievedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleSendPhoto(operation, operationId) {
        const { chatId, photo, caption } = operation.params;
        if (!chatId) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for sendPhoto', false);
        }
        if (!photo) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'photo (file ID or URL) is required for sendPhoto', false);
        }
        const message = {
            messageId: Math.floor(Math.random() * 1000000) + 1,
            chatId,
            from: { id: 0, isBot: true, firstName: 'Bot' },
            date: Math.floor(Date.now() / 1000),
            text: caption,
            photo: [
                {
                    fileId: `photo-${Date.now()}`,
                    fileUniqueId: `unique-${Date.now()}`,
                    width: 800,
                    height: 600,
                },
            ],
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
    async handleSendDocument(operation, operationId) {
        const { chatId, document, caption } = operation.params;
        if (!chatId) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for sendDocument', false);
        }
        if (!document) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'document (file ID or URL) is required for sendDocument', false);
        }
        const message = {
            messageId: Math.floor(Math.random() * 1000000) + 1,
            chatId,
            from: { id: 0, isBot: true, firstName: 'Bot' },
            date: Math.floor(Date.now() / 1000),
            text: caption,
            document: {
                fileId: `doc-${Date.now()}`,
                fileUniqueId: `unique-doc-${Date.now()}`,
                fileName: 'document.pdf',
                mimeType: 'application/pdf',
            },
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
    async handleEditMessage(operation, operationId) {
        const { chatId, messageId, text, parseMode } = operation.params;
        if (!chatId) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for editMessage', false);
        }
        if (!messageId) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'messageId is required for editMessage', false);
        }
        if (!text) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'text is required for editMessage', false);
        }
        const message = {
            messageId,
            chatId,
            from: { id: 0, isBot: true, firstName: 'Bot' },
            date: Math.floor(Date.now() / 1000),
            text,
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
    async handleDeleteMessage(operation, operationId) {
        const { chatId, messageId } = operation.params;
        if (!chatId) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for deleteMessage', false);
        }
        if (!messageId) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'messageId is required for deleteMessage', false);
        }
        const result = {
            success: true,
            data: {
                chatId,
                messageId,
                deleted: true,
                deletedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetChat(operation, operationId) {
        const { chatId } = operation.params;
        if (!chatId) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for getChat', false);
        }
        const chat = {
            id: chatId,
            type: 'private',
            firstName: 'Mock',
            lastName: 'User',
            description: 'Mock chat for structural implementation',
        };
        const result = {
            success: true,
            data: chat,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetChatMembers(operation, operationId) {
        const { chatId } = operation.params;
        if (!chatId) {
            return this.errorResult(operationId, exports.TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for getChatMembers', false);
        }
        const result = {
            success: true,
            data: {
                chatId,
                members: [],
                totalCount: 0,
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
        return `telegram-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
exports.TelegramDriver = TelegramDriver;
//# sourceMappingURL=telegram-driver.js.map