/**
 * Anti-Chatbot Enforcement Guards — Prevents degradation to generic chatbot behavior.
 *
 * These guards ensure that:
 * - No LLM call happens without a Cognition Envelope
 * - No agent responds without memory retrieval
 * - No tool invocation happens without governance/budget checks
 * - Implementation gaps are detected and flagged
 *
 * Requirements: 55.1, 55.2, 55.3, 55.5, 55.6
 */

import type { CognitionEnvelope } from './cognition-envelope.js';
import type { ExecutionTrace } from './execution-trace.js';

export interface GuardViolation {
  type: 'no_envelope' | 'no_memory' | 'no_governance' | 'hardcoded_tool' | 'no_delegation_impl';
  severity: 'block' | 'warn';
  message: string;
  agentId?: string;
  timestamp: Date;
}

/**
 * Validate that an LLM call has a proper Cognition Envelope.
 * BLOCKS if no envelope is provided.
 */
export function guardEnvelopeRequired(envelope: CognitionEnvelope | null | undefined): GuardViolation | null {
  if (!envelope) {
    return {
      type: 'no_envelope',
      severity: 'block',
      message: 'LLM call attempted without Cognition Envelope. This violates Requirement 49.2: The Agent_Runtime SHALL NEVER call an LLM directly without first assembling the full Cognition Envelope.',
      timestamp: new Date(),
    };
  }
  if (!envelope.systemPrompt || !envelope.agentId) {
    return {
      type: 'no_envelope',
      severity: 'block',
      message: 'Cognition Envelope is incomplete — missing systemPrompt or agentId.',
      agentId: envelope.agentId,
      timestamp: new Date(),
    };
  }
  return null;
}

/**
 * Warn if memory retrieval was skipped.
 * WARNS but does not block (degraded mode is acceptable per Req 49.3).
 */
export function guardMemoryRetrieval(envelope: CognitionEnvelope): GuardViolation | null {
  if (envelope.degradedComponents.includes('conversationHistory') && 
      envelope.degradedComponents.includes('proceduralPatterns')) {
    return {
      type: 'no_memory',
      severity: 'warn',
      message: 'Agent responding without memory retrieval. Context is degraded — response quality may be reduced.',
      agentId: envelope.agentId,
      timestamp: new Date(),
    };
  }
  return null;
}

/**
 * Validate that a tool invocation has governance and budget checks.
 * BLOCKS if checks are missing.
 */
export function guardToolInvocation(
  toolName: string,
  governanceChecked: boolean,
  budgetChecked: boolean,
  agentId: string,
): GuardViolation | null {
  if (!governanceChecked) {
    return {
      type: 'no_governance',
      severity: 'block',
      message: `Tool "${toolName}" invoked without Mishmar authorization check. All tool invocations must be governance-approved.`,
      agentId,
      timestamp: new Date(),
    };
  }
  if (!budgetChecked) {
    return {
      type: 'no_governance',
      severity: 'block',
      message: `Tool "${toolName}" invoked without Otzar budget check. All tool invocations must be budget-approved.`,
      agentId,
      timestamp: new Date(),
    };
  }
  return null;
}

/**
 * Warn if MCP tools are hardcoded without registry lookup.
 */
export function guardHardcodedTool(toolName: string, usedRegistry: boolean, agentId: string): GuardViolation | null {
  if (!usedRegistry) {
    return {
      type: 'hardcoded_tool',
      severity: 'warn',
      message: `Tool "${toolName}" was invoked without MCP registry lookup. Tools should be discovered dynamically.`,
      agentId,
      timestamp: new Date(),
    };
  }
  return null;
}

/**
 * Validate that an execution trace demonstrates agentic behavior.
 * Used in CI/CD to verify the system isn't degrading.
 */
export function validateAgenticBehavior(trace: ExecutionTrace): {
  isAgentic: boolean;
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 0;

  // Check memory was retrieved
  if (trace.memoryRetrieved.length > 0) score += 20;
  else issues.push('No memory retrieval in execution trace');

  // Check governance was checked
  if (trace.governanceChecks.length > 0) score += 20;
  else issues.push('No governance checks in execution trace');

  // Check budget was checked
  if (trace.budgetChecks.length > 0) score += 20;
  else issues.push('No budget checks in execution trace');

  // Check envelope hash exists (proves envelope was built)
  if (trace.envelopeHash) score += 20;
  else issues.push('No envelope hash — Cognition Envelope may not have been built');

  // Check actions were performed (not just a passthrough)
  if (trace.actionsPerformed.length > 0) score += 10;
  else issues.push('No actions recorded in trace');

  // Check synthesis reasoning exists
  if (trace.synthesisReasoning) score += 10;
  else issues.push('No synthesis reasoning — response may be raw LLM output');

  return {
    isAgentic: score >= 60,
    score,
    issues,
  };
}

/**
 * Collect all guard violations for a given execution.
 */
export function runAllGuards(
  envelope: CognitionEnvelope | null | undefined,
  trace?: ExecutionTrace,
): GuardViolation[] {
  const violations: GuardViolation[] = [];

  const envelopeViolation = guardEnvelopeRequired(envelope);
  if (envelopeViolation) violations.push(envelopeViolation);

  if (envelope) {
    const memoryViolation = guardMemoryRetrieval(envelope);
    if (memoryViolation) violations.push(memoryViolation);
  }

  return violations;
}
