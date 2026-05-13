/**
 * Unit tests for ZionX App Development Studio — Governance and Audit Integration
 *
 * Validates: Requirements 42n.43, 42n.44, 19.1
 *
 * Tests King approval requirement before store submission, budget allocation
 * approval, authority escalation, and XO_Audit logging with full traceability.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DefaultStudioGovernanceService,
  type StudioGovernanceService,
  type MishmarGateway,
  type AuditLogger,
  type GovernanceDecision,
  type AuditEntry,
  type StudioAction,
} from '../governance.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockMishmarGateway(overrides?: Partial<MishmarGateway>): MishmarGateway {
  return {
    checkAuthorization: overrides?.checkAuthorization ?? vi.fn(async () => ({
      allowed: true,
      reason: 'Action authorized',
    })),
    requestApproval: overrides?.requestApproval ?? vi.fn(async () => ({
      approved: true,
      approvalId: 'approval-123',
    })),
  };
}

function createMockAuditLogger(overrides?: Partial<AuditLogger>): AuditLogger {
  const entries: AuditEntry[] = [];
  return {
    log: overrides?.log ?? vi.fn(async (entry: AuditEntry) => {
      entries.push(entry);
      return `audit-${entries.length}`;
    }),
    getTrail: overrides?.getTrail ?? vi.fn(async () => entries),
  };
}

function createService(options?: {
  mishmarGateway?: MishmarGateway;
  auditLogger?: AuditLogger;
  agentId?: string;
  budgetApprovalThreshold?: number;
}): StudioGovernanceService {
  return new DefaultStudioGovernanceService({
    mishmarGateway: options?.mishmarGateway ?? createMockMishmarGateway(),
    auditLogger: options?.auditLogger ?? createMockAuditLogger(),
    agentId: options?.agentId ?? 'studio-agent',
    budgetApprovalThreshold: options?.budgetApprovalThreshold,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultStudioGovernanceService', () => {
  describe('requestSubmissionApproval — King approval requirement', () => {
    it('blocks store submission without King approval', async () => {
      const gateway = createMockMishmarGateway({
        requestApproval: vi.fn(async () => ({
          approved: false,
        })),
      });

      const service = createService({ mishmarGateway: gateway });
      const result = await service.requestSubmissionApproval('session-1');

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('denied');
    });

    it('allows store submission with King approval (L1 authority)', async () => {
      const gateway = createMockMishmarGateway({
        requestApproval: vi.fn(async () => ({
          approved: true,
          approvalId: 'king-approval-001',
        })),
      });

      const service = createService({ mishmarGateway: gateway });
      const result = await service.requestSubmissionApproval('session-1');

      expect(result.approved).toBe(true);
      expect(result.reason).toContain('granted');
    });

    it('requests L1 authority for store submission', async () => {
      const gateway = createMockMishmarGateway();
      const service = createService({ mishmarGateway: gateway });

      await service.requestSubmissionApproval('session-1');

      expect(gateway.requestApproval).toHaveBeenCalledWith(
        'session-1',
        'app.submit',
        expect.objectContaining({ requiredAuthority: 'L1', type: 'store-submission' }),
      );
    });

    it('logs the submission approval request to audit trail', async () => {
      const auditLogger = createMockAuditLogger();
      const service = createService({ auditLogger });

      await service.requestSubmissionApproval('session-1');

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          action: 'app.submit',
          outcome: 'success',
          details: expect.objectContaining({ type: 'submission-approval' }),
        }),
      );
    });
  });

  describe('requestBudgetApproval — budget allocation approval', () => {
    it('requires approval for budget above threshold', async () => {
      const gateway = createMockMishmarGateway({
        requestApproval: vi.fn(async () => ({
          approved: false,
        })),
      });

      const service = createService({
        mishmarGateway: gateway,
        budgetApprovalThreshold: 100,
      });

      const result = await service.requestBudgetApproval('session-1', 500, 'paid acquisition');

      expect(result.approved).toBe(false);
      expect(gateway.requestApproval).toHaveBeenCalled();
    });

    it('auto-approves budget within threshold', async () => {
      const gateway = createMockMishmarGateway();
      const service = createService({
        mishmarGateway: gateway,
        budgetApprovalThreshold: 100,
      });

      const result = await service.requestBudgetApproval('session-1', 50, 'small campaign');

      expect(result.approved).toBe(true);
      expect(result.reason).toContain('auto-approval');
      expect(gateway.requestApproval).not.toHaveBeenCalled();
    });

    it('logs budget approval to audit trail', async () => {
      const auditLogger = createMockAuditLogger();
      const service = createService({
        auditLogger,
        budgetApprovalThreshold: 100,
      });

      await service.requestBudgetApproval('session-1', 500, 'paid acquisition');

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          action: 'app.budget',
          details: expect.objectContaining({ amount: 500, purpose: 'paid acquisition' }),
        }),
      );
    });

    it('includes approval ID when budget is approved', async () => {
      const gateway = createMockMishmarGateway({
        requestApproval: vi.fn(async () => ({
          approved: true,
          approvalId: 'budget-approval-001',
        })),
      });

      const auditLogger = createMockAuditLogger();
      const service = createService({
        mishmarGateway: gateway,
        auditLogger,
        budgetApprovalThreshold: 0,
      });

      await service.requestBudgetApproval('session-1', 200, 'ads');

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ approvalId: 'budget-approval-001' }),
        }),
      );
    });
  });

  describe('authorize — authority escalation for cross-pillar requests', () => {
    it('checks authorization via Mishmar gateway', async () => {
      const gateway = createMockMishmarGateway({
        checkAuthorization: vi.fn(async () => ({
          allowed: true,
          reason: 'Cross-pillar access granted',
          requiredApproval: 'L2' as const,
        })),
      });

      const service = createService({ mishmarGateway: gateway });
      const decision = await service.authorize('session-1', 'app.cross-pillar', { targetPillar: 'media' });

      expect(decision.allowed).toBe(true);
      expect(decision.requiredApproval).toBe('L2');
      expect(gateway.checkAuthorization).toHaveBeenCalledWith(
        'app.cross-pillar',
        expect.objectContaining({ sessionId: 'session-1', targetPillar: 'media' }),
      );
    });

    it('blocks unauthorized cross-pillar requests', async () => {
      const gateway = createMockMishmarGateway({
        checkAuthorization: vi.fn(async () => ({
          allowed: false,
          reason: 'Insufficient authority for cross-pillar access',
          requiredApproval: 'L3' as const,
        })),
      });

      const service = createService({ mishmarGateway: gateway });
      const decision = await service.authorize('session-1', 'app.cross-pillar', { targetPillar: 'finance' });

      expect(decision.allowed).toBe(false);
      expect(decision.requiredApproval).toBe('L3');
    });

    it('logs blocked authorization to audit trail', async () => {
      const gateway = createMockMishmarGateway({
        checkAuthorization: vi.fn(async () => ({
          allowed: false,
          reason: 'Blocked',
        })),
      });
      const auditLogger = createMockAuditLogger();

      const service = createService({ mishmarGateway: gateway, auditLogger });
      await service.authorize('session-1', 'app.cross-pillar');

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          action: 'app.cross-pillar',
          outcome: 'blocked',
        }),
      );
    });
  });

  describe('logAction and getAuditTrail — XO_Audit logging', () => {
    it('produces XO_Audit records with correct metadata', async () => {
      const auditLogger = createMockAuditLogger();
      const service = createService({ auditLogger, agentId: 'studio-agent-1' });

      const auditId = await service.logAction(
        'session-1',
        'app.create',
        { appName: 'FitTracker', template: 'fitness' },
        'success',
      );

      expect(auditId).toBeDefined();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          action: 'app.create',
          agentId: 'studio-agent-1',
          details: { appName: 'FitTracker', template: 'fitness' },
          outcome: 'success',
        }),
      );
    });

    it('logs all studio action types correctly', async () => {
      const auditLogger = createMockAuditLogger();
      const service = createService({ auditLogger });

      const actions: StudioAction[] = [
        'app.create', 'app.edit', 'app.build', 'app.submit', 'app.budget', 'app.cross-pillar',
      ];

      for (const action of actions) {
        await service.logAction('session-1', action, { step: action }, 'success');
      }

      expect(auditLogger.log).toHaveBeenCalledTimes(actions.length);
    });

    it('provides full traceability from idea to live app', async () => {
      const entries: AuditEntry[] = [];
      const auditLogger: AuditLogger = {
        log: vi.fn(async (entry: AuditEntry) => {
          entries.push(entry);
          return `audit-${entries.length}`;
        }),
        getTrail: vi.fn(async (sessionId: string) =>
          entries.filter((e) => e.sessionId === sessionId),
        ),
      };

      const service = createService({ auditLogger });

      // Simulate full lifecycle: idea → edit → build → submit
      await service.logAction('session-1', 'app.create', { phase: 'idea', appName: 'MyApp' }, 'success');
      await service.logAction('session-1', 'app.edit', { phase: 'development', files: 5 }, 'success');
      await service.logAction('session-1', 'app.build', { phase: 'build', platform: 'ios' }, 'success');
      await service.logAction('session-1', 'app.submit', { phase: 'submission', store: 'app-store' }, 'success');

      const trail = await service.getAuditTrail('session-1');

      expect(trail).toHaveLength(4);
      expect(trail[0].action).toBe('app.create');
      expect(trail[0].details).toEqual({ phase: 'idea', appName: 'MyApp' });
      expect(trail[1].action).toBe('app.edit');
      expect(trail[2].action).toBe('app.build');
      expect(trail[3].action).toBe('app.submit');
      expect(trail[3].details).toEqual({ phase: 'submission', store: 'app-store' });

      // All entries have required metadata
      for (const entry of trail) {
        expect(entry.sessionId).toBe('session-1');
        expect(entry.agentId).toBeDefined();
        expect(entry.timestamp).toBeGreaterThan(0);
        expect(entry.outcome).toBe('success');
      }
    });

    it('records timestamp for each audit entry', async () => {
      const auditLogger = createMockAuditLogger();
      const service = createService({ auditLogger });

      await service.logAction('session-1', 'app.create', {}, 'success');

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        }),
      );
    });

    it('records failure outcomes correctly', async () => {
      const auditLogger = createMockAuditLogger();
      const service = createService({ auditLogger });

      await service.logAction('session-1', 'app.build', { error: 'compile failed' }, 'failure');

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'app.build',
          outcome: 'failure',
          details: { error: 'compile failed' },
        }),
      );
    });
  });
});
