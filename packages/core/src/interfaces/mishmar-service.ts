/**
 * Mishmar (Governance) service interface — runtime governance enforcement.
 */

import type {
  AuthorizationRequest,
  AuthorizationResult,
  TokenRequest,
  ExecutionToken,
  CompletionValidationResult,
  WorkflowContext,
  SeparationResult,
} from '../types/governance.js';
import type { AuthorityLevel } from '../types/enums.js';

export interface MishmarService {
  // Authorization
  authorize(request: AuthorizationRequest): Promise<AuthorizationResult>;
  checkAuthorityLevel(agentId: string, action: string): Promise<AuthorityLevel>;

  // Execution Tokens
  requestToken(request: TokenRequest): Promise<ExecutionToken>;
  validateToken(token: ExecutionToken): Promise<boolean>;

  // Completion Contracts
  validateCompletion(
    workflowId: string,
    outputs: Record<string, unknown>,
  ): Promise<CompletionValidationResult>;

  // Role Separation
  validateSeparation(workflow: WorkflowContext): Promise<SeparationResult>;
}
