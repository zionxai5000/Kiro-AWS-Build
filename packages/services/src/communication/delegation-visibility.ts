/**
 * Delegation Visibility Service — Implementation
 *
 * Tracks agent-to-agent delegations during message processing,
 * provides real-time status updates via callbacks, and supports
 * parallel delegation grouping for multi-stream display.
 *
 * Requirements: 40.1, 40.2, 40.3, 40.4
 */

import type {
  DelegationRecord,
  DelegationChangeCallback,
  DelegationVisibilityService,
} from './types.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * In-memory implementation of the Delegation Visibility Service.
 *
 * Maintains a store of delegation records and fires callbacks
 * synchronously on any record creation or status change. Supports
 * parallel delegation groups for simultaneous multi-agent display.
 */
export class DelegationVisibilityServiceImpl implements DelegationVisibilityService {
  private readonly delegations = new Map<string, DelegationRecord>();
  private readonly subscribers = new Map<string, DelegationChangeCallback>();
  private nextId = 1;
  private nextSubscriptionId = 1;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Record a new delegation.
   *
   * Generates a unique ID and sets the startedAt timestamp.
   * Fires all registered callbacks with the new record.
   */
  recordDelegation(delegation: Omit<DelegationRecord, 'id' | 'startedAt'>): DelegationRecord {
    const record: DelegationRecord = {
      ...delegation,
      id: `del-${this.nextId++}`,
      startedAt: new Date(),
    };

    this.delegations.set(record.id, record);
    this.notifySubscribers(record);
    return record;
  }

  /**
   * Update the status of an existing delegation.
   *
   * Sets completedAt when status transitions to 'completed' or 'failed'.
   * Fires all registered callbacks with the updated record.
   * No-op if the delegation ID is not found.
   */
  updateStatus(delegationId: string, status: DelegationRecord['status'], result?: string): void {
    const existing = this.delegations.get(delegationId);
    if (!existing) return;

    const updated: DelegationRecord = {
      ...existing,
      status,
      result: result ?? existing.result,
      completedAt: status === 'completed' || status === 'failed' ? new Date() : existing.completedAt,
    };

    this.delegations.set(delegationId, updated);
    this.notifySubscribers(updated);
  }

  /**
   * Get all delegations triggered by a specific message.
   */
  getDelegationsForMessage(messageId: string): DelegationRecord[] {
    return Array.from(this.delegations.values()).filter(
      (d) => d.parentMessageId === messageId,
    );
  }

  /**
   * Get all active (pending or in_progress) delegations for an agent.
   * Includes delegations where the agent is either the delegator or delegatee.
   */
  getActiveDelegations(agentId: string): DelegationRecord[] {
    return Array.from(this.delegations.values()).filter(
      (d) =>
        (d.fromAgentId === agentId || d.toAgentId === agentId) &&
        (d.status === 'pending' || d.status === 'in_progress'),
    );
  }

  /**
   * Get all delegations in a parallel group.
   */
  getParallelGroup(groupId: string): DelegationRecord[] {
    return Array.from(this.delegations.values()).filter(
      (d) => d.parallelGroupId === groupId,
    );
  }

  /**
   * Subscribe to delegation change events.
   * Returns a unique subscription ID for later unsubscription.
   */
  onDelegationChange(callback: DelegationChangeCallback): string {
    const id = `del-sub-${this.nextSubscriptionId++}`;
    this.subscribers.set(id, callback);
    return id;
  }

  /**
   * Unsubscribe from delegation change events.
   */
  offDelegationChange(subscriptionId: string): void {
    this.subscribers.delete(subscriptionId);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private notifySubscribers(delegation: DelegationRecord): void {
    for (const callback of this.subscribers.values()) {
      callback(delegation);
    }
  }
}
