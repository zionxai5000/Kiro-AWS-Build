/**
 * Authentication — API Middleware
 *
 * API Gateway authorizer that validates JWT, extracts tenant context,
 * and passes to downstream services. Logs all authentication and
 * authorization failures to XO Audit with source, target, and failure reason.
 *
 * Requirements: 20.2, 20.3
 */

import type { XOAuditService } from '@seraphim/core';
import type { CognitoAuthService, AuthUser } from './cognito.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthContext {
  user: AuthUser;
  tenantId: string;
  role: string;
}

export interface MiddlewareResult {
  authorized: boolean;
  context?: AuthContext;
  error?: string;
}

export interface AuthMiddlewareConfig {
  authService: CognitoAuthService;
  auditService?: XOAuditService;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class AuthMiddleware {
  private readonly authService: CognitoAuthService;
  private readonly auditService?: XOAuditService;

  constructor(authServiceOrConfig: CognitoAuthService | AuthMiddlewareConfig) {
    if ('authService' in authServiceOrConfig) {
      this.authService = authServiceOrConfig.authService;
      this.auditService = authServiceOrConfig.auditService;
    } else {
      this.authService = authServiceOrConfig;
    }
  }

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  async authenticate(
    authHeader?: string,
    requestMeta?: { source?: string; path?: string },
  ): Promise<MiddlewareResult> {
    const source = requestMeta?.source ?? 'unknown';
    const target = requestMeta?.path ?? 'unknown';

    if (!authHeader) {
      const error = 'Missing authorization header';
      await this.logAuthFailure(source, target, error);
      return { authorized: false, error };
    }

    const parts = authHeader.split(' ');
    if (parts[0] !== 'Bearer' || !parts[1]) {
      const error = 'Invalid authorization format';
      await this.logAuthFailure(source, target, error);
      return { authorized: false, error };
    }

    const user = await this.authService.validateToken(parts[1]);
    if (!user) {
      const error = 'Invalid or expired token';
      await this.logAuthFailure(source, target, error);
      return { authorized: false, error };
    }

    return {
      authorized: true,
      context: { user, tenantId: user.tenantId, role: user.role },
    };
  }

  // -----------------------------------------------------------------------
  // Authorization — Pillar-level
  // -----------------------------------------------------------------------

  /**
   * Check whether the authenticated user's role allows access to a pillar.
   * Kings have access to all pillars; Queens have scoped access.
   */
  authorizeForPillar(authContext: AuthContext, pillar: string): boolean {
    if (authContext.role === 'king') return true;

    // Queens do not have blanket pillar access — deny by default.
    // In a full implementation this would check a pillar-access list.
    return false;
  }

  // -----------------------------------------------------------------------
  // Authorization — Action-level
  // -----------------------------------------------------------------------

  /**
   * Check whether the authenticated user's role allows a specific action.
   * Kings can perform any action; Queens are restricted to read-only actions.
   */
  authorizeForAction(authContext: AuthContext, action: string): boolean {
    if (authContext.role === 'king') return true;

    // Queens may only perform read actions
    const readActions = ['read', 'view', 'list', 'get', 'query'];
    return readActions.some((ra) => action.toLowerCase().includes(ra));
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  /**
   * Log an authentication/authorization failure to XO Audit.
   * Silently skips if no auditService is configured.
   */
  private async logAuthFailure(
    source: string,
    target: string,
    reason: string,
  ): Promise<void> {
    if (!this.auditService) return;

    try {
      await this.auditService.recordAction({
        tenantId: 'system',
        actingAgentId: 'auth-middleware',
        actingAgentName: 'AuthMiddleware',
        actionType: 'auth.request.failed',
        target,
        authorizationChain: [],
        executionTokens: [],
        outcome: 'failure',
        details: { source, reason },
      });
    } catch {
      // Audit logging failure should not break the auth flow
    }
  }
}
