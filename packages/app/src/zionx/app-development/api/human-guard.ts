/**
 * Human Origin Guard — positive identification for human-only routes.
 *
 * Requires a `principalType: 'human'` claim on the JWT token.
 * Default behavior: REJECT if the claim is missing or has any value other than 'human'.
 *
 * This is a defense-in-depth measure for routes like confirm-submit where
 * no agent at any authority level should be able to invoke the endpoint.
 *
 * SETUP REQUIRED:
 * The CognitoAuthService must include `principalType: 'human'` in the AuthUser
 * object when generating tokens for human users. This is a one-line addition
 * to the token generation logic:
 *
 *   // In CognitoAuthService.generateToken():
 *   const user: AuthUser = { userId, tenantId, role, email, principalType: 'human' };
 *
 * Agent tokens (if ever issued) must NOT include this claim, or must set it
 * to a different value (e.g., 'agent').
 *
 * The guard fails CLOSED: ambiguous tokens are rejected.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HumanGuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Extended AuthUser with optional principalType claim.
 * The base AuthUser from cognito.ts doesn't have this field yet —
 * it needs to be added when this guard is activated.
 */
export interface AuthUserWithPrincipalType {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  principalType?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Check if a request has positive proof of human origin.
 *
 * @param user - The authenticated user from the JWT token.
 * @returns HumanGuardResult with allowed=true only if principalType === 'human'.
 */
export function checkHumanOrigin(user: AuthUserWithPrincipalType | null | undefined): HumanGuardResult {
  if (!user) {
    return {
      allowed: false,
      reason: 'No authenticated user context — cannot verify human origin.',
    };
  }

  if (user.principalType === 'human') {
    return { allowed: true };
  }

  if (user.principalType === undefined || user.principalType === null) {
    return {
      allowed: false,
      reason: 'Token missing principalType claim — cannot verify human origin. Default: REJECT.',
    };
  }

  return {
    allowed: false,
    reason: `Token principalType is "${user.principalType}" — only "human" is accepted for this endpoint.`,
  };
}

/**
 * Validate that the principalType claim is well-formed.
 * Used during token generation to ensure consistency.
 */
export function isValidPrincipalType(value: unknown): value is 'human' | 'agent' | 'service' {
  return value === 'human' || value === 'agent' || value === 'service';
}
