/**
 * Phase 11 — full end-to-end run with screenshots.
 *
 * Plan:
 *   1. Boot a real E2B sandbox.
 *   2. Run the agent loop (real Claude). Ask the agent to write a single
 *      self-contained habit-tracker `index.html` to the IN-MEMORY workspace
 *      via `write_file`. (No reviewer subagents — they expect a React Native
 *      workspace; this is plain HTML.)
 *   3. After the agent finishes, push the produced `index.html` from the
 *      workspace into the sandbox via `sandbox-client.writeFile()`.
 *   4. Start a tiny http server inside the sandbox.
 *   5. Get the public URL via `sandbox.getPublicUrl()`.
 *   6. Drive Playwright against that URL to capture:
 *      01-first-launch.png    — empty state on cold load
 *      02-after-tap.png       — first habit clicked
 *      03-after-reload.png    — page reloaded; localStorage persisted
 *      04-add-flow.png        — Add-habit form opened
 *   7. Tear down the sandbox.
 *
 * Cost: ~$0.30 LLM + a few cents of E2B compute.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { agentLoop } from '../packages/app/dist/zionx/app-development/agent/index.js';
import { E2BSandboxClient } from '../packages/app/dist/zionx/app-development/services/sandbox-client.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const OUT_DIR = join(process.cwd(), 'scripts', 'harness-e2e-output');
await mkdir(OUT_DIR, { recursive: true });

const sm = new SecretsManagerClient({ region: 'us-east-1' });
async function getKey(id) {
  const r = await sm.send(new GetSecretValueCommand({ SecretId: id }));
  try { return JSON.parse(r.SecretString).apiKey ?? r.SecretString; } catch { return r.SecretString; }
}

class MemoryWorkspace {
  files = new Map();
  async readFile(_p, path) { const v = this.files.get(path); if (v === undefined) throw new Error(`ENOENT ${path}`); return v; }
  async writeFile(_p, path, content) { this.files.set(path, content); }
  async listFiles(_p) { return [...this.files.keys()].sort(); }
  async exists(_p, path) { return this.files.has(path); }
  async delete(_p, path) { this.files.delete(path); }
}

const anthropicKey = await getKey('seraphim/anthropic');
const e2bKey = await getKey('seraphim/e2b');
console.log(`[e2e] anthropic=${anthropicKey.slice(0, 4)}...${anthropicKey.slice(-4)}`);
console.log(`[e2e] e2b=${e2bKey.slice(0, 4)}...${e2bKey.slice(-4)}`);

const sandbox = new E2BSandboxClient({ getApiKey: async () => e2bKey });
const ws = new MemoryWorkspace();
const projectId = 'e2e-habit-' + Date.now().toString(36);

console.log(`[e2e] project: ${projectId}\n`);

const t0 = Date.now();

// ---------- step 1: agent generation ----------
console.log('[e2e] step 1 — agent loop (write index.html to workspace)');

await agentLoop(
  {
    prompt:
      'TASK: write ONE file at path `index.html` using the `write_file` tool. ' +
      'Do NOT use load_skill, list_files, or run_command — just call write_file ONCE.\n\n' +
      'The content is a complete self-contained habit tracker as plain HTML + inline CSS + inline vanilla JS:\n' +
      '1. Three seeded habits in localStorage key "habits-v1": ' +
      '{"id":"water","name":"Drink water","emoji":"💧","streak":3,"doneToday":false}, ' +
      '{"id":"walk","name":"Walk 10k steps","emoji":"👟","streak":7,"doneToday":false}, ' +
      '{"id":"read","name":"Read 20 minutes","emoji":"📚","streak":2,"doneToday":false}.\n' +
      '2. Body has a soft dark gradient background (linear-gradient #0E1424 → #1B2138). White text. Periwinkle accent #7C83FF.\n' +
      '3. Each habit is a rounded card (radius 16px, padding 16px, semi-transparent surface) with the emoji on the left, name + 🔥 streak count on the right.\n' +
      '4. Click a card → toggles `doneToday` on that habit, adds a green check ✓ overlay, increments the streak. Persist immediately to localStorage.\n' +
      '5. A "+ Add habit" button at the bottom (id="add-btn") opens an inline form (no modal) with a name input + emoji input + save button.\n' +
      '6. Subtle motion: cards fade-up on first paint (CSS @keyframes), tap scales them slightly.\n' +
      '7. No frameworks. No external assets. Single file. Inline <style> + inline <script>.\n\n' +
      'Call write_file ONCE with the full content. Then stop. No further tool calls.',
    projectId,
    userId: 'e2e',
  },
  {
    workspace: ws,
    sandbox,
    emit: (e) => {
      if (e.type === 'iteration') process.stdout.write(`\n[iter ${e.index}] `);
      if (e.type === 'tool.call') process.stdout.write(`${e.name} `);
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

const indexHtml = ws.files.get('index.html');
if (!indexHtml) {
  console.error('[e2e] FAIL — agent did not produce index.html');
  await sandbox.disposeAll();
  process.exit(1);
}
console.log(`[e2e] index.html written (${indexHtml.length} bytes)`);

// ---------- step 2: push file to sandbox ----------
console.log('[e2e] step 2 — push index.html to sandbox');
await sandbox.runCommand(projectId, 'mkdir -p /home/user/project', { timeoutMs: 5_000 });
await sandbox.writeFile(projectId, 'index.html', indexHtml);

// ---------- step 3: start http server ----------
console.log('[e2e] step 3 — start http server inside sandbox (background)');
await sandbox.runCommand(projectId,
  'cd /home/user/project && python3 -m http.server 8081',
  { background: true, timeoutMs: 600_000 });
await new Promise((r) => setTimeout(r, 2500));

// Confirm it's serving.
const probe = await sandbox.runCommand(projectId,
  'curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/',
  { timeoutMs: 8_000 });
console.log(`[e2e] curl exit=${probe.exitCode} stdout="${probe.stdout.trim()}"`);

if (probe.stdout.trim() !== '200') {
  const logs = await sandbox.runCommand(projectId, 'cat /tmp/server.log', { timeoutMs: 3_000 });
  console.error(`[e2e] server didn't start. logs:\n${logs.stdout}\n${logs.stderr}`);
  await sandbox.disposeAll();
  process.exit(1);
}

// ---------- step 4: get public url ----------
const publicUrl = await sandbox.getPublicUrl(projectId);
console.log(`[e2e] public url: ${publicUrl}`);

// ---------- step 5: playwright ----------
console.log('\n[e2e] step 5 — Playwright screenshots');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// 5a — first-launch
try {
  await page.goto(publicUrl, { timeout: 30_000, waitUntil: 'networkidle' });
} catch (err) {
  console.warn(`[e2e] page.goto: ${err.message}`);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT_DIR, '01-first-launch.png'), fullPage: true });
console.log('[e2e]   01-first-launch.png');

// Save the page source for inspection.
const html = await page.content();
await writeFile(join(OUT_DIR, 'page-source.html'), html, 'utf-8');
await writeFile(join(OUT_DIR, 'index-as-served.html'), indexHtml, 'utf-8');

// 5b — tap first habit (try several common selectors)
const tapped = await page.evaluate(() => {
  const candidates = [
    document.querySelector('[data-habit]'),
    document.querySelector('.habit-card'),
    document.querySelector('.habit'),
    document.querySelector('button.card'),
    document.querySelector('[role="button"]'),
    document.querySelector('li button'),
    ...document.querySelectorAll('button'),
  ].filter(Boolean);
  const target = candidates[0];
  if (!target) return false;
  target.click();
  return true;
});
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT_DIR, '02-after-tap.png'), fullPage: true });
console.log(`[e2e]   02-after-tap.png (tap dispatched: ${tapped})`);

// 5c — reload and prove persistence
await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT_DIR, '03-after-reload.png'), fullPage: true });
console.log('[e2e]   03-after-reload.png');

const ls = await page.evaluate(() => {
  const out = {};
  for (const k of Object.keys(localStorage)) out[k] = localStorage.getItem(k);
  return out;
});
await writeFile(join(OUT_DIR, 'localStorage.json'), JSON.stringify(ls, null, 2), 'utf-8');
console.log(`[e2e]   localStorage keys: [${Object.keys(ls).join(', ') || '(none)'}]`);

// 5d — open Add-habit form
const opened = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
  const add = buttons.find((b) => /add/i.test(b.textContent ?? ''));
  if (!add) return false;
  add.click();
  return true;
});
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT_DIR, '04-add-flow.png'), fullPage: true });
console.log(`[e2e]   04-add-flow.png (add button found: ${opened})`);

await browser.close();

// ---------- step 6: dispose ----------
console.log('\n[e2e] step 6 — dispose sandbox');
await sandbox.disposeAll();

console.log(`\n[e2e] DONE in ${Math.round((Date.now() - t0) / 1000)}s`);
console.log(`[e2e] screenshots in ${OUT_DIR}`);
process.exit(0);
