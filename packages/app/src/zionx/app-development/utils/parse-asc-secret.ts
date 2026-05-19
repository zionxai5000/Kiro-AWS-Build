/**
 * Apple App Store Connect API credentials.
 */
export interface AppleConnectCredentials {
  /** Full PEM block including -----BEGIN/END----- markers. */
  apiKey: string;
  /** Short ASC API key ID (e.g. "W82JQ7NLX7"). */
  keyId: string;
  /** UUID issuer ID for the ASC API key. */
  issuerId: string;
}

/**
 * Parse the seraphim/appstoreconnect AWS Secret value.
 *
 * The stored secret is JSON-like but contains literal
 * newlines inside the apiKey string value, which makes
 * strict JSON.parse fail. This function uses positional
 * marker extraction (PEM block) and field-level regex
 * (keyId, issuerId) to pull out the three fields.
 *
 * @param secretString Raw SecretString from AWS Secrets Manager
 * @throws Error with field-specific message if any field is
 *   missing or malformed
 */
export function parseAscSecret(secretString: string): AppleConnectCredentials {
  // PEM block extraction
  const beginMarker = '-----BEGIN PRIVATE KEY-----';
  const endMarker = '-----END PRIVATE KEY-----';
  const startIdx = secretString.indexOf(beginMarker);
  const endIdx = secretString.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      'parseAscSecret: missing PEM markers (-----BEGIN/END PRIVATE KEY-----) in secret value',
    );
  }
  const apiKey = secretString.slice(startIdx, endIdx + endMarker.length);

  // keyId extraction
  const keyIdMatch = secretString.match(/"keyId"\s*:\s*"([^"]+)"/);
  if (!keyIdMatch) {
    throw new Error('parseAscSecret: missing keyId field in secret value');
  }
  const keyId = keyIdMatch[1]!;

  // issuerId extraction
  const issuerIdMatch = secretString.match(/"issuerId"\s*:\s*"([^"]+)"/);
  if (!issuerIdMatch) {
    throw new Error('parseAscSecret: missing issuerId field in secret value');
  }
  const issuerId = issuerIdMatch[1]!;

  return { apiKey, keyId, issuerId };
}
