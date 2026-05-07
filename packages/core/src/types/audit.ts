/**
 * XO Audit data models — immutable audit trail.
 */

import type { AuthorityLevel } from './enums.js';

// ---------------------------------------------------------------------------
// Authorization Step
// ---------------------------------------------------------------------------

export interface AuthorizationStep {
  agentId: string;
  level: AuthorityLevel;
  decision: 'approved' | 'denied' | 'escalated';
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Audit Record
// ---------------------------------------------------------------------------

export interface AuditRecord {
  id: string;
  tenantId: string;
  timestamp: Date;
  type: 'action' | 'governance' | 'transition' | 'security';

  // Actor
  actingAgentId: string;
  actingAgentName: string;

  // Action
  actionType: string;
  target: string;

  // Authorization chain
  authorizationChain: AuthorizationStep[];
  executionTokens: string[];

  // Result
  outcome: 'success' | 'failure' | 'blocked';
  details: Record<string, unknown>;

  // Immutability — SHA-256 hash chain
  hash: string;
  previousHash: string;
}

// ---------------------------------------------------------------------------
// Audit Filter
// ---------------------------------------------------------------------------

export interface AuditFilter {
  agentId?: string;
  timeRange?: { start: Date; end: Date };
  actionType?: string;
  pillar?: string;
  outcome?: 'success' | 'failure' | 'blocked';
  limit?: number;
  cursor?: string;
}

// ---------------------------------------------------------------------------
// Specialized Audit Entry types (input to recording methods)
// ---------------------------------------------------------------------------

export interface AuditEntry {
  tenantId: string;
  actingAgentId: string;
  actingAgentName: string;
  actionType: string;
  target: string;
  authorizationChain: AuthorizationStep[];
  executionTokens: string[];
  outcome: 'success' | 'failure' | 'blocked';
  details: Record<string, unknown>;
}

export interface GovernanceAuditEntry extends AuditEntry {
  governanceType: 'authorization' | 'escalation' | 'completion_validation' | 'token_grant';
}

export interface TransitionAuditEntry extends AuditEntry {
  stateMachineId: string;
  instanceId: string;
  previousState: string;
  newState: string;
  gateResults: Array<{ gateId: string; passed: boolean; details: string }>;
}

// ---------------------------------------------------------------------------
// Integrity Result
// ---------------------------------------------------------------------------

export interface IntegrityResult {
  valid: boolean;
  recordId: string;
  chainLength: number;
  brokenAt?: string;
}
