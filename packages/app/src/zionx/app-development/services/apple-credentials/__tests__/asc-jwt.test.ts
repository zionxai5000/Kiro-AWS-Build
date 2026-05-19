/**
 * asc-jwt — Unit Tests
 *
 * Tests JWT signing for App Store Connect API.
 * Uses a real P-256 test key generated in setup (never committed).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { signAscJwt } from '../asc-jwt.js';

// ---------------------------------------------------------------------------
// Test Key (generated fresh per test run, never persisted)
// ---------------------------------------------------------------------------

const { privateKey: testKeyObject } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
const testKeyPem = testKeyObject.export({ type: 'pkcs8', format: 'pem' }) as string;
const testKeyId = 'ABC1234567';
const testIssuerId = '12345678-1234-1234-1234-123456789012';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64urlDecode(str: string): Buffer {
  // Restore base64 padding and standard chars
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';
  return Buffer.from(base64, 'base64');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('signAscJwt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces a JWT with 3 dot-separated base64url segments', () => {
    const jwt = signAscJwt(testKeyId, testIssuerId, testKeyPem);

    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);

    // Each part should be valid base64url (no +, no /, no =)
    for (const part of parts) {
      expect(part).not.toMatch(/[+/=]/);
      expect(part.length).toBeGreaterThan(0);
    }
  });

  it('header contains alg=ES256, kid=keyId, typ=JWT', () => {
    const jwt = signAscJwt(testKeyId, testIssuerId, testKeyPem);
    const [headerB64] = jwt.split('.');
    const header = JSON.parse(base64urlDecode(headerB64!).toString('utf-8'));

    expect(header.alg).toBe('ES256');
    expect(header.kid).toBe(testKeyId);
    expect(header.typ).toBe('JWT');
  });

  it('payload contains iss, iat, exp=iat+1200, aud=appstoreconnect-v1', () => {
    const jwt = signAscJwt(testKeyId, testIssuerId, testKeyPem);
    const [, payloadB64] = jwt.split('.');
    const payload = JSON.parse(base64urlDecode(payloadB64!).toString('utf-8'));

    expect(payload.iss).toBe(testIssuerId);
    expect(payload.aud).toBe('appstoreconnect-v1');
    expect(payload.exp).toBe(payload.iat + 1200);
    // iat should be the mocked time
    expect(payload.iat).toBe(Math.floor(new Date('2026-05-19T12:00:00Z').getTime() / 1000));
  });

  it('signature is exactly 64 bytes (ieee-p1363 format)', () => {
    const jwt = signAscJwt(testKeyId, testIssuerId, testKeyPem);
    const [, , signatureB64] = jwt.split('.');
    const signature = base64urlDecode(signatureB64!);

    // ieee-p1363 for P-256: r (32 bytes) || s (32 bytes) = 64 bytes
    expect(signature.length).toBe(64);
  });

  it('produces different signatures for same inputs (ECDSA non-determinism)', () => {
    // Use real timers for this test — we need two calls at the same timestamp
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T12:00:00Z'));

    const jwt1 = signAscJwt(testKeyId, testIssuerId, testKeyPem);
    const jwt2 = signAscJwt(testKeyId, testIssuerId, testKeyPem);

    // Headers and payloads should be identical (same timestamp)
    const [h1, p1] = jwt1.split('.');
    const [h2, p2] = jwt2.split('.');
    expect(h1).toBe(h2);
    expect(p1).toBe(p2);

    // Signatures should differ (ECDSA uses random k)
    const [, , s1] = jwt1.split('.');
    const [, , s2] = jwt2.split('.');
    expect(s1).not.toBe(s2);
  });

  it('throws on malformed key', () => {
    expect(() => signAscJwt(testKeyId, testIssuerId, 'not a real key')).toThrow();
  });
});
