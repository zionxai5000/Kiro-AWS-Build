/**
 * Telegram Bot API Driver — messaging, media, and chat management via Telegram Bot API.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for bot token
 * authentication, and implements all Telegram Bot operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
import { BaseDriver } from '../base/driver.js';
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const TELEGRAM_ERROR_CODES: {
    readonly UNAUTHORIZED: "TELEGRAM_UNAUTHORIZED";
    readonly FORBIDDEN: "TELEGRAM_FORBIDDEN";
    readonly NOT_FOUND: "TELEGRAM_NOT_FOUND";
    readonly RATE_LIMITED: "TELEGRAM_RATE_LIMITED";
    readonly INVALID_PARAMS: "TELEGRAM_INVALID_PARAMS";
    readonly CHAT_NOT_FOUND: "TELEGRAM_CHAT_NOT_FOUND";
    readonly MESSAGE_TOO_LONG: "TELEGRAM_MESSAGE_TOO_LONG";
    readonly FILE_TOO_LARGE: "TELEGRAM_FILE_TOO_LARGE";
    readonly BOT_BLOCKED: "TELEGRAM_BOT_BLOCKED";
    readonly UNSUPPORTED_OPERATION: "TELEGRAM_UNSUPPORTED_OPERATION";
};
export interface TelegramMessage {
    messageId: number;
    chatId: string;
    from: TelegramUser;
    date: number;
    text?: string;
    photo?: TelegramPhotoSize[];
    document?: TelegramDocument;
    replyToMessageId?: number;
}
export interface TelegramUser {
    id: number;
    isBot: boolean;
    firstName: string;
    lastName?: string;
    username?: string;
}
export interface TelegramChat {
    id: string;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    description?: string;
    memberCount?: number;
}
export interface TelegramPhotoSize {
    fileId: string;
    fileUniqueId: string;
    width: number;
    height: number;
    fileSize?: number;
}
export interface TelegramDocument {
    fileId: string;
    fileUniqueId: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
}
export interface TelegramChatMember {
    user: TelegramUser;
    status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
}
export interface TelegramUpdate {
    updateId: number;
    message?: TelegramMessage;
}
export interface TelegramDriverConfig {
    /** The bot token key name in Credential Manager. */
    botTokenKeyName: string;
    /** Optional webhook URL for receiving updates. */
    webhookUrl?: string;
    /** Maximum message length (Telegram limit is 4096). */
    maxMessageLength?: number;
}
export declare class TelegramDriver extends BaseDriver<TelegramDriverConfig> {
    private readonly credentialManager;
    readonly name = "telegram";
    readonly version = "1.0.0";
    private _botToken;
    private _driverConfig;
    private readonly _completedOperations;
    private _updateOffset;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: TelegramDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleSendMessage;
    private handleGetUpdates;
    private handleSendPhoto;
    private handleSendDocument;
    private handleEditMessage;
    private handleDeleteMessage;
    private handleGetChat;
    private handleGetChatMembers;
    private createOpId;
    private errorResult;
}
//# sourceMappingURL=telegram-driver.d.ts.map