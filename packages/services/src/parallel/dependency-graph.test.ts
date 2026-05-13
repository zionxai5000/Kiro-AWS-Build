/**
 * Unit tests for the Dependency Graph Engine.
 *
 * Requirements: 35c.8, 35c.9, 35c.10, 35c.11
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraphEngineImpl } from './dependency-graph.js';
import type { ParallelTask } from './types.js';
import type { Task, TaskResult } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(id: string, deps: string[] = [], priority = 1, duration = 1000): ParallelTask {
  const task: Task = {
    id,
    type: 'test',
    description: `Test task ${id}`,
    params: {},
    priority: 'medium',
  };

  return {
    id,
    agentId: 'agent-1',
    task,
    dependencies: deps,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DependencyGraphEngineImpl', () => {
  let engine: DependencyGraphEngineImpl;

  beforeEach(() => {
    engine = new DependencyGraphEngineImpl();
  });

  // -------------------------------------------------------------------------
  // createGraph
  // -------------------------------------------------------------------------

  describe('createGraph', () => {
    it('should create a DAG from a list of tasks', async () => {
      const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C', ['A'])];

      const dag = await engine.createGraph(tasks);

      expect(dag.id).toBeDefined();
      expect(dag.tasks.size).toBe(3);
      expect(dag.tasks.get('A')).toEqual(tasks[0]);
      expect(dag.tasks.get('B')).toEqual(tasks[1]);
      expect(dag.tasks.get('C')).toEqual(tasks[2]);
    });

    it('should derive edges from task dependencies', async () => {
      const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C', ['A', 'B'])];

      const dag = await engine.createGraph(tasks);

      expect(dag.edges).toContainEqual({ from: 'A', to: 'B' });
      expect(dag.edges).toContainEqual({ from: 'A', to: 'C' });
      expect(dag.edges).toContainEqual({ from: 'B', to: 'C' });
      expect(dag.edges).toHaveLength(3);
    });

    it('should set metadata with creation time and estimated duration', async () => {
      const tasks = [makeTask('A', [], 1, 2000), makeTask('B', ['A'], 1, 3000)];

      const dag = await engine.createGraph(tasks);

      expect(dag.metadata.createdBy).toBe('DependencyGraphEngine');
      expect(dag.metadata.createdAt).toBeInstanceOf(Date);
      // Critical path: A(2000) + B(3000) = 5000
      expect(dag.metadata.estimatedTotalDuration).toBe(5000);
    });

    it('should handle tasks with no dependencies', async () => {
      const tasks = [makeTask('A'), makeTask('B'), makeTask('C')];

      const dag = await engine.createGraph(tasks);

      expect(dag.edges).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // validateGraph
  // -------------------------------------------------------------------------

  describe('validateGraph', () => {
    it('should validate a correct DAG as valid', async () => {
      const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C', ['B'])];
      const dag = await engine.createGraph(tasks);

      const result = await engine.validateGraph(dag);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect self-dependencies', async () => {
      const tasks = [makeTask('A', ['A'])];
      const dag = await engine.createGraph(tasks);

      const result = await engine.validateGraph(dag);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'self_dependency',
          taskId: 'A',
        }),
      );
    });

    it('should detect missing dependencies', async () => {
      const tasks = [makeTask('A', ['nonexistent'])];
      const dag = await engine.createGraph(tasks);

      const result = await engine.validateGraph(dag);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'missing_dependency',
          taskId: 'A',
        }),
      );
    });

    it('should detect circular dependencies with cycle path', async () => {
      // A → B → C → A (cycle)
      const tasks = [makeTask('A', ['C']), makeTask('B', ['A']), makeTask('C', ['B'])];
      const dag = await engine.createGraph(tasks);

      const result = await engine.validateGraph(dag);

      expect(result.valid).toBe(false);
      const cycleError = result.errors.find((e) => e.type === 'circular_dependency');
      expect(cycleError).toBeDefined();
      expect(cycleError!.cyclePath).toBeDefined();
      expect(cycleError!.cyclePath!.length).toBeGreaterThan(1);
    });

    it('should detect circular dependencies in a subset of the graph', async () => {
      // D is independent, A → B → C → A is a cycle
      const tasks = [
        makeTask('D'),
        makeTask('A', ['C']),
        makeTask('B', ['A']),
        makeTask('C', ['B']),
      ];
      const dag = await engine.createGraph(tasks);

      const result = await engine.validateGraph(dag);

      expect(result.valid).toBe(false);
      const cycleError = result.errors.find((e) => e.type === 'circular_dependency');
      expect(cycleError).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // schedule
  // -------------------------------------------------------------------------

  describe('schedule', () => {
    it('should group independent tasks into the same batch', async () => {
      const tasks = [makeTask('A'), makeTask('B'), makeTask('C')];
      const dag = await engine.createGraph(tasks);

      const plan = await engine.schedule(dag);

      expect(plan.batches).toHaveLength(1);
      expect(plan.batches[0].taskIds).toHaveLength(3);
      expect(plan.batches[0].taskIds).toContain('A');
      expect(plan.batches[0].taskIds).toContain('B');
      expect(plan.batches[0].taskIds).toContain('C');
    });

    it('should create sequential batches for dependent tasks', async () => {
      const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C', ['B'])];
      const dag = await engine.createGraph(tasks);

      const plan = await engine.schedule(dag);

      expect(plan.batches).toHaveLength(3);
      expect(plan.batches[0].taskIds).toEqual(['A']);
      expect(plan.batches[1].taskIds).toEqual(['B']);
      expect(plan.batches[2].taskIds).toEqual(['C']);
    });

    it('should create a diamond-shaped execution plan', async () => {
      // A → B, A → C, B → D, C → D
      const tasks = [
        makeTask('A'),
        makeTask('B', ['A']),
        makeTask('C', ['A']),
        makeTask('D', ['B', 'C']),
      ];
      const dag = await engine.createGraph(tasks);

      const plan = await engine.schedule(dag);

      expect(plan.batches).toHaveLength(3);
      expect(plan.batches[0].taskIds).toEqual(['A']);
      expect(plan.batches[1].taskIds).toContain('B');
      expect(plan.batches[1].taskIds).toContain('C');
      expect(plan.batches[2].taskIds).toEqual(['D']);
    });

    it('should calculate estimated total duration from batch durations', async () => {
      const tasks = [
        makeTask('A', [], 1, 2000),
        makeTask('B', [], 1, 3000),
        makeTask('C', ['A', 'B'], 1, 1000),
      ];
      const dag = await engine.createGraph(tasks);

      const plan = await engine.schedule(dag);

      // Batch 0: max(2000, 3000) = 3000
      // Batch 1: 1000
      // Total: 4000
      expect(plan.estimatedTotalDuration).toBe(4000);
    });

    it('should sort tasks within a batch by priority', async () => {
      const tasks = [
        makeTask('A', [], 1),
        makeTask('B', [], 5),
        makeTask('C', [], 3),
      ];
      const dag = await engine.createGraph(tasks);

      const plan = await engine.schedule(dag);

      // Higher priority first
      expect(plan.batches[0].taskIds[0]).toBe('B');
      expect(plan.batches[0].taskIds[1]).toBe('C');
      expect(plan.batches[0].taskIds[2]).toBe('A');
    });
  });

  // -------------------------------------------------------------------------
  // getReadyTasks
  // -------------------------------------------------------------------------

  describe('getReadyTasks', () => {
    it('should return tasks with no dependencies as ready', async () => {
      const tasks = [makeTask('A'), makeTask('B'), makeTask('C', ['A'])];
      const dag = await engine.createGraph(tasks);

      const ready = await engine.getReadyTasks(dag);

      expect(ready).toHaveLength(2);
      expect(ready.map((t) => t.id)).toContain('A');
      expect(ready.map((t) => t.id)).toContain('B');
    });

    it('should not return tasks with unsatisfied dependencies', async () => {
      const tasks = [makeTask('A'), makeTask('B', ['A'])];
      const dag = await engine.createGraph(tasks);

      const ready = await engine.getReadyTasks(dag);

      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('A');
    });

    it('should return dependent tasks after dependencies complete', async () => {
      const tasks = [makeTask('A'), makeTask('B', ['A'])];
      const dag = await engine.createGraph(tasks);

      // Complete task A
      await engine.markComplete('A', makeResult('A'));

      const ready = await engine.getReadyTasks(dag);

      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('B');
    });

    it('should return tasks sorted by priority', async () => {
      const tasks = [
        makeTask('A', [], 1),
        makeTask('B', [], 5),
        makeTask('C', [], 3),
      ];
      const dag = await engine.createGraph(tasks);

      const ready = await engine.getReadyTasks(dag);

      expect(ready[0].id).toBe('B');
      expect(ready[1].id).toBe('C');
      expect(ready[2].id).toBe('A');
    });
  });

  // -------------------------------------------------------------------------
  // markComplete
  // -------------------------------------------------------------------------

  describe('markComplete', () => {
    it('should mark a task as completed', async () => {
      const tasks = [makeTask('A'), makeTask('B', ['A'])];
      const dag = await engine.createGraph(tasks);

      await engine.markComplete('A', makeResult('A'));

      // B should now be ready
      const ready = await engine.getReadyTasks(dag);
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('B');
    });

    it('should mark a task as failed when result is unsuccessful', async () => {
      const tasks = [makeTask('A'), makeTask('B', ['A'])];
      const dag = await engine.createGraph(tasks);

      await engine.markComplete('A', makeResult('A', false));

      // B should NOT be ready since A failed
      const ready = await engine.getReadyTasks(dag);
      expect(ready).toHaveLength(0);
    });

    it('should throw when marking a non-existent task', async () => {
      const tasks = [makeTask('A')];
      await engine.createGraph(tasks);

      await expect(
        engine.markComplete('nonexistent', makeResult('nonexistent')),
      ).rejects.toThrow('Task "nonexistent" not found');
    });

    it('should release multiple dependent tasks when a shared dependency completes', async () => {
      const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C', ['A'])];
      const dag = await engine.createGraph(tasks);

      await engine.markComplete('A', makeResult('A'));

      const ready = await engine.getReadyTasks(dag);
      expect(ready).toHaveLength(2);
      expect(ready.map((t) => t.id)).toContain('B');
      expect(ready.map((t) => t.id)).toContain('C');
    });
  });

  // -------------------------------------------------------------------------
  // detectDeadlocks
  // -------------------------------------------------------------------------

  describe('detectDeadlocks', () => {
    it('should return no deadlock when all tasks can proceed', async () => {
      const tasks = [makeTask('A'), makeTask('B', ['A'])];
      const dag = await engine.createGraph(tasks);

      const result = await engine.detectDeadlocks(dag.id);

      expect(result.hasDeadlock).toBe(false);
      expect(result.blockedTasks).toHaveLength(0);
    });

    it('should detect deadlock when a dependency has failed', async () => {
      const tasks = [makeTask('A'), makeTask('B', ['A']), makeTask('C', ['B'])];
      const dag = await engine.createGraph(tasks);

      // Fail task A
      await engine.markComplete('A', makeResult('A', false));

      const result = await engine.detectDeadlocks(dag.id);

      expect(result.hasDeadlock).toBe(true);
      expect(result.blockedTasks.length).toBeGreaterThanOrEqual(1);
      expect(result.blockedTasks.map((t) => t.taskId)).toContain('B');
    });

    it('should detect transitive deadlocks', async () => {
      const tasks = [
        makeTask('A'),
        makeTask('B', ['A']),
        makeTask('C', ['B']),
        makeTask('D', ['C']),
      ];
      const dag = await engine.createGraph(tasks);

      // Fail task A — B, C, D are all transitively blocked
      await engine.markComplete('A', makeResult('A', false));

      const result = await engine.detectDeadlocks(dag.id);

      expect(result.hasDeadlock).toBe(true);
      expect(result.blockedTasks).toHaveLength(3);
      expect(result.blockedTasks.map((t) => t.taskId)).toContain('B');
      expect(result.blockedTasks.map((t) => t.taskId)).toContain('C');
      expect(result.blockedTasks.map((t) => t.taskId)).toContain('D');
    });

    it('should not flag tasks that have alternative paths', async () => {
      // A and B are independent, C depends on both
      const tasks = [makeTask('A'), makeTask('B'), makeTask('C', ['A', 'B'])];
      const dag = await engine.createGraph(tasks);

      // Fail A — C is blocked because it needs both A and B
      await engine.markComplete('A', makeResult('A', false));

      const result = await engine.detectDeadlocks(dag.id);

      expect(result.hasDeadlock).toBe(true);
      expect(result.blockedTasks.map((t) => t.taskId)).toContain('C');
    });

    it('should return no deadlock for unknown DAG ID', async () => {
      const result = await engine.detectDeadlocks('nonexistent-dag');

      expect(result.hasDeadlock).toBe(false);
      expect(result.blockedTasks).toHaveLength(0);
    });
  });
});
