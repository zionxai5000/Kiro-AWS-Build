/**
 * Dependency Graph Engine — DAG-based parallel task orchestration.
 *
 * Implements the DependencyGraphEngine interface for constructing,
 * validating, scheduling, and managing parallel task execution graphs.
 *
 * Requirements: 35c.8, 35c.9, 35c.10, 35c.11
 */
import type { TaskResult } from '@seraphim/core';
import type { DependencyGraphEngine, ParallelTask, TaskDAG, DAGValidationResult, ExecutionPlan, DeadlockResult } from './types.js';
export declare class DependencyGraphEngineImpl implements DependencyGraphEngine {
    /** Active DAGs indexed by ID */
    private readonly dags;
    /** Execution state per task, indexed by DAG ID then task ID */
    private readonly executionState;
    /**
     * Construct a DAG from a list of ParallelTask definitions.
     *
     * Builds the task map and derives edges from each task's `dependencies` array.
     * The DAG is stored internally for later scheduling and execution tracking.
     */
    createGraph(tasks: ParallelTask[]): Promise<TaskDAG>;
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
    validateGraph(dag: TaskDAG): Promise<DAGValidationResult>;
    /**
     * Generate an execution plan using topological ordering.
     *
     * Groups independent tasks into parallel batches. Tasks within a batch
     * have no dependencies on each other and can execute simultaneously.
     * Batches execute sequentially — batch N+1 starts only after batch N completes.
     */
    schedule(dag: TaskDAG): Promise<ExecutionPlan>;
    /**
     * Return all tasks whose dependencies are satisfied and are ready for execution.
     *
     * A task is "ready" when:
     * - Its status is 'waiting'
     * - All of its dependencies have status 'completed'
     */
    getReadyTasks(dag: TaskDAG): Promise<ParallelTask[]>;
    /**
     * Mark a task as complete with its result.
     *
     * Updates the task's execution state and checks if dependent tasks
     * are now ready for execution. If the result indicates failure,
     * the task is marked as 'failed' instead.
     */
    markComplete(taskId: string, result: TaskResult): Promise<void>;
    /**
     * Detect tasks that are permanently blocked due to failed dependencies.
     *
     * A task is deadlocked when:
     * - It is in 'waiting' status
     * - One or more of its dependencies have 'failed' status
     * - Therefore it can never become ready
     */
    detectDeadlocks(dagId: string): Promise<DeadlockResult>;
    /**
     * Detect circular dependencies using Kahn's algorithm for topological sort.
     *
     * If the algorithm cannot process all nodes, the remaining nodes form
     * one or more cycles. We then trace the specific cycle path for reporting.
     */
    private detectCycles;
    /**
     * Trace a specific cycle path from the remaining nodes after Kahn's algorithm.
     */
    private traceCycle;
    /**
     * Estimate the critical path duration through the DAG.
     * The critical path is the longest path from any source to any sink.
     * Handles cycles gracefully by tracking the current traversal path.
     */
    private estimateCriticalPath;
    /**
     * Find all tasks that are transitively blocked by a set of failed tasks.
     * A task is transitively blocked if any of its dependencies are failed
     * or themselves transitively blocked.
     */
    private findTransitivelyBlocked;
}
//# sourceMappingURL=dependency-graph.d.ts.map