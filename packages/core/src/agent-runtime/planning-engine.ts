/**
 * Planning Engine — Converts complex directives into structured execution plans.
 * Plans include subtasks, dependencies, tools, agents, gates, and budget estimates.
 * Plans are persisted in Zikaron for resumability after failure/restart.
 *
 * Requirements: 50.1, 50.2, 50.3, 50.4, 50.5
 */

import { randomUUID } from 'node:crypto';

export type PlanStatus = 'planning' | 'approved' | 'executing' | 'completed' | 'failed' | 'paused';
export type SubtaskStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';

export interface PlanSubtask {
  id: string;
  description: string;
  requiredTools: string[];
  requiredAgents: string[];
  dependencies: string[];
  risks: string[];
  expectedOutput: string;
  gate?: string;
  budgetEstimate: number;
  approvalRequired: boolean;
  status: SubtaskStatus;
  result?: unknown;
  error?: string;
}

export interface ExecutionPlan {
  id: string;
  agentId: string;
  objective: string;
  createdAt: Date;
  updatedAt: Date;
  status: PlanStatus;
  subtasks: PlanSubtask[];
  totalBudgetEstimate: number;
  approvalRequirements: Array<{ level: 'L1' | 'L2' | 'L3'; reason: string }>;
  autonomyMode: 'crawl' | 'walk' | 'run';
}

/**
 * Create a new execution plan from an objective and subtask descriptions.
 */
export function createPlan(
  agentId: string,
  objective: string,
  subtasks: Array<Omit<PlanSubtask, 'id' | 'status' | 'result' | 'error'>>,
  autonomyMode: 'crawl' | 'walk' | 'run' = 'walk',
): ExecutionPlan {
  const now = new Date();
  const planSubtasks: PlanSubtask[] = subtasks.map(st => ({
    ...st,
    id: randomUUID(),
    status: 'pending' as SubtaskStatus,
  }));

  const totalBudget = planSubtasks.reduce((sum, st) => sum + st.budgetEstimate, 0);
  const approvals: ExecutionPlan['approvalRequirements'] = [];
  if (planSubtasks.some(st => st.approvalRequired)) {
    approvals.push({ level: 'L2', reason: 'Subtask requires explicit approval' });
  }

  return {
    id: randomUUID(),
    agentId,
    objective,
    createdAt: now,
    updatedAt: now,
    status: 'planning',
    subtasks: planSubtasks,
    totalBudgetEstimate: totalBudget,
    approvalRequirements: approvals,
    autonomyMode,
  };
}

/**
 * Get the next executable subtasks (those with all dependencies satisfied).
 */
export function getReadySubtasks(plan: ExecutionPlan): PlanSubtask[] {
  const completedIds = new Set(
    plan.subtasks.filter(st => st.status === 'completed').map(st => st.id)
  );
  return plan.subtasks.filter(st =>
    st.status === 'pending' &&
    st.dependencies.every(dep => completedIds.has(dep))
  );
}

/**
 * Mark a subtask as completed and update the plan status.
 */
export function completeSubtask(plan: ExecutionPlan, subtaskId: string, result: unknown): ExecutionPlan {
  const updated = { ...plan, updatedAt: new Date() };
  const subtask = updated.subtasks.find(st => st.id === subtaskId);
  if (subtask) {
    subtask.status = 'completed';
    subtask.result = result;
  }
  // Check if all subtasks are done
  if (updated.subtasks.every(st => st.status === 'completed' || st.status === 'skipped')) {
    updated.status = 'completed';
  }
  return updated;
}

/**
 * Mark a subtask as failed and optionally revise the plan.
 */
export function failSubtask(plan: ExecutionPlan, subtaskId: string, error: string): ExecutionPlan {
  const updated = { ...plan, updatedAt: new Date() };
  const subtask = updated.subtasks.find(st => st.id === subtaskId);
  if (subtask) {
    subtask.status = 'failed';
    subtask.error = error;
  }
  // Skip dependent subtasks
  const failedId = subtaskId;
  for (const st of updated.subtasks) {
    if (st.status === 'pending' && st.dependencies.includes(failedId)) {
      st.status = 'skipped';
      st.error = `Skipped: dependency ${failedId} failed`;
    }
  }
  // If all remaining are skipped/completed/failed, mark plan as failed
  if (updated.subtasks.every(st => st.status !== 'pending' && st.status !== 'executing')) {
    updated.status = updated.subtasks.some(st => st.status === 'failed') ? 'failed' : 'completed';
  }
  return updated;
}
