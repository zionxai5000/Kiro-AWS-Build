import { describe, it, expect } from 'vitest';
import { parseAscSecret } from '../parse-asc-secret.js';

// ---------------------------------------------------------------------------
// Fake fixture mimicking the real secret structure (literal newlines in PEM)
// ---------------------------------------------------------------------------

const FAKE_SECRET = `{
  "note": "Fake Apple Account - Test Key",
  "apiKey": "-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgFAKEtestFAKE1234
5678abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX
-----END PRIVATE KEY-----",
  "keyId": "TESTKEYID01",
  "issuerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "rotationToken": null
}`;

describe('parseAscSecret', () => {
  it('parses a valid secret with all 3 fields', () => {
    const result = parseAscSecret(FAKE_SECRET);

    expect(result.apiKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    expect(result.apiKey).toMatch(/-----END PRIVATE KEY-----$/);
    expect(result.keyId).toBe('TESTKEYID01');
    expect(result.issuerId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });

  it('throws when PEM BEGIN marker is missing', () => {
    const broken = `{
  "apiKey": "not a real key",
  "keyId": "TESTKEYID01",
  "issuerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}`;
    expect(() => parseAscSecret(broken)).toThrow(/missing PEM markers/);
  });

  it('throws when keyId field is missing', () => {
    const broken = `{
  "apiKey": "-----BEGIN PRIVATE KEY-----
FAKECONTENT
-----END PRIVATE KEY-----",
  "issuerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}`;
    expect(() => parseAscSecret(broken)).toThrow(/missing keyId/);
  });

  it('throws when issuerId field is missing', () => {
    const broken = `{
  "apiKey": "-----BEGIN PRIVATE KEY-----
FAKECONTENT
-----END PRIVATE KEY-----",
  "keyId": "TESTKEYID01"
}`;
    expect(() => parseAscSecret(broken)).toThrow(/missing issuerId/);
  });
});
