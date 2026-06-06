/**
 * Set a GitHub Actions repo secret. One-shot tool.
 *
 * Reads the GitHub PAT and the secret value from AWS Secrets Manager,
 * encrypts the value with the repo's libsodium public key, and PUTs it
 * via the GitHub REST API.
 *
 * Usage:  node scripts/set-github-actions-secret.mjs <REPO_SECRET_NAME> <SECRETS_MANAGER_ID> [json-key]
 * Example: node scripts/set-github-actions-secret.mjs ANTHROPIC_API_KEY seraphim/anthropic api-key
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import sodium from 'libsodium-wrappers';

const [, , secretName, smId, jsonKey] = process.argv;
if (!secretName || !smId) {
  console.error('Usage: node scripts/set-github-actions-secret.mjs <REPO_SECRET_NAME> <SECRETS_MANAGER_ID> [json-key]');
  process.exit(1);
}

const REPO = 'zionxai5000/Kiro-AWS-Build';
const sm = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecretValue(id, key) {
  const r = await sm.send(new GetSecretValueCommand({ SecretId: id }));
  if (!r.SecretString) throw new Error(`empty secret ${id}`);
  if (key) {
    try { return JSON.parse(r.SecretString)[key] ?? r.SecretString; } catch { return r.SecretString; }
  }
  try {
    const j = JSON.parse(r.SecretString);
    return j.token ?? j.apiKey ?? j['api-key'] ?? Object.values(j)[0];
  } catch {
    return r.SecretString;
  }
}

const ghToken = await getSecretValue('seraphim/github-token');
const value = await getSecretValue(smId, jsonKey);
if (!value || typeof value !== 'string') throw new Error(`could not extract value from ${smId}`);
console.log(`[gh-secret] secret=${secretName} value=${value.slice(0, 4)}...${value.slice(-4)} (len=${value.length})`);

const headers = {
  Authorization: `token ${ghToken.trim()}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'kiro-set-actions-secret',
};

// 1. fetch the repo's public key
const pkResp = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, { headers });
if (!pkResp.ok) throw new Error(`public-key fetch failed: ${pkResp.status} ${await pkResp.text()}`);
const pk = await pkResp.json();
console.log(`[gh-secret] repo public key id=${pk.key_id}`);

// 2. encrypt the value with libsodium-sealed-box
await sodium.ready;
const keyBytes = sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL);
const messageBytes = sodium.from_string(value);
const encrypted = sodium.crypto_box_seal(messageBytes, keyBytes);
const encryptedB64 = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);

// 3. PUT to /actions/secrets/<name>
const putResp = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/${secretName}`, {
  method: 'PUT',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ encrypted_value: encryptedB64, key_id: pk.key_id }),
});
if (!putResp.ok) {
  const body = await putResp.text();
  throw new Error(`put-secret failed: ${putResp.status} ${body}`);
}
console.log(`[gh-secret] ${secretName} set successfully (HTTP ${putResp.status})`);

// 4. verify by listing
const listResp = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets`, { headers });
const list = await listResp.json();
const exists = list.secrets?.find((s) => s.name === secretName);
if (exists) {
  console.log(`[gh-secret] verified — ${secretName} updated_at=${exists.updated_at}`);
} else {
  console.warn(`[gh-secret] WARNING — ${secretName} not in list (caching?)`);
}
