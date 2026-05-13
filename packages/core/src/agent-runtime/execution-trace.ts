/**
 * Execution Trace — Full observability for every agent action.
 *
 * Requirements: 54.1, 54.2, 54.4, 54.5
 */

import { randomUUID } from 'node:crypto';
import type { AutonomyMode } from './autonomy-config.js';

export interface ToolInvocation {
  tool: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  success: boolean;
}

export interface DelegationRecord {
  agentId: string;
  scope: string;
  result: string;
  durationMs: number;
  success: boolean;
}

export interface MemoryRetrieval {
  layer: string;
  query: string;
  resultCount: number;
}

export interface GovernanceCheck {
  check: string;
  result: 'passed' | 'blocked';
  reason: string;
}

export interface BudgetCheck {
  estimated: number;
  remaining: number;
  approved: boolean;
}

export interface ExecutionTrace {
  id: string;
  agentId: string;
  taskId: string;
  timestamp: Date;
  durationMs: number;

  // What happened
  planGenerated: boolean;
  planId?: string;
  toolsConsidered: string[];
  toolsSelected: string[];
  toolsInvoked: ToolInvocation[];
  agentsDelegatedTo: DelegationRecord[];
  memoryRetrieved: MemoryRetrieval[];
  governanceChecks: GovernanceCheck[];
  budgetChecks: BudgetCheck[];
  actionsPerformed: string[];

  // Final output
  synthesisReasoning: string;
  finalOutput: unknown;

  // Metadata
  autonomyMode: AutonomyMode;
  envelopeHash: string;
  success: boolean;
  error?: string;
}

/**
 * Create a new execution trace builder for tracking an agent action.
 */
export class ExecutionTraceBuilder {
  private trace: ExecutionTrace;

  constructor(agentId: string, taskId: string, autonomyMode: AutonomyMode, envelopeHash: string) {
    this.trace = {
      id: randomUUID(),
      agentId,
      taskId,
      timestamp: new Date(),
      durationMs: 0,
      planGenerated: false,
      toolsConsidered: [],
      toolsSelected: [],
      toolsInvoked: [],
      agentsDelegatedTo: [],
      memoryRetrieved: [],
      governanceChecks: [],
      budgetChecks: [],
      actionsPerformed: [],
      synthesisReasoning: '',
      finalOutput: null,
      autonomyMode,
      envelopeHash,
      success: false,
    };
  }

  recordPlan(planId: string): this { this.trace.planGenerated = true; this.trace.planId = planId; return this; }
  recordToolConsidered(tool: string): this { this.trace.toolsConsidered.push(tool); return this; }
  recordToolSelected(tool: string): this { this.trace.toolsSelected.push(tool); return this; }
  recordToolInvocation(invocation: ToolInvocation): this { this.trace.toolsInvoked.push(invocation); return this; }
  recordDelegation(delegation: DelegationRecord): this { this.trace.agentsDelegatedTo.push(delegation); return this; }
  recordMemoryRetrieval(retrieval: MemoryRetrieval): this { this.trace.memoryRetrieved.push(retrieval); return this; }
  recordGovernanceCheck(check: GovernanceCheck): this { this.trace.governanceChecks.push(check); return this; }
  recordBudgetCheck(check: BudgetCheck): this { this.trace.budgetChecks.push(check); return this; }
  recordAction(action: string): this { this.trace.actionsPerformed.push(action); return this; }

  complete(output: unknown, reasoning: string, success: boolean, error?: string): ExecutionTrace {
    this.trace.durationMs = Date.now() - this.trace.timestamp.getTime();
    this.trace.finalOutput = output;
    this.trace.synthesisReasoning = reasoning;
    this.trace.success = success;
    this.trace.error = error;
    return this.trace;
  }
}
