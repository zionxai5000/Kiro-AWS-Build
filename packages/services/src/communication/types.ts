/**
 * Agent Communication Service — Type Definitions
 *
 * Types for multi-user agent communication, chat history,
 * message routing, context management, and priority queue.
 *
 * Requirements: 37a.1, 37a.2, 37a.3, 37b.5, 37b.6, 37b.7, 37b.8, 39.1, 39.2, 39.3, 39.4
 */

// ---------------------------------------------------------------------------
// Message Types
// ---------------------------------------------------------------------------

/** A message sent by a user to an agent. */
export interface UserMessage {
  /** ID of the user sending the message */
  userId: string;
  /** ID of the target agent */
  agentId: string;
  /** Message content */
  content: string;
  /** Message priority level */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Source channel of the message */
  source: 'dashboard' | 'telegram' | 'api';
  /** Optional file/image/link attachments */
  attachments?: Attachment[];
  /** Other agents tagged in this message */
  taggedAgents?: string[];
  /** ID of the message being replied to */
  replyTo?: string;
}

/** A persisted chat message (user or agent). */
export interface ChatMessage {
  /** Unique message ID */
  id: string;
  /** Agent this message belongs to */
  agentId: string;
  /** User ID (present for user messages and agent responses to users) */
  userId?: string;
  /** Whether the sender is a user or agent */
  sender: 'user' | 'agent';
  /** Display name of the sender */
  senderName: string;
  /** Message content */
  content: string;
  /** When the message was created */
  timestamp: Date;
  /** Source channel */
  source: 'dashboard' | 'telegram' | 'api';
  /** Priority level */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Additional metadata about the message */
  metadata: ChatMessageMetadata;
}

// ---------------------------------------------------------------------------
// Metadata Types
// ---------------------------------------------------------------------------

/** Metadata attached to a chat message. */
export interface ChatMessageMetadata {
  /** Time taken to generate the response (ms) */
  responseTime?: number;
  /** Delegations triggered by this message */
  delegations?: DelegationInfo[];
  /** Context sharing events triggered */
  contextShared?: ContextShareEvent[];
  /** Actions triggered by the message */
  actionsTriggered?: string[];
}

/** Information about a task delegation. */
export interface DelegationInfo {
  /** Agent the task was delegated to */
  delegatedTo: string;
  /** Description of the delegated task */
  taskDescription: string;
  /** Current status of the delegation */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** When the delegation started */
  startedAt: Date;
  /** When the delegation completed */
  completedAt?: Date;
  /** Result of the delegation */
  result?: string;
}

/** A context sharing event between agents. */
export interface ContextShareEvent {
  /** Unique event ID */
  id: string;
  /** Agent sharing the context */
  fromAgentId: string;
  /** Agent receiving the context */
  toAgentId: string;
  /** Message that triggered the share */
  messageId: string;
  /** Reason for sharing */
  reason: 'auto_detected' | 'explicit_tag' | 'handoff';
  /** How relevant the shared content is (0-1) */
  relevanceScore: number;
  /** The content being shared */
  sharedContent: string;
  /** When the share occurred */
  timestamp: Date;
  /** Whether the receiving agent acknowledged the share */
  acknowledged: boolean;
}

// ---------------------------------------------------------------------------
// Filter & Query Types
// ---------------------------------------------------------------------------

/** Filter options for retrieving chat history. */
export interface ChatFilter {
  /** Filter by user ID */
  userId?: string;
  /** Filter by time range */
  timeRange?: { start: Date; end: Date };
  /** Filter by priority */
  priority?: 'low' | 'normal' | 'high' | 'critical';
  /** Filter by source channel */
  source?: 'dashboard' | 'telegram' | 'api';
  /** Maximum number of messages to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ---------------------------------------------------------------------------
// Active User Tracking
// ---------------------------------------------------------------------------

/** Represents a user currently active in a conversation with an agent. */
export interface ActiveUser {
  /** User ID */
  userId: string;
  /** Display name */
  userName: string;
  /** When the user last sent a message */
  lastActivity: Date;
  /** Total messages sent in the current session */
  messageCount: number;
}

// ---------------------------------------------------------------------------
// Attachment & Response Types
// ---------------------------------------------------------------------------

/** A file, image, or link attachment on a message. */
export interface Attachment {
  /** Type of attachment */
  type: 'file' | 'image' | 'link';
  /** URL to the attachment */
  url: string;
  /** Display name */
  name: string;
  /** File size in bytes */
  size?: number;
}

/** Response returned after sending a message. */
export interface MessageResponse {
  /** ID of the persisted user message */
  messageId: string;
  /** The agent's response message */
  agentResponse: ChatMessage;
  /** Total processing time in milliseconds */
  processingTime: number;
}

// ---------------------------------------------------------------------------
// Context Sharing Types (Req 37c.9, 37c.10, 37c.11, 37c.12, 37d.13, 37d.14)
// ---------------------------------------------------------------------------

/** Handoff mode for context sharing between agents. */
export type HandoffMode = 'automatic' | 'on_request' | 'manual';

/** Result of relevance analysis for a specific agent. */
export interface RelevanceResult {
  /** Target agent ID */
  agentId: string;
  /** Computed relevance score (0-1) */
  relevanceScore: number;
  /** Reason for the relevance determination */
  reason: string;
  /** Suggested action based on relevance score */
  suggestedAction: 'share_full' | 'share_summary' | 'no_action';
}

/** Configuration for the context sharing engine. */
export interface ContextSharingConfig {
  /** Minimum relevance score to trigger auto-sharing (default: 0.7) */
  relevanceThreshold?: number;
  /** Known agent IDs and their domain keywords for relevance matching */
  agentDomains?: Map<string, string[]>;
  /** Per-user handoff mode configuration */
  userHandoffModes?: Map<string, HandoffMode>;
}

/** Interface for the context sharing engine. */
export interface ContextSharingEngine {
  /** Analyze relevance of a message to a set of agents. */
  analyzeRelevance(message: ChatMessage, agents: string[]): Promise<RelevanceResult[]>;
  /** Propagate context to target agents, creating share events. */
  propagateContext(message: ChatMessage, targetAgents: string[], reason: 'auto_detected' | 'explicit_tag'): Promise<ContextShareEvent[]>;
  /** Parse @agent_name mentions from message content. */
  parseAgentMentions(content: string): string[];
  /** Generate a handoff summary when switching agents. */
  generateHandoffSummary(userId: string, fromAgentId: string, toAgentId: string, recentMessages: ChatMessage[]): Promise<string>;
  /** Set the handoff mode for a user. */
  setHandoffMode(userId: string, mode: HandoffMode): void;
  /** Get the handoff mode for a user. */
  getHandoffMode(userId: string): HandoffMode;
  /** Get all context share events for an agent. */
  getShareLog(agentId: string): ContextShareEvent[];
  /** Update engine configuration. */
  configure(config: ContextSharingConfig): void;
}

// ---------------------------------------------------------------------------
// Handler & Service Interface
// ---------------------------------------------------------------------------

/** Callback that processes a user message and returns the agent's response text. */
export type AgentMessageHandler = (agentId: string, message: UserMessage) => Promise<string>;

/**
 * Service interface for agent communication.
 *
 * Manages multi-user conversations with agents, message persistence,
 * history retrieval, and active user tracking.
 */
export interface AgentCommunicationService {
  /** Send a message to an agent and receive a response. */
  sendMessage(message: UserMessage): Promise<MessageResponse>;
  /** Get chat history for an agent with optional filtering. */
  getHistory(agentId: string, filter?: ChatFilter): Promise<ChatMessage[]>;
  /** Search chat history by keyword for an agent. */
  searchHistory(agentId: string, query: string): Promise<ChatMessage[]>;
  /** Get unified history across all users for an agent (chronological). */
  getUnifiedHistory(agentId: string, filter?: ChatFilter): Promise<ChatMessage[]>;
  /** Get currently active users chatting with an agent. */
  getActiveUsers(agentId: string): Promise<ActiveUser[]>;
  /** Register the message handler callback for processing messages. */
  setMessageHandler(handler: AgentMessageHandler): void;
}

// ---------------------------------------------------------------------------
// Priority Queue Types (Req 37b.8, 39.1, 39.2, 39.3, 39.4)
// ---------------------------------------------------------------------------

/** Priority levels for message processing. */
export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

/** Configuration for the message priority queue. */
export interface PriorityQueueConfig {
  /** User IDs whose messages are auto-elevated (e.g., King) */
  autoElevateUsers?: Map<string, MessagePriority>;
  /** Maximum messages per user per minute (rate limiting) */
  maxMessagesPerMinute?: number;
  /** Whether to enable critical message interruption */
  enableInterruption?: boolean;
}

/** A message wrapped with queue metadata. */
export interface QueuedMessage {
  /** The original user message */
  message: UserMessage;
  /** When the message was added to the queue */
  enqueuedAt: Date;
  /** The effective priority after auto-elevation rules */
  effectivePriority: MessagePriority;
  /** Position in the queue at time of enqueue */
  position: number;
}

/** Callback invoked when a critical message arrives and interruption is enabled. */
export type CriticalInterruptionCallback = (message: QueuedMessage) => void;

// ---------------------------------------------------------------------------
// Agent Presence Types (Req 37e.15, 37e.16)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Telegram Integration Types (Req 38a.1, 38a.2, 38a.3, 38c.7, 38c.8, 38c.9)
// ---------------------------------------------------------------------------

/** Configuration for the Telegram bot integration. */
export interface TelegramBotConfig {
  /** Bot API token (retrieved from Secrets Manager) */
  botToken: string;
  /** Group chat ID where agent threads live */
  groupChatId: string;
  /** Mapping of agentId → Telegram thread/topic ID */
  agentThreadIds: Record<string, string>;
  /** Optional webhook URL for receiving updates */
  webhookUrl?: string;
}

/** An incoming message from Telegram. */
export interface TelegramIncomingMessage {
  /** Telegram user ID of the sender */
  telegramUserId: number;
  /** Telegram username (if available) */
  telegramUsername?: string;
  /** Thread/topic ID the message was sent in */
  threadId: string;
  /** Message text content */
  text: string;
  /** When the message was sent */
  timestamp: Date;
}

/** A link between a Telegram user and a SeraphimOS user account. */
export interface TelegramAccountLink {
  /** Telegram user ID */
  telegramUserId: number;
  /** Telegram username (if available) */
  telegramUsername?: string;
  /** SeraphimOS user ID */
  seraphimUserId: string;
  /** When the link was established */
  linkedAt: Date;
}

/** Interface for the Telegram integration service. */
export interface TelegramIntegrationService {
  /** Initialize the bot with configuration. */
  initialize(config: TelegramBotConfig): Promise<void>;
  /** Handle an incoming Telegram message, routing to the correct agent. */
  handleIncomingMessage(incoming: TelegramIncomingMessage): Promise<ChatMessage | null>;
  /** Send a message to an agent's Telegram thread. */
  sendToThread(agentId: string, message: string, metadata?: { source?: string }): Promise<void>;
  /** Link a Telegram user to a SeraphimOS account. */
  linkAccount(telegramUserId: number, seraphimUserId: string, telegramUsername?: string): void;
  /** Get the linked SeraphimOS account for a Telegram user. */
  getLinkedAccount(telegramUserId: number): TelegramAccountLink | undefined;
  /** Get the Telegram thread ID for an agent. */
  getAgentThread(agentId: string): string | undefined;
  /** Create/register a thread for an agent. */
  createAgentThread(agentId: string, threadId: string): void;
  /** Sync a Telegram message to the dashboard (adds "via Telegram" indicator). */
  syncToDashboard(incoming: TelegramIncomingMessage): Promise<ChatMessage>;
  /** Sync a dashboard message to Telegram (adds "via Dashboard" indicator). */
  syncFromDashboard(message: ChatMessage): Promise<void>;
  /** Whether the service has been initialized. */
  isInitialized(): boolean;
  /** Get the current bot configuration. */
  getConfig(): TelegramBotConfig | undefined;
}

// ---------------------------------------------------------------------------
// Agent Presence Types (Req 37e.15, 37e.16)
// ---------------------------------------------------------------------------

/** Possible presence statuses for an agent. */
export type AgentPresenceStatus = 'idle' | 'working' | 'waiting_input' | 'thinking' | 'parallel_processing' | 'degraded';

/** Real-time presence information for an agent. */
export interface AgentPresence {
  agentId: string;
  status: AgentPresenceStatus;
  currentTask?: string;
  parallelTaskCount?: number;
  lastActivity: Date;
  queueDepth: number;
}

/** Callback invoked when an agent's presence changes. */
export type PresenceChangeCallback = (presence: AgentPresence) => void;

/** Interface for the agent presence tracking service. */
export interface AgentPresenceService {
  /** Update an agent's presence status with optional details. */
  updatePresence(agentId: string, status: AgentPresenceStatus, details?: { currentTask?: string; parallelTaskCount?: number }): void;
  /** Get the current presence for a specific agent. */
  getPresence(agentId: string): AgentPresence | undefined;
  /** Get all tracked agent presences. */
  getAllPresences(): AgentPresence[];
  /** Update the message queue depth for an agent. */
  setQueueDepth(agentId: string, depth: number): void;
  /** Subscribe to presence change events. Returns a subscription ID. */
  onPresenceChange(callback: PresenceChangeCallback): string;
  /** Unsubscribe from presence change events. */
  offPresenceChange(subscriptionId: string): void;
}

// ---------------------------------------------------------------------------
// Priority Queue Types (Req 37b.8, 39.1, 39.2, 39.3, 39.4)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Notification Routing Types (Req 41.1, 41.2, 41.3, 41.4, 38d.10, 38d.11, 38d.12)
// ---------------------------------------------------------------------------

/** A notification routing rule defining conditions and target channels. */
export interface NotificationRule {
  /** Unique rule ID */
  id: string;
  /** User this rule belongs to */
  userId: string;
  /** Conditions that must be met for this rule to apply */
  conditions: {
    /** Only match notifications from these agent IDs */
    agentIds?: string[];
    /** Only match notifications at or above this priority level */
    priorityMin?: 'low' | 'normal' | 'high' | 'critical';
    /** Only match these notification types */
    notificationType?: string[];
    /** Suppress notifications outside this time window (quiet hours) */
    timeWindow?: { start: string; end: string; timezone: string };
  };
  /** Channels to deliver matching notifications to */
  channels: ('dashboard' | 'telegram' | 'email' | 'imessage')[];
  /** Optional escalation configuration */
  escalation?: {
    /** Seconds before escalation triggers */
    timeout: number;
    /** Channel to escalate to */
    escalateToChannel: string;
  };
}

/** A notification generated by an agent. */
export interface AgentNotification {
  /** Unique notification ID */
  id: string;
  /** Agent that generated the notification */
  agentId: string;
  /** User the notification is for */
  userId: string;
  /** Type of notification */
  type: 'task_complete' | 'needs_input' | 'alert' | 'delegation_complete' | 'recommendation';
  /** Priority level */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Short title */
  title: string;
  /** Full notification body */
  body: string;
  /** Whether the notification requires user action */
  actionable: boolean;
  /** Available actions the user can take */
  actions?: NotificationAction[];
  /** When the notification was created */
  timestamp: Date;
}

/** An action a user can take on a notification. */
export interface NotificationAction {
  /** Display label */
  label: string;
  /** Action type */
  type: 'approve' | 'reject' | 'acknowledge' | 'custom';
  /** Action payload */
  payload: Record<string, unknown>;
}

/** Result of delivering a notification to a channel. */
export interface DeliveryResult {
  /** Notification that was delivered */
  notificationId: string;
  /** Channel it was delivered to */
  channel: string;
  /** Delivery status */
  status: 'delivered' | 'failed';
  /** When it was delivered */
  deliveredAt?: Date;
  /** Error message if delivery failed */
  error?: string;
}

/** Interface for the notification routing engine. */
export interface NotificationRoutingEngine {
  /** Set routing rules for a user. */
  setRules(userId: string, rules: NotificationRule[]): void;
  /** Get routing rules for a user. */
  getRules(userId: string): NotificationRule[];
  /** Route a notification to all matching channels based on rules. */
  route(notification: AgentNotification): Promise<DeliveryResult[]>;
  /** Mark a notification as acknowledged (deduplicates across channels). */
  acknowledge(notificationId: string, channel: string): void;
  /** Check if a notification has been acknowledged. */
  isAcknowledged(notificationId: string): boolean;
  /** Check if a notification needs escalation (unacknowledged past timeout). */
  checkEscalation(notificationId: string): boolean;
  /** Escalate a notification to the configured escalation channel. */
  escalate(notificationId: string): Promise<DeliveryResult | null>;
  /** Get all unacknowledged notifications for a user. */
  getUnacknowledged(userId: string): AgentNotification[];
}

// ---------------------------------------------------------------------------
// Delegation Visibility Types (Req 40.1, 40.2, 40.3, 40.4)
// ---------------------------------------------------------------------------

/** A record of an agent-to-agent delegation during message processing. */
export interface DelegationRecord {
  /** Unique delegation ID */
  id: string;
  /** ID of the message that triggered the delegation */
  parentMessageId: string;
  /** Agent that delegated the work */
  fromAgentId: string;
  /** Agent that received the delegation */
  toAgentId: string;
  /** Description of the delegated task */
  taskDescription: string;
  /** Current status of the delegation */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** When the delegation was created */
  startedAt: Date;
  /** When the delegation completed */
  completedAt?: Date;
  /** Result of the delegation */
  result?: string;
  /** Whether this delegation is part of a parallel group */
  isParallel: boolean;
  /** Group ID for parallel delegations */
  parallelGroupId?: string;
}

/** Callback invoked when a delegation record changes. */
export type DelegationChangeCallback = (delegation: DelegationRecord) => void;

/** Interface for the delegation visibility service. */
export interface DelegationVisibilityService {
  /** Record a new delegation. Returns the created record with generated ID and timestamp. */
  recordDelegation(delegation: Omit<DelegationRecord, 'id' | 'startedAt'>): DelegationRecord;
  /** Update the status of an existing delegation. */
  updateStatus(delegationId: string, status: DelegationRecord['status'], result?: string): void;
  /** Get all delegations triggered by a specific message. */
  getDelegationsForMessage(messageId: string): DelegationRecord[];
  /** Get all active (pending or in_progress) delegations for an agent. */
  getActiveDelegations(agentId: string): DelegationRecord[];
  /** Get all delegations in a parallel group. */
  getParallelGroup(groupId: string): DelegationRecord[];
  /** Subscribe to delegation change events. Returns a subscription ID. */
  onDelegationChange(callback: DelegationChangeCallback): string;
  /** Unsubscribe from delegation change events. */
  offDelegationChange(subscriptionId: string): void;
}

// ---------------------------------------------------------------------------
// Communication Audit Trail Types (Req 37f.17, 37f.18)
// ---------------------------------------------------------------------------

/** An audit entry for a human-agent communication. */
export interface CommunicationAuditEntry {
  /** Unique entry ID */
  id: string;
  /** User involved in the communication */
  userId: string;
  /** Agent involved in the communication */
  agentId: string;
  /** Message content */
  messageContent: string;
  /** Direction of the message */
  direction: 'user_to_agent' | 'agent_to_user';
  /** When the communication occurred */
  timestamp: Date;
  /** Response time in milliseconds (for agent responses) */
  responseTime?: number;
  /** Actions triggered by this communication */
  actionsTriggered: string[];
  /** Source channel */
  source: 'dashboard' | 'telegram' | 'api';
  /** Priority level */
  priority: 'low' | 'normal' | 'high' | 'critical';
}

/** Filter options for querying communication audit entries. */
export interface CommunicationAuditFilter {
  /** Filter by user ID */
  userId?: string;
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by time range */
  timeRange?: { start: Date; end: Date };
  /** Filter by direction */
  direction?: 'user_to_agent' | 'agent_to_user';
  /** Filter by source channel */
  source?: 'dashboard' | 'telegram' | 'api';
}

/** Aggregated communication pattern metrics. */
export interface CommunicationPatterns {
  /** Average response time in milliseconds */
  averageResponseTime: number;
  /** Total number of messages matching the filter */
  totalMessages: number;
  /** Message count grouped by priority */
  messagesByPriority: Record<string, number>;
  /** Message count grouped by source channel */
  messagesBySource: Record<string, number>;
  /** Message count grouped by agent */
  messagesByAgent: Record<string, number>;
}

/** Interface for the communication audit trail service. */
export interface CommunicationAuditService {
  /** Record a communication event. Returns the created entry with generated ID. */
  recordCommunication(entry: Omit<CommunicationAuditEntry, 'id'>): CommunicationAuditEntry;
  /** Retrieve full conversation history between a user and agent for a time period. */
  getConversationReplay(userId: string, agentId: string, timeRange: { start: Date; end: Date }): CommunicationAuditEntry[];
  /** Query aggregated communication patterns based on filter criteria. */
  queryPatterns(filter: CommunicationAuditFilter): CommunicationPatterns;
  /** Get raw audit entries matching a filter. */
  getEntries(filter: CommunicationAuditFilter): CommunicationAuditEntry[];
}

/** Interface for the priority-based message processing queue. */
export interface MessagePriorityQueue {
  /** Add a message to the queue, applying auto-elevation and rate limiting. */
  enqueue(message: UserMessage): QueuedMessage;
  /** Remove and return the highest-priority message (FIFO within same level). */
  dequeue(): QueuedMessage | null;
  /** Return the next message without removing it. */
  peek(): QueuedMessage | null;
  /** Total number of messages in the queue. */
  size(): number;
  /** Number of messages per priority level. */
  sizeByPriority(): Record<MessagePriority, number>;
  /** Check if a user is currently rate-limited. */
  isRateLimited(userId: string): boolean;
  /** Update queue configuration. */
  configure(config: PriorityQueueConfig): void;
  /** Check if any critical messages are waiting. */
  hasCritical(): boolean;
  /** Remove all messages from the queue. */
  clear(): void;
  /** Register a callback for critical message interruption. */
  onCriticalMessage(callback: CriticalInterruptionCallback): void;
}
