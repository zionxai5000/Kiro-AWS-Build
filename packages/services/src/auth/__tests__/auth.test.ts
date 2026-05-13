/**
 * Unit tests for Authentication and Security Layer
 * Validates: Requirements 20.2, 20.3, 19.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CognitoAuthService } from '../cognito.js';
import { AuthMiddleware } from '../middleware.js';
import type { XOAuditService } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Helpers
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

// ---------------------------------------------------------------------------
// CognitoAuthService — backward-compatible tests
// ---------------------------------------------------------------------------

describe('CognitoAuthService', () => {
  let auth: CognitoAuthService;

  beforeEach(() => {
    auth = new CognitoAuthService();
  });

  it('should register and login a user', async () => {
    await auth.register('king@example.com', 'tenant-1', 'king');
    const result = await auth.login('king@example.com');
    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
    expect(result.user?.role).toBe('king');
  });

  it('should reject login for unknown user', async () => {
    const result = await auth.login('unknown@example.com');
    expect(result.success).toBe(false);
  });

  it('should validate a valid token', async () => {
    await auth.register('user@example.com', 'tenant-1', 'king');
    const loginResult = await auth.login('user@example.com');
    const user = await auth.validateToken(loginResult.token!.accessToken);
    expect(user).not.toBeNull();
    expect(user!.email).toBe('user@example.com');
  });

  it('should reject an invalid token', async () => {
    const user = await auth.validateToken('invalid-token');
    expect(user).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CognitoAuthService — password hashing
// ---------------------------------------------------------------------------

describe('CognitoAuthService — password hashing', () => {
  let auth: CognitoAuthService;

  beforeEach(() => {
    auth = new CognitoAuthService();
  });

  it('should register and login with a password', async () => {
    await auth.register('user@example.com', 'tenant-1', 'king', 'secret123');
    const result = await auth.login('user@example.com', 'secret123');
    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
  });

  it('should reject login with wrong password', async () => {
    await auth.register('user@example.com', 'tenant-1', 'king', 'secret123');
    const result = await auth.login('user@example.com', 'wrong-password');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials');
  });
});

// ---------------------------------------------------------------------------
// CognitoAuthService — refresh token rotation
// ---------------------------------------------------------------------------

describe('CognitoAuthService — refresh token rotation', () => {
  let auth: CognitoAuthService;

  beforeEach(() => {
    auth = new CognitoAuthService();
  });

  it('should issue new token pair on refresh', async () => {
    await auth.register('user@example.com', 'tenant-1', 'king');
    const loginResult = await auth.login('user@example.com');
    const oldRefresh = loginResult.token!.refreshToken;

    const refreshResult = await auth.refreshToken(oldRefresh);
    expect(refreshResult.success).toBe(true);
    expect(refreshResult.token).toBeDefined();
    expect(refreshResult.token!.accessToken).not.toBe(loginResult.token!.accessToken);
    expect(refreshResult.token!.refreshToken).not.toBe(oldRefresh);
  });

  it('should reject reuse of a consumed refresh token', async () => {
    await auth.register('user@example.com', 'tenant-1', 'king');
    const loginResult = await auth.login('user@example.com');
    const oldRefresh = loginResult.token!.refreshToken;

    // First use succeeds
    const first = await auth.refreshToken(oldRefresh);
    expect(first.success).toBe(true);

    // Second use fails (one-time use)
    const second = await auth.refreshToken(oldRefresh);
    expect(second.success).toBe(false);
    expect(second.error).toBe('Refresh token already used');
  });

  it('should reject an invalid refresh token', async () => {
    const result = await auth.refreshToken('nonexistent-token');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid refresh token');
  });
});

// ---------------------------------------------------------------------------
// CognitoAuthService — token revocation
// ---------------------------------------------------------------------------

describe('CognitoAuthService — token revocation', () => {
  it('should revoke an access token', async () => {
    const auth = new CognitoAuthService();
    await auth.register('user@example.com', 'tenant-1', 'king');
    const loginResult = await auth.login('user@example.com');
    const accessToken = loginResult.token!.accessToken;

    const revoked = await auth.revokeToken(accessToken);
    expect(revoked).toBe(true);

    const user = await auth.validateToken(accessToken);
    expect(user).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CognitoAuthService — configurable token expiry
// ---------------------------------------------------------------------------

describe('CognitoAuthService — configurable token expiry', () => {
  it('should use custom access token expiry', async () => {
    const auth = new CognitoAuthService({ accessTokenExpirySec: 120 });
    await auth.register('user@example.com', 'tenant-1', 'king');
    const result = await auth.login('user@example.com');
    expect(result.token!.expiresIn).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// CognitoAuthService — XO Audit logging (Req 20.3)
// ---------------------------------------------------------------------------

describe('CognitoAuthService — XO Audit logging', () => {
  let auth: CognitoAuthService;
  let auditService: XOAuditService;

  beforeEach(() => {
    auditService = createMockAuditService();
    auth = new CognitoAuthService({ auditService, tenantId: 'tenant-audit' });
  });

  it('should log failed login (user not found) to XO Audit', async () => {
    await auth.login('nobody@example.com');
    expect(auditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'auth.login.failed',
        outcome: 'failure',
        target: 'nobody@example.com',
      }),
    );
  });

  it('should log failed login (wrong password) to XO Audit', async () => {
    await auth.register('user@example.com', 'tenant-1', 'king', 'correct');
    await auth.login('user@example.com', 'wrong');
    expect(auditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'auth.login.failed',
        outcome: 'failure',
        details: expect.objectContaining({ reason: 'Invalid credentials' }),
      }),
    );
  });

  it('should log failed token validation to XO Audit', async () => {
    await auth.validateToken('bad-token');
    expect(auditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'auth.token.invalid',
        outcome: 'failure',
      }),
    );
  });

  it('should log failed refresh token to XO Audit', async () => {
    await auth.refreshToken('bad-refresh');
    expect(auditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'auth.refresh.failed',
        outcome: 'failure',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// AuthMiddleware — backward-compatible tests
// ---------------------------------------------------------------------------

describe('AuthMiddleware', () => {
  let middleware: AuthMiddleware;
  let auth: CognitoAuthService;

  beforeEach(async () => {
    auth = new CognitoAuthService();
    middleware = new AuthMiddleware(auth);
    await auth.register('user@example.com', 'tenant-1', 'king');
  });

  it('should authenticate valid Bearer token', async () => {
    const loginResult = await auth.login('user@example.com');
    const result = await middleware.authenticate(`Bearer ${loginResult.token!.accessToken}`);
    expect(result.authorized).toBe(true);
    expect(result.context?.tenantId).toBe('tenant-1');
  });

  it('should reject missing authorization header', async () => {
    const result = await middleware.authenticate(undefined);
    expect(result.authorized).toBe(false);
  });

  it('should reject invalid format', async () => {
    const result = await middleware.authenticate('Basic abc123');
    expect(result.authorized).toBe(false);
  });

  it('should reject expired/invalid token', async () => {
    const result = await middleware.authenticate('Bearer invalid-token');
    expect(result.authorized).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AuthMiddleware — config-based construction & audit logging (Req 20.3)
// ---------------------------------------------------------------------------

describe('AuthMiddleware — audit logging', () => {
  let auth: CognitoAuthService;
  let auditService: XOAuditService;
  let middleware: AuthMiddleware;

  beforeEach(async () => {
    auditService = createMockAuditService();
    auth = new CognitoAuthService();
    middleware = new AuthMiddleware({ authService: auth, auditService });
    await auth.register('user@example.com', 'tenant-1', 'king');
  });

  it('should log missing header failure to XO Audit with source and target', async () => {
    await middleware.authenticate(undefined, { source: '10.0.0.1', path: '/api/users' });
    expect(auditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'auth.request.failed',
        target: '/api/users',
        outcome: 'failure',
        details: expect.objectContaining({ source: '10.0.0.1', reason: 'Missing authorization header' }),
      }),
    );
  });

  it('should log invalid token failure to XO Audit', async () => {
    await middleware.authenticate('Bearer bad-token', { source: '10.0.0.2', path: '/api/data' });
    expect(auditService.recordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'auth.request.failed',
        target: '/api/data',
        details: expect.objectContaining({ source: '10.0.0.2', reason: 'Invalid or expired token' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// AuthMiddleware — pillar & action authorization
// ---------------------------------------------------------------------------

describe('AuthMiddleware — authorization', () => {
  let middleware: AuthMiddleware;

  beforeEach(() => {
    const auth = new CognitoAuthService();
    middleware = new AuthMiddleware(auth);
  });

  it('should allow king access to any pillar', () => {
    const ctx = { user: { userId: 'u1', tenantId: 't1', role: 'king' as const, email: 'k@e.com' }, tenantId: 't1', role: 'king' };
    expect(middleware.authorizeForPillar(ctx, 'zionx')).toBe(true);
  });

  it('should deny queen access to pillars by default', () => {
    const ctx = { user: { userId: 'u2', tenantId: 't1', role: 'queen' as const, email: 'q@e.com' }, tenantId: 't1', role: 'queen' };
    expect(middleware.authorizeForPillar(ctx, 'zionx')).toBe(false);
  });

  it('should allow king any action', () => {
    const ctx = { user: { userId: 'u1', tenantId: 't1', role: 'king' as const, email: 'k@e.com' }, tenantId: 't1', role: 'king' };
    expect(middleware.authorizeForAction(ctx, 'delete')).toBe(true);
  });

  it('should allow queen read actions', () => {
    const ctx = { user: { userId: 'u2', tenantId: 't1', role: 'queen' as const, email: 'q@e.com' }, tenantId: 't1', role: 'queen' };
    expect(middleware.authorizeForAction(ctx, 'read')).toBe(true);
    expect(middleware.authorizeForAction(ctx, 'view')).toBe(true);
  });

  it('should deny queen write actions', () => {
    const ctx = { user: { userId: 'u2', tenantId: 't1', role: 'queen' as const, email: 'q@e.com' }, tenantId: 't1', role: 'queen' };
    expect(middleware.authorizeForAction(ctx, 'delete')).toBe(false);
    expect(middleware.authorizeForAction(ctx, 'create')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CognitoAuthService — principalType claim (human-origin guard support)
// ---------------------------------------------------------------------------

describe('CognitoAuthService — principalType claim', () => {
  let auth: CognitoAuthService;

  beforeEach(() => {
    auth = new CognitoAuthService();
  });

  it('should include principalType: "human" in validated token user', async () => {
    await auth.register('king@example.com', 'tenant-1', 'king');
    const loginResult = await auth.login('king@example.com');
    const user = await auth.validateToken(loginResult.token!.accessToken);
    expect(user).not.toBeNull();
    expect(user!.principalType).toBe('human');
  });

  it('should include principalType: "human" after token refresh', async () => {
    await auth.register('king@example.com', 'tenant-1', 'king');
    const loginResult = await auth.login('king@example.com');
    const refreshResult = await auth.refreshToken(loginResult.token!.refreshToken);
    expect(refreshResult.success).toBe(true);
    const user = await auth.validateToken(refreshResult.token!.accessToken);
    expect(user).not.toBeNull();
    expect(user!.principalType).toBe('human');
  });
});
