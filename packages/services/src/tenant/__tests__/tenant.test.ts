/**
 * Unit tests for Multi-Tenant Service
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 19.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TenantService } from '../service.js';
import type { XOAuditService, EventBusService } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAuditService(): XOAuditService {
  return {
    recordAction: vi.fn().mockResolvedValue('audit-id-1'),
    recordGovernanceDecision: vi.fn().mockResolvedValue('audit-id-2'),
    recordStateTransition: vi.fn().mockResolvedValue('audit-id-3'),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true }),
  };
}

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-1'),
    publishBatch: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue('sub-id-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TenantService', () => {
  let service: TenantService;

  beforeEach(() => {
    service = new TenantService();
  });

  // -----------------------------------------------------------------------
  // Tenant Provisioning (Req 14.1, 14.5)
  // -----------------------------------------------------------------------

  describe('Tenant Provisioning', () => {
    it('creates tenant with default pillars and budget', async () => {
      const result = await service.provisionTenant('Test Tenant', 'owner-1');

      expect(result.success).toBe(true);
      expect(result.tenant.name).toBe('Test Tenant');
      expect(result.tenant.ownerId).toBe('owner-1');
      expect(result.tenant.pillars).toEqual(['eretz', 'otzar']);
      expect(result.tenant.budgetLimits).toEqual({ daily: 100, monthly: 2000 });
      expect(result.tenant.type).toBe('king');
      expect(result.tenant.id).toBeDefined();
      expect(result.tenant.createdAt).toBeDefined();
    });

    it('creates tenant with custom pillars', async () => {
      const result = await service.provisionTenant('Custom', 'owner-2', [
        'eretz',
        'otzar',
        'zikaron',
      ]);

      expect(result.success).toBe(true);
      expect(result.tenant.pillars).toEqual(['eretz', 'otzar', 'zikaron']);
    });

    it('creates tenant with custom type and parentTenantId', async () => {
      const king = await service.provisionTenant('King', 'king-1');
      const queen = await service.provisionTenant('Queen', 'queen-owner', undefined, {
        type: 'queen',
        parentTenantId: king.tenant.id,
      });

      expect(queen.success).toBe(true);
      expect(queen.tenant.type).toBe('queen');
      expect(queen.tenant.parentTenantId).toBe(king.tenant.id);
    });

    it('fails when parentTenantId does not exist', async () => {
      const result = await service.provisionTenant('Bad', 'owner-3', undefined, {
        parentTenantId: 'non-existent-id',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('generates unique UUID for each tenant', async () => {
      const r1 = await service.provisionTenant('T1', 'o1');
      const r2 = await service.provisionTenant('T2', 'o2');

      expect(r1.tenant.id).not.toBe(r2.tenant.id);
      // UUID v4 format
      expect(r1.tenant.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('publishes event when eventBus is provided', async () => {
      const eventBus = createMockEventBus();
      const svc = new TenantService({ eventBus });

      await svc.provisionTenant('Evented', 'owner-e');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.tenant-service',
          type: 'tenant.provisioned',
        }),
      );
    });

    it('logs audit when auditService is provided', async () => {
      const auditService = createMockAuditService();
      const svc = new TenantService({ auditService });

      await svc.provisionTenant('Audited', 'owner-a');

      expect(auditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'tenant.provision',
          outcome: 'success',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Queen Provisioning (Req 14.2, 14.3)
  // -----------------------------------------------------------------------

  describe('Queen Provisioning', () => {
    let tenantId: string;

    beforeEach(async () => {
      const result = await service.provisionTenant('King Tenant', 'king-1', [
        'eretz',
        'otzar',
        'zikaron',
      ]);
      tenantId = result.tenant.id;
    });

    it('creates Queen profile with scoped pillars', async () => {
      const queen = await service.provisionQueen('queen-1', tenantId, ['eretz', 'otzar']);

      expect(queen.userId).toBe('queen-1');
      expect(queen.tenantId).toBe(tenantId);
      expect(queen.authorizedPillars).toEqual(['eretz', 'otzar']);
      expect(queen.createdAt).toBeDefined();
    });

    it('filters pillars to only those in tenant', async () => {
      const queen = await service.provisionQueen('queen-2', tenantId, [
        'eretz',
        'otzar',
        'nonexistent',
      ]);

      expect(queen.authorizedPillars).toEqual(['eretz', 'otzar']);
      expect(queen.authorizedPillars).not.toContain('nonexistent');
    });

    it('sets default denied actions', async () => {
      const queen = await service.provisionQueen('queen-3', tenantId, ['eretz']);

      expect(queen.deniedActions).toEqual([
        'delete_tenant',
        'modify_budget',
        'access_full_audit',
        'manage_agents',
      ]);
    });

    it('sets default authority level L2', async () => {
      const queen = await service.provisionQueen('queen-4', tenantId, ['eretz']);

      expect(queen.authorityLevel).toBe('L2');
    });

    it('allows custom authority level', async () => {
      const queen = await service.provisionQueen('queen-5', tenantId, ['eretz'], [], {
        authorityLevel: 'L3',
      });

      expect(queen.authorityLevel).toBe('L3');
    });

    it('throws when tenant does not exist', async () => {
      await expect(
        service.provisionQueen('queen-6', 'non-existent', ['eretz']),
      ).rejects.toThrow('not found');
    });

    it('publishes event when eventBus is provided', async () => {
      const eventBus = createMockEventBus();
      const svc = new TenantService({ eventBus });
      const { tenant } = await svc.provisionTenant('King', 'king-e', ['eretz']);

      await svc.provisionQueen('queen-7', tenant.id, ['eretz']);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.tenant-service',
          type: 'queen.provisioned',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Cross-Tenant Coordination (Req 14.4)
  // -----------------------------------------------------------------------

  describe('Cross-Tenant Coordination', () => {
    let kingTenantId: string;
    let queenTenantId: string;

    beforeEach(async () => {
      // Set up King tenant
      const king = await service.provisionTenant('King Tenant', 'king-1', [
        'eretz',
        'otzar',
      ]);
      kingTenantId = king.tenant.id;

      // Set up Queen tenant as child of King
      const queen = await service.provisionTenant('Queen Tenant', 'queen-owner', undefined, {
        type: 'queen',
        parentTenantId: kingTenantId,
      });
      queenTenantId = queen.tenant.id;

      // Provision Queen profile with authorized pillars and actions
      await service.provisionQueen('queen-user', kingTenantId, ['eretz', 'otzar'], [
        'read',
        'write',
      ]);
    });

    it('authorizes valid cross-tenant action with execution token', async () => {
      const result = await service.requestCrossTenantAction({
        queenUserId: 'queen-user',
        queenTenantId,
        targetTenantId: kingTenantId,
        action: 'read',
        target: 'eretz',
        context: {},
      });

      expect(result.authorized).toBe(true);
      expect(result.executionToken).toBeDefined();
      expect(result.executionToken!.tokenId).toBeDefined();
      expect(result.executionToken!.action).toBe('read');
      expect(result.reason).toContain('authorized');
    });

    it('denies when Queen profile not found', async () => {
      const result = await service.requestCrossTenantAction({
        queenUserId: 'unknown-user',
        queenTenantId,
        targetTenantId: kingTenantId,
        action: 'read',
        target: 'eretz',
        context: {},
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('Queen profile not found');
    });

    it('denies when Queen tenant is not child of target', async () => {
      // Create an unrelated tenant
      const unrelated = await service.provisionTenant('Unrelated', 'other-owner');

      const result = await service.requestCrossTenantAction({
        queenUserId: 'queen-user',
        queenTenantId: unrelated.tenant.id,
        targetTenantId: kingTenantId,
        action: 'read',
        target: 'eretz',
        context: {},
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('not permitted');
    });

    it('denies when action is in denied actions', async () => {
      const result = await service.requestCrossTenantAction({
        queenUserId: 'queen-user',
        queenTenantId,
        targetTenantId: kingTenantId,
        action: 'delete_tenant',
        target: 'eretz',
        context: {},
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('denied');
    });

    it('denies when action not in authorized actions whitelist', async () => {
      const result = await service.requestCrossTenantAction({
        queenUserId: 'queen-user',
        queenTenantId,
        targetTenantId: kingTenantId,
        action: 'admin_override',
        target: 'eretz',
        context: {},
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('not in authorized actions');
    });

    it('denies when target pillar not authorized', async () => {
      // Queen is authorized for eretz and otzar, not zikaron
      const result = await service.requestCrossTenantAction({
        queenUserId: 'queen-user',
        queenTenantId,
        targetTenantId: kingTenantId,
        action: 'read',
        target: 'zikaron',
        context: {},
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('pillar not authorized');
    });

    it('returns execution token with future expiry', async () => {
      const before = Date.now();

      const result = await service.requestCrossTenantAction({
        queenUserId: 'queen-user',
        queenTenantId,
        targetTenantId: kingTenantId,
        action: 'read',
        target: 'eretz',
        context: {},
      });

      expect(result.authorized).toBe(true);
      const expiresAt = new Date(result.executionToken!.expiresAt).getTime();
      // Token should expire ~5 minutes from now
      const fiveMinMs = 5 * 60 * 1000;
      expect(expiresAt).toBeGreaterThan(before);
      expect(expiresAt).toBeLessThanOrEqual(before + fiveMinMs + 1000);
      expect(expiresAt).toBeGreaterThanOrEqual(before + fiveMinMs - 1000);
    });
  });

  // -----------------------------------------------------------------------
  // Tenant-Scoped Access (Req 14.3)
  // -----------------------------------------------------------------------

  describe('Tenant-Scoped Access', () => {
    let tenantId: string;

    beforeEach(async () => {
      const result = await service.provisionTenant('Scoped Tenant', 'king-1', [
        'eretz',
        'otzar',
        'zikaron',
      ]);
      tenantId = result.tenant.id;
    });

    it('allows King full access to all pillars', async () => {
      const scope = await service.scopeRequest('king-1', tenantId, 'eretz', 'read');

      expect(scope.allowed).toBe(true);
      expect(scope.effectivePillars).toEqual(['eretz', 'otzar', 'zikaron']);
      expect(scope.effectiveActions).toEqual(['*']);
    });

    it('denies when tenant not found', async () => {
      const scope = await service.scopeRequest('king-1', 'non-existent', 'eretz', 'read');

      expect(scope.allowed).toBe(false);
      expect(scope.reason).toContain('Tenant not found');
    });

    it('denies when user is not King or Queen', async () => {
      const scope = await service.scopeRequest('random-user', tenantId, 'eretz', 'read');

      expect(scope.allowed).toBe(false);
      expect(scope.reason).toContain('not authorized');
    });

    it('denies Queen access to unauthorized pillar', async () => {
      await service.provisionQueen('queen-scoped', tenantId, ['eretz']);

      const scope = await service.scopeRequest('queen-scoped', tenantId, 'otzar', 'read');

      expect(scope.allowed).toBe(false);
      expect(scope.reason).toContain('Pillar not in authorized scope');
    });

    it('denies Queen denied actions', async () => {
      await service.provisionQueen('queen-denied', tenantId, ['eretz']);

      const scope = await service.scopeRequest(
        'queen-denied',
        tenantId,
        'eretz',
        'delete_tenant',
      );

      expect(scope.allowed).toBe(false);
      expect(scope.reason).toContain('denied');
    });

    it('denies Queen unauthorized actions (whitelist)', async () => {
      await service.provisionQueen('queen-wl', tenantId, ['eretz'], ['read', 'write']);

      const scope = await service.scopeRequest(
        'queen-wl',
        tenantId,
        'eretz',
        'admin_override',
      );

      expect(scope.allowed).toBe(false);
      expect(scope.reason).toContain('not in authorized scope');
    });

    it('allows Queen access within scope', async () => {
      await service.provisionQueen('queen-ok', tenantId, ['eretz', 'otzar'], [
        'read',
        'write',
      ]);

      const scope = await service.scopeRequest('queen-ok', tenantId, 'eretz', 'read');

      expect(scope.allowed).toBe(true);
      expect(scope.effectivePillars).toEqual(['eretz', 'otzar']);
      expect(scope.effectiveActions).toEqual(['read', 'write']);
    });
  });

  // -----------------------------------------------------------------------
  // Tenant Data Isolation
  // -----------------------------------------------------------------------

  describe('Tenant Data Isolation', () => {
    it('allows same tenant access', async () => {
      const { tenant } = await service.provisionTenant('Same', 'owner-1');

      expect(service.validateTenantAccess(tenant.id, tenant.id)).toBe(true);
    });

    it('allows child-to-parent access', async () => {
      const parent = await service.provisionTenant('Parent', 'owner-p');
      const child = await service.provisionTenant('Child', 'owner-c', undefined, {
        type: 'queen',
        parentTenantId: parent.tenant.id,
      });

      expect(
        service.validateTenantAccess(child.tenant.id, parent.tenant.id),
      ).toBe(true);
    });

    it('denies unrelated tenant access', async () => {
      const t1 = await service.provisionTenant('T1', 'o1');
      const t2 = await service.provisionTenant('T2', 'o2');

      expect(service.validateTenantAccess(t1.tenant.id, t2.tenant.id)).toBe(false);
    });

    it('denies when requesting tenant not found', async () => {
      const t = await service.provisionTenant('T', 'o');

      expect(service.validateTenantAccess('non-existent', t.tenant.id)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Query Methods
  // -----------------------------------------------------------------------

  describe('Query Methods', () => {
    it('listTenants returns all tenants', async () => {
      await service.provisionTenant('T1', 'o1');
      await service.provisionTenant('T2', 'o2');

      const tenants = service.listTenants();
      expect(tenants).toHaveLength(2);
      expect(tenants.map((t) => t.name)).toEqual(['T1', 'T2']);
    });

    it('getChildTenants returns only children', async () => {
      const parent = await service.provisionTenant('Parent', 'op');
      await service.provisionTenant('Child1', 'oc1', undefined, {
        parentTenantId: parent.tenant.id,
      });
      await service.provisionTenant('Child2', 'oc2', undefined, {
        parentTenantId: parent.tenant.id,
      });
      await service.provisionTenant('Unrelated', 'ou');

      const children = service.getChildTenants(parent.tenant.id);
      expect(children).toHaveLength(2);
      expect(children.map((c) => c.name)).toEqual(['Child1', 'Child2']);
    });

    it('listQueenProfiles returns profiles for tenant', async () => {
      const { tenant } = await service.provisionTenant('T', 'o', ['eretz', 'otzar']);
      await service.provisionQueen('q1', tenant.id, ['eretz']);
      await service.provisionQueen('q2', tenant.id, ['otzar']);

      const profiles = service.listQueenProfiles(tenant.id);
      expect(profiles).toHaveLength(2);
      expect(profiles.map((p) => p.userId)).toEqual(['q1', 'q2']);
    });
  });

  // -----------------------------------------------------------------------
  // Backward Compatibility
  // -----------------------------------------------------------------------

  describe('Backward Compatibility', () => {
    it('isAuthorized: King has access to all pillars', async () => {
      await service.provisionTenant('King T', 'king-bc');

      expect(service.isAuthorized('king-bc', 'eretz')).toBe(true);
      expect(service.isAuthorized('king-bc', 'otzar')).toBe(true);
      expect(service.isAuthorized('king-bc', 'anything')).toBe(true);
    });

    it('isAuthorized: Queen has scoped access', async () => {
      const { tenant } = await service.provisionTenant('T', 'o', ['eretz', 'otzar']);
      await service.provisionQueen('queen-bc', tenant.id, ['eretz']);

      expect(service.isAuthorized('queen-bc', 'eretz')).toBe(true);
      expect(service.isAuthorized('queen-bc', 'otzar')).toBe(false);
    });

    it('isAuthorized: unknown user denied', () => {
      expect(service.isAuthorized('nobody', 'eretz')).toBe(false);
    });

    it('getTenant returns tenant or undefined', async () => {
      const { tenant } = await service.provisionTenant('T', 'o');

      expect(service.getTenant(tenant.id)).toBeDefined();
      expect(service.getTenant(tenant.id)!.name).toBe('T');
      expect(service.getTenant('non-existent')).toBeUndefined();
    });

    it('getQueenProfile returns profile or undefined', async () => {
      const { tenant } = await service.provisionTenant('T', 'o', ['eretz']);
      await service.provisionQueen('qp', tenant.id, ['eretz']);

      expect(service.getQueenProfile('qp')).toBeDefined();
      expect(service.getQueenProfile('qp')!.userId).toBe('qp');
      expect(service.getQueenProfile('nobody')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Service Integration
  // -----------------------------------------------------------------------

  describe('Service Integration', () => {
    it('provisionTenant succeeds silently without injected services', async () => {
      const svc = new TenantService();
      const result = await svc.provisionTenant('No Services', 'owner-ns');

      expect(result.success).toBe(true);
    });

    it('provisionTenant calls auditService.recordAction when injected', async () => {
      const auditService = createMockAuditService();
      const svc = new TenantService({ auditService });

      await svc.provisionTenant('Audited', 'owner-a');

      expect(auditService.recordAction).toHaveBeenCalledTimes(1);
      expect(auditService.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'tenant.provision',
          outcome: 'success',
        }),
      );
    });

    it('provisionTenant calls eventBus.publish when injected', async () => {
      const eventBus = createMockEventBus();
      const svc = new TenantService({ eventBus });

      await svc.provisionTenant('Evented', 'owner-e');

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.tenant-service',
          type: 'tenant.provisioned',
          detail: expect.objectContaining({
            name: 'Evented',
          }),
        }),
      );
    });
  });
});
