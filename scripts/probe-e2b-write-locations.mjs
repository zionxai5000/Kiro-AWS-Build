/**
 * Quick local check: spin up a fresh E2B sandbox and probe which paths
 * are writable. This is to confirm the fix for the "/tmp permission
 * denied" error before deploying.
 */
import { Sandbox } from 'e2b';

const apiKeyJson = await fetch(
  'https://secretsmanager.us-east-1.amazonaws.com/',
  // The aws-sdk dependency in scripts/* is heavy; resolve via aws cli instead.
).catch(() => null);

// Use child_process to call aws cli for the secret (lightest path).
import { execSync } from 'node:child_process';
const raw = execSync(
  'aws secretsmanager get-secret-value --secret-id seraphim/e2b --query SecretString --output text --region us-east-1',
  { encoding: 'utf-8' },
).trim();
const apiKey = JSON.parse(raw).apiKey;
console.log('e2b key:', apiKey.slice(0, 8), '...');

const sb = await Sandbox.create('base', { apiKey, timeoutMs: 5 * 60_000 });
console.log('sandbox up');

// Probe each location with `sandbox.files.write` (the SDK-level call
// my bundler uses) AND with shell commands.
const locations = [
  '/tmp/zionx-test.txt',
  '/home/user/project/.zionx/test.txt',
  '/home/user/test.txt',
];

await sb.commands.run('mkdir -p /home/user/project/.zionx', { timeoutMs: 5_000 });

for (const path of locations) {
  console.log(`\n--- ${path} ---`);
  // Try SDK files.write
  try {
    await sb.files.write(path, 'hello\n');
    console.log('  files.write: OK');
  } catch (e) {
    console.log('  files.write FAILED:', e.message.slice(0, 200));
  }
  // Try shell write
  const sh = await sb.commands.run(`echo shell > ${path}`, { timeoutMs: 5_000 });
  console.log(`  shell write: exit=${sh.exitCode} stderr=${sh.stderr?.trim() ?? ''}`);
  // Read back
  const cat = await sb.commands.run(`cat ${path} 2>&1; ls -la ${path}`, { timeoutMs: 5_000 });
  console.log(`  cat+ls: ${cat.stdout?.trim().slice(0, 200)}`);
}

// Now test: can we run a python http.server from a script in workdir?
console.log('\n--- supervisor launch test ---');
const supervisorScript = [
  '#!/bin/bash',
  'cd /home/user/project',
  'mkdir -p dist',
  'echo "<html>hello world</html>" > dist/index.html',
  'cd dist',
  '/usr/bin/python3 -m http.server 8081 > /home/user/project/.zionx/server.log 2>&1 &',
  'echo "started_pid=$!"',
  'sleep 1',
  'pgrep -f "http.server 8081" | head',
].join('\n');

await sb.files.write('/home/user/project/.zionx/test-supervisor.sh', supervisorScript);
await sb.commands.run('chmod +x /home/user/project/.zionx/test-supervisor.sh', { timeoutMs: 5_000 });
const launchResult = await sb.commands.run('bash /home/user/project/.zionx/test-supervisor.sh', { timeoutMs: 10_000 });
console.log('launch stdout:', launchResult.stdout);
console.log('launch stderr:', launchResult.stderr);
console.log('launch exit:', launchResult.exitCode);

// Sleep a moment and verify port 8081
await new Promise(r => setTimeout(r, 2000));
const verify = await sb.commands.run('curl -sS -o /dev/null -w "%{http_code}\\n" http://localhost:8081/index.html', { timeoutMs: 5_000 });
console.log('curl localhost:8081:', verify.stdout?.trim(), 'exit=', verify.exitCode);

await sb.kill();
console.log('\nDone');
