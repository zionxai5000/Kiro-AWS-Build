/**
 * Unit tests for the Inter-Agent Coordination Bus.
 *
 * Requirements: 35b.7
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoordinationBusImpl } from './coordination-bus.js';
import type { CoordinationMessage } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(
  overrides: Partial<CoordinationMessage> = {},
): CoordinationMessage {
  return {
    type: 'status_update',
    fromAgent: 'agent-sender',
    dagId: 'dag-1',
    payload: { info: 'test' },
    timestamp: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CoordinationBusImpl', () => {
  let bus: CoordinationBusImpl;

  beforeEach(() => {
    bus = new CoordinationBusImpl();
  });

  // -------------------------------------------------------------------------
  // Point-to-point messaging
  // -------------------------------------------------------------------------

  describe('sendToAgent', () => {
    it('delivers a message to the target agent', async () => {
      const handler = vi.fn();
      await bus.onMessage('agent-receiver', handler);

      const msg = makeMessage({ fromAgent: 'agent-sender' });
      await bus.sendToAgent('agent-sender', 'agent-receiver', msg);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('does not deliver to agents other than the target', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      await bus.onMessage('agent-a', handler1);
      await bus.onMessage('agent-b', handler2);

      const msg = makeMessage();
      await bus.sendToAgent('agent-sender', 'agent-a', msg);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled();
    });

    it('silently drops messages when target has no subscriptions', async () => {
      const msg = makeMessage();
      // Should not throw
      await expect(
        bus.sendToAgent('agent-sender', 'non-existent', msg),
      ).resolves.toBeUndefined();
    });

    it('delivers to multiple subscriptions for the same agent', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      await bus.onMessage('agent-receiver', handler1);
      await bus.onMessage('agent-receiver', handler2);

      const msg = makeMessage();
      await bus.sendToAgent('agent-sender', 'agent-receiver', msg);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Broadcast messaging
  // -------------------------------------------------------------------------

  describe('broadcast', () => {
    it('delivers a message to all subscribed agents except the sender', async () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();
      const handlerSender = vi.fn();

      await bus.onMessage('agent-a', handlerA);
      await bus.onMessage('agent-b', handlerB);
      await bus.onMessage('agent-sender', handlerSender);

      const msg = makeMessage({ fromAgent: 'agent-sender', dagId: 'dag-1' });
      await bus.broadcast('agent-sender', 'dag-1', msg);

      expect(handlerA).toHaveBeenCalledTimes(1);
      expect(handlerA).toHaveBeenCalledWith(msg);
      expect(handlerB).toHaveBeenCalledTimes(1);
      expect(handlerB).toHaveBeenCalledWith(msg);
      expect(handlerSender).not.toHaveBeenCalled();
    });

    it('does nothing when no agents are subscribed', async () => {
      const msg = makeMessage();
      await expect(
        bus.broadcast('agent-sender', 'dag-1', msg),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Dependency signaling
  // -------------------------------------------------------------------------

  describe('signalCompletion / waitForDependency', () => {
    it('resolves a waiting task when dependency signals completion', async () => {
      const waitPromise = bus.waitForDependency('task-2', 'task-1', 5000);

      // Signal completion after a short delay
      setTimeout(() => {
        bus.signalCompletion('task-1', { result: 'done' });
      }, 10);

      const output = await waitPromise;
      expect(output).toEqual({ result: 'done' });
    });

    it('resolves immediately if dependency already completed', async () => {
      await bus.signalCompletion('task-1', { result: 'already-done' });

      const output = await bus.waitForDependency('task-2', 'task-1');
      expect(output).toEqual({ result: 'already-done' });
    });

    it('resolves multiple waiters when dependency completes', async () => {
      const wait1 = bus.waitForDependency('task-2', 'task-1', 5000);
      const wait2 = bus.waitForDependency('task-3', 'task-1', 5000);

      await bus.signalCompletion('task-1', 42);

      const [out1, out2] = await Promise.all([wait1, wait2]);
      expect(out1).toBe(42);
      expect(out2).toBe(42);
    });

    it('rejects with timeout error when dependency does not complete in time', async () => {
      vi.useFakeTimers();

      const waitPromise = bus.waitForDependency('task-2', 'task-1', 100);

      vi.advanceTimersByTime(101);

      await expect(waitPromise).rejects.toThrow(
        'Timeout waiting for dependency "task-1" (task "task-2") after 100ms',
      );

      vi.useRealTimers();
    });

    it('uses default timeout of 30000ms', async () => {
      vi.useFakeTimers();

      const waitPromise = bus.waitForDependency('task-2', 'task-1');

      // Advance just under the default timeout — should not reject yet
      vi.advanceTimersByTime(29_999);

      // Advance past the timeout
      vi.advanceTimersByTime(2);

      await expect(waitPromise).rejects.toThrow('after 30000ms');

      vi.useRealTimers();
    });

    it('clears timeout when dependency completes before timeout', async () => {
      vi.useFakeTimers();

      const waitPromise = bus.waitForDependency('task-2', 'task-1', 5000);

      // Signal before timeout
      await bus.signalCompletion('task-1', 'fast');

      const output = await waitPromise;
      expect(output).toBe('fast');

      // Advancing timers should not cause any issues
      vi.advanceTimersByTime(10_000);

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Intermediate result sharing
  // -------------------------------------------------------------------------

  describe('shareIntermediateResult / getIntermediateResult', () => {
    it('stores and retrieves an intermediate result', async () => {
      await bus.shareIntermediateResult('agent-1', 'dag-1', 'analysis', {
        score: 95,
      });

      const result = await bus.getIntermediateResult('dag-1', 'analysis');
      expect(result).toEqual({ score: 95 });
    });

    it('returns null for non-existent keys', async () => {
      const result = await bus.getIntermediateResult('dag-1', 'missing-key');
      expect(result).toBeNull();
    });

    it('overwrites previously stored values for the same key', async () => {
      await bus.shareIntermediateResult('agent-1', 'dag-1', 'data', 'v1');
      await bus.shareIntermediateResult('agent-2', 'dag-1', 'data', 'v2');

      const result = await bus.getIntermediateResult('dag-1', 'data');
      expect(result).toBe('v2');
    });

    it('isolates results between different DAGs', async () => {
      await bus.shareIntermediateResult('agent-1', 'dag-1', 'key', 'value-1');
      await bus.shareIntermediateResult('agent-1', 'dag-2', 'key', 'value-2');

      const result1 = await bus.getIntermediateResult('dag-1', 'key');
      const result2 = await bus.getIntermediateResult('dag-2', 'key');

      expect(result1).toBe('value-1');
      expect(result2).toBe('value-2');
    });
  });

  // -------------------------------------------------------------------------
  // Subscription management
  // -------------------------------------------------------------------------

  describe('onMessage / offMessage', () => {
    it('returns a unique subscription ID', async () => {
      const id1 = await bus.onMessage('agent-1', vi.fn());
      const id2 = await bus.onMessage('agent-1', vi.fn());

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('stops delivering messages after unsubscribe', async () => {
      const handler = vi.fn();
      const subId = await bus.onMessage('agent-1', handler);

      // First message should be delivered
      const msg1 = makeMessage();
      await bus.sendToAgent('sender', 'agent-1', msg1);
      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      await bus.offMessage(subId);

      // Second message should not be delivered
      const msg2 = makeMessage();
      await bus.sendToAgent('sender', 'agent-1', msg2);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('unsubscribing a non-existent ID does not throw', async () => {
      await expect(bus.offMessage('non-existent-id')).resolves.toBeUndefined();
    });

    it('only removes the specific subscription, not all for the agent', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const subId1 = await bus.onMessage('agent-1', handler1);
      await bus.onMessage('agent-1', handler2);

      // Unsubscribe only the first
      await bus.offMessage(subId1);

      const msg = makeMessage();
      await bus.sendToAgent('sender', 'agent-1', msg);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});
