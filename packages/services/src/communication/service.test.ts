/**
 * Unit tests for the Agent Communication Service.
 *
 * Requirements: 37a.1, 37a.2, 37a.3, 37b.5, 37b.6, 37b.7
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentCommunicationServiceImpl } from './service.js';
import type { UserMessage, AgentMessageHandler } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserMessage(overrides: Partial<UserMessage> = {}): UserMessage {
  return {
    userId: 'user-1',
    agentId: 'agent-1',
    content: 'Hello agent',
    priority: 'normal',
    source: 'dashboard',
    ...overrides,
  };
}

function createMockHandler(response = 'Agent response'): AgentMessageHandler {
  return vi.fn().mockResolvedValue(response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentCommunicationServiceImpl', () => {
  let service: AgentCommunicationServiceImpl;
  let mockHandler: AgentMessageHandler;

  beforeEach(() => {
    service = new AgentCommunicationServiceImpl();
    mockHandler = createMockHandler();
    service.setMessageHandler(mockHandler);
  });

  // -------------------------------------------------------------------------
  // sendMessage (Req 37a.1, 37a.2)
  // -------------------------------------------------------------------------

  describe('sendMessage', () => {
    it('should persist message and route to agent handler', async () => {
      const message = makeUserMessage({ content: 'What is the weather?' });

      const result = await service.sendMessage(message);

      expect(result.messageId).toBeDefined();
      expect(result.agentResponse).toBeDefined();
      expect(result.agentResponse.sender).toBe('agent');
      expect(result.agentResponse.content).toBe('Agent response');
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should invoke the message handler with correct arguments', async () => {
      const message = makeUserMessage({ agentId: 'agent-2', content: 'Test' });

      await service.sendMessage(message);

      expect(mockHandler).toHaveBeenCalledWith('agent-2', message);
    });

    it('should throw if no message handler is registered', async () => {
      const noHandlerService = new AgentCommunicationServiceImpl();
      const message = makeUserMessage();

      await expect(noHandlerService.sendMessage(message)).rejects.toThrow(
        'No message handler registered',
      );
    });

    it('should persist both user and agent messages in history', async () => {
      const message = makeUserMessage();

      await service.sendMessage(message);

      const history = await service.getHistory('agent-1');
      expect(history).toHaveLength(2);
      expect(history[0].sender).toBe('user');
      expect(history[1].sender).toBe('agent');
    });

    it('should include processing time in agent response metadata', async () => {
      const message = makeUserMessage();

      const result = await service.sendMessage(message);

      expect(result.agentResponse.metadata.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // getHistory with filtering (Req 37b.5, 37b.6)
  // -------------------------------------------------------------------------

  describe('getHistory', () => {
    it('should return empty array for agent with no messages', async () => {
      const history = await service.getHistory('nonexistent-agent');
      expect(history).toEqual([]);
    });

    it('should filter by userId', async () => {
      await service.sendMessage(makeUserMessage({ userId: 'user-1' }));
      await service.sendMessage(makeUserMessage({ userId: 'user-2' }));

      const history = await service.getHistory('agent-1', { userId: 'user-1' });

      // user-1 sent 1 message, agent replied 1 message (both have userId: user-1)
      expect(history).toHaveLength(2);
      expect(history.every((msg) => msg.userId === 'user-1')).toBe(true);
    });

    it('should filter by time range', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 60000);
      const future = new Date(now.getTime() + 60000);

      await service.sendMessage(makeUserMessage());

      const history = await service.getHistory('agent-1', {
        timeRange: { start: past, end: future },
      });
      expect(history.length).toBeGreaterThan(0);

      const emptyHistory = await service.getHistory('agent-1', {
        timeRange: { start: new Date(0), end: new Date(1) },
      });
      expect(emptyHistory).toHaveLength(0);
    });

    it('should filter by priority', async () => {
      await service.sendMessage(makeUserMessage({ priority: 'high' }));
      await service.sendMessage(makeUserMessage({ priority: 'low' }));

      const highPriority = await service.getHistory('agent-1', { priority: 'high' });
      expect(highPriority.length).toBeGreaterThan(0);
      expect(highPriority.every((msg) => msg.priority === 'high')).toBe(true);
    });

    it('should filter by source', async () => {
      await service.sendMessage(makeUserMessage({ source: 'telegram' }));
      await service.sendMessage(makeUserMessage({ source: 'api' }));

      const telegramMessages = await service.getHistory('agent-1', { source: 'telegram' });
      expect(telegramMessages.length).toBeGreaterThan(0);
      expect(telegramMessages.every((msg) => msg.source === 'telegram')).toBe(true);
    });

    it('should support limit and offset pagination', async () => {
      await service.sendMessage(makeUserMessage({ content: 'msg-1' }));
      await service.sendMessage(makeUserMessage({ content: 'msg-2' }));
      await service.sendMessage(makeUserMessage({ content: 'msg-3' }));

      const limited = await service.getHistory('agent-1', { limit: 2 });
      expect(limited).toHaveLength(2);

      const offset = await service.getHistory('agent-1', { offset: 2, limit: 2 });
      expect(offset).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // searchHistory (Req 37b.5)
  // -------------------------------------------------------------------------

  describe('searchHistory', () => {
    it('should find messages by keyword', async () => {
      await service.sendMessage(makeUserMessage({ content: 'Tell me about weather' }));
      await service.sendMessage(makeUserMessage({ content: 'What is the stock price?' }));

      const results = await service.searchHistory('agent-1', 'weather');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((msg) => msg.content.toLowerCase().includes('weather'))).toBe(true);
    });

    it('should perform case-insensitive search', async () => {
      await service.sendMessage(makeUserMessage({ content: 'IMPORTANT update' }));

      const results = await service.searchHistory('agent-1', 'important');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array when no matches found', async () => {
      await service.sendMessage(makeUserMessage({ content: 'Hello world' }));

      const results = await service.searchHistory('agent-1', 'nonexistent-term-xyz');
      expect(results).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getUnifiedHistory (Req 37a.3)
  // -------------------------------------------------------------------------

  describe('getUnifiedHistory', () => {
    it('should return all users messages chronologically', async () => {
      await service.sendMessage(makeUserMessage({ userId: 'user-1', content: 'First' }));
      await service.sendMessage(makeUserMessage({ userId: 'user-2', content: 'Second' }));
      await service.sendMessage(makeUserMessage({ userId: 'user-3', content: 'Third' }));

      const unified = await service.getUnifiedHistory('agent-1');

      // 3 user messages + 3 agent responses = 6 total
      expect(unified).toHaveLength(6);

      // Verify chronological order
      for (let i = 1; i < unified.length; i++) {
        expect(unified[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          unified[i - 1].timestamp.getTime(),
        );
      }
    });

    it('should include messages from all users regardless of userId filter', async () => {
      await service.sendMessage(makeUserMessage({ userId: 'user-1' }));
      await service.sendMessage(makeUserMessage({ userId: 'user-2' }));

      // Unified history ignores userId filter — shows all
      const unified = await service.getUnifiedHistory('agent-1');
      const userIds = new Set(unified.map((msg) => msg.userId));
      expect(userIds.has('user-1')).toBe(true);
      expect(userIds.has('user-2')).toBe(true);
    });

    it('should support filtering by priority in unified view', async () => {
      await service.sendMessage(makeUserMessage({ userId: 'user-1', priority: 'critical' }));
      await service.sendMessage(makeUserMessage({ userId: 'user-2', priority: 'low' }));

      const critical = await service.getUnifiedHistory('agent-1', { priority: 'critical' });
      expect(critical.length).toBeGreaterThan(0);
      expect(critical.every((msg) => msg.priority === 'critical')).toBe(true);
    });

    it('should support pagination in unified view', async () => {
      await service.sendMessage(makeUserMessage({ userId: 'user-1' }));
      await service.sendMessage(makeUserMessage({ userId: 'user-2' }));

      const limited = await service.getUnifiedHistory('agent-1', { limit: 2 });
      expect(limited).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Multi-user concurrent access (Req 37a.3)
  // -------------------------------------------------------------------------

  describe('multi-user context management', () => {
    it('should maintain separate contexts per user', async () => {
      await service.sendMessage(makeUserMessage({ userId: 'user-1', content: 'User 1 msg' }));
      await service.sendMessage(makeUserMessage({ userId: 'user-2', content: 'User 2 msg' }));

      const user1History = await service.getHistory('agent-1', { userId: 'user-1' });
      const user2History = await service.getHistory('agent-1', { userId: 'user-2' });

      // Each user sees only their own messages
      expect(user1History.every((msg) => msg.userId === 'user-1')).toBe(true);
      expect(user2History.every((msg) => msg.userId === 'user-2')).toBe(true);

      // But unified view shows all
      const unified = await service.getUnifiedHistory('agent-1');
      expect(unified.length).toBe(user1History.length + user2History.length);
    });

    it('should handle concurrent messages from multiple users', async () => {
      const promises = [
        service.sendMessage(makeUserMessage({ userId: 'user-1', content: 'Concurrent 1' })),
        service.sendMessage(makeUserMessage({ userId: 'user-2', content: 'Concurrent 2' })),
        service.sendMessage(makeUserMessage({ userId: 'user-3', content: 'Concurrent 3' })),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((r) => {
        expect(r.messageId).toBeDefined();
        expect(r.agentResponse).toBeDefined();
      });

      const unified = await service.getUnifiedHistory('agent-1');
      expect(unified).toHaveLength(6); // 3 user + 3 agent
    });
  });

  // -------------------------------------------------------------------------
  // getActiveUsers (Req 37b.7)
  // -------------------------------------------------------------------------

  describe('getActiveUsers', () => {
    it('should track users who sent messages recently', async () => {
      await service.sendMessage(makeUserMessage({ userId: 'user-1' }));
      await service.sendMessage(makeUserMessage({ userId: 'user-2' }));

      const activeUsers = await service.getActiveUsers('agent-1');

      expect(activeUsers).toHaveLength(2);
      expect(activeUsers.map((u) => u.userId)).toContain('user-1');
      expect(activeUsers.map((u) => u.userId)).toContain('user-2');
    });

    it('should return empty array for agent with no active users', async () => {
      const activeUsers = await service.getActiveUsers('nonexistent-agent');
      expect(activeUsers).toEqual([]);
    });

    it('should increment message count for repeat users', async () => {
      await service.sendMessage(makeUserMessage({ userId: 'user-1' }));
      await service.sendMessage(makeUserMessage({ userId: 'user-1' }));
      await service.sendMessage(makeUserMessage({ userId: 'user-1' }));

      const activeUsers = await service.getActiveUsers('agent-1');
      const user1 = activeUsers.find((u) => u.userId === 'user-1');

      expect(user1).toBeDefined();
      expect(user1!.messageCount).toBe(3);
    });

    it('should exclude users inactive for more than 30 minutes', async () => {
      await service.sendMessage(makeUserMessage({ userId: 'user-1' }));

      // Simulate user being inactive for > 30 minutes by manipulating lastActivity
      const agentUsers = (service as any).activeUsers.get('agent-1');
      const user = agentUsers.get('user-1');
      user.lastActivity = new Date(Date.now() - 31 * 60 * 1000);

      const activeUsers = await service.getActiveUsers('agent-1');
      expect(activeUsers).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // setMessageHandler
  // -------------------------------------------------------------------------

  describe('setMessageHandler', () => {
    it('should register and invoke the handler correctly', async () => {
      const customHandler = vi.fn().mockResolvedValue('Custom response');
      service.setMessageHandler(customHandler);

      const message = makeUserMessage({ content: 'Test message' });
      const result = await service.sendMessage(message);

      expect(customHandler).toHaveBeenCalledOnce();
      expect(customHandler).toHaveBeenCalledWith('agent-1', message);
      expect(result.agentResponse.content).toBe('Custom response');
    });

    it('should allow replacing the handler', async () => {
      const handler1 = vi.fn().mockResolvedValue('Response 1');
      const handler2 = vi.fn().mockResolvedValue('Response 2');

      service.setMessageHandler(handler1);
      await service.sendMessage(makeUserMessage());

      service.setMessageHandler(handler2);
      const result = await service.sendMessage(makeUserMessage());

      expect(result.agentResponse.content).toBe('Response 2');
    });
  });
});
