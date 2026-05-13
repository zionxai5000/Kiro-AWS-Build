/**
 * Telegram Integration Service — Unit Tests
 *
 * Tests for bot initialization, per-agent thread management, message routing,
 * account linking, Mishmar authorization, and bidirectional dashboard sync.
 *
 * Requirements: 38a.1, 38a.2, 38a.3, 38b.4, 38b.5, 38b.6, 38c.7, 38c.8, 38c.9
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TelegramIntegrationServiceImpl } from './telegram.js';
import type {
  TelegramBotConfig,
  TelegramIncomingMessage,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfig(overrides?: Partial<TelegramBotConfig>): TelegramBotConfig {
  return {
    botToken: 'test-bot-token-123',
    groupChatId: '-1001234567890',
    agentThreadIds: {
      'agent-alpha': 'thread-100',
      'agent-beta': 'thread-200',
    },
    ...overrides,
  };
}

function createIncomingMessage(overrides?: Partial<TelegramIncomingMessage>): TelegramIncomingMessage {
  return {
    telegramUserId: 42,
    telegramUsername: 'testuser',
    threadId: 'thread-100',
    text: 'Hello agent!',
    timestamp: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TelegramIntegrationServiceImpl', () => {
  let service: TelegramIntegrationServiceImpl;

  beforeEach(() => {
    service = new TelegramIntegrationServiceImpl();
  });

  // -------------------------------------------------------------------------
  // Bot Initialization (Req 38a.1)
  // -------------------------------------------------------------------------

  describe('initialize', () => {
    it('initializes the bot with valid configuration', async () => {
      const config = createConfig();
      await service.initialize(config);

      expect(service.isInitialized()).toBe(true);
      expect(service.getConfig()).toEqual(config);
    });

    it('sets up agent thread mappings from config', async () => {
      const config = createConfig();
      await service.initialize(config);

      expect(service.getAgentThread('agent-alpha')).toBe('thread-100');
      expect(service.getAgentThread('agent-beta')).toBe('thread-200');
    });

    it('throws if bot token is missing', async () => {
      const config = createConfig({ botToken: '' });
      await expect(service.initialize(config)).rejects.toThrow('Bot token is required');
    });

    it('throws if group chat ID is missing', async () => {
      const config = createConfig({ groupChatId: '' });
      await expect(service.initialize(config)).rejects.toThrow('Group chat ID is required');
    });

    it('reports not initialized before initialize is called', () => {
      expect(service.isInitialized()).toBe(false);
      expect(service.getConfig()).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Thread Management (Req 38a.1, 38a.2)
  // -------------------------------------------------------------------------

  describe('thread management', () => {
    beforeEach(async () => {
      await service.initialize(createConfig());
    });

    it('creates a new agent thread', () => {
      service.createAgentThread('agent-gamma', 'thread-300');

      expect(service.getAgentThread('agent-gamma')).toBe('thread-300');
    });

    it('returns undefined for unknown agent thread', () => {
      expect(service.getAgentThread('nonexistent')).toBeUndefined();
    });

    it('overwrites existing thread mapping', () => {
      service.createAgentThread('agent-alpha', 'thread-999');

      expect(service.getAgentThread('agent-alpha')).toBe('thread-999');
    });

    it('supports multiple agents with distinct threads', async () => {
      const config = createConfig({
        agentThreadIds: {
          'agent-1': 'thread-1',
          'agent-2': 'thread-2',
          'agent-3': 'thread-3',
        },
      });
      const svc = new TelegramIntegrationServiceImpl();
      await svc.initialize(config);

      expect(svc.getAgentThread('agent-1')).toBe('thread-1');
      expect(svc.getAgentThread('agent-2')).toBe('thread-2');
      expect(svc.getAgentThread('agent-3')).toBe('thread-3');
    });
  });

  // -------------------------------------------------------------------------
  // Incoming Message Routing (Req 38a.2, 38c.7, 38c.8)
  // -------------------------------------------------------------------------

  describe('handleIncomingMessage', () => {
    beforeEach(async () => {
      await service.initialize(createConfig());
      service.linkAccount(42, 'user-seraphim-1', 'testuser');
    });

    it('routes message to correct agent based on thread', async () => {
      const incoming = createIncomingMessage({ threadId: 'thread-100' });
      const result = await service.handleIncomingMessage(incoming);

      expect(result).not.toBeNull();
      expect(result!.agentId).toBe('agent-alpha');
    });

    it('routes message to different agent for different thread', async () => {
      const incoming = createIncomingMessage({ threadId: 'thread-200' });
      const result = await service.handleIncomingMessage(incoming);

      expect(result).not.toBeNull();
      expect(result!.agentId).toBe('agent-beta');
    });

    it('creates ChatMessage with correct user ID from linked account', async () => {
      const incoming = createIncomingMessage();
      const result = await service.handleIncomingMessage(incoming);

      expect(result!.userId).toBe('user-seraphim-1');
    });

    it('creates ChatMessage with telegram source', async () => {
      const incoming = createIncomingMessage();
      const result = await service.handleIncomingMessage(incoming);

      expect(result!.source).toBe('telegram');
    });

    it('creates ChatMessage with message content', async () => {
      const incoming = createIncomingMessage({ text: 'Execute trade' });
      const result = await service.handleIncomingMessage(incoming);

      expect(result!.content).toBe('Execute trade');
    });

    it('uses telegram username as sender name', async () => {
      const incoming = createIncomingMessage({ telegramUsername: 'kinguser' });
      const result = await service.handleIncomingMessage(incoming);

      expect(result!.senderName).toBe('kinguser');
    });

    it('uses fallback sender name when username is not available', async () => {
      const incoming = createIncomingMessage({ telegramUsername: undefined });
      const result = await service.handleIncomingMessage(incoming);

      expect(result!.senderName).toBe('telegram-42');
    });

    it('returns null for unauthorized users (no linked account)', async () => {
      const incoming = createIncomingMessage({ telegramUserId: 999 });
      const result = await service.handleIncomingMessage(incoming);

      expect(result).toBeNull();
    });

    it('returns null for messages in unrecognized threads', async () => {
      const incoming = createIncomingMessage({ threadId: 'unknown-thread' });
      const result = await service.handleIncomingMessage(incoming);

      expect(result).toBeNull();
    });

    it('throws if service is not initialized', async () => {
      const uninitService = new TelegramIntegrationServiceImpl();
      const incoming = createIncomingMessage();

      await expect(uninitService.handleIncomingMessage(incoming)).rejects.toThrow(
        'Telegram service not initialized',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Send to Thread (Req 38a.3)
  // -------------------------------------------------------------------------

  describe('sendToThread', () => {
    beforeEach(async () => {
      await service.initialize(createConfig());
    });

    it('sends message to the correct agent thread', async () => {
      await service.sendToThread('agent-alpha', 'Task completed successfully');

      const outgoing = service.getOutgoingMessages();
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0].agentId).toBe('agent-alpha');
      expect(outgoing[0].threadId).toBe('thread-100');
      expect(outgoing[0].message).toBe('Task completed successfully');
    });

    it('includes metadata in outgoing message', async () => {
      await service.sendToThread('agent-beta', 'Response', { source: 'dashboard' });

      const outgoing = service.getOutgoingMessages();
      expect(outgoing[0].metadata).toEqual({ source: 'dashboard' });
    });

    it('throws for agent with no assigned thread', async () => {
      await expect(
        service.sendToThread('nonexistent-agent', 'Hello'),
      ).rejects.toThrow('No thread assigned for agent: nonexistent-agent');
    });

    it('throws if service is not initialized', async () => {
      const uninitService = new TelegramIntegrationServiceImpl();

      await expect(
        uninitService.sendToThread('agent-alpha', 'Hello'),
      ).rejects.toThrow('Telegram service not initialized');
    });

    it('delivers to correct thread for each agent', async () => {
      await service.sendToThread('agent-alpha', 'Message A');
      await service.sendToThread('agent-beta', 'Message B');

      const outgoing = service.getOutgoingMessages();
      expect(outgoing).toHaveLength(2);
      expect(outgoing[0].threadId).toBe('thread-100');
      expect(outgoing[1].threadId).toBe('thread-200');
    });
  });

  // -------------------------------------------------------------------------
  // Account Linking (Req 38c.9)
  // -------------------------------------------------------------------------

  describe('account linking', () => {
    it('links a Telegram user to a SeraphimOS account', () => {
      service.linkAccount(42, 'user-1', 'testuser');

      const link = service.getLinkedAccount(42);
      expect(link).toBeDefined();
      expect(link!.telegramUserId).toBe(42);
      expect(link!.seraphimUserId).toBe('user-1');
      expect(link!.telegramUsername).toBe('testuser');
    });

    it('stores linkedAt timestamp', () => {
      const before = new Date();
      service.linkAccount(42, 'user-1');
      const after = new Date();

      const link = service.getLinkedAccount(42);
      expect(link!.linkedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(link!.linkedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('links without username', () => {
      service.linkAccount(42, 'user-1');

      const link = service.getLinkedAccount(42);
      expect(link!.telegramUsername).toBeUndefined();
    });

    it('returns undefined for unlinked user', () => {
      expect(service.getLinkedAccount(999)).toBeUndefined();
    });

    it('overwrites existing link for same Telegram user', () => {
      service.linkAccount(42, 'user-1', 'oldname');
      service.linkAccount(42, 'user-2', 'newname');

      const link = service.getLinkedAccount(42);
      expect(link!.seraphimUserId).toBe('user-2');
      expect(link!.telegramUsername).toBe('newname');
    });

    it('supports multiple linked accounts', () => {
      service.linkAccount(42, 'user-1', 'alice');
      service.linkAccount(43, 'user-2', 'bob');

      expect(service.getLinkedAccount(42)!.seraphimUserId).toBe('user-1');
      expect(service.getLinkedAccount(43)!.seraphimUserId).toBe('user-2');
    });
  });

  // -------------------------------------------------------------------------
  // Sync to Dashboard (Req 38b.4, 38b.5)
  // -------------------------------------------------------------------------

  describe('syncToDashboard', () => {
    beforeEach(async () => {
      await service.initialize(createConfig());
      service.linkAccount(42, 'user-seraphim-1', 'testuser');
    });

    it('creates ChatMessage with telegram source', async () => {
      const incoming = createIncomingMessage();
      const result = await service.syncToDashboard(incoming);

      expect(result.source).toBe('telegram');
    });

    it('includes "via Telegram" indicator in metadata', async () => {
      const incoming = createIncomingMessage();
      const result = await service.syncToDashboard(incoming);

      expect(result.metadata.actionsTriggered).toContain('via Telegram');
    });

    it('preserves message content', async () => {
      const incoming = createIncomingMessage({ text: 'Check portfolio' });
      const result = await service.syncToDashboard(incoming);

      expect(result.content).toBe('Check portfolio');
    });

    it('resolves linked user ID', async () => {
      const incoming = createIncomingMessage({ telegramUserId: 42 });
      const result = await service.syncToDashboard(incoming);

      expect(result.userId).toBe('user-seraphim-1');
    });

    it('resolves agent from thread', async () => {
      const incoming = createIncomingMessage({ threadId: 'thread-100' });
      const result = await service.syncToDashboard(incoming);

      expect(result.agentId).toBe('agent-alpha');
    });

    it('uses "unknown" agent for unrecognized thread', async () => {
      const incoming = createIncomingMessage({ threadId: 'unknown-thread' });
      const result = await service.syncToDashboard(incoming);

      expect(result.agentId).toBe('unknown');
    });

    it('completes synchronously (within 3 seconds SLA)', async () => {
      const incoming = createIncomingMessage();
      const start = Date.now();
      await service.syncToDashboard(incoming);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(3000);
    });

    it('stores synced message for dashboard retrieval', async () => {
      const incoming = createIncomingMessage();
      await service.syncToDashboard(incoming);

      const synced = service.getSyncedToDashboard();
      expect(synced).toHaveLength(1);
      expect(synced[0].source).toBe('telegram');
    });
  });

  // -------------------------------------------------------------------------
  // Sync from Dashboard (Req 38b.5, 38b.6)
  // -------------------------------------------------------------------------

  describe('syncFromDashboard', () => {
    beforeEach(async () => {
      await service.initialize(createConfig());
    });

    it('stores message with "via Dashboard" indicator', async () => {
      const dashboardMessage = createDashboardMessage('agent-alpha', 'Run analysis');
      await service.syncFromDashboard(dashboardMessage);

      const synced = service.getSyncedToTelegram();
      expect(synced).toHaveLength(1);
      expect(synced[0].content).toContain('[via Dashboard]');
      expect(synced[0].content).toContain('Run analysis');
    });

    it('routes to correct thread based on agent', async () => {
      const dashboardMessage = createDashboardMessage('agent-beta', 'Hello');
      await service.syncFromDashboard(dashboardMessage);

      const synced = service.getSyncedToTelegram();
      expect(synced[0].threadId).toBe('thread-200');
    });

    it('throws for agent with no assigned thread', async () => {
      const dashboardMessage = createDashboardMessage('nonexistent-agent', 'Hello');

      await expect(service.syncFromDashboard(dashboardMessage)).rejects.toThrow(
        'No thread assigned for agent: nonexistent-agent',
      );
    });

    it('completes synchronously (within 3 seconds SLA)', async () => {
      const dashboardMessage = createDashboardMessage('agent-alpha', 'Quick check');
      const start = Date.now();
      await service.syncFromDashboard(dashboardMessage);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(3000);
    });

    it('marks source as dashboard', async () => {
      const dashboardMessage = createDashboardMessage('agent-alpha', 'Test');
      await service.syncFromDashboard(dashboardMessage);

      const synced = service.getSyncedToTelegram();
      expect(synced[0].source).toBe('dashboard');
    });
  });

  // -------------------------------------------------------------------------
  // Conversation Continuity (Req 38b.6)
  // -------------------------------------------------------------------------

  describe('conversation continuity across surfaces', () => {
    beforeEach(async () => {
      await service.initialize(createConfig());
      service.linkAccount(42, 'user-seraphim-1', 'testuser');
    });

    it('maintains unified conversation from Telegram to dashboard', async () => {
      // User sends via Telegram
      const incoming = createIncomingMessage({ text: 'Message 1 from Telegram' });
      const dashMsg = await service.syncToDashboard(incoming);

      expect(dashMsg.source).toBe('telegram');
      expect(dashMsg.content).toBe('Message 1 from Telegram');
      expect(dashMsg.agentId).toBe('agent-alpha');
    });

    it('maintains unified conversation from dashboard to Telegram', async () => {
      // User sends via dashboard
      const dashboardMessage = createDashboardMessage('agent-alpha', 'Message 2 from Dashboard');
      await service.syncFromDashboard(dashboardMessage);

      const synced = service.getSyncedToTelegram();
      expect(synced[0].content).toContain('Message 2 from Dashboard');
      expect(synced[0].threadId).toBe('thread-100');
    });

    it('preserves message ordering across surfaces', async () => {
      // Telegram → Dashboard
      const incoming1 = createIncomingMessage({ text: 'First' });
      await service.syncToDashboard(incoming1);

      // Dashboard → Telegram
      const dashMsg = createDashboardMessage('agent-alpha', 'Second');
      await service.syncFromDashboard(dashMsg);

      // Telegram → Dashboard again
      const incoming2 = createIncomingMessage({ text: 'Third' });
      await service.syncToDashboard(incoming2);

      const dashSynced = service.getSyncedToDashboard();
      expect(dashSynced).toHaveLength(2);
      expect(dashSynced[0].content).toBe('First');
      expect(dashSynced[1].content).toBe('Third');

      const tgSynced = service.getSyncedToTelegram();
      expect(tgSynced).toHaveLength(1);
      expect(tgSynced[0].content).toContain('Second');
    });
  });
});

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createDashboardMessage(agentId: string, content: string) {
  return {
    id: `dash-msg-${Date.now()}`,
    agentId,
    userId: 'user-seraphim-1',
    sender: 'user' as const,
    senderName: 'testuser',
    content,
    timestamp: new Date(),
    source: 'dashboard' as const,
    priority: 'normal' as const,
    metadata: {},
  };
}
