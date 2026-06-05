/**
 * Probe E2B template compatibility — try several common template ids
 * to find one that works with our API key + team.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Sandbox } from 'e2b';

const sm = new SecretsManagerClient({ region: 'us-east-1' });
const r = await sm.send(new GetSecretValueCommand({ SecretId: 'seraphim/e2b' }));
const apiKey = JSON.parse(r.SecretString).apiKey;

const candidates = [
  undefined,                  // no template — uses default
  'base',                     // common minimal template
  'code-interpreter',         // last attempt
];

for (const template of candidates) {
  const label = template ?? '(default)';
  process.stdout.write(`[probe] template=${label}: `);
  try {
    const sbx = template
      ? await Sandbox.create(template, { apiKey, timeoutMs: 60_000 })
      : await Sandbox.create({ apiKey, timeoutMs: 60_000 });
    const res = await sbx.commands.run('echo ok && node --version');
    console.log(`OK exit=${res.exitCode} stdout="${res.stdout.trim().replace(/\n/g, ' | ')}"`);
    await sbx.kill();
  } catch (err) {
    console.log(`FAIL ${err.message}`);
  }
}
