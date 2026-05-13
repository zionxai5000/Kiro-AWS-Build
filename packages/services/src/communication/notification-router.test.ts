/**
 * Notification Routing Engine — Unit Tests
 *
 * Tests for rule evaluation, multi-channel delivery, escalation,
 * acknowledgment deduplication, quiet hours, and priority filtering.
 *
 * Requirements: 41.1, 41.2, 41.3, 41.4, 38d.10, 38d.11, 38d.12, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationRoutingEngineImpl } from './notification-router.js';
import type { AgentNotification, NotificationRule, DeliveryResult } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotification(overrides: Partial<AgentNotification> = {}): AgentNotification {
  return {
    id: 'notif-1',
    agentId: 'agent-1',
    userId: 'user-1',
    type: 'task_complete',
    priority: 'normal',
    title: 'Task Done',
    body: 'Your task has been completed.',
    actionable: false,
    timestamp: new Date('2024-01-15T12:00:00Z'),
    ...overrides,
  };
}

function makeRule(overrides: Partial<NotificationRule> = {}): NotificationRule {
  return {
    id: 'rule-1',
    userId: 'user-1',
    conditions: {},
    channels: ['dashboard'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationRoutingEngineImpl', () => {
  let engine: NotificationRoutingEngineImpl;

  beforeEach(() => {
    engine = new NotificationRoutingEngineImpl();
  });

  // -------------------------------------------------------------------------
  // Rule Management
  // -------------------------------------------------------------------------

  describe('setRules / getRules', () => {
    it('stores and retrieves rules for a user', () => {
      const rules = [makeRule({ id: 'r1' }), makeRule({ id: 'r2' })];
      engine.setRules('user-1', rules);

      const retrieved = engine.getRules('user-1');
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].id).toBe('r1');
      expect(retrieved[1].id).toBe('r2');
    });

    it('returns empty array for user with no rules', () => {
      expect(engine.getRules('unknown-user')).toEqual([]);
    });

    it('replaces existing rules on subsequent setRules call', () => {
      engine.setRules('user-1', [makeRule({ id: 'r1' })]);
      engine.setRules('user-1', [makeRule({ id: 'r2' })]);

      const retrieved = engine.getRules('user-1');
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].id).toBe('r2');
    });
  });

  // -------------------------------------------------------------------------
  // Rule Evaluation Routes to Correct Channels
  // -------------------------------------------------------------------------

  describe('route — rule evaluation', () => {
    it('routes to the channel specified in a matching rule', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['telegram'] })]);

      const results = await engine.route(makeNotification());
      expect(results).toHaveLength(1);
      expect(results[0].channel).toBe('telegram');
      expect(results[0].status).toBe('delivered');
    });

    it('returns empty results when no rules match', async () => {
      engine.setRules('user-1', [
        makeRule({ conditions: { agentIds: ['agent-99'] }, channels: ['dashboard'] }),
      ]);

      const results = await engine.route(makeNotification({ agentId: 'agent-1' }));
      expect(results).toHaveLength(0);
    });

    it('returns empty results when user has no rules', async () => {
      const results = await engine.route(makeNotification());
      expect(results).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Simultaneous Multi-Channel Delivery
  // -------------------------------------------------------------------------

  describe('route — multi-channel delivery', () => {
    it('delivers to multiple channels from a single rule', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['dashboard', 'telegram', 'email'] })]);

      const results = await engine.route(makeNotification());
      expect(results).toHaveLength(3);

      const channels = results.map((r) => r.channel).sort();
      expect(channels).toEqual(['dashboard', 'email', 'telegram']);
    });

    it('deduplicates channels across multiple matching rules', async () => {
      engine.setRules('user-1', [
        makeRule({ id: 'r1', channels: ['dashboard', 'telegram'] }),
        makeRule({ id: 'r2', channels: ['telegram', 'email'] }),
      ]);

      const results = await engine.route(makeNotification());
      expect(results).toHaveLength(3);

      const channels = results.map((r) => r.channel).sort();
      expect(channels).toEqual(['dashboard', 'email', 'telegram']);
    });

    it('delivers to all channels simultaneously', async () => {
      const deliveryOrder: string[] = [];
      const engine = new NotificationRoutingEngineImpl({
        dashboard: async (n) => {
          deliveryOrder.push('dashboard');
          return { notificationId: n.id, channel: 'dashboard', status: 'delivered', deliveredAt: new Date() };
        },
        telegram: async (n) => {
          deliveryOrder.push('telegram');
          return { notificationId: n.id, channel: 'telegram', status: 'delivered', deliveredAt: new Date() };
        },
      });

      engine.setRules('user-1', [makeRule({ channels: ['dashboard', 'telegram'] })]);
      await engine.route(makeNotification());

      expect(deliveryOrder).toHaveLength(2);
      expect(deliveryOrder).toContain('dashboard');
      expect(deliveryOrder).toContain('telegram');
    });
  });

  // -------------------------------------------------------------------------
  // Escalation Triggers After Timeout
  // -------------------------------------------------------------------------

  describe('checkEscalation / escalate', () => {
    it('returns false for acknowledged notifications', async () => {
      engine.setRules('user-1', [
        makeRule({
          channels: ['dashboard'],
          escalation: { timeout: 60, escalateToChannel: 'telegram' },
        }),
      ]);

      await engine.route(makeNotification());
      engine.acknowledge('notif-1', 'dashboard');

      expect(engine.checkEscalation('notif-1')).toBe(false);
    });

    it('returns false when timeout has not elapsed', async () => {
      engine.setRules('user-1', [
        makeRule({
          channels: ['dashboard'],
          escalation: { timeout: 3600, escalateToChannel: 'telegram' },
        }),
      ]);

      await engine.route(makeNotification());
      expect(engine.checkEscalation('notif-1')).toBe(false);
    });

    it('returns true when timeout has elapsed and not acknowledged', async () => {
      engine.setRules('user-1', [
        makeRule({
          channels: ['dashboard'],
          escalation: { timeout: 0, escalateToChannel: 'telegram' }, // 0 seconds = immediate
        }),
      ]);

      await engine.route(makeNotification());
      expect(engine.checkEscalation('notif-1')).toBe(true);
    });

    it('escalates to the configured channel', async () => {
      engine.setRules('user-1', [
        makeRule({
          channels: ['dashboard'],
          escalation: { timeout: 0, escalateToChannel: 'telegram' },
        }),
      ]);

      await engine.route(makeNotification());
      const result = await engine.escalate('notif-1');

      expect(result).not.toBeNull();
      expect(result!.channel).toBe('telegram');
      expect(result!.status).toBe('delivered');
    });

    it('returns null when escalating an acknowledged notification', async () => {
      engine.setRules('user-1', [
        makeRule({
          channels: ['dashboard'],
          escalation: { timeout: 0, escalateToChannel: 'telegram' },
        }),
      ]);

      await engine.route(makeNotification());
      engine.acknowledge('notif-1', 'dashboard');

      const result = await engine.escalate('notif-1');
      expect(result).toBeNull();
    });

    it('uses default timeout for critical priority (5 min)', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['dashboard'] })]);

      // Route a critical notification
      const notif = makeNotification({ priority: 'critical' });
      await engine.route(notif);

      // Just routed, should not need escalation yet (5 min hasn't passed)
      expect(engine.checkEscalation('notif-1')).toBe(false);
    });

    it('uses default timeout for high priority (15 min)', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['dashboard'] })]);

      const notif = makeNotification({ priority: 'high' });
      await engine.route(notif);

      expect(engine.checkEscalation('notif-1')).toBe(false);
    });

    it('does not escalate normal/low priority without explicit rule', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['dashboard'] })]);

      await engine.route(makeNotification({ priority: 'low' }));
      expect(engine.checkEscalation('notif-1')).toBe(false);
    });

    it('returns false for unknown notification ID', () => {
      expect(engine.checkEscalation('nonexistent')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Acknowledgment Deduplicates Across Channels
  // -------------------------------------------------------------------------

  describe('acknowledge / isAcknowledged', () => {
    it('marks notification as acknowledged', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['dashboard', 'telegram'] })]);
      await engine.route(makeNotification());

      expect(engine.isAcknowledged('notif-1')).toBe(false);
      engine.acknowledge('notif-1', 'dashboard');
      expect(engine.isAcknowledged('notif-1')).toBe(true);
    });

    it('acknowledging on one channel deduplicates across all channels', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['dashboard', 'telegram', 'email'] })]);
      await engine.route(makeNotification());

      // Acknowledge via telegram only
      engine.acknowledge('notif-1', 'telegram');

      // Should be acknowledged globally
      expect(engine.isAcknowledged('notif-1')).toBe(true);
    });

    it('subsequent acknowledge calls are idempotent', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['dashboard'] })]);
      await engine.route(makeNotification());

      engine.acknowledge('notif-1', 'dashboard');
      engine.acknowledge('notif-1', 'telegram'); // second ack

      expect(engine.isAcknowledged('notif-1')).toBe(true);
    });

    it('returns false for unknown notification ID', () => {
      expect(engine.isAcknowledged('nonexistent')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Quiet Hours Suppress Notifications
  // -------------------------------------------------------------------------

  describe('route — quiet hours (time window)', () => {
    it('delivers when notification is within the time window', async () => {
      engine.setRules('user-1', [
        makeRule({
          conditions: {
            timeWindow: { start: '09:00', end: '17:00', timezone: 'UTC' },
          },
          channels: ['dashboard'],
        }),
      ]);

      // 12:00 UTC is within 09:00-17:00
      const results = await engine.route(
        makeNotification({ timestamp: new Date('2024-01-15T12:00:00Z') }),
      );
      expect(results).toHaveLength(1);
    });

    it('suppresses when notification is outside the time window', async () => {
      engine.setRules('user-1', [
        makeRule({
          conditions: {
            timeWindow: { start: '09:00', end: '17:00', timezone: 'UTC' },
          },
          channels: ['dashboard'],
        }),
      ]);

      // 22:00 UTC is outside 09:00-17:00
      const results = await engine.route(
        makeNotification({ timestamp: new Date('2024-01-15T22:00:00Z') }),
      );
      expect(results).toHaveLength(0);
    });

    it('handles overnight time windows correctly', async () => {
      engine.setRules('user-1', [
        makeRule({
          conditions: {
            timeWindow: { start: '22:00', end: '06:00', timezone: 'UTC' },
          },
          channels: ['dashboard'],
        }),
      ]);

      // 23:00 UTC is within 22:00-06:00
      const results = await engine.route(
        makeNotification({ timestamp: new Date('2024-01-15T23:00:00Z') }),
      );
      expect(results).toHaveLength(1);
    });

    it('suppresses during daytime for overnight window', async () => {
      engine.setRules('user-1', [
        makeRule({
          conditions: {
            timeWindow: { start: '22:00', end: '06:00', timezone: 'UTC' },
          },
          channels: ['dashboard'],
        }),
      ]);

      // 12:00 UTC is outside 22:00-06:00
      const results = await engine.route(
        makeNotification({ timestamp: new Date('2024-01-15T12:00:00Z') }),
      );
      expect(results).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Priority Threshold Filtering (priorityMin)
  // -------------------------------------------------------------------------

  describe('route — priority threshold filtering', () => {
    it('matches when notification priority equals the minimum', async () => {
      engine.setRules('user-1', [
        makeRule({ conditions: { priorityMin: 'high' }, channels: ['dashboard'] }),
      ]);

      const results = await engine.route(makeNotification({ priority: 'high' }));
      expect(results).toHaveLength(1);
    });

    it('matches when notification priority exceeds the minimum', async () => {
      engine.setRules('user-1', [
        makeRule({ conditions: { priorityMin: 'high' }, channels: ['dashboard'] }),
      ]);

      const results = await engine.route(makeNotification({ priority: 'critical' }));
      expect(results).toHaveLength(1);
    });

    it('does not match when notification priority is below the minimum', async () => {
      engine.setRules('user-1', [
        makeRule({ conditions: { priorityMin: 'high' }, channels: ['dashboard'] }),
      ]);

      const results = await engine.route(makeNotification({ priority: 'normal' }));
      expect(results).toHaveLength(0);
    });

    it('low priorityMin matches all priorities', async () => {
      engine.setRules('user-1', [
        makeRule({ conditions: { priorityMin: 'low' }, channels: ['dashboard'] }),
      ]);

      for (const priority of ['low', 'normal', 'high', 'critical'] as const) {
        const results = await engine.route(
          makeNotification({ id: `notif-${priority}`, priority }),
        );
        expect(results).toHaveLength(1);
      }
    });

    it('critical priorityMin only matches critical', async () => {
      engine.setRules('user-1', [
        makeRule({ conditions: { priorityMin: 'critical' }, channels: ['dashboard'] }),
      ]);

      const normalResults = await engine.route(
        makeNotification({ id: 'n1', priority: 'normal' }),
      );
      expect(normalResults).toHaveLength(0);

      const highResults = await engine.route(
        makeNotification({ id: 'n2', priority: 'high' }),
      );
      expect(highResults).toHaveLength(0);

      const criticalResults = await engine.route(
        makeNotification({ id: 'n3', priority: 'critical' }),
      );
      expect(criticalResults).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Agent ID Filtering
  // -------------------------------------------------------------------------

  describe('route — agent ID filtering', () => {
    it('matches when notification agentId is in the rule agentIds', async () => {
      engine.setRules('user-1', [
        makeRule({
          conditions: { agentIds: ['agent-1', 'agent-2'] },
          channels: ['dashboard'],
        }),
      ]);

      const results = await engine.route(makeNotification({ agentId: 'agent-1' }));
      expect(results).toHaveLength(1);
    });

    it('does not match when notification agentId is not in the rule agentIds', async () => {
      engine.setRules('user-1', [
        makeRule({
          conditions: { agentIds: ['agent-2', 'agent-3'] },
          channels: ['dashboard'],
        }),
      ]);

      const results = await engine.route(makeNotification({ agentId: 'agent-1' }));
      expect(results).toHaveLength(0);
    });

    it('matches all agents when agentIds is not specified', async () => {
      engine.setRules('user-1', [makeRule({ conditions: {}, channels: ['dashboard'] })]);

      const results = await engine.route(makeNotification({ agentId: 'any-agent' }));
      expect(results).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Notification Type Filtering
  // -------------------------------------------------------------------------

  describe('route — notification type filtering', () => {
    it('matches when notification type is in the rule types', async () => {
      engine.setRules('user-1', [
        makeRule({
          conditions: { notificationType: ['task_complete', 'alert'] },
          channels: ['dashboard'],
        }),
      ]);

      const results = await engine.route(makeNotification({ type: 'task_complete' }));
      expect(results).toHaveLength(1);
    });

    it('does not match when notification type is not in the rule types', async () => {
      engine.setRules('user-1', [
        makeRule({
          conditions: { notificationType: ['alert'] },
          channels: ['dashboard'],
        }),
      ]);

      const results = await engine.route(makeNotification({ type: 'task_complete' }));
      expect(results).toHaveLength(0);
    });

    it('matches all types when notificationType is not specified', async () => {
      engine.setRules('user-1', [makeRule({ conditions: {}, channels: ['dashboard'] })]);

      const results = await engine.route(makeNotification({ type: 'recommendation' }));
      expect(results).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // getUnacknowledged
  // -------------------------------------------------------------------------

  describe('getUnacknowledged', () => {
    it('returns unacknowledged notifications for a user', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['dashboard'] })]);

      await engine.route(makeNotification({ id: 'n1' }));
      await engine.route(makeNotification({ id: 'n2' }));

      const unacked = engine.getUnacknowledged('user-1');
      expect(unacked).toHaveLength(2);
    });

    it('excludes acknowledged notifications', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['dashboard'] })]);

      await engine.route(makeNotification({ id: 'n1' }));
      await engine.route(makeNotification({ id: 'n2' }));
      engine.acknowledge('n1', 'dashboard');

      const unacked = engine.getUnacknowledged('user-1');
      expect(unacked).toHaveLength(1);
      expect(unacked[0].id).toBe('n2');
    });

    it('returns empty array for user with no notifications', () => {
      expect(engine.getUnacknowledged('user-1')).toEqual([]);
    });

    it('only returns notifications for the specified user', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['dashboard'] })]);
      engine.setRules('user-2', [makeRule({ userId: 'user-2', channels: ['dashboard'] })]);

      await engine.route(makeNotification({ id: 'n1', userId: 'user-1' }));
      await engine.route(makeNotification({ id: 'n2', userId: 'user-2' }));

      const unacked = engine.getUnacknowledged('user-1');
      expect(unacked).toHaveLength(1);
      expect(unacked[0].userId).toBe('user-1');
    });
  });

  // -------------------------------------------------------------------------
  // Delivery Failure Handling
  // -------------------------------------------------------------------------

  describe('route — delivery failure handling', () => {
    it('returns failed status when channel delivery throws', async () => {
      const engine = new NotificationRoutingEngineImpl({
        dashboard: async () => {
          throw new Error('WebSocket connection failed');
        },
      });

      engine.setRules('user-1', [makeRule({ channels: ['dashboard'] })]);
      const results = await engine.route(makeNotification());

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('failed');
      expect(results[0].error).toBe('WebSocket connection failed');
    });

    it('returns failed status for unknown channel', async () => {
      engine.setRules('user-1', [makeRule({ channels: ['unknown_channel' as any] })]);
      const results = await engine.route(makeNotification());

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('failed');
      expect(results[0].error).toContain('Unknown channel');
    });
  });
});
