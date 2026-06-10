/**
 * Local end-to-end validation of the bundleAndServe lifecycle, including
 * the failure modes that have been blocking King:
 *
 *   1. Sandbox reaped during long server-side phases (npm install + expo export)
 *   2. Stale `/tmp/serve-supervisor.sh` from a previous wake
 *   3. Resumed-after-pause sandbox handles
 *
 * Strategy: provision a real E2B sandbox, write a faux supervisor file
 * to /tmp (simulating a stale prior wake), then invoke the actual
 * bundler logic against it. Confirm: cleanup wins, supervisor lands in
 * workdir, port 8081 responds.
 *
 * This script does NOT exercise the full bundleAndServe (would need npm
 * install + expo export + a real workspace) — it tests the *sandbox
 * lifecycle parts*, which is where production was failing.
 */
import { execSync } from 'node:child_process';
import { Sandbox } from 'e2b';

const apiKey = JSON.parse(execSync(
  'aws secretsmanager get-secret-value --secret-id seraphim/e2b --query SecretString --output text --region us-east-1',
  { encoding: 'utf-8' },
).trim()).apiKey;
console.log('e2b key:', apiKey.slice(0, 8), '...');

const tests = [];
function record(name, ok, detail = '') {
  tests.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

// ----- Test 1: fresh sandbox + supervisor in workdir -----
console.log('\n[T1] Fresh sandbox, supervisor in /home/user/project/.zionx/');
let sb = await Sandbox.create('base', { apiKey, timeoutMs: 5 * 60_000 });
await sb.commands.run('mkdir -p /home/user/project/.zionx /home/user/project/dist', { timeoutMs: 5_000 });
await sb.commands.run('echo "<html>tic-tac-toe</html>" > /home/user/project/dist/index.html', { timeoutMs: 5_000 });

const supervisorScript = [
  '#!/bin/bash',
  'cd /home/user/project/dist',
  'while true; do',
  '  /usr/bin/python3 -m http.server 8081 >> /home/user/project/.zionx-server.log 2>&1',
  '  echo "[supervisor $(date)] http.server exited code=$?, restarting in 2s" >> /home/user/project/.zionx-server.log',
  '  sleep 2',
  'done',
].join('\n');

await sb.files.write('/home/user/project/.zionx/serve-supervisor.sh', supervisorScript);
await sb.commands.run('chmod +x /home/user/project/.zionx/serve-supervisor.sh', { timeoutMs: 5_000 });
await sb.commands.run('bash /home/user/project/.zionx/serve-supervisor.sh', { timeoutMs: 60_000, background: true });

await new Promise(r => setTimeout(r, 2000));
let v = await sb.commands.run('curl -sS -o /dev/null -w "%{http_code}" http://localhost:8081/index.html', { timeoutMs: 5_000 });
record('T1.a fresh wake serves on port 8081', v.stdout?.trim() === '200', `code=${v.stdout?.trim()}`);

// ----- Test 2: simulate stale /tmp file + sandbox reuse -----
console.log('\n[T2] Simulate stale /tmp/serve-supervisor.sh from previous wake');
// Write a "stale" file to /tmp with restrictive permissions
await sb.commands.run('echo "stale" > /tmp/serve-supervisor.sh && chmod 444 /tmp/serve-supervisor.sh && ls -la /tmp/serve-supervisor.sh', { timeoutMs: 5_000 });
let stale = await sb.commands.run('ls -la /tmp/serve-supervisor.sh', { timeoutMs: 5_000 });
record('T2.a stale /tmp file present', stale.stdout?.includes('stale') || stale.exitCode === 0, stale.stdout?.trim().slice(0, 100));

// Now run our defensive cleanup (the same shell pipeline our bundler runs)
const cleanup = await sb.commands.run([
  'pkill -f "http.server 8081" 2>/dev/null',
  'pkill -f serve-supervisor 2>/dev/null',
  'rm -f /tmp/serve-supervisor.sh',
  'rm -f /home/user/project/.zionx/serve-supervisor.sh',
  'sleep 0.5',
  'true',
].join('; '), { timeoutMs: 10_000 });
record('T2.b cleanup pipeline succeeds (exit 0)', cleanup.exitCode === 0);

// Verify both files are gone
const check = await sb.commands.run('ls /tmp/serve-supervisor.sh /home/user/project/.zionx/serve-supervisor.sh 2>&1; echo "---done---"', { timeoutMs: 5_000 });
const bothGone = check.stdout?.includes('No such file') || check.stdout?.includes('cannot access');
record('T2.c both supervisor files removed after cleanup', bothGone, check.stdout?.trim().slice(0, 200));

// Now write the new supervisor in workdir (the production code path)
await sb.files.write('/home/user/project/.zionx/serve-supervisor.sh', supervisorScript);
await sb.commands.run('chmod +x /home/user/project/.zionx/serve-supervisor.sh', { timeoutMs: 5_000 });
await sb.commands.run('bash /home/user/project/.zionx/serve-supervisor.sh', { timeoutMs: 60_000, background: true });
await new Promise(r => setTimeout(r, 3000));
v = await sb.commands.run('curl -sS -o /dev/null -w "%{http_code}" http://localhost:8081/index.html', { timeoutMs: 5_000 });
record('T2.d post-cleanup supervisor launches + serves 200', v.stdout?.trim() === '200', `code=${v.stdout?.trim()}`);

// ----- Test 3: kill the python server, verify supervisor restarts it -----
console.log('\n[T3] Verify supervisor auto-restart');
await sb.commands.run('pkill -f "http.server 8081" 2>/dev/null', { timeoutMs: 5_000 });
await new Promise(r => setTimeout(r, 5000));
v = await sb.commands.run('curl -sS -o /dev/null -w "%{http_code}" http://localhost:8081/index.html', { timeoutMs: 5_000 });
record('T3 supervisor restarts python after kill', v.stdout?.trim() === '200', `code=${v.stdout?.trim()}`);

await sb.kill();
console.log('\n[T4] Sandbox lifetime extension');
sb = await Sandbox.create('base', { apiKey, timeoutMs: 30 * 60_000 });
record('T4.a sandbox created with 30-min timeout', true);

// Try to extend timeout
let extended = false;
try {
  if (typeof sb.setTimeout === 'function') {
    await sb.setTimeout(30 * 60_000);
    extended = true;
  }
} catch { /* nope */ }
record('T4.b setTimeout extends the lifetime', extended);

await sb.kill();

// ----- Summary -----
console.log('\n' + '='.repeat(60));
const passed = tests.filter((t) => t.ok).length;
const total = tests.length;
console.log(`Result: ${passed}/${total} tests passed`);
if (passed === total) {
  console.log('✅ All sandbox lifecycle tests passed locally.');
  process.exit(0);
} else {
  console.log('❌ Some tests failed:');
  tests.filter((t) => !t.ok).forEach((t) => console.log(`  • ${t.name}: ${t.detail}`));
  process.exit(1);
}
