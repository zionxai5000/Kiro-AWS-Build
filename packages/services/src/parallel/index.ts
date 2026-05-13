/**
 * Parallel Agent Orchestration module.
 *
 * Provides DAG-based dependency management, parallel scheduling,
 * coordination bus, result aggregation, and multi-agent task execution.
 */

export { DependencyGraphEngineImpl } from './dependency-graph.js';
export { ParallelSchedulerImpl } from './scheduler.js';
export { CoordinationBusImpl } from './coordination-bus.js';
export { ResultAggregatorImpl } from './result-aggregator.js';
export type {
  DependencyGraphEngine,
  ParallelScheduler,
  CoordinationBus,
  CoordinationMessage,
  ResultAggregator,
  AggregationStrategy,
  AggregatedResult,
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
  DAGExecutionStatus,
  ParallelStream,
  ResourceRequirements,
  SchedulerConfig,
  BudgetCheckResult,
  DispatchResult,
  SchedulerStatus,
} from './types.js';
export type { SchedulerEvent, SchedulerEventType, SchedulerEventCallback } from './scheduler.js';
