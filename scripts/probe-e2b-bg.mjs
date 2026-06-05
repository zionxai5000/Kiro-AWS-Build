import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Sandbox } from 'e2b';

const sm = new SecretsManagerClient({ region: 'us-east-1' });
const r = await sm.send(new GetSecretValueCommand({ SecretId: 'seraphim/e2b' }));
const apiKey = JSON.parse(r.SecretString).apiKey;

const sbx = await Sandbox.create('base', { apiKey, timeoutMs: 120_000 });
console.log('sandbox:', sbx.sandboxId);

const cmds = sbx.commands;
console.log('commands methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(cmds)));

// Try running with background:true
console.log('trying background run…');
try {
  const handle = await cmds.run('python3 -m http.server 8081', { cwd: '/tmp', background: true });
  console.log('background handle:', typeof handle, Object.keys(handle ?? {}).slice(0, 10));
  await new Promise(r => setTimeout(r, 1500));
  const probe = await cmds.run('curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/');
  console.log('curl exit:', probe.exitCode, 'stdout:', probe.stdout.trim());
} catch (e) {
  console.log('background failed:', e.message);
}
await sbx.kill();
