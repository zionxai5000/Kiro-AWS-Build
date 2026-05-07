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
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const TELEGRAM_ERROR_CODES = {
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
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface TelegramDriverConfig {
  /** The bot token key name in Credential Manager. */
  botTokenKeyName: string;
  /** Optional webhook URL for receiving updates. */
  webhookUrl?: string;
  /** Maximum message length (Telegram limit is 4096). */
  maxMessageLength?: number;
}

// ---------------------------------------------------------------------------
// Telegram Driver
// ---------------------------------------------------------------------------

export class TelegramDriver extends BaseDriver<TelegramDriverConfig> {
  readonly name = 'telegram';
  readonly version = '1.0.0';

  private _botToken: string | null = null;
  private _driverConfig: TelegramDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();
  private _updateOffset = 0;

  constructor(private readonly credentialManager: CredentialManager) {
    super();
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: TelegramDriverConfig): Promise<void> {
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

  protected async doDisconnect(): Promise<void> {
    this._botToken = null;
    this._driverConfig = null;
    this._completedOperations.clear();
    this._updateOffset = 0;
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOpId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
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
        return this.errorResult(
          operationId,
          TELEGRAM_ERROR_CODES.UNSUPPORTED_OPERATION,
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

  private async handleSendMessage(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { chatId, text, parseMode, replyToMessageId } = operation.params as {
      chatId?: string;
      text?: string;
      parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      replyToMessageId?: number;
    };

    if (!chatId) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for sendMessage', false);
    }
    if (!text) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'text is required for sendMessage', false);
    }

    const maxLen = this._driverConfig!.maxMessageLength ?? 4096;
    if (text.length > maxLen) {
      return this.errorResult(
        operationId,
        TELEGRAM_ERROR_CODES.MESSAGE_TOO_LONG,
        `Message exceeds maximum length of ${maxLen} characters`,
        false,
      );
    }

    const message: TelegramMessage = {
      messageId: Math.floor(Math.random() * 1000000) + 1,
      chatId,
      from: { id: 0, isBot: true, firstName: 'Bot' },
      date: Math.floor(Date.now() / 1000),
      text,
      replyToMessageId,
    };

    const result: DriverResult = {
      success: true,
      data: message,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetUpdates(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { offset, limit, timeout } = operation.params as {
      offset?: number;
      limit?: number;
      timeout?: number;
    };

    const result: DriverResult = {
      success: true,
      data: {
        updates: [] as TelegramUpdate[],
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

  private async handleSendPhoto(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { chatId, photo, caption } = operation.params as {
      chatId?: string;
      photo?: string;
      caption?: string;
    };

    if (!chatId) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for sendPhoto', false);
    }
    if (!photo) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'photo (file ID or URL) is required for sendPhoto', false);
    }

    const message: TelegramMessage = {
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

    const result: DriverResult = {
      success: true,
      data: message,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleSendDocument(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { chatId, document, caption } = operation.params as {
      chatId?: string;
      document?: string;
      caption?: string;
    };

    if (!chatId) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for sendDocument', false);
    }
    if (!document) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'document (file ID or URL) is required for sendDocument', false);
    }

    const message: TelegramMessage = {
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

    const result: DriverResult = {
      success: true,
      data: message,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleEditMessage(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { chatId, messageId, text, parseMode } = operation.params as {
      chatId?: string;
      messageId?: number;
      text?: string;
      parseMode?: string;
    };

    if (!chatId) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for editMessage', false);
    }
    if (!messageId) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'messageId is required for editMessage', false);
    }
    if (!text) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'text is required for editMessage', false);
    }

    const message: TelegramMessage = {
      messageId,
      chatId,
      from: { id: 0, isBot: true, firstName: 'Bot' },
      date: Math.floor(Date.now() / 1000),
      text,
    };

    const result: DriverResult = {
      success: true,
      data: message,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleDeleteMessage(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { chatId, messageId } = operation.params as {
      chatId?: string;
      messageId?: number;
    };

    if (!chatId) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for deleteMessage', false);
    }
    if (!messageId) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'messageId is required for deleteMessage', false);
    }

    const result: DriverResult = {
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

  private async handleGetChat(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { chatId } = operation.params as { chatId?: string };

    if (!chatId) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for getChat', false);
    }

    const chat: TelegramChat = {
      id: chatId,
      type: 'private',
      firstName: 'Mock',
      lastName: 'User',
      description: 'Mock chat for structural implementation',
    };

    const result: DriverResult = {
      success: true,
      data: chat,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetChatMembers(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { chatId } = operation.params as { chatId?: string };

    if (!chatId) {
      return this.errorResult(operationId, TELEGRAM_ERROR_CODES.INVALID_PARAMS, 'chatId is required for getChatMembers', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        chatId,
        members: [] as TelegramChatMember[],
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

  private createOpId(): string {
    return `telegram-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
