/**
 * Integration tests for the Security Layer
 *
 * These tests wire real service instances together (CognitoAuthService,
 * AuthMiddleware, CredentialRotationService, CredentialManagerImpl,
 * TenantIsolationManager) with mocked external dependencies (DynamoDB,
 * Secrets Manager) to validate cross-component security flows.
 *
 * Validates: Requirements 20.2, 20.3, 20.4, 20.5, 19.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CognitoAuthService } from '../cognito.js';
import { AuthMiddleware } from '../middleware.js';
import { CredentialRotationService } from '../../credentials/rotation.js';
import { CredentialManagerImpl } from '../../credentials/manager.js';
import { TenantIsolationManager } from '../../credentials/tenant-isolation.js';
import type { XOAuditService, EventBusService } from '@seraphim/core';
import type { SecretsManagerClient } from '../../credentials/manager.js';

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

function createMockAuditService(): XOAuditService {
  return {
    recordAction: vi.fn().mockResolvedValue('audit-1'),
    recordGovernanceDecision: vi.fn().mockResolvedValue('audit-2'),
    recordStateTransition: vi.fn().mockResolvedValue('audit-3'),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true, recordId: '', chainLength: 0 }),
  };
}

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-1'),
    publishBatch: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue('sub-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSecretsManager(
  secrets: Record<string, Record<string, string>> = {},
): SecretsManagerClient {
  return {
    getSecretValue: vi.fn().mockImplementation(async ({ SecretId }: { SecretId: string }) => {
      const data = secrets[SecretId];
      if (!data) throw new Error(`Secret not found: ${SecretId}`);
      return { SecretString: JSON.stringify(data), VersionId: 'v-1' };
    }),
    rotateSecret: vi.fn().mockResolvedValue({ VersionId: 'v-rotated' }),
    describeSecret: vi.fn().mockResolvedValue({
      RotationEnabled: true,
      RotationRules: { AutomaticallyAfterDays: 90 },
      LastRotatedDate: new Date(),
      NextRotationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    }),
  };
}

// ---------------------------------------------------------------------------
// 1. JWT Authentication Flow Integration (Req 20.2)
// ---------------------------------------------------------------------------

describe('JWT Authentication Flow Integration (Req 20.2)', () => {
  let authService: CognitoAuthService;
  let middleware: AuthMiddleware;
  let auditService: XOAuditService;

  beforeEach(async () => {
    auditService = createMockAuditService();
    authService = new CognitoAuthService({ auditService, tenantId: 'tenant-1' });
    middleware = new AuthMiddleware({ authService, auditService });
  });

  it('should complete full flow: register → login → token → authorized request', async () => {
    // Register
    const regResult = await authService.register('king@seraphim.io', 'tenant-1', 'king', 'strongPass!');
    expect(regResult.success).toBe(true);

    // Login
    const loginResult = await authService.login('king@seraphim.io', 'strongPass!');
    expect(loginResult.success).toBe(true);
    expect(loginResult.token).toBeDefined();

    // Use token with middleware
    const authResult = await middleware.authenticate(
      `Bearer ${loginResult.token!.accessToken}`,
      { source: '10.0.0.1', path: '/api/pillars' },
    );
    expect(authResult.authorized).toBe(true);
    expect(authResult.context?.tenantId).toBe('tenant-1');
    expect(authResult.context?.role).toBe('king');
    expect(authResult.context?.user.email).toBe('king@seraphim.io');
  });

  it('should reject revoked token through middleware', async () => {
    await authService.register('user@seraphim.io', 'tenant-1', 'king', 'pass123');
    const loginResult = await authService.login('user@seraphim.io', 'pass123');
    const accessToken = loginResult.token!.accessToken;

    // Verify token works before revocation
    const beforeRevoke = await middleware.authenticate(`Bearer ${accessToken}`);
    expect(beforeRevoke.authorized).toBe(true);

    // Revoke
    const revoked = await authService.revokeToken(accessToken);
    expect(revoked).toBe(true);

    // Verify middleware rejects the revoked token
    const afterRevoke = await middleware.authenticate(
      `Bearer ${accessToken}`,
      { source: '10.0.0.1', path: '/api/data' },
    );
    expect(afterRevoke.authorized).toBe(false);
    expect(afterRevoke.error).toBe('Invalid or expired token');
  });

  it('should accept refreshed token through middleware', async () => {
    await authService.register('user@seraphim.io', 'tenant-1', 'queen', 'pass123');
    const loginResult = await authService.login('user@seraphim.io', 'pass123');
    const oldAccessToken = loginResult.token!.accessToken;
    const refreshTokenValue = loginResult.token!.refreshToken;

    // Refresh the token
    const refreshResult = await authService.refreshToken(refreshTokenValue);
    expect(refreshResult.success).toBe(true);
    expect(refreshResult.token!.accessToken).not.toBe(oldAccessToken);

    // Use the new token with middleware
    const authResult = await middleware.authenticate(
      `Bearer ${refreshResult.token!.accessToken}`,
      { source: '10.0.0.1', path: '/api/users' },
    );
    expect(authResult.authorized).toBe(true);
    expect(authResult.context?.role).toBe('queen');
  });

  it('should enforce role-based authorization after authentication', async () => {
    await authService.register('queen@seraphim.io', 'tenant-1', 'queen', 'pass123');
    const loginResult = await authService.login('queen@seraphim.io', 'pass123');

    const authResult = await middleware.authenticate(
      `Bearer ${loginResult.token!.accessToken}`,
    );
    expect(authResult.authorized).toBe(true);

    // Queen can read but not write
    const ctx = authResult.context!;
    expect(middleware.authorizeForAction(ctx, 'read')).toBe(true);
    expect(middleware.authorizeForAction(ctx, 'list')).toBe(true);
    expect(middleware.authorizeForAction(ctx, 'delete')).toBe(false);
    expect(middleware.authorizeForAction(ctx, 'create')).toBe(false);

    // Queen cannot access pillars by default
    expect(middleware.authorizeForPillar(ctx, 'zionx')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Authorization Failure Audit Logging Integration (Req 20.3)
// ---------------------------------------------------------------------------

describe('Authorization Failure Audit Logging Integration (Req 20.3)', () => {
  let authService: CognitoAuthService;
  let middleware: AuthMiddleware;
  let auditService: XOAuditService;

  beforeEach(() => {
    auditService = createMockAuditService();
    authService = new CognitoAuthService({ auditService, tenantId: 'tenant-audit' });
    middleware = new AuthMiddleware({ authService, auditService });
  });

  it('should log failed login to XO Audit with correct details', async () => {
    await authService.login('nonexistent@seraphim.io');

    expect(auditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'auth.login.failed',
        outcome: 'failure',
        target: 'nonexistent@seraphim.io',
        details: expect.objectContaining({ reason: 'User not found' }),
      }),
    );
  });

  it('should log invalid token in middleware to XO Audit with source and target', async () => {
    await middleware.authenticate('Bearer fake-token-123', {
      source: '192.168.1.100',
      path: '/api/sensitive-data',
    });

    // Both CognitoAuthService and AuthMiddleware should log
    const calls = (auditService.recordAction as ReturnType<typeof vi.fn>).mock.calls;

    // AuthMiddleware logs the request failure
    const middlewareLog = calls.find(
      (c: unknown[]) => (c[0] as { actingAgentId: string }).actingAgentId === 'auth-middleware',
    );
    expect(middlewareLog).toBeDefined();
    expect(middlewareLog![0]).toEqual(
      expect.objectContaining({
        actionType: 'auth.request.failed',
        target: '/api/sensitive-data',
        outcome: 'failure',
        details: expect.objectContaining({
          source: '192.168.1.100',
          reason: 'Invalid or expired token',
        }),
      }),
    );
  });

  it('should log multiple auth failures and capture all in audit', async () => {
    // Failure 1: missing header
    await middleware.authenticate(undefined, { source: '10.0.0.1', path: '/api/a' });

    // Failure 2: bad format
    await middleware.authenticate('Basic abc', { source: '10.0.0.2', path: '/api/b' });

    // Failure 3: invalid token
    await middleware.authenticate('Bearer bad-token', { source: '10.0.0.3', path: '/api/c' });

    const calls = (auditService.recordAction as ReturnType<typeof vi.fn>).mock.calls;

    // Filter to middleware-originated audit entries
    const middlewareCalls = calls.filter(
      (c: unknown[]) => (c[0] as { actingAgentId: string }).actingAgentId === 'auth-middleware',
    );

    // All three middleware failures should be logged
    expect(middlewareCalls.length).toBeGreaterThanOrEqual(3);

    // Verify each has source, target, and failure reason
    for (const call of middlewareCalls) {
      const entry = call[0] as { details: { source: string; reason: string }; target: string };
      expect(entry.details.source).toBeDefined();
      expect(entry.details.reason).toBeDefined();
      expect(entry.target).toBeDefined();
    }
  });

  it('should log wrong password failure with reason through CognitoAuthService', async () => {
    await authService.register('user@seraphim.io', 'tenant-1', 'king', 'correct');
    await authService.login('user@seraphim.io', 'wrong');

    expect(auditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'auth.login.failed',
        outcome: 'failure',
        details: expect.objectContaining({ reason: 'Invalid credentials' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Credential Rotation Zero-Downtime Integration (Req 20.5)
// ---------------------------------------------------------------------------

describe('Credential Rotation Zero-Downtime Integration (Req 20.5)', () => {
  let rotationService: CredentialRotationService;
  let auditService: XOAuditService;
  let eventBus: EventBusService;

  beforeEach(() => {
    auditService = createMockAuditService();
    eventBus = createMockEventBus();
    rotationService = new CredentialRotationService({
      auditService,
      eventBus,
      defaultRotationIntervalDays: 90,
    });
  });

  it('should complete full rotation lifecycle: start → verify → complete', async () => {
    rotationService.addRotationConfig({
      credentialName: 'appstore-api-key',
      rotationIntervalDays: 90,
    });

    // Start rotation
    const startResult = await rotationService.startRotation('appstore-api-key');
    expect(startResult.success).toBe(true);
    expect(startResult.newVersion).toBeDefined();
    expect(rotationService.getRotationState('appstore-api-key')).toBe('rotating');

    // Verify new credential
    const verified = await rotationService.verifyNewCredential('appstore-api-key');
    expect(verified).toBe(true);
    expect(rotationService.getRotationState('appstore-api-key')).toBe('verifying');

    // Complete rotation
    const completed = await rotationService.completeRotation('appstore-api-key');
    expect(completed).toBe(true);
    expect(rotationService.getRotationState('appstore-api-key')).toBe('idle');

    // Verify old versions are deactivated, new version is active
    const versions = rotationService.getCredentialVersions('appstore-api-key');
    const activeVersions = versions.filter((v) => v.status === 'active');
    expect(activeVersions).toHaveLength(1);
    expect(activeVersions[0].version).toBe(startResult.newVersion);

    // Verify audit trail recorded all rotation events
    const auditCalls = (auditService.recordAction as ReturnType<typeof vi.fn>).mock.calls;
    const rotationAuditTypes = auditCalls.map(
      (c: unknown[]) => (c[0] as { actionType: string }).actionType,
    );
    expect(rotationAuditTypes).toContain('credential.rotation.started');
    expect(rotationAuditTypes).toContain('credential.rotation.verified');
    expect(rotationAuditTypes).toContain('credential.rotation.completed');
  });

  it('should rollback rotation and keep old credentials active', async () => {
    rotationService.addRotationConfig({
      credentialName: 'youtube-api-key',
      rotationIntervalDays: 30,
    });

    // Start rotation
    const startResult = await rotationService.startRotation('youtube-api-key');
    expect(startResult.success).toBe(true);
    expect(rotationService.getRotationState('youtube-api-key')).toBe('rotating');

    // Rollback
    const rolledBack = await rotationService.rollbackRotation('youtube-api-key');
    expect(rolledBack).toBe(true);
    expect(rotationService.getRotationState('youtube-api-key')).toBe('idle');

    // Verify the pending version was deactivated
    const versions = rotationService.getCredentialVersions('youtube-api-key');
    const pendingVersions = versions.filter((v) => v.status === 'pending');
    expect(pendingVersions).toHaveLength(0);

    const deactivatedVersions = versions.filter((v) => v.status === 'deactivated');
    expect(deactivatedVersions).toHaveLength(1);

    // Verify audit trail records rollback
    const auditCalls = (auditService.recordAction as ReturnType<typeof vi.fn>).mock.calls;
    const rotationAuditTypes = auditCalls.map(
      (c: unknown[]) => (c[0] as { actionType: string }).actionType,
    );
    expect(rotationAuditTypes).toContain('credential.rotation.rolledback');
  });

  it('should auto-rotate credentials that are due', async () => {
    // Configure two credentials with past due dates
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    rotationService.addRotationConfig({
      credentialName: 'cred-a',
      rotationIntervalDays: 1,
      nextRotation: pastDate,
    });
    rotationService.addRotationConfig({
      credentialName: 'cred-b',
      rotationIntervalDays: 1,
      nextRotation: pastDate,
    });
    // This one is not due yet
    rotationService.addRotationConfig({
      credentialName: 'cred-c',
      rotationIntervalDays: 90,
    });

    const results = await rotationService.checkAndRotateDue();

    // Only the two due credentials should have been rotated
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
    expect(results.map((r) => r.credentialName).sort()).toEqual(['cred-a', 'cred-b']);

    // cred-c should still be idle
    expect(rotationService.getRotationState('cred-c')).toBe('idle');
  });

  it('should publish events to event bus during rotation lifecycle', async () => {
    rotationService.addRotationConfig({
      credentialName: 'stripe-key',
      rotationIntervalDays: 60,
    });

    await rotationService.startRotation('stripe-key');
    await rotationService.verifyNewCredential('stripe-key');
    await rotationService.completeRotation('stripe-key');

    const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const eventTypes = publishCalls.map(
      (c: unknown[]) => (c[0] as { type: string }).type,
    );
    expect(eventTypes).toContain('credential.rotation.started');
    expect(eventTypes).toContain('credential.rotation.completed');
  });

  it('should integrate CredentialManagerImpl with mocked Secrets Manager', async () => {
    const secretsManager = createMockSecretsManager({
      'seraphim/drivers/appstore': { 'api-key': 'secret-value-123', 'client-secret': 'cs-456' },
    });

    const credManager = new CredentialManagerImpl({
      tenantId: 'tenant-1',
      secretsManagerClient: secretsManager,
      auditService,
      secretMappings: { 'appstore-connect': 'seraphim/drivers/appstore' },
    });

    // Retrieve credential
    const apiKey = await credManager.getCredential('appstore-connect', 'api-key');
    expect(apiKey).toBe('secret-value-123');

    // Verify audit logged the access (key name only)
    expect(auditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'credential.access',
        target: 'appstore-connect/api-key',
        outcome: 'success',
      }),
    );

    // Rotate credential
    const rotationResult = await credManager.rotateCredential('appstore-connect');
    expect(rotationResult.success).toBe(true);

    // Verify rotation audit
    expect(auditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'credential.rotation',
        target: 'appstore-connect',
        outcome: 'success',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Tenant Network Isolation Configuration Integration (Req 20.4)
// ---------------------------------------------------------------------------

describe('Tenant Network Isolation Configuration Integration (Req 20.4)', () => {
  let isolationManager: TenantIsolationManager;

  beforeEach(() => {
    isolationManager = new TenantIsolationManager();
  });

  it('should configure isolation for all tenant tiers with correct rules', () => {
    const tiers = ['free', 'standard', 'premium', 'enterprise'] as const;

    for (const tier of tiers) {
      const rules = isolationManager.generateDefaultRules(tier);
      isolationManager.configureIsolation({
        tenantId: `tenant-${tier}`,
        tier,
        vpcId: `vpc-${tier}`,
        subnetIds: [`subnet-${tier}-a`, `subnet-${tier}-b`],
        securityGroupRules: rules,
      });
    }

    // Free tier: HTTPS only ingress and egress
    const freeConfig = isolationManager.getIsolationConfig('tenant-free')!;
    expect(freeConfig.securityGroupRules).toHaveLength(2);
    const freeIngress = freeConfig.securityGroupRules.filter((r) => r.direction === 'ingress');
    const freeEgress = freeConfig.securityGroupRules.filter((r) => r.direction === 'egress');
    expect(freeIngress).toHaveLength(1);
    expect(freeIngress[0].fromPort).toBe(443);
    expect(freeEgress).toHaveLength(1);
    expect(freeEgress[0].fromPort).toBe(443);

    // Standard tier: HTTPS ingress + all outbound
    const standardConfig = isolationManager.getIsolationConfig('tenant-standard')!;
    expect(standardConfig.securityGroupRules.length).toBeGreaterThanOrEqual(2);

    // Premium tier: includes Redis access
    const premiumConfig = isolationManager.getIsolationConfig('tenant-premium')!;
    const premiumRedis = premiumConfig.securityGroupRules.find((r) => r.fromPort === 6379);
    expect(premiumRedis).toBeDefined();
    expect(premiumRedis!.source).toBe('10.0.0.0/16');

    // Enterprise tier: includes both PostgreSQL and Redis
    const enterpriseConfig = isolationManager.getIsolationConfig('tenant-enterprise')!;
    const enterprisePg = enterpriseConfig.securityGroupRules.find((r) => r.fromPort === 5432);
    const enterpriseRedis = enterpriseConfig.securityGroupRules.find((r) => r.fromPort === 6379);
    expect(enterprisePg).toBeDefined();
    expect(enterprisePg!.source).toBe('10.0.0.0/16');
    expect(enterpriseRedis).toBeDefined();
  });

  it('should validate correctly configured tenants pass validation', () => {
    const rules = isolationManager.generateDefaultRules('standard');
    isolationManager.configureIsolation({
      tenantId: 'tenant-valid',
      tier: 'standard',
      vpcId: 'vpc-1',
      subnetIds: ['subnet-a'],
      securityGroupRules: rules,
    });

    const result = isolationManager.validateIsolation('tenant-valid');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should detect misconfigured tenants with missing subnets', () => {
    isolationManager.configureIsolation({
      tenantId: 'tenant-bad',
      tier: 'standard',
      vpcId: 'vpc-1',
      subnetIds: [],
      securityGroupRules: [
        {
          direction: 'ingress',
          protocol: 'tcp',
          fromPort: 443,
          toPort: 443,
          source: '0.0.0.0/0',
          description: 'HTTPS',
        },
      ],
    });

    const result = isolationManager.validateIsolation('tenant-bad');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('No subnets configured');
  });

  it('should detect misconfigured tenants with no security rules', () => {
    isolationManager.configureIsolation({
      tenantId: 'tenant-norules',
      tier: 'free',
      vpcId: 'vpc-1',
      subnetIds: ['subnet-a'],
      securityGroupRules: [],
    });

    const result = isolationManager.validateIsolation('tenant-norules');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('No security group rules');
    expect(result.issues).toContain('No HTTPS ingress rule');
  });

  it('should detect missing HTTPS ingress rule', () => {
    isolationManager.configureIsolation({
      tenantId: 'tenant-nohttps',
      tier: 'standard',
      vpcId: 'vpc-1',
      subnetIds: ['subnet-a'],
      securityGroupRules: [
        {
          direction: 'egress',
          protocol: 'all',
          fromPort: 0,
          toPort: 65535,
          source: '0.0.0.0/0',
          description: 'All outbound',
        },
      ],
    });

    const result = isolationManager.validateIsolation('tenant-nohttps');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('No HTTPS ingress rule');
  });

  it('should return invalid for unconfigured tenant', () => {
    const result = isolationManager.validateIsolation('nonexistent');
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('No isolation config found');
  });

  it('should handle tier upgrade by reconfiguring with new rules', () => {
    // Start as standard
    const standardRules = isolationManager.generateDefaultRules('standard');
    isolationManager.configureIsolation({
      tenantId: 'tenant-upgrade',
      tier: 'standard',
      vpcId: 'vpc-1',
      subnetIds: ['subnet-a', 'subnet-b'],
      securityGroupRules: standardRules,
    });

    const beforeUpgrade = isolationManager.getIsolationConfig('tenant-upgrade')!;
    const hadRedis = beforeUpgrade.securityGroupRules.some((r) => r.fromPort === 6379);
    expect(hadRedis).toBe(false);

    // Upgrade to enterprise
    const enterpriseRules = isolationManager.generateDefaultRules('enterprise');
    isolationManager.configureIsolation({
      tenantId: 'tenant-upgrade',
      tier: 'enterprise',
      vpcId: 'vpc-1',
      subnetIds: ['subnet-a', 'subnet-b', 'subnet-c'],
      securityGroupRules: enterpriseRules,
    });

    const afterUpgrade = isolationManager.getIsolationConfig('tenant-upgrade')!;
    expect(afterUpgrade.tier).toBe('enterprise');
    const hasRedis = afterUpgrade.securityGroupRules.some((r) => r.fromPort === 6379);
    const hasPg = afterUpgrade.securityGroupRules.some((r) => r.fromPort === 5432);
    expect(hasRedis).toBe(true);
    expect(hasPg).toBe(true);

    // Validation should pass
    const result = isolationManager.validateIsolation('tenant-upgrade');
    expect(result.valid).toBe(true);
  });
});
