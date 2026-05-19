/**
 * App Store Connect JWT Signing
 *
 * Signs JWTs for authenticating with Apple's App Store Connect API.
 * Uses ES256 (P-256 + SHA-256) with ieee-p1363 signature encoding.
 *
 * Apple requirements:
 * - Algorithm: ES256
 * - Max validity: 20 minutes (1200 seconds)
 * - Audience: "appstoreconnect-v1"
 * - Key type: EC P-256 (.p8 format)
 */

import { createSign, createPrivateKey } from 'node:crypto';

// ---------------------------------------------------------------------------
// Base64URL Encoding
// ---------------------------------------------------------------------------

/**
 * Encode a string or Buffer to base64url (no padding, URL-safe chars).
 */
function base64urlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// JWT Signing
// ---------------------------------------------------------------------------

/**
 * Sign a JWT for App Store Connect API authentication.
 *
 * @param keyId - The 10-character Key ID from App Store Connect
 * @param issuerId - The UUID Issuer ID from App Store Connect
 * @param privateKeyPem - The .p8 private key content (PEM format, EC P-256)
 * @returns Signed JWT string (valid for 20 minutes)
 * @throws If the key is malformed or not EC P-256
 */
export function signAscJwt(
  keyId: string,
  issuerId: string,
  privateKeyPem: string,
): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 1200,
    aud: 'appstoreconnect-v1',
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = createPrivateKey({ key: privateKeyPem, format: 'pem' });
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();

  // Apple requires ieee-p1363 (raw r||s, 64 bytes), NOT DER encoding
  const signature = signer.sign({ key, dsaEncoding: 'ieee-p1363' });
  const signatureB64 = base64urlEncode(signature);

  return `${signingInput}.${signatureB64}`;
}
