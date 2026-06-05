/**
 * Full-stack probe — agent loop + real Claude + real E2B sandbox.
 *
 * The agent now has a working `run_command` tool. We ask it to write a tiny
 * file inside the sandbox, run `node` on it, and report what came out.
 * Confirms the entire harness pipeline works against real infrastructure.
 *
 * Cost: ~$0.05 LLM + ~1 minute of E2B compute (fractions of a cent).
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { agentLoop } from '../packages/app/dist/zionx/app-development/agent/index.js';
import { E2BSandboxClient } from '../packages/app/dist/zionx/app-development/services/sandbox-client.js';

const sm = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecretApiKey(id) {
  const r = await sm.send(new GetSecretValueCommand({ SecretId: id }));
  const raw = r.SecretString ?? '';
  try { return JSON.parse(raw).apiKey ?? raw; } catch { return raw; }
}

class MemoryWorkspace {
  files = new Map();
  async readFile(_p, path) { const v = this.files.get(path); if (v === undefined) throw new Error(`ENOENT ${path}`); return v; }
  async writeFile(_p, path, content) { this.files.set(path, content); }
  async listFiles(_p) { return [...this.files.keys()].sort(); }
  async exists(_p, path) { return this.files.has(path); }
  async delete(_p, path) { this.files.delete(path); }
}

const anthropicKey = await getSecretApiKey('seraphim/anthropic');
const e2bKey = await getSecretApiKey('seraphim/e2b');

console.log(`[probe] anthropic key: ${anthropicKey.slice(0, 4)}...${anthropicKey.slice(-4)}`);
console.log(`[probe] e2b key: ${e2bKey.slice(0, 4)}...${e2bKey.slice(-4)}`);

const sandbox = new E2BSandboxClient({ getApiKey: async () => e2bKey });
const ws = new MemoryWorkspace();

const start = Date.now();

console.log('[probe] starting agent loop with REAL sandbox attached…');

const events = [];
const result = await agentLoop(
  {
    prompt:
      'Use run_command to execute the shell command `node -e "console.log(2 + 2)"` ' +
      'inside the sandbox. Report what stdout came back. ' +
      'Then use run_command to execute `node --version`. Report that too. ' +
      'Then stop — no more tool calls.',
    projectId: 'probe-sbx-1',
    userId: 'probe',
  },
  {
    workspace: ws,
    sandbox,
    emit: (e) => {
      events.push(e);
      if (e.type === 'iteration') console.log(`\n[iter ${e.index}]`);
      if (e.type === 'tool.call') console.log(`  [tool] ${e.name} — ${e.summary}`);
      if (e.type === 'tool.result') console.log(`  [done] ${e.name} ${e.isError ? 'ERROR' : 'ok'} (${e.durationMs}ms)`);
      if (e.type === 'text' && e.text) process.stdout.write(e.text);
      if (e.type === 'done') console.log(`\n[agent done] ${e.reason}`);
    },
    log: () => {},
  },
  {
    config: { apiKey: anthropicKey, maxIterations: 8, perCallMaxTokens: 1500 },
    budget: { maxIterations: 8, maxInputTokens: 200_000, maxOutputTokens: 30_000 },
    reviewers: false,
  },
);

console.log('\n[probe] === Result ===');
console.log({
  passed: result.passed,
  reason: result.reason,
  iterations: result.iterations,
  tokens: result.tokens,
  totalMs: Date.now() - start,
});

console.log('\n[probe] disposing sandbox…');
await sandbox.disposeAll();

const sawRunCommand = events.some((e) => e.type === 'tool.call' && e.name === 'run_command');
const sawSuccessfulRun = events.some((e) => e.type === 'tool.result' && e.name === 'run_command' && !e.isError);

console.log(`[probe] saw run_command call: ${sawRunCommand}`);
console.log(`[probe] saw successful run_command result: ${sawSuccessfulRun}`);
process.exit(sawRunCommand && sawSuccessfulRun ? 0 : 1);
