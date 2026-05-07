/**
 * Unit tests for Eretz Operational Authority Enforcement
 *
 * Validates: Requirements 29f.20, 29f.21, 29f.22, 19.1
 *
 * Tests SEMP compliance checking, output rejection with remediation,
 * resource reallocation with Otzar/Mishmar constraints, and audit logging.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorityEnforcementImpl } from '../authority-enforcement.js';
import type { AuthorityEnforcementConfig } from '../authority-enforcement.js';
import type { SubsidiaryResult } from '../agent-program.js';
import type { EventBusService, OtzarService, MishmarService } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-1'),
    publishBatch: vi.fn().mockResolvedValue(['event-id-1']),
    subscribe: vi.fn().mockResolvedValue('sub-id-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockOtzarService(): OtzarService {
  return {
    routeTask: vi.fn().mockResolvedValue({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      estimatedCost: 0.01,
      rationale: 'default',
    }),
    checkBudget: vi.fn().mockResolvedValue({
      allowed: true,
      remainingDaily: 50,
      remainingMonthly: 500,
    }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getCostReport: vi.fn().mockResolvedValue({
      totalCostUsd: 10,
      byAgent: {},
      byPillar: {},
      byModel: {},
      period: { start: new Date(), end: new Date() },
    }),
    getDailyOptimizationReport: vi.fn().mockResolvedValue({
      date: new Date(),
      totalSpend: 10,
      wastePatterns: [],
      savingsOpportunities: [],
      estimatedSavings: 0,
    }),
    checkCache: vi.fn().mockResolvedValue(null),
    storeCache: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockMishmarService(): MishmarService {
  return {
    authorize: vi.fn().mockResolvedValue({
      authorized: true,
      reason: 'Authority level sufficient',
      auditId: 'audit-001',
    }),
    checkAuthorityLevel: vi.fn().mockResolvedValue('L3'),
    requestToken: vi.fn().mockResolvedValue({
      tokenId: 'token-001',
      agentId: 'eretz',
      action: 'reallocate_resources',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      issuedBy: 'mishmar',
    }),
    validateToken: vi.fn().mockResolvedValue(true),
    validateCompletion: vi.fn().mockResolvedValue({
      valid: true,
      violations: [],
      contractId: 'contract-001',
    }),
    validateSeparation: vi.fn().mockResolvedValue({
      valid: true,
      violations: [],
    }),
  };
}

function createConfig(overrides?: Partial<AuthorityEnforcementConfig>): AuthorityEnforcementConfig {
  return {
    eventBus: createMockEventBus(),
    otzarService: createMockOtzarService(),
    mishmarService: createMockMishmarService(),
    ...overrides,
  };
}

function createCompliantResult(overrides?: Partial<SubsidiaryResult>): SubsidiaryResult {
  return {
    id: 'result-001',
    directiveId: 'dir-001',
    subsidiary: 'zionx',
    action: 'launch_app',
    outcome: { appId: 'app-123', status: 'launched', revenue: 500 },
    metrics: { mrrImpact: 200, downloads: 1500, retention: 0.45 },
    completedAt: new Date(),
    ...overrides,
  };
}

function createNonCompliantResult(overrides?: Partial<SubsidiaryResult>): SubsidiaryResult {
  return {
    id: 'result-002',
    directiveId: 'dir-002',
    subsidiary: 'zionx',
    action: 'launch_app',
    outcome: {},
    metrics: {},
    completedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthorityEnforcementImpl', () => {
  let enforcement: AuthorityEnforcementImpl;
  let config: AuthorityEnforcementConfig;

  beforeEach(() => {
    config = createConfig();
    enforcement = new AuthorityEnforcementImpl(config);
  });

  // -------------------------------------------------------------------------
  // SEMP Compliance Checking (Requirement 29f.20)
  // -------------------------------------------------------------------------

  describe('checkSEMPCompliance', () => {
    it('should pass compliant output with no violations', async () => {
      const result = createCompliantResult();
      const check = await enforcement.checkSEMPCompliance(result);

      expect(check.compliant).toBe(true);
      expect(check.violations).toHaveLength(0);
      expect(check.subsidiary).toBe('zionx');
      expect(check.outputId).toBe('result-001');
      expect(check.checkedAt).toBeInstanceOf(Date);
    });

    it('should catch quality violations when outcome is empty', async () => {
      const result = createNonCompliantResult({ outcome: {} });
      const check = await enforcement.checkSEMPCompliance(result);

      expect(check.compliant).toBe(false);
      const qualityViolations = check.violations.filter(
        (v) => v.category === 'quality_standards',
      );
      expect(qualityViolations.length).toBeGreaterThan(0);
      expect(qualityViolations[0].description).toContain('outcome');
    });

    it('should catch quality violations when metrics are missing', async () => {
      const result = createCompliantResult({ metrics: {} });
      const check = await enforcement.checkSEMPCompliance(result);

      expect(check.compliant).toBe(false);
      const qualityViolations = check.violations.filter(
        (v) => v.category === 'quality_standards',
      );
      expect(qualityViolations.some((v) => v.description.includes('metrics'))).toBe(true);
    });

    it('should catch process adherence violations when directiveId is missing', async () => {
      const result = createCompliantResult({ directiveId: '' });
      const check = await enforcement.checkSEMPCompliance(result);

      expect(check.compliant).toBe(false);
      const processViolations = check.violations.filter(
        (v) => v.category === 'process_adherence',
      );
      expect(processViolations.length).toBeGreaterThan(0);
    });

    it('should catch reporting cadence violations when completedAt is missing', async () => {
      const result = createCompliantResult({ completedAt: undefined as any });
      const check = await enforcement.checkSEMPCompliance(result);

      expect(check.compliant).toBe(false);
      const cadenceViolations = check.violations.filter(
        (v) => v.category === 'reporting_cadence',
      );
      expect(cadenceViolations.length).toBeGreaterThan(0);
    });

    it('should catch governance violations when subsidiary is missing', async () => {
      const result = createCompliantResult({ subsidiary: '' });
      const check = await enforcement.checkSEMPCompliance(result);

      expect(check.compliant).toBe(false);
      const govViolations = check.violations.filter((v) => v.category === 'governance');
      expect(govViolations.length).toBeGreaterThan(0);
    });

    it('should include severity levels on violations', async () => {
      const result = createNonCompliantResult();
      const check = await enforcement.checkSEMPCompliance(result);

      for (const violation of check.violations) {
        expect(['critical', 'major', 'minor']).toContain(violation.severity);
      }
    });

    it('should log compliance check to XO Audit', async () => {
      const result = createCompliantResult();
      await enforcement.checkSEMPCompliance(result);

      expect(config.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'eretz',
          type: 'authority.semp_compliance_check',
          detail: expect.objectContaining({
            exerciseType: 'semp_compliance_check',
            subsidiary: 'zionx',
            action: 'compliance_check',
            outcome: 'compliant',
          }),
          metadata: expect.objectContaining({
            tenantId: 'house-of-zion',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Output Rejection (Requirement 29f.21)
  // -------------------------------------------------------------------------

  describe('rejectOutput', () => {
    it('should reject output with specific remediation requirements', async () => {
      const result = createNonCompliantResult();
      const check = await enforcement.checkSEMPCompliance(result);
      const rejection = await enforcement.rejectOutput(result, check.violations);

      expect(rejection.outputId).toBe('result-002');
      expect(rejection.subsidiary).toBe('zionx');
      expect(rejection.rejectedAt).toBeInstanceOf(Date);
      expect(rejection.reason).toContain('violation');
      expect(rejection.remediationRequirements.length).toBeGreaterThan(0);
    });

    it('should include remediation requirements with deadlines and priorities', async () => {
      const result = createNonCompliantResult();
      const check = await enforcement.checkSEMPCompliance(result);
      const rejection = await enforcement.rejectOutput(result, check.violations);

      for (const req of rejection.remediationRequirements) {
        expect(req.id).toBeDefined();
        expect(req.description).toBeDefined();
        expect(req.description.length).toBeGreaterThan(0);
        expect(req.category).toBeDefined();
        expect(req.deadline).toBeDefined();
        expect(['critical', 'high', 'medium', 'low']).toContain(req.priority);
      }
    });

    it('should set critical deadline for critical violations', async () => {
      const result = createNonCompliantResult({ outcome: {} });
      const check = await enforcement.checkSEMPCompliance(result);
      const criticalViolations = check.violations.filter((v) => v.severity === 'critical');

      // Ensure we have a critical violation
      expect(criticalViolations.length).toBeGreaterThan(0);

      const rejection = await enforcement.rejectOutput(result, criticalViolations);
      const criticalRemediation = rejection.remediationRequirements.filter(
        (r) => r.priority === 'critical',
      );
      expect(criticalRemediation.length).toBeGreaterThan(0);
      expect(criticalRemediation[0].deadline).toBe('24h');
    });

    it('should include all violations in the rejection', async () => {
      const result = createNonCompliantResult();
      const check = await enforcement.checkSEMPCompliance(result);
      const rejection = await enforcement.rejectOutput(result, check.violations);

      expect(rejection.violations).toEqual(check.violations);
    });

    it('should log output rejection to XO Audit', async () => {
      const result = createNonCompliantResult();
      const check = await enforcement.checkSEMPCompliance(result);

      // Reset mock to isolate rejection event
      vi.mocked(config.eventBus.publish).mockClear();

      await enforcement.rejectOutput(result, check.violations);

      expect(config.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'eretz',
          type: 'authority.output_rejection',
          detail: expect.objectContaining({
            exerciseType: 'output_rejection',
            subsidiary: 'zionx',
            action: 'reject_output',
            outcome: 'rejected',
          }),
          metadata: expect.objectContaining({
            tenantId: 'house-of-zion',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Resource Reallocation (Requirement 29f.22)
  // -------------------------------------------------------------------------

  describe('reallocateResources', () => {
    it('should approve reallocation when budget and governance pass', async () => {
      const reallocation = await enforcement.reallocateResources({
        sourceSubsidiary: 'zxmg',
        targetSubsidiary: 'zionx',
        amount: 5000,
        reason: 'ZionX app launch requires additional resources',
      });

      expect(reallocation.status).toBe('approved');
      expect(reallocation.budgetCheckPassed).toBe(true);
      expect(reallocation.governanceCheckPassed).toBe(true);
      expect(reallocation.approvedBy).toBe('eretz');
      expect(reallocation.sourceSubsidiary).toBe('zxmg');
      expect(reallocation.targetSubsidiary).toBe('zionx');
      expect(reallocation.amount).toBe(5000);
      expect(reallocation.executedAt).toBeInstanceOf(Date);
    });

    it('should reject reallocation when Otzar budget check fails', async () => {
      const otzar = createMockOtzarService();
      vi.mocked(otzar.checkBudget).mockResolvedValue({
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 100,
        reason: 'Daily budget exceeded',
      });

      const customConfig = createConfig({ otzarService: otzar });
      const customEnforcement = new AuthorityEnforcementImpl(customConfig);

      const reallocation = await customEnforcement.reallocateResources({
        sourceSubsidiary: 'zxmg',
        targetSubsidiary: 'zionx',
        amount: 5000,
        reason: 'Resource shift needed',
      });

      expect(reallocation.status).toBe('rejected');
      expect(reallocation.budgetCheckPassed).toBe(false);
      expect(reallocation.executedAt).toBeUndefined();
    });

    it('should reject reallocation when Mishmar governance check fails', async () => {
      const mishmar = createMockMishmarService();
      vi.mocked(mishmar.authorize).mockResolvedValue({
        authorized: false,
        reason: 'Insufficient authority level for cross-pillar reallocation',
        auditId: 'audit-002',
      });

      const customConfig = createConfig({ mishmarService: mishmar });
      const customEnforcement = new AuthorityEnforcementImpl(customConfig);

      const reallocation = await customEnforcement.reallocateResources({
        sourceSubsidiary: 'zxmg',
        targetSubsidiary: 'zionx',
        amount: 5000,
        reason: 'Resource shift needed',
      });

      expect(reallocation.status).toBe('rejected');
      expect(reallocation.governanceCheckPassed).toBe(false);
      expect(reallocation.executedAt).toBeUndefined();
    });

    it('should call Otzar checkBudget with target subsidiary and amount', async () => {
      await enforcement.reallocateResources({
        sourceSubsidiary: 'zxmg',
        targetSubsidiary: 'zionx',
        amount: 3000,
        reason: 'Portfolio rebalancing',
      });

      expect(config.otzarService.checkBudget).toHaveBeenCalledWith('zionx', 3000);
    });

    it('should call Mishmar authorize with correct context', async () => {
      await enforcement.reallocateResources({
        sourceSubsidiary: 'zxmg',
        targetSubsidiary: 'zionx',
        amount: 3000,
        reason: 'Portfolio rebalancing',
      });

      expect(config.mishmarService.authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'eretz',
          action: 'reallocate_resources',
          target: 'zionx',
          authorityLevel: 'L3',
          context: expect.objectContaining({
            sourceSubsidiary: 'zxmg',
            targetSubsidiary: 'zionx',
            amount: 3000,
            reason: 'Portfolio rebalancing',
          }),
        }),
      );
    });

    it('should log resource reallocation to XO Audit', async () => {
      await enforcement.reallocateResources({
        sourceSubsidiary: 'zxmg',
        targetSubsidiary: 'zionx',
        amount: 5000,
        reason: 'ZionX needs more resources',
      });

      expect(config.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'eretz',
          type: 'authority.resource_reallocation',
          detail: expect.objectContaining({
            exerciseType: 'resource_reallocation',
            subsidiary: 'zionx',
            action: 'reallocate_resources',
            outcome: 'approved',
          }),
          metadata: expect.objectContaining({
            tenantId: 'house-of-zion',
          }),
        }),
      );
    });

    it('should include rejection reason in audit log when budget fails', async () => {
      const otzar = createMockOtzarService();
      vi.mocked(otzar.checkBudget).mockResolvedValue({
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 100,
        reason: 'Daily budget exceeded',
      });

      const customConfig = createConfig({ otzarService: otzar });
      const customEnforcement = new AuthorityEnforcementImpl(customConfig);

      await customEnforcement.reallocateResources({
        sourceSubsidiary: 'zxmg',
        targetSubsidiary: 'zionx',
        amount: 5000,
        reason: 'Resource shift',
      });

      expect(customConfig.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            outcome: 'rejected',
            reason: expect.stringContaining('Budget constraint'),
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Audit Logging (Requirement 19.1)
  // -------------------------------------------------------------------------

  describe('audit logging', () => {
    it('should log all authority exercises with correct event format', async () => {
      const result = createCompliantResult();
      await enforcement.checkSEMPCompliance(result);

      expect(config.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'eretz',
          type: expect.stringContaining('authority.'),
          detail: expect.objectContaining({
            exerciseType: expect.any(String),
            subsidiary: expect.any(String),
            action: expect.any(String),
            outcome: expect.any(String),
            reason: expect.any(String),
          }),
          metadata: expect.objectContaining({
            tenantId: 'house-of-zion',
            correlationId: expect.any(String),
            timestamp: expect.any(Date),
          }),
        }),
      );
    });

    it('should log non-compliant check with violation details', async () => {
      const result = createNonCompliantResult();
      await enforcement.checkSEMPCompliance(result);

      expect(config.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            outcome: 'non_compliant',
            reason: expect.stringContaining('violation'),
          }),
        }),
      );
    });
  });
});
