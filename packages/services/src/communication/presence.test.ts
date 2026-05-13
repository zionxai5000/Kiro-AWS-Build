/**
 * Agent Presence Service — Unit Tests
 *
 * Tests for real-time agent presence tracking, callback broadcasting,
 * queue depth reporting, and subscription management.
 *
 * Requirements: 37e.15, 37e.16
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentPresenceServiceImpl } from './presence.js';
import type { AgentPresence, AgentPresenceStatus } from './types.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentPresenceServiceImpl', () => {
  let service: AgentPresenceServiceImpl;

  beforeEach(() => {
    service = new AgentPresenceServiceImpl();
  });

  // -------------------------------------------------------------------------
  // Presence Updates
  // -------------------------------------------------------------------------

  describe('updatePresence', () => {
    it('creates a new presence record for an unknown agent', () => {
      service.updatePresence('agent-1', 'idle');

      const presence = service.getPresence('agent-1');
      expect(presence).toBeDefined();
      expect(presence!.agentId).toBe('agent-1');
      expect(presence!.status).toBe('idle');
      expect(presence!.queueDepth).toBe(0);
    });

    it('updates status for an existing agent', () => {
      service.updatePresence('agent-1', 'idle');
      service.updatePresence('agent-1', 'working', { currentTask: 'Processing data' });

      const presence = service.getPresence('agent-1');
      expect(presence!.status).toBe('working');
      expect(presence!.currentTask).toBe('Processing data');
    });

    it('stores currentTask when status is working', () => {
      service.updatePresence('agent-1', 'working', { currentTask: 'Building feature X' });

      const presence = service.getPresence('agent-1');
      expect(presence!.currentTask).toBe('Building feature X');
    });

    it('stores parallelTaskCount when status is parallel_processing', () => {
      service.updatePresence('agent-1', 'parallel_processing', { parallelTaskCount: 3 });

      const presence = service.getPresence('agent-1');
      expect(presence!.status).toBe('parallel_processing');
      expect(presence!.parallelTaskCount).toBe(3);
    });

    it('updates lastActivity timestamp on each update', () => {
      const before = new Date();
      service.updatePresence('agent-1', 'idle');
      const after = new Date();

      const presence = service.getPresence('agent-1');
      expect(presence!.lastActivity.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(presence!.lastActivity.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('preserves queueDepth when updating presence', () => {
      service.updatePresence('agent-1', 'idle');
      service.setQueueDepth('agent-1', 5);
      service.updatePresence('agent-1', 'working', { currentTask: 'Task A' });

      const presence = service.getPresence('agent-1');
      expect(presence!.queueDepth).toBe(5);
    });

    it('clears optional fields when not provided in update', () => {
      service.updatePresence('agent-1', 'working', { currentTask: 'Task A' });
      service.updatePresence('agent-1', 'idle');

      const presence = service.getPresence('agent-1');
      expect(presence!.currentTask).toBeUndefined();
      expect(presence!.parallelTaskCount).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // All Presence States
  // -------------------------------------------------------------------------

  describe('all presence states', () => {
    const allStatuses: AgentPresenceStatus[] = [
      'idle',
      'working',
      'waiting_input',
      'thinking',
      'parallel_processing',
      'degraded',
    ];

    it.each(allStatuses)('correctly reports status: %s', (status) => {
      service.updatePresence('agent-1', status);

      const presence = service.getPresence('agent-1');
      expect(presence!.status).toBe(status);
    });
  });

  // -------------------------------------------------------------------------
  // Callback Broadcasting (within 2 seconds SLA)
  // -------------------------------------------------------------------------

  describe('presence change callbacks', () => {
    it('fires callback synchronously on presence update (within 2 seconds)', () => {
      const callback = vi.fn();
      service.onPresenceChange(callback);

      const before = Date.now();
      service.updatePresence('agent-1', 'working', { currentTask: 'Task A' });
      const after = Date.now();

      expect(callback).toHaveBeenCalledTimes(1);
      // Synchronous call means elapsed time is effectively 0, well within 2 seconds
      expect(after - before).toBeLessThan(2000);

      const received: AgentPresence = callback.mock.calls[0][0];
      expect(received.agentId).toBe('agent-1');
      expect(received.status).toBe('working');
      expect(received.currentTask).toBe('Task A');
    });

    it('fires callback on setQueueDepth', () => {
      const callback = vi.fn();
      service.onPresenceChange(callback);

      service.setQueueDepth('agent-1', 10);

      expect(callback).toHaveBeenCalledTimes(1);
      const received: AgentPresence = callback.mock.calls[0][0];
      expect(received.queueDepth).toBe(10);
    });

    it('fires multiple callbacks for multiple subscribers', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      service.onPresenceChange(cb1);
      service.onPresenceChange(cb2);

      service.updatePresence('agent-1', 'thinking');

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('does not fire callback after unsubscription', () => {
      const callback = vi.fn();
      const subId = service.onPresenceChange(callback);

      service.updatePresence('agent-1', 'idle');
      expect(callback).toHaveBeenCalledTimes(1);

      service.offPresenceChange(subId);
      service.updatePresence('agent-1', 'working');

      expect(callback).toHaveBeenCalledTimes(1); // still 1, not 2
    });

    it('returns unique subscription IDs', () => {
      const id1 = service.onPresenceChange(() => {});
      const id2 = service.onPresenceChange(() => {});

      expect(id1).not.toBe(id2);
    });
  });

  // -------------------------------------------------------------------------
  // Queue Depth Reporting
  // -------------------------------------------------------------------------

  describe('setQueueDepth', () => {
    it('updates queue depth for an existing agent', () => {
      service.updatePresence('agent-1', 'idle');
      service.setQueueDepth('agent-1', 7);

      const presence = service.getPresence('agent-1');
      expect(presence!.queueDepth).toBe(7);
    });

    it('creates a presence record with idle status if agent is unknown', () => {
      service.setQueueDepth('agent-new', 3);

      const presence = service.getPresence('agent-new');
      expect(presence).toBeDefined();
      expect(presence!.status).toBe('idle');
      expect(presence!.queueDepth).toBe(3);
    });

    it('accurately reflects pending messages count', () => {
      service.setQueueDepth('agent-1', 0);
      expect(service.getPresence('agent-1')!.queueDepth).toBe(0);

      service.setQueueDepth('agent-1', 15);
      expect(service.getPresence('agent-1')!.queueDepth).toBe(15);

      service.setQueueDepth('agent-1', 2);
      expect(service.getPresence('agent-1')!.queueDepth).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // getAllPresences
  // -------------------------------------------------------------------------

  describe('getAllPresences', () => {
    it('returns empty array when no agents are tracked', () => {
      expect(service.getAllPresences()).toEqual([]);
    });

    it('returns all tracked agent presences', () => {
      service.updatePresence('agent-1', 'idle');
      service.updatePresence('agent-2', 'working', { currentTask: 'Task B' });
      service.updatePresence('agent-3', 'degraded');

      const all = service.getAllPresences();
      expect(all).toHaveLength(3);

      const ids = all.map((p) => p.agentId).sort();
      expect(ids).toEqual(['agent-1', 'agent-2', 'agent-3']);
    });

    it('reflects the latest state for each agent', () => {
      service.updatePresence('agent-1', 'idle');
      service.updatePresence('agent-1', 'working', { currentTask: 'Updated task' });

      const all = service.getAllPresences();
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe('working');
      expect(all[0].currentTask).toBe('Updated task');
    });
  });

  // -------------------------------------------------------------------------
  // getPresence
  // -------------------------------------------------------------------------

  describe('getPresence', () => {
    it('returns undefined for an unknown agent', () => {
      expect(service.getPresence('nonexistent')).toBeUndefined();
    });

    it('returns the current presence for a known agent', () => {
      service.updatePresence('agent-1', 'waiting_input');

      const presence = service.getPresence('agent-1');
      expect(presence).toBeDefined();
      expect(presence!.agentId).toBe('agent-1');
      expect(presence!.status).toBe('waiting_input');
    });
  });

  // -------------------------------------------------------------------------
  // Subscription Management
  // -------------------------------------------------------------------------

  describe('subscription management', () => {
    it('offPresenceChange with invalid ID does not throw', () => {
      expect(() => service.offPresenceChange('invalid-id')).not.toThrow();
    });

    it('supports multiple independent subscriptions', () => {
      const results: string[] = [];
      const sub1 = service.onPresenceChange((p) => results.push(`sub1:${p.status}`));
      const sub2 = service.onPresenceChange((p) => results.push(`sub2:${p.status}`));

      service.updatePresence('agent-1', 'idle');
      expect(results).toEqual(['sub1:idle', 'sub2:idle']);

      service.offPresenceChange(sub1);
      service.updatePresence('agent-1', 'working');
      expect(results).toEqual(['sub1:idle', 'sub2:idle', 'sub2:working']);

      service.offPresenceChange(sub2);
      service.updatePresence('agent-1', 'degraded');
      expect(results).toEqual(['sub1:idle', 'sub2:idle', 'sub2:working']);
    });
  });
});
