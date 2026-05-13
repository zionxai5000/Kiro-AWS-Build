/**
 * Communication Audit Trail Service — Unit Tests
 *
 * Tests for communication logging, conversation replay,
 * pattern queries, and filtering.
 *
 * Requirements: 37f.17, 37f.18
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommunicationAuditServiceImpl } from './audit-trail.js';
import type { CommunicationAuditEntry } from './types.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommunicationAuditServiceImpl', () => {
  let service: CommunicationAuditServiceImpl;

  beforeEach(() => {
    service = new CommunicationAuditServiceImpl();
  });

  // -------------------------------------------------------------------------
  // Recording Communications
  // -------------------------------------------------------------------------

  describe('recordCommunication', () => {
    it('records a communication entry with generated ID', () => {
      const entry = service.recordCommunication({
        userId: 'user-1',
        agentId: 'seraphim',
        messageContent: 'Hello agent',
        direction: 'user_to_agent',
        timestamp: new Date('2024-01-15T10:00:00Z'),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      expect(entry.id).toBeDefined();
      expect(entry.id).toMatch(/^audit-/);
    });

    it('captures all required fields: user identity, agent identity, content, timestamp, response time, actions', () => {
      const timestamp = new Date('2024-01-15T10:00:00Z');
      const entry = service.recordCommunication({
        userId: 'king',
        agentId: 'eretz',
        messageContent: 'Generate portfolio report',
        direction: 'user_to_agent',
        timestamp,
        responseTime: 1500,
        actionsTriggered: ['generate_report', 'notify_team'],
        source: 'telegram',
        priority: 'high',
      });

      expect(entry.userId).toBe('king');
      expect(entry.agentId).toBe('eretz');
      expect(entry.messageContent).toBe('Generate portfolio report');
      expect(entry.direction).toBe('user_to_agent');
      expect(entry.timestamp).toEqual(timestamp);
      expect(entry.responseTime).toBe(1500);
      expect(entry.actionsTriggered).toEqual(['generate_report', 'notify_team']);
      expect(entry.source).toBe('telegram');
      expect(entry.priority).toBe('high');
    });

    it('generates unique IDs for each entry', () => {
      const e1 = service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'msg 1',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      const e2 = service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'msg 2',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      expect(e1.id).not.toBe(e2.id);
    });

    it('records agent-to-user direction', () => {
      const entry = service.recordCommunication({
        userId: 'user-1',
        agentId: 'seraphim',
        messageContent: 'Here is your report',
        direction: 'agent_to_user',
        timestamp: new Date(),
        responseTime: 800,
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      expect(entry.direction).toBe('agent_to_user');
      expect(entry.responseTime).toBe(800);
    });
  });

  // -------------------------------------------------------------------------
  // Conversation Replay
  // -------------------------------------------------------------------------

  describe('getConversationReplay', () => {
    it('retrieves complete history between a user and agent for a time period', () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');

      service.recordCommunication({
        userId: 'user-1',
        agentId: 'seraphim',
        messageContent: 'Hello',
        direction: 'user_to_agent',
        timestamp: new Date(baseTime.getTime() + 1000),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'seraphim',
        messageContent: 'Hi there!',
        direction: 'agent_to_user',
        timestamp: new Date(baseTime.getTime() + 2000),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'seraphim',
        messageContent: 'Run analysis',
        direction: 'user_to_agent',
        timestamp: new Date(baseTime.getTime() + 3000),
        actionsTriggered: ['run_analysis'],
        source: 'dashboard',
        priority: 'high',
      });

      const replay = service.getConversationReplay('user-1', 'seraphim', {
        start: baseTime,
        end: new Date(baseTime.getTime() + 5000),
      });

      expect(replay).toHaveLength(3);
      expect(replay[0].messageContent).toBe('Hello');
      expect(replay[1].messageContent).toBe('Hi there!');
      expect(replay[2].messageContent).toBe('Run analysis');
    });

    it('returns messages in chronological order', () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');

      // Insert out of order
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'Third',
        direction: 'user_to_agent',
        timestamp: new Date(baseTime.getTime() + 3000),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'First',
        direction: 'user_to_agent',
        timestamp: new Date(baseTime.getTime() + 1000),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'Second',
        direction: 'agent_to_user',
        timestamp: new Date(baseTime.getTime() + 2000),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      const replay = service.getConversationReplay('user-1', 'agent-a', {
        start: baseTime,
        end: new Date(baseTime.getTime() + 5000),
      });

      expect(replay.map((e) => e.messageContent)).toEqual(['First', 'Second', 'Third']);
    });

    it('filters by user and agent correctly', () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');

      service.recordCommunication({
        userId: 'user-1',
        agentId: 'seraphim',
        messageContent: 'To seraphim',
        direction: 'user_to_agent',
        timestamp: new Date(baseTime.getTime() + 1000),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'eretz',
        messageContent: 'To eretz',
        direction: 'user_to_agent',
        timestamp: new Date(baseTime.getTime() + 2000),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-2',
        agentId: 'seraphim',
        messageContent: 'From user-2',
        direction: 'user_to_agent',
        timestamp: new Date(baseTime.getTime() + 3000),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      const replay = service.getConversationReplay('user-1', 'seraphim', {
        start: baseTime,
        end: new Date(baseTime.getTime() + 5000),
      });

      expect(replay).toHaveLength(1);
      expect(replay[0].messageContent).toBe('To seraphim');
    });

    it('respects time range boundaries', () => {
      const baseTime = new Date('2024-01-15T10:00:00Z');

      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'Before range',
        direction: 'user_to_agent',
        timestamp: new Date(baseTime.getTime() - 1000),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'In range',
        direction: 'user_to_agent',
        timestamp: new Date(baseTime.getTime() + 1000),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'After range',
        direction: 'user_to_agent',
        timestamp: new Date(baseTime.getTime() + 10000),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      const replay = service.getConversationReplay('user-1', 'agent-a', {
        start: baseTime,
        end: new Date(baseTime.getTime() + 5000),
      });

      expect(replay).toHaveLength(1);
      expect(replay[0].messageContent).toBe('In range');
    });
  });

  // -------------------------------------------------------------------------
  // Pattern Queries
  // -------------------------------------------------------------------------

  describe('queryPatterns', () => {
    it('calculates average response time correctly', () => {
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'msg 1',
        direction: 'agent_to_user',
        timestamp: new Date(),
        responseTime: 100,
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'msg 2',
        direction: 'agent_to_user',
        timestamp: new Date(),
        responseTime: 300,
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      const patterns = service.queryPatterns({ userId: 'user-1' });
      expect(patterns.averageResponseTime).toBe(200);
    });

    it('returns correct total message count', () => {
      for (let i = 0; i < 5; i++) {
        service.recordCommunication({
          userId: 'user-1',
          agentId: 'agent-a',
          messageContent: `msg ${i}`,
          direction: 'user_to_agent',
          timestamp: new Date(),
          actionsTriggered: [],
          source: 'dashboard',
          priority: 'normal',
        });
      }

      const patterns = service.queryPatterns({ userId: 'user-1' });
      expect(patterns.totalMessages).toBe(5);
    });

    it('groups messages by priority correctly', () => {
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'low msg',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'low',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'high msg 1',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'high',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'high msg 2',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'high',
      });

      const patterns = service.queryPatterns({ userId: 'user-1' });
      expect(patterns.messagesByPriority).toEqual({ low: 1, high: 2 });
    });

    it('groups messages by source correctly', () => {
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'dashboard msg',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'telegram msg',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'telegram',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'api msg',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'api',
        priority: 'normal',
      });

      const patterns = service.queryPatterns({ userId: 'user-1' });
      expect(patterns.messagesBySource).toEqual({ dashboard: 1, telegram: 1, api: 1 });
    });

    it('groups messages by agent correctly', () => {
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'seraphim',
        messageContent: 'msg 1',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'seraphim',
        messageContent: 'msg 2',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'eretz',
        messageContent: 'msg 3',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      const patterns = service.queryPatterns({ userId: 'user-1' });
      expect(patterns.messagesByAgent).toEqual({ seraphim: 2, eretz: 1 });
    });

    it('returns zero average response time when no response times are recorded', () => {
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'msg',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      const patterns = service.queryPatterns({ userId: 'user-1' });
      expect(patterns.averageResponseTime).toBe(0);
    });

    it('applies filter to pattern queries', () => {
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'msg 1',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-2',
        agentId: 'agent-a',
        messageContent: 'msg 2',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      const patterns = service.queryPatterns({ userId: 'user-1' });
      expect(patterns.totalMessages).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getEntries
  // -------------------------------------------------------------------------

  describe('getEntries', () => {
    it('filters by userId', () => {
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'msg',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-2',
        agentId: 'agent-a',
        messageContent: 'msg',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      const entries = service.getEntries({ userId: 'user-1' });
      expect(entries).toHaveLength(1);
      expect(entries[0].userId).toBe('user-1');
    });

    it('filters by direction', () => {
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'user msg',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'agent msg',
        direction: 'agent_to_user',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      const entries = service.getEntries({ direction: 'agent_to_user' });
      expect(entries).toHaveLength(1);
      expect(entries[0].messageContent).toBe('agent msg');
    });

    it('filters by source', () => {
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'telegram msg',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'telegram',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'dashboard msg',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });

      const entries = service.getEntries({ source: 'telegram' });
      expect(entries).toHaveLength(1);
      expect(entries[0].messageContent).toBe('telegram msg');
    });

    it('returns all entries when no filter is applied', () => {
      service.recordCommunication({
        userId: 'user-1',
        agentId: 'agent-a',
        messageContent: 'msg 1',
        direction: 'user_to_agent',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'dashboard',
        priority: 'normal',
      });
      service.recordCommunication({
        userId: 'user-2',
        agentId: 'agent-b',
        messageContent: 'msg 2',
        direction: 'agent_to_user',
        timestamp: new Date(),
        actionsTriggered: [],
        source: 'telegram',
        priority: 'high',
      });

      const entries = service.getEntries({});
      expect(entries).toHaveLength(2);
    });
  });
});
