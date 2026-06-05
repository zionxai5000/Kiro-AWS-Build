/**
 * Salvage and rewrite the seraphim/e2b secret.
 *
 * The current value is a corrupted JSON-ish string from PowerShell quote
 * mangling. We extract the real e2b_... key with a regex, validate it,
 * then PUT a clean JSON value via the AWS SDK (which doesn't go through
 * any shell quoting).
 */

import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

const got = await client.send(new GetSecretValueCommand({ SecretId: 'seraphim/e2b' }));
const raw = got.SecretString ?? '';
console.log(`current length: ${raw.length}`);

// Extract any e2b_<hex> token from the raw blob.
const match = raw.match(/e2b_[a-fA-F0-9]+/);
if (!match) {
  console.error('No e2b_<hex> pattern found in secret.');
  console.error('Raw first 30: ' + JSON.stringify(raw.slice(0, 30)));
  process.exit(1);
}
const key = match[0];
console.log(`extracted key (masked): ${key.slice(0, 4)}...${key.slice(-4)} (length ${key.length})`);

// Replace with clean JSON.
const cleanValue = JSON.stringify({ apiKey: key });

const put = await client.send(new PutSecretValueCommand({
  SecretId: 'seraphim/e2b',
  SecretString: cleanValue,
}));
console.log(`wrote new version: ${put.VersionId}`);

// Verify by reading back.
const verify = await client.send(new GetSecretValueCommand({ SecretId: 'seraphim/e2b' }));
const parsed = JSON.parse(verify.SecretString ?? '');
console.log(`verified: apiKey field present, length ${parsed.apiKey?.length}, prefix ${JSON.stringify(parsed.apiKey?.slice(0, 4))}`);
