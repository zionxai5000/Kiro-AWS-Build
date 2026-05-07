/**
 * Mishmar Governance Service — runtime governance enforcement.
 *
 * Implements the MishmarService interface from @seraphim/core.
 * Enforces authorization (L1–L4 authority matrix), role separation,
 * execution token management, and completion contract validation.
 * All governance decisions are logged to XO Audit.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import Ajv from 'ajv';
import { randomUUID } from 'node:crypto';

import type {
  MishmarService,
  XOAuditService,
  OtzarService,
} from '@seraphim/core';
import type {
  AuthorizationRequest,
  AuthorizationResult,
  TokenRequest,
  ExecutionToken,
  CompletionValidationResult,
  SchemaViolation,
  WorkflowContext,
  SeparationResult,
  SeparationViolation,
  EscalationRequest,
} from '@seraphim/core';
import type { AuthorityLevel, GovernanceAuditEntry } from '@seraphim/core';
import type { CompletionContract, JSONSchema } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface MishmarServiceConfig {
  /** Tenant ID for this service instance */
  tenantId: string;

  /** XO Audit service for logging governance decisions */
  auditService: XOAuditService;

  /** Otzar service for budget approval on execution tokens */
  otzarService: OtzarService;

  /** Token expiry duration in milliseconds (default: 5 minutes) */
  tokenExpiryMs?: number;

  /**
   * Agent authority registry — maps agentId to its authority level and
   * allowed actions. In production this would be backed by the DB;
   * here we accept an injectable lookup function.
   */
  getAgentAuthority: (agentId: string) => Promise<AgentAuthorityInfo | null>;

  /**
   * Action authority requirements — maps action names to the minimum
   * authority level required to perform them.
   */
  getActionRequirement: (action: string) => Promise<AuthorityLevel>;

  /**
   * Completion contract lookup — retrieves the contract for a workflow.
   */
  getCompletionContract: (workflowId: string) => Promise<CompletionContract | null>;
}

// ---------------------------------------------------------------------------
// Supporting Types
// ---------------------------------------------------------------------------

export interface AgentAuthorityInfo {
  agentId: string;
  agentName: string;
  authorityLevel: AuthorityLevel;
  allowedActions: string[];
  deniedActions: string[];
  pillar: string;
}

// ---------------------------------------------------------------------------
// Authority Level Numeric Mapping (L1 = highest, L4 = lowest)
// ---------------------------------------------------------------------------

const AUTHORITY_RANK: Record<AuthorityLevel, number> = {
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
};

/**
 * Returns the next escalation level above the given level.
 * L4 → L3, L3 → L2, L2 → L1, L1 → L1 (cannot escalate further)
 */
function getEscalationTarget(currentLevel: AuthorityLevel): AuthorityLevel {
  switch (currentLevel) {
    case 'L4':
      return 'L3';
    case 'L3':
      return 'L2';
    case 'L2':
      return 'L1';
    case 'L1':
      return 'L1';
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class MishmarServiceImpl implements MishmarService {
  private readonly config: MishmarServiceConfig;
  private readonly ajv: InstanceType<typeof Ajv>;

  /** In-memory store of issued tokens (production would use a DB/cache) */
  private readonly issuedTokens: Map<string, ExecutionToken> = new Map();

  /** Default token expiry: 5 minutes */
  private readonly tokenExpiryMs: number;

  constructor(config: MishmarServiceConfig) {
    this.config = config;
    this.tokenExpiryMs = config.tokenExpiryMs ?? 5 * 60 * 1000;
    this.ajv = new Ajv({ allErrors: true });
  }

  // -------------------------------------------------------------------------
  // Authorization (Req 3.1, 3.7)
  // -------------------------------------------------------------------------

  /**
   * Authorize an agent's action request against the L1–L4 authority matrix.
   *
   * Req 3.1: Block actions exceeding authority level and route escalation.
   * Req 3.7: Enforce authority levels L1–L4 as defined in the autonomy matrix.
   *
   * Decision flow:
   * 1. Look up agent's authority level
   * 2. Look up action's required authority level
   * 3. If agent's level is sufficient (numerically ≤ required), authorize
   * 4. If agent's level is insufficient, deny and create escalation request
   * 5. Check if action is in agent's denied list
   * 6. Log decision to XO Audit
   */
  async authorize(request: AuthorizationRequest): Promise<AuthorizationResult> {
    const agentInfo = await this.config.getAgentAuthority(request.agentId);

    // Unknown agent — deny
    if (!agentInfo) {
      const auditId = await this.logGovernanceDecision({
        agentId: request.agentId,
        agentName: 'unknown',
        action: request.action,
        target: request.target,
        outcome: 'blocked',
        governanceType: 'authorization',
        details: { reason: 'Agent not found in authority registry' },
      });

      return {
        authorized: false,
        reason: 'Agent not found in authority registry',
        auditId,
      };
    }

    // Check if action is explicitly denied for this agent
    if (agentInfo.deniedActions.includes(request.action)) {
      const auditId = await this.logGovernanceDecision({
        agentId: request.agentId,
        agentName: agentInfo.agentName,
        action: request.action,
        target: request.target,
        outcome: 'blocked',
        governanceType: 'authorization',
        details: { reason: 'Action explicitly denied for this agent' },
      });

      return {
        authorized: false,
        reason: 'Action explicitly denied for this agent',
        auditId,
      };
    }

    // Get the required authority level for this action
    const requiredLevel = await this.config.getActionRequirement(request.action);
    const agentRank = AUTHORITY_RANK[agentInfo.authorityLevel];
    const requiredRank = AUTHORITY_RANK[requiredLevel];

    // Agent's rank must be ≤ required rank (lower number = higher authority)
    if (agentRank > requiredRank) {
      // Insufficient authority — create escalation
      const escalationTarget = getEscalationTarget(agentInfo.authorityLevel);
      const escalation: EscalationRequest = {
        fromAgentId: request.agentId,
        toLevel: escalationTarget,
        action: request.action,
        reason: `Agent authority ${agentInfo.authorityLevel} insufficient for action requiring ${requiredLevel}`,
      };

      const auditId = await this.logGovernanceDecision({
        agentId: request.agentId,
        agentName: agentInfo.agentName,
        action: request.action,
        target: request.target,
        outcome: 'blocked',
        governanceType: 'escalation',
        details: {
          reason: `Authority level ${agentInfo.authorityLevel} insufficient; requires ${requiredLevel}`,
          escalation,
        },
      });

      return {
        authorized: false,
        reason: `Authority level ${agentInfo.authorityLevel} insufficient; requires ${requiredLevel}`,
        escalation,
        auditId,
      };
    }

    // Check if action is in allowed list (if allowedActions is non-empty, it acts as a whitelist)
    if (
      agentInfo.allowedActions.length > 0 &&
      !agentInfo.allowedActions.includes(request.action)
    ) {
      const auditId = await this.logGovernanceDecision({
        agentId: request.agentId,
        agentName: agentInfo.agentName,
        action: request.action,
        target: request.target,
        outcome: 'blocked',
        governanceType: 'authorization',
        details: { reason: 'Action not in agent allowed actions list' },
      });

      return {
        authorized: false,
        reason: 'Action not in agent allowed actions list',
        auditId,
      };
    }

    // Authorized
    const auditId = await this.logGovernanceDecision({
      agentId: request.agentId,
      agentName: agentInfo.agentName,
      action: request.action,
      target: request.target,
      outcome: 'success',
      governanceType: 'authorization',
      details: {
        agentLevel: agentInfo.authorityLevel,
        requiredLevel,
      },
    });

    return {
      authorized: true,
      reason: `Agent authority ${agentInfo.authorityLevel} meets requirement ${requiredLevel}`,
      auditId,
    };
  }

  /**
   * Check the authority level of an agent for a given action.
   */
  async checkAuthorityLevel(agentId: string, _action: string): Promise<AuthorityLevel> {
    const agentInfo = await this.config.getAgentAuthority(agentId);
    if (!agentInfo) {
      // Unknown agents get the lowest authority
      return 'L4';
    }
    return agentInfo.authorityLevel;
  }

  // -------------------------------------------------------------------------
  // Execution Tokens (Req 3.5, 3.6)
  // -------------------------------------------------------------------------

  /**
   * Request an execution token for a controlled action.
   *
   * Req 3.5: Requires valid tokens from both the authorizing agent and Otzar.
   * Req 3.6: Block action without valid tokens and log violation.
   *
   * Flow:
   * 1. Verify the requesting agent has sufficient authority
   * 2. Check Otzar budget approval (budget check with 0 tokens as a gate)
   * 3. Issue a time-limited token
   * 4. Log the token grant to XO Audit
   */
  async requestToken(request: TokenRequest): Promise<ExecutionToken> {
    const agentInfo = await this.config.getAgentAuthority(request.agentId);

    if (!agentInfo) {
      await this.logGovernanceDecision({
        agentId: request.agentId,
        agentName: 'unknown',
        action: request.action,
        target: request.target,
        outcome: 'blocked',
        governanceType: 'token_grant',
        details: { reason: 'Agent not found — token denied' },
      });
      throw new Error(`Token request denied: agent ${request.agentId} not found`);
    }

    // Verify authority level
    const requiredLevel = await this.config.getActionRequirement(request.action);
    const agentRank = AUTHORITY_RANK[agentInfo.authorityLevel];
    const requiredRank = AUTHORITY_RANK[requiredLevel];

    if (agentRank > requiredRank) {
      await this.logGovernanceDecision({
        agentId: request.agentId,
        agentName: agentInfo.agentName,
        action: request.action,
        target: request.target,
        outcome: 'blocked',
        governanceType: 'token_grant',
        details: {
          reason: `Authority ${agentInfo.authorityLevel} insufficient for ${requiredLevel}`,
        },
      });
      throw new Error(
        `Token request denied: authority ${agentInfo.authorityLevel} insufficient for action requiring ${requiredLevel}`,
      );
    }

    // Check Otzar budget approval (acts as a gate — 0 tokens just validates budget is not exhausted)
    const budgetResult = await this.config.otzarService.checkBudget(request.agentId, 0);
    if (!budgetResult.allowed) {
      await this.logGovernanceDecision({
        agentId: request.agentId,
        agentName: agentInfo.agentName,
        action: request.action,
        target: request.target,
        outcome: 'blocked',
        governanceType: 'token_grant',
        details: { reason: 'Otzar budget check failed', budgetResult },
      });
      throw new Error('Token request denied: Otzar budget check failed');
    }

    // Issue the token
    const now = new Date();
    const token: ExecutionToken = {
      tokenId: randomUUID(),
      agentId: request.agentId,
      action: request.action,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + this.tokenExpiryMs),
      issuedBy: agentInfo.agentName,
    };

    // Store the token
    this.issuedTokens.set(token.tokenId, token);

    // Log the grant
    await this.logGovernanceDecision({
      agentId: request.agentId,
      agentName: agentInfo.agentName,
      action: request.action,
      target: request.target,
      outcome: 'success',
      governanceType: 'token_grant',
      details: {
        tokenId: token.tokenId,
        expiresAt: token.expiresAt.toISOString(),
      },
    });

    return token;
  }

  /**
   * Validate an execution token.
   *
   * Checks:
   * 1. Token exists in the issued tokens store
   * 2. Token has not expired
   * 3. Token agent matches
   */
  async validateToken(token: ExecutionToken): Promise<boolean> {
    const stored = this.issuedTokens.get(token.tokenId);

    if (!stored) {
      return false;
    }

    // Check expiry
    const now = new Date();
    if (now > stored.expiresAt) {
      // Clean up expired token
      this.issuedTokens.delete(token.tokenId);
      return false;
    }

    // Check agent match
    if (stored.agentId !== token.agentId) {
      return false;
    }

    // Check action match
    if (stored.action !== token.action) {
      return false;
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // Completion Contracts (Req 3.3, 3.4)
  // -------------------------------------------------------------------------

  /**
   * Validate workflow outputs against the workflow's Completion Contract.
   *
   * Req 3.3: Validate outputs against JSON schema before allowing state transition.
   * Req 3.4: Reject completion, log specific violations, return workflow to prior state.
   *
   * Uses Ajv for JSON Schema validation.
   */
  async validateCompletion(
    workflowId: string,
    outputs: Record<string, unknown>,
  ): Promise<CompletionValidationResult> {
    const contract = await this.config.getCompletionContract(workflowId);

    if (!contract) {
      // No contract found — log and reject
      await this.logGovernanceDecision({
        agentId: 'system',
        agentName: 'Mishmar',
        action: 'completion_validation',
        target: workflowId,
        outcome: 'failure',
        governanceType: 'completion_validation',
        details: { reason: 'No completion contract found for workflow' },
      });

      return {
        valid: false,
        violations: [
          {
            path: '/',
            message: `No completion contract found for workflow ${workflowId}`,
            expected: 'CompletionContract',
            actual: 'none',
          },
        ],
        contractId: '',
      };
    }

    // Validate outputs against the contract's JSON schema using Ajv
    const violations = this.validateAgainstSchema(outputs, contract.outputSchema);

    const valid = violations.length === 0;

    // Log the validation result
    await this.logGovernanceDecision({
      agentId: 'system',
      agentName: 'Mishmar',
      action: 'completion_validation',
      target: workflowId,
      outcome: valid ? 'success' : 'failure',
      governanceType: 'completion_validation',
      details: {
        contractId: contract.id,
        contractVersion: contract.version,
        violationCount: violations.length,
        violations: valid ? undefined : violations,
      },
    });

    return {
      valid,
      violations,
      contractId: contract.id,
    };
  }

  // -------------------------------------------------------------------------
  // Role Separation (Req 3.2)
  // -------------------------------------------------------------------------

  /**
   * Validate that no agent both decides and executes the same controlled
   * action within a single workflow.
   *
   * Req 3.2: Enforce separation of duties — no agent may both decide and
   * execute the same controlled action.
   */
  async validateSeparation(workflow: WorkflowContext): Promise<SeparationResult> {
    const violations: SeparationViolation[] = [];

    // Group steps by action
    const actionSteps = new Map<string, WorkflowContext['steps']>();
    for (const step of workflow.steps) {
      const existing = actionSteps.get(step.action) ?? [];
      existing.push(step);
      actionSteps.set(step.action, existing);
    }

    // For each action, check if any agent has both 'decider' and 'executor' roles
    for (const [action, steps] of actionSteps) {
      const agentRoles = new Map<string, Set<string>>();

      for (const step of steps) {
        const roles = agentRoles.get(step.agentId) ?? new Set();
        roles.add(step.role);
        agentRoles.set(step.agentId, roles);
      }

      for (const [agentId, roles] of agentRoles) {
        if (roles.has('decider') && roles.has('executor')) {
          violations.push({
            agentId,
            action,
            conflictingRoles: ['decider', 'executor'],
          });
        }
      }
    }

    const valid = violations.length === 0;

    // Log the separation check
    await this.logGovernanceDecision({
      agentId: 'system',
      agentName: 'Mishmar',
      action: 'separation_validation',
      target: workflow.workflowId,
      outcome: valid ? 'success' : 'blocked',
      governanceType: 'authorization',
      details: {
        workflowId: workflow.workflowId,
        stepCount: workflow.steps.length,
        violationCount: violations.length,
        violations: valid ? undefined : violations,
      },
    });

    return { valid, violations };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Validate data against a JSON Schema using Ajv.
   * Returns an array of SchemaViolation objects.
   */
  private validateAgainstSchema(
    data: Record<string, unknown>,
    schema: JSONSchema,
  ): SchemaViolation[] {
    const validate = this.ajv.compile(schema);
    const valid = validate(data);

    if (valid) {
      return [];
    }

    return (validate.errors ?? []).map((error: unknown) =>
      this.ajvErrorToViolation(error as Record<string, unknown>),
    );
  }

  /**
   * Convert an Ajv error to a SchemaViolation.
   */
  private ajvErrorToViolation(error: Record<string, unknown>): SchemaViolation {
    // Ajv v6 uses dataPath, v8 uses instancePath
    const path = (error.instancePath as string)
      || (error.dataPath as string)
      || '/';
    const message = (error.message as string) ?? 'Validation failed';

    // Build expected string from schema keyword and params
    let expected = (error.keyword as string) ?? 'unknown';
    const params = error.params as Record<string, unknown> | undefined;
    if (params) {
      if ('type' in params) {
        expected = `type: ${params.type}`;
      } else if ('missingProperty' in params) {
        expected = `required property: ${params.missingProperty}`;
      } else if ('additionalProperty' in params) {
        expected = `no additional property: ${params.additionalProperty}`;
      } else if ('allowedValues' in params) {
        expected = `one of: ${(params.allowedValues as string[]).join(', ')}`;
      }
    }

    return {
      path,
      message,
      expected,
      actual: error.data !== undefined ? String(error.data) : undefined,
    };
  }

  /**
   * Log a governance decision to XO Audit.
   */
  private async logGovernanceDecision(params: {
    agentId: string;
    agentName: string;
    action: string;
    target: string;
    outcome: 'success' | 'failure' | 'blocked';
    governanceType: GovernanceAuditEntry['governanceType'];
    details: Record<string, unknown>;
  }): Promise<string> {
    const entry: GovernanceAuditEntry = {
      tenantId: this.config.tenantId,
      actingAgentId: params.agentId,
      actingAgentName: params.agentName,
      actionType: params.action,
      target: params.target,
      authorizationChain: [],
      executionTokens: [],
      outcome: params.outcome,
      details: params.details,
      governanceType: params.governanceType,
    };

    try {
      return await this.config.auditService.recordGovernanceDecision(entry);
    } catch {
      // Audit logging failure should not block governance decisions.
      // In production, this would trigger an alert.
      return 'audit-unavailable';
    }
  }
}
