/**
 * Parallel Scheduler and Load Balancer — Work distribution and resource-aware scheduling.
 *
 * Implements the ParallelScheduler interface for distributing parallel tasks
 * across available compute resources with configurable strategies, parallelism
 * limits, budget awareness, and failure isolation.
 *
 * Requirements: 35a.1, 35a.2, 35a.4, 35d.12, 35d.13
 */
import type { TaskResult } from '@seraphim/core';
import type { ParallelScheduler, ParallelTask, SchedulerConfig, DispatchResult, SchedulerStatus } from './types.js';
/** Lifecycle event types emitted by the scheduler. */
export type SchedulerEventType = 'task_dispatched' | 'task_queued' | 'task_completed' | 'task_failed' | 'task_retrying' | 'task_rejected';
/** Payload for scheduler lifecycle events. */
export interface SchedulerEvent {
    type: SchedulerEventType;
    taskId: string;
    agentId: string;
    dagId: string;
    timestamp: Date;
    details?: Record<string, unknown>;
}
/** Callback for scheduler lifecycle events. */
export type SchedulerEventCallback = (event: SchedulerEvent) => void;
/**
 * ParallelSchedulerImpl distributes work across compute resources using
 * configurable strategies while respecting parallelism limits and budgets.
 *
 * Features:
 * - Round-robin, least-loaded, and affinity-based distribution (Req 35d.12)
 * - Per-agent parallelism limits with configurable overrides (Req 35a.2)
 * - Resource-aware scheduling with Otzar budget checks (Req 35d.12)
 * - Priority-based queuing when resources are constrained (Req 35d.13)
 * - Failure isolation with retry policies (Req 35a.4)
 */
export declare class ParallelSchedulerImpl implements ParallelScheduler {
    /** Current scheduler configuration */
    private config;
    /** Active tasks indexed by task ID */
    private readonly activeTasks;
    /** Queued tasks per agent, ordered by priority (highest first) */
    private readonly queuedTasks;
    /** Round-robin counter per agent for slot assignment */
    private readonly roundRobinCounters;
    /** Event listeners for lifecycle notifications */
    private readonly listeners;
    /**
     * Configure the scheduler with distribution strategy, limits, and retry policy.
     *
     * Can be called multiple times to update configuration at runtime.
     */
    configure(config: SchedulerConfig): void;
    /**
     * Register a callback for scheduler lifecycle events.
     *
     * Events are emitted for task dispatch, queuing, completion, failure, and retry.
     */
    onEvent(callback: SchedulerEventCallback): void;
    /**
     * Dispatch a single task for execution.
     *
     * The scheduler will:
     * 1. Check the agent's parallelism limit
     * 2. Check budget via the configured budgetChecker (if present)
     * 3. Assign a slot using the configured distribution strategy
     * 4. Queue the task if limits are exceeded (Req 35d.13)
     */
    dispatch(task: ParallelTask, dagId: string): Promise<DispatchResult>;
    /**
     * Dispatch a batch of tasks for execution.
     *
     * Tasks are dispatched in priority order (highest first) to ensure
     * high-priority tasks get slots before lower-priority ones.
     */
    dispatchBatch(tasks: ParallelTask[], dagId: string): Promise<DispatchResult[]>;
    /**
     * Get the number of currently active (executing) tasks for an agent.
     */
    getActiveCount(agentId: string): number;
    /**
     * Get the number of queued (waiting) tasks for an agent.
     */
    getQueuedCount(agentId: string): number;
    /**
     * Handle successful task completion.
     *
     * Removes the task from active tracking and attempts to dispatch
     * the next queued task for the same agent (draining the queue).
     */
    handleCompletion(taskId: string, result: TaskResult): Promise<void>;
    /**
     * Handle task failure with retry and isolation (Req 35a.4).
     *
     * Failed sub-tasks don't terminate siblings. The scheduler retries
     * according to the configured retry policy. If retries are exhausted,
     * the task is marked as permanently failed and partial results are reported.
     */
    handleFailure(taskId: string, error: string): Promise<void>;
    /**
     * Get the current scheduler status including per-agent breakdowns.
     */
    getStatus(): SchedulerStatus;
    /**
     * Get the parallelism limit for a specific agent.
     * Uses per-agent override if configured, otherwise the default limit.
     */
    private getParallelismLimit;
    /**
     * Assign a compute slot using the configured distribution strategy.
     *
     * - round-robin: Cycles through slots sequentially
     * - least-loaded: Assigns to the slot with fewest active tasks
     * - affinity: Assigns to a consistent slot based on agent ID hash
     */
    private assignSlot;
    /**
     * Round-robin slot assignment: cycles through available slots sequentially.
     */
    private assignRoundRobin;
    /**
     * Least-loaded slot assignment: picks the slot with the fewest active tasks.
     */
    private assignLeastLoaded;
    /**
     * Affinity-based slot assignment: consistent hashing based on agent ID.
     * Ensures the same agent always maps to the same slot for cache locality.
     */
    private assignAffinity;
    /**
     * Check Otzar budget before dispatching a task.
     */
    private checkBudget;
    /**
     * Enqueue a task when it cannot be immediately dispatched.
     * Tasks are inserted in priority order (highest priority at front).
     */
    private enqueue;
    /**
     * Attempt to dispatch the next queued task for an agent after a slot frees up.
     */
    private drainQueue;
    /**
     * Emit a lifecycle event to all registered listeners.
     */
    private emitEvent;
    /**
     * Async delay helper for retry backoff.
     */
    private delay;
}
//# sourceMappingURL=scheduler.d.ts.map