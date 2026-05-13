/**
 * Telegram Integration Service — Implementation
 *
 * Provides Telegram bot integration with per-agent thread management,
 * account linking, message routing, and bidirectional dashboard sync.
 *
 * Requirements: 38a.1, 38a.2, 38a.3, 38b.4, 38b.5, 38b.6, 38c.7, 38c.8, 38c.9
 */

import type {
  ChatMessage,
  TelegramBotConfig,
  TelegramIncomingMessage,
  TelegramAccountLink,
  TelegramIntegrationService,
} from './types.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * In-memory implementation of the Telegram Integration Service.
 *
 * Manages bot state, per-agent thread mappings, account links,
 * and bidirectional synchronization between Telegram and the dashboard.
 *
 * The actual Telegram Bot API calls (sending messages, creating topics)
 * will be wired via a driver in a later task. This implementation handles
 * all routing logic, authorization, and message transformation.
 */
export class TelegramIntegrationServiceImpl implements TelegramIntegrationService {
  /** Bot configuration (set on initialize) */
  private config: TelegramBotConfig | undefined;

  /** Whether the service has been initialized */
  private initialized = false;

  /** Account links: telegramUserId → TelegramAccountLink */
  private readonly accountLinks = new Map<number, TelegramAccountLink>();

  /** Agent thread mappings: agentId → threadId */
  private readonly agentThreads = new Map<string, string>();

  /** Reverse thread mapping: threadId → agentId */
  private readonly threadToAgent = new Map<string, string>();

  /** Outgoing messages buffer (for sendToThread, until driver is wired) */
  private readonly outgoingMessages: Array<{
    agentId: string;
    threadId: string;
    message: string;
    metadata?: { source?: string };
    timestamp: Date;
  }> = [];

  /** Synced dashboard messages (for syncFromDashboard, until driver is wired) */
  private readonly syncedToDashboard: ChatMessage[] = [];

  /** Synced Telegram messages (for syncFromDashboard output) */
  private readonly syncedToTelegram: Array<{
    threadId: string;
    content: string;
    source: string;
    timestamp: Date;
  }> = [];

  /** Counter for generating unique message IDs */
  private messageCounter = 0;

  // -------------------------------------------------------------------------
  // Initialization (Req 38a.1)
  // -------------------------------------------------------------------------

  /**
   * Initialize the Telegram bot with configuration.
   *
   * Stores the config and sets up initial agent thread mappings
   * from the provided configuration.
   */
  async initialize(config: TelegramBotConfig): Promise<void> {
    if (!config.botToken) {
      throw new Error('Bot token is required for initialization');
    }
    if (!config.groupChatId) {
      throw new Error('Group chat ID is required for initialization');
    }

    this.config = config;

    // Set up initial thread mappings from config
    for (const [agentId, threadId] of Object.entries(config.agentThreadIds)) {
      this.agentThreads.set(agentId, threadId);
      this.threadToAgent.set(threadId, agentId);
    }

    this.initialized = true;
  }

  // -------------------------------------------------------------------------
  // Incoming Message Handling (Req 38a.2, 38c.7, 38c.8)
  // -------------------------------------------------------------------------

  /**
   * Handle an incoming Telegram message.
   *
   * Identifies the linked SeraphimOS user, determines the target agent
   * from the thread, and creates a ChatMessage for processing.
   * Returns null if the user is not linked (unauthorized).
   *
   * Enforces Mishmar authorization: only linked accounts can interact.
   */
  async handleIncomingMessage(incoming: TelegramIncomingMessage): Promise<ChatMessage | null> {
    if (!this.initialized) {
      throw new Error('Telegram service not initialized. Call initialize() first.');
    }

    // Mishmar authorization: check account link (Req 38c.7, 38c.8)
    const linkedAccount = this.accountLinks.get(incoming.telegramUserId);
    if (!linkedAccount) {
      // Unauthorized: no linked account
      return null;
    }

    // Determine target agent from thread (Req 38a.2)
    const agentId = this.threadToAgent.get(incoming.threadId);
    if (!agentId) {
      // Message sent in an unrecognized thread
      return null;
    }

    // Create ChatMessage for the communication service
    const chatMessage = this.createChatMessage({
      agentId,
      userId: linkedAccount.seraphimUserId,
      sender: 'user',
      senderName: incoming.telegramUsername ?? `telegram-${incoming.telegramUserId}`,
      content: incoming.text,
      source: 'telegram',
      priority: 'normal',
    });

    return chatMessage;
  }

  // -------------------------------------------------------------------------
  // Send to Thread (Req 38a.3)
  // -------------------------------------------------------------------------

  /**
   * Send a message to an agent's Telegram thread.
   *
   * Stores the outgoing message for delivery. The actual Telegram API
   * call will be wired via a driver in a later task.
   *
   * @throws Error if the agent has no assigned thread
   */
  async sendToThread(agentId: string, message: string, metadata?: { source?: string }): Promise<void> {
    if (!this.initialized) {
      throw new Error('Telegram service not initialized. Call initialize() first.');
    }

    const threadId = this.agentThreads.get(agentId);
    if (!threadId) {
      throw new Error(`No thread assigned for agent: ${agentId}`);
    }

    this.outgoingMessages.push({
      agentId,
      threadId,
      message,
      metadata,
      timestamp: new Date(),
    });
  }

  // -------------------------------------------------------------------------
  // Account Linking (Req 38c.9)
  // -------------------------------------------------------------------------

  /**
   * Link a Telegram user to a SeraphimOS account.
   *
   * This establishes the authorization bridge between Telegram
   * and the SeraphimOS platform.
   */
  linkAccount(telegramUserId: number, seraphimUserId: string, telegramUsername?: string): void {
    const link: TelegramAccountLink = {
      telegramUserId,
      telegramUsername,
      seraphimUserId,
      linkedAt: new Date(),
    };
    this.accountLinks.set(telegramUserId, link);
  }

  /**
   * Get the linked SeraphimOS account for a Telegram user.
   * Returns undefined if no link exists.
   */
  getLinkedAccount(telegramUserId: number): TelegramAccountLink | undefined {
    return this.accountLinks.get(telegramUserId);
  }

  // -------------------------------------------------------------------------
  // Thread Management (Req 38a.1, 38a.2)
  // -------------------------------------------------------------------------

  /**
   * Get the Telegram thread ID for an agent.
   * Returns undefined if no thread is assigned.
   */
  getAgentThread(agentId: string): string | undefined {
    return this.agentThreads.get(agentId);
  }

  /**
   * Create/register a dedicated thread for an agent.
   *
   * In production, this would call the Telegram API to create a
   * forum topic. Here we register the mapping for routing.
   */
  createAgentThread(agentId: string, threadId: string): void {
    this.agentThreads.set(agentId, threadId);
    this.threadToAgent.set(threadId, agentId);
  }

  // -------------------------------------------------------------------------
  // Dashboard Synchronization (Req 38b.4, 38b.5, 38b.6)
  // -------------------------------------------------------------------------

  /**
   * Sync a Telegram message to the dashboard.
   *
   * Converts the incoming Telegram message to a ChatMessage with
   * "via Telegram" metadata indicator for display in the dashboard.
   * Designed for real-time sync within 3 seconds.
   */
  async syncToDashboard(incoming: TelegramIncomingMessage): Promise<ChatMessage> {
    const linkedAccount = this.accountLinks.get(incoming.telegramUserId);
    const agentId = this.threadToAgent.get(incoming.threadId);

    const chatMessage = this.createChatMessage({
      agentId: agentId ?? 'unknown',
      userId: linkedAccount?.seraphimUserId,
      sender: 'user',
      senderName: incoming.telegramUsername ?? `telegram-${incoming.telegramUserId}`,
      content: incoming.text,
      source: 'telegram',
      priority: 'normal',
      metadata: {
        actionsTriggered: ['via Telegram'],
      },
    });

    this.syncedToDashboard.push(chatMessage);
    return chatMessage;
  }

  /**
   * Sync a dashboard message to Telegram.
   *
   * Converts the dashboard ChatMessage to Telegram format with
   * "via Dashboard" indicator and stores for delivery.
   * Designed for real-time sync within 3 seconds.
   */
  async syncFromDashboard(message: ChatMessage): Promise<void> {
    const threadId = this.agentThreads.get(message.agentId);
    if (!threadId) {
      throw new Error(`No thread assigned for agent: ${message.agentId}`);
    }

    const content = `[via Dashboard] ${message.content}`;

    this.syncedToTelegram.push({
      threadId,
      content,
      source: 'dashboard',
      timestamp: new Date(),
    });
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  /**
   * Whether the service has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the current bot configuration.
   * Returns undefined if not initialized.
   */
  getConfig(): TelegramBotConfig | undefined {
    return this.config;
  }

  // -------------------------------------------------------------------------
  // Test Helpers (for verifying outgoing messages in tests)
  // -------------------------------------------------------------------------

  /** Get all outgoing messages (for testing). */
  getOutgoingMessages() {
    return [...this.outgoingMessages];
  }

  /** Get all messages synced to dashboard (for testing). */
  getSyncedToDashboard(): ChatMessage[] {
    return [...this.syncedToDashboard];
  }

  /** Get all messages synced to Telegram (for testing). */
  getSyncedToTelegram() {
    return [...this.syncedToTelegram];
  }

  // -------------------------------------------------------------------------
  // Private: Message Creation
  // -------------------------------------------------------------------------

  private createChatMessage(params: {
    agentId: string;
    userId?: string;
    sender: 'user' | 'agent';
    senderName: string;
    content: string;
    source: 'dashboard' | 'telegram' | 'api';
    priority: 'low' | 'normal' | 'high' | 'critical';
    metadata?: Partial<ChatMessage['metadata']>;
  }): ChatMessage {
    this.messageCounter++;

    return {
      id: `tg-msg-${this.messageCounter}-${Date.now()}`,
      agentId: params.agentId,
      userId: params.userId,
      sender: params.sender,
      senderName: params.senderName,
      content: params.content,
      timestamp: new Date(),
      source: params.source,
      priority: params.priority,
      metadata: params.metadata ?? {},
    };
  }
}
