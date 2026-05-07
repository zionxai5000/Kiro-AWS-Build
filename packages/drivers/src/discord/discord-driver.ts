/**
 * Discord Bot API Driver — messaging, channel, and guild management via Discord Bot API.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for bot token
 * authentication, and implements all Discord Bot operations.
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

export const DISCORD_ERROR_CODES = {
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
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscordMessage {
  id: string;
  channelId: string;
  guildId?: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  editedTimestamp?: string;
  pinned: boolean;
  type: number;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  bot: boolean;
  avatar?: string;
}

export interface DiscordChannel {
  id: string;
  guildId?: string;
  name: string;
  type: DiscordChannelType;
  topic?: string;
  position: number;
  parentId?: string;
}

export type DiscordChannelType = 'text' | 'voice' | 'category' | 'announcement' | 'stage' | 'forum' | 'thread';

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  ownerId: string;
  memberCount: number;
  description?: string;
  channels: DiscordChannel[];
}

export interface DiscordThread {
  id: string;
  guildId: string;
  parentId: string;
  name: string;
  messageCount: number;
  memberCount: number;
  archived: boolean;
  createdAt: string;
}

export interface DiscordReaction {
  emoji: string;
  count: number;
  me: boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface DiscordDriverConfig {
  /** The bot token key name in Credential Manager. */
  botTokenKeyName: string;
  /** The default guild (server) ID. */
  defaultGuildId?: string;
  /** Maximum message length (Discord limit is 2000). */
  maxMessageLength?: number;
}

// ---------------------------------------------------------------------------
// Discord Driver
// ---------------------------------------------------------------------------

export class DiscordDriver extends BaseDriver<DiscordDriverConfig> {
  readonly name = 'discord';
  readonly version = '1.0.0';

  private _botToken: string | null = null;
  private _driverConfig: DiscordDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    super();
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: DiscordDriverConfig): Promise<void> {
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

  protected async doDisconnect(): Promise<void> {
    this._botToken = null;
    this._driverConfig = null;
    this._completedOperations.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOpId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
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
        return this.errorResult(
          operationId,
          DISCORD_ERROR_CODES.UNSUPPORTED_OPERATION,
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
    const { channelId, content, embeds, replyToMessageId } = operation.params as {
      channelId?: string;
      content?: string;
      embeds?: Record<string, unknown>[];
      replyToMessageId?: string;
    };

    if (!channelId) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for sendMessage', false);
    }
    if (!content && (!embeds || embeds.length === 0)) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'content or embeds is required for sendMessage', false);
    }

    const maxLen = this._driverConfig!.maxMessageLength ?? 2000;
    if (content && content.length > maxLen) {
      return this.errorResult(
        operationId,
        DISCORD_ERROR_CODES.MESSAGE_TOO_LONG,
        `Message exceeds maximum length of ${maxLen} characters`,
        false,
      );
    }

    const message: DiscordMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      channelId,
      author: { id: 'bot-0', username: 'SeraphimBot', discriminator: '0000', bot: true },
      content: content ?? '',
      timestamp: new Date().toISOString(),
      pinned: false,
      type: 0,
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
    const { channelId, messageId, content } = operation.params as {
      channelId?: string;
      messageId?: string;
      content?: string;
    };

    if (!channelId) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for editMessage', false);
    }
    if (!messageId) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'messageId is required for editMessage', false);
    }
    if (!content) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'content is required for editMessage', false);
    }

    const message: DiscordMessage = {
      id: messageId,
      channelId,
      author: { id: 'bot-0', username: 'SeraphimBot', discriminator: '0000', bot: true },
      content,
      timestamp: new Date().toISOString(),
      editedTimestamp: new Date().toISOString(),
      pinned: false,
      type: 0,
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
    const { channelId, messageId } = operation.params as {
      channelId?: string;
      messageId?: string;
    };

    if (!channelId) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for deleteMessage', false);
    }
    if (!messageId) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'messageId is required for deleteMessage', false);
    }

    const result: DriverResult = {
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

  private async handleGetMessages(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { channelId, limit, before, after } = operation.params as {
      channelId?: string;
      limit?: number;
      before?: string;
      after?: string;
    };

    if (!channelId) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for getMessages', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        messages: [] as DiscordMessage[],
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

  private async handleCreateChannel(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { guildId, name, type, topic, parentId } = operation.params as {
      guildId?: string;
      name?: string;
      type?: DiscordChannelType;
      topic?: string;
      parentId?: string;
    };

    const resolvedGuildId = guildId ?? this._driverConfig!.defaultGuildId;
    if (!resolvedGuildId) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'guildId is required for createChannel (or set defaultGuildId in config)', false);
    }
    if (!name) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'name is required for createChannel', false);
    }

    const channel: DiscordChannel = {
      id: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      guildId: resolvedGuildId,
      name,
      type: type ?? 'text',
      topic,
      position: 0,
      parentId,
    };

    const result: DriverResult = {
      success: true,
      data: channel,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetGuildInfo(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { guildId } = operation.params as { guildId?: string };

    const resolvedGuildId = guildId ?? this._driverConfig!.defaultGuildId;
    if (!resolvedGuildId) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'guildId is required for getGuildInfo (or set defaultGuildId in config)', false);
    }

    const guild: DiscordGuild = {
      id: resolvedGuildId,
      name: 'Mock Guild',
      ownerId: 'owner-0',
      memberCount: 0,
      description: 'Structural mock guild',
      channels: [],
    };

    const result: DriverResult = {
      success: true,
      data: guild,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleAddReaction(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { channelId, messageId, emoji } = operation.params as {
      channelId?: string;
      messageId?: string;
      emoji?: string;
    };

    if (!channelId) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for addReaction', false);
    }
    if (!messageId) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'messageId is required for addReaction', false);
    }
    if (!emoji) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'emoji is required for addReaction', false);
    }

    const result: DriverResult = {
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

  private async handleCreateThread(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { channelId, name, messageId, autoArchiveDuration } = operation.params as {
      channelId?: string;
      name?: string;
      messageId?: string;
      autoArchiveDuration?: number;
    };

    if (!channelId) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'channelId is required for createThread', false);
    }
    if (!name) {
      return this.errorResult(operationId, DISCORD_ERROR_CODES.INVALID_PARAMS, 'name is required for createThread', false);
    }

    const thread: DiscordThread = {
      id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      guildId: this._driverConfig!.defaultGuildId ?? 'unknown',
      parentId: channelId,
      name,
      messageCount: 0,
      memberCount: 1,
      archived: false,
      createdAt: new Date().toISOString(),
    };

    const result: DriverResult = {
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

  private createOpId(): string {
    return `discord-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
