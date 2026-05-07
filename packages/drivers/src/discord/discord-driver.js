"use strict";
/**
 * Discord Bot API Driver — messaging, channel, and guild management via Discord Bot API.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for bot token
 * authentication, and implements all Discord Bot operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordDriver = exports.DISCORD_ERROR_CODES = void 0;
const driver_js_1 = require("../base/driver.js");
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
exports.DISCORD_ERROR_CODES = {
    UNAUTHORIZED: 'DISCORD_UNAUTHORIZED',
    FORBIDDEN: 'DISCORD_FORBIDDEN',
    NOT_FOUND: 'DISCORD_NOT_FOUND',
    RATE_LIMITED: 'DISCORD_RATE_LIMITED',
    INVALID_PARAMS: 'DISCORD_INVALID_PARAMS',
    CHANNEL_NOT_FOUND: 'DISCORD_CHANNEL_NOT_FOUND',
    GUILD_NOT_FOUND: 'DISCORD_GUILD_NOT_FOUND',
    MESSAGE_TOO_LONG: 'DISCORD_MESSAGE_TOO_LONG',
    MISSING_PERMISSIONS: 'DISCORD_MISSING_PERMISSIONS',
    UNSUPPORTED_OPERATION: 'DISCORD_UNSUPPORTED_OPERATION',
};
// ---------------------------------------------------------------------------
// Discord Driver
// ---------------------------------------------------------------------------
class DiscordDriver extends driver_js_1.BaseDriver {
    credentialManager;
    name = 'discord';
    version = '1.0.0';
    _botToken = null;
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
        if (!config.botTokenKeyName) {
            throw new Error('Discord bot token key name is required');
        }
        this._botToken = await this.credentialManager.getCredential('discord', config.botTokenKeyName);
        if (!this._botToken) {
            throw new Error('Failed to retrieve Discord bot token from Credential Manager');
        }
        this._driverConfig = config;
        this.updateSessionData({
            provider: 'discord',
            authenticated: true,
            defaultGuildId: config.defaultGuildId ?? null,
        });
    }
    async doDisconnect() {
        this._botToken = null;
        this._driverConfig = null;
        this._completedOperations.clear();
    }
    // =====================================================================
    // Execute
    // =====================================================================
    async doExecute(operation) {
        const operationId = this.createOpId();
        if (!this._driverConfig) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
        }
        switch (operation.type) {
            case 'sendMessage':
                return this.handleSendMessage(operation, operationId);
            case 'editMessage':
                return this.handleEditMessage(operation, operationId);
            case 'deleteMessage':
                return this.handleDeleteMessage(operation, operationId);
            case 'getMessages':
                return this.handleGetMessages(operation, operationId);
            case 'createChannel':
                return this.handleCreateChannel(operation, operationId);
            case 'getGuildInfo':
                return this.handleGetGuildInfo(operation, operationId);
            case 'addReaction':
                return this.handleAddReaction(operation, operationId);
            case 'createThread':
                return this.handleCreateThread(operation, operationId);
            default:
                return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.UNSUPPORTED_OPERATION, `Unsupported operation type: ${operation.type}`, false);
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
        const { channelId, content, embeds, replyToMessageId } = operation.params;
        if (!channelId) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for sendMessage', false);
        }
        if (!content && (!embeds || embeds.length === 0)) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'content or embeds is required for sendMessage', false);
        }
        const maxLen = this._driverConfig.maxMessageLength ?? 2000;
        if (content && content.length > maxLen) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.MESSAGE_TOO_LONG, `Message exceeds maximum length of ${maxLen} characters`, false);
        }
        const message = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            channelId,
            author: { id: 'bot-0', username: 'SeraphimBot', discriminator: '0000', bot: true },
            content: content ?? '',
            timestamp: new Date().toISOString(),
            pinned: false,
            type: 0,
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
        const { channelId, messageId, content } = operation.params;
        if (!channelId) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for editMessage', false);
        }
        if (!messageId) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'messageId is required for editMessage', false);
        }
        if (!content) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'content is required for editMessage', false);
        }
        const message = {
            id: messageId,
            channelId,
            author: { id: 'bot-0', username: 'SeraphimBot', discriminator: '0000', bot: true },
            content,
            timestamp: new Date().toISOString(),
            editedTimestamp: new Date().toISOString(),
            pinned: false,
            type: 0,
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
        const { channelId, messageId } = operation.params;
        if (!channelId) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for deleteMessage', false);
        }
        if (!messageId) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'messageId is required for deleteMessage', false);
        }
        const result = {
            success: true,
            data: {
                channelId,
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
    async handleGetMessages(operation, operationId) {
        const { channelId, limit, before, after } = operation.params;
        if (!channelId) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for getMessages', false);
        }
        const result = {
            success: true,
            data: {
                messages: [],
                channelId,
                limit: limit ?? 50,
                before,
                after,
                retrievedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleCreateChannel(operation, operationId) {
        const { guildId, name, type, topic, parentId } = operation.params;
        const resolvedGuildId = guildId ?? this._driverConfig.defaultGuildId;
        if (!resolvedGuildId) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'guildId is required for createChannel (or set defaultGuildId in config)', false);
        }
        if (!name) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'name is required for createChannel', false);
        }
        const channel = {
            id: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            guildId: resolvedGuildId,
            name,
            type: type ?? 'text',
            topic,
            position: 0,
            parentId,
        };
        const result = {
            success: true,
            data: channel,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetGuildInfo(operation, operationId) {
        const { guildId } = operation.params;
        const resolvedGuildId = guildId ?? this._driverConfig.defaultGuildId;
        if (!resolvedGuildId) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'guildId is required for getGuildInfo (or set defaultGuildId in config)', false);
        }
        const guild = {
            id: resolvedGuildId,
            name: 'Mock Guild',
            ownerId: 'owner-0',
            memberCount: 0,
            description: 'Structural mock guild',
            channels: [],
        };
        const result = {
            success: true,
            data: guild,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleAddReaction(operation, operationId) {
        const { channelId, messageId, emoji } = operation.params;
        if (!channelId) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for addReaction', false);
        }
        if (!messageId) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'messageId is required for addReaction', false);
        }
        if (!emoji) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'emoji is required for addReaction', false);
        }
        const result = {
            success: true,
            data: {
                channelId,
                messageId,
                emoji,
                added: true,
                addedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleCreateThread(operation, operationId) {
        const { channelId, name, messageId, autoArchiveDuration } = operation.params;
        if (!channelId) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for createThread', false);
        }
        if (!name) {
            return this.errorResult(operationId, exports.DISCORD_ERROR_CODES.INVALID_PARAMS, 'name is required for createThread', false);
        }
        const thread = {
            id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            guildId: this._driverConfig.defaultGuildId ?? 'unknown',
            parentId: channelId,
            name,
            messageCount: 0,
            memberCount: 1,
            archived: false,
            createdAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: thread,
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
        return `discord-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
exports.DiscordDriver = DiscordDriver;
//# sourceMappingURL=discord-driver.js.map