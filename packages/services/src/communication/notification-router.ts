/**
 * Notification Routing Engine — Implementation
 *
 * Routes agent notifications to the correct channels based on per-user rules,
 * handles escalation for unacknowledged notifications, and deduplicates
 * acknowledgments across channels.
 *
 * Requirements: 41.1, 41.2, 41.3, 41.4, 38d.10, 38d.11, 38d.12
 */

import type {
  NotificationRule,
  AgentNotification,
  DeliveryResult,
  NotificationRoutingEngine,
} from './types.js';

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface TrackedNotification {
  notification: AgentNotification;
  deliveries: DeliveryResult[];
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedChannel?: string;
  routedAt: Date;
  escalationRule?: NotificationRule['escalation'];
}

// ---------------------------------------------------------------------------
// Priority Ordering (lower number = higher priority)
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ---------------------------------------------------------------------------
// Channel Delivery Functions
// ---------------------------------------------------------------------------

export type ChannelDeliveryFn = (notification: AgentNotification) => Promise<DeliveryResult>;

/** Default channel delivery functions (stubs for real integrations). */
function defaultDashboardDelivery(notification: AgentNotification): Promise<DeliveryResult> {
  return Promise.resolve({
    notificationId: notification.id,
    channel: 'dashboard',
    status: 'delivered',
    deliveredAt: new Date(),
  });
}

function defaultTelegramDelivery(notification: AgentNotification): Promise<DeliveryResult> {
  return Promise.resolve({
    notificationId: notification.id,
    channel: 'telegram',
    status: 'delivered',
    deliveredAt: new Date(),
  });
}

function defaultEmailDelivery(notification: AgentNotification): Promise<DeliveryResult> {
  return Promise.resolve({
    notificationId: notification.id,
    channel: 'email',
    status: 'delivered',
    deliveredAt: new Date(),
  });
}

function defaultImessageDelivery(notification: AgentNotification): Promise<DeliveryResult> {
  return Promise.resolve({
    notificationId: notification.id,
    channel: 'imessage',
    status: 'delivered',
    deliveredAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class NotificationRoutingEngineImpl implements NotificationRoutingEngine {
  private rules: Map<string, NotificationRule[]> = new Map();
  private tracked: Map<string, TrackedNotification> = new Map();
  private channelDelivery: Record<string, ChannelDeliveryFn>;

  constructor(channelOverrides?: Partial<Record<string, ChannelDeliveryFn>>) {
    this.channelDelivery = {
      dashboard: defaultDashboardDelivery,
      telegram: defaultTelegramDelivery,
      email: defaultEmailDelivery,
      imessage: defaultImessageDelivery,
      ...channelOverrides,
    };
  }

  // -------------------------------------------------------------------------
  // Rule Management
  // -------------------------------------------------------------------------

  setRules(userId: string, rules: NotificationRule[]): void {
    this.rules.set(userId, [...rules]);
  }

  getRules(userId: string): NotificationRule[] {
    return this.rules.get(userId) ?? [];
  }

  // -------------------------------------------------------------------------
  // Routing
  // -------------------------------------------------------------------------

  async route(notification: AgentNotification): Promise<DeliveryResult[]> {
    const userRules = this.rules.get(notification.userId) ?? [];
    const matchingChannels = new Set<string>();
    let escalationRule: NotificationRule['escalation'] | undefined;

    for (const rule of userRules) {
      if (this.ruleMatches(rule, notification)) {
        for (const channel of rule.channels) {
          matchingChannels.add(channel);
        }
        // Use the first matching escalation rule
        if (!escalationRule && rule.escalation) {
          escalationRule = rule.escalation;
        }
      }
    }

    // Deliver to all matching channels simultaneously
    const deliveryPromises = Array.from(matchingChannels).map((channel) =>
      this.deliverToChannel(channel, notification),
    );

    const results = await Promise.all(deliveryPromises);

    // Track the notification
    this.tracked.set(notification.id, {
      notification,
      deliveries: results,
      acknowledged: false,
      routedAt: new Date(),
      escalationRule,
    });

    return results;
  }

  // -------------------------------------------------------------------------
  // Acknowledgment
  // -------------------------------------------------------------------------

  acknowledge(notificationId: string, _channel: string): void {
    const entry = this.tracked.get(notificationId);
    if (entry && !entry.acknowledged) {
      entry.acknowledged = true;
      entry.acknowledgedAt = new Date();
      entry.acknowledgedChannel = _channel;
    }
  }

  isAcknowledged(notificationId: string): boolean {
    const entry = this.tracked.get(notificationId);
    return entry?.acknowledged ?? false;
  }

  // -------------------------------------------------------------------------
  // Escalation
  // -------------------------------------------------------------------------

  checkEscalation(notificationId: string): boolean {
    const entry = this.tracked.get(notificationId);
    if (!entry || entry.acknowledged) {
      return false;
    }

    const escalation = entry.escalationRule;
    if (!escalation) {
      // Use default timeouts based on priority
      const defaultTimeouts: Record<string, number> = {
        critical: 5 * 60, // 5 minutes
        high: 15 * 60, // 15 minutes
      };
      const timeout = defaultTimeouts[entry.notification.priority];
      if (!timeout) {
        return false;
      }
      const elapsed = (Date.now() - entry.routedAt.getTime()) / 1000;
      return elapsed >= timeout;
    }

    const elapsed = (Date.now() - entry.routedAt.getTime()) / 1000;
    return elapsed >= escalation.timeout;
  }

  async escalate(notificationId: string): Promise<DeliveryResult | null> {
    const entry = this.tracked.get(notificationId);
    if (!entry || entry.acknowledged) {
      return null;
    }

    // Determine escalation channel
    let escalateToChannel: string;
    if (entry.escalationRule) {
      escalateToChannel = entry.escalationRule.escalateToChannel;
    } else {
      // Default escalation: critical → dashboard + telegram, high → dashboard
      const defaults: Record<string, string> = {
        critical: 'telegram',
        high: 'dashboard',
      };
      escalateToChannel = defaults[entry.notification.priority] ?? 'dashboard';
    }

    const result = await this.deliverToChannel(escalateToChannel, entry.notification);
    entry.deliveries.push(result);
    return result;
  }

  // -------------------------------------------------------------------------
  // Unacknowledged Notifications
  // -------------------------------------------------------------------------

  getUnacknowledged(userId: string): AgentNotification[] {
    const results: AgentNotification[] = [];
    for (const entry of this.tracked.values()) {
      if (entry.notification.userId === userId && !entry.acknowledged) {
        results.push(entry.notification);
      }
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private ruleMatches(rule: NotificationRule, notification: AgentNotification): boolean {
    const { conditions } = rule;

    // Check agent ID filter
    if (conditions.agentIds && conditions.agentIds.length > 0) {
      if (!conditions.agentIds.includes(notification.agentId)) {
        return false;
      }
    }

    // Check priority minimum (notification priority must be >= rule minimum)
    if (conditions.priorityMin) {
      const notifPriority = PRIORITY_ORDER[notification.priority] ?? 3;
      const minPriority = PRIORITY_ORDER[conditions.priorityMin] ?? 3;
      // Lower number = higher priority, so notification must have <= number
      if (notifPriority > minPriority) {
        return false;
      }
    }

    // Check notification type filter
    if (conditions.notificationType && conditions.notificationType.length > 0) {
      if (!conditions.notificationType.includes(notification.type)) {
        return false;
      }
    }

    // Check time window (quiet hours — suppress if OUTSIDE the window)
    if (conditions.timeWindow) {
      if (!this.isWithinTimeWindow(conditions.timeWindow, notification.timestamp)) {
        return false;
      }
    }

    return true;
  }

  private isWithinTimeWindow(
    window: { start: string; end: string; timezone: string },
    timestamp: Date,
  ): boolean {
    // Parse HH:MM format for start and end
    const [startHour, startMin] = window.start.split(':').map(Number);
    const [endHour, endMin] = window.end.split(':').map(Number);

    // Get the hour and minute from the timestamp
    // For simplicity, use UTC offset approach. In production, use a timezone library.
    const hour = timestamp.getUTCHours();
    const minute = timestamp.getUTCMinutes();

    const currentMinutes = hour * 60 + minute;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes <= endMinutes) {
      // Normal range (e.g., 09:00 - 17:00)
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Overnight range (e.g., 22:00 - 06:00)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  private async deliverToChannel(
    channel: string,
    notification: AgentNotification,
  ): Promise<DeliveryResult> {
    const deliveryFn = this.channelDelivery[channel];
    if (!deliveryFn) {
      return {
        notificationId: notification.id,
        channel,
        status: 'failed',
        error: `Unknown channel: ${channel}`,
      };
    }

    try {
      return await deliveryFn(notification);
    } catch (error) {
      return {
        notificationId: notification.id,
        channel,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
