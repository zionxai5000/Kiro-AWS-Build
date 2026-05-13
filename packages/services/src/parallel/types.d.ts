/**
 * Parallel Agent Orchestration — Type Definitions
 *
 * Types for the Dependency Graph Engine, Parallel Scheduler,
 * and Result Aggregator.
 *
 * Requirements: 35c.8, 35c.9, 35c.10, 35c.11
 */
import type { Task, TaskResult } from '@seraphim/core';
export interface ResourceRequirements {
    /** Minimum CPU units required */
    cpuUnits: number;
    /** Minimum memory in MB */
    memoryMb: number;
    /** Whether GPU is required */
    gpu?: boolean;
    /** Maximum cost budget in USD for this task */
    maxCostUsd?: number;
}
export interface ParallelTask {
    id: string;
    agentId: string;
    task: Task;
    /** Task IDs this task depends on */
    dependencies: string[];
    priority: number;
    /** Estimated duration in milliseconds */
    estimatedDuration: number;
    resourceRequirements: ResourceRequirements;
}
export interface TaskDAG {
    id: string;
    tasks: Map<string, ParallelTask>;
    edges: Array<{
        from: string;
        to: string;
    }>;
    metadata: {
        createdBy: string;
        createdAt: Date;
        estimatedTotalDuration: number;
    };
}
export interface DAGValidationResult {
    valid: boolean;
    errors: DAGValidationError[];
}
export interface DAGValidationError {
    type: 'circular_dependency' | 'missing_dependency' | 'self_dependency';
    message: string;
    /** The cycle path for circular dependency errors */
    cyclePath?: string[];
    /** The task ID that has the issue */
    taskId?: string;
}
export interface ExecutionPlan {
    dagId: string;
    /** Batches of tasks that can run in parallel. Batches execute sequentially. */
    batches: ExecutionBatch[];
    estimatedTotalDuration: number;
    totalTasks: number;
}
export interface ExecutionBatch {
    /** Batch index (0-based) */
    index: number;
    /** Tasks in this batch can all run in parallel */
    taskIds: string[];
    /** Estimated duration for this batch (max of task durations) */
    estimatedDuration: number;
}
export type TaskStatus = 'waiting' | 'ready' | 'executing' | 'completed' | 'failed';
export interface TaskExecutionState {
    taskId: string;
    status: TaskStatus;
    result?: TaskResult;
    startedAt?: Date;
    completedAt?: Date;
}
export interface DAGExecutionStatus {
    dagId: string;
    totalTasks: number;
    completed: number;
    inProgress: number;
    waiting: number;
    failed: number;
    estimatedCompletion: Date;
    activeStreams: ParallelStream[];
}
export interface ParallelStream {
    taskId: string;
    agentId: string;
    status: 'executing' | 'waiting_dependency' | 'completed' | 'failed';
    startedAt: Date;
    progress: number;
    blockedBy?: string[];
}
export interface DeadlockResult {
    hasDeadlock: boolean;
    /** Tasks that are permanently blocked */
    blockedTasks: BlockedTask[];
}
export interface BlockedTask {
    taskId: string;
    /** The reason this task is blocked */
    reason: string;
    /** The failed dependency that caused the block */
    blockedBy: string[];
}
export interface DependencyGraphEngine {
    createGraph(tasks: ParallelTask[]): Promise<TaskDAG>;
    validateGraph(dag: TaskDAG): Promise<DAGValidationResult>;
    schedule(dag: TaskDAG): Promise<ExecutionPlan>;
    getReadyTasks(dag: TaskDAG): Promise<ParallelTask[]>;
    markComplete(taskId: string, result: TaskResult): Promise<void>;
    detectDeadlocks(dagId: string): Promise<DeadlockResult>;
}
export interface SchedulerConfig {
    /** Default max concurrent tasks per agent (default: 5) */
    defaultParallelismLimit: number;
    /** Per-agent parallelism overrides */
    agentLimits?: Record<string, number>;
    /** Work distribution strategy */
    distributionStrategy: 'round-robin' | 'least-loaded' | 'affinity';
    /** Max retries for failed tasks (default: 3) */
    maxRetries: number;
    /** Delay between retries in ms (default: 1000) */
    retryDelayMs: number;
    /** Optional budget checker function */
    budgetChecker?: (agentId: string, task: ParallelTask) => Promise<BudgetCheckResult>;
}
export interface BudgetCheckResult {
    allowed: boolean;
    reason?: string;
    remainingBudget?: number;
}
export interface DispatchResult {
    taskId: string;
    status: 'dispatched' | 'queued' | 'rejected';
    reason?: string;
    slot?: number;
}
export interface SchedulerStatus {
    totalActive: number;
    totalQueued: number;
    perAgent: Record<string, {
        active: number;
        queued: number;
        limit: number;
    }>;
}
export interface ParallelScheduler {
    configure(config: SchedulerConfig): void;
    dispatch(task: ParallelTask, dagId: string): Promise<DispatchResult>;
    dispatchBatch(tasks: ParallelTask[], dagId: string): Promise<DispatchResult[]>;
    getActiveCount(agentId: string): number;
    getQueuedCount(agentId: string): number;
    handleCompletion(taskId: string, result: TaskResult): Promise<void>;
    handleFailure(taskId: string, error: string): Promise<void>;
    getStatus(): SchedulerStatus;
}
export interface CoordinationMessage {
    type: 'intermediate_result' | 'dependency_complete' | 'request_info' | 'status_update' | 'error';
    fromAgent: string;
    dagId: string;
    payload: Record<string, unknown>;
    timestamp: Date;
}
export interface CoordinationBus {
    /** Send a message to a specific agent */
    sendToAgent(fromAgentId: string, toAgentId: string, message: CoordinationMessage): Promise<void>;
    /** Broadcast a message to all agents in a DAG */
    broadcast(fromAgentId: string, dagId: string, message: CoordinationMessage): Promise<void>;
    /** Signal that a task has completed with its output */
    signalCompletion(taskId: string, output: unknown): Promise<void>;
    /** Wait for a dependency task to complete, with configurable timeout */
    waitForDependency(taskId: string, dependencyId: string, timeout?: number): Promise<unknown>;
    /** Share an intermediate result for a DAG */
    shareIntermediateResult(agentId: string, dagId: string, key: string, value: unknown): Promise<void>;
    /** Retrieve a previously shared intermediate result */
    getIntermediateResult(dagId: string, key: string): Promise<unknown | null>;
    /** Subscribe to messages for a specific agent */
    onMessage(agentId: string, handler: (msg: CoordinationMessage) => void): Promise<string>;
    /** Unsubscribe from messages */
    offMessage(subscriptionId: string): Promise<void>;
}
export type AggregationStrategy = 'merge' | 'concatenate' | 'vote' | 'custom';
export interface AggregatedResult {
    dagId: string;
    totalStreams: number;
    successfulStreams: number;
    failedStreams: number;
    mergedOutput: unknown;
    perStreamResults: Map<string, TaskResult>;
    aggregatedAt: Date;
}
export interface ResultAggregator {
    /** Store an individual stream result as it completes */
    collectResult(dagId: string, taskId: string, result: TaskResult): Promise<void>;
    /** Aggregate when all streams complete */
    aggregate(dagId: string, strategy: AggregationStrategy, customFn?: (results: Map<string, TaskResult>) => unknown): Promise<AggregatedResult>;
    /** Return results collected so far for in-progress DAGs */
    getPartialResults(dagId: string): Promise<Map<string, TaskResult>>;
}
export { Task, TaskResult };
//# sourceMappingURL=types.d.ts.map