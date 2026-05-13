/**
 * ZionX App Development Studio — Governance and Audit Integration
 *
 * Implements Mishmar approval workflows including King approval (L1 authority)
 * before store submission, budget allocation approval for paid acquisition,
 * authority escalation for cross-pillar resource requests, and XO_Audit logging
 * for all studio actions with full traceability (idea → live app).
 *
 * Requirements: 42n.43, 42n.44
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StudioAction =
  | 'app.create'
  | 'app.edit'
  | 'app.build'
  | 'app.submit'
  | 'app.budget'
  | 'app.cross-pillar';

export interface GovernanceDecision {
  allowed: boolean;
  reason: string;
  requiredApproval?: 'L1' | 'L2' | 'L3' | 'L4';
}

export interface AuditEntry {
  sessionId: string;
  action: StudioAction;
  timestamp: number;
  agentId: string;
  details: Record<string, unknown>;
  outcome: 'success' | 'failure' | 'blocked';
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (for injection / mocking)
// ---------------------------------------------------------------------------

export interface MishmarGateway {
  checkAuthorization(
    action: StudioAction,
    context: Record<string, unknown>,
  ): Promise<GovernanceDecision>;
  requestApproval(
    sessionId: string,
    action: StudioAction,
    details: Record<string, unknown>,
  ): Promise<{ approved: boolean; approvalId?: string }>;
}

export interface AuditLogger {
  log(entry: AuditEntry): Promise<string>;
  getTrail(sessionId: string): Promise<AuditEntry[]>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface StudioGovernanceService {
  authorize(
    sessionId: string,
    action: StudioAction,
    context?: Record<string, unknown>,
  ): Promise<GovernanceDecision>;
  requestSubmissionApproval(
    sessionId: string,
  ): Promise<{ approved: boolean; reason?: string }>;
  requestBudgetApproval(
    sessionId: string,
    amount: number,
    purpose: string,
  ): Promise<{ approved: boolean; reason?: string }>;
  logAction(
    sessionId: string,
    action: StudioAction,
    details: Record<string, unknown>,
    outcome: 'success' | 'failure' | 'blocked',
  ): Promise<string>;
  getAuditTrail(sessionId: string): Promise<AuditEntry[]>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GovernanceConfig {
  mishmarGateway: MishmarGateway;
  auditLogger: AuditLogger;
  agentId: string;
  budgetApprovalThreshold?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BUDGET_APPROVAL_THRESHOLD = 0;

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultStudioGovernanceService implements StudioGovernanceService {
  private readonly mishmarGateway: MishmarGateway;
  private readonly auditLogger: AuditLogger;
  private readonly agentId: string;
  private readonly budgetApprovalThreshold: number;

  constructor(config: GovernanceConfig) {
    this.mishmarGateway = config.mishmarGateway;
    this.auditLogger = config.auditLogger;
    this.agentId = config.agentId;
    this.budgetApprovalThreshold = config.budgetApprovalThreshold ?? DEFAULT_BUDGET_APPROVAL_THRESHOLD;
  }

  async authorize(
    sessionId: string,
    action: StudioAction,
    context?: Record<string, unknown>,
  ): Promise<GovernanceDecision> {
    const decision = await this.mishmarGateway.checkAuthorization(
      action,
      { sessionId, ...context },
    );

    // Log the authorization check
    await this.auditLogger.log({
      sessionId,
      action,
      timestamp: Date.now(),
      agentId: this.agentId,
      details: { context: context ?? {}, decision },
      outcome: decision.allowed ? 'success' : 'blocked',
    });

    return decision;
  }

  async requestSubmissionApproval(
    sessionId: string,
  ): Promise<{ approved: boolean; reason?: string }> {
    // Store submission requires King approval (L1 authority)
    const result = await this.mishmarGateway.requestApproval(
      sessionId,
      'app.submit',
      { sessionId, requiredAuthority: 'L1', type: 'store-submission' },
    );

    // Log the approval request
    await this.auditLogger.log({
      sessionId,
      action: 'app.submit',
      timestamp: Date.now(),
      agentId: this.agentId,
      details: {
        type: 'submission-approval',
        approved: result.approved,
        approvalId: result.approvalId,
      },
      outcome: result.approved ? 'success' : 'blocked',
    });

    return {
      approved: result.approved,
      reason: result.approved
        ? 'King approval granted for store submission'
        : 'King approval denied for store submission',
    };
  }

  async requestBudgetApproval(
    sessionId: string,
    amount: number,
    purpose: string,
  ): Promise<{ approved: boolean; reason?: string }> {
    // Budget allocation requires approval above threshold
    if (amount <= this.budgetApprovalThreshold) {
      await this.auditLogger.log({
        sessionId,
        action: 'app.budget',
        timestamp: Date.now(),
        agentId: this.agentId,
        details: { amount, purpose, autoApproved: true },
        outcome: 'success',
      });

      return { approved: true, reason: 'Amount within auto-approval threshold' };
    }

    const result = await this.mishmarGateway.requestApproval(
      sessionId,
      'app.budget',
      { sessionId, amount, purpose, type: 'budget-allocation' },
    );

    await this.auditLogger.log({
      sessionId,
      action: 'app.budget',
      timestamp: Date.now(),
      agentId: this.agentId,
      details: {
        type: 'budget-approval',
        amount,
        purpose,
        approved: result.approved,
        approvalId: result.approvalId,
      },
      outcome: result.approved ? 'success' : 'blocked',
    });

    return {
      approved: result.approved,
      reason: result.approved
        ? `Budget of ${amount} approved for ${purpose}`
        : `Budget of ${amount} denied for ${purpose}`,
    };
  }

  async logAction(
    sessionId: string,
    action: StudioAction,
    details: Record<string, unknown>,
    outcome: 'success' | 'failure' | 'blocked',
  ): Promise<string> {
    return this.auditLogger.log({
      sessionId,
      action,
      timestamp: Date.now(),
      agentId: this.agentId,
      details,
      outcome,
    });
  }

  async getAuditTrail(sessionId: string): Promise<AuditEntry[]> {
    return this.auditLogger.getTrail(sessionId);
  }
}
