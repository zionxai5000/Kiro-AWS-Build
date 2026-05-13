/**
 * Delegation Visibility Service — Unit Tests
 *
 * Tests for delegation recording, status updates, parallel groups,
 * callback broadcasting, and query methods.
 *
 * Requirements: 40.1, 40.2, 40.3, 40.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DelegationVisibilityServiceImpl } from './delegation-visibility.js';
import type { DelegationRecord } from './types.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DelegationVisibilityServiceImpl', () => {
  let service: DelegationVisibilityServiceImpl;

  beforeEach(() => {
    service = new DelegationVisibilityServiceImpl();
  });

  // -------------------------------------------------------------------------
  // Delegation Recording
  // -------------------------------------------------------------------------

  describe('recordDelegation', () => {
    it('creates a delegation record with generated ID and timestamp', () => {
      const before = new Date();
      const record = service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'agent-a',
        toAgentId: 'agent-b',
        taskDescription: 'Analyze market data',
        status: 'pending',
        isParallel: false,
      });
      const after = new Date();

      expect(record.id).toBeDefined();
      expect(record.id).toMatch(/^del-/);
      expect(record.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(record.startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('captures correct metadata from the delegation input', () => {
      const record = service.recordDelegation({
        parentMessageId: 'msg-42',
        fromAgentId: 'seraphim',
        toAgentId: 'eretz',
        taskDescription: 'Generate portfolio report',
        status: 'pending',
        isParallel: true,
        parallelGroupId: 'group-1',
      });

      expect(record.parentMessageId).toBe('msg-42');
      expect(record.fromAgentId).toBe('seraphim');
      expect(record.toAgentId).toBe('eretz');
      expect(record.taskDescription).toBe('Generate portfolio report');
      expect(record.status).toBe('pending');
      expect(record.isParallel).toBe(true);
      expect(record.parallelGroupId).toBe('group-1');
    });

    it('generates unique IDs for each delegation', () => {
      const r1 = service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'a',
        toAgentId: 'b',
        taskDescription: 'Task 1',
        status: 'pending',
        isParallel: false,
      });
      const r2 = service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'a',
        toAgentId: 'c',
        taskDescription: 'Task 2',
        status: 'pending',
        isParallel: false,
      });

      expect(r1.id).not.toBe(r2.id);
    });
  });

  // -------------------------------------------------------------------------
  // Status Updates
  // -------------------------------------------------------------------------

  describe('updateStatus', () => {
    it('updates delegation status from pending to in_progress', () => {
      const record = service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'a',
        toAgentId: 'b',
        taskDescription: 'Task',
        status: 'pending',
        isParallel: false,
      });

      service.updateStatus(record.id, 'in_progress');

      const delegations = service.getDelegationsForMessage('msg-1');
      expect(delegations[0].status).toBe('in_progress');
    });

    it('sets completedAt when status transitions to completed', () => {
      const record = service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'a',
        toAgentId: 'b',
        taskDescription: 'Task',
        status: 'pending',
        isParallel: false,
      });

      const before = new Date();
      service.updateStatus(record.id, 'completed', 'Done successfully');
      const after = new Date();

      const delegations = service.getDelegationsForMessage('msg-1');
      expect(delegations[0].status).toBe('completed');
      expect(delegations[0].result).toBe('Done successfully');
      expect(delegations[0].completedAt).toBeDefined();
      expect(delegations[0].completedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(delegations[0].completedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('sets completedAt when status transitions to failed', () => {
      const record = service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'a',
        toAgentId: 'b',
        taskDescription: 'Task',
        status: 'pending',
        isParallel: false,
      });

      service.updateStatus(record.id, 'failed', 'Timeout error');

      const delegations = service.getDelegationsForMessage('msg-1');
      expect(delegations[0].status).toBe('failed');
      expect(delegations[0].result).toBe('Timeout error');
      expect(delegations[0].completedAt).toBeDefined();
    });

    it('is a no-op for unknown delegation IDs', () => {
      expect(() => service.updateStatus('nonexistent', 'completed')).not.toThrow();
    });

    it('propagates status updates to callbacks', () => {
      const callback = vi.fn();
      service.onDelegationChange(callback);

      const record = service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'a',
        toAgentId: 'b',
        taskDescription: 'Task',
        status: 'pending',
        isParallel: false,
      });

      // First call is from recordDelegation
      expect(callback).toHaveBeenCalledTimes(1);

      service.updateStatus(record.id, 'in_progress');
      expect(callback).toHaveBeenCalledTimes(2);

      const updatedRecord: DelegationRecord = callback.mock.calls[1][0];
      expect(updatedRecord.status).toBe('in_progress');
      expect(updatedRecord.id).toBe(record.id);
    });
  });

  // -------------------------------------------------------------------------
  // Query Methods
  // -------------------------------------------------------------------------

  describe('getDelegationsForMessage', () => {
    it('returns all delegations for a given message', () => {
      service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'a',
        toAgentId: 'b',
        taskDescription: 'Task 1',
        status: 'pending',
        isParallel: false,
      });
      service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'a',
        toAgentId: 'c',
        taskDescription: 'Task 2',
        status: 'pending',
        isParallel: false,
      });
      service.recordDelegation({
        parentMessageId: 'msg-2',
        fromAgentId: 'a',
        toAgentId: 'd',
        taskDescription: 'Task 3',
        status: 'pending',
        isParallel: false,
      });

      const result = service.getDelegationsForMessage('msg-1');
      expect(result).toHaveLength(2);
      expect(result.map((d) => d.taskDescription)).toEqual(['Task 1', 'Task 2']);
    });

    it('returns empty array for unknown message ID', () => {
      expect(service.getDelegationsForMessage('nonexistent')).toEqual([]);
    });
  });

  describe('getActiveDelegations', () => {
    it('returns only pending and in_progress delegations for an agent', () => {
      const r1 = service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'agent-a',
        toAgentId: 'agent-b',
        taskDescription: 'Active task',
        status: 'pending',
        isParallel: false,
      });
      service.recordDelegation({
        parentMessageId: 'msg-2',
        fromAgentId: 'agent-a',
        toAgentId: 'agent-c',
        taskDescription: 'In progress task',
        status: 'in_progress',
        isParallel: false,
      });
      const r3 = service.recordDelegation({
        parentMessageId: 'msg-3',
        fromAgentId: 'agent-a',
        toAgentId: 'agent-d',
        taskDescription: 'Completed task',
        status: 'pending',
        isParallel: false,
      });
      service.updateStatus(r3.id, 'completed');

      const active = service.getActiveDelegations('agent-a');
      expect(active).toHaveLength(2);
      expect(active.map((d) => d.taskDescription).sort()).toEqual([
        'Active task',
        'In progress task',
      ]);
    });

    it('includes delegations where agent is the delegatee', () => {
      service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'agent-x',
        toAgentId: 'agent-b',
        taskDescription: 'Received task',
        status: 'in_progress',
        isParallel: false,
      });

      const active = service.getActiveDelegations('agent-b');
      expect(active).toHaveLength(1);
      expect(active[0].taskDescription).toBe('Received task');
    });
  });

  // -------------------------------------------------------------------------
  // Parallel Delegation Display
  // -------------------------------------------------------------------------

  describe('getParallelGroup', () => {
    it('returns all delegations in a parallel group', () => {
      service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'seraphim',
        toAgentId: 'eretz',
        taskDescription: 'Market analysis',
        status: 'pending',
        isParallel: true,
        parallelGroupId: 'pg-1',
      });
      service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'seraphim',
        toAgentId: 'zionx',
        taskDescription: 'Risk assessment',
        status: 'pending',
        isParallel: true,
        parallelGroupId: 'pg-1',
      });
      service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'seraphim',
        toAgentId: 'zxmg',
        taskDescription: 'Content generation',
        status: 'pending',
        isParallel: true,
        parallelGroupId: 'pg-1',
      });
      // Different group
      service.recordDelegation({
        parentMessageId: 'msg-2',
        fromAgentId: 'seraphim',
        toAgentId: 'eretz',
        taskDescription: 'Other task',
        status: 'pending',
        isParallel: true,
        parallelGroupId: 'pg-2',
      });

      const group = service.getParallelGroup('pg-1');
      expect(group).toHaveLength(3);
      expect(group.map((d) => d.toAgentId).sort()).toEqual(['eretz', 'zionx', 'zxmg']);
    });

    it('shows individual progress for each stream in a parallel group', () => {
      const r1 = service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'seraphim',
        toAgentId: 'eretz',
        taskDescription: 'Task A',
        status: 'pending',
        isParallel: true,
        parallelGroupId: 'pg-1',
      });
      const r2 = service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'seraphim',
        toAgentId: 'zionx',
        taskDescription: 'Task B',
        status: 'pending',
        isParallel: true,
        parallelGroupId: 'pg-1',
      });

      service.updateStatus(r1.id, 'completed', 'Done');
      service.updateStatus(r2.id, 'in_progress');

      const group = service.getParallelGroup('pg-1');
      const eretzDelegation = group.find((d) => d.toAgentId === 'eretz')!;
      const zionxDelegation = group.find((d) => d.toAgentId === 'zionx')!;

      expect(eretzDelegation.status).toBe('completed');
      expect(eretzDelegation.result).toBe('Done');
      expect(zionxDelegation.status).toBe('in_progress');
    });

    it('returns empty array for unknown group ID', () => {
      expect(service.getParallelGroup('nonexistent')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Callback Subscription
  // -------------------------------------------------------------------------

  describe('delegation change callbacks', () => {
    it('fires callback on new delegation recording', () => {
      const callback = vi.fn();
      service.onDelegationChange(callback);

      const record = service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'a',
        toAgentId: 'b',
        taskDescription: 'Task',
        status: 'pending',
        isParallel: false,
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({
        id: record.id,
        status: 'pending',
      });
    });

    it('fires multiple callbacks for multiple subscribers', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      service.onDelegationChange(cb1);
      service.onDelegationChange(cb2);

      service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'a',
        toAgentId: 'b',
        taskDescription: 'Task',
        status: 'pending',
        isParallel: false,
      });

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('does not fire callback after unsubscription', () => {
      const callback = vi.fn();
      const subId = service.onDelegationChange(callback);

      service.recordDelegation({
        parentMessageId: 'msg-1',
        fromAgentId: 'a',
        toAgentId: 'b',
        taskDescription: 'Task',
        status: 'pending',
        isParallel: false,
      });
      expect(callback).toHaveBeenCalledTimes(1);

      service.offDelegationChange(subId);

      service.recordDelegation({
        parentMessageId: 'msg-2',
        fromAgentId: 'a',
        toAgentId: 'c',
        taskDescription: 'Task 2',
        status: 'pending',
        isParallel: false,
      });
      expect(callback).toHaveBeenCalledTimes(1); // still 1
    });

    it('returns unique subscription IDs', () => {
      const id1 = service.onDelegationChange(() => {});
      const id2 = service.onDelegationChange(() => {});
      expect(id1).not.toBe(id2);
    });

    it('offDelegationChange with invalid ID does not throw', () => {
      expect(() => service.offDelegationChange('invalid-id')).not.toThrow();
    });
  });
});
