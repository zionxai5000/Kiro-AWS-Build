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
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const DISCORD_ERROR_CODES: {
    readonly UNAUTHORIZED: "DISCORD_UNAUTHORIZED";
    readonly FORBIDDEN: "DISCORD_FORBIDDEN";
    readonly NOT_FOUND: "DISCORD_NOT_FOUND";
    readonly RATE_LIMITED: "DISCORD_RATE_LIMITED";
    readonly INVALID_PARAMS: "DISCORD_INVALID_PARAMS";
    readonly CHANNEL_NOT_FOUND: "DISCORD_CHANNEL_NOT_FOUND";
    readonly GUILD_NOT_FOUND: "DISCORD_GUILD_NOT_FOUND";
    readonly MESSAGE_TOO_LONG: "DISCORD_MESSAGE_TOO_LONG";
    readonly MISSING_PERMISSIONS: "DISCORD_MISSING_PERMISSIONS";
    readonly UNSUPPORTED_OPERATION: "DISCORD_UNSUPPORTED_OPERATION";
};
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
export interface DiscordDriverConfig {
    /** The bot token key name in Credential Manager. */
    botTokenKeyName: string;
    /** The default guild (server) ID. */
    defaultGuildId?: string;
    /** Maximum message length (Discord limit is 2000). */
    maxMessageLength?: number;
}
export declare class DiscordDriver extends BaseDriver<DiscordDriverConfig> {
    private readonly credentialManager;
    readonly name = "discord";
    readonly version = "1.0.0";
    private _botToken;
    private _driverConfig;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: DiscordDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleSendMessage;
    private handleEditMessage;
    private handleDeleteMessage;
    private handleGetMessages;
    private handleCreateChannel;
    private handleGetGuildInfo;
    private handleAddReaction;
    private handleCreateThread;
    private createOpId;
    private errorResult;
}
//# sourceMappingURL=discord-driver.d.ts.map