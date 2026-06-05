/**
 * E2B SDK smoke test — resolves the secret via the AWS SDK (not PowerShell),
 * creates a sandbox, runs a tiny command, kills it. Confirms the SDK works
 * with our key WITHOUT leaking the key into any shell output.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Sandbox } from 'e2b';

const client = new SecretsManagerClient({ region: 'us-east-1' });
const resp = await client.send(new GetSecretValueCommand({ SecretId: 'seraphim/e2b' }));
if (!resp.SecretString) { console.error('no secret'); process.exit(1); }

let apiKey;
const raw = resp.SecretString;

// Robust parser — the secret may be:
//   1. JSON: {"apiKey":"e2b_..."}
//   2. Stringified JSON: "{\"apiKey\":\"e2b_...\"}" (powershell shell-quoting can produce this)
//   3. Raw string: e2b_...
function tryParse(s) {
  for (let i = 0; i < 3; i++) {
    if (typeof s !== 'string') return s;
    if (!s.trim().startsWith('{') && !s.trim().startsWith('"')) return s;
    try { s = JSON.parse(s); }
    catch { return s; }
  }
  return s;
}
const decoded = tryParse(raw);
if (typeof decoded === 'string') {
  apiKey = decoded.trim();
} else if (decoded && typeof decoded === 'object') {
  apiKey = decoded.apiKey ?? decoded['api-key'] ?? decoded.E2B_API_KEY;
}
if (!apiKey || typeof apiKey !== 'string') {
  console.error('[smoke] could not extract apiKey from secret. Inspect the secret manually.');
  process.exit(1);
}
apiKey = apiKey.trim();

const masked = apiKey.slice(0, 4) + '...' + apiKey.slice(-4);
console.log(`[smoke] resolved key (masked): ${masked}, length=${apiKey.length}`);

if (apiKey.startsWith('REPLACE_ME')) {
  console.error('[smoke] still a placeholder — bail');
  process.exit(1);
}
if (!apiKey.startsWith('e2b_')) {
  console.error(`[smoke] key doesn't start with e2b_ prefix — wrong format`);
  process.exit(1);
}

console.log('[smoke] creating sandbox…');
const start = Date.now();
const sbx = await Sandbox.create({ apiKey, timeoutMs: 60_000 });
console.log(`[smoke] sandbox created: ${sbx.sandboxId} (${Date.now() - start}ms)`);

console.log('[smoke] running: echo "hello from e2b"');
const echo = await sbx.commands.run('echo "hello from e2b"');
console.log(`[smoke] echo stdout: ${echo.stdout.trim()}`);
console.log(`[smoke] echo exitCode: ${echo.exitCode}`);

console.log('[smoke] writing /tmp/test.txt');
await sbx.files.write('/tmp/test.txt', 'this is a test\n');

console.log('[smoke] reading /tmp/test.txt');
const content = await sbx.files.read('/tmp/test.txt');
console.log(`[smoke] file content: ${content.trim()}`);

console.log('[smoke] node version inside sandbox:');
const nv = await sbx.commands.run('node --version');
console.log(`[smoke]   ${nv.stdout.trim()}`);

console.log('[smoke] killing sandbox');
await sbx.kill();
console.log(`[smoke] DONE (${Date.now() - start}ms total)`);
