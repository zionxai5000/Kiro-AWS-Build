/**
 * Unit tests for the Message Priority Queue.
 *
 * Requirements: 37b.8, 39.1, 39.2, 39.3, 39.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessagePriorityQueueImpl } from './priority-queue.js';
import type { UserMessage, MessagePriority } from './types.js';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessagePriorityQueueImpl', () => {
  let queue: MessagePriorityQueueImpl;

  beforeEach(() => {
    queue = new MessagePriorityQueueImpl();
  });

  // -------------------------------------------------------------------------
  // Priority Ordering (Req 39.1)
  // -------------------------------------------------------------------------

  describe('priority ordering', () => {
    it('should process critical messages before normal messages', () => {
      queue.enqueue(makeUserMessage({ userId: 'u1', priority: 'normal', content: 'normal msg' }));
      queue.enqueue(makeUserMessage({ userId: 'u2', priority: 'critical', content: 'critical msg' }));

      const first = queue.dequeue();
      expect(first).not.toBeNull();
      expect(first!.effectivePriority).toBe('critical');
      expect(first!.message.content).toBe('critical msg');

      const second = queue.dequeue();
      expect(second).not.toBeNull();
      expect(second!.effectivePriority).toBe('normal');
    });

    it('should process in order: critical → high → normal → low', () => {
      queue.enqueue(makeUserMessage({ userId: 'u1', priority: 'low', content: 'low' }));
      queue.enqueue(makeUserMessage({ userId: 'u2', priority: 'high', content: 'high' }));
      queue.enqueue(makeUserMessage({ userId: 'u3', priority: 'normal', content: 'normal' }));
      queue.enqueue(makeUserMessage({ userId: 'u4', priority: 'critical', content: 'critical' }));

      const results: MessagePriority[] = [];
      let msg = queue.dequeue();
      while (msg) {
        results.push(msg.effectivePriority);
        msg = queue.dequeue();
      }

      expect(results).toEqual(['critical', 'high', 'normal', 'low']);
    });
  });

  // -------------------------------------------------------------------------
  // FIFO within same priority (Req 39.1)
  // -------------------------------------------------------------------------

  describe('FIFO within same priority', () => {
    it('should process messages in FIFO order within the same priority level', () => {
      queue.enqueue(makeUserMessage({ userId: 'u1', priority: 'normal', content: 'first' }));
      queue.enqueue(makeUserMessage({ userId: 'u2', priority: 'normal', content: 'second' }));
      queue.enqueue(makeUserMessage({ userId: 'u3', priority: 'normal', content: 'third' }));

      const first = queue.dequeue();
      const second = queue.dequeue();
      const third = queue.dequeue();

      expect(first!.message.content).toBe('first');
      expect(second!.message.content).toBe('second');
      expect(third!.message.content).toBe('third');
    });
  });

  // -------------------------------------------------------------------------
  // Critical Message Interruption (Req 39.2)
  // -------------------------------------------------------------------------

  describe('critical message interruption', () => {
    it('should fire interruption callback when critical message is enqueued', () => {
      const callback = vi.fn();
      queue.onCriticalMessage(callback);

      const msg = makeUserMessage({ priority: 'critical' });
      queue.enqueue(msg);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          effectivePriority: 'critical',
          message: msg,
        }),
      );
    });

    it('should not fire interruption callback for non-critical messages', () => {
      const callback = vi.fn();
      queue.onCriticalMessage(callback);

      queue.enqueue(makeUserMessage({ priority: 'high' }));
      queue.enqueue(makeUserMessage({ userId: 'u2', priority: 'normal' }));
      queue.enqueue(makeUserMessage({ userId: 'u3', priority: 'low' }));

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not fire interruption callback when interruption is disabled', () => {
      const callback = vi.fn();
      queue.onCriticalMessage(callback);
      queue.configure({ enableInterruption: false });

      queue.enqueue(makeUserMessage({ priority: 'critical' }));

      expect(callback).not.toHaveBeenCalled();
    });

    it('should fire callback within synchronous execution (< 10 seconds)', () => {
      const callbackTime: number[] = [];
      const startTime = Date.now();

      queue.onCriticalMessage(() => {
        callbackTime.push(Date.now());
      });

      queue.enqueue(makeUserMessage({ priority: 'critical' }));

      expect(callbackTime).toHaveLength(1);
      // Callback fires synchronously, well within 10 seconds
      expect(callbackTime[0] - startTime).toBeLessThan(10_000);
    });
  });

  // -------------------------------------------------------------------------
  // King Message Auto-Elevation (Req 39.3)
  // -------------------------------------------------------------------------

  describe('King message auto-elevation', () => {
    it('should elevate King messages to high priority by default config', () => {
      const kingUserId = 'king-user';
      queue.configure({
        autoElevateUsers: new Map([[kingUserId, 'high']]),
      });

      const queued = queue.enqueue(
        makeUserMessage({ userId: kingUserId, priority: 'normal' }),
      );

      expect(queued.effectivePriority).toBe('high');
    });

    it('should not downgrade messages that already have higher priority', () => {
      const kingUserId = 'king-user';
      queue.configure({
        autoElevateUsers: new Map([[kingUserId, 'high']]),
      });

      const queued = queue.enqueue(
        makeUserMessage({ userId: kingUserId, priority: 'critical' }),
      );

      // Critical is higher than high, so it should stay critical
      expect(queued.effectivePriority).toBe('critical');
    });

    it('should not affect messages from non-elevated users', () => {
      queue.configure({
        autoElevateUsers: new Map([['king-user', 'high']]),
      });

      const queued = queue.enqueue(
        makeUserMessage({ userId: 'regular-user', priority: 'low' }),
      );

      expect(queued.effectivePriority).toBe('low');
    });

    it('should elevate low priority King messages to high', () => {
      queue.configure({
        autoElevateUsers: new Map([['king-user', 'high']]),
      });

      const queued = queue.enqueue(
        makeUserMessage({ userId: 'king-user', priority: 'low' }),
      );

      expect(queued.effectivePriority).toBe('high');
    });
  });

  // -------------------------------------------------------------------------
  // Rate Limiting (Req 39.4)
  // -------------------------------------------------------------------------

  describe('rate limiting', () => {
    it('should rate-limit a user who exceeds max messages per minute', () => {
      queue.configure({ maxMessagesPerMinute: 5 });

      // Send 5 messages (at the limit)
      for (let i = 0; i < 5; i++) {
        queue.enqueue(makeUserMessage({ userId: 'spammer', content: `msg-${i}` }));
      }

      // 6th message should be rate-limited
      expect(queue.isRateLimited('spammer')).toBe(true);
      expect(() =>
        queue.enqueue(makeUserMessage({ userId: 'spammer', content: 'too many' })),
      ).toThrow('rate-limited');
    });

    it('should not rate-limit other users when one is limited', () => {
      queue.configure({ maxMessagesPerMinute: 2 });

      queue.enqueue(makeUserMessage({ userId: 'spammer', content: 'msg-1' }));
      queue.enqueue(makeUserMessage({ userId: 'spammer', content: 'msg-2' }));

      // spammer is now limited
      expect(queue.isRateLimited('spammer')).toBe(true);

      // other user is not limited
      expect(queue.isRateLimited('other-user')).toBe(false);
      expect(() =>
        queue.enqueue(makeUserMessage({ userId: 'other-user', content: 'fine' })),
      ).not.toThrow();
    });

    it('should allow messages after rate limit window expires', () => {
      queue.configure({ maxMessagesPerMinute: 2 });

      // Manually inject old timestamps to simulate window expiry
      queue.enqueue(makeUserMessage({ userId: 'user-1', content: 'msg-1' }));
      queue.enqueue(makeUserMessage({ userId: 'user-1', content: 'msg-2' }));

      expect(queue.isRateLimited('user-1')).toBe(true);

      // Simulate time passing by manipulating internal state
      const timestamps = (queue as any).userMessageTimestamps.get('user-1') as number[];
      // Move all timestamps to 2 minutes ago
      for (let i = 0; i < timestamps.length; i++) {
        timestamps[i] = Date.now() - 120_000;
      }

      // Now the user should no longer be rate-limited
      expect(queue.isRateLimited('user-1')).toBe(false);
    });

    it('should use default rate limit of 30 messages per minute', () => {
      // Send 30 messages
      for (let i = 0; i < 30; i++) {
        queue.enqueue(makeUserMessage({ userId: 'user-1', content: `msg-${i}` }));
      }

      expect(queue.isRateLimited('user-1')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Queue Size Reporting
  // -------------------------------------------------------------------------

  describe('sizeByPriority', () => {
    it('should report correct counts per priority level', () => {
      queue.enqueue(makeUserMessage({ userId: 'u1', priority: 'critical' }));
      queue.enqueue(makeUserMessage({ userId: 'u2', priority: 'high' }));
      queue.enqueue(makeUserMessage({ userId: 'u3', priority: 'high' }));
      queue.enqueue(makeUserMessage({ userId: 'u4', priority: 'normal' }));
      queue.enqueue(makeUserMessage({ userId: 'u5', priority: 'low' }));
      queue.enqueue(makeUserMessage({ userId: 'u6', priority: 'low' }));
      queue.enqueue(makeUserMessage({ userId: 'u7', priority: 'low' }));

      const sizes = queue.sizeByPriority();

      expect(sizes.critical).toBe(1);
      expect(sizes.high).toBe(2);
      expect(sizes.normal).toBe(1);
      expect(sizes.low).toBe(3);
    });

    it('should report zero for empty priority levels', () => {
      const sizes = queue.sizeByPriority();

      expect(sizes.critical).toBe(0);
      expect(sizes.high).toBe(0);
      expect(sizes.normal).toBe(0);
      expect(sizes.low).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Peek
  // -------------------------------------------------------------------------

  describe('peek', () => {
    it('should return the next message without removing it', () => {
      queue.enqueue(makeUserMessage({ priority: 'high', content: 'peeked' }));

      const peeked = queue.peek();
      expect(peeked).not.toBeNull();
      expect(peeked!.message.content).toBe('peeked');

      // Message should still be in the queue
      expect(queue.size()).toBe(1);

      // Dequeue should return the same message
      const dequeued = queue.dequeue();
      expect(dequeued!.message.content).toBe('peeked');
      expect(queue.size()).toBe(0);
    });

    it('should return null for empty queue', () => {
      expect(queue.peek()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Clear
  // -------------------------------------------------------------------------

  describe('clear', () => {
    it('should empty all priority queues', () => {
      queue.enqueue(makeUserMessage({ userId: 'u1', priority: 'critical' }));
      queue.enqueue(makeUserMessage({ userId: 'u2', priority: 'high' }));
      queue.enqueue(makeUserMessage({ userId: 'u3', priority: 'normal' }));
      queue.enqueue(makeUserMessage({ userId: 'u4', priority: 'low' }));

      expect(queue.size()).toBe(4);

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.hasCritical()).toBe(false);
      expect(queue.dequeue()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // hasCritical
  // -------------------------------------------------------------------------

  describe('hasCritical', () => {
    it('should return true when critical messages are queued', () => {
      queue.enqueue(makeUserMessage({ priority: 'critical' }));
      expect(queue.hasCritical()).toBe(true);
    });

    it('should return false when no critical messages are queued', () => {
      queue.enqueue(makeUserMessage({ priority: 'high' }));
      queue.enqueue(makeUserMessage({ userId: 'u2', priority: 'normal' }));
      expect(queue.hasCritical()).toBe(false);
    });

    it('should return false after critical message is dequeued', () => {
      queue.enqueue(makeUserMessage({ priority: 'critical' }));
      expect(queue.hasCritical()).toBe(true);

      queue.dequeue();
      expect(queue.hasCritical()).toBe(false);
    });
  });
});
