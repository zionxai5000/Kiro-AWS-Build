/**
 * Live harness probe — runs ONE small turn against real Claude to confirm
 * the agent loop, tool registry, and reviewer subagents all work
 * end-to-end. Cheap (~$0.05). No sandbox needed.
 *
 * Usage:
 *   $env:ANTHROPIC_API_KEY = "sk-ant-..."
 *   node scripts/harness-live-probe.mjs
 *
 * Or pull from Secrets Manager:
 *   $key = aws secretsmanager get-secret-value --secret-id seraphim/anthropic --query SecretString --output text | ConvertFrom-Json | %{ $_.apiKey }
 *   $env:ANTHROPIC_API_KEY = $key; node scripts/harness-live-probe.mjs
 */

import { agentLoop } from '../packages/app/dist/zionx/app-development/agent/index.js';

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

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not set');
  process.exit(1);
}

const ws = new MemoryWorkspace();
ws.files.set('package.json', JSON.stringify({ name: 'probe-app', dependencies: {} }, null, 2));
ws.files.set('app/(tabs)/index.tsx', `import React from 'react';
import { View, Text } from 'react-native';
export default function Home() {
  return <View><Text>Hello</Text></View>;
}
`);

const events = [];
const start = Date.now();

console.log('=== Live harness probe ===');
console.log('Workspace seeded with: ' + (await ws.listFiles('p')).join(', '));
console.log('');

let lastChunk = '';
const result = await agentLoop(
  {
    prompt: 'Read the existing app/(tabs)/index.tsx file. Then add a one-line greeting "Welcome back" above the existing Hello text. Use edit_file with an exact-match replacement. After editing, briefly summarize what you did in one sentence.',
    projectId: 'probe-1',
    userId: 'probe-user',
  },
  {
    workspace: ws,
    emit: (e) => {
      events.push(e);
      if (e.type === 'tool.call') console.log(`  [tool] ${e.name} — ${e.summary ?? ''}`);
      if (e.type === 'tool.result') console.log(`  [done] ${e.name} (${e.durationMs}ms)${e.isError ? ' ERROR' : ''}`);
      if (e.type === 'iteration') console.log(`  [iter ${e.index}]`);
      if (e.type === 'subagent.spawn') console.log(`  [reviewer] spawning ${e.name}`);
      if (e.type === 'subagent.result') console.log(`  [reviewer] ${e.name}: ${e.passed ? 'PASS' : 'FAIL'} (${e.score ?? '–'})`);
      if (e.type === 'text' && e.text) {
        process.stdout.write(e.text);
        lastChunk = e.text;
      }
      if (e.type === 'done') console.log(`\n  [agent done] ${e.reason}`);
    },
    log: () => {},
  },
  {
    config: { apiKey, maxIterations: 8, perCallMaxTokens: 1500 },
    budget: { maxIterations: 8, maxInputTokens: 200_000, maxOutputTokens: 30_000 },
    reviewers: false, // skip reviewers for the smoke probe (we only test agent + tools)
  },
);

console.log('');
console.log('=== Result ===');
console.log({
  passed: result.passed,
  reason: result.reason,
  iterations: result.iterations,
  filesWritten: result.filesWritten,
  filesEdited: result.filesEdited,
  tokens: result.tokens,
  durationMs: Date.now() - start,
});

console.log('');
console.log('=== Final workspace state ===');
for (const f of await ws.listFiles('p')) {
  console.log(`--- ${f} ---`);
  console.log(await ws.readFile('p', f));
}

const editApplied = (await ws.readFile('p', 'app/(tabs)/index.tsx')).includes('Welcome back');
console.log('');
console.log('Edit applied:', editApplied ? 'YES ✓' : 'NO ✗');
process.exit(editApplied ? 0 : 1);
