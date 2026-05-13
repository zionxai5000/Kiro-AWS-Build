/**
 * Dependency Graph Engine — DAG-based parallel task orchestration.
 *
 * Implements the DependencyGraphEngine interface for constructing,
 * validating, scheduling, and managing parallel task execution graphs.
 *
 * Requirements: 35c.8, 35c.9, 35c.10, 35c.11
 */

import { randomUUID } from 'node:crypto';

import type { TaskResult } from '@seraphim/core';
import type {
  DependencyGraphEngine,
  ParallelTask,
  TaskDAG,
  DAGValidationResult,
  DAGValidationError,
  ExecutionPlan,
  ExecutionBatch,
  DeadlockResult,
  BlockedTask,
  TaskExecutionState,
  TaskStatus,
} from './types.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DependencyGraphEngineImpl implements DependencyGraphEngine {
  /** Active DAGs indexed by ID */
  private readonly dags = new Map<string, TaskDAG>();

  /** Execution state per task, indexed by DAG ID then task ID */
  private readonly executionState = new Map<string, Map<string, TaskExecutionState>>();

  // -------------------------------------------------------------------------
  // Graph Construction (Req 35c.8)
  // -------------------------------------------------------------------------

  /**
   * Construct a DAG from a list of ParallelTask definitions.
   *
   * Builds the task map and derives edges from each task's `dependencies` array.
   * The DAG is stored internally for later scheduling and execution tracking.
   */
  async createGraph(tasks: ParallelTask[]): Promise<TaskDAG> {
    const dagId = randomUUID();
    const taskMap = new Map<string, ParallelTask>();
    const edges: Array<{ from: string; to: string }> = [];

    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    // Derive edges: an edge from A to B means A must complete before B can start
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        edges.push({ from: depId, to: task.id });
      }
    }

    // Estimate total duration using critical path
    const estimatedTotalDuration = this.estimateCriticalPath(tasks, edges);

    const dag: TaskDAG = {
      id: dagId,
      tasks: taskMap,
      edges,
      metadata: {
        createdBy: 'DependencyGraphEngine',
        createdAt: new Date(),
        estimatedTotalDuration,
      },
    };

    // Store the DAG
    this.dags.set(dagId, dag);

    // Initialize execution state for all tasks
    const stateMap = new Map<string, TaskExecutionState>();
    for (const task of tasks) {
      stateMap.set(task.id, {
        taskId: task.id,
        status: 'waiting',
      });
    }
    this.executionState.set(dagId, stateMap);

    return dag;
  }

  // -------------------------------------------------------------------------
  // Graph Validation (Req 35c.9)
  // -------------------------------------------------------------------------

  /**
   * Validate a DAG for structural correctness.
   *
   * Checks for:
   * 1. Self-dependencies
   * 2. Missing dependencies (references to non-existent tasks)
   * 3. Circular dependencies (using Kahn's algorithm)
   *
   * Returns specific cycle paths when circular dependencies are detected.
   */
  async validateGraph(dag: TaskDAG): Promise<DAGValidationResult> {
    const errors: DAGValidationError[] = [];

    // Check for self-dependencies
    for (const [taskId, task] of dag.tasks) {
      if (task.dependencies.includes(taskId)) {
        errors.push({
          type: 'self_dependency',
          message: `Task "${taskId}" depends on itself`,
          taskId,
        });
      }
    }

    // Check for missing dependencies
    for (const [taskId, task] of dag.tasks) {
      for (const depId of task.dependencies) {
        if (!dag.tasks.has(depId)) {
          errors.push({
            type: 'missing_dependency',
            message: `Task "${taskId}" depends on non-existent task "${depId}"`,
            taskId,
          });
        }
      }
    }

    // Detect circular dependencies using Kahn's algorithm
    const cycleErrors = this.detectCycles(dag);
    errors.push(...cycleErrors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // -------------------------------------------------------------------------
  // Scheduling (Req 35c.8)
  // -------------------------------------------------------------------------

  /**
   * Generate an execution plan using topological ordering.
   *
   * Groups independent tasks into parallel batches. Tasks within a batch
   * have no dependencies on each other and can execute simultaneously.
   * Batches execute sequentially — batch N+1 starts only after batch N completes.
   */
  async schedule(dag: TaskDAG): Promise<ExecutionPlan> {
    const batches: ExecutionBatch[] = [];
    const scheduled = new Set<string>();
    const taskIds = Array.from(dag.tasks.keys());

    let batchIndex = 0;

    while (scheduled.size < taskIds.length) {
      // Find all tasks whose dependencies are fully scheduled
      const readyIds: string[] = [];

      for (const taskId of taskIds) {
        if (scheduled.has(taskId)) continue;

        const task = dag.tasks.get(taskId)!;
        const allDepsScheduled = task.dependencies.every((dep) => scheduled.has(dep));

        if (allDepsScheduled) {
          readyIds.push(taskId);
        }
      }

      if (readyIds.length === 0) {
        // This shouldn't happen if the graph is validated, but guard against it
        break;
      }

      // Sort by priority (higher priority first) for deterministic ordering
      readyIds.sort((a, b) => {
        const taskA = dag.tasks.get(a)!;
        const taskB = dag.tasks.get(b)!;
        return taskB.priority - taskA.priority;
      });

      // Calculate batch duration as the max of all task durations in the batch
      const estimatedDuration = Math.max(
        ...readyIds.map((id) => dag.tasks.get(id)!.estimatedDuration),
      );

      batches.push({
        index: batchIndex,
        taskIds: readyIds,
        estimatedDuration,
      });

      for (const id of readyIds) {
        scheduled.add(id);
      }

      batchIndex++;
    }

    const estimatedTotalDuration = batches.reduce(
      (sum, batch) => sum + batch.estimatedDuration,
      0,
    );

    return {
      dagId: dag.id,
      batches,
      estimatedTotalDuration,
      totalTasks: taskIds.length,
    };
  }

  // -------------------------------------------------------------------------
  // Ready Tasks (Req 35c.8)
  // -------------------------------------------------------------------------

  /**
   * Return all tasks whose dependencies are satisfied and are ready for execution.
   *
   * A task is "ready" when:
   * - Its status is 'waiting'
   * - All of its dependencies have status 'completed'
   */
  async getReadyTasks(dag: TaskDAG): Promise<ParallelTask[]> {
    const stateMap = this.executionState.get(dag.id);
    if (!stateMap) {
      return [];
    }

    const readyTasks: ParallelTask[] = [];

    for (const [taskId, task] of dag.tasks) {
      const state = stateMap.get(taskId);
      if (!state || state.status !== 'waiting') continue;

      const allDepsCompleted = task.dependencies.every((depId) => {
        const depState = stateMap.get(depId);
        return depState?.status === 'completed';
      });

      if (allDepsCompleted) {
        readyTasks.push(task);
      }
    }

    // Sort by priority (higher priority first)
    readyTasks.sort((a, b) => b.priority - a.priority);

    return readyTasks;
  }

  // -------------------------------------------------------------------------
  // Mark Complete (Req 35c.11)
  // -------------------------------------------------------------------------

  /**
   * Mark a task as complete with its result.
   *
   * Updates the task's execution state and checks if dependent tasks
   * are now ready for execution. If the result indicates failure,
   * the task is marked as 'failed' instead.
   */
  async markComplete(taskId: string, result: TaskResult): Promise<void> {
    // Find which DAG this task belongs to
    for (const [dagId, stateMap] of this.executionState) {
      const state = stateMap.get(taskId);
      if (!state) continue;

      const newStatus: TaskStatus = result.success ? 'completed' : 'failed';

      stateMap.set(taskId, {
        ...state,
        status: newStatus,
        result,
        completedAt: new Date(),
      });

      // If task failed, mark any tasks that transitively depend on it
      // as blocked (they'll be detected by detectDeadlocks)
      return;
    }

    throw new Error(`Task "${taskId}" not found in any active DAG`);
  }

  // -------------------------------------------------------------------------
  // Deadlock Detection (Req 35c.9)
  // -------------------------------------------------------------------------

  /**
   * Detect tasks that are permanently blocked due to failed dependencies.
   *
   * A task is deadlocked when:
   * - It is in 'waiting' status
   * - One or more of its dependencies have 'failed' status
   * - Therefore it can never become ready
   */
  async detectDeadlocks(dagId: string): Promise<DeadlockResult> {
    const stateMap = this.executionState.get(dagId);
    const dag = this.dags.get(dagId);

    if (!stateMap || !dag) {
      return { hasDeadlock: false, blockedTasks: [] };
    }

    const blockedTasks: BlockedTask[] = [];
    const failedTaskIds = new Set<string>();

    // Collect all failed tasks
    for (const [taskId, state] of stateMap) {
      if (state.status === 'failed') {
        failedTaskIds.add(taskId);
      }
    }

    // Find all tasks that are transitively blocked by failed tasks
    const permanentlyBlocked = this.findTransitivelyBlocked(dag, stateMap, failedTaskIds);

    for (const taskId of permanentlyBlocked) {
      const task = dag.tasks.get(taskId)!;
      const blockedByFailed = task.dependencies.filter(
        (depId) => failedTaskIds.has(depId) || permanentlyBlocked.has(depId),
      );

      blockedTasks.push({
        taskId,
        reason: `Blocked by failed dependencies: ${blockedByFailed.join(', ')}`,
        blockedBy: blockedByFailed,
      });
    }

    return {
      hasDeadlock: blockedTasks.length > 0,
      blockedTasks,
    };
  }

  // -------------------------------------------------------------------------
  // Internal: Cycle Detection (Kahn's Algorithm)
  // -------------------------------------------------------------------------

  /**
   * Detect circular dependencies using Kahn's algorithm for topological sort.
   *
   * If the algorithm cannot process all nodes, the remaining nodes form
   * one or more cycles. We then trace the specific cycle path for reporting.
   */
  private detectCycles(dag: TaskDAG): DAGValidationError[] {
    const errors: DAGValidationError[] = [];
    const taskIds = Array.from(dag.tasks.keys());

    // Build in-degree map
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const taskId of taskIds) {
      inDegree.set(taskId, 0);
      adjacency.set(taskId, []);
    }

    for (const edge of dag.edges) {
      // Only count edges between tasks that exist in the graph
      if (!dag.tasks.has(edge.from) || !dag.tasks.has(edge.to)) continue;

      adjacency.get(edge.from)!.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }

    // Kahn's algorithm: start with nodes that have in-degree 0
    const queue: string[] = [];
    for (const [taskId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);

      for (const neighbor of adjacency.get(node) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // If not all nodes were sorted, there's a cycle
    if (sorted.length < taskIds.length) {
      const remainingNodes = taskIds.filter((id) => !sorted.includes(id));
      const cyclePath = this.traceCycle(remainingNodes, adjacency);

      errors.push({
        type: 'circular_dependency',
        message: `Circular dependency detected: ${cyclePath.join(' → ')}`,
        cyclePath,
      });
    }

    return errors;
  }

  /**
   * Trace a specific cycle path from the remaining nodes after Kahn's algorithm.
   */
  private traceCycle(
    remainingNodes: string[],
    adjacency: Map<string, string[]>,
  ): string[] {
    if (remainingNodes.length === 0) return [];

    const remaining = new Set(remainingNodes);
    const visited = new Set<string>();
    const path: string[] = [];

    // Start DFS from the first remaining node
    const startNode = remainingNodes[0];

    const dfs = (node: string): boolean => {
      if (visited.has(node)) {
        // Found the cycle — extract it
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          path.push(node); // close the cycle
          path.splice(0, cycleStart); // remove prefix before cycle
          return true;
        }
        return false;
      }

      visited.add(node);
      path.push(node);

      for (const neighbor of adjacency.get(node) ?? []) {
        if (!remaining.has(neighbor)) continue;
        if (dfs(neighbor)) return true;
      }

      path.pop();
      return false;
    };

    dfs(startNode);

    return path.length > 0 ? path : remainingNodes;
  }

  // -------------------------------------------------------------------------
  // Internal: Critical Path Estimation
  // -------------------------------------------------------------------------

  /**
   * Estimate the critical path duration through the DAG.
   * The critical path is the longest path from any source to any sink.
   * Handles cycles gracefully by tracking the current traversal path.
   */
  private estimateCriticalPath(
    tasks: ParallelTask[],
    edges: Array<{ from: string; to: string }>,
  ): number {
    const taskMap = new Map<string, ParallelTask>();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    for (const task of tasks) {
      adjacency.set(task.id, []);
    }
    for (const edge of edges) {
      if (adjacency.has(edge.from)) {
        adjacency.get(edge.from)!.push(edge.to);
      }
    }

    // Calculate longest path from each node using memoization.
    // Use a visiting set to detect and break cycles.
    const memo = new Map<string, number>();
    const visiting = new Set<string>();

    const longestPath = (nodeId: string): number => {
      if (memo.has(nodeId)) return memo.get(nodeId)!;
      if (visiting.has(nodeId)) return 0; // cycle detected, break it

      const task = taskMap.get(nodeId);
      if (!task) return 0;

      visiting.add(nodeId);

      const neighbors = adjacency.get(nodeId) ?? [];
      let maxChildPath = 0;

      for (const neighbor of neighbors) {
        maxChildPath = Math.max(maxChildPath, longestPath(neighbor));
      }

      visiting.delete(nodeId);

      const total = task.estimatedDuration + maxChildPath;
      memo.set(nodeId, total);
      return total;
    };

    let criticalPath = 0;
    for (const task of tasks) {
      criticalPath = Math.max(criticalPath, longestPath(task.id));
    }

    return criticalPath;
  }

  // -------------------------------------------------------------------------
  // Internal: Transitive Block Detection
  // -------------------------------------------------------------------------

  /**
   * Find all tasks that are transitively blocked by a set of failed tasks.
   * A task is transitively blocked if any of its dependencies are failed
   * or themselves transitively blocked.
   */
  private findTransitivelyBlocked(
    dag: TaskDAG,
    stateMap: Map<string, TaskExecutionState>,
    failedTaskIds: Set<string>,
  ): Set<string> {
    const blocked = new Set<string>();
    const visited = new Set<string>();

    const isBlocked = (taskId: string): boolean => {
      if (visited.has(taskId)) return blocked.has(taskId);
      visited.add(taskId);

      if (failedTaskIds.has(taskId)) return true;

      const task = dag.tasks.get(taskId);
      if (!task) return false;

      const state = stateMap.get(taskId);
      if (!state || state.status === 'completed') return false;

      for (const depId of task.dependencies) {
        if (failedTaskIds.has(depId) || isBlocked(depId)) {
          blocked.add(taskId);
          return true;
        }
      }

      return false;
    };

    for (const [taskId] of dag.tasks) {
      isBlocked(taskId);
    }

    return blocked;
  }
}
