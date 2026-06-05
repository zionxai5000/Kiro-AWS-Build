/**
 * Phase 11.4 — iteration probe.
 *
 * Plan:
 *   1. Generate the habit tracker (same as 11.3).
 *   2. Snapshot the file size + a few key strings.
 *   3. Run the agent loop AGAIN with a tweak prompt: "make the streaks gold"
 *      with edit_file. Verify:
 *        a) the agent uses read_file before edit_file (read-before-write)
 *        b) only the relevant fragment changed (file size delta < 3 KB)
 *        c) the new content contains a gold color reference (#FFD700 or `gold`)
 *   4. Push the iterated file to a sandbox + screenshot it post-tweak.
 *
 * Cost: ~$0.30 LLM (two short loops, no reviewers).
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { agentLoop } from '../packages/app/dist/zionx/app-development/agent/index.js';
import { E2BSandboxClient } from '../packages/app/dist/zionx/app-development/services/sandbox-client.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const OUT_DIR = join(process.cwd(), 'scripts', 'harness-iterate-output');
await mkdir(OUT_DIR, { recursive: true });

const sm = new SecretsManagerClient({ region: 'us-east-1' });
async function getKey(id) {
  const r = await sm.send(new GetSecretValueCommand({ SecretId: id }));
  try { return JSON.parse(r.SecretString).apiKey ?? r.SecretString; } catch { return r.SecretString; }
}

class MemoryWorkspace {
  files = new Map();
  async readFile(_p, path) {
    const v = this.files.get(path);
    if (v === undefined) throw new Error(`ENOENT ${path}`);
    return v;
  }
  async writeFile(_p, path, content) { this.files.set(path, content); }
  async listFiles(_p) { return [...this.files.keys()].sort(); }
  async exists(_p, path) { return this.files.has(path); }
  async delete(_p, path) { this.files.delete(path); }
}

const anthropicKey = await getKey('seraphim/anthropic');
const e2bKey = await getKey('seraphim/e2b');
console.log(`[iter] anthropic=${anthropicKey.slice(0, 4)}...${anthropicKey.slice(-4)}`);
console.log(`[iter] e2b=${e2bKey.slice(0, 4)}...${e2bKey.slice(-4)}\n`);

const sandbox = new E2BSandboxClient({ getApiKey: async () => e2bKey });
const ws = new MemoryWorkspace();
const projectId = 'iter-' + Date.now().toString(36);

const t0 = Date.now();

// =========================================================================
// PASS 1 — initial generation (compact, no reviewers).
// =========================================================================
console.log('[iter] PASS 1 — initial generation');

const toolCalls1 = [];
await agentLoop(
  {
    prompt:
      'TASK: write ONE file at path `index.html` using the `write_file` tool. ' +
      'Do NOT use load_skill, list_files, or run_command — just call write_file ONCE.\n\n' +
      'Content: a complete self-contained habit tracker.\n' +
      '1. Three seeded habits in localStorage `habits-v1`: water 💧 streak 3, walk 👟 streak 7, read 📚 streak 2.\n' +
      '2. Dark gradient background (#0E1424 → #1B2138). White text. Periwinkle accent #7C83FF.\n' +
      '3. Streak count rendered with a 🔥 emoji prefix and class `streak`.\n' +
      '4. Click a card → toggle doneToday + persist to localStorage.\n' +
      '5. Single file. Inline <style> + <script>. No frameworks.\n\n' +
      'Call write_file ONCE. Then stop.',
    projectId,
    userId: 'iter-probe',
  },
  {
    workspace: ws,
    sandbox,
    emit: (e) => {
      if (e.type === 'iteration') process.stdout.write(`\n[p1 iter ${e.index}] `);
      if (e.type === 'tool.call') {
        toolCalls1.push(e.name);
        process.stdout.write(`${e.name} `);
      }
      if (e.type === 'tool.result' && e.isError) process.stdout.write('ERR ');
    },
    log: () => {},
  },
  {
    config: { apiKey: anthropicKey, maxIterations: 5, perCallMaxTokens: 12_000 },
    budget: { maxIterations: 5, maxInputTokens: 200_000, maxOutputTokens: 80_000 },
    reviewers: false,
  },
);

console.log('\n');
const v1 = ws.files.get('index.html');
if (!v1) {
  console.error('[iter] FAIL — pass 1 did not produce index.html');
  await sandbox.disposeAll();
  process.exit(1);
}
console.log(`[iter] v1: ${v1.length} bytes, tools: [${toolCalls1.join(', ')}]`);
await writeFile(join(OUT_DIR, 'v1.html'), v1, 'utf-8');

// =========================================================================
// PASS 2 — iteration. The agent must read THE EXISTING FILE then edit it.
// =========================================================================
console.log('[iter] PASS 2 — "make the streaks gold"');

const toolCalls2 = [];
let editedSomething = false;

await agentLoop(
  {
    prompt:
      'The user wants the streak count to be styled in gold. ' +
      'Use `read_file` to read `index.html` first, then `edit_file` to change ONLY the CSS for the `.streak` class so it has color #FFD700 (or `gold`). ' +
      'Do NOT rewrite the whole file. Make the smallest possible edit. Then stop.',
    projectId,
    userId: 'iter-probe',
  },
  {
    workspace: ws,
    sandbox,
    emit: (e) => {
      if (e.type === 'iteration') process.stdout.write(`\n[p2 iter ${e.index}] `);
      if (e.type === 'tool.call') {
        toolCalls2.push(e.name);
        if (e.name === 'edit_file' || e.name === 'write_file') editedSomething = true;
        process.stdout.write(`${e.name} `);
      }
      if (e.type === 'tool.result' && e.isError) process.stdout.write('ERR ');
    },
    log: () => {},
  },
  {
    config: { apiKey: anthropicKey, maxIterations: 6, perCallMaxTokens: 12_000 },
    budget: { maxIterations: 6, maxInputTokens: 200_000, maxOutputTokens: 80_000 },
    reviewers: false,
  },
);

console.log('\n');
const v2 = ws.files.get('index.html');
if (!v2) {
  console.error('[iter] FAIL — pass 2 lost the file');
  await sandbox.disposeAll();
  process.exit(1);
}
console.log(`[iter] v2: ${v2.length} bytes, tools: [${toolCalls2.join(', ')}]`);
await writeFile(join(OUT_DIR, 'v2.html'), v2, 'utf-8');

// =========================================================================
// VERIFY ITERATION SEMANTICS
// =========================================================================
const checks = {
  agentReadFirst: toolCalls2[0] === 'read_file',
  agentEdited: editedSomething,
  notARewrite: Math.abs(v2.length - v1.length) < 3000, // edit, not regen
  hasGoldColor: /#FFD700|#ffd700|gold(?!enrod)/.test(v2) && !/#FFD700|#ffd700|gold(?!enrod)/.test(v1),
  streakClassPresent: /\.streak\b/.test(v2),
};

console.log('\n[iter] verification:');
for (const [k, v] of Object.entries(checks)) {
  console.log(`  ${v ? '✓' : '✗'} ${k}: ${v}`);
}
const allPassed = Object.values(checks).every(Boolean);

await writeFile(
  join(OUT_DIR, 'results.json'),
  JSON.stringify({
    durationSec: Math.round((Date.now() - t0) / 1000),
    pass1: { sizeBytes: v1.length, tools: toolCalls1 },
    pass2: { sizeBytes: v2.length, tools: toolCalls2 },
    checks,
    allPassed,
  }, null, 2),
  'utf-8',
);

// =========================================================================
// Optional screenshot of v2 in-sandbox (skipped if iteration failed already).
// =========================================================================
if (allPassed) {
  console.log('\n[iter] step 3 — push v2 to sandbox + screenshot');
  await sandbox.runCommand(projectId, 'mkdir -p /home/user/project', { timeoutMs: 5_000 });
  await sandbox.writeFile(projectId, 'index.html', v2);
  await sandbox.runCommand(
    projectId,
    'cd /home/user/project && python3 -m http.server 8081',
    { background: true, timeoutMs: 600_000 },
  );
  await new Promise((r) => setTimeout(r, 2500));

  const probe = await sandbox.runCommand(
    projectId,
    'curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/',
    { timeoutMs: 8_000 },
  );
  if (probe.stdout.trim() === '200') {
    const url = await sandbox.getPublicUrl(projectId);
    console.log(`[iter]   url: ${url}`);
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    try { await page.goto(url, { timeout: 30_000, waitUntil: 'networkidle' }); } catch { /* ignore */ }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT_DIR, '01-after-iterate.png'), fullPage: true });
    console.log('[iter]   01-after-iterate.png');
    await browser.close();
  } else {
    console.warn('[iter]   server failed to start — skipping screenshot');
  }
}

// =========================================================================
// Teardown
// =========================================================================
await sandbox.disposeAll();
console.log(`\n[iter] DONE in ${Math.round((Date.now() - t0) / 1000)}s — ${allPassed ? 'PASS' : 'FAIL'}`);
process.exit(allPassed ? 0 : 1);
