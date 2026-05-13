/**
 * A2A Delegation Engine — Enables agent-to-agent task delegation.
 * Agents delegate subtasks to specialized agents, receive results, and aggregate.
 *
 * Requirements: 52.1, 52.2, 52.3, 52.4, 52.5, 52.7
 */

import { randomUUID } from 'node:crypto';

export interface DelegationRequest {
  id: string;
  initiatingAgentId: string;
  targetAgentId: string;
  scope: string;
  constraints: string[];
  expectedOutputFormat: string;
  timeout: number;
  authorityLevel: 'L1' | 'L2' | 'L3' | 'L4';
  context: Record<string, unknown>;
  parentPlanId?: string;
  parentSubtaskId?: string;
  createdAt: Date;
}

export interface DelegationResult {
  requestId: string;
  targetAgentId: string;
  status: 'completed' | 'failed' | 'timeout' | 'rejected';
  output?: unknown;
  error?: string;
  durationMs: number;
  completedAt: Date;
}

/**
 * Create a delegation request.
 */
export function createDelegationRequest(
  initiatingAgentId: string,
  targetAgentId: string,
  scope: string,
  options: {
    constraints?: string[];
    expectedOutputFormat?: string;
    timeout?: number;
    authorityLevel?: 'L1' | 'L2' | 'L3' | 'L4';
    context?: Record<string, unknown>;
    parentPlanId?: string;
    parentSubtaskId?: string;
  } = {},
): DelegationRequest {
  return {
    id: randomUUID(),
    initiatingAgentId,
    targetAgentId,
    scope,
    constraints: options.constraints ?? [],
    expectedOutputFormat: options.expectedOutputFormat ?? 'text',
    timeout: options.timeout ?? 30000,
    authorityLevel: options.authorityLevel ?? 'L3',
    context: options.context ?? {},
    parentPlanId: options.parentPlanId,
    parentSubtaskId: options.parentSubtaskId,
    createdAt: new Date(),
  };
}

/**
 * Create a successful delegation result.
 */
export function createDelegationSuccess(request: DelegationRequest, output: unknown, durationMs: number): DelegationResult {
  return {
    requestId: request.id,
    targetAgentId: request.targetAgentId,
    status: 'completed',
    output,
    durationMs,
    completedAt: new Date(),
  };
}

/**
 * Create a failed delegation result.
 */
export function createDelegationFailure(request: DelegationRequest, error: string, durationMs: number): DelegationResult {
  return {
    requestId: request.id,
    targetAgentId: request.targetAgentId,
    status: 'failed',
    error,
    durationMs,
    completedAt: new Date(),
  };
}

/**
 * Check if an agent is authorized to delegate to a target.
 */
export function canDelegate(
  initiatingAgentId: string,
  targetAgentId: string,
  allowedTargets: string[],
): boolean {
  return allowedTargets.includes(targetAgentId);
}

/**
 * Aggregate multiple delegation results into a summary.
 */
export function aggregateResults(results: DelegationResult[]): {
  allSucceeded: boolean;
  successCount: number;
  failureCount: number;
  outputs: unknown[];
  errors: string[];
} {
  const successes = results.filter(r => r.status === 'completed');
  const failures = results.filter(r => r.status !== 'completed');
  return {
    allSucceeded: failures.length === 0,
    successCount: successes.length,
    failureCount: failures.length,
    outputs: successes.map(r => r.output),
    errors: failures.map(r => r.error ?? `${r.status}: ${r.targetAgentId}`),
  };
}
