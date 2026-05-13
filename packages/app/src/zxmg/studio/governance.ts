/**
 * ZXMG Video Development Studio — Governance & Audit Service
 *
 * Provides publish approval workflows, action logging, and audit trail
 * retrieval for video pipeline governance. All significant actions are
 * logged with timestamps and details for compliance and review.
 *
 * Requirements: 44g.33, 44g.34, 44g.35, 44g.36
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalResult {
  approved: boolean;
}

export interface AuditEntry {
  action: string;
  timestamp: number;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface ApprovalPolicy {
  evaluate(channelId: string, videoId: string): Promise<boolean>;
}

export interface AuditStore {
  log(channelId: string, entry: AuditEntry): Promise<string>;
  getTrail(channelId: string): Promise<AuditEntry[]>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface VideoGovernanceService {
  requestPublishApproval(channelId: string, videoId: string): Promise<ApprovalResult>;
  logAction(channelId: string, action: string, details: Record<string, unknown>): Promise<string>;
  getAuditTrail(channelId: string): Promise<AuditEntry[]>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

/**
 * Default implementation of VideoGovernanceService.
 *
 * Uses dependency injection for approval policy evaluation and audit
 * storage. All actions (including approval requests) are automatically
 * logged to the audit trail.
 */
export class DefaultVideoGovernanceService implements VideoGovernanceService {
  constructor(
    private readonly approvalPolicy: ApprovalPolicy,
    private readonly auditStore: AuditStore,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Requests publish approval for a video. Evaluates the approval policy
   * and logs the result to the audit trail.
   */
  async requestPublishApproval(channelId: string, videoId: string): Promise<ApprovalResult> {
    const approved = await this.approvalPolicy.evaluate(channelId, videoId);

    await this.auditStore.log(channelId, {
      action: 'publish_approval_requested',
      timestamp: Date.now(),
      details: { videoId, approved },
    });

    return { approved };
  }

  /**
   * Logs an action to the audit trail and returns the generated log ID.
   */
  async logAction(
    channelId: string,
    action: string,
    details: Record<string, unknown>,
  ): Promise<string> {
    const entry: AuditEntry = {
      action,
      timestamp: Date.now(),
      details,
    };

    return this.auditStore.log(channelId, entry);
  }

  /**
   * Retrieves the full audit trail for a channel.
   */
  async getAuditTrail(channelId: string): Promise<AuditEntry[]> {
    return this.auditStore.getTrail(channelId);
  }
}
