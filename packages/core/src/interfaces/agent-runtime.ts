/**
 * Agent Runtime interface — core execution environment for all agents.
 */

import type { AgentProgram, AgentInstance, AgentFilter } from '../types/agent.js';
import type { Task, TaskResult } from '../types/task.js';
import type { AgentState } from '../types/enums.js';
import type { HealthStatus } from '../types/driver.js';

export interface AgentRuntime {
  // Lifecycle
  deploy(program: AgentProgram): Promise<AgentInstance>;
  upgrade(agentId: string, newVersion: AgentProgram): Promise<void>;
  terminate(agentId: string, reason: string): Promise<void>;

  // Execution
  execute(agentId: string, task: Task): Promise<TaskResult>;
  getState(agentId: string): Promise<AgentState>;

  // Registry
  listAgents(filter?: AgentFilter): Promise<AgentInstance[]>;
  getHealth(agentId: string): Promise<HealthStatus>;
}
