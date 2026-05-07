/**
 * Mishmar governance data models.
 */

import type { AuthorityLevel } from './enums.js';

// ---------------------------------------------------------------------------
// Authorization Request
// ---------------------------------------------------------------------------

export interface AuthorizationRequest {
  agentId: string;
  action: string;
  target: string;
  authorityLevel: AuthorityLevel;
  context: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Authorization Result
// ---------------------------------------------------------------------------

export interface AuthorizationResult {
  authorized: boolean;
  reason: string;
  escalation?: EscalationRequest;
  auditId: string;
}

// ---------------------------------------------------------------------------
// Escalation Request
// ---------------------------------------------------------------------------

export interface EscalationRequest {
  fromAgentId: string;
  toLevel: AuthorityLevel;
  action: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Token Request
// ---------------------------------------------------------------------------

export interface TokenRequest {
  agentId: string;
  action: string;
  target: string;
  authorityLevel: AuthorityLevel;
}

// ---------------------------------------------------------------------------
// Execution Token
// ---------------------------------------------------------------------------

export interface ExecutionToken {
  tokenId: string;
  agentId: string;
  action: string;
  issuedAt: Date;
  expiresAt: Date;
  issuedBy: string;
}

// ---------------------------------------------------------------------------
// Completion Validation Result
// ---------------------------------------------------------------------------

export interface CompletionValidationResult {
  valid: boolean;
  violations: SchemaViolation[];
  contractId: string;
}

// ---------------------------------------------------------------------------
// Schema Violation
// ---------------------------------------------------------------------------

export interface SchemaViolation {
  path: string;
  message: string;
  expected: string;
  actual?: string;
}

// ---------------------------------------------------------------------------
// Workflow Context (for separation validation)
// ---------------------------------------------------------------------------

export interface WorkflowContext {
  workflowId: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  agentId: string;
  role: 'decider' | 'executor' | 'verifier';
  action: string;
}

// ---------------------------------------------------------------------------
// Separation Result
// ---------------------------------------------------------------------------

export interface SeparationResult {
  valid: boolean;
  violations: SeparationViolation[];
}

export interface SeparationViolation {
  agentId: string;
  action: string;
  conflictingRoles: string[];
}
