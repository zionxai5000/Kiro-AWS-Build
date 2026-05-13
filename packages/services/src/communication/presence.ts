/**
 * Agent Presence Service — Implementation
 *
 * Provides real-time agent presence tracking with status broadcasting.
 * Tracks agent states (idle, working, waiting_input, thinking,
 * parallel_processing, degraded) and notifies subscribers synchronously
 * on state changes (WebSocket broadcast will be wired later).
 *
 * Requirements: 37e.15, 37e.16
 */

import type {
  AgentPresence,
  AgentPresenceService,
  AgentPresenceStatus,
  PresenceChangeCallback,
} from './types.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * In-memory implementation of the Agent Presence Service.
 *
 * Maintains a map of agent presences and fires callbacks synchronously
 * on any state change. The synchronous callback model satisfies the
 * "within 2 seconds" broadcast SLA for the in-memory case; WebSocket
 * delivery will be wired as a callback consumer in a later task.
 */
export class AgentPresenceServiceImpl implements AgentPresenceService {
  private readonly presences = new Map<string, AgentPresence>();
  private readonly subscribers = new Map<string, PresenceChangeCallback>();
  private nextSubscriptionId = 1;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Update an agent's presence status.
   *
   * If the agent has no existing presence record, one is created.
   * Fires all registered callbacks synchronously after the update.
   */
  updatePresence(
    agentId: string,
    status: AgentPresenceStatus,
    details?: { currentTask?: string; parallelTaskCount?: number },
  ): void {
    const existing = this.presences.get(agentId);

    const presence: AgentPresence = {
      agentId,
      status,
      currentTask: details?.currentTask,
      parallelTaskCount: details?.parallelTaskCount,
      lastActivity: new Date(),
      queueDepth: existing?.queueDepth ?? 0,
    };

    this.presences.set(agentId, presence);
    this.notifySubscribers(presence);
  }

  /**
   * Get the current presence for a specific agent.
   * Returns undefined if the agent has never reported presence.
   */
  getPresence(agentId: string): AgentPresence | undefined {
    return this.presences.get(agentId);
  }

  /**
   * Get all tracked agent presences.
   */
  getAllPresences(): AgentPresence[] {
    return Array.from(this.presences.values());
  }

  /**
   * Update the message queue depth for an agent.
   *
   * If the agent has no existing presence record, one is created
   * with an 'idle' status. Fires callbacks after the update.
   */
  setQueueDepth(agentId: string, depth: number): void {
    const existing = this.presences.get(agentId);

    if (existing) {
      const updated: AgentPresence = { ...existing, queueDepth: depth };
      this.presences.set(agentId, updated);
      this.notifySubscribers(updated);
    } else {
      const presence: AgentPresence = {
        agentId,
        status: 'idle',
        lastActivity: new Date(),
        queueDepth: depth,
      };
      this.presences.set(agentId, presence);
      this.notifySubscribers(presence);
    }
  }

  /**
   * Subscribe to presence change events.
   * Returns a unique subscription ID for later unsubscription.
   */
  onPresenceChange(callback: PresenceChangeCallback): string {
    const id = `sub-${this.nextSubscriptionId++}`;
    this.subscribers.set(id, callback);
    return id;
  }

  /**
   * Unsubscribe from presence change events.
   */
  offPresenceChange(subscriptionId: string): void {
    this.subscribers.delete(subscriptionId);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private notifySubscribers(presence: AgentPresence): void {
    for (const callback of this.subscribers.values()) {
      callback(presence);
    }
  }
}
