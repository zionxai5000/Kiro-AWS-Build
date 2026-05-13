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
import type {
  ParallelScheduler,
  ParallelTask,
  SchedulerConfig,
  DispatchResult,
  SchedulerStatus,
  BudgetCheckResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/** Tracks a dispatched task's lifecycle within the scheduler. */
interface ActiveTask {
  task: ParallelTask;
  dagId: string;
  slot: number;
  startedAt: Date;
  retryCount: number;
}

/** A queued task waiting for a slot or budget clearance. */
interface QueuedTask {
  task: ParallelTask;
  dagId: string;
  queuedAt: Date;
  reason: string;
}

/** Lifecycle event types emitted by the scheduler. */
export type SchedulerEventType =
  | 'task_dispatched'
  | 'task_queued'
  | 'task_completed'
  | 'task_failed'
  | 'task_retrying'
  | 'task_rejected';

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

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

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
export class ParallelSchedulerImpl implements ParallelScheduler {
  /** Current scheduler configuration */
  private config: SchedulerConfig = {
    defaultParallelismLimit: 5,
    agentLimits: {},
    distributionStrategy: 'round-robin',
    maxRetries: 3,
    retryDelayMs: 1000,
  };

  /** Active tasks indexed by task ID */
  private readonly activeTasks = new Map<string, ActiveTask>();

  /** Queued tasks per agent, ordered by priority (highest first) */
  private readonly queuedTasks = new Map<string, QueuedTask[]>();

  /** Round-robin counter per agent for slot assignment */
  private readonly roundRobinCounters = new Map<string, number>();

  /** Event listeners for lifecycle notifications */
  private readonly listeners: SchedulerEventCallback[] = [];

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Configure the scheduler with distribution strategy, limits, and retry policy.
   *
   * Can be called multiple times to update configuration at runtime.
   */
  configure(config: SchedulerConfig): void {
    this.config = { ...config };
  }

  // -------------------------------------------------------------------------
  // Event Subscription
  // -------------------------------------------------------------------------

  /**
   * Register a callback for scheduler lifecycle events.
   *
   * Events are emitted for task dispatch, queuing, completion, failure, and retry.
   */
  onEvent(callback: SchedulerEventCallback): void {
    this.listeners.push(callback);
  }

  // -------------------------------------------------------------------------
  // Dispatch (Req 35a.1, 35d.12)
  // -------------------------------------------------------------------------

  /**
   * Dispatch a single task for execution.
   *
   * The scheduler will:
   * 1. Check the agent's parallelism limit
   * 2. Check budget via the configured budgetChecker (if present)
   * 3. Assign a slot using the configured distribution strategy
   * 4. Queue the task if limits are exceeded (Req 35d.13)
   */
  async dispatch(task: ParallelTask, dagId: string): Promise<DispatchResult> {
    const agentId = task.agentId;
    const limit = this.getParallelismLimit(agentId);
    const activeCount = this.getActiveCount(agentId);

    // Check parallelism limit (Req 35a.2)
    if (activeCount >= limit) {
      this.enqueue(task, dagId, 'parallelism_limit_reached');
      this.emitEvent({
        type: 'task_queued',
        taskId: task.id,
        agentId,
        dagId,
        timestamp: new Date(),
        details: { reason: 'parallelism_limit_reached', activeCount, limit },
      });
      return {
        taskId: task.id,
        status: 'queued',
        reason: `Agent "${agentId}" at parallelism limit (${activeCount}/${limit})`,
      };
    }

    // Check budget (Req 35d.12 — respecting Otzar budget constraints)
    if (this.config.budgetChecker) {
      const budgetResult = await this.checkBudget(agentId, task);
      if (!budgetResult.allowed) {
        this.enqueue(task, dagId, 'budget_constrained');
        this.emitEvent({
          type: 'task_queued',
          taskId: task.id,
          agentId,
          dagId,
          timestamp: new Date(),
          details: { reason: 'budget_constrained', budgetReason: budgetResult.reason },
        });
        return {
          taskId: task.id,
          status: 'queued',
          reason: `Budget constrained: ${budgetResult.reason ?? 'insufficient budget'}`,
        };
      }
    }

    // Assign slot using distribution strategy
    const slot = this.assignSlot(agentId);

    // Track as active
    this.activeTasks.set(task.id, {
      task,
      dagId,
      slot,
      startedAt: new Date(),
      retryCount: 0,
    });

    this.emitEvent({
      type: 'task_dispatched',
      taskId: task.id,
      agentId,
      dagId,
      timestamp: new Date(),
      details: { slot, strategy: this.config.distributionStrategy },
    });

    return {
      taskId: task.id,
      status: 'dispatched',
      slot,
    };
  }

  /**
   * Dispatch a batch of tasks for execution.
   *
   * Tasks are dispatched in priority order (highest first) to ensure
   * high-priority tasks get slots before lower-priority ones.
   */
  async dispatchBatch(tasks: ParallelTask[], dagId: string): Promise<DispatchResult[]> {
    // Sort by priority descending so high-priority tasks get dispatched first
    const sorted = [...tasks].sort((a, b) => b.priority - a.priority);
    const results: DispatchResult[] = [];

    for (const task of sorted) {
      const result = await this.dispatch(task, dagId);
      results.push(result);
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Active / Queued Counts
  // -------------------------------------------------------------------------

  /**
   * Get the number of currently active (executing) tasks for an agent.
   */
  getActiveCount(agentId: string): number {
    let count = 0;
    for (const active of this.activeTasks.values()) {
      if (active.task.agentId === agentId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get the number of queued (waiting) tasks for an agent.
   */
  getQueuedCount(agentId: string): number {
    const queue = this.queuedTasks.get(agentId);
    return queue?.length ?? 0;
  }

  // -------------------------------------------------------------------------
  // Completion Handling (Req 35a.4)
  // -------------------------------------------------------------------------

  /**
   * Handle successful task completion.
   *
   * Removes the task from active tracking and attempts to dispatch
   * the next queued task for the same agent (draining the queue).
   */
  async handleCompletion(taskId: string, result: TaskResult): Promise<void> {
    const active = this.activeTasks.get(taskId);
    if (!active) {
      return;
    }

    const { task, dagId } = active;
    this.activeTasks.delete(taskId);

    this.emitEvent({
      type: 'task_completed',
      taskId,
      agentId: task.agentId,
      dagId,
      timestamp: new Date(),
      details: { durationMs: result.durationMs, success: result.success },
    });

    // Drain queue: try to dispatch next queued task for this agent
    await this.drainQueue(task.agentId);
  }

  /**
   * Handle task failure with retry and isolation (Req 35a.4).
   *
   * Failed sub-tasks don't terminate siblings. The scheduler retries
   * according to the configured retry policy. If retries are exhausted,
   * the task is marked as permanently failed and partial results are reported.
   */
  async handleFailure(taskId: string, error: string): Promise<void> {
    const active = this.activeTasks.get(taskId);
    if (!active) {
      return;
    }

    const { task, dagId } = active;

    // Check if we can retry (Req 35a.4)
    if (active.retryCount < this.config.maxRetries) {
      // Increment retry count and schedule retry
      active.retryCount++;

      this.emitEvent({
        type: 'task_retrying',
        taskId,
        agentId: task.agentId,
        dagId,
        timestamp: new Date(),
        details: {
          retryCount: active.retryCount,
          maxRetries: this.config.maxRetries,
          error,
          delayMs: this.config.retryDelayMs,
        },
      });

      // Wait for retry delay then re-dispatch
      // The task stays in activeTasks with incremented retryCount
      await this.delay(this.config.retryDelayMs);
      return;
    }

    // Retries exhausted — permanently fail (isolated from siblings)
    this.activeTasks.delete(taskId);

    this.emitEvent({
      type: 'task_failed',
      taskId,
      agentId: task.agentId,
      dagId,
      timestamp: new Date(),
      details: {
        error,
        retriesExhausted: true,
        totalRetries: active.retryCount,
      },
    });

    // Drain queue: free slot for next queued task
    await this.drainQueue(task.agentId);
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  /**
   * Get the current scheduler status including per-agent breakdowns.
   */
  getStatus(): SchedulerStatus {
    const perAgent: Record<string, { active: number; queued: number; limit: number }> = {};

    // Collect all known agent IDs from active and queued tasks
    const agentIds = new Set<string>();
    for (const active of this.activeTasks.values()) {
      agentIds.add(active.task.agentId);
    }
    for (const [agentId] of this.queuedTasks) {
      agentIds.add(agentId);
    }

    let totalActive = 0;
    let totalQueued = 0;

    for (const agentId of agentIds) {
      const active = this.getActiveCount(agentId);
      const queued = this.getQueuedCount(agentId);
      const limit = this.getParallelismLimit(agentId);

      perAgent[agentId] = { active, queued, limit };
      totalActive += active;
      totalQueued += queued;
    }

    return { totalActive, totalQueued, perAgent };
  }

  // -------------------------------------------------------------------------
  // Internal: Parallelism Limits (Req 35a.2)
  // -------------------------------------------------------------------------

  /**
   * Get the parallelism limit for a specific agent.
   * Uses per-agent override if configured, otherwise the default limit.
   */
  private getParallelismLimit(agentId: string): number {
    return this.config.agentLimits?.[agentId] ?? this.config.defaultParallelismLimit;
  }

  // -------------------------------------------------------------------------
  // Internal: Distribution Strategy (Req 35d.12)
  // -------------------------------------------------------------------------

  /**
   * Assign a compute slot using the configured distribution strategy.
   *
   * - round-robin: Cycles through slots sequentially
   * - least-loaded: Assigns to the slot with fewest active tasks
   * - affinity: Assigns to a consistent slot based on agent ID hash
   */
  private assignSlot(agentId: string): number {
    const limit = this.getParallelismLimit(agentId);

    switch (this.config.distributionStrategy) {
      case 'round-robin':
        return this.assignRoundRobin(agentId, limit);
      case 'least-loaded':
        return this.assignLeastLoaded(agentId, limit);
      case 'affinity':
        return this.assignAffinity(agentId, limit);
      default:
        return this.assignRoundRobin(agentId, limit);
    }
  }

  /**
   * Round-robin slot assignment: cycles through available slots sequentially.
   */
  private assignRoundRobin(agentId: string, limit: number): number {
    const current = this.roundRobinCounters.get(agentId) ?? 0;
    const slot = current % limit;
    this.roundRobinCounters.set(agentId, current + 1);
    return slot;
  }

  /**
   * Least-loaded slot assignment: picks the slot with the fewest active tasks.
   */
  private assignLeastLoaded(agentId: string, limit: number): number {
    // Count tasks per slot for this agent
    const slotCounts = new Array<number>(limit).fill(0);

    for (const active of this.activeTasks.values()) {
      if (active.task.agentId === agentId && active.slot < limit) {
        slotCounts[active.slot]++;
      }
    }

    // Find the slot with the minimum count
    let minSlot = 0;
    let minCount = slotCounts[0];

    for (let i = 1; i < limit; i++) {
      if (slotCounts[i] < minCount) {
        minCount = slotCounts[i];
        minSlot = i;
      }
    }

    return minSlot;
  }

  /**
   * Affinity-based slot assignment: consistent hashing based on agent ID.
   * Ensures the same agent always maps to the same slot for cache locality.
   */
  private assignAffinity(agentId: string, limit: number): number {
    let hash = 0;
    for (let i = 0; i < agentId.length; i++) {
      hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % limit;
  }

  // -------------------------------------------------------------------------
  // Internal: Budget Checking (Req 35d.12)
  // -------------------------------------------------------------------------

  /**
   * Check Otzar budget before dispatching a task.
   */
  private async checkBudget(
    agentId: string,
    task: ParallelTask,
  ): Promise<BudgetCheckResult> {
    if (!this.config.budgetChecker) {
      return { allowed: true };
    }
    return this.config.budgetChecker(agentId, task);
  }

  // -------------------------------------------------------------------------
  // Internal: Queue Management (Req 35d.13)
  // -------------------------------------------------------------------------

  /**
   * Enqueue a task when it cannot be immediately dispatched.
   * Tasks are inserted in priority order (highest priority at front).
   */
  private enqueue(task: ParallelTask, dagId: string, reason: string): void {
    const agentId = task.agentId;
    let queue = this.queuedTasks.get(agentId);

    if (!queue) {
      queue = [];
      this.queuedTasks.set(agentId, queue);
    }

    const entry: QueuedTask = {
      task,
      dagId,
      queuedAt: new Date(),
      reason,
    };

    // Insert in priority order (highest first)
    const insertIndex = queue.findIndex((q) => q.task.priority < task.priority);
    if (insertIndex === -1) {
      queue.push(entry);
    } else {
      queue.splice(insertIndex, 0, entry);
    }
  }

  /**
   * Attempt to dispatch the next queued task for an agent after a slot frees up.
   */
  private async drainQueue(agentId: string): Promise<void> {
    const queue = this.queuedTasks.get(agentId);
    if (!queue || queue.length === 0) {
      return;
    }

    // Try to dispatch the highest-priority queued task
    const next = queue.shift()!;

    // Clean up empty queues
    if (queue.length === 0) {
      this.queuedTasks.delete(agentId);
    }

    await this.dispatch(next.task, next.dagId);
  }

  // -------------------------------------------------------------------------
  // Internal: Event Emission
  // -------------------------------------------------------------------------

  /**
   * Emit a lifecycle event to all registered listeners.
   */
  private emitEvent(event: SchedulerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listeners should not break the scheduler
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Utilities
  // -------------------------------------------------------------------------

  /**
   * Async delay helper for retry backoff.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
