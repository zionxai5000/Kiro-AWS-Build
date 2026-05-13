import { describe, it, expect } from 'vitest';
import { checkHumanOrigin, isValidPrincipalType } from '../human-guard.js';

describe('checkHumanOrigin', () => {
  it('allows when principalType is "human"', () => {
    const result = checkHumanOrigin({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'king',
      email: 'king@example.com',
      principalType: 'human',
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('rejects when principalType is "agent"', () => {
    const result = checkHumanOrigin({
      userId: 'agent-1',
      tenantId: 'tenant-1',
      role: 'king',
      email: 'agent@system',
      principalType: 'agent',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('only "human" is accepted');
  });

  it('rejects when principalType is missing (fails closed)', () => {
    const result = checkHumanOrigin({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'king',
      email: 'king@example.com',
      // principalType intentionally omitted
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('missing principalType');
  });

  it('rejects when principalType is undefined explicitly', () => {
    const result = checkHumanOrigin({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'king',
      email: 'king@example.com',
      principalType: undefined,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('missing principalType');
  });

  it('rejects when user is null', () => {
    const result = checkHumanOrigin(null);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No authenticated user context');
  });

  it('rejects when user is undefined', () => {
    const result = checkHumanOrigin(undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No authenticated user context');
  });

  it('rejects unknown principalType values', () => {
    const result = checkHumanOrigin({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'king',
      email: 'king@example.com',
      principalType: 'bot',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('"bot"');
  });
});

describe('isValidPrincipalType', () => {
  it('accepts "human"', () => {
    expect(isValidPrincipalType('human')).toBe(true);
  });

  it('accepts "agent"', () => {
    expect(isValidPrincipalType('agent')).toBe(true);
  });

  it('accepts "service"', () => {
    expect(isValidPrincipalType('service')).toBe(true);
  });

  it('rejects other strings', () => {
    expect(isValidPrincipalType('bot')).toBe(false);
    expect(isValidPrincipalType('')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isValidPrincipalType(null)).toBe(false);
    expect(isValidPrincipalType(undefined)).toBe(false);
    expect(isValidPrincipalType(42)).toBe(false);
  });
});
