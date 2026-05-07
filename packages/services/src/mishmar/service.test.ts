/**
 * Unit tests for the Mishmar Governance Service (MishmarServiceImpl).
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 19.1
 *
 * - 3.1: Block actions exceeding authority level and route escalation
 * - 3.2: Enforce separation of duties — no agent may both decide and execute
 * - 3.3: Validate outputs against Completion_Contract JSON schema
 * - 3.4: Reject completion, log specific violations, return workflow to prior state
 * - 3.5: Require valid Execution_Tokens from both authorizer and Otzar
 * - 3.6: Block action without valid tokens and log violation
 * - 3.7: Enforce authority levels L1–L4 as defined in the autonomy matrix
 * - 19.1: Test suite validates state machine transitions before deployment
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MishmarServiceImpl } from './service.js';
import type { MishmarServiceConfig, AgentAuthorityInfo } from './service.js';
import type {
  AuthorizationRequest,
  TokenRequest,
  ExecutionToken,
  WorkflowContext,
  AuthorityLevel,
  BudgetCheckResult,
  CompletionContract,
  GovernanceAuditEntry,
} from '@seraphim/core';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockAuditService() {
  return {
    recordAction: vi.fn().mockResolvedValue('audit-action-id'),
    recordGovernanceDecision: vi.fn().mockResolvedValue('audit-gov-id'),
    recordStateTransition: vi.fn().mockResolvedValue('audit-trans-id'),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true, recordId: '', chainLength: 0 }),
  };
}

function createMockOtzarService() {
  return {
    routeTask: vi.fn().mockResolvedValue({ provider: 'anthropic', model: 'claude-sonnet', estimatedCost: 0.01, rationale: 'default' }),
    checkBudget: vi.fn().mockResolvedValue({ allowed: true, remainingDaily: 100, remainingMonthly: 1000 } as BudgetCheckResult),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    getCostReport: vi.fn().mockResolvedValue({ totalCostUsd: 0, byAgent: {}, byPillar: {}, byModel: {}, period: { start: new Date(), end: new Date() } }),
    getDailyOptimizationReport: vi.fn().mockResolvedValue({ date: new Date(), totalSpend: 0, wastePatterns: [], savingsOpportunities: [], estimatedSavings: 0 }),
    checkCache: vi.fn().mockResolvedValue(null),
    storeCache: vi.fn().mockResolvedValue(undefined),
  };
}

function createAgentInfo(overrides: Partial<AgentAuthorityInfo> = {}): AgentAuthorityInfo {
  return {
    agentId: 'agent-001',
    agentName: 'TestAgent',
    authorityLevel: 'L4',
    allowedActions: [],
    deniedActions: [],
    pillar: 'eretz',
    ...overrides,
  };
}

function createConfig(overrides: Partial<MishmarServiceConfig> = {}): MishmarServiceConfig & {
  mockAuditService: ReturnType<typeof createMockAuditService>;
  mockOtzarService: ReturnType<typeof createMockOtzarService>;
  mockGetAgentAuthority: ReturnType<typeof vi.fn>;
  mockGetActionRequirement: ReturnType<typeof vi.fn>;
  mockGetCompletionContract: ReturnType<typeof vi.fn>;
} {
  const mockAuditService = createMockAuditService();
  const mockOtzarService = createMockOtzarService();
  const mockGetAgentAuthority = vi.fn().mockResolvedValue(createAgentInfo());
  const mockGetActionRequirement = vi.fn().mockResolvedValue('L4' as AuthorityLevel);
  const mockGetCompletionContract = vi.fn().mockResolvedValue(null);

  return {
    tenantId: 'tenant-001',
    auditService: mockAuditService as any,
    otzarService: mockOtzarService as any,
    tokenExpiryMs: 5 * 60 * 1000,
    getAgentAuthority: mockGetAgentAuthority,
    getActionRequirement: mockGetActionRequirement,
    getCompletionContract: mockGetCompletionContract,
    mockAuditService,
    mockOtzarService,
    mockGetAgentAuthority,
    mockGetActionRequirement,
    mockGetCompletionContract,
    ...overrides,
  };
}

function createAuthRequest(overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest {
  return {
    agentId: 'agent-001',
    action: 'file.write',
    target: '/data/output.json',
    authorityLevel: 'L4',
    context: {},
    ...overrides,
  };
}

function createTokenRequest(overrides: Partial<TokenRequest> = {}): TokenRequest {
  return {
    agentId: 'agent-001',
    action: 'file.write',
    target: '/data/output.json',
    authorityLevel: 'L4',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MishmarServiceImpl', () => {
  let config: ReturnType<typeof createConfig>;
  let service: MishmarServiceImpl;

  beforeEach(() => {
    config = createConfig();
    service = new MishmarServiceImpl(config);
  });

  // -----------------------------------------------------------------------
  // 1. authorize() — Authority Level Enforcement (Req 3.1, 3.7)
  // -----------------------------------------------------------------------

  describe('authorize (Req 3.1, 3.7)', () => {
    it('should authorize when agent authority meets the required level', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      config.mockGetActionRequirement.mockResolvedValue('L4');

      const result = await service.authorize(createAuthRequest());

      expect(result.authorized).toBe(true);
      expect(result.reason).toContain('meets requirement');
      expect(result.auditId).toBe('audit-gov-id');
    });

    it('should authorize when agent has higher authority than required (L1 agent, L3 action)', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L1' }));
      config.mockGetActionRequirement.mockResolvedValue('L3');

      const result = await service.authorize(createAuthRequest());

      expect(result.authorized).toBe(true);
    });

    it('should deny and escalate when agent authority is insufficient (L4 agent, L2 action)', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      config.mockGetActionRequirement.mockResolvedValue('L2');

      const result = await service.authorize(createAuthRequest());

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('insufficient');
      expect(result.escalation).toBeDefined();
      expect(result.escalation!.toLevel).toBe('L3');
      expect(result.escalation!.fromAgentId).toBe('agent-001');
    });

    it('should escalate L3 → L2 when L3 agent requests L1 action', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L3' }));
      config.mockGetActionRequirement.mockResolvedValue('L1');

      const result = await service.authorize(createAuthRequest());

      expect(result.authorized).toBe(false);
      expect(result.escalation).toBeDefined();
      expect(result.escalation!.toLevel).toBe('L2');
    });

    it('should escalate L2 → L1 when L2 agent requests L1 action', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L2' }));
      config.mockGetActionRequirement.mockResolvedValue('L1');

      const result = await service.authorize(createAuthRequest());

      expect(result.authorized).toBe(false);
      expect(result.escalation).toBeDefined();
      expect(result.escalation!.toLevel).toBe('L1');
    });

    it('should deny when agent is not found in authority registry', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(null);

      const result = await service.authorize(createAuthRequest({ agentId: 'unknown-agent' }));

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should deny when action is in agent denied list', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(
        createAgentInfo({ deniedActions: ['file.write'] }),
      );

      const result = await service.authorize(createAuthRequest({ action: 'file.write' }));

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('denied');
    });

    it('should deny when action is not in agent allowed list (whitelist mode)', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(
        createAgentInfo({ allowedActions: ['file.read'], authorityLevel: 'L1' }),
      );
      config.mockGetActionRequirement.mockResolvedValue('L4');

      const result = await service.authorize(createAuthRequest({ action: 'file.write' }));

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('not in agent allowed actions');
    });

    it('should authorize when allowed list is empty (no whitelist restriction)', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(
        createAgentInfo({ allowedActions: [], authorityLevel: 'L4' }),
      );
      config.mockGetActionRequirement.mockResolvedValue('L4');

      const result = await service.authorize(createAuthRequest());

      expect(result.authorized).toBe(true);
    });

    it('should log all authorization decisions to XO Audit', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      config.mockGetActionRequirement.mockResolvedValue('L4');

      await service.authorize(createAuthRequest());

      expect(config.mockAuditService.recordGovernanceDecision).toHaveBeenCalledTimes(1);
      const entry: GovernanceAuditEntry = config.mockAuditService.recordGovernanceDecision.mock.calls[0][0];
      expect(entry.tenantId).toBe('tenant-001');
      expect(entry.actingAgentId).toBe('agent-001');
      expect(entry.governanceType).toBe('authorization');
      expect(entry.outcome).toBe('success');
    });

    it('should log blocked authorization with escalation governance type', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      config.mockGetActionRequirement.mockResolvedValue('L1');

      await service.authorize(createAuthRequest());

      const entry: GovernanceAuditEntry = config.mockAuditService.recordGovernanceDecision.mock.calls[0][0];
      expect(entry.governanceType).toBe('escalation');
      expect(entry.outcome).toBe('blocked');
    });
  });

  // -----------------------------------------------------------------------
  // 2. validateSeparation() — Role Separation (Req 3.2)
  // -----------------------------------------------------------------------

  describe('validateSeparation (Req 3.2)', () => {
    it('should pass when different agents decide and execute the same action', async () => {
      const workflow: WorkflowContext = {
        workflowId: 'wf-001',
        steps: [
          { agentId: 'agent-A', role: 'decider', action: 'deploy.app' },
          { agentId: 'agent-B', role: 'executor', action: 'deploy.app' },
        ],
      };

      const result = await service.validateSeparation(workflow);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when the same agent both decides and executes the same action', async () => {
      const workflow: WorkflowContext = {
        workflowId: 'wf-002',
        steps: [
          { agentId: 'agent-A', role: 'decider', action: 'deploy.app' },
          { agentId: 'agent-A', role: 'executor', action: 'deploy.app' },
        ],
      };

      const result = await service.validateSeparation(workflow);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].agentId).toBe('agent-A');
      expect(result.violations[0].action).toBe('deploy.app');
      expect(result.violations[0].conflictingRoles).toContain('decider');
      expect(result.violations[0].conflictingRoles).toContain('executor');
    });

    it('should allow the same agent to decide and verify (only decider+executor is blocked)', async () => {
      const workflow: WorkflowContext = {
        workflowId: 'wf-003',
        steps: [
          { agentId: 'agent-A', role: 'decider', action: 'deploy.app' },
          { agentId: 'agent-A', role: 'verifier', action: 'deploy.app' },
          { agentId: 'agent-B', role: 'executor', action: 'deploy.app' },
        ],
      };

      const result = await service.validateSeparation(workflow);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect multiple violations across different actions', async () => {
      const workflow: WorkflowContext = {
        workflowId: 'wf-004',
        steps: [
          { agentId: 'agent-A', role: 'decider', action: 'deploy.app' },
          { agentId: 'agent-A', role: 'executor', action: 'deploy.app' },
          { agentId: 'agent-B', role: 'decider', action: 'file.delete' },
          { agentId: 'agent-B', role: 'executor', action: 'file.delete' },
        ],
      };

      const result = await service.validateSeparation(workflow);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(2);
    });

    it('should log separation validation results to XO Audit', async () => {
      const workflow: WorkflowContext = {
        workflowId: 'wf-005',
        steps: [
          { agentId: 'agent-A', role: 'decider', action: 'deploy.app' },
          { agentId: 'agent-B', role: 'executor', action: 'deploy.app' },
        ],
      };

      await service.validateSeparation(workflow);

      expect(config.mockAuditService.recordGovernanceDecision).toHaveBeenCalledTimes(1);
      const entry = config.mockAuditService.recordGovernanceDecision.mock.calls[0][0];
      expect(entry.actionType).toBe('separation_validation');
      expect(entry.target).toBe('wf-005');
    });
  });

  // -----------------------------------------------------------------------
  // 3. requestToken() — Execution Token Generation (Req 3.5, 3.6)
  // -----------------------------------------------------------------------

  describe('requestToken (Req 3.5, 3.6)', () => {
    it('should issue a token when agent has sufficient authority and Otzar approves', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L2' }));
      config.mockGetActionRequirement.mockResolvedValue('L3');
      config.mockOtzarService.checkBudget.mockResolvedValue({ allowed: true, remainingDaily: 100, remainingMonthly: 1000 });

      const token = await service.requestToken(createTokenRequest());

      expect(token).toBeDefined();
      expect(token.tokenId).toBeDefined();
      expect(token.agentId).toBe('agent-001');
      expect(token.action).toBe('file.write');
      expect(token.issuedAt).toBeInstanceOf(Date);
      expect(token.expiresAt).toBeInstanceOf(Date);
      expect(token.expiresAt.getTime()).toBeGreaterThan(token.issuedAt.getTime());
    });

    it('should throw when agent is not found', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(null);

      await expect(service.requestToken(createTokenRequest())).rejects.toThrow('not found');
    });

    it('should throw when agent authority is insufficient', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      config.mockGetActionRequirement.mockResolvedValue('L1');

      await expect(service.requestToken(createTokenRequest())).rejects.toThrow('insufficient');
    });

    it('should throw when Otzar budget check fails', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      config.mockGetActionRequirement.mockResolvedValue('L4');
      config.mockOtzarService.checkBudget.mockResolvedValue({ allowed: false, remainingDaily: 0, remainingMonthly: 0 });

      await expect(service.requestToken(createTokenRequest())).rejects.toThrow('budget');
    });

    it('should log token grant to XO Audit on success', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      config.mockGetActionRequirement.mockResolvedValue('L4');

      await service.requestToken(createTokenRequest());

      // The last audit call should be the success log
      const calls = config.mockAuditService.recordGovernanceDecision.mock.calls;
      const lastEntry = calls[calls.length - 1][0];
      expect(lastEntry.governanceType).toBe('token_grant');
      expect(lastEntry.outcome).toBe('success');
    });

    it('should log blocked token request to XO Audit on failure', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      config.mockGetActionRequirement.mockResolvedValue('L1');

      await expect(service.requestToken(createTokenRequest())).rejects.toThrow();

      const entry = config.mockAuditService.recordGovernanceDecision.mock.calls[0][0];
      expect(entry.governanceType).toBe('token_grant');
      expect(entry.outcome).toBe('blocked');
    });

    it('should set token expiry based on configured tokenExpiryMs', async () => {
      const customConfig = createConfig({ tokenExpiryMs: 10_000 }); // 10 seconds
      const customService = new MishmarServiceImpl(customConfig);
      customConfig.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      customConfig.mockGetActionRequirement.mockResolvedValue('L4');

      const token = await customService.requestToken(createTokenRequest());

      const diffMs = token.expiresAt.getTime() - token.issuedAt.getTime();
      expect(diffMs).toBe(10_000);
    });
  });

  // -----------------------------------------------------------------------
  // 4. validateToken() — Token Validation (Req 3.5, 3.6)
  // -----------------------------------------------------------------------

  describe('validateToken (Req 3.5, 3.6)', () => {
    async function issueToken(): Promise<ExecutionToken> {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      config.mockGetActionRequirement.mockResolvedValue('L4');
      return service.requestToken(createTokenRequest());
    }

    it('should return true for a valid, non-expired token', async () => {
      const token = await issueToken();

      const valid = await service.validateToken(token);

      expect(valid).toBe(true);
    });

    it('should return false for an unknown token', async () => {
      const fakeToken: ExecutionToken = {
        tokenId: 'nonexistent-token-id',
        agentId: 'agent-001',
        action: 'file.write',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        issuedBy: 'TestAgent',
      };

      const valid = await service.validateToken(fakeToken);

      expect(valid).toBe(false);
    });

    it('should return false for an expired token', async () => {
      // Create service with very short expiry
      const shortConfig = createConfig({ tokenExpiryMs: 1 }); // 1ms expiry
      const shortService = new MishmarServiceImpl(shortConfig);
      shortConfig.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      shortConfig.mockGetActionRequirement.mockResolvedValue('L4');

      const token = await shortService.requestToken(createTokenRequest());

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      const valid = await shortService.validateToken(token);

      expect(valid).toBe(false);
    });

    it('should return false when agent ID does not match', async () => {
      const token = await issueToken();

      const tamperedToken: ExecutionToken = { ...token, agentId: 'agent-impersonator' };
      const valid = await service.validateToken(tamperedToken);

      expect(valid).toBe(false);
    });

    it('should return false when action does not match', async () => {
      const token = await issueToken();

      const tamperedToken: ExecutionToken = { ...token, action: 'file.delete' };
      const valid = await service.validateToken(tamperedToken);

      expect(valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 5. validateCompletion() — Completion Contract Validation (Req 3.3, 3.4)
  // -----------------------------------------------------------------------

  describe('validateCompletion (Req 3.3, 3.4)', () => {
    const validContract: CompletionContract = {
      id: 'contract-001',
      workflowType: 'app-deploy',
      version: '1.0.0',
      outputSchema: {
        type: 'object',
        required: ['status', 'deployedUrl'],
        properties: {
          status: { type: 'string', enum: ['success', 'partial'] },
          deployedUrl: { type: 'string' },
          metrics: {
            type: 'object',
            properties: {
              responseTime: { type: 'number' },
            },
          },
        },
        additionalProperties: false,
      },
      verificationSteps: [],
      description: 'App deployment completion contract',
      createdAt: new Date(),
    };

    it('should return valid when outputs match the contract schema', async () => {
      config.mockGetCompletionContract.mockResolvedValue(validContract);

      const result = await service.validateCompletion('wf-001', {
        status: 'success',
        deployedUrl: 'https://app.example.com',
      });

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.contractId).toBe('contract-001');
    });

    it('should return invalid with violations when required field is missing', async () => {
      config.mockGetCompletionContract.mockResolvedValue(validContract);

      const result = await service.validateCompletion('wf-001', {
        status: 'success',
        // missing deployedUrl
      });

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      const violation = result.violations.find((v) => v.message.includes('deployedUrl') || v.expected.includes('deployedUrl'));
      expect(violation).toBeDefined();
    });

    it('should return invalid when field type is wrong', async () => {
      config.mockGetCompletionContract.mockResolvedValue(validContract);

      const result = await service.validateCompletion('wf-001', {
        status: 123, // should be string
        deployedUrl: 'https://app.example.com',
      });

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should return invalid when enum value is not allowed', async () => {
      config.mockGetCompletionContract.mockResolvedValue(validContract);

      const result = await service.validateCompletion('wf-001', {
        status: 'failed', // not in enum ['success', 'partial']
        deployedUrl: 'https://app.example.com',
      });

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should return invalid when no completion contract is found', async () => {
      config.mockGetCompletionContract.mockResolvedValue(null);

      const result = await service.validateCompletion('wf-unknown', { status: 'success' });

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('No completion contract');
      expect(result.contractId).toBe('');
    });

    it('should log successful validation to XO Audit', async () => {
      config.mockGetCompletionContract.mockResolvedValue(validContract);

      await service.validateCompletion('wf-001', {
        status: 'success',
        deployedUrl: 'https://app.example.com',
      });

      const entry = config.mockAuditService.recordGovernanceDecision.mock.calls[0][0];
      expect(entry.governanceType).toBe('completion_validation');
      expect(entry.outcome).toBe('success');
      expect(entry.target).toBe('wf-001');
    });

    it('should log failed validation with violation details to XO Audit', async () => {
      config.mockGetCompletionContract.mockResolvedValue(validContract);

      await service.validateCompletion('wf-001', { status: 'success' }); // missing deployedUrl

      const entry = config.mockAuditService.recordGovernanceDecision.mock.calls[0][0];
      expect(entry.governanceType).toBe('completion_validation');
      expect(entry.outcome).toBe('failure');
      expect(entry.details.violations).toBeDefined();
      expect(entry.details.violationCount).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Audit Logging — All governance decisions logged (Req 7.2)
  // -----------------------------------------------------------------------

  describe('audit logging', () => {
    it('should not throw when audit service fails (graceful degradation)', async () => {
      config.mockAuditService.recordGovernanceDecision.mockRejectedValue(new Error('Audit service down'));
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      config.mockGetActionRequirement.mockResolvedValue('L4');

      // Should not throw — governance decision proceeds even if audit fails
      const result = await service.authorize(createAuthRequest());

      expect(result.authorized).toBe(true);
      expect(result.auditId).toBe('audit-unavailable');
    });

    it('should include tenantId in all audit entries', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L4' }));
      config.mockGetActionRequirement.mockResolvedValue('L4');

      await service.authorize(createAuthRequest());

      const entry = config.mockAuditService.recordGovernanceDecision.mock.calls[0][0];
      expect(entry.tenantId).toBe('tenant-001');
    });
  });

  // -----------------------------------------------------------------------
  // 7. checkAuthorityLevel() — Authority Level Lookup
  // -----------------------------------------------------------------------

  describe('checkAuthorityLevel', () => {
    it('should return the agent authority level', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(createAgentInfo({ authorityLevel: 'L2' }));

      const level = await service.checkAuthorityLevel('agent-001', 'file.write');

      expect(level).toBe('L2');
    });

    it('should return L4 for unknown agents', async () => {
      config.mockGetAgentAuthority.mockResolvedValue(null);

      const level = await service.checkAuthorityLevel('unknown-agent', 'file.write');

      expect(level).toBe('L4');
    });
  });
});
