/**
 * Agent Runtime — barrel export.
 */

export { DefaultAgentRuntime, classifyError } from './runtime.js';
export { buildSystemPrompt, buildConversationMessages, formatConversationHistory } from './prompt-builder.js';
export { GovernedMemoryAccess } from './governed-memory.js';
export { buildCognitionEnvelope, buildCognitionEnvelopeFromServices, validateEnvelope, summarizeEnvelope } from './cognition-envelope.js';
export type {
  AgentRuntimeDeps,
  ErrorTier,
  ParallelScheduler,
  CoordinationBus,
  ResultAggregator,
  DependencyGraphEngine,
  WorkingMemoryState,
  SessionContinuityRecord,
} from './runtime.js';
export type {
  GovernedMemoryAccessDeps,
  GovernedWriteEntry,
  MemoryAccessResult,
} from './governed-memory.js';
export type {
  CognitionEnvelope,
  CognitionEnvelopeInput,
  CognitionEnvelopeDeps,
  MCPToolDescriptor,
  DelegationPolicy,
  AutonomyMode,
  ToolSelectionPolicy,
} from './cognition-envelope.js';
export { createPlan, getReadySubtasks, completeSubtask, failSubtask } from './planning-engine.js';
export type { ExecutionPlan, PlanSubtask, PlanStatus, SubtaskStatus } from './planning-engine.js';
export { createDelegationRequest, createDelegationSuccess, createDelegationFailure, canDelegate, aggregateResults } from './delegation-engine.js';
export type { DelegationRequest, DelegationResult } from './delegation-engine.js';
export { getEffectiveMode, requiresHumanGate, shouldEscalate, DEFAULT_AUTONOMY_CONFIGS } from './autonomy-config.js';
export type { AutonomyConfig, HumanGate, EscalationPolicy } from './autonomy-config.js';
export { ExecutionTraceBuilder } from './execution-trace.js';
export type { ExecutionTrace, ToolInvocation, DelegationRecord, MemoryRetrieval, GovernanceCheck, BudgetCheck } from './execution-trace.js';
export { guardEnvelopeRequired, guardMemoryRetrieval, guardToolInvocation, guardHardcodedTool, validateAgenticBehavior, runAllGuards } from './anti-chatbot-guards.js';
export type { GuardViolation } from './anti-chatbot-guards.js';
