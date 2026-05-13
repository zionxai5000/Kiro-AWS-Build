/**
 * Agent Communication module.
 *
 * Provides multi-user agent communication, message persistence,
 * chat history retrieval, active user tracking, priority queue,
 * cross-agent context sharing, agent presence tracking,
 * delegation visibility, and communication audit trail.
 */

export { AgentCommunicationServiceImpl } from './service.js';
export { MessagePriorityQueueImpl } from './priority-queue.js';
export { ContextSharingEngineImpl } from './context-sharing.js';
export { AgentPresenceServiceImpl } from './presence.js';
export { TelegramIntegrationServiceImpl } from './telegram.js';
export { NotificationRoutingEngineImpl } from './notification-router.js';
export { DelegationVisibilityServiceImpl } from './delegation-visibility.js';
export { CommunicationAuditServiceImpl } from './audit-trail.js';
export type {
  AgentCommunicationService,
  AgentMessageHandler,
  UserMessage,
  ChatMessage,
  ChatMessageMetadata,
  DelegationInfo,
  ContextShareEvent,
  ChatFilter,
  ActiveUser,
  Attachment,
  MessageResponse,
  MessagePriority,
  PriorityQueueConfig,
  QueuedMessage,
  CriticalInterruptionCallback,
  MessagePriorityQueue,
  HandoffMode,
  RelevanceResult,
  ContextSharingConfig,
  ContextSharingEngine,
  AgentPresenceStatus,
  AgentPresence,
  PresenceChangeCallback,
  AgentPresenceService,
  TelegramBotConfig,
  TelegramIncomingMessage,
  TelegramAccountLink,
  TelegramIntegrationService,
  NotificationRule,
  AgentNotification,
  NotificationAction,
  DeliveryResult,
  NotificationRoutingEngine,
  DelegationRecord,
  DelegationChangeCallback,
  DelegationVisibilityService,
  CommunicationAuditEntry,
  CommunicationAuditFilter,
  CommunicationPatterns,
  CommunicationAuditService,
} from './types.js';
