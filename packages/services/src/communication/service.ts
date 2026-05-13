/**
 * Agent Communication Service — Implementation
 *
 * Manages multi-user agent communication with message persistence,
 * priority-based routing, history retrieval, and active user tracking.
 *
 * Requirements: 37a.1, 37a.2, 37a.3, 37b.5, 37b.6, 37b.7
 */

import type {
  AgentCommunicationService,
  AgentMessageHandler,
  UserMessage,
  ChatMessage,
  ChatFilter,
  ActiveUser,
  MessageResponse,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Duration (ms) after which a user is considered inactive (30 minutes). */
const ACTIVE_USER_TIMEOUT_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * AgentCommunicationServiceImpl provides multi-user agent communication
 * with in-memory message storage, priority routing, and context management.
 *
 * Features:
 * - Message persistence per agent (Req 37a.1)
 * - Priority-based message processing (Req 37a.2)
 * - Multi-user context separation with unified agent view (Req 37a.3)
 * - Chat history retrieval and search (Req 37b.5, 37b.6)
 * - Active user tracking (Req 37b.7)
 */
export class AgentCommunicationServiceImpl implements AgentCommunicationService {
  /** In-memory message storage: agentId → ChatMessage[] */
  private readonly messages = new Map<string, ChatMessage[]>();

  /** Active user tracking: agentId → (userId → ActiveUser) */
  private readonly activeUsers = new Map<string, Map<string, ActiveUser>>();

  /** The registered message handler callback */
  private messageHandler: AgentMessageHandler | null = null;

  /** Counter for generating unique message IDs */
  private messageCounter = 0;

  // -------------------------------------------------------------------------
  // Message Handler Registration
  // -------------------------------------------------------------------------

  /**
   * Register the callback that processes user messages and produces agent responses.
   *
   * This handler will be invoked for every incoming message. In production,
   * it will be wired to the actual agent execution pipeline.
   */
  setMessageHandler(handler: AgentMessageHandler): void {
    this.messageHandler = handler;
  }

  // -------------------------------------------------------------------------
  // Send Message (Req 37a.1, 37a.2)
  // -------------------------------------------------------------------------

  /**
   * Send a user message to an agent.
   *
   * The message is persisted, routed through the priority queue,
   * processed by the registered handler, and the agent's response
   * is persisted and returned.
   *
   * @throws Error if no message handler is registered
   */
  async sendMessage(message: UserMessage): Promise<MessageResponse> {
    if (!this.messageHandler) {
      throw new Error('No message handler registered. Call setMessageHandler() first.');
    }

    const startTime = Date.now();

    // Persist the user message
    const userChatMessage = this.createChatMessage({
      agentId: message.agentId,
      userId: message.userId,
      sender: 'user',
      senderName: message.userId,
      content: message.content,
      source: message.source,
      priority: message.priority,
    });

    this.persistMessage(userChatMessage);

    // Update active user tracking
    this.trackActiveUser(message.agentId, message.userId);

    // Process through handler (priority-based routing)
    const responseContent = await this.messageHandler(message.agentId, message);

    const processingTime = Date.now() - startTime;

    // Persist the agent response
    const agentResponse = this.createChatMessage({
      agentId: message.agentId,
      userId: message.userId,
      sender: 'agent',
      senderName: message.agentId,
      content: responseContent,
      source: message.source,
      priority: message.priority,
      metadata: { responseTime: processingTime },
    });

    this.persistMessage(agentResponse);

    return {
      messageId: userChatMessage.id,
      agentResponse,
      processingTime,
    };
  }

  // -------------------------------------------------------------------------
  // History Retrieval (Req 37b.5, 37b.6)
  // -------------------------------------------------------------------------

  /**
   * Get chat history for an agent with optional filtering.
   *
   * When a userId filter is provided, only messages involving that user
   * are returned (maintaining per-user context separation).
   */
  async getHistory(agentId: string, filter?: ChatFilter): Promise<ChatMessage[]> {
    const allMessages = this.messages.get(agentId) ?? [];
    let filtered = this.applyFilter(allMessages, filter);

    // Apply pagination
    if (filter?.offset !== undefined) {
      filtered = filtered.slice(filter.offset);
    }
    if (filter?.limit !== undefined) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  /**
   * Search chat history by keyword for an agent.
   *
   * Performs case-insensitive substring matching across message content.
   */
  async searchHistory(agentId: string, query: string): Promise<ChatMessage[]> {
    const allMessages = this.messages.get(agentId) ?? [];
    const lowerQuery = query.toLowerCase();

    return allMessages.filter((msg) =>
      msg.content.toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * Get unified history across all users for an agent (Req 37a.3).
   *
   * Returns all messages for the agent regardless of user, sorted
   * chronologically. This provides the agent with a complete view
   * of all conversations while users see only their own context.
   */
  async getUnifiedHistory(agentId: string, filter?: ChatFilter): Promise<ChatMessage[]> {
    const allMessages = this.messages.get(agentId) ?? [];

    // Apply filters except userId (unified means all users)
    let filtered = allMessages;

    if (filter?.timeRange) {
      filtered = filtered.filter(
        (msg) =>
          msg.timestamp >= filter.timeRange!.start &&
          msg.timestamp <= filter.timeRange!.end,
      );
    }
    if (filter?.priority) {
      filtered = filtered.filter((msg) => msg.priority === filter.priority);
    }
    if (filter?.source) {
      filtered = filtered.filter((msg) => msg.source === filter.source);
    }

    // Sort chronologically
    filtered = [...filtered].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    // Apply pagination
    if (filter?.offset !== undefined) {
      filtered = filtered.slice(filter.offset);
    }
    if (filter?.limit !== undefined) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  // -------------------------------------------------------------------------
  // Active Users (Req 37b.7)
  // -------------------------------------------------------------------------

  /**
   * Get currently active users chatting with an agent.
   *
   * A user is considered active if they sent a message within the
   * last 30 minutes.
   */
  async getActiveUsers(agentId: string): Promise<ActiveUser[]> {
    const agentUsers = this.activeUsers.get(agentId);
    if (!agentUsers) {
      return [];
    }

    const now = Date.now();
    const activeList: ActiveUser[] = [];

    for (const [userId, user] of agentUsers) {
      if (now - user.lastActivity.getTime() <= ACTIVE_USER_TIMEOUT_MS) {
        activeList.push(user);
      } else {
        // Clean up stale entries
        agentUsers.delete(userId);
      }
    }

    return activeList;
  }

  // -------------------------------------------------------------------------
  // Internal: Message Creation & Persistence
  // -------------------------------------------------------------------------

  /**
   * Create a ChatMessage with a unique ID and current timestamp.
   */
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
      id: `msg-${this.messageCounter}-${Date.now()}`,
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

  /**
   * Persist a message to the in-memory store.
   */
  private persistMessage(message: ChatMessage): void {
    let agentMessages = this.messages.get(message.agentId);
    if (!agentMessages) {
      agentMessages = [];
      this.messages.set(message.agentId, agentMessages);
    }
    agentMessages.push(message);
  }

  // -------------------------------------------------------------------------
  // Internal: Active User Tracking
  // -------------------------------------------------------------------------

  /**
   * Track or update a user's activity for an agent.
   */
  private trackActiveUser(agentId: string, userId: string): void {
    let agentUsers = this.activeUsers.get(agentId);
    if (!agentUsers) {
      agentUsers = new Map();
      this.activeUsers.set(agentId, agentUsers);
    }

    const existing = agentUsers.get(userId);
    if (existing) {
      existing.lastActivity = new Date();
      existing.messageCount++;
    } else {
      agentUsers.set(userId, {
        userId,
        userName: userId,
        lastActivity: new Date(),
        messageCount: 1,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Filtering
  // -------------------------------------------------------------------------

  /**
   * Apply ChatFilter criteria to a list of messages.
   */
  private applyFilter(messages: ChatMessage[], filter?: ChatFilter): ChatMessage[] {
    if (!filter) {
      return messages;
    }

    let result = messages;

    if (filter.userId) {
      result = result.filter((msg) => msg.userId === filter.userId);
    }
    if (filter.timeRange) {
      result = result.filter(
        (msg) =>
          msg.timestamp >= filter.timeRange!.start &&
          msg.timestamp <= filter.timeRange!.end,
      );
    }
    if (filter.priority) {
      result = result.filter((msg) => msg.priority === filter.priority);
    }
    if (filter.source) {
      result = result.filter((msg) => msg.source === filter.source);
    }

    return result;
  }
}
