/**
 * Parallel execution types used by the AgentRuntime interface.
 *
 * These types are defined here (rather than imported from @seraphim/services)
 * to avoid circular dependencies between the core and services packages.
 * They mirror the relevant types from the parallel orchestration module.
 */

import type { Task, TaskResult } from '../types/task.js';

// ---------------------------------------------------------------------------
// Parallel Task Input
// ---------------------------------------------------------------------------

/**
 * Input structure for parallel task execution.
 * Represents a task with its dependency information for DAG construction.
 */
export interface ParallelTaskInput {
  /** Unique identifier for this parallel task */
  id: string;
  /** The agent that should execute this task */
  agentId: string;
  /** The task to execute */
  task: Task;
  /** IDs of tasks this task depends on (must complete before this one starts) */
  dependencies: string[];
  /** Execution priority (higher = more important) */
  priority: number;
  /** Estimated duration in milliseconds */
  estimatedDurationMs?: number;
}

// ---------------------------------------------------------------------------
// Parallel Execution Options
// ---------------------------------------------------------------------------

/**
 * Options for controlling parallel execution behavior.
 */
export interface ParallelExecutionOptions {
  /** Maximum number of tasks to run concurrently (default: 5) */
  maxConcurrency?: number;
  /** Timeout for the entire parallel execution in milliseconds */
  timeoutMs?: number;
  /** Strategy for aggregating results from parallel streams */
  aggregationStrategy?: 'merge' | 'concatenate' | 'vote' | 'custom';
  /** Custom aggregation function (used when strategy is 'custom') */
  customAggregator?: (results: Map<string, TaskResult>) => unknown;
  /** Whether to continue executing remaining tasks if one fails */
  continueOnFailure?: boolean;
}

// ---------------------------------------------------------------------------
// Aggregated Result
// ---------------------------------------------------------------------------

/**
 * Result of a parallel execution containing aggregated outputs from all streams.
 */
export interface AggregatedResult {
  /** The DAG identifier for this execution */
  dagId: string;
  /** Total number of parallel streams/tasks */
  totalStreams: number;
  /** Number of streams that completed successfully */
  successfulStreams: number;
  /** Number of streams that failed */
  failedStreams: number;
  /** Merged output from all streams */
  mergedOutput: unknown;
  /** Individual results keyed by task ID */
  perStreamResults: Map<string, TaskResult>;
  /** Timestamp when aggregation completed */
  aggregatedAt: Date;
}

// ---------------------------------------------------------------------------
// Parallel Health Info
// ---------------------------------------------------------------------------

/**
 * Health information specific to parallel execution capabilities.
 */
export interface ParallelHealthInfo {
  /** Whether parallel execution services are available */
  parallelEnabled: boolean;
  /** Number of currently active parallel DAGs */
  activeDAGs: number;
  /** Total tasks currently executing in parallel */
  activeTasks: number;
  /** Total tasks queued for execution */
  queuedTasks: number;
}
