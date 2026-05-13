/**
 * Context Sharing Engine — Unit Tests
 *
 * Tests for cross-agent context sharing, relevance analysis,
 * @-mention parsing, handoff summaries, and configurable modes.
 *
 * Requirements: 37c.9, 37c.10, 37c.11, 37c.12, 37d.13, 37d.14
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextSharingEngineImpl } from './context-sharing.js';
import type { ChatMessage } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    agentId: 'seraphim',
    userId: 'user-1',
    sender: 'user',
    senderName: 'user-1',
    content: 'Hello world',
    timestamp: new Date(),
    source: 'dashboard',
    priority: 'normal',
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContextSharingEngineImpl', () => {
  let engine: ContextSharingEngineImpl;

  beforeEach(() => {
    engine = new ContextSharingEngineImpl();
  });

  // -------------------------------------------------------------------------
  // Relevance Analysis
  // -------------------------------------------------------------------------

  describe('analyzeRelevance', () => {
    it('detects cross-agent relevant messages based on keyword overlap', async () => {
      const message = createMessage({
        agentId: 'seraphim',
        content: 'We need to update the app development design for the new feature',
      });

      const results = await engine.analyzeRelevance(message, ['seraphim', 'zionx', 'eretz']);

      // zionx has keywords: app, development, design — all 3 match
      const zionxResult = results.find((r) => r.agentId === 'zionx');
      expect(zionxResult).toBeDefined();
      expect(zionxResult!.relevanceScore).toBe(1.0); // 3/3 keywords matched
      expect(zionxResult!.suggestedAction).toBe('share_full');
    });

    it('returns no_action for messages below threshold', async () => {
      const message = createMessage({
        agentId: 'seraphim',
        content: 'The weather is nice today',
      });

      const results = await engine.analyzeRelevance(message, ['zionx', 'eretz', 'zxmg']);

      for (const result of results) {
        expect(result.relevanceScore).toBeLessThan(0.7);
        expect(result.suggestedAction).not.toBe('share_full');
      }
    });

    it('skips the agent that owns the message', async () => {
      const message = createMessage({ agentId: 'seraphim' });

      const results = await engine.analyzeRelevance(message, ['seraphim', 'zionx']);

      expect(results.find((r) => r.agentId === 'seraphim')).toBeUndefined();
      expect(results).toHaveLength(1);
      expect(results[0].agentId).toBe('zionx');
    });

    it('returns score 0 for agents with no configured domain keywords', async () => {
      const message = createMessage({ content: 'some random content' });

      const results = await engine.analyzeRelevance(message, ['unknown-agent']);

      expect(results[0].relevanceScore).toBe(0);
      expect(results[0].suggestedAction).toBe('no_action');
    });

    it('suggests share_summary for moderate relevance scores', async () => {
      // eretz has keywords: business, portfolio, synergy (3 keywords)
      // matching 1 of 3 = 0.333... which is >= 0.7 * 0.5 = 0.35? No, 0.333 < 0.35
      // matching 2 of 3 = 0.666... which is >= 0.35 but < 0.7
      const message = createMessage({
        agentId: 'seraphim',
        content: 'The business portfolio needs review',
      });

      const results = await engine.analyzeRelevance(message, ['eretz']);
      const eretzResult = results.find((r) => r.agentId === 'eretz');

      expect(eretzResult).toBeDefined();
      expect(eretzResult!.relevanceScore).toBeCloseTo(2 / 3);
      expect(eretzResult!.suggestedAction).toBe('share_summary');
    });
  });

  // -------------------------------------------------------------------------
  // Context Propagation
  // -------------------------------------------------------------------------

  describe('propagateContext', () => {
    it('shares context above threshold and creates share events', async () => {
      const message = createMessage({
        agentId: 'seraphim',
        content: 'Update the app development design immediately',
      });

      const events = await engine.propagateContext(message, ['zionx'], 'auto_detected');

      expect(events).toHaveLength(1);
      expect(events[0].fromAgentId).toBe('seraphim');
      expect(events[0].toAgentId).toBe('zionx');
      expect(events[0].messageId).toBe('msg-1');
      expect(events[0].reason).toBe('auto_detected');
      expect(events[0].sharedContent).toBe(message.content);
      expect(events[0].acknowledged).toBe(false);
    });

    it('sets relevance score to 1.0 for explicit tags', async () => {
      const message = createMessage({
        agentId: 'seraphim',
        content: '@zionx please handle this',
      });

      const events = await engine.propagateContext(message, ['zionx'], 'explicit_tag');

      expect(events[0].relevanceScore).toBe(1.0);
      expect(events[0].reason).toBe('explicit_tag');
    });

    it('stores events in the share log', async () => {
      const message = createMessage({ agentId: 'seraphim' });

      await engine.propagateContext(message, ['zionx', 'eretz'], 'auto_detected');

      const zionxLog = engine.getShareLog('zionx');
      const eretzLog = engine.getShareLog('eretz');

      expect(zionxLog).toHaveLength(1);
      expect(eretzLog).toHaveLength(1);
      expect(zionxLog[0].toAgentId).toBe('zionx');
      expect(eretzLog[0].toAgentId).toBe('eretz');
    });

    it('generates unique event IDs for each share', async () => {
      const message = createMessage({ agentId: 'seraphim' });

      const events = await engine.propagateContext(message, ['zionx', 'eretz'], 'auto_detected');

      expect(events[0].id).not.toBe(events[1].id);
    });
  });

  // -------------------------------------------------------------------------
  // @-Mention Parsing
  // -------------------------------------------------------------------------

  describe('parseAgentMentions', () => {
    it('detects @agent-name patterns in message content', () => {
      const mentions = engine.parseAgentMentions('Hey @zionx can you help with @eretz task?');

      expect(mentions).toContain('zionx');
      expect(mentions).toContain('eretz');
      expect(mentions).toHaveLength(2);
    });

    it('handles hyphenated agent names', () => {
      const mentions = engine.parseAgentMentions('Notify @zion-alpha about the trade');

      expect(mentions).toContain('zion-alpha');
    });

    it('returns empty array when no mentions found', () => {
      const mentions = engine.parseAgentMentions('No mentions here');

      expect(mentions).toHaveLength(0);
    });

    it('deduplicates repeated mentions', () => {
      const mentions = engine.parseAgentMentions('@zionx do this and @zionx do that');

      expect(mentions).toHaveLength(1);
      expect(mentions[0]).toBe('zionx');
    });

    it('handles mentions at start and end of content', () => {
      const mentions = engine.parseAgentMentions('@seraphim check this @zxmg');

      expect(mentions).toContain('seraphim');
      expect(mentions).toContain('zxmg');
    });
  });

  // -------------------------------------------------------------------------
  // Handoff Summary
  // -------------------------------------------------------------------------

  describe('generateHandoffSummary', () => {
    it('generates a summary of recent conversation for the new agent', async () => {
      const messages: ChatMessage[] = [
        createMessage({ sender: 'user', senderName: 'user-1', content: 'Start the project', agentId: 'seraphim', userId: 'user-1' }),
        createMessage({ sender: 'agent', senderName: 'seraphim', content: 'Project started', agentId: 'seraphim', userId: 'user-1' }),
        createMessage({ sender: 'user', senderName: 'user-1', content: 'What is the status?', agentId: 'seraphim', userId: 'user-1' }),
      ];

      const summary = await engine.generateHandoffSummary('user-1', 'seraphim', 'zionx', messages);

      expect(summary).toContain('Handoff Summary: seraphim → zionx');
      expect(summary).toContain('User: user-1');
      expect(summary).toContain('Start the project');
      expect(summary).toContain('Project started');
      expect(summary).toContain('What is the status?');
    });

    it('limits summary to last 5 messages', async () => {
      const messages: ChatMessage[] = Array.from({ length: 10 }, (_, i) =>
        createMessage({
          id: `msg-${i}`,
          sender: 'user',
          content: `Message ${i}`,
          agentId: 'seraphim',
          userId: 'user-1',
        }),
      );

      const summary = await engine.generateHandoffSummary('user-1', 'seraphim', 'zionx', messages);

      // Should only contain last 5 messages (5-9)
      expect(summary).not.toContain('Message 4');
      expect(summary).toContain('Message 5');
      expect(summary).toContain('Message 9');
    });

    it('returns informative message when no history exists', async () => {
      const summary = await engine.generateHandoffSummary('user-1', 'seraphim', 'zionx', []);

      expect(summary).toContain('No recent conversation history');
    });

    it('filters messages to only include relevant user and agent', async () => {
      const messages: ChatMessage[] = [
        createMessage({ agentId: 'seraphim', userId: 'user-1', content: 'Relevant' }),
        createMessage({ agentId: 'zionx', userId: 'user-1', content: 'Different agent' }),
        createMessage({ agentId: 'seraphim', userId: 'user-2', content: 'Different user' }),
      ];

      const summary = await engine.generateHandoffSummary('user-1', 'seraphim', 'zionx', messages);

      expect(summary).toContain('Relevant');
      expect(summary).not.toContain('Different agent');
      expect(summary).not.toContain('Different user');
    });
  });

  // -------------------------------------------------------------------------
  // Handoff Mode Configuration
  // -------------------------------------------------------------------------

  describe('handoff mode', () => {
    it('defaults to automatic when not configured', () => {
      expect(engine.getHandoffMode('user-1')).toBe('automatic');
    });

    it('allows setting and getting handoff mode per user', () => {
      engine.setHandoffMode('user-1', 'manual');
      engine.setHandoffMode('user-2', 'on_request');

      expect(engine.getHandoffMode('user-1')).toBe('manual');
      expect(engine.getHandoffMode('user-2')).toBe('on_request');
    });

    it('can be updated after initial setting', () => {
      engine.setHandoffMode('user-1', 'manual');
      engine.setHandoffMode('user-1', 'automatic');

      expect(engine.getHandoffMode('user-1')).toBe('automatic');
    });
  });

  // -------------------------------------------------------------------------
  // Share Log
  // -------------------------------------------------------------------------

  describe('getShareLog', () => {
    it('returns empty array for agents with no share events', () => {
      expect(engine.getShareLog('unknown-agent')).toEqual([]);
    });

    it('returns all context share events for an agent', async () => {
      const msg1 = createMessage({ id: 'msg-1', agentId: 'seraphim', content: 'First' });
      const msg2 = createMessage({ id: 'msg-2', agentId: 'seraphim', content: 'Second' });

      await engine.propagateContext(msg1, ['zionx'], 'auto_detected');
      await engine.propagateContext(msg2, ['zionx'], 'explicit_tag');

      const log = engine.getShareLog('zionx');
      expect(log).toHaveLength(2);
      expect(log[0].sharedContent).toBe('First');
      expect(log[1].sharedContent).toBe('Second');
    });
  });

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  describe('configure', () => {
    it('updates relevance threshold', async () => {
      engine.configure({ relevanceThreshold: 0.5 });

      // With threshold 0.5, matching 2/3 keywords (0.666) should now be share_full
      const message = createMessage({
        agentId: 'seraphim',
        content: 'The business portfolio needs review',
      });

      const results = await engine.analyzeRelevance(message, ['eretz']);
      const eretzResult = results.find((r) => r.agentId === 'eretz');

      expect(eretzResult!.suggestedAction).toBe('share_full');
    });

    it('updates agent domain keywords', async () => {
      engine.configure({
        agentDomains: new Map([
          ['custom-agent', ['weather', 'forecast', 'climate']],
        ]),
      });

      const message = createMessage({
        agentId: 'seraphim',
        content: 'Check the weather forecast for climate data',
      });

      const results = await engine.analyzeRelevance(message, ['custom-agent']);

      expect(results[0].relevanceScore).toBe(1.0);
      expect(results[0].suggestedAction).toBe('share_full');
    });

    it('updates user handoff modes via configuration', () => {
      engine.configure({
        userHandoffModes: new Map([
          ['user-1', 'manual'],
          ['user-2', 'on_request'],
        ]),
      });

      expect(engine.getHandoffMode('user-1')).toBe('manual');
      expect(engine.getHandoffMode('user-2')).toBe('on_request');
    });
  });
});
