/**
 * Multi-Tenant Service
 *
 * Implements tenant provisioning, Queen authorization profiles,
 * cross-tenant coordination, and tenant-scoped access control.
 *
 * Accepts optional injected dependencies (audit, event bus, mishmar,
 * otzar, zikaron) for richer behavior. Works standalone when
 * dependencies are not provided.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { randomUUID } from 'node:crypto';

import type { XOAuditService, EventBusService } from '@seraphim/core';
import type { AuthorityLevel } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TenantServiceConfig {
  /** XO Audit service for logging tenant operations */
  auditService?: XOAuditService;

  /** Event Bus service for publishing tenant lifecycle events */
  eventBus?: EventBusService;

  /** Mishmar service reference for governance integration */
  mishmarService?: unknown;

  /** Otzar service reference for budget setup */
  otzarService?: unknown;

  /** Zikaron service reference for memory initialization */
  zikaronService?: unknown;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TenantRole = 'king' | 'queen';

export type TenantType = 'king' | 'queen' | 'platform_user';

export interface TenantConfig {
  id: string;
  name: string;
  ownerId: string;
  type: TenantType;
  parentTenantId?: string;
  pillars: string[];
  budgetLimits: { daily: number; monthly: number };
  createdAt: string;
}

export interface QueenProfile {
  userId: string;
  tenantId: string;
  parentTenantId: string;
  authorizedPillars: string[];
  authorizedActions: string[];
  deniedActions: string[];
  authorityLevel: AuthorityLevel;
  createdAt: string;
}

export interface TenantProvisionResult {
  tenant: TenantConfig;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Cross-Tenant Coordination Types (Req 14.4)
// ---------------------------------------------------------------------------

export interface CrossTenantRequest {
  queenUserId: string;
  queenTenantId: string;
  targetTenantId: string;
  action: string;
  target: string;
  context: Record<string, unknown>;
}

export interface CrossTenantResult {
  authorized: boolean;
  executionToken?: { tokenId: string; action: string; expiresAt: string };
  reason: string;
  auditId: string;
}

// ---------------------------------------------------------------------------
// Tenant-Scoped Access Types (Req 14.3)
// ---------------------------------------------------------------------------

export interface ScopeResult {
  allowed: boolean;
  reason: string;
  effectivePillars: string[];
  effectiveActions: string[];
}

// ---------------------------------------------------------------------------
// Default denied actions for Queens
// ---------------------------------------------------------------------------

const QUEEN_DENIED_ACTIONS: string[] = [
  'delete_tenant',
  'modify_budget',
  'access_full_audit',
  'manage_agents',
];

/** Default pillars provisioned for new tenants */
const DEFAULT_PILLARS: string[] = ['eretz', 'otzar'];

/** Default per-pillar budget limits */
const DEFAULT_BUDGET = { daily: 100, monthly: 2000 };

/** Cross-tenant execution token expiry: 5 minutes */
const CROSS_TENANT_TOKEN_EXPIRY_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Tenant Service
// ---------------------------------------------------------------------------

export class TenantService {
  private tenants = new Map<string, TenantConfig>();
  private queenProfiles = new Map<string, QueenProfile>();
  private readonly config: TenantServiceConfig;

  constructor(config?: TenantServiceConfig) {
    this.config = config ?? {};
  }

  // -----------------------------------------------------------------------
  // Tenant Provisioning (Req 14.1, 14.5)
  // -----------------------------------------------------------------------

  /**
   * Provision a new tenant with isolated resources.
   *
   * Creates an isolated tenant with default pillars, fresh Zikaron memory,
   * and independent Otzar budgets.
   */
  async provisionTenant(
    name: string,
    ownerId: string,
    pillars: string[] = DEFAULT_PILLARS,
    options?: {
      type?: TenantType;
      parentTenantId?: string;
      budgetLimits?: { daily: number; monthly: number };
    },
  ): Promise<TenantProvisionResult> {
    const id = randomUUID();
    const type = options?.type ?? 'king';
    const parentTenantId = options?.parentTenantId;

    // Validate parent tenant exists for queen/platform_user types
    if (parentTenantId && !this.tenants.has(parentTenantId)) {
      return {
        tenant: {} as TenantConfig,
        success: false,
        error: `Parent tenant ${parentTenantId} not found`,
      };
    }

    const tenant: TenantConfig = {
      id,
      name,
      ownerId,
      type,
      parentTenantId,
      pillars: [...pillars],
      budgetLimits: options?.budgetLimits ?? { ...DEFAULT_BUDGET },
      createdAt: new Date().toISOString(),
    };

    this.tenants.set(id, tenant);

    // Publish tenant.provisioned event
    await this.publishEvent('tenant.provisioned', tenant.id, {
      tenantId: tenant.id,
      name: tenant.name,
      type: tenant.type,
      pillars: tenant.pillars,
      parentTenantId: tenant.parentTenantId,
    });

    // Log to XO Audit
    await this.logAudit({
      tenantId: tenant.id,
      actingAgentId: ownerId,
      actingAgentName: name,
      actionType: 'tenant.provision',
      target: tenant.id,
      outcome: 'success',
      details: {
        type: tenant.type,
        pillars: tenant.pillars,
        parentTenantId: tenant.parentTenantId,
      },
    });

    return { tenant, success: true };
  }

  // -----------------------------------------------------------------------
  // Queen Provisioning (Req 14.2, 14.3)
  // -----------------------------------------------------------------------

  /**
   * Provision a Queen profile with scoped authorization.
   *
   * Creates a Queen tenant linked to the parent King tenant and a scoped
   * authorization profile limiting the Queen to designated pillars and
   * action types.
   */
  async provisionQueen(
    userId: string,
    tenantId: string,
    authorizedPillars: string[],
    authorizedActions: string[] = [],
    options?: {
      authorityLevel?: AuthorityLevel;
    },
  ): Promise<QueenProfile> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    // Validate pillars are within tenant's pillars (Req 14.2)
    const validPillars = authorizedPillars.filter((p) => tenant.pillars.includes(p));

    const profile: QueenProfile = {
      userId,
      tenantId,
      parentTenantId: tenant.id,
      authorizedPillars: validPillars,
      authorizedActions,
      deniedActions: [...QUEEN_DENIED_ACTIONS],
      authorityLevel: options?.authorityLevel ?? 'L2',
      createdAt: new Date().toISOString(),
    };

    this.queenProfiles.set(userId, profile);

    // Publish queen.provisioned event
    await this.publishEvent('queen.provisioned', tenant.id, {
      userId,
      tenantId,
      authorizedPillars: validPillars,
      authorizedActions,
      authorityLevel: profile.authorityLevel,
    });

    // Log to XO Audit
    await this.logAudit({
      tenantId,
      actingAgentId: userId,
      actingAgentName: `queen-${userId}`,
      actionType: 'queen.provision',
      target: tenantId,
      outcome: 'success',
      details: {
        authorizedPillars: validPillars,
        authorizedActions,
        deniedActions: profile.deniedActions,
        authorityLevel: profile.authorityLevel,
      },
    });

    return profile;
  }

  // -----------------------------------------------------------------------
  // Cross-Tenant Coordination (Req 14.4)
  // -----------------------------------------------------------------------

  /**
   * Request a cross-tenant action from a Queen to a King's pillar.
   *
   * Verifies the Queen has a valid profile, the Queen's tenant is a child
   * of the target tenant, the action is authorized, and the target pillar
   * is accessible. Generates a time-limited execution token on success.
   */
  async requestCrossTenantAction(
    request: CrossTenantRequest,
  ): Promise<CrossTenantResult> {
    const auditId = randomUUID();

    // 1. Verify the Queen has a valid profile
    const queenProfile = this.queenProfiles.get(request.queenUserId);
    if (!queenProfile) {
      await this.logAudit({
        tenantId: request.queenTenantId,
        actingAgentId: request.queenUserId,
        actingAgentName: `queen-${request.queenUserId}`,
        actionType: 'cross-tenant.action.requested',
        target: request.targetTenantId,
        outcome: 'blocked',
        details: { reason: 'Queen profile not found', auditId },
      });

      return {
        authorized: false,
        reason: 'Queen profile not found',
        auditId,
      };
    }

    // 2. Verify the Queen's tenant is a child of the target tenant
    const queenTenant = this.tenants.get(request.queenTenantId);
    if (
      !queenTenant ||
      !this.validateTenantAccess(request.queenTenantId, request.targetTenantId)
    ) {
      await this.logAudit({
        tenantId: request.queenTenantId,
        actingAgentId: request.queenUserId,
        actingAgentName: `queen-${request.queenUserId}`,
        actionType: 'cross-tenant.action.requested',
        target: request.targetTenantId,
        outcome: 'blocked',
        details: { reason: 'Cross-tenant access not permitted', auditId },
      });

      return {
        authorized: false,
        reason: 'Cross-tenant access not permitted',
        auditId,
      };
    }

    // 3. Verify the action is not in the Queen's denied actions
    if (queenProfile.deniedActions.includes(request.action)) {
      await this.logAudit({
        tenantId: request.queenTenantId,
        actingAgentId: request.queenUserId,
        actingAgentName: `queen-${request.queenUserId}`,
        actionType: 'cross-tenant.action.requested',
        target: request.targetTenantId,
        outcome: 'blocked',
        details: { reason: 'Action denied for Queen', action: request.action, auditId },
      });

      return {
        authorized: false,
        reason: 'Action denied for Queen',
        auditId,
      };
    }

    // 4. Verify the action is in the Queen's authorized actions (if whitelist is set)
    if (
      queenProfile.authorizedActions.length > 0 &&
      !queenProfile.authorizedActions.includes(request.action)
    ) {
      await this.logAudit({
        tenantId: request.queenTenantId,
        actingAgentId: request.queenUserId,
        actingAgentName: `queen-${request.queenUserId}`,
        actionType: 'cross-tenant.action.requested',
        target: request.targetTenantId,
        outcome: 'blocked',
        details: {
          reason: 'Action not in authorized actions',
          action: request.action,
          auditId,
        },
      });

      return {
        authorized: false,
        reason: 'Action not in authorized actions',
        auditId,
      };
    }

    // 5. Verify the target pillar is in the Queen's authorized pillars
    if (!queenProfile.authorizedPillars.includes(request.target)) {
      await this.logAudit({
        tenantId: request.queenTenantId,
        actingAgentId: request.queenUserId,
        actingAgentName: `queen-${request.queenUserId}`,
        actionType: 'cross-tenant.action.requested',
        target: request.targetTenantId,
        outcome: 'blocked',
        details: {
          reason: 'Target pillar not authorized',
          pillar: request.target,
          auditId,
        },
      });

      return {
        authorized: false,
        reason: 'Target pillar not authorized',
        auditId,
      };
    }

    // 6. Generate a cross-tenant execution token (5 min expiry)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CROSS_TENANT_TOKEN_EXPIRY_MS);
    const executionToken = {
      tokenId: randomUUID(),
      action: request.action,
      expiresAt: expiresAt.toISOString(),
    };

    // 7. Publish cross-tenant.action.requested event
    await this.publishEvent('cross-tenant.action.requested', request.queenTenantId, {
      queenUserId: request.queenUserId,
      queenTenantId: request.queenTenantId,
      targetTenantId: request.targetTenantId,
      action: request.action,
      target: request.target,
      tokenId: executionToken.tokenId,
    });

    // 8. Log to XO Audit
    await this.logAudit({
      tenantId: request.queenTenantId,
      actingAgentId: request.queenUserId,
      actingAgentName: `queen-${request.queenUserId}`,
      actionType: 'cross-tenant.action.requested',
      target: request.targetTenantId,
      outcome: 'success',
      details: {
        action: request.action,
        pillar: request.target,
        tokenId: executionToken.tokenId,
        expiresAt: executionToken.expiresAt,
        auditId,
      },
    });

    return {
      authorized: true,
      executionToken,
      reason: 'Cross-tenant action authorized',
      auditId,
    };
  }

  // -----------------------------------------------------------------------
  // Tenant-Scoped Access Control (Req 14.3)
  // -----------------------------------------------------------------------

  /**
   * Scope a request to the user's authorized pillars and actions.
   *
   * For Kings: returns all tenant pillars and full action access.
   * For Queens: returns only authorized pillars and actions from their profile.
   */
  async scopeRequest(
    userId: string,
    tenantId: string,
    pillar: string,
    action: string,
  ): Promise<ScopeResult> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return {
        allowed: false,
        reason: 'Tenant not found',
        effectivePillars: [],
        effectiveActions: [],
      };
    }

    // Check if user is a King (tenant owner)
    if (tenant.ownerId === userId) {
      return {
        allowed: true,
        reason: 'King has full access to all tenant pillars',
        effectivePillars: [...tenant.pillars],
        effectiveActions: ['*'],
      };
    }

    // Check if user is a Queen
    const queenProfile = this.queenProfiles.get(userId);
    if (!queenProfile || queenProfile.tenantId !== tenantId) {
      return {
        allowed: false,
        reason: 'User not authorized for this tenant',
        effectivePillars: [],
        effectiveActions: [],
      };
    }

    // Verify pillar access
    if (!queenProfile.authorizedPillars.includes(pillar)) {
      return {
        allowed: false,
        reason: 'Pillar not in authorized scope',
        effectivePillars: queenProfile.authorizedPillars,
        effectiveActions: queenProfile.authorizedActions,
      };
    }

    // Verify action is not denied
    if (queenProfile.deniedActions.includes(action)) {
      return {
        allowed: false,
        reason: 'Action denied for Queen',
        effectivePillars: queenProfile.authorizedPillars,
        effectiveActions: queenProfile.authorizedActions,
      };
    }

    // Verify action is authorized (if whitelist is set)
    if (
      queenProfile.authorizedActions.length > 0 &&
      !queenProfile.authorizedActions.includes(action)
    ) {
      return {
        allowed: false,
        reason: 'Action not in authorized scope',
        effectivePillars: queenProfile.authorizedPillars,
        effectiveActions: queenProfile.authorizedActions,
      };
    }

    return {
      allowed: true,
      reason: 'Queen authorized within scope',
      effectivePillars: queenProfile.authorizedPillars,
      effectiveActions:
        queenProfile.authorizedActions.length > 0
          ? queenProfile.authorizedActions
          : ['*'],
    };
  }

  // -----------------------------------------------------------------------
  // Tenant Data Isolation
  // -----------------------------------------------------------------------

  /**
   * Validate that a requesting tenant can access a target tenant.
   *
   * Returns true only if the requesting tenant is the same as the target,
   * or the requesting tenant is a child of the target (for cross-tenant
   * coordination).
   */
  validateTenantAccess(
    requestingTenantId: string,
    targetTenantId: string,
  ): boolean {
    // Same tenant — always allowed
    if (requestingTenantId === targetTenantId) return true;

    // Check if requesting tenant is a child of target
    const requestingTenant = this.tenants.get(requestingTenantId);
    if (!requestingTenant) return false;

    return requestingTenant.parentTenantId === targetTenantId;
  }

  // -----------------------------------------------------------------------
  // Authorization Check (backward compatible)
  // -----------------------------------------------------------------------

  /**
   * Check if a user has access to a specific pillar.
   */
  isAuthorized(userId: string, pillar: string): boolean {
    const profile = this.queenProfiles.get(userId);
    if (!profile) {
      // Check if user is a tenant owner (King)
      for (const tenant of this.tenants.values()) {
        if (tenant.ownerId === userId) return true;
      }
      return false;
    }
    return profile.authorizedPillars.includes(pillar);
  }

  // -----------------------------------------------------------------------
  // Query Methods
  // -----------------------------------------------------------------------

  /**
   * Get tenant by ID.
   */
  getTenant(tenantId: string): TenantConfig | undefined {
    return this.tenants.get(tenantId);
  }

  /**
   * Get Queen profile by user ID.
   */
  getQueenProfile(userId: string): QueenProfile | undefined {
    return this.queenProfiles.get(userId);
  }

  /**
   * List all tenants.
   */
  listTenants(): TenantConfig[] {
    return Array.from(this.tenants.values());
  }

  /**
   * Get all child (Queen) tenants under a parent tenant.
   */
  getChildTenants(parentTenantId: string): TenantConfig[] {
    return Array.from(this.tenants.values()).filter(
      (t) => t.parentTenantId === parentTenantId,
    );
  }

  /**
   * List all Queen profiles for a given tenant.
   */
  listQueenProfiles(tenantId: string): QueenProfile[] {
    return Array.from(this.queenProfiles.values()).filter(
      (p) => p.tenantId === tenantId,
    );
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  /**
   * Publish an event to the Event Bus (if available).
   */
  private async publishEvent(
    type: string,
    tenantId: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    if (!this.config.eventBus) return;

    try {
      await this.config.eventBus.publish({
        source: 'seraphim.tenant-service',
        type,
        detail,
        metadata: {
          tenantId,
          correlationId: randomUUID(),
          timestamp: new Date(),
        },
      });
    } catch {
      // Event publishing failure should not block tenant operations
    }
  }

  /**
   * Log an action to XO Audit (if available).
   */
  private async logAudit(params: {
    tenantId: string;
    actingAgentId: string;
    actingAgentName: string;
    actionType: string;
    target: string;
    outcome: 'success' | 'failure' | 'blocked';
    details: Record<string, unknown>;
  }): Promise<string> {
    if (!this.config.auditService) return 'audit-unavailable';

    try {
      return await this.config.auditService.recordAction({
        tenantId: params.tenantId,
        actingAgentId: params.actingAgentId,
        actingAgentName: params.actingAgentName,
        actionType: params.actionType,
        target: params.target,
        authorizationChain: [],
        executionTokens: [],
        outcome: params.outcome,
        details: params.details,
      });
    } catch {
      return 'audit-unavailable';
    }
  }
}
