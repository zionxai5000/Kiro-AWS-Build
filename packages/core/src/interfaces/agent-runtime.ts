/**
 * Agent Runtime interface — core execution environment for all agents.
 */

import type { AgentProgram, AgentInstance, AgentFilter } from '../types/agent.js';
import type { Task, TaskResult } from '../types/task.js';
import type { AgentState } from '../types/enums.js';
import type { HealthStatus } from '../types/driver.js';
import type {
  ParallelTaskInput,
  ParallelExecutionOptions,
  AggregatedResult,
} from './parallel-types.js';

export interface AgentRuntime {
  // Lifecycle
  deploy(program: AgentProgram): Promise<AgentInstance>;
  upgrade(agentId: string, newVersion: AgentProgram): Promise<void>;
  terminate(agentId: string, reason: string): Promise<void>;

  // Execution
  execute(agentId: string, task: Task): Promise<TaskResult>;
  getState(agentId: string): Promise<AgentState>;

  // Parallel Execution (optional — implementations may omit these)
  /**
   * Execute multiple tasks in parallel using DAG-based dependency resolution.
   * Falls back to sequential execution if parallel services are not available.
   */
  executeParallel?(tasks: ParallelTaskInput[], options?: ParallelExecutionOptions): Promise<AggregatedResult>;

  /**
   * Dispatch tasks to multiple agents simultaneously for inter-agent parallel execution.
   * Each agent receives one task; dependencies between agents can be specified via options.
   */
  dispatchToAgents?(assignments: Map<string, Task>, options?: ParallelExecutionOptions): Promise<AggregatedResult>;

  // Registry
  listAgents(filter?: AgentFilter): Promise<AgentInstance[]>;
  getHealth(agentId: string): Promise<HealthStatus>;
}
