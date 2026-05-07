/**
 * XO Audit service interface — immutable audit trail for all system actions.
 */

import type {
  AuditEntry,
  GovernanceAuditEntry,
  TransitionAuditEntry,
  AuditFilter,
  AuditRecord,
  IntegrityResult,
} from '../types/audit.js';

export interface XOAuditService {
  // Recording
  recordAction(entry: AuditEntry): Promise<string>;
  recordGovernanceDecision(entry: GovernanceAuditEntry): Promise<string>;
  recordStateTransition(entry: TransitionAuditEntry): Promise<string>;

  // Querying
  query(filter: AuditFilter): Promise<AuditRecord[]>;

  // Immutability
  verifyIntegrity(recordId: string): Promise<IntegrityResult>;
}
