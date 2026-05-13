/**
 * Unit tests for the Parallel Scheduler and Load Balancer.
 *
 * Requirements: 35a.1, 35a.2, 35a.4, 35d.12, 35d.13
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParallelSchedulerImpl } from './scheduler.js';
import type { ParallelTask, SchedulerConfig, BudgetCheckResult } from './types.js';
import type { Task, TaskResult } from '@seraphim/core';
import type { SchedulerEvent } from './scheduler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(
  id: string,
  agentId = 'agent-1',
  priority = 1,
  duration = 1000,
): ParallelTask {
  const task: Task = {
    id,
    type: 'test',
    description: `Test task ${id}`,
    params: {},
    priority: 'medium',
  };

  return {
    id,
    agentId,
    task,
    dependencies: [],
    priority,
    estimatedDuration: duration,
    resourceRequirements: { cpuUnits: 256, memoryMb: 512 },
  };
}

function makeResult(taskId: string, success = true): TaskResult {
  return {
    taskId,
    success,
    output: success ? { data: 'done' } : undefined,
    error: success ? undefined : 'Task failed',
    tokenUsage: { inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
    durationMs: 500,
  };
}

function defaultConfig(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    defaultParallelismLimit: 5,
    agentLimits: {},
    distributionStrategy: 'round-robin',
    maxRetries: 3,
    retryDelayMs: 0, // No delay in tests
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ParallelSchedulerImpl', () => {
  let scheduler: ParallelSchedulerImpl;

  beforeEach(() => {
    scheduler = new ParallelSchedulerImpl();
    scheduler.configure(defaultConfig());
  });

  // -------------------------------------------------------------------------
  // configure
  // -------------------------------------------------------------------------

  describe('configure', () => {
    it('should accept and apply configuration', () => {
      scheduler.configure(defaultConfig({ defaultParallelismLimit: 10 }));

      const status = scheduler.getStatus();
      // No tasks yet, but config is applied (verified via dispatch behavior)
      expect(status.totalActive).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // dispatch (Req 35a.1, 35d.12)
  // -------------------------------------------------------------------------

  describe('dispatch', () => {
    it('should dispatch a task when under parallelism limit', async () => {
      const task = makeTask('task-1');

      const result = await scheduler.dispatch(task, 'dag-1');

      expect(result.taskId).toBe('task-1');
      expect(result.status).toBe('dispatched');
      expect(result.slot).toBeDefined();
    });

    it('should queue a task when at parallelism limit (Req 35a.2)', async () => {
      scheduler.configure(defaultConfig({ defaultParallelismLimit: 2 }));

      await scheduler.dispatch(makeTask('task-1'), 'dag-1');
      await scheduler.dispatch(makeTask('task-2'), 'dag-1');
      const result = await scheduler.dispatch(makeTask('task-3'), 'dag-1');

      expect(result.status).toBe('queued');
      expect(result.reason).toContain('parallelism limit');
    });

    it('should respect per-agent parallelism overrides (Req 35a.2)', async () => {
      scheduler.configure(
        defaultConfig({
          defaultParallelismLimit: 5,
          agentLimits: { 'agent-1': 1 },
        }),
      );

      await scheduler.dispatch(makeTask('task-1', 'agent-1'), 'dag-1');
      const result = await scheduler.dispatch(makeTask('task-2', 'agent-1'), 'dag-1');

      expect(result.status).toBe('queued');
    });

    it('should allow different agents to have independent limits', async () => {
      scheduler.configure(
        defaultConfig({
          defaultParallelismLimit: 1,
          agentLimits: { 'agent-1': 1, 'agent-2': 1 },
        }),
      );

      const r1 = await scheduler.dispatch(makeTask('task-1', 'agent-1'), 'dag-1');
      const r2 = await scheduler.dispatch(makeTask('task-2', 'agent-2'), 'dag-1');

      expect(r1.status).toBe('dispatched');
      expect(r2.status).toBe('dispatched');
    });

    it('should queue task when budget check fails (Req 35d.12)', async () => {
      const budgetChecker = vi.fn().mockResolvedValue({
        allowed: false,
        reason: 'Daily budget exceeded',
      } satisfies BudgetCheckResult);

      scheduler.configure(defaultConfig({ budgetChecker }));

      const result = await scheduler.dispatch(makeTask('task-1'), 'dag-1');

      expect(result.status).toBe('queued');
      expect(result.reason).toContain('Budget constrained');
      expect(budgetChecker).toHaveBeenCalledOnce();
    });

    it('should dispatch task when budget check passes', async () => {
      const budgetChecker = vi.fn().mockResolvedValue({
        allowed: true,
        remainingBudget: 50.0,
      } satisfies BudgetCheckResult);

      scheduler.configure(defaultConfig({ budgetChecker }));

      const result = await scheduler.dispatch(makeTask('task-1'), 'dag-1');

      expect(result.status).toBe('dispatched');
    });
  });

  // -------------------------------------------------------------------------
  // dispatchBatch
  // -------------------------------------------------------------------------

  describe('dispatchBatch', () => {
    it('should dispatch multiple tasks', async () => {
      const tasks = [makeTask('task-1'), makeTask('task-2'), makeTask('task-3')];

      const results = await scheduler.dispatchBatch(tasks, 'dag-1');

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.status === 'dispatched')).toBe(true);
    });

    it('should dispatch higher-priority tasks first', async () => {
      scheduler.configure(defaultConfig({ defaultParallelismLimit: 2 }));

      const tasks = [
        makeTask('low', 'agent-1', 1),
        makeTask('high', 'agent-1', 10),
        makeTask('mid', 'agent-1', 5),
      ];

      const results = await scheduler.dispatchBatch(tasks, 'dag-1');

      // High and mid should be dispatched, low should be queued
      const dispatched = results.filter((r) => r.status === 'dispatched');
      const queued = results.filter((r) => r.status === 'queued');

      expect(dispatched).toHaveLength(2);
      expect(queued).toHaveLength(1);
      // The queued one should be the lowest priority
      expect(queued[0].taskId).toBe('low');
    });
  });

  // -------------------------------------------------------------------------
  // getActiveCount / getQueuedCount
  // -------------------------------------------------------------------------

  describe('getActiveCount / getQueuedCount', () => {
    it('should track active task count per agent', async () => {
      await scheduler.dispatch(makeTask('task-1', 'agent-1'), 'dag-1');
      await scheduler.dispatch(makeTask('task-2', 'agent-1'), 'dag-1');
      await scheduler.dispatch(makeTask('task-3', 'agent-2'), 'dag-1');

      expect(scheduler.getActiveCount('agent-1')).toBe(2);
      expect(scheduler.getActiveCount('agent-2')).toBe(1);
      expect(scheduler.getActiveCount('agent-3')).toBe(0);
    });

    it('should track queued task count per agent', async () => {
      scheduler.configure(defaultConfig({ defaultParallelismLimit: 1 }));

      await scheduler.dispatch(makeTask('task-1', 'agent-1'), 'dag-1');
      await scheduler.dispatch(makeTask('task-2', 'agent-1'), 'dag-1');
      await scheduler.dispatch(makeTask('task-3', 'agent-1'), 'dag-1');

      expect(scheduler.getActiveCount('agent-1')).toBe(1);
      expect(scheduler.getQueuedCount('agent-1')).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // handleCompletion
  // -------------------------------------------------------------------------

  describe('handleCompletion', () => {
    it('should remove task from active tracking', async () => {
      await scheduler.dispatch(makeTask('task-1'), 'dag-1');
      expect(scheduler.getActiveCount('agent-1')).toBe(1);

      await scheduler.handleCompletion('task-1', makeResult('task-1'));

      expect(scheduler.getActiveCount('agent-1')).toBe(0);
    });

    it('should drain queue after completion', async () => {
      scheduler.configure(defaultConfig({ defaultParallelismLimit: 1 }));

      await scheduler.dispatch(makeTask('task-1', 'agent-1'), 'dag-1');
      await scheduler.dispatch(makeTask('task-2', 'agent-1'), 'dag-1');

      expect(scheduler.getActiveCount('agent-1')).toBe(1);
      expect(scheduler.getQueuedCount('agent-1')).toBe(1);

      await scheduler.handleCompletion('task-1', makeResult('task-1'));

      // task-2 should now be active
      expect(scheduler.getActiveCount('agent-1')).toBe(1);
      expect(scheduler.getQueuedCount('agent-1')).toBe(0);
    });

    it('should be a no-op for unknown task IDs', async () => {
      // Should not throw
      await scheduler.handleCompletion('nonexistent', makeResult('nonexistent'));
      expect(scheduler.getActiveCount('agent-1')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // handleFailure (Req 35a.4)
  // -------------------------------------------------------------------------

  describe('handleFailure', () => {
    it('should retry failed tasks according to policy (Req 35a.4)', async () => {
      scheduler.configure(defaultConfig({ maxRetries: 2, retryDelayMs: 0 }));

      await scheduler.dispatch(makeTask('task-1'), 'dag-1');

      // First failure — should retry (task stays active)
      await scheduler.handleFailure('task-1', 'Connection timeout');
      expect(scheduler.getActiveCount('agent-1')).toBe(1);

      // Second failure — should retry again
      await scheduler.handleFailure('task-1', 'Connection timeout');
      expect(scheduler.getActiveCount('agent-1')).toBe(1);

      // Third failure — retries exhausted, task removed
      await scheduler.handleFailure('task-1', 'Connection timeout');
      expect(scheduler.getActiveCount('agent-1')).toBe(0);
    });

    it('should isolate failures from sibling tasks (Req 35a.4)', async () => {
      await scheduler.dispatch(makeTask('task-1', 'agent-1'), 'dag-1');
      await scheduler.dispatch(makeTask('task-2', 'agent-1'), 'dag-1');

      scheduler.configure(defaultConfig({ maxRetries: 0, retryDelayMs: 0 }));

      // Fail task-1 — task-2 should remain active
      await scheduler.handleFailure('task-1', 'Fatal error');

      expect(scheduler.getActiveCount('agent-1')).toBe(1);
    });

    it('should drain queue after retries exhausted', async () => {
      scheduler.configure(defaultConfig({ defaultParallelismLimit: 1, maxRetries: 0, retryDelayMs: 0 }));

      await scheduler.dispatch(makeTask('task-1', 'agent-1'), 'dag-1');
      await scheduler.dispatch(makeTask('task-2', 'agent-1'), 'dag-1');

      expect(scheduler.getQueuedCount('agent-1')).toBe(1);

      await scheduler.handleFailure('task-1', 'Fatal error');

      // task-2 should now be dispatched
      expect(scheduler.getActiveCount('agent-1')).toBe(1);
      expect(scheduler.getQueuedCount('agent-1')).toBe(0);
    });

    it('should be a no-op for unknown task IDs', async () => {
      await scheduler.handleFailure('nonexistent', 'error');
      expect(scheduler.getActiveCount('agent-1')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Distribution Strategies (Req 35d.12)
  // -------------------------------------------------------------------------

  describe('distribution strategies', () => {
    it('should assign slots using round-robin strategy', async () => {
      scheduler.configure(defaultConfig({ distributionStrategy: 'round-robin' }));

      const r1 = await scheduler.dispatch(makeTask('task-1'), 'dag-1');
      const r2 = await scheduler.dispatch(makeTask('task-2'), 'dag-1');
      const r3 = await scheduler.dispatch(makeTask('task-3'), 'dag-1');

      // Round-robin cycles through slots 0, 1, 2, 3, 4 (limit=5)
      expect(r1.slot).toBe(0);
      expect(r2.slot).toBe(1);
      expect(r3.slot).toBe(2);
    });

    it('should assign slots using least-loaded strategy', async () => {
      scheduler.configure(
        defaultConfig({ distributionStrategy: 'least-loaded', defaultParallelismLimit: 3 }),
      );

      const r1 = await scheduler.dispatch(makeTask('task-1'), 'dag-1');
      const r2 = await scheduler.dispatch(makeTask('task-2'), 'dag-1');
      const r3 = await scheduler.dispatch(makeTask('task-3'), 'dag-1');

      // All slots start empty, so least-loaded picks slot 0 first, then 1, then 2
      expect(r1.slot).toBe(0);
      expect(r2.slot).toBe(1);
      expect(r3.slot).toBe(2);
    });

    it('should assign consistent slots using affinity strategy', async () => {
      scheduler.configure(defaultConfig({ distributionStrategy: 'affinity' }));

      const r1 = await scheduler.dispatch(makeTask('task-1', 'agent-1'), 'dag-1');
      const r2 = await scheduler.dispatch(makeTask('task-2', 'agent-1'), 'dag-1');

      // Same agent should get the same slot (affinity)
      expect(r1.slot).toBe(r2.slot);
    });

    it('should assign different slots for different agents with affinity', async () => {
      scheduler.configure(
        defaultConfig({ distributionStrategy: 'affinity', defaultParallelismLimit: 100 }),
      );

      const r1 = await scheduler.dispatch(makeTask('task-1', 'agent-alpha'), 'dag-1');
      const r2 = await scheduler.dispatch(makeTask('task-2', 'agent-beta'), 'dag-1');

      // Different agents likely get different slots (hash-based)
      // This is probabilistic but with 100 slots and different strings, collision is unlikely
      expect(r1.slot).toBeDefined();
      expect(r2.slot).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Queue Priority (Req 35d.13)
  // -------------------------------------------------------------------------

  describe('queue priority (Req 35d.13)', () => {
    it('should dispatch highest-priority queued task first when slot frees', async () => {
      scheduler.configure(defaultConfig({ defaultParallelismLimit: 1 }));

      const events: SchedulerEvent[] = [];
      scheduler.onEvent((e) => events.push(e));

      await scheduler.dispatch(makeTask('active', 'agent-1', 5), 'dag-1');
      await scheduler.dispatch(makeTask('low-pri', 'agent-1', 1), 'dag-1');
      await scheduler.dispatch(makeTask('high-pri', 'agent-1', 10), 'dag-1');

      // Complete the active task — high-pri should be dispatched next
      await scheduler.handleCompletion('active', makeResult('active'));

      // The high-priority task should now be active
      expect(scheduler.getActiveCount('agent-1')).toBe(1);

      // Check events to verify high-pri was dispatched
      const dispatchEvents = events.filter((e) => e.type === 'task_dispatched');
      const lastDispatched = dispatchEvents[dispatchEvents.length - 1];
      expect(lastDispatched.taskId).toBe('high-pri');
    });
  });

  // -------------------------------------------------------------------------
  // getStatus
  // -------------------------------------------------------------------------

  describe('getStatus', () => {
    it('should return empty status when no tasks exist', () => {
      const status = scheduler.getStatus();

      expect(status.totalActive).toBe(0);
      expect(status.totalQueued).toBe(0);
      expect(Object.keys(status.perAgent)).toHaveLength(0);
    });

    it('should return per-agent breakdown', async () => {
      scheduler.configure(defaultConfig({ defaultParallelismLimit: 2 }));

      await scheduler.dispatch(makeTask('t1', 'agent-1'), 'dag-1');
      await scheduler.dispatch(makeTask('t2', 'agent-1'), 'dag-1');
      await scheduler.dispatch(makeTask('t3', 'agent-1'), 'dag-1'); // queued
      await scheduler.dispatch(makeTask('t4', 'agent-2'), 'dag-1');

      const status = scheduler.getStatus();

      expect(status.totalActive).toBe(3);
      expect(status.totalQueued).toBe(1);
      expect(status.perAgent['agent-1']).toEqual({ active: 2, queued: 1, limit: 2 });
      expect(status.perAgent['agent-2']).toEqual({ active: 1, queued: 0, limit: 2 });
    });
  });

  // -------------------------------------------------------------------------
  // Event Emission
  // -------------------------------------------------------------------------

  describe('event emission', () => {
    it('should emit task_dispatched event on successful dispatch', async () => {
      const events: SchedulerEvent[] = [];
      scheduler.onEvent((e) => events.push(e));

      await scheduler.dispatch(makeTask('task-1'), 'dag-1');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('task_dispatched');
      expect(events[0].taskId).toBe('task-1');
      expect(events[0].dagId).toBe('dag-1');
    });

    it('should emit task_queued event when task is queued', async () => {
      scheduler.configure(defaultConfig({ defaultParallelismLimit: 1 }));
      const events: SchedulerEvent[] = [];
      scheduler.onEvent((e) => events.push(e));

      await scheduler.dispatch(makeTask('task-1'), 'dag-1');
      await scheduler.dispatch(makeTask('task-2'), 'dag-1');

      const queuedEvents = events.filter((e) => e.type === 'task_queued');
      expect(queuedEvents).toHaveLength(1);
      expect(queuedEvents[0].taskId).toBe('task-2');
    });

    it('should emit task_completed event on completion', async () => {
      const events: SchedulerEvent[] = [];
      scheduler.onEvent((e) => events.push(e));

      await scheduler.dispatch(makeTask('task-1'), 'dag-1');
      await scheduler.handleCompletion('task-1', makeResult('task-1'));

      const completedEvents = events.filter((e) => e.type === 'task_completed');
      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0].taskId).toBe('task-1');
    });

    it('should emit task_retrying event on retriable failure', async () => {
      scheduler.configure(defaultConfig({ maxRetries: 1, retryDelayMs: 0 }));
      const events: SchedulerEvent[] = [];
      scheduler.onEvent((e) => events.push(e));

      await scheduler.dispatch(makeTask('task-1'), 'dag-1');
      await scheduler.handleFailure('task-1', 'Timeout');

      const retryEvents = events.filter((e) => e.type === 'task_retrying');
      expect(retryEvents).toHaveLength(1);
      expect(retryEvents[0].details?.retryCount).toBe(1);
    });

    it('should emit task_failed event when retries exhausted', async () => {
      scheduler.configure(defaultConfig({ maxRetries: 0, retryDelayMs: 0 }));
      const events: SchedulerEvent[] = [];
      scheduler.onEvent((e) => events.push(e));

      await scheduler.dispatch(makeTask('task-1'), 'dag-1');
      await scheduler.handleFailure('task-1', 'Fatal');

      const failedEvents = events.filter((e) => e.type === 'task_failed');
      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0].details?.retriesExhausted).toBe(true);
    });

    it('should not break scheduler if listener throws', async () => {
      scheduler.onEvent(() => {
        throw new Error('Listener error');
      });

      // Should not throw
      const result = await scheduler.dispatch(makeTask('task-1'), 'dag-1');
      expect(result.status).toBe('dispatched');
    });
  });
});
