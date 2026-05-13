/**
 * Chat Components — Barrel Export
 *
 * Dashboard chat UI components for agent communication.
 *
 * Requirements: 37a.1, 37a.4, 37b.6, 37c.10, 37e.15, 39.1, 41.5
 */

export { AgentChatPanel } from './AgentChatPanel.js';
export type { ChatMessageData, AgentChatPanelOptions } from './AgentChatPanel.js';

export { ChatMessage } from './ChatMessage.js';
export type { ChatMessageProps } from './ChatMessage.js';

export { PresenceIndicator } from './PresenceIndicator.js';
export type { AgentPresenceStatus, PresenceIndicatorProps } from './PresenceIndicator.js';

export { AgentMentionInput } from './AgentMentionInput.js';
export type { AgentInfo, AgentMentionInputOptions } from './AgentMentionInput.js';

export { PrioritySelector } from './PrioritySelector.js';
export type { MessagePriority, PrioritySelectorOptions } from './PrioritySelector.js';

export { NotificationPreferences } from './NotificationPreferences.js';
export type { NotificationRuleConfig, NotificationPreferencesOptions } from './NotificationPreferences.js';
